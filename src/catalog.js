/**
 * Station catalog + search.
 *
 * Loads the static bundle produced by scripts/crawl.mjs and answers queries.
 * Lives in the main process: the renderer never holds 38k rows, it just asks
 * for the ~50 it needs to draw.
 *
 * Bundle shape (positional, to keep the file small):
 *   p: [ [placeTitle, country, lon, lat], ... ]
 *   c: [ [channelId, title, placeIndex, secure, tags, radioBrowserUuid, lastCheckOk] ]
 *
 * tags is a comma-joined string, present only on the ~34% of channels we could
 * match to radio-browser (see scripts/tags.mjs). radio.garden has no genre data
 * of its own, so this is the only thing making "jazz" a useful query.
 */

const fs = require("node:fs");
const path = require("node:path");

const BUNDLE = path.join(__dirname, "..", "data", "stations.min.json");

let places = [];
let channels = [];
let haystack = [];      // lowercased "title ∙ place ∙ country ∙ tags" per channel
let byPlace = [];       // placeIndex -> [channelIndex] — built once, so Explore is O(1)
let placeHay = [];      // lowercased "place ∙ country" per place
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
    return norm(`${c[1]} ${p[0]} ${p[1]} ${c[4] || ""}`);
  });

  // Explore browses by place constantly, so invert the relation once at load
  // instead of scanning 38k channels on every click.
  byPlace = places.map(() => []);
  channels.forEach((c, i) => byPlace[c[2]]?.push(i));
  placeHay = places.map((p) => norm(`${p[0]} ${p[1]}`));

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
    tags: c[4] ? c[4].split(",") : [],
    rbuuid: c[5] || null,          // radio-browser id, for click reporting
    ok: c[6] === 0 ? false : c[6] === 1 ? true : null,
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
  // A station *named* "Jazz FM" outranks one merely tagged jazz, but a genre tag
  // still beats an incidental substring hit.
  if (c[4] && c[4].split(",").includes(first)) return 5;           // exact genre tag
  return 6;                                                        // substring somewhere
}

/**
 * Does any query term name this station's place or country?
 * In a mixed query like "jazz new orleans", the geography behaves like a filter
 * rather than another keyword — a Lyon station called "Jazz Radio New Orleans"
 * should never outrank an actual New Orleans jazz station.
 */
function placeMatches(idx, terms) {
  const p = places[channels[idx][2]] || ["", ""];
  const pl = norm(p[0]), co = norm(p[1]);
  const plTokens = pl.split(" "), coTokens = co.split(" ");
  return terms.some((t) =>
    pl === t || co === t || pl.startsWith(t) || plTokens.includes(t) || coTokens.includes(t));
}

function search(query, limit = 60) {
  const terms = norm(String(query || "").trim()).split(/\s+/).filter(Boolean);
  if (!terms.length) return [];

  const hits = [];
  for (let i = 0; i < channels.length; i++) {
    const s = score(i, terms);
    if (s >= 0) hits.push([placeMatches(i, terms) ? 0 : 1, s, channels[i][1].length, i]);
  }
  // Geography first, then how well the rest of the query matched, then brevity.
  hits.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  return hits.slice(0, limit).map(([, , , i]) => hydrate(i));
}

const hydratePlace = (i) => ({
  i,
  title: places[i][0],
  country: places[i][1],
  lon: places[i][2],
  lat: places[i][3],
  count: byPlace[i].length,
});

/** Every channel broadcasting from one place — the Explore primitive. */
function placeChannels(placeIndex) {
  if (!places[placeIndex]) return { place: null, channels: [] };
  return {
    place: hydratePlace(placeIndex),
    channels: byPlace[placeIndex].map(hydrate),
  };
}

/**
 * Places for the Explore list, optionally filtered. Sorted by station count so
 * the cities that actually have radio come first — an alphabetical list of
 * 12,296 places buries every city you'd want.
 */
function placeSearch(query, limit = 400) {
  const terms = norm(String(query || "").trim()).split(/\s+/).filter(Boolean);
  const out = [];
  for (let i = 0; i < places.length; i++) {
    if (!byPlace[i].length) continue;
    if (terms.length && !terms.every((t) => placeHay[i].includes(t))) continue;
    out.push(i);
  }
  if (terms.length) {
    const first = terms[0];
    // Prefix matches first ("berlin" before "new berlin"), then by station count.
    out.sort((a, b) =>
      (placeHay[a].startsWith(first) ? 0 : 1) - (placeHay[b].startsWith(first) ? 0 : 1) ||
      byPlace[b].length - byPlace[a].length);
  } else {
    out.sort((a, b) => byPlace[b].length - byPlace[a].length);
  }
  return { total: out.length, places: out.slice(0, limit).map(hydratePlace) };
}

/**
 * Compact payload for the globe: [placeIndex, lon, lat, stationCount] per place.
 * Positional on purpose — 12,296 hydrated objects over IPC is ~1 MB of mostly
 * field names the globe never reads.
 */
function globePoints() {
  const out = [];
  for (let i = 0; i < places.length; i++) {
    const n = byPlace[i].length;
    if (n) out.push([i, places[i][2], places[i][3], n]);
  }
  return out;
}

function byId(id) {
  const i = channels.findIndex((c) => c[0] === id);
  return i < 0 ? null : hydrate(i);
}

const stats = () => ({ places: places.length, channels: channels.length, generated });

module.exports = { load, search, placeSearch, placeChannels, globePoints, byId, stats };
