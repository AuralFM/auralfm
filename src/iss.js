/**
 * Live ISS position.
 *
 * Keyless, and genuinely live — the station moves 7.6 km/s, so it visibly
 * travels across the globe while you watch. That is the point: something
 * actually moving is the difference between a picture and a window.
 *
 * Best-effort like everything else live here: a failure just means no marker.
 */

const { cooldown } = require("./backoff");
const { onEarth } = require("./geo");

const PRIMARY = "https://api.wheretheiss.at/v1/satellites/25544";
const FALLBACK = "http://api.open-notify.org/iss-now.json";
const MIN_GAP_MS = 3000;          // the API asks for roughly this; no faster

let last = { at: 0, data: null };

// last.at only advanced on success, so MIN_GAP_MS throttled the happy path and
// nothing else: while the API was down this retried on every 4-second tick,
// paying two 6-second timeouts each time. 30s, doubling to 10 minutes.
const cool = cooldown({ min: 30_000, max: 10 * 60_000, label: "iss" });

async function get() {
  if (Date.now() - last.at < MIN_GAP_MS) return last.data;
  if (cool.blocked) return last.data;

  try {
    const res = await fetch(PRIMARY, {
      headers: { "User-Agent": "AuralFM/0.1" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();
    // Throw rather than return: a primary that answers with nonsense should
    // fall through to the fallback the same way one that does not answer does.
    if (!onEarth(Number(j.latitude), Number(j.longitude))) throw new Error("iss: bad position");
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
    cool.ok();
    return last.data;
  } catch {
    try {
      const res = await fetch(FALLBACK, { signal: AbortSignal.timeout(6000) });
      const j = await res.json();
      const lat = Number(j.iss_position?.latitude);
      const lng = Number(j.iss_position?.longitude);
      // This one is plain HTTP: open-notify serves no HTTPS, so the reply is
      // whatever the network handed back. A marker that cannot be somewhere
      // impossible is the whole of what is worth defending here.
      if (!onEarth(lat, lng)) return last.data;
      last = {
        at: Date.now(),
        data: {
          lat,
          lng,
          altKm: 420, kph: 27600, sunlit: null,
        },
      };
      cool.ok();
      return last.data;
    } catch (err) {
      // Both sources down. Keep the last known position rather than blink out,
      // and stop asking for a while.
      cool.fail(err);
      return last.data;
    }
  }
}

module.exports = { get };
