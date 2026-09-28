/**
 * What scripts/tags.mjs and scripts/expand.mjs both need to tell stations
 * apart: names, countries, streams, distances, and writing the two bundles.
 */
import fs from "node:fs";
import { createRequire } from "node:module";

const { classify } = createRequire(import.meta.url)("../../src/taxonomy.js");

// ── normalisation ────────────────────────────────────────────────────────────
export const norm = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Drops the noise that differs between directories for the same station:
// "Radio X FM 90.7" vs "Radio X". Only used with corroborating evidence.
export const loose = (s) => norm(s)
  .replace(/\b(fm|am|radio|the|hd\d?)\b/g, " ")
  .replace(/\b\d+([.,]\d+)?\b/g, " ")
  .replace(/\s+/g, " ").trim();

export const domainOf = (u) => {
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
export const countryKey = (c) => (c || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim().replace(/^the /, "");

export function sameCountryName(a, b) {
  const x = countryKey(a), y = countryKey(b);
  if (!x || !y) return false;
  if (x === y) return true;
  return x.length >= 4 && y.length >= 4 && (x.includes(y) || y.includes(x));
}

export const cleanTags = (t) => [...new Set(
  (t || "").split(",").map((x) => x.trim().toLowerCase()).filter((x) => x && x.length < 32)
)];

/**
 * One key per stream, however it is written: no scheme, no www, no default
 * port, no query, no trailing "/" or ";" (Shoutcast's ";" is a player hack).
 * StreamTheWorld hands every listener a different edge host for one mount, so
 * there the mount alone is the key.
 */
export function streamKey(u) {
  if (!u) return null;
  let x;
  try { x = new URL(u); } catch { return null; }
  const host = x.hostname.replace(/^www\./, "").toLowerCase();
  let p = decodeURIComponent(x.pathname).replace(/[;/]+$/, "").toLowerCase();
  if (/(^|\.)streamtheworld\.com$/.test(host)) {
    const mount = p.split("/").pop().replace(/\.(mp3|aac)$/, "").replace(/aac$/, "");
    return mount ? `stw:${mount}` : null;
  }
  // Qingting (China) serves one station from three hosts; the path is the station.
  if (/(^|\.)(qingting\.fm|qtfm\.cn)$/.test(host)) return `qingting:${p}`;
  const port = x.port && !["80", "443"].includes(x.port) ? `:${x.port}` : "";
  return `${host}${port}${p}`;
}

/** Kilometres between two [lon, lat] points. */
export function km([lon1, lat1], [lon2, lat2]) {
  const r = Math.PI / 180, a = Math.sin((lat2 - lat1) * r / 2) ** 2
    + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin((lon2 - lon1) * r / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
}

/**
 * The words of a name that tell stations apart: not "radio", "fm" or a
 * frequency ("106.4"), but yes to a decade ("60's" is not "50's") and a call
 * sign. Single letters go, so "- 0 N -" is nothing.
 */
export const nameWords = (s) => new Set(norm(String(s || "").replace(/\b\d+[.,]\d+\b/g, " ")).split(" ")
  .filter((w) => w.length > 1 && !["fm", "am", "radio", "the", "hd", "mhz", "khz", "online", "web", "live"].includes(w)));

/**
 * Share of the longer name's words the two have in common, 0 to 1. The longer
 * name, so a sub-channel ("Antenne Vorarlberg Love Songs") does not pass for
 * its parent ("Antenne Vorarlberg"), nor "ON EDM" for anything with "on" in it.
 */
export function overlap(a, b) {
  const x = nameWords(a), y = nameWords(b);
  if (!x.size || !y.size) return 0;
  let n = 0; for (const w of x) if (y.has(w)) n++;
  return n / Math.max(x.size, y.size);
}

/** Rewrite stations.json and the positional stations.min.json the app loads. */
/** "Somewhere in the United States", not "in United States" (and not "the Czechia"). */
export const the = (name) => (/^(the |bailiwick|collectivity)/i.test(name) ? name
  : /^(united|republic|democratic|central african|dominican|philippines|netherlands|maldives|seychelles|comoros|gambia|bahamas|vatican)|(islands|republic|emirates)$/i.test(name)
    ? `the ${name}` : name);

/**
 * A station that is talk, news, sport or faith and plays no music genre at all.
 * These stay open where foreign music stations are held back (src/region.js):
 * the recordings a label licenses country by country are what the TuneIn ruling
 * was about, and a phone-in is not one. No tags, no reading: not speech; and a
 * name that says music wins over tags that say talk.
 */
const SPEECH = new Set(["news", "talk", "sports", "faith"]);
export function speech(c, country = "") {
  const k = classify({ tags: c.tags || [], title: c.title, country });
  // A music word in its name counts even when its tags say talk: "Jazz WMUK" is
  // tagged public radio and news, and plays jazz.
  return !k.genres.length && k.formats.some((f) => SPEECH.has(f))
    && !classify({ tags: [], title: c.title }).genres.length;
}

/**
 * A place with no town, as the apps call it. The catalogue says "Somewhere in
 * Germany" (every script matches on it); the apps say "Across Germany", which
 * is true of a station that is nationwide and of one that is only online, and
 * reads as a category rather than a shrug (Melton, 27 Sept: the old name made a
 * country's list look unorganized). "Online only", for stations that gave no
 * country at all, becomes "Online, no country". src/catalog.js keys off these.
 */
export const shown = (title) => title === "Online only" ? "Online, no country" : String(title).replace(/^Somewhere in /, "Across ");

export function writeBundles(full, F) {
  fs.writeFileSync(F.full, JSON.stringify(full));
  const min = {
    g: full.generated,
    p: full.places.map((p) => [shown(p.title), p.country === "Null Island" ? "" : p.country, p.geo[0], p.geo[1]]),
    // [id, title, placeIndex, secure, tags, radioBrowserUuid, lastCheckOk, explicit, speech]
    // Fixed arity now that later slots exist — optional trailing fields stop
    // working the moment anything follows them.
    c: full.channels.map((c) => [
      c.id, c.title, c.p, c.secure ? 1 : 0,
      c.tags?.length ? c.tags.join(",") : "",
      c.rbuuid || "",
      c.ok === 0 ? 0 : c.ok === 1 ? 1 : "",
      c.explicit ? 1 : "",
      speech(c, full.places[c.p]?.country) ? 1 : "",
    ]),
  };
  fs.writeFileSync(F.min, JSON.stringify(min));
}
