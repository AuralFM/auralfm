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
 * Writes home/assets/globe/: globe.gl.min.js, earth.jpg and places.json —
 * [lat, lng, stations, title, country] per place, coordinates to two decimals
 * (about a kilometre, plenty for a dot). home/aural.js loads them only when
 * somebody reaches for the globe, never on first paint.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const R = (...p) => path.join(ROOT, ...p);
const OUT = R("home", "assets", "globe");
const catalog = createRequire(import.meta.url)(R("src/catalog.js"));
if (!catalog.load()) { console.error("home-globe: no catalogue — run npm run crawl"); process.exit(1); }

fs.mkdirSync(OUT, { recursive: true });
fs.copyFileSync(R("src/renderer/vendor/globe.gl.min.js"), path.join(OUT, "globe.gl.min.js"));
fs.copyFileSync(R("src/renderer/vendor/earth-blue-marble.jpg"), path.join(OUT, "earth.jpg"));

const r2 = (v) => Math.round(v * 100) / 100;
const places = catalog.globePoints().map(([i, lng, lat, n]) => {
  const p = catalog.placeById ? catalog.placeById(i) : null;
  return [r2(lat), r2(lng), n, p?.title ?? "", p?.country ?? ""];
});
fs.writeFileSync(path.join(OUT, "places.json"), JSON.stringify(places));
const kb = (f) => Math.round(fs.statSync(path.join(OUT, f)).size / 1024);
console.log(`home-globe: ${places.length} places (${kb("places.json")} KB), globe.gl ${kb("globe.gl.min.js")} KB, earth ${kb("earth.jpg")} KB`);
