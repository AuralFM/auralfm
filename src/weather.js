/**
 * Current conditions for a place, via Open-Meteo.
 *
 * Chosen because it needs no API key and no account — anyone who clones this
 * repo gets working weather without signing up for anything. Runs in main so the
 * renderer keeps its no-network guarantee.
 *
 * Weather is the one genuinely live thing in an otherwise offline-first app, so
 * it is strictly best-effort: cached, debounced by a TTL, and silent on failure.
 * Nothing about playback or browsing depends on it.
 *
 * Privacy note: this sends the *selected place's* coordinates — a city the user
 * clicked, out of a fixed public list — never the user's own location.
 */

const { cooldown } = require("./backoff");

const API = "https://api.open-meteo.com/v1/forecast";
const TTL_MS = 10 * 60 * 1000;        // conditions don't meaningfully move faster
const cache = new Map();              // placeIndex -> { at, data }

// WMO 4677 weather codes, grouped to what a one-line readout can usefully say.
const CODES = {
  0: ["Clear", "☀︎"],
  1: ["Mainly clear", "☀︎"], 2: ["Partly cloudy", "⛅︎"], 3: ["Overcast", "☁︎"],
  45: ["Fog", "≡"], 48: ["Freezing fog", "≡"],
  51: ["Light drizzle", "☂︎"], 53: ["Drizzle", "☂︎"], 55: ["Heavy drizzle", "☂︎"],
  56: ["Freezing drizzle", "☂︎"], 57: ["Freezing drizzle", "☂︎"],
  61: ["Light rain", "☂︎"], 63: ["Rain", "☂︎"], 65: ["Heavy rain", "☂︎"],
  66: ["Freezing rain", "☂︎"], 67: ["Freezing rain", "☂︎"],
  71: ["Light snow", "❄︎"], 73: ["Snow", "❄︎"], 75: ["Heavy snow", "❄︎"],
  77: ["Snow grains", "❄︎"],
  80: ["Rain showers", "☂︎"], 81: ["Rain showers", "☂︎"], 82: ["Heavy showers", "☂︎"],
  85: ["Snow showers", "❄︎"], 86: ["Snow showers", "❄︎"],
  95: ["Thunderstorm", "☈"], 96: ["Thunderstorm, hail", "☈"], 99: ["Thunderstorm, hail", "☈"],
};

const describe = (code) => CODES[code] || ["—", ""];

// Failures were never cached, so clicking around the globe during an outage
// meant one request per click.
const cool = cooldown({ min: 60_000, max: 15 * 60_000, label: "weather" });

async function get(placeIndex, lat, lon) {
  const hit = cache.get(placeIndex);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;
  if (cool.blocked) return null;

  const q = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: "temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m,relative_humidity_2m",
    timezone: "auto",
  });

  try {
    const res = await fetch(`${API}?${q}`, {
      headers: { "User-Agent": "GlobeFM/0.1" },
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) { cool.fail(`HTTP ${res.status}`); return null; }
    const j = await res.json();
    const c = j.current;
    if (!c) { cool.fail("no current conditions"); return null; }

    const [text, symbol] = describe(c.weather_code);
    const data = {
      tempC: c.temperature_2m,
      feelsC: c.apparent_temperature,
      text, symbol,
      isDay: c.is_day === 1,
      windKph: c.wind_speed_10m,
      humidity: c.relative_humidity_2m,
      // Local wall-clock at the station, derived from the offset Open-Meteo
      // resolved for those coordinates.
      localTime: c.time,
      tz: j.timezone,
      utcOffsetSeconds: j.utc_offset_seconds,
    };
    cache.set(placeIndex, { at: Date.now(), data });
    cool.ok();
    return data;
  } catch (err) {
    cool.fail(err);
    return null;                       // best-effort, never surfaced as an error
  }
}

module.exports = { get };
