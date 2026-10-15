/**
 * Turn a catalog channel into a playable stream URL.
 *
 * Every answer is the station's own server. Nothing here asks another radio
 * directory for a redirect, and nothing pretends to be anyone's website: this
 * used to begin with radio.garden's listen endpoint, which answers only
 * requests that look like its own site, so the app sent a borrowed browser
 * User-Agent and radio.garden's Referer to get through. That is gone
 *.
 *
 * In order:
 *   1. radio-browser.info by the station's own id, when the catalogue matched
 *      one: its data is public domain and kept fresh by its checks.
 *   2. The stream we recorded ourselves (the station's profile, scripts/
 *      profiles.mjs), from contacting the station.
 *   3. Whatever worked last time on this machine, cached on disk.
 *   4. radio-browser.info, matched on name and country.
 */

const fs = require("node:fs");
const path = require("node:path");

const profiles = require("./profiles");
// Discovered at runtime from the mirror pool; de1 is only the bootstrap.
let RB_HOST = "https://de1.api.radio-browser.info";
const UA = "AuralFM/0.1";

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

  if (rbuuid) {
    try {
      const url = await viaRadioBrowserId(rbuuid);
      if (url) { remember(id, url); return { url, via: "radio-browser" }; }
      attempts.push("radio-browser id: no stream");
    } catch (err) { attempts.push(`radio-browser id: ${err.name}`); }
  }

  const own = id ? profiles.profile(id)?.stream : null;
  if (own) return { url: own, via: "own" };
  attempts.push("no stream recorded");

  if (id && cache[id]) return { url: cache[id], via: "cache" };

  if (title) {
    try {
      const url = await viaRadioBrowser(title, country);
      if (url) { remember(id, url); return { url, via: "radio-browser" }; }
      attempts.push("radio-browser: no match");
    } catch (err) { attempts.push(`radio-browser: ${err.name}`); }
  }

  console.warn(`resolve failed for ${title || id}: ${attempts.join(", ")}`);
  return null;
}

module.exports = { init, resolve, reportClick };
