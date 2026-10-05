#!/usr/bin/env node
/**
 * Put stations that gave no town at the town (or region) they say they are in.
 *
 *   node scripts/place.mjs          place and write
 *   node scripts/place.mjs --dry    print what would move, write nothing
 *
 * A quarter of the catalogue (15,000 stations) sat at "Somewhere in <country>":
 * radio-browser had no region and no coordinates for them, so expand.mjs could
 * only place them by country, and the gazetteer only reads a town out of a
 * station's name when it is a city of 50,000 or more. Melton, 27 Sept: the
 * list for a country was a wall of them, and many name their town outright
 * ("Santorini FM", "Ràdio Vilamajor", "CIHO FM Charlevoix").
 *
 * This reads its name and its tags more closely, and asks for more agreement
 * the smaller the town:
 *
 *   a region    named in its name or its tags ("GS Radio Bali") → "Somewhere
 *               in <region>", at the region's biggest town
 *   a town      in its tags (a tag is a deliberate label): 5,000 people or more
 *               in its name: 20,000 or more, or 3,000 or more when its tags
 *               name the same town
 *
 * Only within the station's own country, only a town's main name (not its
 * alternates), only a name that means one town (the gazetteer's pick), and a
 * word that many stations in many countries use in their names or tags
 * ("love", "holiday", "nation") only when it is a city of 200,000 or more:
 * those words are read from the catalogue itself, not guessed. What cannot be
 * placed stays where it was.
 * Runs in `npm run catalogue` after enrich.mjs, before profiles.mjs.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadGazetteer } from "./lib/gazetteer.mjs";
import { writeBundles } from "./lib/match.mjs";
import { byHand } from "./review.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const F = { full: path.join(ROOT, "data/stations.json"), min: path.join(ROOT, "data/stations.min.json") };
const dry = process.argv.includes("--dry");

const G = loadGazetteer(path.join(ROOT, "data/geonames"));
if (!G) { console.log("place: no GeoNames data in data/geonames — skipping"); process.exit(0); }
const full = JSON.parse(fs.readFileSync(F.full, "utf8"));

const key = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, " ").trim();


// Words that many stations in many countries use in their names or tags
// ("love", "holiday", "nation"): read from the catalogue, not guessed. Such a
// word only counts as a place when it is a big city (Paris, Rosario).
const count = (field) => {
  const seen = new Map();                                 // word → [count, Set(country)]
  for (const c of full.channels) for (const w of new Set(key(field(c)).split(" "))) {
    if (w.length < 3) continue;
    const e = seen.get(w) || seen.set(w, [0, new Set()]).get(w);
    e[0]++; e[1].add(c.country);
  }
  return (w) => { const e = seen.get(w); return !!e && e[0] >= 20 && e[1].size >= 4; };
};
const genericName = count((c) => c.title), genericTag = count((c) => (c.tags || []).join(" "));
const generic = (w) => genericName(w) || genericTag(w);
const BIG = 200000;

const somewhereRe = /^Somewhere in (the )?/;
const isNowhere = (p) => somewhereRe.test(p.title) && !p.title.includes(",");
const countryPlace = full.places.map((p) => isNowhere(p));

// Existing places by GeoNames id and by region, so a town already in the
// catalogue is reused rather than made twice.
const byGn = new Map(), byRegion = new Map();
full.places.forEach((p, i) => {
  if (/^gn-\d+$/.test(p.id)) byGn.set(p.id, i);
  if (p.id?.startsWith("gn-in-")) byRegion.set(p.id, i);
});
const ccOf = new Map();
function cc(country) {
  if (!ccOf.has(country)) ccOf.set(country, G.ccOf(country));
  return ccOf.get(country);
}

/** Phrases of one to three words, longest first. */
function phrases(text) {
  const w = key(text).split(" ").filter(Boolean);
  const out = [];
  for (let len = 3; len >= 1; len--) for (let i = 0; i + len <= w.length; i++) {
    const p = w.slice(i, i + len).join(" ");
    if (p.length >= 4) out.push(p);
  }
  return out;
}
/** The one town a phrase means in a country, by main names, as the gazetteer
 *  picks it; a word many stations use only when it is a big city. */
function townFor(code, phrase) {
  const list = G.mainTowns(code, phrase);
  if (!list.length) return null;
  const t = list.length === 1 || list[0].pop >= 5 * Math.max(1, list[1].pop) ? list[0] : null;
  if (t && !phrase.includes(" ") && generic(phrase) && t.pop < BIG) return null;
  return t;
}

function placeFor(c, inRegion) {
  const code = cc(c.country);
  if (!code) return null;
  const title = c.title, tags = (c.tags || []).join(" ");
  // A region, from the name or the tags.
  for (const p of [...phrases(title), ...phrases(tags)]) {
    if (!p.includes(" ") && generic(p)) continue;
    const a1 = G.regionCode(code, p);
    if (a1 && !townFor(code, p)) {
      const big = G.biggestIn(code, a1);
      if (big) return { region: { name: G.regionName(code, a1), a1, lat: big.lat, lon: big.lon }, via: "region" };
    }
  }
  // Agreement comes from the tags only: a homepage usually repeats the
  // station's own name, so it cannot confirm a town read from that name.
  const tagTowns = new Set();
  for (const p of phrases(tags)) { const t = townFor(code, p); if (t) tagTowns.add(t.id); }
  const best = [];
  for (const p of phrases(title)) {
    const t = townFor(code, p); if (!t) continue;
    if (t.pop >= 20000 || (tagTowns.has(t.id) && t.pop >= 3000)) best.push([t, "name"]);
  }
  for (const p of phrases(tags)) { const t = townFor(code, p); if (t && t.pop >= 5000) best.push([t, "tag"]); }
  // Not the homepage alone: tried, and it moved CJZN in Victoria to Vancouver
  // and a Connecticut station to New York, because a page names the big city
  // nearby, its sponsors and its network before its own town.
  // A station already known to be in a region stays in it.
  const within = inRegion ? best.filter(([t]) => G.regionName(code, t.a1) === inRegion) : best;
  if (!within.length) return null;
  within.sort((a, b) => b[0].pop - a[0].pop);
  return { town: within[0][0], via: within[0][1] };
}

function placeIndex(c, hit) {
  if (hit.town) {
    const id = `gn-${hit.town.id}`;
    if (byGn.has(id)) return byGn.get(id);
    const region = G.regionName(hit.town.cc, hit.town.a1);
    full.places.push({ id, title: hit.town.name, country: c.country, geo: [hit.town.lon, hit.town.lat], src: "gn", ...(region ? { region } : {}) });
    byGn.set(id, full.places.length - 1);
    return full.places.length - 1;
  }
  const r = hit.region;
  const id = `gn-in-${cc(c.country)}-${key(r.name).replace(/ /g, "-")}`;
  if (byRegion.has(id)) return byRegion.get(id);
  full.places.push({ id, title: `Somewhere in ${r.name}`, country: c.country, geo: [r.lon, r.lat], src: "gn", region: r.name });
  byRegion.set(id, full.places.length - 1);
  return full.places.length - 1;
}

/**
 * Placed by hand first (scripts/review.mjs, data/places-by-hand.csv): a person
 * looked the station up, so their town wins over anything read from its name.
 * The town is found in the gazetteer by its main name, in the station's own
 * country, and in the named region when one is given; a row that matches no
 * town is reported and left for the guesses below.
 */
const hand = byHand(), handMiss = [];
let handPlaced = 0;
function handTown(c, row) {
  const code = cc(row.country || c.country) || cc(c.country);
  if (!code) return null;
  // A person typed it, so a town's other names count too ("Haliburton").
  let list = G.mainTowns(code, key(row.town));
  if (!list.length) list = G.towns(code, key(row.town));
  if (row.region) {
    const inRegion = list.filter((t) => key(G.regionName(code, t.a1) || "") === key(row.region));
    if (inRegion.length) list = inRegion;
  }
  if (list[0]) return list[0];
  // Too small for the gazetteer: the sheet's own coordinates make the place.
  const lat = Number(row.lat), lon = Number(row.lon);
  if (row.lat && row.lon && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
    return { id: `hand-${key(row.town).replace(/ /g, "-")}-${code.toLowerCase()}`, name: row.town, cc: code, a1: G.regionCode(code, row.region || "") || "", lat, lon, pop: 0 };
  }
  return null;
}

const how = { town: 0, region: 0, name: 0, tag: 0 }, sample = [];
let moved = 0, looked = 0;
for (const c of full.channels) {
  const row = hand.get(c.id);
  if (row) {
    const town = handTown(c, row);
    if (town) { c.p = placeIndex(c, { town }); handPlaced++; continue; }
    handMiss.push(`${c.title} → "${row.town}"${row.region ? `, ${row.region}` : ""} (${c.country})`);
  }
  if (!countryPlace[c.p]) continue;
  looked++;
  const here = full.places[c.p];
  const inRegion = /^Somewhere in /.test(here.title) && here.country && here.title.replace(somewhereRe, "") !== here.country.replace(/^The /, "")
    ? here.title.replace(somewhereRe, "") : null;
  const hit = placeFor(c, inRegion);
  if (hit?.region && inRegion) continue;       // already in its region
  if (!hit) continue;
  const from = full.places[c.p].title;
  c.p = placeIndex(c, hit);
  moved++;
  if (hit.town) how.town++; else how.region++;
  how[hit.via] = (how[hit.via] || 0) + 1;
  if (sample.length < 60 && Math.random() < 0.05) sample.push(`${c.title} | ${from} → ${full.places[c.p].title} (${hit.via}${hit.town ? `, ${hit.town.pop.toLocaleString()} people` : ""})`);
}
if (hand.size) console.log(`place: ${handPlaced} placed by hand (data/places-by-hand.csv)${handMiss.length ? `; ${handMiss.length} not found in the gazetteer:` : ""}`);
for (const m of handMiss.slice(0, 40)) console.log(`  ? ${m}`);
console.log(`place: ${looked} stations had no town; placed ${moved} (${how.town} at a town, ${how.region} in a region)`);
console.log(`  by name ${how.name || 0}   by tag ${how.tag || 0}   by region ${how.region}`);
if (dry || process.argv.includes("--sample")) console.log(sample.join("\n"));
if (!dry) { writeBundles(full, F); console.log("place: wrote data/stations.json and the bundle"); }
