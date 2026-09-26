#!/usr/bin/env node
/**
 * What each station says about itself.
 *
 *   node scripts/enrich.mjs               resume (or start): every station not yet asked
 *   node scripts/enrich.mjs --limit 50    a sample
 *   node scripts/enrich.mjs --report      what is known so far, no network
 *   node scripts/enrich.mjs --again       ask again the ones older than --days (default 30)
 *
 * Two questions per station, both put to the station itself:
 *
 *   its stream   one connection, headers only, then hang up before the audio.
 *                Internet radio servers announce themselves there: icy-name,
 *                icy-genre, icy-url, icy-description, icy-br. The answer also
 *                says whether the station is on the air right now.
 *   its website  one page, the homepage, when robots.txt allows it: the title,
 *                the description, the image it chose to be shared with, the
 *                language, and its links out — Facebook, Instagram, X, YouTube,
 *                TikTok, SoundCloud, Mixcloud, Telegram, WhatsApp, Bluesky,
 *                Mastodon, Nostr — and any Lightning address it publishes.
 *
 *   its claim   /.well-known/auralfm.json on the station's own website, if it
 *               has put one there: a station claiming its page. Only whoever
 *               runs the website can publish that file, so what it says (a
 *               Lightning address for tips, a Nostr key, its own description) is
 *               the station speaking. See docs.auralfm.xyz/stations/.
 *
 * Nothing about listeners is involved: this is a directory reading the public
 * pages of the stations it lists, once, politely (AuralFM's name in the
 * User-Agent, robots.txt respected, one request at a time per host).
 *
 * Old Shoutcast servers answer "ICY 200 OK" instead of HTTP, which fetch()
 * refuses outright, so the stream question is asked over a plain socket and the
 * reply read by hand. Answers are appended to data/_enrich.jsonl as they come.
 */
import fs from "node:fs";
import net from "node:net";
import tls from "node:tls";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const F = {
  full: path.join(ROOT, "data/stations.json"),
  streams: path.join(ROOT, "data/_streams.jsonl"),
  dump: path.join(ROOT, "data/_radiobrowser.json"),
  out: path.join(ROOT, "data/_enrich.jsonl"),
};
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : d; };
const CFG = { limit: opt("limit", Infinity), concurrency: opt("concurrency", 24), days: opt("days", 30), again: argv.includes("--again") };
const UA = "AuralFM-directory/0.2 (+https://docs.auralfm.xyz; hello@auralfm.xyz)";

// ── what is known ───────────────────────────────────────────────────────────
const known = new Map();
if (fs.existsSync(F.out)) for (const line of fs.readFileSync(F.out, "utf8").split("\n")) {
  if (!line) continue;
  try { const r = JSON.parse(line); known.set(r.id, r); } catch { /* half a line */ }
}

if (argv.includes("--report")) {
  const all = [...known.values()], n = (f) => all.filter(f).length, pct = (k) => `${(100 * k / (all.length || 1)).toFixed(0)}%`;
  const nets = {};
  for (const r of all) for (const k of Object.keys(r.site?.social || {})) nets[k] = (nets[k] || 0) + 1;
  console.log(`${all.length} stations asked`);
  console.log(`  stream on air      ${n((r) => r.stream?.ok)} (${pct(n((r) => r.stream?.ok))})`);
  console.log(`  says its genre     ${n((r) => r.stream?.genre)}   its website ${n((r) => r.stream?.url)}   describes itself ${n((r) => r.stream?.description)}`);
  console.log(`  website read       ${n((r) => r.site?.ok)}   robots said no ${n((r) => r.site?.why === "robots")}`);
  console.log(`  with a description ${n((r) => r.site?.description)}   an image ${n((r) => r.site?.image)}   a language ${n((r) => r.site?.lang)}`);
  console.log(`  with socials       ${n((r) => r.site?.social && Object.keys(r.site.social).length)}: ` +
    Object.entries(nets).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(" · "));
  console.log(`  a Lightning address ${n((r) => r.site?.lightning)}   a Nostr key ${n((r) => r.site?.social?.nostr)}   ` +
    `claimed their page ${n((r) => r.site?.claim)}`);
  process.exit(0);
}

// ── who to ask ──────────────────────────────────────────────────────────────
const { channels } = JSON.parse(fs.readFileSync(F.full, "utf8"));
const streams = new Map();
if (fs.existsSync(F.streams)) for (const line of fs.readFileSync(F.streams, "utf8").split("\n")) {
  try { const r = JSON.parse(line); if (r.url) streams.set(r.id, r.url); } catch { /* partial */ }
}
const rbHome = new Map();
if (fs.existsSync(F.dump)) for (const s of JSON.parse(fs.readFileSync(F.dump, "utf8"))) if (s.home) rbHome.set(s.uuid, s.home);

const stale = (r) => CFG.again && (Date.now() - Date.parse(r.at)) / 864e5 > CFG.days;
const todo = channels.filter((c) => !known.has(c.id) || stale(known.get(c.id)))
  .map((c) => ({ id: c.id, stream: c.url || streams.get(c.id) || "", site: c.website || rbHome.get(c.rbuuid) || "" }))
  .slice(0, CFG.limit);
console.log(`enrich: ${known.size} known, ${todo.length} to ask, ${CFG.concurrency} at a time`);

// ── one request per host at a time ──────────────────────────────────────────
const busy = new Map();
async function politely(host, fn) {
  while (busy.get(host)) await busy.get(host).catch(() => {});
  const p = (async () => { try { return await fn(); } finally { await new Promise((r) => setTimeout(r, 250)); } })();
  busy.set(host, p);
  try { return await p; } finally { if (busy.get(host) === p) busy.delete(host); }
}

// ── the stream: headers only, over a socket ─────────────────────────────────
function streamHeaders(url, hops = 0) {
  return new Promise((resolve) => {
    let u; try { u = new URL(url); } catch { return resolve({ ok: false, why: "bad url" }); }
    const secure = u.protocol === "https:";
    const port = Number(u.port) || (secure ? 443 : 80);
    const done = (r) => { clearTimeout(timer); sock.destroy(); resolve(r); };
    const opts = { host: u.hostname, port, servername: u.hostname, rejectUnauthorized: false };
    const sock = secure ? tls.connect(opts) : net.connect(opts);
    const timer = setTimeout(() => done({ ok: false, why: "timeout" }), 10000);
    let buf = Buffer.alloc(0);
    sock.on("connect", () => !secure && send());
    sock.on("secureConnect", send);
    function send() {
      sock.write(`GET ${u.pathname || "/"}${u.search} HTTP/1.0\r\nHost: ${u.host}\r\nUser-Agent: ${UA}\r\n` +
        `Icy-MetaData: 1\r\nAccept: */*\r\nConnection: close\r\n\r\n`);
    }
    sock.on("data", (d) => {
      buf = Buffer.concat([buf, d]);
      const end = buf.indexOf("\r\n\r\n");
      if (end < 0 && buf.length < 16384) return;
      const lines = buf.slice(0, end < 0 ? buf.length : end).toString("latin1").split("\r\n");
      const status = Number((/^(?:HTTP\/[\d.]+|ICY)\s+(\d{3})/i.exec(lines[0]) || [])[1] || 0);
      const h = {};
      for (const l of lines.slice(1)) { const i = l.indexOf(":"); if (i > 0) h[l.slice(0, i).trim().toLowerCase()] = l.slice(i + 1).trim(); }
      if (status >= 300 && status < 400 && h.location && hops < 4) {
        clearTimeout(timer); sock.destroy();
        return resolve(streamHeaders(new URL(h.location, url).href, hops + 1));
      }
      const txt = (k) => (h[k] && h[k] !== "-" && !/^(unspecified|default|n\/a|none|various|misc|no name|unnamed|stream|radio|my radio)$/i.test(h[k]) ? h[k].slice(0, 300) : undefined);
      done({
        ok: status === 200, status, name: txt("icy-name"), genre: txt("icy-genre"), url: txt("icy-url"),
        description: txt("icy-description"), br: Number(h["icy-br"]) || undefined, type: h["content-type"],
      });
    });
    sock.on("error", (e) => done({ ok: false, why: e.code || "error" }));
  });
}

// ── the website: robots.txt, then the homepage ──────────────────────────────
// Social networks and link hubs are not a station's own website: reading them
// is reading someone else's pages, and they turn directories away anyway.
const NOT_A_SITE = /(^|\.)(facebook\.com|fb\.com|instagram\.com|twitter\.com|x\.com|youtube\.com|tiktok\.com|linktr\.ee|zeno\.fm|radio\.garden|tunein\.com|google\.com|sites\.google\.com|wixsite\.com|blogspot\.com|mixcloud\.com|soundcloud\.com)$/i;
const robots = new Map();
async function allowed(u) {
  const origin = u.origin;
  if (!robots.has(origin)) robots.set(origin, (async () => {
    try {
      const r = await fetch(`${origin}/robots.txt`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000) });
      if (!r.ok) return [];
      const rules = [], lines = (await r.text()).split(/\r?\n/);
      let applies = false;
      for (const raw of lines) {
        const l = raw.replace(/#.*/, "").trim(); if (!l) continue;
        const [k, ...v] = l.split(":"); const val = v.join(":").trim(), key = k.trim().toLowerCase();
        if (key === "user-agent") applies = val === "*" || /auralfm/i.test(val);
        else if (key === "disallow" && applies && val) rules.push(val);
      }
      return rules;
    } catch { return []; }
  })());
  const rules = await robots.get(origin);
  return !rules.some((r) => (u.pathname || "/").startsWith(r));
}

const SOCIAL = [
  ["facebook", /https?:\/\/(?:www\.|m\.)?facebook\.com\/(?!sharer|share|plugins|dialog|tr\b|login)[\w.\-/%]+/i],
  ["instagram", /https?:\/\/(?:www\.)?instagram\.com\/(?!p\/|explore|accounts)[\w.\-]+/i],
  ["x", /https?:\/\/(?:www\.)?(?:twitter|x)\.com\/(?!share|intent|home|search)[\w]+/i],
  ["youtube", /https?:\/\/(?:www\.)?youtube\.com\/(?:@[\w.\-]+|channel\/[\w\-]+|c\/[\w.\-]+|user\/[\w.\-]+)/i],
  ["tiktok", /https?:\/\/(?:www\.)?tiktok\.com\/@[\w.\-]+/i],
  ["soundcloud", /https?:\/\/(?:www\.)?soundcloud\.com\/[\w\-]+/i],
  ["mixcloud", /https?:\/\/(?:www\.)?mixcloud\.com\/[\w\-]+/i],
  ["telegram", /https?:\/\/(?:t\.me|telegram\.me)\/[\w]+/i],
  ["whatsapp", /https?:\/\/(?:wa\.me|api\.whatsapp\.com\/send)[^\s"'<>]*/i],
  ["bluesky", /https?:\/\/bsky\.app\/profile\/[\w.:\-]+/i],
  ["spotify", /https?:\/\/open\.spotify\.com\/(?:show|user|artist|playlist)\/[\w]+/i],
  ["nostr", /\bnpub1[02-9ac-hj-np-z]{58}\b/],
];

function readPage(html, base) {
  const head = html.slice(0, 200000);
  const meta = (re) => { const m = re.exec(head); return m ? decode(m[1]).trim().slice(0, 400) : undefined; };
  const prop = (p) => meta(new RegExp(`<meta[^>]+(?:property|name)=["']${p}["'][^>]+content=["']([^"']*)["']`, "i"))
    || meta(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${p}["']`, "i"));
  const social = {};
  for (const [k, re] of SOCIAL) { const m = re.exec(html); if (m) social[k] = m[0].replace(/[)"'.,;]+$/, ""); }
  const mastodon = /<a[^>]+rel=["'][^"']*\bme\b[^"']*["'][^>]+href=["'](https:\/\/[^"']+\/@[\w]+)["']/i.exec(html);
  if (mastodon && !/twitter|x\.com|instagram|facebook/.test(mastodon[1])) social.mastodon = mastodon[1];
  // A Lightning address the station publishes itself: lightning:name@host, or lud16.
  const ln = /lightning:([\w.+\-]+@[\w.\-]+\.[a-z]{2,})/i.exec(html) || /"lud16"\s*:\s*"([\w.+\-]+@[\w.\-]+\.[a-z]{2,})"/i.exec(html);
  let image = prop("og:image") || prop("twitter:image");
  try { if (image) image = new URL(image, base).href; } catch { image = undefined; }
  const out = {
    ok: true,
    title: meta(/<title[^>]*>([^<]{1,300})<\/title>/i),
    description: prop("og:description") || prop("description"),
    image, name: prop("og:site_name"),
    lang: (/<html[^>]+lang=["']([\w\-]{2,10})["']/i.exec(head) || [])[1],
    ...(Object.keys(social).length ? { social } : {}),
    ...(ln ? { lightning: ln[1] } : {}),
  };
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return out;
}
const decode = (s) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/\s+/g, " ");

/**
 * A station's claim: /.well-known/auralfm.json on its own site. Kept only as the
 * fields the spec names, each a short string, so a claim cannot smuggle in
 * anything else. Lightning addresses must look like name@host.
 */
const CLAIM_FIELDS = { name: 120, description: 600, lightning: 120, nostr: 70, logo: 300, contact: 120, genres: 200 };
async function readClaim(origin) {
  try {
    const r = await fetch(`${origin}/.well-known/auralfm.json`, { headers: { "User-Agent": UA, Accept: "application/json" },
      redirect: "follow", signal: AbortSignal.timeout(8000) });
    if (!r.ok || new URL(r.url).origin !== origin) return null;
    const j = await r.json();
    const c = {};
    for (const [k, max] of Object.entries(CLAIM_FIELDS)) if (typeof j[k] === "string" && j[k].trim()) c[k] = j[k].trim().slice(0, max);
    if (c.lightning && !/^[\w.+\-]+@[\w.\-]+\.[a-z]{2,}$/i.test(c.lightning)) delete c.lightning;
    if (c.nostr && !/^npub1[02-9ac-hj-np-z]{58}$/.test(c.nostr)) delete c.nostr;
    return Object.keys(c).length ? c : null;
  } catch { return null; }
}

async function website(raw) {
  let u; try { u = new URL(/^https?:/i.test(raw) ? raw : `http://${raw}`); } catch { return { ok: false, why: "bad url" }; }
  if (NOT_A_SITE.test(u.hostname.replace(/^www\./, ""))) return { ok: false, why: "not its own site" };
  return politely(u.hostname, async () => {
    if (!(await allowed(u))) return { ok: false, why: "robots" };
    try {
      const r = await fetch(u.href, { headers: { "User-Agent": UA, Accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(12000) });
      if (!r.ok) return { ok: false, why: `http ${r.status}` };
      if (!/html/i.test(r.headers.get("content-type") || "")) return { ok: false, why: "not html" };
      const reader = r.body.getReader(); let html = "", got = 0; const dec = new TextDecoder();
      while (got < 600000) { const { value, done } = await reader.read(); if (done) break; got += value.length; html += dec.decode(value, { stream: true }); }
      reader.cancel().catch(() => {});
      const claim = await readClaim(new URL(r.url).origin);
      return { ...readPage(html, r.url), final: r.url !== u.href ? r.url : undefined, ...(claim ? { claim } : {}) };
    } catch (e) { return { ok: false, why: e.name === "TimeoutError" ? "timeout" : "network" }; }
  });
}

// ── run ─────────────────────────────────────────────────────────────────────
const out = fs.createWriteStream(F.out, { flags: "a" });
let next = 0, done = 0, onAir = 0;
const started = Date.now();
async function worker() {
  while (next < todo.length) {
    const t = todo[next++];
    let host = ""; try { host = new URL(t.stream).hostname; } catch { /* none */ }
    const [stream, site] = await Promise.all([
      t.stream ? politely(`stream:${host}`, () => streamHeaders(t.stream)) : { ok: false, why: "no stream" },
      t.site || null ? website(t.site) : { ok: false, why: "no website" },
    ]);
    // When the stream names a website and we had none, read that one.
    let s2 = site;
    if (!site.ok && stream.url && /^https?:/i.test(stream.url) && site.why !== "robots") s2 = await website(stream.url);
    out.write(JSON.stringify({ id: t.id, at: new Date().toISOString().slice(0, 10), stream, site: s2 }) + "\n");
    done++; if (stream.ok) onAir++;
    if (done % 500 === 0 || done === todo.length) {
      const rate = done / ((Date.now() - started) / 1000);
      console.log(`  ${done}/${todo.length} · ${onAir} on air · ${rate.toFixed(1)}/s · ~${Math.round((todo.length - done) / rate / 60)} min left`);
    }
  }
}
await Promise.all(Array.from({ length: CFG.concurrency }, worker));
out.end();
