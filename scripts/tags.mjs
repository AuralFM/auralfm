#!/usr/bin/env node
/**
 * Fold radio-browser genre tags into the AuralFM catalog.
 *
 *   node scripts/tags.mjs            # match against the cached dump, rebuild bundle with tags
 *   node scripts/tags.mjs --refresh  # download radio-browser afresh first
 *   node scripts/tags.mjs --offline  # never touch the network
 *   node scripts/tags.mjs --dry      # match and report, write nothing
 *
 * radio.garden ships no genre metadata, so "jazz new orleans" can only ever find
 * stations with "jazz" in the name. radio-browser has ~11.7k tags but no useful
 * coordinates — so we crawl geography from one and genre from the other and join
 * them here.
 *
 * The join is the whole problem: two directories, no shared identifier. Matching
 * is tiered from most to least trustworthy, first hit wins, and every tier that
 * could produce a false positive is gated on corroborating evidence.
 *
 * September 2026: the stream itself became the first tier. scripts/streams.mjs
 * records where each station's audio comes from, and radio-browser records the
 * same for its stations, so the same stream is the same station whatever either
 * directory calls it. Coordinates became a tier too: radio-browser gives some
 * stations a position, and a similar name a few kilometres from the place is
 * the same station. Every run now starts clean, so a station that no longer
 * matches loses the tags an older match gave it.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "data");
const F = {
  dump: path.join(DATA, "_radiobrowser.json"),
  streams: path.join(DATA, "_streams.jsonl"),
  full: path.join(DATA, "stations.json"),
  min:  path.join(DATA, "stations.min.json"),
};

// radio-browser runs several mirrors of one directory. On 18 September de1
// answered small queries but returned 502 for the full list while de2 served
// it; on 26 September both did, while each served 10,000 at a time. So the
// list comes in pages, and a page tries each mirror in turn.
const RB_MIRRORS = ["de2", "de1"].map((h) => `https://${h}.api.radio-browser.info`);
const RB_PAGE = 10000;
const offline = process.argv.includes("--offline");
const refresh = process.argv.includes("--refresh");
const dry = process.argv.includes("--dry");
// --show TIER: thirty matches a tier made, ours beside theirs, to eyeball it.
const showTier = process.argv.includes("--show") ? process.argv[process.argv.indexOf("--show") + 1] : null;
const shown = [];

// ── normalisation ────────────────────────────────────────────────────────────
const norm = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Drops the noise that differs between directories for the same station:
// "Radio X FM 90.7" vs "Radio X". Only used with corroborating evidence.
const loose = (s) => norm(s)
  .replace(/\b(fm|am|radio|the|hd\d?)\b/g, " ")
  .replace(/\b\d+([.,]\d+)?\b/g, " ")
  .replace(/\s+/g, " ").trim();

const domainOf = (u) => {
  if (!u) return null;
  try { return new URL(u.startsWith("http") ? u : "http://" + u).hostname.replace(/^www\./, "").toLowerCase(); }
  catch { return null; }
};

/**
 * The two directories name countries differently — radio.garden says "United
 * States", radio-browser says "The United States Of America". Comparing them
 * literally silently failed the country gate for the largest country in the
 * catalog, and for the UK, Netherlands, Russia and others: roughly 9,900
 * stations that could never pass tiers 1 or 5.
 *
 * Containment resolves 211 of 227: "united states of america" contains
 * "united states", "russian federation" starts with "russia".
 */
const countryKey = (c) => (c || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim().replace(/^the /, "");

function sameCountryName(a, b) {
  const x = countryKey(a), y = countryKey(b);
  if (!x || !y) return false;
  if (x === y) return true;
  return x.length >= 4 && y.length >= 4 && (x.includes(y) || y.includes(x));
}

const cleanTags = (t) => [...new Set(
  (t || "").split(",").map((x) => x.trim().toLowerCase()).filter((x) => x && x.length < 32)
)];

// ── fetch ────────────────────────────────────────────────────────────────────
async function getDump() {
  if (offline || (fs.existsSync(F.dump) && !refresh)) {
    if (fs.existsSync(F.dump)) {
      console.log("radio-browser: using cached dump");
      return JSON.parse(fs.readFileSync(F.dump, "utf8"));
    }
    throw new Error("--offline but no cached dump at data/_radiobrowser.json");
  }
  console.log("radio-browser: downloading full station list…");
  const all = [];
  const tried = [];
  for (let offset = 0; ; offset += RB_PAGE) {
    let page = null;
    for (const host of RB_MIRRORS) {
      try {
        const res = await fetch(`${host}/json/stations?limit=${RB_PAGE}&offset=${offset}&order=stationuuid`,
          { headers: { "User-Agent": "AuralFM/0.1" }, signal: AbortSignal.timeout(120000) });
        if (!res.ok) { tried.push(`${new URL(host).host} HTTP ${res.status} at ${offset}`); continue; }
        page = await res.json();
        break;
      } catch (err) { tried.push(`${new URL(host).host} ${err.message} at ${offset}`); }
    }
    if (!page) throw new Error(`radio-browser: no mirror answered (${tried.join("; ")})`);
    all.push(...page);
    console.log(`  ${all.length} stations`);
    if (page.length < RB_PAGE) break;
  }
  if (tried.length) console.log(`radio-browser: ${tried.join("; ")} — used the next mirror`);
  // Keep only what we need — the raw dump is ~68 MB and we want none of it on disk.
  // Keep untagged stations too now: they still carry a UUID (for click
  // reporting) and a daily check result (for dead-stream detection).
  // Everything a station page or the enrichment crawl could use, and nothing it
  // could not: ~25 MB kept of ~68.
  const slim = all.map((s) => ({
    uuid: s.stationuuid,
    name: (s.name || "").trim(),
    country: s.country || "",
    cc: s.countrycode || "",
    state: s.state || "",
    home: s.homepage || "",
    tags: s.tags || "",
    ok: s.lastcheckok,            // radio-browser probes every station daily
    url: s.url || "",
    urlr: s.url_resolved || "",
    lat: s.geo_lat ?? null,
    lon: s.geo_long ?? null,
    lang: s.language || "",
    logo: s.favicon || "",
    codec: s.codec || "",
    br: s.bitrate || 0,
    votes: s.votes || 0,
    clicks: s.clickcount || 0,
  }));
  fs.writeFileSync(F.dump, JSON.stringify(slim));
  const tagged = slim.filter((s) => s.tags.trim()).length;
  const broken = slim.filter((s) => s.ok === 0).length;
  console.log(`radio-browser: ${all.length} stations · ${tagged} tagged · ${broken} failing their last check`);
  return slim;
}

/**
 * One key per stream, however it is written: no scheme, no www, no default
 * port, no query, no trailing "/" or ";" (Shoutcast's ";" is a player hack).
 * StreamTheWorld hands every listener a different edge host for one mount, so
 * there the mount alone is the key.
 */
function streamKey(u) {
  if (!u) return null;
  let x;
  try { x = new URL(u); } catch { return null; }
  const host = x.hostname.replace(/^www\./, "").toLowerCase();
  let p = decodeURIComponent(x.pathname).replace(/[;/]+$/, "").toLowerCase();
  if (/(^|\.)streamtheworld\.com$/.test(host)) {
    const mount = p.split("/").pop().replace(/\.(mp3|aac)$/, "").replace(/aac$/, "");
    return mount ? `stw:${mount}` : null;
  }
  const port = x.port && !["80", "443"].includes(x.port) ? `:${x.port}` : "";
  return `${host}${port}${p}`;
}

/** Kilometres between two [lon, lat] points. */
function km([lon1, lat1], [lon2, lat2]) {
  const r = Math.PI / 180, a = Math.sin((lat2 - lat1) * r / 2) ** 2
    + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin((lon2 - lon1) * r / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
}

/**
 * The words of a name that tell stations apart: not "radio", "fm" or a
 * frequency ("106.4"), but yes to a decade ("60's" is not "50's") and a call
 * sign. Single letters go, so "- 0 N -" is nothing.
 */
const nameWords = (s) => new Set(norm(s).replace(/\b\d+[.,]\d+\b/g, " ").split(" ")
  .filter((w) => w.length > 1 && !["fm", "am", "radio", "the", "hd", "mhz", "khz", "online", "web", "live"].includes(w)));

/**
 * Share of the longer name's words the two have in common, 0 to 1. The longer
 * name, so a sub-channel ("Antenne Vorarlberg Love Songs") does not pass for
 * its parent ("Antenne Vorarlberg"), nor "ON EDM" for anything with "on" in it.
 */
function overlap(a, b) {
  const x = nameWords(a), y = nameWords(b);
  if (!x.size || !y.size) return 0;
  let n = 0; for (const w of x) if (y.has(w)) n++;
  return n / Math.max(x.size, y.size);
}

// ── match ────────────────────────────────────────────────────────────────────
function buildIndexes(rb) {
  const byName = new Map(), byLoose = new Map(), byDomain = new Map(), byStream = new Map(), placed = [];
  const push = (m, k, v) => { if (!k) return; if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
  for (const s of rb) {
    push(byName, norm(s.name), s);
    const l = loose(s.name); if (l.length > 3) push(byLoose, l, s);
    push(byDomain, domainOf(s.home), s);
    const keys = new Set([streamKey(s.url), streamKey(s.urlr)]);
    for (const k of keys) push(byStream, k, s);
    if (typeof s.lat === "number" && typeof s.lon === "number" && (s.lat || s.lon)) placed.push(s);
  }
  // A coarse grid over the placed stations, a degree to a cell, so "near" is a
  // look at nine cells rather than every station on Earth.
  const grid = new Map();
  for (const s of placed) push(grid, `${Math.floor(s.lat)},${Math.floor(s.lon)}`, s);
  return { byName, byLoose, byDomain, byStream, grid };
}

function near(ix, [lon, lat], within) {
  const out = [];
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++)
    for (const s of ix.grid.get(`${Math.floor(lat) + a},${Math.floor(lon) + b}`) || [])
      if (km([lon, lat], [s.lon, s.lat]) <= within) out.push(s);
  return out;
}

/** True when one loose name is a whole-token prefix of the other. */
function tokenPrefix(a, b) {
  if (!a || !b) return false;
  const x = a.split(" "), y = b.split(" ");
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  if (!short.length || short.join("").length < 3) return false;
  return short.every((t, i) => long[i] === t);
}

/**
 * Ordered candidate sets, most trustworthy first. Returning a *list* per tier
 * rather than one station matters: a tier can match an entry that happens to
 * carry no tags, and short-circuiting there loses tags a later tier would have
 * found. Fixing the country gate exposed exactly that — matching improved while
 * tagging fell, because tier 1 started winning with untagged entries.
 */
function candidateTiers(ch, country, ix, place, stream) {
  const tiers = [];
  const inCountry = (list) => list.filter((s) => sameCountryName(s.country, country));

  // The same stream is the same station. Kept only when it is one station's
  // stream: a shared relay mount that several entries point at proves nothing.
  const sk = streamKey(stream);
  const byStream = sk ? ix.byStream.get(sk) || [] : [];
  if (byStream.length && new Set(byStream.map((s) => loose(s.name))).size <= 2) tiers.push(["stream", byStream]);

  const exact = ix.byName.get(norm(ch.title)) || [];
  if (exact.length) tiers.push(["name+country", inCountry(exact)]);

  const dom = ix.byDomain.get(domainOf(ch.website)) || [];
  if (dom.length === 1) tiers.push(["domain(unique)", dom]);
  else if (dom.length > 1) {
    const l = loose(ch.title);
    tiers.push(["domain+name", dom.filter((s) => loose(s.name) === l)]);
    const sets = new Set(dom.map((s) => cleanTags(s.tags).sort().join("|")));
    if (sets.size === 1) tiers.push(["domain(agreed)", dom]);
    tiers.push(["domain+prefix", dom.filter((s) => tokenPrefix(l, loose(s.name)))]);
  }

  if (exact.length === 1) tiers.push(["name(unique)", exact]);

  const lo = ix.byLoose.get(loose(ch.title)) || [];
  if (lo.length) tiers.push(["loose+country", inCountry(lo)]);

  // Near and alike: within 30 km of the place and sharing most of the name's
  // words ("Radio Dayax 89.5 FM" and "Dayax Radio Mogadishu" share "dayax").
  if (place?.geo) {
    if (loose(ch.title).length > 3) {
      const close = near(ix, place.geo, 30).filter((s) => overlap(ch.title, s.name) >= 0.75);
      if (close.length) tiers.push(["near+name", close]);
    }
  }

  return tiers.filter(([, list]) => list.length);
}

function match(ch, country, ix, place, stream) {
  const tiers = candidateTiers(ch, country, ix, place, stream);
  if (!tiers.length) return null;

  // Identity (uuid + last check) comes from the most trustworthy match.
  const [via, first] = tiers[0];
  const idFrom = first.find((s) => s.ok === 1) || first[0];

  // Tags come from the most trustworthy tier that actually has any. Union within
  // the tier: two entries for one station often describe it from different
  // angles (the WWOZ case — "jazz" on one, "blues, jazz, new orleans" on the other).
  let tags = [], tagVia = via;
  for (const [tv, list] of tiers) {
    const union = [...new Set(list.flatMap((s) => cleanTags(s.tags)))];
    if (union.length) { tags = union; tagVia = tv; break; }
  }

  return { tags, uuid: idFrom.uuid, ok: idFrom.ok, via: tagVia, name: idFrom.name, country: idFrom.country };
}

// ── main ─────────────────────────────────────────────────────────────────────
const rb = await getDump();
const full = JSON.parse(fs.readFileSync(F.full, "utf8"));
const ix = buildIndexes(rb);
const streams = new Map();
if (fs.existsSync(F.streams)) for (const line of fs.readFileSync(F.streams, "utf8").split("\n")) {
  try { const r = JSON.parse(line); if (r.url) streams.set(r.id, r.url); } catch { /* partial line */ }
}
console.log(`streams known for ${streams.size} of ${full.channels.length} channels`);

const before = { matched: full.channels.filter((c) => c.rbuuid).length, tagged: full.channels.filter((c) => c.tags?.length).length };
const stats = {};
let tagged = 0, matched = 0;
for (const ch of full.channels) {
  // Start clean: what a station carries is what this run found for it.
  delete ch.tags; delete ch.rbuuid; delete ch.ok;
  const place = full.places[ch.p];
  const country = place?.country;
  if (streams.has(ch.id)) ch.url = streams.get(ch.id);
  const m = match(ch, country, ix, place, ch.url);
  if (!m) continue;
  if (showTier && m.via === showTier && shown.length < 30) shown.push(`  ${ch.title} · ${country}  ⇄  ${m.name} · ${m.country}`);
  if (m.tags.length) { ch.tags = m.tags; tagged++; }
  if (m.uuid) ch.rbuuid = m.uuid;          // for click reporting
  if (m.ok === 0 || m.ok === 1) ch.ok = m.ok;
  matched++;
  stats[m.via] = (stats[m.via] || 0) + 1;
}

const pct = (n) => `${((100 * n) / full.channels.length).toFixed(1)}%`;
console.log(`\nbefore: ${before.matched} matched, ${before.tagged} tagged`);
const broken = full.channels.filter((c) => c.ok === 0).length;
console.log(`\nmatched ${matched} / ${full.channels.length} channels (${pct(matched)})`);
console.log(`  with genre tags   ${String(tagged).padStart(6)}  ${pct(tagged)}`);
console.log(`  with radio-browser id ${String(full.channels.filter((c) => c.rbuuid).length).padStart(2)}`);
console.log(`  failing last check ${String(broken).padStart(5)}  ${pct(broken)}`);
for (const [via, n] of Object.entries(stats).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${via.padEnd(16)} ${String(n).padStart(6)}  ${pct(n)}`);
}

if (showTier) console.log(`\n${showTier}:\n${shown.join("\n")}`);
if (dry) { console.log("\n--dry: nothing written"); process.exit(0); }

// Rewrite both bundles with tags folded in.
fs.writeFileSync(F.full, JSON.stringify(full));
const min = {
  g: full.generated,
  p: full.places.map((p) => [p.title, p.country, p.geo[0], p.geo[1]]),
  // [id, title, placeIndex, secure, tags, radioBrowserUuid, lastCheckOk]
  // Fixed arity now that later slots exist — optional trailing fields stop
  // working the moment anything follows them.
  c: full.channels.map((c) => [
    c.id, c.title, c.p, c.secure ? 1 : 0,
    c.tags?.length ? c.tags.join(",") : "",
    c.rbuuid || "",
    c.ok === 0 ? 0 : c.ok === 1 ? 1 : "",
  ]),
};
fs.writeFileSync(F.min, JSON.stringify(min));

const mb = (f) => (fs.statSync(f).size / 1e6).toFixed(1);
console.log(`\nstations.json      ${mb(F.full)} MB`);
console.log(`stations.min.json  ${mb(F.min)} MB`);

const top = {};
for (const c of full.channels) for (const t of c.tags || []) top[t] = (top[t] || 0) + 1;
console.log("\ntop tags: " + Object.entries(top).sort((a, b) => b[1] - a[1])
  .slice(0, 12).map(([t, n]) => `${t}(${n})`).join(" · "));
