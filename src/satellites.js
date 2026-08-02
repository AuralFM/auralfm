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

const satellite = require("satellite.js");

const TLE_URL = "https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle";
const TLE_TTL = 12 * 60 * 60 * 1000;      // elements decay; a day is the useful life
const MAX_OBJECTS = 8;                     // enough to feel inhabited, few enough to read

let tles = [];          // { name, l1, l2 }
let fetchedAt = 0;

async function loadTLEs() {
  if (tles.length && Date.now() - fetchedAt < TLE_TTL) return tles;
  try {
    const res = await fetch(TLE_URL, {
      headers: { "User-Agent": "GlobeFM/0.1" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const lines = (await res.text()).split(/\r?\n/).filter((l) => l.trim());
    const out = [];
    for (let i = 0; i + 2 < lines.length; i += 3) {
      if (!lines[i + 1].startsWith("1 ") || !lines[i + 2].startsWith("2 ")) continue;
      out.push({ name: lines[i].trim(), l1: lines[i + 1], l2: lines[i + 2] });
    }
    if (out.length) { tles = out.slice(0, MAX_OBJECTS); fetchedAt = Date.now(); }
    console.log(`satellites: ${tles.length} objects tracked`);
  } catch (err) {
    console.warn(`satellites: TLEs unavailable (${err.message})`);
  }
  return tles;
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

module.exports = { get };
