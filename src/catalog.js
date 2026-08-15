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
let bands = [];         // "am" | "fm" | null, derived from the title
let generated = null;

/**
 * Broadcast band, inferred from the station name — the only signal there is.
 * Case-sensitive on AM/FM so "Amsterdam" and "Firma" don't match. Roughly 46% of
 * channels come back null, which is the truthful answer: they are internet-only
 * or simply don't say. Those are excluded from band filters rather than guessed.
 */
function detectBand(title) {
  const am = /\bAM\b|\bA\.M\.\b/.test(title);
  const fm = /\bFM\b|\bF\.M\.\b/.test(title) || /\b\d{2,3}[.,]\d\b/.test(title);
  if (am && !fm) return "am";
  if (fm && !am) return "fm";
  return null;                        // both, or neither — don't pretend to know
}

function norm(s) {
  // Fold accents so "Bogotá" matches "bogota" and "Köln" matches "koln".
  //
  // And fold the decimal comma onto the point, because a frequency is the one
  // thing in a station name that is written differently depending on where you
  // are standing. Most of the world writes 104,9; this catalogue mostly holds
  // 104.9, and searching for the comma form used to return only the handful of
  // stations that also spell it with a comma -- four results out of the sixteen
  // thousand that carry a frequency at all. Brazil, Argentina, Mexico, Spain,
  // Colombia and Chile are the six countries with the most frequencies in their
  // names, and every one of them writes the comma.
  //
  // Applied here rather than at either call site so the haystack and the query
  // are folded by the same rule. Only between digits: "Radio 1, 2 and 3" is not
  // a frequency and keeps its comma.
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "")
          .replace(/(\d),(\d)/g, "$1.$2")
          .toLowerCase();
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
  bands = channels.map((c) => detectBand(c[1]));

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
    band: bands[i] || null,
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

/** Shared filter used by both search and place browsing. */
function passes(i, { band, tag } = {}) {
  if (band && bands[i] !== band) return false;
  if (tag) {
    const t = channels[i][4];
    if (!t || !t.split(",").includes(tag)) return false;
  }
  return true;
}

function search(query, limit = 60, filter = {}) {
  const terms = norm(String(query || "").trim()).split(/\s+/).filter(Boolean);
  if (!terms.length) return [];

  const hits = [];
  for (let i = 0; i < channels.length; i++) {
    if (!passes(i, filter)) continue;
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
function placeChannels(placeIndex, filter = {}) {
  if (!places[placeIndex]) return { place: null, channels: [], total: 0 };
  const all = byPlace[placeIndex];
  const kept = all.filter((i) => passes(i, filter));
  return {
    place: hydratePlace(placeIndex),
    channels: kept.map(hydrate),
    total: all.length,
  };
}

/** Most common genres in a place, for the filter chips. */
function placeTags(placeIndex, limit = 6) {
  const counts = {};
  for (const i of byPlace[placeIndex] || []) {
    const t = channels[i][4];
    if (!t) continue;
    for (const tag of t.split(",")) counts[tag] = (counts[tag] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([t, n]) => ({ tag: t, n }));
}

/** How many AM / FM stations a place has, so empty chips can be hidden. */
function placeBands(placeIndex) {
  const out = { am: 0, fm: 0 };
  for (const i of byPlace[placeIndex] || []) if (bands[i]) out[bands[i]]++;
  return out;
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

/**
 * Any station at all, uniformly.
 *
 * Uniform over the whole catalogue on purpose: weighting by anything — how many
 * stations a place has, how often one has worked, what somebody played
 * yesterday — would keep handing back the same busy cities and would be a
 * recommendation engine wearing a dice costume. 38,000 stations, each as likely
 * as the next, is the only version of this that is actually a shuffle.
 *
 * A station with no coordinates is skipped rather than returned, because the
 * whole point is to land somewhere on the globe. A handful of tries is enough:
 * almost every channel has a place, so this effectively never loops.
 */
function randomChannel() {
  if (!channels.length) return null;
  for (let tries = 0; tries < 12; tries++) {
    const c = hydrate(Math.floor(Math.random() * channels.length));
    if (Number.isFinite(c.lat) && Number.isFinite(c.lon)) return c;
  }
  return null;
}

/** One place by index, for anything that already knows which place it means. */
const placeById = (i) => (places[i] ? hydratePlace(i) : null);

function placeIndexOf(title, country) {
  const t = norm(title || ""), c = norm(country || "");
  for (let i = 0; i < places.length; i++) {
    if (norm(places[i][0]) === t && (!c || norm(places[i][1]) === c)) return i;
  }
  return -1;
}

/**
 * The next station broadcasting from the same place, skipping anything already
 * tried. This is what makes a dead stream a half-second hiccup instead of a
 * dead end — roughly 5% of streams are down or blocked at any moment, so the
 * app has to assume failure is normal rather than exceptional.
 */
function nextInPlace(channel, exclude = []) {
  const i = placeIndexOf(channel.place, channel.country);
  if (i < 0) return null;
  const skip = new Set([channel.id, ...exclude]);
  // Prefer stations radio-browser last saw alive.
  const cands = byPlace[i].map(hydrate).filter((c) => !skip.has(c.id));
  return cands.find((c) => c.ok !== false) || cands[0] || null;
}

function byId(id) {
  const i = channels.findIndex((c) => c[0] === id);
  return i < 0 ? null : hydrate(i);
}

const stats = () => ({ places: places.length, channels: channels.length, generated });

module.exports = { load, search, randomChannel, placeSearch, placeChannels, placeTags, placeBands, globePoints, placeById, nextInPlace, byId, stats };
