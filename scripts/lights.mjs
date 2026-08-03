#!/usr/bin/env node
/**
 * Fetch NASA's Black Marble and build the city-lights texture.
 *
 *   npm run lights
 *
 * The globe already showed city lights — three-globe vendors NASA's own night
 * imagery, so this was never a missing layer. What it was, was small: 4096x2048
 * for the whole Earth, which is about 10 km a pixel at the equator. Zoomed to a
 * country it is a smear, and northern Italy resolves as one blob rather than the
 * Po valley.
 *
 * The source here is the same mission at its published resolution — 13500x6750,
 * roughly 3 km a pixel — downsampled to 8192x4096, which is the largest the
 * integrated GPUs this app targets can take without the texture becoming the
 * heaviest thing in the scene.
 *
 * Grayscale on purpose. It is a *mask* of where light is, tinted in the shader,
 * rather than a picture with a colour decision baked into it. That also makes it
 * compress far better than the colour version.
 *
 * Public domain: NASA Earth Observatory imagery carries no copyright.
 * <https://earthobservatory.nasa.gov/features/BlackMarble>
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "src", "renderer", "vendor");
const OUT = path.join(OUT_DIR, "earth-lights.jpg");
const TMP = path.join(ROOT, "node_modules", ".cache", "blackmarble.tif");

const SRC = "https://eoimages.gsfc.nasa.gov/images/imagerecords/144000/144897/" +
            "BlackMarble_2016_3km_gray_geo.tif";
const UA = "AuralFM/0.1 (+https://github.com/meltonbell/globefm; meltonbell@icloud.com)";

const WIDTH = 8192;

if (fs.existsSync(OUT)) {
  console.log(`lights: earth-lights.jpg already built (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
  process.exit(0);
}

// Cached across builds: it is 6.8 MB and it changes never.
if (!fs.existsSync(TMP)) {
  fs.mkdirSync(path.dirname(TMP), { recursive: true });
  console.log("lights: fetching Black Marble (6.8 MB)…");
  const res = await fetch(SRC, { headers: { "user-agent": UA } });
  if (!res.ok) {
    // Not fatal. The globe falls back to the vendored night texture, which is
    // the same imagery and merely smaller.
    console.warn(`lights: HTTP ${res.status} — skipping, globe will use earth-night.jpg`);
    process.exit(0);
  }
  fs.writeFileSync(TMP, Buffer.from(await res.arrayBuffer()));
}

fs.mkdirSync(OUT_DIR, { recursive: true });
// sips ships with macOS, which is the only platform this app builds for, and it
// beats adding an image-processing dependency for one resize a year.
execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "72",
                      "-Z", String(WIDTH), TMP, "--out", OUT], { stdio: "ignore" });

const dims = execFileSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", OUT], { encoding: "utf8" });
const w = /pixelWidth: (\d+)/.exec(dims)?.[1];
const h = /pixelHeight: (\d+)/.exec(dims)?.[1];
console.log(`lights: ${w}x${h}, ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB -> src/renderer/vendor/earth-lights.jpg`);
