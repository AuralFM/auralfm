// Copy runtime libs out of node_modules into the renderer so pages can load them
// as same-origin scripts. Keeps the CSP at script-src 'self' instead of having to
// widen it for a path outside the renderer directory.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "src", "renderer", "vendor");
const LIBS = [
  ["globe.gl", "dist/globe.gl.min.js"],
  // Earth textures ship inside three-globe (a globe.gl dependency), so the real-
  // world globe needs no download and the app stays offline-first.
  ["three-globe", "example/img/earth-blue-marble.jpg"],
  ["three-globe", "example/img/earth-night.jpg"],
  ["three-globe", "example/img/earth-topology.png"],
];

fs.mkdirSync(OUT, { recursive: true });
for (const [pkg, rel] of LIBS) {
  const src = path.join(ROOT, "node_modules", pkg, rel);
  if (!fs.existsSync(src)) { console.warn(`vendor: ${pkg} not installed — run npm install`); continue; }
  const dest = path.join(OUT, path.basename(rel));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log(`vendor: ${path.basename(rel)}  ${(fs.statSync(dest).size / 1024).toFixed(0)} KB`);
}
