/**
 * Stations you added yourself.
 *
 * The catalogue is a build-time snapshot of 38,342 stations. It is very good and
 * it is always slightly out of date: stations launch, move, and change stream
 * URLs, and the crawl only runs when someone runs it. Before this, a station
 * AuralFM did not know about was simply unreachable — there was no way to say
 * "this one exists, here it is."
 *
 * Kept in its own file rather than merged into the shipped bundle, for the same
 * reason `failures.js` is: the catalogue is immutable, ships in the asar, and is
 * replaced wholesale by the next crawl. Anything the user owns has to live
 * somewhere a crawl cannot overwrite.
 *
 * A user station belongs to one of the 12,296 catalogue places rather than
 * carrying its own coordinates. That keeps every index scheme in `catalog.js`
 * intact, and 12,296 places is dense enough that the nearest one is a reasonable
 * home for a local station. Radio is regional; a station 40km away is still
 * "here" in the sense that matters.
 *
 * Nothing here is ever sent anywhere. Sharing a station upstream to
 * radio-browser is a separate, explicit, off-by-default act — see #22.
 */

const fs = require("node:fs");
const path = require("node:path");

let file = null;
let mine = [];          // { id, title, url, placeIndex, tags, at }

const PREFIX = "my:";

function init(userDataPath) {
  file = path.join(userDataPath, "stations.user.json");
  try {
    const saved = JSON.parse(fs.readFileSync(file, "utf8"));
    mine = Array.isArray(saved) ? saved.filter(valid) : [];
  } catch { mine = []; }
  if (mine.length) console.log(`mine: ${mine.length} station${mine.length === 1 ? "" : "s"} you added`);
}

const flush = () => { try { fs.writeFileSync(file, JSON.stringify(mine)); } catch {} };

const valid = (s) =>
  s && typeof s.id === "string" && s.id.startsWith(PREFIX) &&
  typeof s.title === "string" && s.title.trim() &&
  typeof s.url === "string" && /^https?:\/\//i.test(s.url) &&
  Number.isInteger(s.placeIndex);

/**
 * Stream URLs are the one piece of user input here that gets handed to a media
 * element, so it is checked rather than trusted. http and https only — a file:
 * or javascript: URL has no business being treated as a radio station.
 */
function cleanUrl(raw) {
  let u;
  try { u = new URL(String(raw).trim()); } catch { return null; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  return u.toString();
}

/**
 * @param {{title, url, placeIndex, tags?}} input
 * @returns {{ok:true, station:object}|{ok:false, error:string}}
 */
function add(input) {
  const title = String(input?.title || "").trim().slice(0, 80);
  if (!title) return { ok: false, error: "A name is required." };

  const url = cleanUrl(input?.url);
  if (!url) return { ok: false, error: "That does not look like a stream URL. It should start with http:// or https://." };

  if (!Number.isInteger(input?.placeIndex)) return { ok: false, error: "Pick a place first." };

  if (mine.some((s) => s.url === url && s.placeIndex === input.placeIndex)) {
    return { ok: false, error: "You already added that stream here." };
  }

  const station = {
    // Time plus a random suffix: unique without a counter to keep in sync, and
    // stable once written, which is what favourites key off.
    id: PREFIX + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    title,
    url,
    placeIndex: input.placeIndex,
    tags: Array.isArray(input.tags)
      ? input.tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean).slice(0, 8)
      : [],
    at: Date.now(),
  };
  mine.push(station);
  flush();
  return { ok: true, station };
}

function remove(id) {
  const before = mine.length;
  mine = mine.filter((s) => s.id !== id);
  if (mine.length !== before) { flush(); return true; }
  return false;
}

const isMine = (id) => typeof id === "string" && id.startsWith(PREFIX);
const get = (id) => mine.find((s) => s.id === id) || null;
const all = () => mine.slice();
const forPlace = (placeIndex) => mine.filter((s) => s.placeIndex === placeIndex);

/** placeIndex -> how many stations you added there, for the globe's dot sizes. */
function countsByPlace() {
  const out = new Map();
  for (const s of mine) out.set(s.placeIndex, (out.get(s.placeIndex) || 0) + 1);
  return out;
}

const norm = (s) => String(s || "").toLowerCase()
  .normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Substring match on name and tags. The set is small; nothing cleverer is needed. */
function search(query) {
  const q = norm(query).trim();
  if (!q) return [];
  return mine.filter((s) =>
    norm(s.title).includes(q) || s.tags.some((t) => norm(t).includes(q)));
}

module.exports = { init, add, remove, get, all, forPlace, countsByPlace, search, isMine };
