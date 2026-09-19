/**
 * Aircraft in the air near wherever you are looking.
 *
 * The first instinct was to say no to this, and the density argument was right:
 * a single 100-nautical-mile circle over Los Angeles returns 313 aircraft, and
 * globally there are fifteen thousand airborne at any moment. Dropping that onto
 * a globe that was just carefully limited to 700 station dots would undo the
 * work in one commit.
 *
 * But "only near where you are looking, with a cap, behind a toggle" is a real
 * answer to that, and it is the same mechanism the station dots already use. So
 * this is deliberately narrow:
 *
 *  - Off unless the layer is on. Nothing is fetched otherwise.
 *  - One radius query centred on the view, never a global sweep.
 *  - Capped, closest first, so the number on screen is bounded no matter how
 *    busy the airspace is.
 *  - Not fetched at all when the window is hidden — a backgrounded app has no
 *    business polling anything.
 *
 * Source is adsb.lol: keyless, community-run, and fed by volunteers with
 * receivers on their roofs. That is the same arrangement as the shortwave
 * receivers, and it earns the same care — see the cooldown below, and remember
 * that Celestrak is still refusing us for exactly the carelessness this avoids.
 */

const { cooldown } = require("./backoff");

// The web version cannot read adsb.lol from a page, so it points this at its own
// proxy route (setBase); the desktop never changes it.
let API = "https://api.adsb.lol/v2";
const setBase = (base) => { API = String(base).replace(/\/+$/, ""); };
const { UA } = require("./useragent");

const MIN_GAP_MS = 12_000;      // aircraft move; a globe does not need faster
const MAX_NM = 250;             // the endpoint's own ceiling

/**
 * How many to keep, by how far out you are.
 *
 * A flat cap of 120 looked sparse zoomed in and that was not a bug in the cap —
 * it was the geometry. The endpoint will not serve beyond 250 nautical miles,
 * and over a city the visible area is far wider than that, so the aircraft
 * filled a circle in the middle of the screen with emptiness around it. Showing
 * only 120 of the ~800 inside that circle made the one populated part look thin
 * as well.
 *
 * Zoomed in, the same aircraft are spread over far more screen, so more of them
 * is legible rather than noisy. Zoomed out they collapse into one spot, and a
 * smaller number is the honest picture.
 *
 * The caller decides, because only the caller knows the zoom. An earlier version
 * inferred it from the requested span and got it backwards: the span here is the
 * horizon half-angle, which is 18 to 73 degrees across every usable zoom, so a
 * "near" test of 8 degrees never once fired.
 */
const BUDGET_MAX = 320;
const BUDGET_DEFAULT = 120;

const cool = cooldown({ min: 2 * 60_000, max: 30 * 60_000, label: "flights" });
let last = { at: 0, key: "", items: [] };

const nm = (deg) => deg * 60;   // degrees of great circle to nautical miles

/**
 * @param {number} lat  view centre
 * @param {number} lng
 * @param {number} spanDeg  angular radius of what is visible
 * @param {number} [want]    how many to keep; the caller knows the zoom
 */
async function get(lat, lng, spanDeg = 6, want = BUDGET_DEFAULT) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];

  const dist = Math.max(25, Math.min(MAX_NM, Math.round(nm(spanDeg))));
  const budget = Math.max(20, Math.min(BUDGET_MAX, Math.round(want) || BUDGET_DEFAULT));
  // Round the key so small camera drift does not defeat the cache.
  const key = `${lat.toFixed(1)},${lng.toFixed(1)},${dist},${budget}`;

  if (key === last.key && Date.now() - last.at < MIN_GAP_MS) return last.items;
  if (cool.blocked) return key === last.key ? last.items : [];

  try {
    const res = await fetch(`${API}/lat/${lat.toFixed(3)}/lon/${lng.toFixed(3)}/dist/${dist}`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    const ac = Array.isArray(body?.ac) ? body.ac : [];

    const out = [];
    for (const a of ac) {
      if (typeof a.lat !== "number" || typeof a.lon !== "number") continue;
      // alt_baro reads "ground" for aircraft that have not taken off. They are
      // not flying, and a stationary dot on a runway is not what this is for.
      const alt = typeof a.alt_baro === "number" ? a.alt_baro : null;
      if (alt === null || alt < 500) continue;
      out.push({
        id: a.hex,
        // Callsign where there is one, registration otherwise. A hex code tells
        // nobody anything.
        flight: String(a.flight || a.r || "").trim() || null,
        lat: a.lat,
        lng: a.lon,
        altFt: alt,
        kt: typeof a.gs === "number" ? Math.round(a.gs) : null,
        track: typeof a.track === "number" ? a.track : null,
        type: a.t || null,
      });
    }

    // Closest to the centre wins the budget, so zooming in reveals local traffic
    // rather than thinning out whatever arrived first.
    if (out.length > budget) {
      const rad = Math.PI / 180;
      for (const f of out) {
        const dLat = (f.lat - lat) * rad, dLng = (f.lng - lng) * rad;
        f._d = Math.sin(dLat / 2) ** 2 +
          Math.cos(lat * rad) * Math.cos(f.lat * rad) * Math.sin(dLng / 2) ** 2;
      }
      out.sort((a, b) => a._d - b._d);
      out.length = budget;
      for (const f of out) delete f._d;
    }

    last = { at: Date.now(), key, items: out };
    cool.ok();
    return out;
  } catch (err) {
    cool.fail(err);
    return key === last.key ? last.items : [];
  }
}

module.exports = { get, setBase, BUDGET_MAX, BUDGET_DEFAULT };
