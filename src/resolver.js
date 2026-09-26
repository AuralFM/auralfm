/**
 * Turn a catalog channel into a playable stream URL.
 *
 * Runs in the main process because it needs to spoof browser headers for
 * radio.garden and follow redirects manually — neither is possible from a
 * sandboxed renderer.
 *
 * Three tiers, in order:
 *   1. radio.garden's listen endpoint, which 302s to the real stream.
 *   2. radio-browser.info, matched on name + country.
 *   3. Whatever worked last time, cached on disk.
 *
 * Tier 3 is what makes this survive radio.garden going down: once you've played
 * a station, it keeps playing even if both directories are unreachable.
 */

const fs = require("node:fs");
const path = require("node:path");

const RG = "https://radio.garden/api/ara/content/listen";
// Discovered at runtime from the mirror pool; de1 is only the bootstrap.
let RB_HOST = "https://de1.api.radio-browser.info";
const UA = "AuralFM/0.1";

const RG_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
                "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Accept": "*/*",
  "Referer": "https://radio.garden/",
};

let cacheFile = null;
let cache = {};

function init(userDataPath) {
  cacheFile = path.join(userDataPath, "streams.json");
  try { cache = JSON.parse(fs.readFileSync(cacheFile, "utf8")); } catch { cache = {}; }
  pickMirror();
}

/**
 * radio-browser runs a pool of mirrors and asks clients to spread load across
 * them rather than hammering one host. Failing to reach the pool is harmless —
 * we just keep the bootstrap host.
 */
async function pickMirror() {
  try {
    const res = await fetch(`${RB_HOST}/json/servers`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return;
    const names = [...new Set((await res.json()).map((s) => s.name).filter(Boolean))];
    if (!names.length) return;
    RB_HOST = `https://${names[Math.floor(Math.random() * names.length)]}`;
    console.log(`radio-browser mirror: ${RB_HOST}`);
  } catch { /* keep the bootstrap host */ }
}

/**
 * radio-browser's docs ask that this be called every time a user starts playing
 * a stream — it is how their popularity ranking stays meaningful, and we lean on
 * their data heavily. Repeat calls from one IP for one station count once a day,
 * so this is cheap. Fire-and-forget: a failure must never affect playback.
 */
function reportClick(uuid) {
  if (!uuid) return;
  fetch(`${RB_HOST}/json/url/${uuid}`, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(5000),
  }).catch(() => {});
}

function remember(id, url) {
  if (!url || cache[id] === url) return;
  cache[id] = url;
  try { fs.writeFileSync(cacheFile, JSON.stringify(cache)); } catch { /* non-fatal */ }
}

async function viaRadioGarden(id) {
  const res = await fetch(`${RG}/${id}/channel.mp3`, {
    headers: RG_HEADERS,
    redirect: "manual",
    signal: AbortSignal.timeout(8000),
  });
  // The whole point of this endpoint is the redirect; a 200 means we got a page.
  const loc = res.headers.get("location");
  if (res.status >= 300 && res.status < 400 && loc) return loc;
  return null;
}

/** A station radio-browser knows by id: its own stream, the surest answer there is. */
async function viaRadioBrowserId(uuid) {
  const res = await fetch(`${RB_HOST}/json/stations/byuuid/${encodeURIComponent(uuid)}`, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const [s] = await res.json();
  return s && s.lastcheckok !== 0 ? s.url_resolved || s.url || null : null;
}

async function viaRadioBrowser(title, country) {
  const q = new URLSearchParams({
    name: title,
    limit: "5",
    hidebroken: "true",
    order: "votes",
    reverse: "true",
  });
  const res = await fetch(`${RB_HOST}/json/stations/search?${q}`, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const list = await res.json();
  if (!Array.isArray(list) || !list.length) return null;

  // Prefer a same-country match, then anything playable.
  const sameCountry = country
    ? list.find((s) => s.country?.toLowerCase() === String(country).toLowerCase())
    : null;
  const pick = sameCountry || list[0];
  return pick?.url_resolved || pick?.url || null;
}

/**
 * @returns {Promise<{url:string, via:string}|null>}
 */
async function resolve({ id, title, country, rbuuid }) {
  const attempts = [];
  reportClick(rbuuid);        // credit the station with the play, per their docs

  // Stations found only in radio-browser (scripts/expand.mjs) have no
  // radio.garden id: their id is "rb-" + the radio-browser one.
  const rbOnly = String(id || "").startsWith("rb-");
  if (rbOnly && rbuuid) {
    try {
      const url = await viaRadioBrowserId(rbuuid);
      if (url) { remember(id, url); return { url, via: "radio-browser" }; }
      attempts.push("radio-browser id: no stream");
    } catch (err) { attempts.push(`radio-browser id: ${err.name}`); }
  }

  if (id && !rbOnly) {
    try {
      const url = await viaRadioGarden(id);
      if (url) { remember(id, url); return { url, via: "radio.garden" }; }
      attempts.push("radio.garden: no redirect");
    } catch (err) { attempts.push(`radio.garden: ${err.name}`); }
  }

  if (title) {
    try {
      const url = await viaRadioBrowser(title, country);
      if (url) { remember(id, url); return { url, via: "radio-browser" }; }
      attempts.push("radio-browser: no match");
    } catch (err) { attempts.push(`radio-browser: ${err.name}`); }
  }

  if (id && cache[id]) return { url: cache[id], via: "cache" };

  console.warn(`resolve failed for ${title || id}: ${attempts.join(", ")}`);
  return null;
}

module.exports = { init, resolve, reportClick };
