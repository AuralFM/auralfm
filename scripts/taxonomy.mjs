#!/usr/bin/env node
/**
 * What the taxonomy (src/taxonomy.js) makes of the catalogue.
 *
 *   node scripts/taxonomy.mjs            every category: stations, places, how many only by name
 *   node scripts/taxonomy.mjs --gaps     the commonest tags that no genre, format or mood takes up
 *   node scripts/taxonomy.mjs --show ID  twenty stations in one category, to eyeball the rule
 *
 * Read-only: it writes nothing. The taxonomy is argued over here first; the
 * catalogue build takes it up once the categories hold.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const T = require(path.join(ROOT, "src/taxonomy.js"));
const { channels } = JSON.parse(fs.readFileSync(path.join(ROOT, "data/stations.json"), "utf8"));

const rows = channels.map((c) => ({ c, k: T.classify({ tags: c.tags || [], title: c.title, country: c.country }) }));
const arg = (n) => { const i = process.argv.indexOf(n); return i < 0 ? null : process.argv[i + 1] || ""; };

if (process.argv.includes("--gaps")) {
  const n = {};
  for (const { c, k } of rows) {
    if (!c.tags || k.genres.length || k.formats.length || k.moods.length) continue;
    for (const t of c.tags) n[T.norm(t)] = (n[T.norm(t)] || 0) + 1;
  }
  const untouched = rows.filter(({ c, k }) => c.tags && !k.genres.length && !k.formats.length && !k.moods.length).length;
  console.log(`${untouched} tagged stations fall in no category. Their commonest tags:\n`);
  console.log(Object.entries(n).sort((a, b) => b[1] - a[1]).slice(0, 80).map(([t, k]) => `${t} ${k}`).join(" · "));
  process.exit(0);
}

const show = arg("--show");
if (show !== null) {
  const hit = rows.filter(({ k }) => [...k.genres, ...k.scenes, ...k.formats, ...k.moods].includes(show));
  console.log(`${show}: ${hit.length} stations. A sample:\n`);
  for (const { c, k } of hit.filter((_, i) => i % Math.max(1, Math.floor(hit.length / 20)) === 0).slice(0, 20))
    console.log(`  ${c.title} · ${c.country} · [${(c.tags || []).join(", ")}]${k.from === "name" ? " (by name)" : ""}`);
  process.exit(0);
}

const pad = (s, n) => String(s).padEnd(n), num = (s, n) => String(s).padStart(n);
for (const [axis, list, key] of [["GENRES", T.GENRES, "genres"], ["SCENES", T.SCENES, "scenes"],
  ["FORMATS", T.FORMATS, "formats"], ["MOODS", T.MOODS, "moods"]]) {
  console.log(`\n${axis}${" ".repeat(24 - axis.length)}stations   places  by name`);
  for (const cat of list) {
    const hit = rows.filter(({ k }) => k[key].includes(cat.id));
    const places = new Set(hit.map(({ c }) => c.place)).size;
    const byName = key === "genres" ? hit.filter(({ k }) => k.from === "name").length : "";
    console.log(`  ${pad(cat.name, 22)}${num(hit.length, 8)}${num(places, 9)}${num(byName, 9)}`);
  }
}
const any = rows.filter(({ k }) => k.genres.length || k.scenes.length || k.formats.length || k.moods.length).length;
const genre = rows.filter(({ k }) => k.genres.length).length;
console.log(`\n${channels.length} stations: ${genre} with a genre (${(100 * genre / channels.length).toFixed(1)}%), ` +
  `${any} in at least one category (${(100 * any / channels.length).toFixed(1)}%).`);
