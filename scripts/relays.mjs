#!/usr/bin/env node
/**
 * Build the relay directory.
 *
 *   npm run relays
 *
 * Presence and chat talked to three hardcoded relays. That is why the geohash
 * channels looked quieter than they are: a message posted in Rio reaches the
 * relays *near Rio*, and three servers picked once, months ago, are not those.
 * bitchat ships a directory and selects from it by distance, which is most of
 * why their rooms have people in them and ours looked empty.
 *
 * Source is permissionlesstech/georelays — 411 Nostr relays with estimated
 * coordinates, MIT licensed, from the same people who wrote bitchat. MIT is
 * worth saying out loud after Meshtastic, WSJT-X, Element, Cinny and Nheko all
 * turned out to be GPL or AGPL walls: this one we can simply use.
 *
 * Committed rather than fetched at runtime, like every other dataset here.
 *
 * ## The second source: NIP-66
 *
 * georelays is a snapshot. It says where a relay was, not whether it answers
 * today, and it says nothing about whether the relay wants money or an account.
 * The `--nip66` pass adds both.
 *
 * NIP-66 is relay discovery over Nostr itself: monitors publish kind 30166,
 * one per relay they probe, carrying the relay URL in `d`, its location in `g`
 * as a geohash, what it demands in `R` — `payment`, `auth` — and its whole NIP-11
 * document in the content. This is what nostr.watch publishes now; its old REST
 * API at api.nostr.watch returns 502 on every endpoint and is not coming back.
 *
 * Thirty monitors publish it, which is the useful part: no single one of them
 * has to be trusted.
 *
 * ### And they are still not trusted
 *
 * Every candidate is dialled here before it is written down. That is not
 * belt-and-braces, it is load-bearing — of 550 relays the monitors reported as
 * free and open, **37 demanded AUTH the moment we asked them anything**, and
 * another 20 were single-purpose (wallet kinds only, DM kinds only, kind 1
 * refused). A monitor's report is evidence, not a verdict.
 *
 * ### What is excluded, and why each rule exists
 *
 *   **Anything with a URL path.** Not tidiness. `wss://…/inbox` is somebody's
 *   personal relay, and three of the candidates were `wss://nwc.primal.net/<32
 *   characters>` — Nostr Wallet Connect endpoints with what appears to be a
 *   per-user secret in the path. Shipping one of those in a public data file
 *   would be handing out someone's wallet connection. Bare hosts only.
 *
 *   **Non-relays.** The monitors probe what they are told to probe. One
 *   candidate was `wss://push.services.mozilla.com`.
 *
 *   **Relays that want money or an account.** The app has no accounts and never
 *   signs in, so an AUTH relay is as unusable to us as a paid one.
 *
 *   **43.653, -79.383.** Toronto's city centre to three decimals, and the single
 *   most common coordinate in *both* sources — 33% of the NIP-66 candidates and
 *   29% of what georelays gave us. That is not a city, it is what a geolocation
 *   database says when it does not know, and this file exists to answer "which
 *   relays are near this place". An entry that cannot answer that is noise in
 *   the one question being asked. Left in the existing rows, which predate this
 *   rule, rather than deleting data that already shipped.
 *
 * ## The third pass: which relays are busy
 *
 * The `--nip66` build also listens to every relay in the directory for
 * LISTEN_SEC and counts the distinct people heard on each (presence and chat,
 * the kinds the app reads). The busiest are written as `busiest`, in order.
 * The web reads those instead of the geographic spread (presence-nostr.js,
 * `setSpread`): measured from Lisbon and New York on 17 October 2026, the
 * 8 near relays plus the 12 busiest heard 98% of the people that the near set
 * plus the full spread (68 sockets) heard, and the busiest were the same 12 in
 * the same order from both cities. Fewer than half of the 68 delivered anything
 * in five minutes.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "data", "relays.json");
const SRC = "https://raw.githubusercontent.com/permissionlesstech/georelays/main/nostr_relays.csv";
const UA = "AuralFM/0.1 (+https://auralfm.xyz; hello@auralfm.xyz)";

/** Only reached with --nip66, so the plain build stays a one-second fetch. */
const WITH_NIP66 = process.argv.includes("--nip66");
/** How long the busy pass listens, and how many relays it ranks. */
const LISTEN_SEC = 180;
const BUSIEST = 24;
const PEOPLE_KINDS = [20000, 20001];

const res = await fetch(SRC, { headers: { "user-agent": UA } });
if (!res.ok) throw new Error(`georelays: HTTP ${res.status}`);
const csv = await res.text();

const rows = [];
const seen = new Set();
for (const line of csv.split(/\r?\n/).slice(1)) {
  const [host, lat, lon] = line.split(",");
  if (!host) continue;
  const la = parseFloat(lat), lo = parseFloat(lon);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) continue;

  // The CSV carries bare hosts; we need a URL. Anything already carrying a
  // scheme keeps it, and a port implies plain ws rather than wss.
  // :443 is the default for wss, so `host` and `host:443` are the same server.
  // Left in, they cost two sockets and two copies of every event.
  const bare = host.trim().replace(/^wss?:\/\//, "").replace(/\/+$/, "").replace(/:443$/, "");
  if (!bare || bare.includes(" ")) continue;
  // Skip anything that is not a plausible hostname — a few rows are junk.
  if (!/^[a-z0-9.-]+(:\d+)?$/i.test(bare)) continue;
  if (seen.has(bare)) continue;
  seen.add(bare);

  rows.push([`wss://${bare}`, +la.toFixed(3), +lo.toFixed(3)]);
}

console.log(`georelays: ${rows.length} with coordinates`);

// ─────────────────────────────────────────────────────────────────────────────
// NIP-66: what is live, free and open right now
// ─────────────────────────────────────────────────────────────────────────────

/** Toronto to three decimals — see the header. Treated as "location unknown". */
const UNPLACEABLE = (lat, lon) => Math.abs(lat - 43.653) < 0.001 && Math.abs(lon + 79.383) < 0.001;
const NOT_A_RELAY = /mozilla|googleapis|amazonaws|azure|slack|discord|\.onion|\.i2p/i;
const BARE_HOST = /^wss:\/\/[a-z0-9.-]+(:\d{1,5})?\/?$/i;

/** Relays that carry monitor output. Several, so no one of them is required. */
const MONITOR_RELAYS = [
  "wss://relay.nostr.watch",
  "wss://monitorlizard.nostr1.com",
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.primal.net",
];
const DISCOVERY_KIND = 30166;
const MAX_REPORT_AGE_DAYS = 7;

/** Page backwards with `until`; every relay caps a single REQ. */
function harvest(url, into) {
  return new Promise((done) => {
    let w, until = Math.floor(Date.now() / 1000), rounds = 0, batch = 0, timer;
    const finish = () => { clearTimeout(timer); try { w?.close(); } catch {} done(); };
    const arm = () => { clearTimeout(timer); timer = setTimeout(finish, 45000); };
    try { w = new WebSocket(url); } catch { return done(); }
    arm();
    const ask = () => {
      batch = 0;
      w.send(JSON.stringify(["REQ", `h${rounds}`, { kinds: [DISCOVERY_KIND], until, limit: 500 }]));
    };
    w.onopen = ask;
    w.onmessage = (m) => {
      let d; try { d = JSON.parse(m.data); } catch { return; }
      if (d[0] === "EVENT" && d[2]) {
        into.set(d[2].id, d[2]);
        batch++;
        if (d[2].created_at < until) until = d[2].created_at;
        return;
      }
      if (d[0] === "EOSE") {
        if (++rounds >= 12 || batch < 50) return finish();
        until -= 1;
        arm();
        ask();
      }
    };
    w.onerror = finish;
    w.onclose = () => { clearTimeout(timer); done(); };
  });
}

/**
 * Ask the relay for something real and see what comes back.
 *
 * Kind 1 on purpose: it is what a location note is, so a relay that refuses it
 * cannot carry `/drop` even if it would carry presence. Excluding those is
 * deliberate — a directory entry should work for the whole feature, not part.
 */
function probe(url) {
  return new Promise((done) => {
    let w, settled = false, timer;
    const end = (ok, why) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { w?.close(); } catch {}
      done({ ok, why });
    };
    try { w = new WebSocket(url); } catch { return end(false, "bad url"); }
    timer = setTimeout(() => end(false, "timeout"), 9000);
    w.onopen = () => w.send(JSON.stringify(["REQ", "v", { kinds: [1], limit: 1 }]));
    w.onmessage = (m) => {
      let d; try { d = JSON.parse(m.data); } catch { return; }
      if (d[0] === "EOSE") return end(true, "answered");
      if (d[0] === "CLOSED") {
        const msg = String(d[2] || "").toLowerCase();
        return end(false, msg.includes("auth") ? "auth required"
                        : msg.includes("pay") ? "payment required"
                        : `refused: ${msg.slice(0, 40) || "no reason"}`);
      }
      if (d[0] === "NOTICE" && /auth|restricted|pay/i.test(String(d[1] || ""))) {
        return end(false, "restricted");
      }
    };
    w.onerror = () => end(false, "connection failed");
    w.onclose = () => end(false, "closed before answering");
  });
}

if (WITH_NIP66) {
  const { ungeohash } = createRequire(import.meta.url)("../src/presence-nostr.js");

  const events = new Map();
  await Promise.all(MONITOR_RELAYS.map((u) => harvest(u, events)));

  // Newest report wins; a relay is described by many monitors many times.
  const latest = new Map();
  for (const e of events.values()) {
    const d = (e.tags || []).find((t) => t[0] === "d")?.[1];
    if (!d) continue;
    const key = d.trim().replace(/\/+$/, "").replace(/:443$/, "").toLowerCase();
    const prev = latest.get(key);
    if (!prev || e.created_at > prev.created_at) latest.set(key, e);
  }
  console.log(`nip66: ${events.size} reports from ${MONITOR_RELAYS.length} relays, ` +
              `${latest.size} distinct relays described`);

  const now = Math.floor(Date.now() / 1000);
  const have = new Set(rows.map(([u]) => u.toLowerCase()));
  const candidates = [];

  for (const [url, e] of latest) {
    if (!BARE_HOST.test(url) || NOT_A_RELAY.test(url)) continue;
    if (have.has(url)) continue;
    if ((now - e.created_at) / 86400 > MAX_REPORT_AGE_DAYS) continue;

    const tags = e.tags || [];
    const R = tags.filter((t) => t[0] === "R").map((t) => String(t[1] || "").toLowerCase());
    const net = tags.find((t) => t[0] === "n")?.[1];
    if (net && net !== "clearnet") continue;

    let lim = {};
    try { lim = (JSON.parse(e.content || "{}") || {}).limitation || {}; } catch { /* optional */ }
    if (R.includes("payment") || lim.payment_required === true) continue;
    if (R.includes("auth") || lim.auth_required === true) continue;
    if (lim.restricted_writes === true) continue;

    // The longest geohash the monitors agreed on is the most precise.
    const g = tags.filter((t) => t[0] === "g").map((t) => String(t[1] || "").toLowerCase())
      .filter((v) => /^[0-9b-hjkmnp-z]+$/.test(v))
      .sort((a, b) => b.length - a.length)[0];
    if (!g) continue;
    const c = ungeohash(g);
    if (!c) continue;
    const lat = +c.lat.toFixed(3), lon = +c.lon.toFixed(3);
    if (UNPLACEABLE(lat, lon)) continue;

    candidates.push([url, lat, lon]);
  }
  console.log(`nip66: ${candidates.length} free, open, placed and new — dialling each one`);

  const added = [];
  const refused = new Map();
  const BATCH = 40;
  for (let i = 0; i < candidates.length; i += BATCH) {
    const slice = candidates.slice(i, i + BATCH);
    const verdicts = await Promise.all(slice.map(([u]) => probe(u)));
    verdicts.forEach((v, n) => {
      if (v.ok) added.push(slice[n]);
      else refused.set(v.why, (refused.get(v.why) || 0) + 1);
    });
  }
  for (const [why, n] of [...refused].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)} did not answer: ${why}`);
  }
  console.log(`nip66: ${added.length} verified live`);
  rows.push(...added);
}

/**
 * Listen to every relay at once and count the distinct keys heard on each.
 * Ephemeral kinds are not stored, so this hears only what is said while it
 * listens: a ranking of where people are now, not a history.
 */
function listen(urls, secs) {
  const heard = new Map(urls.map((u) => [u, new Set()]));
  const sockets = [];
  for (const url of urls) {
    let w;
    try { w = new WebSocket(url); } catch { continue; }
    sockets.push(w);
    w.onopen = () => w.send(JSON.stringify(["REQ", "busy", { kinds: PEOPLE_KINDS, since: Math.floor(Date.now() / 1000) }]));
    w.onmessage = (m) => {
      let d; try { d = JSON.parse(m.data); } catch { return; }
      if (d[0] === "EVENT" && PEOPLE_KINDS.includes(d[2]?.kind) && typeof d[2].pubkey === "string") heard.get(url).add(d[2].pubkey);
    };
    w.onerror = () => {};
  }
  return new Promise((done) => setTimeout(() => {
    for (const w of sockets) { try { w.close(); } catch {} }
    done(heard);
  }, secs * 1000));
}

let busiest;
if (WITH_NIP66) {
  console.log(`busy: listening to ${rows.length} relays for ${LISTEN_SEC} s`);
  const heard = await listen(rows.map(([u]) => u), LISTEN_SEC);
  const ranked = [...heard].map(([u, k]) => [u, k.size]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  busiest = ranked.slice(0, BUSIEST).map(([u]) => u);
  const people = new Set([...heard.values()].flatMap((k) => [...k])).size;
  console.log(`busy: ${ranked.length} relays carried anyone; ${people} people heard; top: ` +
              ranked.slice(0, 5).map(([u, n]) => `${u.replace("wss://", "")} ${n}`).join(", "));
} else {
  // The plain build keeps the last measured ranking, minus relays it dropped.
  const have = new Set(rows.map(([u]) => u));
  try { busiest = (JSON.parse(fs.readFileSync(OUT, "utf8")).busiest || []).filter((u) => have.has(u)); } catch { busiest = []; }
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({
  built: new Date().toISOString().slice(0, 10),
  source: WITH_NIP66
    ? "permissionlesstech/georelays (MIT) + NIP-66 kind 30166, each dialled to confirm it answers"
    : "permissionlesstech/georelays (MIT)",
  relays: rows,
  busiest,
}));
console.log(`relays: ${rows.length} with coordinates -> data/relays.json ` +
            `(${(fs.statSync(OUT).size / 1024).toFixed(0)} kB)`);
