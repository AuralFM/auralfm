/**
 * Space weather — why a band is open, rather than a guess about it.
 *
 * The shortwave band list is currently ordered by whether the receiver is in
 * daylight. That is a real rule of thumb and it is only half the story: whether
 * a frequency bounces off the ionosphere or sails through it into space depends
 * on how hard the sun is driving the ionosphere, and whether the whole thing is
 * being disturbed by a geomagnetic storm.
 *
 * NOAA's Space Weather Prediction Center publishes both, keyless.
 *
 * A note on endpoints, because this cost a mistake worth recording: the obvious
 * one, `json/f107_cm_flux.json`, is **not current** — when this was written it
 * was six weeks behind. `products/summary/10cm-flux.json` is the live figure.
 * Both return plausible numbers, which is exactly what makes the stale one
 * dangerous.
 */

const { cooldown } = require("./backoff");

const FLUX = "https://services.swpc.noaa.gov/products/summary/10cm-flux.json";
const KP = "https://services.swpc.noaa.gov/json/planetary_k_index_1m.json";
const SCALES = "https://services.swpc.noaa.gov/products/noaa-scales.json";
const UA = "AuralFM/0.1 (+https://github.com/meltonbell3/auralfm)";

// The sun does not change fast. The K-index updates every minute but only
// meaningfully every three hours, and flux is a daily figure.
const TTL_MS = 20 * 60_000;

const cool = cooldown({ min: 10 * 60_000, max: 2 * 60 * 60_000, label: "space" });
let cache = { at: 0, data: null };

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

async function json(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * @returns {Promise<{flux:number|null, kp:number|null, kpEstimated:number|null,
 *                    scales:{R:number,S:number,G:number}|null, at:number}|null>}
 */
async function get() {
  if (cache.data && Date.now() - cache.at < TTL_MS) return cache.data;
  if (cool.blocked) return cache.data;

  try {
    // Each is optional: a missing flux should not cost us the K-index.
    const [fluxRes, kpRes, scalesRes] = await Promise.allSettled([
      json(FLUX), json(KP), json(SCALES),
    ]);

    let flux = null;
    if (fluxRes.status === "fulfilled" && Array.isArray(fluxRes.value) && fluxRes.value.length) {
      flux = num(fluxRes.value[fluxRes.value.length - 1].flux);
    }

    let kp = null, kpEstimated = null;
    if (kpRes.status === "fulfilled" && Array.isArray(kpRes.value) && kpRes.value.length) {
      const last = kpRes.value[kpRes.value.length - 1];
      kp = num(last.kp_index);
      kpEstimated = num(last.estimated_kp);
    }

    let scales = null;
    if (scalesRes.status === "fulfilled" && scalesRes.value && scalesRes.value["0"]) {
      const s = scalesRes.value["0"];
      scales = { R: num(s.R?.Scale) ?? 0, S: num(s.S?.Scale) ?? 0, G: num(s.G?.Scale) ?? 0 };
    }

    if (flux == null && kp == null) throw new Error("no usable readings");

    cache = { at: Date.now(), data: { flux, kp, kpEstimated, scales, at: Date.now() } };
    cool.ok();
    return cache.data;
  } catch (err) {
    cool.fail(err);
    return cache.data;
  }
}

module.exports = { get };
