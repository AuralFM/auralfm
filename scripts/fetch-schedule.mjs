/**
 * Build the shortwave schedule from EiBi.
 *
 * Until now a receiver offered 21 band centre frequencies. Tuning "49 m" parked
 * you on 6100 kHz whether or not anything was transmitting there, which is why
 * a New Zealand receiver produced something audible but never a station: RNZ
 * Pacific is on 11725, and only between 0659 and 1058 UTC.
 *
 * EiBi is the shortwave listener's schedule — 9,000-odd broadcasts a season,
 * compiled by Eike Bierwirth from HFCC registrations, station schedules and
 * monitoring reports. The conditions of use are as permissive as they come:
 * "any person is absolutely free to download, use, copy, or distribute these
 * files or to use them within third-party software."
 *
 * The output is committed, not fetched at runtime. The schedule changes twice a
 * year, the site is HTTP-only, and the app is meant to work on a plane.
 *
 *   node scripts/fetch-schedule.mjs          # current season, guessed from the date
 *   node scripts/fetch-schedule.mjs a26      # a specific season
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const R = (p) => path.join(path.dirname(fileURLToPath(import.meta.url)), "..", p);

// Contactable, per the etiquette we owe every volunteer service.
const UA = "AuralFM/0.1 (+https://auralfm.xyz; hello@auralfm.xyz)";

/**
 * Seasons follow the broadcasters' own clock change: A (summer) from the last
 * Sunday in March, B (winter) from the last Sunday in October. Close enough to
 * pick a filename; the file itself carries the authoritative dates.
 */
function currentSeason(now = new Date()) {
  const y = now.getUTCFullYear();
  const lastSun = (month) => {
    const d = new Date(Date.UTC(y, month + 1, 0));
    d.setUTCDate(d.getUTCDate() - d.getUTCDay());
    return d;
  };
  const summer = now >= lastSun(2) && now < lastSun(9);
  const yy = String((summer ? y : now.getUTCMonth() >= 9 ? y : y - 1) % 100).padStart(2, "0");
  return `${summer ? "a" : "b"}${yy}`;
}

const season = (process.argv[2] || currentSeason()).toLowerCase();

async function get(url) {
  const res = await fetch(url, { headers: { "user-agent": UA } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  // EiBi is ISO-8859-1, and station names carry accents that become mojibake if
  // this is assumed to be UTF-8.
  return new TextDecoder("iso-8859-1").decode(await res.arrayBuffer());
}

/**
 * The README carries the code tables. Parsing them beats hand-copying 300
 * languages, and it keeps the names in step with the schedule they describe.
 */
function codes(readme, heading, stop) {
  const start = readme.indexOf(heading);
  if (start < 0) return {};
  const end = stop ? readme.indexOf(stop, start + heading.length) : readme.length;
  const out = {};
  for (const line of readme.slice(start, end < 0 ? undefined : end).split("\n")) {
    // "  EG    English (340m)   [eng]" — code, then name, then parenthetical noise
    const m = /^\s{2,}(\S{1,4})\s{2,}(.+?)\s*$/.exec(line);
    if (!m) continue;
    const name = m[2]
      .replace(/\s*\[[^\]]*\]\s*$/, "")   // trailing ISO 639-3 reference
      .replace(/^[-\s]+/, "")              // target areas are written "- Oceania"
      .split(":")[0]                       // "English: UK (60m), USA (225m)" — the head is the name
      .replace(/\s*\([^)]*\)/g, "")        // speaker counts
      .trim();
    if (name && !out[m[1]]) out[m[1]] = name;
  }
  return out;
}

console.log(`season ${season.toUpperCase()}`);
const csv = await get(`http://www.eibispace.de/dx/sked-${season}.csv`);
const readme = await get("http://www.eibispace.de/dx/README.TXT");

const lang = codes(readme, "I) Language codes.", "II) Country codes.");
const country = codes(readme, "II) Country codes.", "III) Target-area codes.");
const target = codes(readme, "III) Target-area codes.", "IV) Transmitter-site codes.");

const rows = [];
let skipped = 0;
for (const raw of csv.split(/\r?\n/).slice(1)) {
  const c = raw.split(";");
  if (c.length < 11) { if (raw.trim()) skipped++; continue; }
  const khz = parseFloat(c[0]);
  const t = /^(\d{4})-(\d{4})$/.exec(c[1].trim());
  if (!Number.isFinite(khz) || !t) { skipped++; continue; }
  const pers = parseInt(c[8], 10) || 0;
  // 8 means the compiler has marked it dead. It is in the CSV so old logs can
  // still be identified, which is not what we are doing.
  if (pers === 8 || pers === 98) continue;

  rows.push([
    khz,
    +t[1].slice(0, 2) * 60 + +t[1].slice(2),      // start, minutes UTC
    +t[2].slice(0, 2) * 60 + +t[2].slice(2),      // end
    c[2].trim(),                                   // days / qualifier
    c[3].trim(),                                   // ITU country
    c[4].trim(),                                   // station
    c[5].trim(),                                   // language
    c[6].trim(),                                   // target area
    c[7].trim(),                                   // transmitter site
    pers,
    // Persistence 6 means "only part of this season", with the window in these
    // two columns as DDMM. RNZ Pacific has two of them; dropping the dates would
    // have offered a broadcast that ended on 7 June as though it were on air.
    pers === 6 || pers === 96 ? c[9].trim() : "",
    pers === 6 || pers === 96 ? c[10].trim().replace(/\[.*$/, "") : "",
  ]);
}

/**
 * Ship only the codes the schedule actually uses. The README documents every
 * code EiBi has ever assigned; this season uses about a third of them, and the
 * rest is weight in an app that loads the file at startup. Compound codes like
 * "E,S" (English and Spanish) are split so both halves survive the filter.
 */
function keepUsed(table, used) {
  const want = new Set();
  for (const v of used) for (const part of String(v).split(",")) if (part) want.add(part);
  return Object.fromEntries(Object.entries(table).filter(([k]) => want.has(k)));
}

const out = {
  season: season.toUpperCase(),
  built: new Date().toISOString().slice(0, 10),
  source: "EiBi (eibispace.de), Eike Bierwirth — free to use, copy and distribute",
  lang: keepUsed(lang, rows.map((r) => r[6])),
  country: keepUsed(country, rows.map((r) => r[4])),
  target: keepUsed(target, rows.map((r) => r[7])),
  entries: rows,
};

const file = R("data/schedule.json");
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(out));
const kb = (fs.statSync(file).size / 1024).toFixed(0);
console.log(`${rows.length} broadcasts, ${Object.keys(out.lang).length} languages, ` +
            `${Object.keys(out.country).length} countries → data/schedule.json (${kb} kB)` +
            (skipped ? `, ${skipped} unparseable rows skipped` : ""));
