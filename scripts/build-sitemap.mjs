#!/usr/bin/env node
/**
 * auralfm.xyz's sitemap: every page in home/ that may be found by a search.
 *
 *   node scripts/build-sitemap.mjs          writes home/sitemap.xml
 *   node scripts/build-sitemap.mjs --check  exits 1 if it is out of date
 *
 * The homepage went public with "Disallow: /" and noindex on every page still
 * in place from its draft, so a month of search sent one visitor (7 Oct 2026).
 * A page is listed unless it says noindex itself (the 404 and the texture
 * lab). The vibe pages are generated (scripts/build-vibes.mjs), so the list is
 * read from the folder, not kept by hand; the audit runs --check.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HOME = path.join(ROOT, "home");
const ORIGIN = "https://auralfm.xyz";

function pages() {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith(".")) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name === "index.html" && !/<meta name="robots" content="[^"]*noindex/.test(fs.readFileSync(full, "utf8"))) {
        const rel = path.relative(HOME, dir).split(path.sep).join("/");
        out.push(`${ORIGIN}/${rel ? rel + "/" : ""}`);
      }
    }
  };
  walk(HOME);
  return out.sort();
}

const list = pages();
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${list.map((u) => `  <url><loc>${u}</loc></url>`).join("\n")}
</urlset>
`;

const file = path.join(HOME, "sitemap.xml");
const now = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
if (process.argv.includes("--check")) {
  if (now !== xml) { console.error("sitemap: home/sitemap.xml is out of date. Run: node scripts/build-sitemap.mjs"); process.exit(1); }
} else if (now !== xml) { fs.writeFileSync(file, xml); console.log(`sitemap: wrote home/sitemap.xml (${list.length} pages)`); }
else console.log("sitemap: unchanged");
