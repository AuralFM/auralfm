/**
 * Orbiting objects with their real orbital paths.
 *
 * Celestrak publishes TLEs (two-line element sets) keylessly. A TLE is not a
 * position — it is a set of orbital elements — so turning it into lat/lon needs
 * SGP4 propagation, which is what satellite.js does. Running it forward over one
 * period gives the actual orbit track rather than a trail of where something has
 * already been.
 *
 * Propagation runs in main: it is pure maths, and the renderer has no node
 * modules by design.
 */

const fs = require("node:fs");
const path = require("node:path");
const satellite = require("satellite.js");

const TLE_URL = "https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle";
/**
 * Second source, because the first one can and does say no.
 *
 * Celestrak rate-limits by IP and, once it has decided against you, stops
 * answering entirely — during development every request from this machine timed
 * out for a day, homepage included, and the satellite names simply vanished from
 * the globe with no way to get them back.
 *
 * SatNOGS is a volunteer network of amateur ground stations that publishes the
 * same elements keylessly. It fits this project better than the fallback role
 * suggests: a few hundred people with antennas in their gardens, tracking
 * spacecraft and giving the data away, which is the same shape as the shortwave
 * receivers.
 *
 * It returns every satellite it knows about rather than a curated group, so the
 * crewed stations and their visiting vehicles are picked out by name.
 */
const SATNOGS_URL = "https://db.satnogs.org/api/tle/?format=json";
const STATIONS_RE = /^(ISS|CSS|PROGRESS|SOYUZ|CREW DRAGON|CARGO DRAGON|DRAGON|CYGNUS|TIANZHOU|SHENZHOU)\b/i;
const TLE_TTL = 12 * 60 * 60 * 1000;      // elements decay; a day is the useful life
const STALE_MAX = 7 * 24 * 60 * 60 * 1000; // past a week, SGP4 drifts too far to draw
const MAX_OBJECTS = 8;                     // enough to feel inhabited, few enough to read

/**
 * Celestrak is a free service run on donated bandwidth, and it rate-limits by
 * IP. This module previously earned that: on any failure it left fetchedAt at 0,
 * so every 30-second tick tried again, each attempt costing a 15-second timeout.
 * A single transient error turned into a permanent request loop, and Celestrak
 * duly stopped answering us at all.
 *
 * Three rules now, and they are the whole reason this code is shaped like this:
 *
 *  1. Back off on failure, exponentially, and cap it high. TLEs are published
 *     roughly daily; there is no version of "urgent" here.
 *  2. Persist to disk. The TTL was in memory only, so every launch refetched
 *     something that changes once a day.
 *  3. Serve stale elements rather than nothing. A day-old TLE still puts the
 *     ISS within a few kilometres of the truth, which is far finer than a dot
 *     on this globe. Silence is the worse answer.
 */
const UA = "GlobeFM/0.1 (+https://github.com/meltonbell3/globefm)";
const BACKOFF_MIN = 5 * 60 * 1000;
const BACKOFF_MAX = 6 * 60 * 60 * 1000;

let tles = [];          // { name, l1, l2 }
let fetchedAt = 0;
let file = null;
let nextTry = 0;
let backoff = BACKOFF_MIN;

/** @param {string} userDataPath where to cache elements between launches */
function init(userDataPath) {
  file = path.join(userDataPath, "tles.json");
  try {
    const saved = JSON.parse(fs.readFileSync(file, "utf8"));
    if (Array.isArray(saved.tles) && saved.tles.length) {
      tles = saved.tles;
      fetchedAt = saved.at || 0;
    }
  } catch { /* first run, or the cache was corrupt — refetch */ }
}

const flush = () => {
  if (!file) return;
  try { fs.writeFileSync(file, JSON.stringify({ at: fetchedAt, tles })); } catch {}
};

async function loadTLEs() {
  const age = Date.now() - fetchedAt;
  if (tles.length && age < TLE_TTL) return tles;
  // Backing off: hand back whatever we have rather than nothing.
  if (Date.now() < nextTry) return age < STALE_MAX ? tles : [];

  try {
    const res = await fetch(TLE_URL, {
      // Celestrak asks clients to identify themselves and offer a way to be
      // contacted if they misbehave. That is a fair request to honour.
      headers: { "User-Agent": "GlobeFM/0.1 (+https://github.com/meltonbell3/globefm)" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const lines = (await res.text()).split(/\r?\n/).filter((l) => l.trim());
    const out = [];
    for (let i = 0; i + 2 < lines.length; i += 3) {
      if (!lines[i + 1].startsWith("1 ") || !lines[i + 2].startsWith("2 ")) continue;
      out.push({ name: lines[i].trim(), l1: lines[i + 1], l2: lines[i + 2] });
    }
    if (!out.length) throw new Error("no elements in response");
    tles = out.slice(0, MAX_OBJECTS);
    fetchedAt = Date.now();
    backoff = BACKOFF_MIN;
    nextTry = 0;
    flush();
    console.log(`satellites: ${tles.length} objects tracked`);
  } catch (err) {
    // Celestrak said no. Ask the volunteers.
    try {
      const alt = await fromSatnogs();
      if (alt.length) {
        tles = alt;
        fetchedAt = Date.now();
        backoff = BACKOFF_MIN;
        nextTry = 0;
        flush();
        console.log(`satellites: ${tles.length} objects tracked (via SatNOGS)`);
        return tles;
      }
    } catch { /* both sources down; fall through to the backoff below */ }

    nextTry = Date.now() + backoff;
    console.warn(
      `satellites: TLEs unavailable (${err.message}) — ` +
      `next attempt in ${Math.round(backoff / 60000)} min` +
      (tles.length ? `, using elements ${Math.round(age / 3600000)}h old` : "")
    );
    backoff = Math.min(backoff * 2, BACKOFF_MAX);
  }
  return Date.now() - fetchedAt < STALE_MAX ? tles : [];
}

/** SatNOGS publishes 3-line TLEs with the leading "0 " name marker still on. */
async function fromSatnogs() {
  const res = await fetch(SATNOGS_URL, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`SatNOGS HTTP ${res.status}`);
  const rows = await res.json();
  if (!Array.isArray(rows)) throw new Error("SatNOGS: unexpected shape");

  const out = [];
  const seen = new Set();
  for (const r of rows) {
    const name = String(r.tle0 || "").replace(/^0\s+/, "").trim();
    if (!name || !STATIONS_RE.test(name)) continue;
    if (!String(r.tle1 || "").startsWith("1 ") || !String(r.tle2 || "").startsWith("2 ")) continue;
    // Elements older than a week propagate too far off to draw.
    if (r.updated && Date.now() - Date.parse(r.updated) > STALE_MAX) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    out.push({ name, l1: r.tle1, l2: r.tle2 });
  }
  return out.slice(0, MAX_OBJECTS);
}

const toDeg = (rad) => (rad * 180) / Math.PI;

function positionAt(rec, when) {
  const pv = satellite.propagate(rec, when);
  if (!pv?.position) return null;
  const gmst = satellite.gstime(when);
  const g = satellite.eciToGeodetic(pv.position, gmst);
  let lng = toDeg(g.longitude);
  lng = ((lng + 180) % 360 + 360) % 360 - 180;
  return { lat: toDeg(g.latitude), lng, altKm: g.height };
}

/**
 * @returns {Promise<Array<{name, lat, lng, altKm, path: number[][][]}>>}
 */
async function get() {
  const list = await loadTLEs();
  const now = new Date();
  const out = [];

  for (const t of list) {
    let rec;
    try { rec = satellite.twoline2satrec(t.l1, t.l2); } catch { continue; }
    const here = positionAt(rec, now);
    if (!here || !Number.isFinite(here.lat)) continue;

    // One full revolution ahead, sampled. no is mean motion in rad/min.
    const periodMin = (2 * Math.PI) / rec.no;
    const steps = 90;
    const segs = [];
    let run = [];
    for (let i = 0; i <= steps; i++) {
      const when = new Date(now.getTime() + (periodMin * 60000 * i) / steps);
      const p = positionAt(rec, when);
      if (!p || !Number.isFinite(p.lat)) continue;
      // Split at the antimeridian, or the path draws straight across the map.
      if (run.length && Math.abs(p.lng - run[run.length - 1][1]) > 180) {
        if (run.length > 1) segs.push(run);
        run = [];
      }
      run.push([p.lat, p.lng]);
    }
    if (run.length > 1) segs.push(run);

    out.push({ name: t.name, ...here, path: segs });
  }

  /**
   * The stations group lists every docked module separately — ISS (ZARYA),
   * POISK and ISS (NAUKA) are one spacecraft at one position — plus orbital
   * debris. Drawing them as distinct objects is just clutter on top of itself.
   * Keep one marker per physical location, and drop debris entirely.
   */
  const seen = new Set();
  return out
    .filter((s) => !/\bDEB\b|DEBRIS|R\/B/i.test(s.name))
    .filter((s) => {
      const key = `${s.lat.toFixed(1)}|${s.lng.toFixed(1)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((s) => ({ ...s, name: s.name.replace(/\s*\([^)]*\)/, "").trim() }));
}

module.exports = { get, init };
