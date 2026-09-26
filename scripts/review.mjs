#!/usr/bin/env node
/**
 * The catalogue, put right by hand.
 *
 *   node scripts/review.mjs              write the review sheet: stations whose own
 *                                        language does not fit the country they are in
 *   node scripts/review.mjs --import F   take the filled-in sheet F into data/corrections.json
 *
 * Directories get countries wrong (1RADIO.SPACE, Russian through and through, was
 * listed in the United States). The sheet goes to the vault as
 * catalogue-review.csv: one row per station, with its place, country, language
 * and website, and three columns to fill: new country, new town, remove. Import
 * keeps only the rows with something filled in, and scripts/expand.mjs applies
 * data/corrections.json on every build, so a correction outlives the next crawl.
 *
 * A station's language is what its own homepage or radio-browser says; a
 * country's languages are GeoNames' (countryInfo.txt). English is left out of
 * the comparison: it is broadcast everywhere, and flagging it would bury the
 * real mistakes.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { sameCountryName } from "./lib/match.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const R = (...p) => path.join(ROOT, ...p);
const VAULT = "/Users/mb3/Library/Mobile Documents/iCloud~md~obsidian/Documents/MB3Vault/04 Projects/AuralFM";
const CORR = R("data/corrections.json");
const argv = process.argv.slice(2);

const csvCell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
function parseCsv(text) {
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

const loadCorrections = () => (fs.existsSync(CORR) ? JSON.parse(fs.readFileSync(CORR, "utf8")) : { stations: {} });

if (argv[0] === "--import") {
  const file = argv[1];
  if (!file || !fs.existsSync(file)) { console.error("review: --import needs the filled-in CSV"); process.exit(1); }
  const [head, ...rows] = parseCsv(fs.readFileSync(file, "utf8"));
  const col = (name) => head.findIndex((h) => h.trim().toLowerCase() === name);
  const [ID, NAME, NC, NT, RM, NOTE] = ["id", "station", "new country", "new town", "remove", "note"].map(col);
  const corr = loadCorrections();
  let n = 0;
  for (const r of rows) {
    const country = r[NC]?.trim(), town = r[NT]?.trim(), remove = /^(y|yes|x|true|1)$/i.test(r[RM]?.trim() || "");
    if (!r[ID] || !(country || town || remove)) continue;
    corr.stations[r[ID]] = { station: r[NAME], ...(remove ? { remove: true } : {}), ...(country ? { country } : {}),
      ...(town ? { town } : {}), ...(r[NOTE]?.trim() ? { note: r[NOTE].trim() } : {}), at: new Date().toISOString().slice(0, 10) };
    n++;
  }
  fs.writeFileSync(CORR, JSON.stringify(corr, null, 2) + "\n");
  console.log(`review: ${n} corrections taken in; ${Object.keys(corr.stations).length} in data/corrections.json. ` +
    "Run node scripts/expand.mjs (then profiles.mjs) to apply them.");
  process.exit(0);
}

// ── the sheet ───────────────────────────────────────────────────────────────
const require = createRequire(import.meta.url);
const profiles = require(R("src/profiles.js"));
const full = JSON.parse(fs.readFileSync(R("data/stations.json"), "utf8"));
const done = loadCorrections().stations;

// A country's languages, as ISO codes, from GeoNames.
const langsOf = new Map(), byTld = new Map();
for (const line of fs.readFileSync(R("data/geonames/countryInfo.txt"), "utf8").split("\n")) {
  if (!line || line[0] === "#") continue;
  const c = line.split("\t");
  langsOf.set(c[4], new Set((c[15] || "").split(",").map((l) => l.split("-")[0].trim()).filter(Boolean)));
  if (c[9]) byTld.set(c[9].toLowerCase(), c[4]);
}
// The country a website's own domain names (.pe, .com.pe, .de), if any; generic
// ones (.fm, .tv, .io, .me, .co) are used everywhere and name nothing.
const GENERIC = new Set([".fm", ".tv", ".io", ".me", ".co", ".am", ".ws", ".cc", ".to", ".nu", ".ly", ".la", ".gg", ".ai", ".st"]);
const tldCountry = (url) => {
  try { const t = "." + new URL(url).hostname.split(".").pop().toLowerCase(); return GENERIC.has(t) ? null : byTld.get(t) || null; }
  catch { return null; }
};
const countryLangs = (name) => { for (const [k, v] of langsOf) if (sameCountryName(k, name)) return v; return null; };

// Station languages arrive as codes ("ru", "pt-BR") or names ("russian").
const NAMES = { english: "en", russian: "ru", spanish: "es", portuguese: "pt", french: "fr", german: "de", italian: "it",
  arabic: "ar", chinese: "zh", mandarin: "zh", cantonese: "zh", japanese: "ja", korean: "ko", turkish: "tr", greek: "el",
  polish: "pl", dutch: "nl", hindi: "hi", indonesian: "id", persian: "fa", farsi: "fa", ukrainian: "uk", romanian: "ro",
  hungarian: "hu", czech: "cs", swedish: "sv", norwegian: "no", danish: "da", finnish: "fi", hebrew: "he", thai: "th",
  vietnamese: "vi", serbian: "sr", croatian: "hr", bulgarian: "bg", slovak: "sk", slovenian: "sl", albanian: "sq",
  armenian: "hy", georgian: "ka", tamil: "ta", urdu: "ur", bengali: "bn", swahili: "sw", malay: "ms", tagalog: "tl",
  filipino: "tl", catalan: "ca", basque: "eu", galician: "gl", lithuanian: "lt", latvian: "lv", estonian: "et" };
const codeOf = (l) => {
  const w = String(l || "").split(/[,/;]/)[0].trim().toLowerCase();
  if (!w) return null;
  if (/^[a-z]{2}(-[a-z]{2})?$/.test(w)) return w.slice(0, 2);
  return NAMES[w] || null;
};

const rows = [];
for (const c of full.channels) {
  if (done[c.id]) continue;
  const lang = codeOf(profiles.profile(c.id)?.lang || c.lang);
  if (!lang || lang === "en") continue;
  const langs = countryLangs(c.country);
  if (!langs || langs.has(lang)) continue;
  const place = full.places[c.p]?.title || "";
  // Where its website and its language agree on another country, say so: that is
  // the suggestion the sheet arrives with.
  const site = profiles.profile(c.id)?.website || c.website || "";
  const tld = tldCountry(site);
  const suggest = tld && !sameCountryName(tld, c.country) && langsOf.get(tld)?.has(lang) ? tld : "";
  rows.push({ c, lang, place, site, suggest, noTown: /^(Somewhere in |Online only)/.test(place) });
}
// The ones with no town first: nothing else says where they are.
rows.sort((a, b) => b.noTown - a.noTown || !!b.suggest - !!a.suggest || a.c.country.localeCompare(b.c.country));
const head = ["id", "station", "place", "country", "language", "website", "new country", "new town", "remove", "note"];
const out = [head.join(",")].concat(rows.map(({ c, lang, place, site, suggest }) =>
  [c.id, c.title, place, c.country, lang, site, suggest, "", "",
    suggest ? `suggested: its website's domain and its language both say ${suggest}` : ""].map(csvCell).join(",")));
const dest = fs.existsSync(VAULT) ? path.join(VAULT, "catalogue-review.csv") : R("data/catalogue-review.csv");
fs.writeFileSync(dest, out.join("\n") + "\n");
console.log(`review: ${rows.length} stations whose language does not fit their country ` +
  `(${rows.filter((r) => r.noTown).length} of them with no town; ${rows.filter((r) => r.suggest).length} with a suggested country) → ${dest}`);
