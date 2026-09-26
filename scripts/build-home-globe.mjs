#!/usr/bin/env node
/**
 * The homepage's live globe: the files it loads, from the app's own.
 *
 *   node scripts/build-home-globe.mjs
 *
 * The hero on auralfm.xyz is a real globe you can spin and zoom, with every
 * place's station dot on it; a tap on one opens that place in the app. No
 * audio — the site shows the world, listen.auralfm.xyz plays it. It uses the
 * same globe.gl build and the same Earth texture the app vendors, and the
 * places come from the same catalogue, so what you see before you open the
 * app is what you find inside it.
 *
 * Also writes home/assets/live.json, for the bar at the top of every page: a
 * few dozen cities with their time zones and real station names from the
 * catalogue, so it can say "04:12 in Lagos · Cool FM" rather than a time with
 * nothing to say what it is.
 *
 * Writes home/assets/globe/: globe.gl.min.js, earth.jpg and places.json —
 * [lat, lng, stations, title, country] per place, coordinates to two decimals
 * (about a kilometre, plenty for a dot). home/aural.js loads them only when
 * somebody reaches for the globe, never on first paint.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const R = (...p) => path.join(ROOT, ...p);
const OUT = R("home", "assets", "globe");
const catalog = createRequire(import.meta.url)(R("src/catalog.js"));
if (!catalog.load()) { console.error("home-globe: no catalogue — run npm run catalogue"); process.exit(1); }

fs.mkdirSync(OUT, { recursive: true });
fs.copyFileSync(R("src/renderer/vendor/globe.gl.min.js"), path.join(OUT, "globe.gl.min.js"));
fs.copyFileSync(R("src/renderer/vendor/earth-blue-marble.jpg"), path.join(OUT, "earth.jpg"));
// The app's Earth is 4096px and 1.4 MB, sized for zooming to a city. The hero
// shows a whole hemisphere at most, so it gets 2048px — a third of the weight,
// and the difference between the globe arriving first and arriving last.
if (process.platform === "darwin")
  spawnSync("sips", ["-Z", "2048", "-s", "formatOptions", "70", path.join(OUT, "earth.jpg")], { stdio: "ignore" });

const r2 = (v) => Math.round(v * 100) / 100;
const places = catalog.globePoints().map(([i, lng, lat, n]) => {
  const p = catalog.placeById ? catalog.placeById(i) : null;
  return [r2(lat), r2(lng), n, p?.title ?? "", p?.country ?? ""];
});
fs.writeFileSync(path.join(OUT, "places.json"), JSON.stringify(places));
const kb = (f) => Math.round(fs.statSync(path.join(OUT, f)).size / 1024);
console.log(`home-globe: ${places.length} places (${kb("places.json")} KB), globe.gl ${kb("globe.gl.min.js")} KB, earth ${kb("earth.jpg")} KB`);

// ── the live bar's cities ───────────────────────────────────────────────────
// Hand-picked for reach — most of them outside the places radio apps start
// from — each with the IANA zone its clocks keep (not the sun's time: this is
// the time people there would tell you). Stations are the place's own, those
// radio-browser last saw working first, a handful each.
const CITIES = [
  ["Lagos", "Nigeria", "Africa/Lagos"], ["Accra", "Ghana", "Africa/Accra"], ["Nairobi", "Kenya", "Africa/Nairobi"],
  ["Kampala", "Uganda", "Africa/Kampala"], ["Kinshasa", "Democratic Republic of the Congo", "Africa/Kinshasa"],
  ["Johannesburg", "South Africa", "Africa/Johannesburg"], ["Dakar", "Senegal", "Africa/Dakar"],
  ["Addis Ababa", "Ethiopia", "Africa/Addis_Ababa"], ["Casablanca", "Morocco", "Africa/Casablanca"], ["Cairo", "Egypt", "Africa/Cairo"],
  ["Mexico City", "Mexico", "America/Mexico_City"], ["Bogotá", "Colombia", "America/Bogota"], ["Lima", "Peru", "America/Lima"],
  ["São Paulo SP", "Brazil", "America/Sao_Paulo"], ["Buenos Aires", "Argentina", "America/Argentina/Buenos_Aires"],
  ["Havana", "Cuba", "America/Havana"], ["Kingston", "Jamaica", "America/Jamaica"], ["Port-au-Prince", "Haiti", "America/Port-au-Prince"],
  ["Port of Spain", "Trinidad and Tobago", "America/Port_of_Spain"], ["Chicago IL", "United States", "America/Chicago"],
  ["Detroit MI", "United States", "America/Detroit"], ["New Orleans LA", "United States", "America/Chicago"],
  ["Tbilisi", "Georgia", "Asia/Tbilisi"], ["Beirut", "Lebanon", "Asia/Beirut"], ["Karachi", "Pakistan", "Asia/Karachi"],
  ["Mumbai", "India", "Asia/Kolkata"], ["Dhaka", "Bangladesh", "Asia/Dhaka"], ["Jakarta", "Indonesia", "Asia/Jakarta"],
  ["Manila", "Philippines", "Asia/Manila"], ["Tokyo", "Japan", "Asia/Tokyo"], ["Seoul", "South Korea", "Asia/Seoul"],
  ["Ulaanbaatar", "Mongolia", "Asia/Ulaanbaatar"], ["Reykjavík", "Iceland", "Atlantic/Reykjavik"], ["Warsaw", "Poland", "Europe/Warsaw"],
  ["Kyiv", "Ukraine", "Europe/Kyiv"],
];
const live = [];
for (const [title, country, tz] of CITIES) {
  const hit = catalog.placeSearch(title, 8);
  const p = (hit.places || hit).find((q) => q.title === title && q.country === country);
  if (!p) { console.warn(`home-globe: live bar skips ${title}, ${country} — not in the catalogue`); continue; }
  const ch = catalog.placeChannels(p.i).channels;
  const names = [...ch.filter((c) => c.ok !== false), ...ch.filter((c) => c.ok === false)]
    .map((c) => c.title.trim()).filter((t) => t && t.length <= 40).slice(0, 12);
  if (names.length) live.push([tz, title.replace(/ [A-Z]{2}$/, ""), title, country, names]);
}
fs.writeFileSync(R("home", "assets", "live.json"), JSON.stringify(live));
console.log(`home-globe: live bar — ${live.length} cities`);
