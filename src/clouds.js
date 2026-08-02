/**
 * Near-real-time satellite imagery for the globe.
 *
 * NASA GIBS serves VIIRS true-colour as a single global equirectangular image,
 * keyless. That image *is* the weather — real cloud systems as the satellite saw
 * them, cyclones and all — rather than a decorative cloud texture.
 *
 * VIIRS is a polar orbiter, so a narrow wedge is missing each day where the
 * swaths don't quite meet. Those pixels come back pure black, which the shader
 * treats as "no data" and falls back to the Blue Marble base — so a gap looks
 * like clear sky rather than a hole punched in the Earth.
 *
 * Cached to userData for a day. Failure is silent: no image simply means the
 * globe stays on Blue Marble, exactly as before.
 */

const fs = require("node:fs");
const path = require("node:path");

const BASE = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi";

/**
 * Two tiers, composited in the renderer:
 *
 *  base  VIIRS true colour — one global pass a day. Complete coverage, ~24h old.
 *  live  GOES-East / GOES-West GeoColor — refreshed every 10 minutes, but
 *        geostationary, so each only sees its own hemisphere.
 *
 * GIBS carries no Himawari or Meteosat GeoColor, so geostationary alone would
 * leave Europe, Africa and Asia blank. Hence the hybrid: current where it can
 * be, complete everywhere.
 */
const LAYERS = {
  base:  { layer: "VIIRS_SNPP_CorrectedReflectance_TrueColor", fmt: "jpeg", ttl: 12 * 3600e3, dated: true },
  goesE: { layer: "GOES-East_ABI_GeoColor", fmt: "png", ttl: 10 * 60e3, dated: false },
  goesW: { layer: "GOES-West_ABI_GeoColor", fmt: "png", ttl: 10 * 60e3, dated: false },
};

let dir = null;

function init(userDataPath) { dir = userDataPath; }

const pathFor = (k) => path.join(dir, `sky-${k}.${LAYERS[k].fmt}`);
const fresh = (k) => {
  try { return Date.now() - fs.statSync(pathFor(k)).mtimeMs < LAYERS[k].ttl; }
  catch { return false; }
};

async function fetchLayer(key) {
  const spec = LAYERS[key];
  const q = new URLSearchParams({
    SERVICE: "WMS", REQUEST: "GetMap", VERSION: "1.3.0",
    LAYERS: spec.layer, CRS: "EPSG:4326",
    BBOX: "-90,-180,90,180", WIDTH: "2048", HEIGHT: "1024",
    FORMAT: `image/${spec.fmt}`,
  });
  if (spec.fmt === "png") q.set("TRANSPARENT", "TRUE");
  // Dated layers need an explicit day; for the geostationary ones, omitting TIME
  // returns the newest frame. (TIME=current returns a blank image — it is not
  // the alias it looks like.)
  if (spec.dated) q.set("TIME", new Date(Date.now() - 864e5).toISOString().slice(0, 10));

  const res = await fetch(`${BASE}?${q}`, {
    headers: { "User-Agent": "GlobeFM/0.1" },
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 50_000) throw new Error("empty image");
  fs.writeFileSync(pathFor(key), buf);
  return buf.length;
}

/**
 * @returns {Promise<{base:string|null, goesE:string|null, goesW:string|null, at:number}>}
 */
async function get() {
  if (!dir) return { base: null, goesE: null, goesW: null, at: 0 };

  await Promise.all(Object.keys(LAYERS).map(async (k) => {
    if (fresh(k)) return;
    try {
      const n = await fetchLayer(k);
      console.log(`sky: ${k} refreshed (${(n / 1024).toFixed(0)} KB)`);
    } catch (err) {
      // Individually optional — a missing geostationary tile just means that
      // hemisphere falls back to the daily pass.
      console.warn(`sky: ${k} unavailable (${err.message})`);
    }
  }));

  const out = { at: Date.now() };
  for (const k of Object.keys(LAYERS)) {
    out[k] = fs.existsSync(pathFor(k)) ? pathFor(k) : null;
  }
  return out;
}

module.exports = { init, get };
