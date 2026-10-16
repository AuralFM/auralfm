#!/usr/bin/env node
/**
 * Take the catalogue from its own repository.
 *
 *   node scripts/catalogue.mjs           copy the list, the profiles and the reading code here
 *   node scripts/catalogue.mjs --check   exit 1 if the reading code here is not the catalogue's
 *   node scripts/catalogue.mjs --force   take a list even if it is much smaller than the one here
 *   node scripts/catalogue.mjs --release [tag]
 *                                        take a release of AuralFM/catalogue instead (the latest,
 *                                        or that tag): its list and profiles, and the reading code
 *                                        at that tag. Needs gh, signed in. No checkout or build here.
 *
 * The station list, the taxonomy and the scripts that build them lived in this
 * repository until 12 Oct 2026. They are AuralFM/catalogue now, checked out
 * beside this one (AURALFM_CATALOGUE, or ../auralfm-catalogue). The app does
 * not read that folder as it runs: it carries copies, so a checkout, a
 * worktree and a packaged build each still work on their own.
 *
 *   src/catalog.js, src/taxonomy.js, src/region.js    tracked here; edited THERE
 *   data/stations.min.json, data/stations.json        not tracked, as before
 *   data/profiles/                                    not tracked, as before
 *
 * A list much smaller than the one already here is refused. The catalogue's
 * first build step alone writes only AuralFM's own 36,266 stations, and this
 * repository's README once said to run exactly that; a third of the globe
 * would have gone dark on the next publish.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import os from "node:os";
import zlib from "node:zlib";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CAT = process.env.AURALFM_CATALOGUE || path.resolve(ROOT, "..", "auralfm-catalogue");
const CODE = ["src/catalog.js", "src/taxonomy.js", "src/region.js"];
const DATA = ["data/stations.min.json", "data/stations.json"];
const check = process.argv.includes("--check"), force = process.argv.includes("--force");
const rel = process.argv.indexOf("--release");
const releaseTag = rel > 0 && process.argv[rel + 1] && !process.argv[rel + 1].startsWith("--") ? process.argv[rel + 1] : null;

/**
 * A release of the catalogue (the weekly refresh publishes one), unpacked into
 * a temporary folder laid out like a checkout, so everything below reads it the
 * same way.
 */
function fromRelease() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "auralfm-catalogue-"));
  const gh = (...a) => execFileSync("gh", a, { stdio: ["ignore", "pipe", "inherit"], maxBuffer: 64 * 1024 * 1024 }).toString();
  const tag = releaseTag || JSON.parse(gh("release", "view", "-R", "AuralFM/catalogue", "--json", "tagName")).tagName;
  gh("release", "download", tag, "-R", "AuralFM/catalogue", "--dir", tmp,
     "--pattern", "stations.min.json", "--pattern", "stations.json.gz", "--pattern", "profiles.tar.gz");
  fs.mkdirSync(path.join(tmp, "data"));
  fs.mkdirSync(path.join(tmp, "src"));
  fs.renameSync(path.join(tmp, "stations.min.json"), path.join(tmp, "data/stations.min.json"));
  fs.writeFileSync(path.join(tmp, "data/stations.json"), zlib.gunzipSync(fs.readFileSync(path.join(tmp, "stations.json.gz"))));
  execFileSync("tar", ["-xzf", path.join(tmp, "profiles.tar.gz"), "-C", path.join(tmp, "data")]);
  // The reading code as it was at that release, so list and code agree.
  for (const f of CODE) fs.writeFileSync(path.join(tmp, f), gh("api", `repos/AuralFM/catalogue/contents/${f}?ref=${tag}`, "-H", "Accept: application/vnd.github.raw"));
  console.log(`catalogue: release ${tag}`);
  return tmp;
}
const SRC = rel > 0 && !check ? fromRelease() : CAT;
const here = (f) => path.join(ROOT, f), there = (f) => path.join(SRC, f);

if (!fs.existsSync(there("src/catalog.js"))) {
  console.error(`catalogue: cannot find the catalogue repo at ${CAT} — set AURALFM_CATALOGUE`);
  process.exit(check ? 2 : 1);     // 2: not checkable here, which the audit reports as a skip
}

if (check) {
  const differ = CODE.filter((f) => !fs.existsSync(here(f)) || !fs.readFileSync(here(f)).equals(fs.readFileSync(there(f))));
  if (differ.length) { console.log(`catalogue: ${differ.join(", ")} here ${differ.length === 1 ? "is" : "are"} not the catalogue's — edit there, then npm run catalogue`); process.exit(1); }
  process.exit(0);
}

const count = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")).c.length; } catch { return 0; } };
if (!fs.existsSync(there("data/stations.min.json"))) { console.error("catalogue: the catalogue repo has no built list (npm run rebuild there)"); process.exit(1); }
const have = count(here("data/stations.min.json")), coming = count(there("data/stations.min.json"));
if (have && coming < have * 0.9 && !force) {
  console.error(`catalogue: the list there has ${coming.toLocaleString("en-US")} stations and the one here has ${have.toLocaleString("en-US")}. Not taken. ` +
    "(base.mjs alone writes only AuralFM's own stations; run the whole build there, or --force if this is meant.)");
  process.exit(1);
}

for (const f of [...CODE, ...DATA]) if (fs.existsSync(there(f))) fs.copyFileSync(there(f), here(f));
const from = there("data/profiles"), to = here("data/profiles");
let profiles = 0;
if (fs.existsSync(from)) {
  fs.mkdirSync(to, { recursive: true });
  const names = new Set(fs.readdirSync(from).filter((f) => f.endsWith(".json")));
  for (const f of fs.readdirSync(to)) if (f.endsWith(".json") && !names.has(f)) fs.rmSync(path.join(to, f));
  for (const f of names) { fs.copyFileSync(path.join(from, f), path.join(to, f)); profiles++; }
}
console.log(`catalogue: ${coming.toLocaleString("en-US")} stations, ${profiles} profile files and ${CODE.length} files of code taken from ${SRC === CAT ? path.relative(ROOT, CAT) : "the release"}`);
