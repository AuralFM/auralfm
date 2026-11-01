/**
 * Station catalog + search.
 *
 * Loads the static bundle the catalogue build produces (npm run catalogue) and answers queries.
 * Lives in the main process: the renderer never holds 38k rows, it just asks
 * for the ~50 it needs to draw.
 *
 * Bundle shape (positional, to keep the file small):
 *   p: [ [placeTitle, country, lon, lat], ... ]
 *   c: [ [channelId, title, placeIndex, secure, tags, radioBrowserUuid, lastCheckOk, explicit, speech] ]
 *
 * tags is a comma-joined string, present only on the ~34% of channels we could
 * match to radio-browser (see scripts/tags.mjs), plus what stations' own streams
 * say about themselves: the only thing making "jazz" a useful query.
 */

const fs = require("node:fs");
const path = require("node:path");
const region = require("./region");

const BUNDLE = path.join(__dirname, "..", "data", "stations.min.json");
/**
 * How to read the bundle where the plain file is not there. The packaged Mac
 * app carries it gzipped (src/packed.js), and main.js hands that reader in.
 * It is handed in, not required here, because the web build wraps this file
 * and has no zlib: there the plain file always exists.
 */
let readPacked = null;
const usePacked = (fn) => { readPacked = fn; };

let places = [];
let channels = [];
let haystack = null;    // "title ∙ place ∙ country ∙ tags" per channel, on first search
let byPlace = [];       // placeIndex -> [channelIndex] — built once, so Explore is O(1)
let placeHay = null;    // "place ∙ country" per place, on first search
let bands = [];         // "am" | "fm" | null, derived from the title
let generated = null;
let nowhere = new Uint8Array(0); // 1 for "Across …" and "Online, no country": no town, no real dot
// The bundle's names for them (scripts/lib/match.mjs shown()); the older names
// too, so a bundle built before 27 Sept still reads right.
const NOWHERE = /^(Across |Somewhere in |Online, no country$|Online only$)/;

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

/**
 * Where a station sits on its band, when its name says: MHz for FM, kHz for AM.
 * "Radio Ony FM 93.1" is 93.1; "Romántica 1380 AM" is 1380. Null when the name
 * gives no number that could be a frequency, which is never guessed at: "Hits
 * 80s FM" and "24/7 FM" name no frequency, and a whole number has to be in the
 * part of the band the world uses (87 and up) before it is believed.
 *
 * This is what turns the FM and AM chips into a dial: a town's stations in the
 * order a radio finds them, for somebody holding one (10 Oct 2026).
 */
function dial(title, band) {
  if (band === "fm") {
    // A number with a decimal is believed before a whole one: "K100 FM 100.5" is on 100.5.
    for (const m of String(title).matchAll(/(^|[^\d.,])(\d{2,3})[.,](\d{1,2})(?![\d.,])/g)) {
      const f = +`${m[2]}.${m[3]}`;
      if (f >= 76 && f <= 108) return f;
    }
    for (const m of String(title).matchAll(/(^|[^\d.,])(\d{2,3})(?![\d.,])/g)) {
      const f = +m[2];
      if (f >= 87 && f <= 108) return f;
    }
  } else if (band === "am") {
    for (const m of String(title).matchAll(/(^|[^\d.,])(\d{3,4})(?![\d.,])/g)) {
      const f = +m[2];
      if (f >= 520 && f <= 1710) return f;
    }
  }
  return null;
}

const ASCII = /^[\x00-\x7F]*$/;

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
  // normalize("NFD") is the expensive half, and it is the identity on ASCII —
  // which 86% of these strings are. Skipping it there folds the same output in
  // two thirds of the time, and this runs 50,916 times.
  return (ASCII.test(s) ? s : s.normalize("NFD").replace(/[̀-ͯ]/g, ""))
          .replace(/(\d),(\d)/g, "$1.$2")
          .toLowerCase();
}

function load() {
  const text = fs.existsSync(BUNDLE) ? fs.readFileSync(BUNDLE, "utf8") : readPacked ? readPacked("stations.min.json") : null;
  if (text === null) {
    console.warn("catalog: no bundle at data/stations.min.json — run `npm run catalogue`");
    return false;
  }
  const raw = JSON.parse(text);
  generated = raw.g;
  places = raw.p;
  channels = raw.c;
  // The search haystacks are NOT built here — see searchHay() and placeHaystack().
  haystack = placeHay = null;
  byIdIndex = null;

  // Explore browses by place constantly, so invert the relation once at load
  // instead of scanning 38k channels on every click.
  indexPlaces();
  bands = channels.map((c) => detectBand(c[1]));
  // Stations whose town nobody gave live at "Across <country>" (or
  // "Online, no country"), made by scripts/expand.mjs. Their position is a stand-in, so
  // they come after every real town wherever places are listed, and draw no dot
  // on the globe: real towns first, these at the end.
  nowhere = Uint8Array.from(places, (p) => (NOWHERE.test(p[0]) ? 1 : 0));
  setRegion();

  console.log(`catalog: ${channels.length} channels across ${places.length} places`);
  return true;
}

/**
 * Held back where the listener is (src/region.js): in the UK and the EU, a
 * music station from another country. Still listed, so the map stays whole and
 * nobody wonders where a station went; it just does not play.
 */
let home = null;
function setRegion(zone) { home = region.homeFor(zone); open = null; }
// What may play here, for the shuffle: most of the catalogue is held back in the
// UK, so drawing at random from all of it and skipping would mostly skip.
let open = null;
const openHere = () => (open ||= channels.map((_, i) => i).filter((i) => !heldBack(i) && !unplayable(i)));
const heldBack = (i) => !!home && channels[i]?.[8] !== 1 && !home.countries.has(places[channels[i][2]]?.[1]);
/** For the player: may this station play here? Stations not in the catalogue (your own) always may. */
function held(ch) {
  const i = ch ? indexOf(ch.id) : -1;
  return i >= 0 && heldBack(i);
}
let byIdIndex = null;
const indexOf = (id) => (byIdIndex ||= new Map(channels.map((c, i) => [c[0], i]))).get(String(id)) ?? -1;

function hydrate(i) {
  const c = channels[i];
  const p = places[c[2]] || ["", "", 0, 0];
  return {
    id: c[0],
    title: c[1],
    secure: !!c[3],
    tags: c[4] ? c[4].split(",") : [],
    band: bands[i] || null,
    // Worked out here, not at load: only a station with a band can have one.
    ...(bands[i] && dial(c[1], bands[i]) != null ? { freq: dial(c[1], bands[i]) } : {}),
    rbuuid: c[5] || null,          // radio-browser id, for click reporting
    ok: c[6] === 0 ? false : c[6] === 1 ? true : null,
    explicit: c[7] === 1,
    ...(heldBack(i) ? { held: true } : {}),
    place: p[0],
    country: p[1],
    lon: p[2],
    lat: p[3],
    pi: c[2],                      // its place, for anything that opens it (the player's "i")
  };
}

/**
 * Rank: earlier bucket wins, ties broken by shorter title (less padding around
 * the match). Every whitespace-separated term must appear somewhere, so
 * "jazz orleans" finds a jazz station in New Orleans.
 */
/**
 * The two search haystacks, folded on the first search rather than at load.
 *
 * Folding 38,337 titles and 12,579 place names cost ~3.6s of blocked main
 * thread inside load(), before the app could paint anything — and a session
 * that spins the globe and plays what it lands on never reads either array.
 * Built here instead: startup does not pay for a search nobody has run, and
 * the first search pays once.
 *
 * bands[] is deliberately not one of these. hydrate() reads it for every
 * station it returns, so it is wanted immediately and is cheap enough (0.4s).
 */
function searchHay() {
  return haystack ||= channels.map((c) => {
    const p = places[c[2]] || ["", ""];
    return norm(`${c[1]} ${p[0]} ${p[1]} ${c[4] || ""}`);
  });
}

function placeHaystack() {
  return placeHay ||= places.map((p) => norm(`${p[0]} ${p[1]}`));
}

function score(idx, terms) {
  const hay = searchHay()[idx];
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
/**
 * Explicit stations are listed like any other when real and on the air,
 * marked explicit, and left out everywhere — lists, search, shuffle —
 * when the listener turns on Settings → Hide explicit stations.
 */
let hideExplicit = false;
function setHideExplicit(on) { hideExplicit = !!on; }
const isExplicit = (i) => channels[i]?.[7] === 1;

/**
 * Only what can play here (the web app and the iPhone app): a page served over
 * https may not play an http-only stream, so those stations were listed and
 * then failed ("Only an insecure stream"). On the web they are left out of
 * every list, count, dot, search and shuffle, the parity rule: nothing
 * half-working on the web or a phone. The desktop plays them and keeps them.
 */
let playableOnly = false;
function setPlayableOnly(on) { playableOnly = !!on; indexPlaces(); open = null; }
// A station that went silent two weeks running goes the same way (scripts/reach.mjs).
const unplayable = (i) => playableOnly && (!channels[i]?.[3] || channels[i]?.[6] === 0);
function indexPlaces() {
  byPlace = places.map(() => []);
  channels.forEach((c, i) => { if (!unplayable(i)) byPlace[c[2]]?.push(i); });
}

function passes(i, { band, tag } = {}) {
  if (unplayable(i)) return false;
  if (hideExplicit && isExplicit(i)) return false;
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
    if (s >= 0) hits.push([heldBack(i) ? 1 : 0, placeMatches(i, terms) ? 0 : 1, s, channels[i][1].length, i]);
  }
  // What can play here first; then geography, how well the rest of the query
  // matched, and brevity.
  hits.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3]);
  return hits.slice(0, limit).map(([, , , , i]) => hydrate(i));
}

const hydratePlace = (i) => ({
  i,
  title: places[i][0],
  country: places[i][1],
  lon: places[i][2],
  lat: places[i][3],
  count: byPlace[i].length,
  ...(nowhere[i] ? { nowhere: true } : {}),
});

/** Every channel broadcasting from one place — the Explore primitive. */
function placeChannels(placeIndex, filter = {}) {
  if (!places[placeIndex]) return { place: null, channels: [], total: 0 };
  const all = byPlace[placeIndex];
  const kept = all.filter((i) => passes(i, filter));
  // FM or AM alone is the dial: lowest frequency first, as a radio finds them.
  // Stations whose names give no number keep their order, after the rest.
  if (filter.band) {
    const at = new Map(kept.map((i) => [i, dial(channels[i][1], bands[i]) ?? Infinity]));
    kept.sort((x, y) => at.get(x) - at.get(y));
  }
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

/**
 * Vibes: lanes across the whole globe, named by people rather than by a genre
 * code (BRAND.md §10). Each is a handful of the catalogue's own tags; a station
 * belongs to a vibe when it carries any of them. Counted 2026-09-25: from 27
 * old-time radio stations in 21 places up to 745 talk stations in 524.
 */
const VIBES = [
  { id: "house", name: "Deep & house", tags: ["deep house", "house"] },
  { id: "techno", name: "Techno", tags: ["techno"] },
  { id: "electronic", name: "Electronic & ambient", tags: ["electronic", "ambient", "experimental"] },
  // Seven more: the site had lanes for techno and old-time
  // radio and none for the biggest music there is. Tags are the spellings the
  // stations themselves use, counted in the catalogue; "urban" alone is left
  // out (it is hip-hop in one country and reggaeton in another), and so are
  // "pop rock" and "soft rock", which are pop stations.
  { id: "hiphop", name: "Hip-hop & rap", tags: ["hip hop", "hip-hop", "hiphop", "rap", "trap", "classic hip hop",
    "old school hip hop", "old school hip-hop", "old school rap", "gangsta rap", "rap hiphop rnb",
    "hip-hop and rap oldies", "lofi hip hop", "hiplife"] },
  { id: "rnb", name: "R&B", tags: ["r&b", "rnb", "rhythm and blues", "rhythm & blues", "contemporary r&b", "classic r&b",
    "r&b/urban", "r&b and urban", "urban contemporary", "urban adult contemporary", "urban ac", "r&b soul",
    "rap hiphop rnb"] },
  { id: "soul", name: "Soul & funk", tags: ["soul", "funk", "motown", "classic soul", "neo soul", "neo-soul",
    "northern soul", "soul music", "r&b soul", "disco funk", "p-funk"] },
  { id: "jazz", name: "Jazz", tags: ["jazz"] },
  { id: "rock", name: "Rock", tags: ["rock", "classic rock", "alternative rock", "hard rock", "indie rock",
    "progressive rock", "punk rock", "blues rock", "modern rock", "active rock", "rock en español",
    "rock'n'roll", "rock n roll", "rock 'n' roll", "rock & roll", "rock and roll"] },
  { id: "reggae", name: "Reggae & dub", tags: ["reggae", "dub"] },
  { id: "afro", name: "Afrobeats & amapiano", tags: ["afrobeats", "afrobeat", "afro", "afropop", "afro-pop", "afro pop",
    "afrofusion", "amapiano", "highlife", "afro house", "afro-house", "afrohouse", "naija", "gqom", "bongo flava"] },
  { id: "tropical", name: "Cumbia & tropical", tags: ["cumbia", "tropical"] },
  // Two more the same evening: Latin beyond cumbia, and classical.
  // "latinoamérica" is where a station is, not what it plays, and stays out.
  { id: "latin", name: "Salsa & Latin", tags: ["salsa", "latin", "latino", "latina", "reggaeton", "bachata", "merengue",
    "latin pop", "pop latino", "latin music", "musica latina", "música latina", "salsa colombiana", "latin salsa",
    "merengue bachata", "latino urbano", "latin urban", "urbano", "música urbana"] },
  { id: "classical", name: "Classical", tags: ["classical", "classical music", "opera", "baroque", "classical piano",
    "classical baroque", "modern classical", "contemporary classical", "classical guitar"] },
  { id: "faith", name: "Faith", tags: ["christian", "gospel", "catholic", "religious", "islamic", "quran"] },
  { id: "talk", name: "Talk", tags: ["talk"] },
  { id: "otr", name: "Old-time radio", tags: ["old time radio", "old-time radio", "otr", "drama", "detective"] },
  { id: "community", name: "Community", tags: ["community radio", "community", "college"] },
];

/**
 * The places that play a vibe, most of it first: [{ ...place, n }], where n is
 * how many of the place's stations carry the vibe. One pass over the channels,
 * a few milliseconds, so it is computed when asked rather than kept.
 *
 * Counted the way every other list is: only what this copy will show
 * (setPlayableOnly, setHideExplicit). It counted every station, so on the web,
 * where an http-only stream cannot play and is left out, a vibe listed 20,845
 * stations and showed 16,177 of them, and 1,318 of its rows opened a place with
 * nothing of that vibe in it (13 Oct 2026).
 */
function vibePlaces(id) {
  const vibe = VIBES.find((m) => m.id === id);
  if (!vibe) return [];
  const want = new Set(vibe.tags);
  const n = new Map();
  channels.forEach((c, i) => {
    if (unplayable(i) || (hideExplicit && isExplicit(i))) return;
    if (!c[4] || !c[4].split(",").some((t) => want.has(t.toLowerCase()))) return;
    n.set(c[2], (n.get(c[2]) || 0) + 1);
  });
  // The real towns first, most of the vibe first; "Across Germany" and its kin
  // after every one of them, as wherever else places are listed.
  return [...n].sort((a, b) => nowhere[a[0]] - nowhere[b[0]] || b[1] - a[1]).map(([i, k]) => ({ ...hydratePlace(i), n: k }));
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
/**
 * The orders a browse can take, for when nothing has been typed.
 *
 * Most stations first is the honest default and the worst discovery engine:
 * Paris, London and Moscow top it every time, so a listener who never searches
 * never meets Tallahassee. These are the other ways in — small places, near
 * where you are looking, where people are awake now, or none at all.
 *
 *   stations  most stations first
 *   gems      places with a dozen stations or fewer, in an order that changes
 *             once a day — stable while you scroll, different tomorrow
 *   near      nearest to {lat, lon} first
 *   awake     local solar time between 7:00 and 23:00, most stations first
 *   random    a fresh shuffle every time
 */
const GEM_MAX = 12;
const PLACE_ORDERS = ["stations", "gems", "near", "awake", "random"];

/** Small, deterministic PRNG, so a day's gems are the same all day. */
function seeded(seed) {
  let s = seed >>> 0;
  return () => ((s = (s + 0x6D2B79F5) >>> 0), (((s ^ (s >>> 15)) * (1 | s)) >>> 0) / 4294967296);
}
function shuffle(list, rand = Math.random) {
  for (let k = list.length - 1; k > 0; k--) {
    const j = Math.floor(rand() * (k + 1));
    [list[k], list[j]] = [list[j], list[k]];
  }
  return list;
}

function orderBrowse(out, { order, lat, lon } = {}) {
  const count = (i) => byPlace[i].length;
  switch (order) {
    case "gems": {
      const today = Math.floor(Date.now() / 86400000);
      return shuffle(out.filter((i) => count(i) <= GEM_MAX), seeded(today));
    }
    case "near": {
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) break;
      const rad = Math.PI / 180, la = lat * rad, lo = lon * rad;
      // Cosine of the angle is enough to rank by; no need for the arccos.
      const near = (i) => {
        const pla = places[i][3] * rad, plo = places[i][2] * rad;
        return Math.sin(la) * Math.sin(pla) + Math.cos(la) * Math.cos(pla) * Math.cos(plo - lo);
      };
      return out.map((i) => [i, near(i)]).sort((a, b) => b[1] - a[1]).map(([i]) => i);
    }
    case "awake": {
      const utcMin = new Date().getUTCHours() * 60 + new Date().getUTCMinutes();
      // Solar hour from longitude, as the cold open does: no time-zone table.
      const hour = (i) => ((((utcMin + places[i][2] * 4) / 60) % 24) + 24) % 24;
      return out.filter((i) => hour(i) >= 7 && hour(i) < 23).sort((a, b) => count(b) - count(a));
    }
    case "random":
      return shuffle(out);
  }
  return out.sort((a, b) => count(b) - count(a));
}

function placeSearch(query, limit = 400, opts = {}) {
  const terms = norm(String(query || "").trim()).split(/\s+/).filter(Boolean);
  const out = [];
  // Browsing places without a query reads no names, so it builds no index.
  const ph = terms.length ? placeHaystack() : null;
  for (let i = 0; i < places.length; i++) {
    if (!byPlace[i].length) continue;
    if (terms.length && !terms.every((t) => ph[i].includes(t))) continue;
    out.push(i);
  }
  if (terms.length) {
    const first = terms[0];
    // Real towns before "Across …", then prefix matches first ("berlin"
    // before "new berlin"), then by station count.
    out.sort((a, b) => nowhere[a] - nowhere[b] ||
      (ph[a].startsWith(first) ? 0 : 1) - (ph[b].startsWith(first) ? 0 : 1) ||
      byPlace[b].length - byPlace[a].length);
  } else {
    const ordered = orderBrowse(out, opts);
    // Whatever the order, the places with no town come after all the real ones.
    const last = [...ordered.filter((i) => !nowhere[i]), ...ordered.filter((i) => nowhere[i])];
    return { total: last.length, places: last.slice(0, limit).map(hydratePlace) };
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
    if (n && !nowhere[i]) out.push([i, places[i][2], places[i][3], n]);
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
  const pool = home ? openHere() : null;
  if (pool && !pool.length) return null;
  for (let tries = 0; tries < 12; tries++) {
    const i = pool ? pool[Math.floor(Math.random() * pool.length)] : Math.floor(Math.random() * channels.length);
    if ((hideExplicit && isExplicit(i)) || unplayable(i)) continue;
    const c = hydrate(i);
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
  const cands = byPlace[i].map(hydrate).filter((c) => !skip.has(c.id) && !c.held);
  return cands.find((c) => c.ok !== false) || cands[0] || null;
}

/**
 * A station saved under an id the catalogue no longer has, found again.
 *
 * The catalogue's ids were radio.garden's until 26 Sept 2026, when it became
 * AuralFM's own (scripts/own.mjs), so favourites and the last station saved
 * before then name ids that are gone. The same station by name, in the same
 * country, nearest to where it was saved; null when there is none.
 */
function relink(ch) {
  if (!ch?.id) return null;
  const i = indexOf(ch.id);
  if (i >= 0) return hydrate(i);
  const t = norm(String(ch.title || "")), co = norm(String(ch.country || ""));
  if (!t) return null;
  let best = -1, d = Infinity;
  for (let k = 0; k < channels.length; k++) {
    if (norm(channels[k][1]) !== t) continue;
    const p = places[channels[k][2]];
    if (co && p && norm(p[1]) !== co) continue;
    const dd = Number.isFinite(ch.lat) && Number.isFinite(ch.lon) && p ? (p[3] - ch.lat) ** 2 + (p[2] - ch.lon) ** 2 : 0;
    if (dd < d) { d = dd; best = k; }
  }
  return best >= 0 ? hydrate(best) : null;
}

/** Saved stations (favourites, the last one) moved to the ids the catalogue has now. */
function relinkSaved(state) {
  let moved = 0;
  const fix = (ch) => {
    if (!ch?.id || /^(my|sdr):/.test(String(ch.id)) || indexOf(ch.id) >= 0) return ch;
    const n = relink(ch);
    if (!n) return ch;
    moved++;
    return { ...ch, id: n.id, title: n.title, place: n.place, country: n.country, lat: n.lat, lon: n.lon, secure: n.secure };
  };
  const out = { ...state };
  if (Array.isArray(state.favorites)) out.favorites = state.favorites.map(fix);
  if (state.lastChannel) out.lastChannel = fix(state.lastChannel);
  return { state: out, moved };
}

function byId(id) {
  const i = indexOf(id);
  return i < 0 ? null : hydrate(i);
}

const stats = () => ({ places: places.length, channels: channels.length, generated });

module.exports = { dial, setHideExplicit, setPlayableOnly, setRegion, held, relink, relinkSaved, load, search, randomChannel, placeSearch, PLACE_ORDERS, placeChannels, placeTags, placeBands, globePoints, placeById, nextInPlace, byId, stats, VIBES, vibePlaces, usePacked };
