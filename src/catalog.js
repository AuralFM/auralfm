/**
 * Station catalog + search.
 *
 * Loads the static bundle produced by scripts/crawl.mjs and answers queries.
 * Lives in the main process: the renderer never holds 38k rows, it just asks
 * for the ~50 it needs to draw.
 *
 * Bundle shape (positional, to keep the file small):
 *   p: [ [placeTitle, country, lon, lat], ... ]
 *   c: [ [channelId, title, placeIndex, secure], ... ]
 */

const fs = require("node:fs");
const path = require("node:path");

const BUNDLE = path.join(__dirname, "..", "data", "stations.min.json");

let places = [];
let channels = [];
let haystack = [];      // lowercased "title ∙ place ∙ country" per channel
let generated = null;

function norm(s) {
  // Fold accents so "Bogotá" matches "bogota" and "Köln" matches "koln".
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function load() {
  if (!fs.existsSync(BUNDLE)) {
    console.warn("catalog: no bundle at data/stations.min.json — run `npm run crawl`");
    return false;
  }
  const raw = JSON.parse(fs.readFileSync(BUNDLE, "utf8"));
  generated = raw.g;
  places = raw.p;
  channels = raw.c;
  haystack = channels.map((c) => {
    const p = places[c[2]] || ["", ""];
    return norm(`${c[1]} ${p[0]} ${p[1]}`);
  });
  console.log(`catalog: ${channels.length} channels across ${places.length} places`);
  return true;
}

function hydrate(i) {
  const c = channels[i];
  const p = places[c[2]] || ["", "", 0, 0];
  return {
    id: c[0],
    title: c[1],
    secure: !!c[3],
    place: p[0],
    country: p[1],
    lon: p[2],
    lat: p[3],
  };
}

/**
 * Rank: earlier bucket wins, ties broken by shorter title (less padding around
 * the match). Every whitespace-separated term must appear somewhere, so
 * "jazz orleans" finds a jazz station in New Orleans.
 */
function score(idx, terms) {
  const hay = haystack[idx];
  for (const t of terms) if (!hay.includes(t)) return -1;

  const c = channels[idx];
  const p = places[c[2]] || ["", ""];
  const title = norm(c[1]);
  const first = terms[0];

  // Place beats title-word deliberately: someone typing "paris" wants stations
  // *in* Paris, not a station called "In Paris" broadcasting from Lille.
  if (title === first) return 0;                                   // exact station
  if (title.startsWith(first)) return 1;                           // station prefix
  if (norm(p[0]) === first || norm(p[1]) === first) return 2;      // exact place/country
  if (norm(p[0]).startsWith(first)) return 3;                      // place prefix
  if (new RegExp(`\\b${first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(title)) return 4;
  return 5;                                                        // substring somewhere
}

function search(query, limit = 60) {
  const terms = norm(String(query || "").trim()).split(/\s+/).filter(Boolean);
  if (!terms.length) return [];

  const hits = [];
  for (let i = 0; i < channels.length; i++) {
    const s = score(i, terms);
    if (s >= 0) hits.push([s, channels[i][1].length, i]);
  }
  hits.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return hits.slice(0, limit).map(([, , i]) => hydrate(i));
}

/** Every channel broadcasting from one place — the Explore primitive. */
function byPlace(placeTitle, country) {
  const t = norm(placeTitle), c = country ? norm(country) : null;
  const idx = places.findIndex((p) => norm(p[0]) === t && (!c || norm(p[1]) === c));
  if (idx < 0) return { place: null, channels: [] };
  const out = [];
  for (let i = 0; i < channels.length; i++) if (channels[i][2] === idx) out.push(hydrate(i));
  return {
    place: { title: places[idx][0], country: places[idx][1], lon: places[idx][2], lat: places[idx][3] },
    channels: out,
  };
}

function byId(id) {
  const i = channels.findIndex((c) => c[0] === id);
  return i < 0 ? null : hydrate(i);
}

const stats = () => ({ places: places.length, channels: channels.length, generated });

module.exports = { load, search, byPlace, byId, stats };
