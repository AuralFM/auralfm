#!/usr/bin/env node
/**
 * Add radio-browser's stations that the catalogue does not have yet.
 *
 *   node scripts/expand.mjs          add them, rewrite both bundles
 *   node scripts/expand.mjs --dry    count what would be added, write nothing
 *
 * Runs after scripts/tags.mjs (which links the stations we already have to
 * their radio-browser entries). radio-browser's data is public domain, so a
 * station found only there is ours to list.
 *
 * A station goes on the globe only where it honestly is:
 *   near    radio-browser gives it a position within 25 km of one of our places
 *   own     it has a position with none of our places near: a new place there,
 *           named for the region radio-browser gives, when it gives one
 *   named   no position, but the town it names is exactly one of our places in
 *           its country
 * Everything else is held back and counted, never dropped on a capital.
 *
 * And never twice: not a station we already carry (the same radio-browser
 * entry, the same stream, or the same name in the same place), not two
 * radio-browser entries for one stream, not a station failing its last check,
 * not television.
 *
 * Idempotent: each run first takes out what the previous one added (every
 * addition carries src: "rb"), so it can run after every crawl.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { loose, countryKey, sameCountryName, cleanTags, streamKey, km, writeBundles } from "./lib/match.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "data");
const F = {
  dump: path.join(DATA, "_radiobrowser.json"),
  streams: path.join(DATA, "_streams.jsonl"),
  full: path.join(DATA, "stations.json"),
  min: path.join(DATA, "stations.min.json"),
};
const dry = process.argv.includes("--dry");
const NEAR_KM = 25, SAME_NEW_PLACE_KM = 10;

const full = JSON.parse(fs.readFileSync(F.full, "utf8"));
const rb = JSON.parse(fs.readFileSync(F.dump, "utf8"));

// ── start from the catalogue without the last run's additions ──────────────
const firstAdded = full.places.findIndex((p) => p.src === "rb");
if (firstAdded >= 0 && full.places.slice(firstAdded).some((p) => p.src !== "rb"))
  throw new Error("expand: added places are not all at the end; rebuild the catalogue first");
const removed = full.channels.filter((c) => c.src === "rb").length;
full.channels = full.channels.filter((c) => c.src !== "rb");
if (firstAdded >= 0) full.places.length = firstAdded;
if (removed) console.log(`expand: took out ${removed} stations added last time`);

// ── what we already carry ──────────────────────────────────────────────────
const streams = new Map();
if (fs.existsSync(F.streams)) for (const line of fs.readFileSync(F.streams, "utf8").split("\n")) {
  try { const r = JSON.parse(line); if (r.url) streams.set(r.id, r.url); } catch { /* partial line */ }
}
const haveUuid = new Set(full.channels.map((c) => c.rbuuid).filter(Boolean));
const haveStream = new Set(full.channels.map((c) => streamKey(c.url || streams.get(c.id))).filter(Boolean));
const haveNameAt = new Set(full.channels.map((c) => `${loose(c.title)}|${c.p}`));
console.log(`expand: ${full.channels.length} stations carried, ${haveStream.size} of them with a known stream`);

// ── radio-browser's candidates, one per stream ─────────────────────────────
const TV = /\b(tv|television|televisi[oó]n|video)\b/i;
const why = {};
const hold = (reason) => { why[reason] = (why[reason] || 0) + 1; };
const byStream = new Map();
for (const s of rb) {
  if (haveUuid.has(s.uuid)) continue;
  if (s.ok !== 1) { hold("failing its last check"); continue; }
  if (!s.name || !(s.urlr || s.url)) { hold("no name or stream"); continue; }
  if (TV.test(`${s.name} ${s.tags}`)) { hold("television"); continue; }
  const key = streamKey(s.urlr || s.url);
  if (!key) { hold("no name or stream"); continue; }
  if (haveStream.has(key)) { hold("already carried (same stream)"); continue; }
  const prev = byStream.get(key);
  if (!prev) byStream.set(key, { ...s, allTags: cleanTags(s.tags) });
  else {
    hold("a second entry for one stream");
    prev.allTags = [...new Set([...prev.allTags, ...cleanTags(s.tags)])];
    if ((s.votes + s.clicks) > (prev.votes + prev.clicks)) Object.assign(prev, { ...s, allTags: prev.allTags });
  }
}

// ── where each one goes ────────────────────────────────────────────────────
const grid = new Map();
const cell = (lat, lon) => `${Math.floor(lat)},${Math.floor(lon)}`;
const index = (i) => { const p = full.places[i]; const k = cell(p.geo[1], p.geo[0]); (grid.get(k) || grid.set(k, []).get(k)).push(i); };
full.places.forEach((_, i) => index(i));
function nearest(lat, lon) {
  let best = -1, d = Infinity;
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++)
    for (const i of grid.get(cell(lat + a, lon + b)) || []) {
      const dd = km(full.places[i].geo, [lon, lat]);
      if (dd < d) { d = dd; best = i; }
    }
  return [best, d];
}
const byTitle = new Map();
full.places.forEach((p, i) => { const k = countryKey(p.title.split(",")[0]); (byTitle.get(k) || byTitle.set(k, []).get(k)).push(i); });

const how = { near: 0, own: 0, named: 0 };
const added = [];
let newPlaces = 0;
for (const s of byStream.values()) {
  let p = -1, via = "";
  const hasGeo = typeof s.lat === "number" && typeof s.lon === "number" && (s.lat || s.lon);
  if (hasGeo) {
    const [i, d] = nearest(s.lat, s.lon);
    if (i >= 0 && d <= NEAR_KM && (!s.country || sameCountryName(full.places[i].country, s.country))) { p = i; via = "near"; }
    else if (i >= 0 && d <= SAME_NEW_PLACE_KM && full.places[i].src === "rb") { p = i; via = "own"; }
    else if (s.state && countryKey(s.state) !== countryKey(s.country)) {
      const country = i >= 0 && sameCountryName(full.places[i].country, s.country) ? full.places[i].country : s.country;
      full.places.push({ id: `rb-${s.uuid.slice(0, 8)}`, title: s.state, country, geo: [s.lon, s.lat], src: "rb" });
      p = full.places.length - 1; index(p); newPlaces++; via = "own";
    } else { hold("a position, but no place near and no name for one"); continue; }
  } else if (s.state) {
    const hits = (byTitle.get(countryKey(s.state)) || []).filter((i) => sameCountryName(full.places[i].country, s.country));
    if (hits.length === 1) { p = hits[0]; via = "named"; }
    else { hold(hits.length ? "a town that is several of our places" : "only a region, no town we know"); continue; }
  } else { hold("only a country"); continue; }

  if (haveNameAt.has(`${loose(s.name)}|${p}`)) { hold("already carried (same name, same place)"); continue; }
  haveNameAt.add(`${loose(s.name)}|${p}`);
  const url = s.urlr || s.url;
  let host = ""; try { host = new URL(url).hostname.split(".").slice(-2).join("."); } catch { /* keep "" */ }
  const place = full.places[p];
  added.push({
    id: `rb-${s.uuid}`, title: s.name, place: place.id, p, country: place.country,
    website: s.home, secure: url.startsWith("https://"), stream: host, url,
    ...(s.allTags.length ? { tags: s.allTags } : {}), rbuuid: s.uuid, ok: 1,
    lang: s.lang, logo: s.logo, src: "rb",
  });
  how[via]++;
}

// ── report ─────────────────────────────────────────────────────────────────
const require = createRequire(import.meta.url);
const T = require(path.join(ROOT, "src/taxonomy.js"));
const genreGain = {};
for (const c of added) for (const g of T.classify({ tags: c.tags || [], title: c.title, country: c.country }).genres)
  genreGain[g] = (genreGain[g] || 0) + 1;
const countries = {};
for (const c of added) countries[c.country] = (countries[c.country] || 0) + 1;

console.log(`\nadds ${added.length} stations: ${how.near} near a place we have, ${how.named} by the town they name, ` +
  `${how.own} at ${newPlaces} new places of their own`);
console.log(`  ${added.filter((c) => c.secure).length} of them https (playable on the web as well as the desktop)`);
console.log(`\nheld back or skipped:`);
for (const [k, v] of Object.entries(why).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(6)}  ${k}`);
console.log(`\nmost added: ${Object.entries(countries).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
console.log(`genres gained: ${Object.entries(genreGain).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, v]) => `${k} +${v}`).join(" · ")}`);

if (dry) { console.log("\n--dry: nothing written"); process.exit(0); }
full.channels.push(...added);
writeBundles(full, F);
console.log(`\nwrote ${full.channels.length} stations in ${full.places.length} places`);
