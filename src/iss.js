/**
 * Live ISS position.
 *
 * Keyless, and genuinely live — the station moves 7.6 km/s, so it visibly
 * travels across the globe while you watch. That is the point: something
 * actually moving is the difference between a picture and a window.
 *
 * Best-effort like everything else live here: a failure just means no marker.
 */

const PRIMARY = "https://api.wheretheiss.at/v1/satellites/25544";
const FALLBACK = "http://api.open-notify.org/iss-now.json";
const MIN_GAP_MS = 3000;          // the API asks for roughly this; no faster

let last = { at: 0, data: null };

async function get() {
  if (Date.now() - last.at < MIN_GAP_MS) return last.data;

  try {
    const res = await fetch(PRIMARY, {
      headers: { "User-Agent": "GlobeFM/0.1" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();
    last = {
      at: Date.now(),
      data: {
        lat: j.latitude,
        lng: j.longitude,
        altKm: j.altitude,
        kph: j.velocity,
        // "eclipsed" means it's in Earth's shadow — worth showing, it's the
        // difference between a visible pass and an invisible one.
        sunlit: j.visibility === "daylight",
      },
    };
    return last.data;
  } catch {
    try {
      const res = await fetch(FALLBACK, { signal: AbortSignal.timeout(6000) });
      const j = await res.json();
      last = {
        at: Date.now(),
        data: {
          lat: Number(j.iss_position.latitude),
          lng: Number(j.iss_position.longitude),
          altKm: 420, kph: 27600, sunlit: null,
        },
      };
      return last.data;
    } catch {
      return last.data;           // keep the last known position rather than blink out
    }
  }
}

module.exports = { get };
