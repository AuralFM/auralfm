/**
 * Towns and regions, from GeoNames (CC-BY 4.0, https://www.geonames.org).
 *
 * data/geonames/ holds cities1000.txt (every town of 1,000 people or more),
 * admin1CodesASCII.txt (states, provinces, regions) and countryInfo.txt. It is
 * downloaded, not tracked; scripts/expand.mjs uses it to put a station that
 * named only its town or its region at that town instead of "Somewhere in
 * <country>".
 *
 * find(cc, region, title) answers { town, region } or null, where town is
 * { name, lat, lon, pop, id } and region is { name, lat, lon } (at its biggest
 * town). Cautious by design: a name shared by several towns counts only when
 * one of them is far the biggest, and a town read out of a station's own name
 * must be a city of 50,000 or more whose name is not also an ordinary word.
 */
import fs from "node:fs";
import path from "node:path";

const key = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/^(state of|province of|provincia de|provincia di|region|región|oblast|land|departement|département)\s+/, "")
  .replace(/[^\p{L}\p{N}]+/gu, " ").trim();

// Towns whose names are also words a station calls itself: "Radio Victoria" is
// rarely in Victoria. A town read from a name must not be one of these.
const WORDS = new Set(["victoria", "paradise", "liberty", "hope", "harmony", "bethel", "eden", "salem", "zion",
  "faith", "grace", "trinity", "providence", "concord", "unity", "union", "independence", "freedom", "progress",
  "phoenix", "aurora", "orlando", "florence", "marina", "rio", "santa", "san", "la", "el", "los", "las",
  "radio", "music", "love", "gospel", "classic", "hits", "rock", "jazz", "live", "news", "nova", "mega",
  "star", "sun", "venus", "luna", "mix", "max", "top", "one", "city", "centro", "central", "norte", "sur",
  "east", "west", "north", "south", "capital", "metro", "valle", "montana", "sierra", "costa", "playa",
  "real", "nueva", "nuevo", "vida", "paz", "esperanza", "gloria", "fe", "amor", "alegria", "libertad",
  "maria", "jose", "cristo", "jesus", "salvador", "trinidad", "rosario", "carmen", "dolores", "mercedes",
  "america", "europa", "africa", "asia", "mundo", "global", "planet", "world", "universal", "national",
  "internacional", "international", "digital", "web", "online", "fm", "am", "tv", "hd", "plus"]);

export function loadGazetteer(dir) {
  const f = (n) => path.join(dir, n);
  if (!fs.existsSync(f("cities1000.txt"))) return null;
  const regionsByCC = new Map();                       // cc → Map(key → { code, name })
  const regionName = new Map();                        // `${cc}.${a1}` → name
  for (const line of fs.readFileSync(f("admin1CodesASCII.txt"), "utf8").split("\n")) {
    const [code, name, ascii] = line.split("\t"); if (!code) continue;
    const [cc, a1] = code.split(".");
    if (!regionsByCC.has(cc)) regionsByCC.set(cc, new Map());
    for (const n of [name, ascii]) regionsByCC.get(cc).set(key(n), { code: a1, name });
    regionName.set(code, name);
  }
  const byName = new Map();                            // `${cc}|${key}` → [town]
  const byNameMain = new Map();                        // same, main names only (for reading titles)
  const biggest = new Map();                           // `${cc}.${a1}` → town
  const biggestCC = new Map();                         // cc → town
  const grid = new Map();                              // "lat,lon" (whole degrees) → [town]
  const add = (m, k, t) => { if (!k) return; const a = m.get(k) || m.set(k, []).get(k); if (!a.includes(t)) a.push(t); };
  for (const line of fs.readFileSync(f("cities1000.txt"), "utf8").split("\n")) {
    const c = line.split("\t"); if (c.length < 15) continue;
    const town = { id: c[0], name: c[1], lat: +c[4], lon: +c[5], cc: c[8], a1: c[10], pop: +c[14] || 0 };
    for (const n of [c[1], c[2]]) { add(byName, `${town.cc}|${key(n)}`, town); add(byNameMain, `${town.cc}|${key(n)}`, town); }
    for (const n of (c[3] || "").split(",")) if (n && n.length < 40) add(byName, `${town.cc}|${key(n)}`, town);
    const r = `${town.cc}.${town.a1}`;
    if (!biggest.has(r) || biggest.get(r).pop < town.pop) biggest.set(r, town);
    if (!biggestCC.has(town.cc) || biggestCC.get(town.cc).pop < town.pop) biggestCC.set(town.cc, town);
    const g = `${Math.floor(town.lat)},${Math.floor(town.lon)}`;
    (grid.get(g) || grid.set(g, []).get(g)).push(town);
  }

  /** The one town a name means, or null when it could be several. */
  const pick = (list) => {
    if (!list?.length) return null;
    const s = [...list].sort((a, b) => b.pop - a.pop);
    return s.length === 1 || s[0].pop >= 5 * Math.max(1, s[1].pop) ? s[0] : null;
  };

  /** Towns named, as whole words, in a station's own name. */
  function townsIn(cc, title, a1) {
    const w = key(title).split(" ").filter(Boolean);
    const found = [];
    for (let len = 3; len >= 1; len--) for (let i = 0; i + len <= w.length; i++) {
      const phrase = w.slice(i, i + len).join(" ");
      if (phrase.length < 4 || (len === 1 && WORDS.has(phrase))) continue;
      // "León, Guanajuato": Guanajuato is the state before it is the town, so a
      // word that names a region is not read as a town.
      if (regionsByCC.get(cc)?.has(phrase)) continue;
      const t = pick((byNameMain.get(`${cc}|${phrase}`) || []).filter((x) => !a1 || x.a1 === a1));
      if (t) found.push(t);
    }
    return found.sort((a, b) => b.pop - a.pop)[0] || null;
  }

  // Country name → code, for corrections that name a country ("Russia", "Peru").
  const ccByName = new Map();
  for (const line of fs.readFileSync(f("countryInfo.txt"), "utf8").split("\n")) {
    if (!line || line[0] === "#") continue;
    const c = line.split("\t"); ccByName.set(key(c[4]), c[0]);
  }

  return {
    /** Every town a name can mean in a country, biggest first (main and alternate names). */
    towns(cc, name) { return [...(byName.get(`${cc}|${key(name)}`) || [])].sort((a, b) => b.pop - a.pop); },
    /** A region's name from its code ("US", "IL" → "Illinois"). */
    regionName(cc, a1) { return regionName.get(`${cc}.${a1}`) || null; },
    /** A region's code from its name, or null. */
    regionCode(cc, name) { return regionsByCC.get(cc)?.get(key(name))?.code || null; },
    /** The biggest town in a region, for a place that names only its region. */
    biggestIn(cc, a1) { return biggest.get(`${cc}.${a1}`) || null; },
    /** The biggest town in a country. */
    biggestInCountry(cc) { return biggestCC.get(cc) || null; },
    /** The nearest town to a point, in that country when cc is given, within maxKm. */
    nearest(lat, lon, cc, maxKm = 25) {
      let best = null, d = Infinity;
      const R = 6371, rad = Math.PI / 180;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++)
        for (const t of grid.get(`${Math.floor(lat) + a},${Math.floor(lon) + b}`) || []) {
          if (cc && t.cc !== cc) continue;
          const x = Math.sin((t.lat - lat) * rad / 2) ** 2 + Math.cos(lat * rad) * Math.cos(t.lat * rad) * Math.sin((t.lon - lon) * rad / 2) ** 2;
          const dd = 2 * R * Math.asin(Math.sqrt(x));
          if (dd < d) { d = dd; best = t; }
        }
      return best && d <= maxKm ? best : null;
    },
    ccOf(name) {
      const k = key(name);
      if (ccByName.has(k)) return ccByName.get(k);
      for (const [n, cc] of ccByName) if (n.length > 3 && (n.includes(k) || k.includes(n))) return cc;
      return null;
    },
    find(cc, region, title) {
      if (!cc) return null;
      if (region) {
        const t = pick(byName.get(`${cc}|${key(region)}`));
        if (t) return { town: t, via: "town" };
        const r = regionsByCC.get(cc)?.get(key(region));
        if (r) {
          const inName = townsIn(cc, title, r.code);
          if (inName && inName.pop >= 1000) return { town: inName, via: "town in region" };
          const big = biggest.get(`${cc}.${r.code}`);
          if (big) return { region: { name: r.name, lat: big.lat, lon: big.lon, cc }, via: "region" };
        }
      }
      const t = townsIn(cc, title);
      return t && t.pop >= 50000 ? { town: t, via: "city in name" } : null;
    },
  };
}
