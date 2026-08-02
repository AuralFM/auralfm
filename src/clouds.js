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

const LAYER = "VIIRS_SNPP_CorrectedReflectance_TrueColor";
const BASE = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi";
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

let file = null;

function init(userDataPath) {
  file = path.join(userDataPath, "clouds.jpg");
}

const fresh = () => {
  try { return Date.now() - fs.statSync(file).mtimeMs < MAX_AGE_MS; }
  catch { return false; }
};

/**
 * @returns {Promise<string|null>} path to a global equirectangular JPEG
 */
async function get() {
  if (!file) return null;
  if (fresh()) return file;

  // Yesterday UTC: today's pass is often still incomplete, which means more
  // black gores than it's worth.
  const d = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const q = new URLSearchParams({
    SERVICE: "WMS", REQUEST: "GetMap", VERSION: "1.3.0",
    LAYERS: LAYER, CRS: "EPSG:4326",
    BBOX: "-90,-180,90,180", WIDTH: "2048", HEIGHT: "1024",
    FORMAT: "image/jpeg", TIME: d,
  });

  try {
    const res = await fetch(`${BASE}?${q}`, {
      headers: { "User-Agent": "GlobeFM/0.1" },
      signal: AbortSignal.timeout(45000),
    });
    if (!res.ok) throw new Error(`GIBS HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 50_000) throw new Error("GIBS returned an empty image");
    fs.writeFileSync(file, buf);
    console.log(`clouds: ${d} imagery cached (${(buf.length / 1024).toFixed(0)} KB)`);
    return file;
  } catch (err) {
    console.warn(`clouds: unavailable (${err.message}) — staying on Blue Marble`);
    return fresh() ? file : null;
  }
}

module.exports = { init, get };
