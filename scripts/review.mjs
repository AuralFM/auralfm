#!/usr/bin/env node
/**
 * The hand-placing sheet: stations the catalogue could not give a town.
 *
 *   node scripts/review.mjs export          writes data/review/unplaced.csv (+ one per big country)
 *   node scripts/review.mjs import <file>   takes the rows you filled in back into data/places-by-hand.csv
 *
 * About 14,000 stations sit at "Across <country>" because nothing in their
 * name or tags says where they are. A program has done what it safely can
 * (scripts/place.mjs); the rest needs a person who can look a station up
 * (Melton, 4 Oct: a spreadsheet to work through over time).
 *
 * The round trip:
 *   1. export, and open the CSV in Google Sheets (File → Import → Upload).
 *   2. For a station you can place, type its town in the `town` column
 *      (and `region` when two towns share the name: "Springfield", "Illinois").
 *      A village too small for the gazetteer (under 1,000 people) also needs
 *      `lat` and `lon`: right-click it in Google Maps and copy the two numbers.
 *      Leave the rest alone. Rows without a town are ignored.
 *   3. File → Download → CSV, then `import` that file here.
 *   4. `npm run catalogue` (or just `node scripts/place.mjs`) places them:
 *      place.mjs reads data/places-by-hand.csv before it guesses anything,
 *      and says which rows it could not find in the gazetteer.
 *
 * data/places-by-hand.csv is kept in git: it is work done by hand, and the
 * one part of the catalogue that cannot be rebuilt by running a script.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const R = (...p) => path.join(ROOT, ...p);
const BY_HAND = R("data/places-by-hand.csv");
const HEAD = ["id", "title", "country", "town", "region", "lat", "lon", "note", "tags", "website", "stream_host", "listen"];

const cell = (v) => { const s = String(v ?? ""); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
// A spreadsheet runs a cell that starts with = + - @ as a formula: station
// names come from strangers, so those are written as text.
const safe = (v) => { const s = String(v ?? ""); return /^[=+\-@\t]/.test(s) ? `'${s}` : s; };
const line = (row) => row.map((v) => cell(safe(v))).join(",");

export function parseCsv(text) {
  const rows = []; let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cur); cur = ""; if (row.some((c) => c !== "")) rows.push(row); row = []; }
    else cur += ch;
  }
  row.push(cur); if (row.some((c) => c !== "")) rows.push(row);
  if (!rows.length) return [];
  const head = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? "").replace(/^'/, "").trim()])));
}

/** The rows placed by hand so far: id → { town, region, country, note }. */
export function byHand() {
  if (!fs.existsSync(BY_HAND)) return new Map();
  return new Map(parseCsv(fs.readFileSync(BY_HAND, "utf8")).filter((r) => r.id && r.town).map((r) => [r.id, r]));
}

const [cmd, file] = process.argv.slice(2);
if (cmd === "export") {
  const full = JSON.parse(fs.readFileSync(R("data/stations.json"), "utf8"));
  const done = byHand();
  const nowhere = (t) => /^(Somewhere in |Online only$)/.test(t) && !t.includes(",");
  const rows = full.channels
    .filter((c) => nowhere(full.places[c.p].title))
    .map((c) => {
      const d = done.get(c.id);
      return [c.id, c.title, c.country === "Null Island" ? "" : c.country, d?.town || "", d?.region || "", d?.lat || "", d?.lon || "", d?.note || "",
        (c.tags || []).join(" · "), c.website || "", c.stream || "", `https://listen.auralfm.xyz/?station=${c.id}`];
    })
    .sort((a, b) => a[2].localeCompare(b[2]) || a[1].localeCompare(b[1]));
  fs.mkdirSync(R("data/review"), { recursive: true });
  const write = (name, list) => fs.writeFileSync(R("data/review", name), [HEAD.join(","), ...list.map(line)].join("\n") + "\n");
  write("unplaced.csv", rows);
  const counts = new Map();
  for (const r of rows) counts.set(r[2], (counts.get(r[2]) || 0) + 1);
  const big = [...counts].filter(([c, n]) => c && n >= 400).sort((a, b) => b[1] - a[1]);
  for (const [country] of big) write(`unplaced-${country.toLowerCase().replace(/[^a-z]+/g, "-")}.csv`, rows.filter((r) => r[2] === country));
  console.log(`review: ${rows.length} stations with no town → data/review/unplaced.csv`);
  console.log(`  one sheet each for ${big.map(([c, n]) => `${c} (${n})`).join(", ")}`);
  console.log(`  placed by hand so far: ${done.size}`);
} else if (cmd === "import" && file) {
  const incoming = parseCsv(fs.readFileSync(path.resolve(file), "utf8")).filter((r) => r.id && r.town);
  const all = byHand();
  let added = 0, changed = 0;
  for (const r of incoming) {
    const was = all.get(r.id);
    if (!was) added++; else if (was.town !== r.town || (was.region || "") !== (r.region || "")) changed++;
    all.set(r.id, { id: r.id, title: r.title || was?.title || "", country: r.country || was?.country || "", town: r.town, region: r.region || "", lat: r.lat || "", lon: r.lon || "", note: r.note || "" });
  }
  const cols = ["id", "title", "country", "town", "region", "lat", "lon", "note"];
  const out = [...all.values()].sort((a, b) => (a.country || "").localeCompare(b.country || "") || (a.title || "").localeCompare(b.title || ""));
  fs.writeFileSync(BY_HAND, [cols.join(","), ...out.map((r) => line(cols.map((k) => r[k])))].join("\n") + "\n");
  console.log(`review: ${incoming.length} rows with a town in ${path.basename(file)} — ${added} new, ${changed} changed; ${all.size} placed by hand in all`);
  console.log("  now run: node scripts/place.mjs   (or npm run catalogue)");
} else if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log("usage: node scripts/review.mjs export | import <file.csv>");
  process.exit(1);
}
