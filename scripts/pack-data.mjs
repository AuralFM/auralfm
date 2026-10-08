#!/usr/bin/env node
/**
 * Gzip the catalogue for the packaged Mac app.
 *
 *   node scripts/pack-data.mjs          writes data/packed/
 *   node scripts/pack-data.mjs --check  exits 1 if data/packed/ is missing or behind
 *
 * The app was 293 MB, 245 of it Electron. Of the rest, 38 MB was JSON: what
 * each station says about itself (31) and the station list (7). Gzipped they
 * are about 13. src/packed.js reads either form, so a checkout runs from the
 * plain files and only `npm run dist` needs this.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const DATA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "data");
const OUT = path.join(DATA, "packed");
const check = process.argv.includes("--check");

const files = ["stations.min.json"];
if (fs.existsSync(path.join(DATA, "profiles")))
  for (const f of fs.readdirSync(path.join(DATA, "profiles")).filter((f) => f.endsWith(".json")).sort()) files.push(`profiles/${f}`);

let plain = 0, packed = 0, behind = [];
for (const rel of files) {
  const src = path.join(DATA, rel), out = path.join(OUT, rel + ".gz");
  if (!fs.existsSync(src)) { console.error(`pack: data/${rel} is missing — run the catalogue first`); process.exit(1); }
  const raw = fs.readFileSync(src);
  plain += raw.length;
  const same = fs.existsSync(out) && zlib.gunzipSync(fs.readFileSync(out)).equals(raw);
  if (check) { if (!same) behind.push(rel); continue; }
  if (!same) { fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, zlib.gzipSync(raw, { level: 9 })); }
  packed += fs.statSync(out).size;
}
if (check) {
  if (behind.length) { console.error(`pack: data/packed/ is behind for ${behind.length} file(s), e.g. ${behind[0]}. Run: node scripts/pack-data.mjs`); process.exit(1); }
} else {
  // A shard the catalogue no longer writes must not ride along in the app.
  const keep = new Set(files.map((f) => f + ".gz"));
  const walk = (dir, rel = "") => fs.existsSync(dir) && fs.readdirSync(dir, { withFileTypes: true }).forEach((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name), rel + e.name + "/") : keep.has(rel + e.name) || fs.rmSync(path.join(dir, e.name)));
  walk(OUT);
  const mb = (n) => (n / 1048576).toFixed(1);
  console.log(`pack: ${files.length} files, ${mb(plain)} MB as ${mb(packed)} MB in data/packed/`);
}
