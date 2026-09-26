#!/usr/bin/env node
/**
 * The catalogue's own stations: kept in the repository, rebuilt from there.
 *
 *   node scripts/base.mjs --save   data/stations.json → data/catalogue.json
 *   node scripts/base.mjs          data/catalogue.json → data/stations.json (the start of a build)
 *
 * Everything radio-browser lists can be fetched again (scripts/tags.mjs,
 * scripts/expand.mjs), and what stations say about themselves can be asked
 * again (scripts/enrich.mjs). The stations AuralFM confirmed itself cannot: that
 * list exists nowhere else. So it is tracked — data/catalogue.json, one station
 * a line so a change is a readable diff — and every build starts from it.
 *
 * Kept per station: id, name, place, website, its own stream, how it was
 * confirmed (scripts/own.mjs) and whether it is explicit. Tags, radio-browser
 * ids and on-air status are left out: every build works them out afresh.
 * Places are GeoNames towns (CC BY 4.0) or "Somewhere in <country>".
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeBundles } from "./lib/match.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const F = { full: path.join(ROOT, "data/stations.json"), min: path.join(ROOT, "data/stations.min.json"),
  base: path.join(ROOT, "data/catalogue.json") };

if (process.argv.includes("--save")) {
  const full = JSON.parse(fs.readFileSync(F.full, "utf8"));
  const own = full.channels.filter((c) => c.src !== "rb");
  const used = [...new Set(own.map((c) => c.p))].sort((a, b) => a - b);
  const at = new Map(used.map((p, i) => [p, i]));
  const places = used.map((i) => { const p = full.places[i]; return [p.id, p.title, p.country, +p.geo[0].toFixed(5), +p.geo[1].toFixed(5), p.region || ""]; });
  const stations = own.map((c) => [c.id, c.title, at.get(c.p), c.website || "", c.url || "", c.from || "", c.explicit ? 1 : 0])
    .sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const line = (x) => JSON.stringify(x);
  fs.writeFileSync(F.base, `{"generated":${line(full.generated)},\n"places":[\n${places.map(line).join(",\n")}\n],\n` +
    `"stations":[\n${stations.map(line).join(",\n")}\n]}\n`);
  console.log(`base: saved ${stations.length} stations in ${places.length} places to data/catalogue.json`);
  process.exit(0);
}

if (!fs.existsSync(F.base)) { console.error("base: no data/catalogue.json"); process.exit(1); }
const base = JSON.parse(fs.readFileSync(F.base, "utf8"));
const places = base.places.map(([id, title, country, lon, lat, region]) =>
  ({ id, title, country, geo: [lon, lat], ...(region ? { region } : {}), src: "gn" }));
const hostOf = (u) => { try { return new URL(u).hostname.split(".").slice(-2).join("."); } catch { return ""; } };
const channels = base.stations.map(([id, title, p, website, url, from, explicit]) => ({
  id, title, place: places[p].id, p, country: places[p].country,
  ...(website ? { website } : {}), secure: url.startsWith("https://"), stream: hostOf(url), url,
  ...(from ? { from } : {}), ...(explicit ? { explicit: true } : {}),
}));
writeBundles({ generated: new Date().toISOString(), places, channels }, F);
console.log(`base: ${channels.length} stations in ${places.length} places → data/stations.json; next scripts/tags.mjs`);
