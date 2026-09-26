#!/usr/bin/env node
/**
 * Make the catalogue ours: nothing in it taken from radio.garden.
 *
 *   node scripts/own.mjs --dry   what it would keep, drop and place; nothing written
 *   node scripts/own.mjs         do it (once: it refuses a catalogue already converted)
 *
 * The catalogue began as a crawl of radio.garden's directory: 38,336 stations,
 * their names, their towns and their coordinates, under radio.garden's own ids.
 * Radio.garden is Dutch, and the EU protects a database someone invested in
 * against the copying of a substantial part of it, even where each fact in it
 * is free. So this does not rename that list; it keeps a station only where
 * something other than radio.garden confirms it, and places it from something
 * other than radio.garden (Melton, 26 Sept: "completely separate").
 *
 * A station stays when either:
 *   radio-browser  radio-browser.info lists it (public domain): the entry
 *                  scripts/tags.mjs matched plays the same stream, or carries
 *                  the same name. A match only on a shared website says the
 *                  network is listed, not this station, and does not count; or
 *   station        the station itself answered us, when scripts/enrich.mjs asked:
 *                  its own stream and its own website both; or, its website
 *                  not answering, a stream that names the station (its
 *                  icy-name is the station's name) or points to its website.
 * Anything else is dropped, and listed in the vault (own-dropped.csv) to look at.
 *
 * Every station gets an AuralFM id (scripts/lib/ids.mjs). Where it is comes
 * from GeoNames (CC BY 4.0): the town it is in, found by name within its
 * country, told apart from same-named towns by its state (US, Brazil) or by
 * radio-browser's position for it, else the biggest of them; a town GeoNames
 * cannot find becomes "Somewhere in <country>". radio.garden's coordinates are
 * never read.
 *
 * Moved to the new ids at the same time: the enrichment record (data/
 * _enrich.jsonl), corrections by hand (data/corrections.json) and approved
 * claims (data/claims.json). data/legacy-ids.json keeps old id → new id, for
 * favourites and for review sheets filled in before today.
 *
 * Afterwards, the usual build: scripts/tags.mjs, scripts/expand.mjs (which
 * re-adds radio-browser's own stations under the ids registered here), then
 * scripts/profiles.mjs.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { countryKey, km, writeBundles, the, streamKey, loose, overlap, domainOf } from "./lib/match.mjs";
import { loadGazetteer } from "./lib/gazetteer.mjs";
import { openIds, streamRef, rbRef } from "./lib/ids.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const R = (...p) => path.join(ROOT, ...p);
const F = {
  full: R("data/stations.json"), min: R("data/stations.min.json"), dump: R("data/_radiobrowser.json"),
  enrich: R("data/_enrich.jsonl"), ids: R("data/ids.json"), legacy: R("data/legacy-ids.json"),
  corr: R("data/corrections.json"), claims: R("data/claims.json"),
};
const VAULT = "/Users/mb3/Library/Mobile Documents/iCloud~md~obsidian/Documents/MB3Vault/04 Projects/AuralFM";
const dry = process.argv.includes("--dry");

const full = JSON.parse(fs.readFileSync(F.full, "utf8"));
if (full.channels.some((c) => String(c.id).startsWith("af-"))) {
  console.error("own: this catalogue already has AuralFM ids; nothing to do");
  process.exit(1);
}
const rb = new Map(JSON.parse(fs.readFileSync(F.dump, "utf8")).map((s) => [s.uuid, s]));
const enrich = new Map();
for (const line of fs.readFileSync(F.enrich, "utf8").split("\n")) {
  if (!line) continue;
  try { const r = JSON.parse(line); enrich.set(r.id, r); } catch { /* partial line */ }
}
const G = loadGazetteer(R("data/geonames"));
if (!G) { console.error("own: no data/geonames/ — download GeoNames first"); process.exit(1); }
const ids = openIds(F.ids);

// ── countries ──────────────────────────────────────────────────────────────
// The catalogue's country names stay (the apps, the taxonomy and src/region.js
// all use them); GeoNames needs the code. These are the ones its own names do
// not settle.
const ALIAS_CC = {
  "türkiye": "TR", "côte d'ivoire": "CI", "tahiti": "PF", "guiné-bissau": "GW", "u.s. virgin islands": "VI",
  "azores": "PT", "madeira": "PT", "canary islands": "ES", "collectivity of saint martin": "MF",
  "bailiwick of guernsey": "GG", "bailiwick of jersey": "JE", "são tomé and príncipe": "ST", "the bahamas": "BS",
  "republic of the congo": "CG", "democratic republic of the congo": "CD", "saint helena": "SH",
  "north korea": "KP", "south korea": "KR", "laos": "LA", "vietnam": "VN", "russia": "RU", "syria": "SY",
  "iran": "IR", "moldova": "MD", "bolivia": "BO", "venezuela": "VE", "tanzania": "TZ", "taiwan": "TW",
  "brunei": "BN", "micronesia": "FM", "cape verde": "CV", "eswatini": "SZ", "palestine": "PS",
  "vatican city": "VA", "macau": "MO", "hong kong": "HK", "curaçao": "CW", "sint maarten": "SX",
  "caribbean netherlands": "BQ", "saint barthélemy": "BL", "saint pierre and miquelon": "PM",
  "wallis and futuna": "WF", "faroe islands": "FO", "åland islands": "AX", "falkland islands": "FK",
  "british virgin islands": "VG", "turks and caicos islands": "TC", "cayman islands": "KY",
  "northern mariana islands": "MP", "american samoa": "AS", "puerto rico": "PR", "guam": "GU",
};
const ccCache = new Map();
const ccOf = (name) => {
  if (!ccCache.has(name)) ccCache.set(name, ALIAS_CC[String(name || "").toLowerCase()] || G.ccOf(name) || null);
  return ccCache.get(name);
};

// Brazil's state abbreviations, as the catalogue writes its towns ("Crato CE").
const BR = { AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia", CE: "Ceará", DF: "Federal District",
  ES: "Espírito Santo", GO: "Goiás", MA: "Maranhão", MT: "Mato Grosso", MS: "Mato Grosso do Sul", MG: "Minas Gerais",
  PA: "Pará", PB: "Paraíba", PR: "Paraná", PE: "Pernambuco", PI: "Piauí", RJ: "Rio de Janeiro", RN: "Rio Grande do Norte",
  RS: "Rio Grande do Sul", RO: "Rondônia", RR: "Roraima", SC: "Santa Catarina", SP: "São Paulo", SE: "Sergipe", TO: "Tocantins" };
// And Canada's provinces ("Windsor ON").
const CA = { AB: "Alberta", BC: "British Columbia", MB: "Manitoba", NB: "New Brunswick", NL: "Newfoundland and Labrador",
  NS: "Nova Scotia", NT: "Northwest Territories", NU: "Nunavut", ON: "Ontario", PE: "Prince Edward Island", QC: "Quebec",
  SK: "Saskatchewan", YT: "Yukon" };
const STATES = { BR, CA };
const brByA1 = new Map(Object.entries(BR).map(([ab, name]) => [G.regionCode("BR", name), ab]).filter(([a1]) => a1));

// ── places ─────────────────────────────────────────────────────────────────
const places = [], placeAt = new Map();
function make(key, place) {
  if (!placeAt.has(key)) { places.push(place); placeAt.set(key, places.length - 1); }
  return placeAt.get(key);
}
const townTitle = (t) => (t.cc === "US" ? `${t.name} ${t.a1}` : t.cc === "BR" && brByA1.has(t.a1) ? `${t.name} ${brByA1.get(t.a1)}` : t.name);
const atTown = (t, country) => make(`gn-${t.id}`, {
  id: `gn-${t.id}`, title: townTitle(t), country, geo: [t.lon, t.lat],
  ...(G.regionName(t.cc, t.a1) ? { region: G.regionName(t.cc, t.a1) } : {}), src: "gn",
});
const somewhere = (country, cc) => make(`in-${cc || countryKey(country)}`, {
  id: `in-${(cc || countryKey(country)).toLowerCase().replace(/ /g, "-")}`, title: `Somewhere in ${the(country)}`,
  country, geo: null, cc, src: "gn",
});
const online = () => make("online", { id: "online", title: "Online only", country: "Null Island", geo: [0, 0], src: "gn" });

const how = { exact: 0, byState: 0, byPosition: 0, biggest: 0, byName: 0, nearPosition: 0, country: 0, online: 0 };
const unplaced = new Map();                 // "town, country" → stations, for the report
const hasGeo = (r) => r && typeof r.lat === "number" && typeof r.lon === "number" && (r.lat || r.lon);

function placeFor(c, r) {
  const old = full.places[c.p] || {};
  const title = old.title || "";
  if (title === "Online only") { how.online++; return online(); }
  const country = c.country || old.country || "";
  const cc = ccOf(country);
  if (!cc) { how.country++; unplaced.set(`(country) ${country}`, (unplaced.get(`(country) ${country}`) || 0) + 1); return somewhere(country, null); }
  if (/^Somewhere in /.test(title)) { how.country++; return somewhere(country, cc); }

  // "Salina KS", "Crato CE", "Gandra, Viana do Castelo", "Kuala Lumpur".
  let name = title, code = null, region = null;
  const m = title.match(/^(.*\S)\s([A-Z]{2})$/);
  if (m && (cc === "US" || STATES[cc])) { name = m[1]; code = m[2]; }
  if (name.includes(",")) [name, region] = name.split(/,\s*/, 2);
  if (region && /^[A-Z]{2}$/.test(region) && STATES[cc]) { code = region; region = null; }

  let cands = G.towns(cc, name), via = "exact";
  // "Taichung City", "Castries City": GeoNames names the town without it.
  if (!cands.length && / City$/i.test(name)) cands = G.towns(cc, name.replace(/ City$/i, ""));
  if (code) {
    const a1 = cc === "US" ? code : G.regionCode(cc, STATES[cc]?.[code] || "");
    if (a1) { const f = cands.filter((t) => t.a1 === a1); if (f.length) { cands = f; via = "byState"; } }
  }
  if (region && cands.length > 1) {
    const a1 = G.regionCode(cc, region);
    if (a1) { const f = cands.filter((t) => t.a1 === a1); if (f.length) { cands = f; via = "byState"; } }
  }
  if (cands.length > 1) {
    if (hasGeo(r)) {
      const near = cands.map((t) => [t, km([t.lon, t.lat], [r.lon, r.lat])]).sort((a, b) => a[1] - b[1])[0];
      if (near[1] <= 100) { how.byPosition++; return atTown(near[0], country); }
    }
    via = via === "byState" ? "byState" : "biggest";
  }
  if (cands.length) { how[via]++; return atTown(cands[0], country); }

  // A name GeoNames does not know: radio-browser's position for the station,
  // then a city named in the station's own name, then the country.
  if (hasGeo(r)) {
    const t = G.nearest(r.lat, r.lon, cc, 25);
    if (t) { how.nearPosition++; return atTown(t, country); }
  }
  const hit = G.find(cc, r?.state, c.title);
  if (hit?.town) { how.byName++; return atTown(hit.town, country); }
  how.country++;
  unplaced.set(`${title}, ${country}`, (unplaced.get(`${title}, ${country}`) || 0) + 1);
  return somewhere(country, cc);
}

// ── stations ───────────────────────────────────────────────────────────────
const legacy = {}, kept = [], dropped = [];
const why = {};
const drop = (c, reason) => { why[reason] = (why[reason] || 0) + 1; dropped.push({ c, reason }); };
const seen = new Map();                     // new id → the station that took it
const from = { "radio-browser": 0, station: 0 };
const hostOf = (u) => { try { return new URL(u).hostname.split(".").slice(-2).join("."); } catch { return ""; } };

for (const c of full.channels) {
  // radio-browser's own stations (scripts/expand.mjs): registered now so the
  // next expand gives each the same id, and placed again by it.
  if (c.src === "rb") { legacy[c.id] = ids.idFor([rbRef(c.rbuuid), streamRef(c.url)]); continue; }
  const matched = c.rbuuid ? rb.get(c.rbuuid) : null;
  const e = enrich.get(c.id) || {};
  const own = c.url && /^https?:\/\//i.test(c.url) && !/radio\.garden/i.test(c.url) ? c.url : null;
  const sameStream = !!(matched && own && [matched.urlr, matched.url].some((u) => u && streamKey(u) === streamKey(own)));
  const sameName = !!(matched && (loose(matched.name) === loose(c.title) || overlap(c.title, matched.name) >= 0.75));
  const r = matched && (sameStream || sameName) ? matched : null;
  const s = e.stream || {};
  const namesItself = !!(s.name && s.name !== "no name" && (loose(s.name) === loose(c.title) || overlap(c.title, s.name) >= 0.6))
    || !!(s.url && c.website && domainOf(s.url) === domainOf(c.website));
  const conf = r ? "radio-browser" : own && s.ok && (e.site?.ok || namesItself) ? "station" : null;
  if (!conf) {
    drop(c, !own ? "no stream of its own" : e.stream?.ok ? "its website did not answer" : e.site?.ok ? "its stream did not answer" : "neither answered");
    continue;
  }
  const url = own || r.urlr || r.url;
  // Its own stream is who it is; radio-browser's uuid joins only when that entry
  // plays the same stream (a name alone can be two stations in two towns).
  const id = ids.idFor([streamRef(url), sameStream || !own ? rbRef(r?.uuid) : null]);
  if (seen.has(id)) { legacy[c.id] = id; drop(c, "the same station twice (one stream)"); continue; }
  seen.set(id, c);
  legacy[c.id] = id;
  from[conf]++;
  const p = placeFor(c, r);
  kept.push(Object.fromEntries(Object.entries({
    id, title: c.title, place: null, p, country: null, website: c.website || r?.home,
    secure: url.startsWith("https://"), stream: hostOf(url), url, tags: c.tags, rbuuid: r?.uuid, ok: c.ok,
    lang: c.lang, logo: c.logo, region: c.region, explicit: c.explicit, from: conf,
  }).filter(([, v]) => v !== undefined && v !== "")));
}

// ── finish the places ──────────────────────────────────────────────────────
// Two towns of one name in one country say which region they are in.
const byTitle = new Map();
places.forEach((p, i) => { if (p.src === "gn" && p.id.startsWith("gn-")) { const k = `${p.country}|${p.title}`; (byTitle.get(k) || byTitle.set(k, []).get(k)).push(i); } });
let renamed = 0;
for (const list of byTitle.values()) if (list.length > 1) for (const i of list) if (places[i].region) { places[i].title += `, ${places[i].region}`; renamed++; }
// "Somewhere in" sits at the middle of the country's own towns (a median, so
// Alaska does not drag the United States into the Pacific), else its biggest town.
const median = (xs) => { const a = [...xs].sort((x, y) => x - y); return a.length % 2 ? a[a.length >> 1] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2; };
for (const p of places) {
  if (p.geo) continue;
  const mine = places.filter((q) => q.geo && q.id.startsWith("gn-") && q.country === p.country);
  if (mine.length) p.geo = [median(mine.map((q) => q.geo[0])), median(mine.map((q) => q.geo[1]))];
  else { const t = p.cc && G.biggestInCountry(p.cc); p.geo = t ? [t.lon, t.lat] : [0, 0]; }
  delete p.cc;
}
for (const c of kept) { c.place = places[c.p].id; c.country = places[c.p].country; }

// ── report ─────────────────────────────────────────────────────────────────
const base = full.channels.filter((c) => c.src !== "rb").length;
console.log(`own: of ${base} stations from the old list, ${kept.length} stay (${from["radio-browser"]} confirmed by radio-browser, ` +
  `${from.station} by the station itself), ${dropped.length} go:`);
for (const [k, v] of Object.entries(why).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(6)}  ${k}`);
console.log(`placed in ${places.length} places from GeoNames: ${how.exact} by name, ${how.byState} by name and state, ` +
  `${how.byPosition} by radio-browser's position among same-named towns, ${how.biggest} the biggest of same-named towns, ` +
  `${how.nearPosition} at the town nearest radio-browser's position, ${how.byName} by a city in the station's name, ` +
  `${how.country} somewhere in their country, ${how.online} online only; ${renamed} same-named towns given their region`);
const top = [...unplaced].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => `${k} (${v})`).join(" · ");
if (top) console.log(`most common towns GeoNames did not find: ${top}`);

if (dry) { console.log("\n--dry: nothing written"); process.exit(0); }

// ── write ──────────────────────────────────────────────────────────────────
// Keyed data moves to the new ids; a record whose station went, goes with it.
const rekey = (obj) => Object.fromEntries(Object.entries(obj || {}).filter(([k]) => legacy[k]).map(([k, v]) => [legacy[k], v]));
const lines = [];
for (const line of fs.readFileSync(F.enrich, "utf8").split("\n")) {
  if (!line) continue;
  try { const r = JSON.parse(line); if (legacy[r.id]) lines.push(JSON.stringify({ ...r, id: legacy[r.id] })); } catch { /* partial */ }
}
fs.writeFileSync(F.enrich, lines.join("\n") + "\n");
if (fs.existsSync(F.corr)) {
  const corr = JSON.parse(fs.readFileSync(F.corr, "utf8"));
  corr.stations = rekey(corr.stations);
  fs.writeFileSync(F.corr, JSON.stringify(corr, null, 2) + "\n");
}
if (fs.existsSync(F.claims)) {
  const cl = JSON.parse(fs.readFileSync(F.claims, "utf8"));
  cl.approved = rekey(cl.approved);
  fs.writeFileSync(F.claims, JSON.stringify(cl, null, 2) + "\n");
}
ids.save();
fs.writeFileSync(F.legacy, JSON.stringify(legacy));
const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const sheet = [["station", "town", "country", "website", "why"].join(",")].concat(dropped.map(({ c, reason }) =>
  [c.title, full.places[c.p]?.title, c.country, c.website, reason].map(cell).join(",")));
const out = fs.existsSync(VAULT) ? path.join(VAULT, "own-dropped.csv") : R("data/own-dropped.csv");
fs.writeFileSync(out, sheet.join("\n") + "\n");

full.places = places;
full.channels = kept;
full.generated = new Date().toISOString();
writeBundles(full, F);
console.log(`\nwrote ${kept.length} stations in ${places.length} places; ${ids.size} ids in data/ids.json; ` +
  `the ${dropped.length} dropped are listed in ${out}. Next: scripts/tags.mjs --offline, scripts/expand.mjs, scripts/profiles.mjs`);
