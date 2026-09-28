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
 *
 * It also stamps every page's links to aural.css and aural.js with a version
 * (?v=<first 10 hex of their sha256>). here.now caches both for an hour and
 * serves a stale copy for a day while it revalidates, so without the stamp a
 * visitor could get a new page styled and scripted by the old files — which
 * is what "the studies are not working" turned out to be.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const R = (...p) => path.join(ROOT, ...p);
const check = process.argv.includes("--check");

const SHARED = [
  "aural.css", "aural.js", "404.html",
  "assets/favicon.ico", "assets/favicon.svg", "assets/apple-touch-icon.png", "assets/share.jpg", "assets/live.json", "assets/desktop.webp", "assets/phone-explore.webp",
  // The patterns the shared stylesheet draws with.
  "assets/patterns/halftone-waves.png", "assets/patterns/halftone-column.png", "assets/patterns/waves-a.png",
  ...fs.readdirSync(R("home/assets/fonts")).map((f) => `assets/fonts/${f}`),
];
const SITES = ["site", "docs-site"];

const STAMP = crypto.createHash("sha256")
  .update(fs.readFileSync(R("home/aural.css"))).update(fs.readFileSync(R("home/aural.js")))
  .digest("hex").slice(0, 10);
/**
 * The theme someone chose (aural.js, the half moon), on <html> before the first
 * paint. Without it a light-theme reader got a flash of onyx on every page.
 * Written into the head of every page that uses the shared stylesheet.
 */
const THEME = `<script>try{var t=localStorage.getItem("auralfm.theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}</script>`;
const stampLinks = (html) => {
  let out = html.replace(/((?:href|src)="(?:\.\.\/)*aural\.(?:css|js))(?:\?v=[0-9a-f]*)?"/g, `$1?v=${STAMP}"`);
  if (/aural\.css/.test(out) && !out.includes(THEME)) {
    out = out.replace(/<script>try\{var t=localStorage\.getItem\("auralfm\.theme"\)[^<]*<\/script>\n?/, "");
    out = out.replace(/(<meta charset="utf-8">\n?)/i, `$1${THEME}\n`);
  }
  return out;
};
const pages = (dir) => fs.readdirSync(R(dir), { recursive: true })
  .filter((f) => String(f).endsWith(".html") && !String(f).includes("node_modules"))
  .map((f) => path.join(dir, String(f)));

let drift = 0;
for (const page of ["home", ...SITES].flatMap(pages)) {
  const now = fs.readFileSync(R(page), "utf8");
  const want = stampLinks(now);
  if (now === want) continue;
  if (check) { drift++; console.log(`sites: ${page} links an old aural.css/aural.js — run node scripts/sync-sites.mjs`); }
  else fs.writeFileSync(R(page), want);
}
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
