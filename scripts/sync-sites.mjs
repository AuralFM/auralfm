#!/usr/bin/env node
/**
 * One design across the three sites.
 *
 *   node scripts/sync-sites.mjs          copies the shared files out of home/
 *   node scripts/sync-sites.mjs --check  exits 1 if a copy has drifted
 *
 * auralfm.xyz (home/), the Journal (site/) and the docs (docs-site/) are three
 * here.now sites, each published as its own folder, so none can reach into
 * another for a stylesheet. home/ is the source; this copies its stylesheet,
 * script, fonts and icons into the other two, and the audit's --check fails
 * the build if either has been edited by hand or left behind.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const R = (...p) => path.join(ROOT, ...p);
const check = process.argv.includes("--check");

const SHARED = [
  "aural.css", "aural.js",
  "assets/favicon.ico", "assets/favicon.svg", "assets/apple-touch-icon.png", "assets/share.jpg",
  ...fs.readdirSync(R("home/assets/fonts")).map((f) => `assets/fonts/${f}`),
];
const SITES = ["site", "docs-site"];

let drift = 0;
for (const site of SITES) {
  for (const rel of SHARED) {
    const from = R("home", rel), to = R(site, rel);
    const want = fs.readFileSync(from);
    if (check) {
      if (!fs.existsSync(to) || !want.equals(fs.readFileSync(to))) { drift++; console.log(`sites: ${site}/${rel} differs from home/${rel}`); }
    } else {
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.writeFileSync(to, want);
    }
  }
  if (!check) console.log(`sites: ${site}/ has home/'s ${SHARED.length} shared files`);
}
if (check && drift) { console.log("sites: run node scripts/sync-sites.mjs"); process.exit(1); }
