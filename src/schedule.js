/**
 * What is actually on the air right now.
 *
 * A receiver used to offer 21 band centres. Tuning "49 m" put you on 6100 kHz
 * whether or not anything was transmitting there, which is why a New Zealand
 * receiver gave Melton something audible but never a station — RNZ Pacific is on
 * 11725, and only inside a window that moves twice a season.
 *
 * This turns the EiBi schedule into the question a listener actually has: at
 * this minute, in UTC, what is transmitting, in what language, aimed where?
 *
 * The data is committed rather than fetched. It changes twice a year, eibispace
 * is HTTP-only, and the app is supposed to work on a plane. `npm run schedule`
 * rebuilds it.
 */

const fs = require("node:fs");
const path = require("node:path");

let DB = null;

function load() {
  if (DB) return DB;
  try {
    DB = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "schedule.json"), "utf8"));
  } catch {
    // A missing schedule costs the station list, not the app. Bands still work.
    DB = { season: null, entries: [], lang: {}, country: {}, target: {} };
  }
  return DB;
}

const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

/**
 * Qualifiers that share the days column but are not broadcasts we should offer.
 *
 *  alt   — an alternative frequency, "not usually in use"
 *  harm  — a harmonic: the transmitter leaking onto a multiple of its frequency
 *  imod  — intermodulation, two transmitters producing a third signal that is
 *          not a station at all
 *
 * All three are real things you might hear and identify, which is what EiBi is
 * for. None of them is something to tune to on purpose.
 */
const NOT_A_BROADCAST = /^(alt|harm|imod)/i;

/**
 * Does this entry run today?
 *
 * The column holds day specs (`Mo-Fr`, `Tu,Fr`, `SaSu`, `156`) mixed with
 * qualifiers that say something else entirely (`irr`, `tent`, `Test`, `Ram`).
 * A qualifier is not a restriction to any particular day, so those run daily —
 * but the caller is told, because "irregular" is worth seeing before you wonder
 * why the frequency is empty.
 */
function runsToday(spec, dow) {
  const s = (spec || "").trim();
  if (!s) return { ok: true };
  if (NOT_A_BROADCAST.test(s)) return { ok: false };

  // 1=Monday … 7=Sunday
  if (/^[1-7]+$/.test(s)) return { ok: s.includes(String(dow === 0 ? 7 : dow)) };

  let matched = false, sawDaySpec = false;
  for (const token of s.split(/[,/]/)) {
    const t = token.trim();
    const range = /^([A-Z][a-z])-([A-Z][a-z])$/.exec(t);
    if (range) {
      const a = DAYS.indexOf(range[1]), b = DAYS.indexOf(range[2]);
      if (a < 0 || b < 0) continue;
      sawDaySpec = true;
      // `We-Mo` wraps through the weekend; walking forward handles both.
      for (let i = a; ; i = (i + 1) % 7) { if (i === dow) matched = true; if (i === b) break; }
      continue;
    }
    // `SaSu` and friends — two-letter codes run together, no separator.
    const runs = t.match(/[A-Z][a-z]/g);
    if (runs && runs.join("") === t) {
      for (const d of runs) {
        const i = DAYS.indexOf(d);
        if (i >= 0) { sawDaySpec = true; if (i === dow) matched = true; }
      }
    }
  }
  if (sawDaySpec) return { ok: matched };
  return { ok: true, note: s };            // a qualifier, not a day restriction
}

/**
 * Persistence 6 means the entry covers only part of the season, with the window
 * given as DDMM. Ignoring it is not cosmetic: on 3 August, RNZ Pacific's 0659
 * English broadcast has been off since 7 June, and its live one is at 1859.
 */
function inSeasonWindow(from, to, now) {
  if (!from || !to) return true;
  const dm = (s) => (+s.slice(2, 4)) * 100 + (+s.slice(0, 2));   // DDMM -> MMDD, comparable
  const a = dm(from), b = dm(to), t = (now.getUTCMonth() + 1) * 100 + now.getUTCDate();
  return a <= b ? (t >= a && t <= b) : (t >= a || t <= b);       // may wrap the new year
}

/** Utility traffic announces itself in the language column. */
const UTILITY = { "-CW": "cw", "-TY": "usb", "-HF": "usb", "-TS": "am", "-MX": "am" };

/**
 * The shortwave broadcasting bands, in kHz.
 *
 * EiBi tracks more than broadcasters — coastal radio, oceanic air-ground,
 * VOLMET, standard-frequency stations. Its language column flags morse and
 * telemetry but says nothing about aeronautical *voice*, so a Wellington
 * receiver led with nine channels of San Francisco Radio: aviation control,
 * genuinely listenable, and not what anyone means by a station.
 *
 * `bc-<season>.txt` looked like the classifier and is not — it carries those
 * same aero stations.
 *
 * So the distinction is taken from the frequency plan instead, which is where it
 * actually lives: these are the ranges the ITU allocates to broadcasting. A
 * signal inside one is a broadcaster; a signal outside one is a service. That is
 * a statement about spectrum, not about the compiler's intent, and it does not
 * drift when the schedule is rebuilt.
 */
const BC_BANDS = [
  [2300, 2495],   [3200, 3400],   [3900, 4000],   [4750, 5060],   // tropical + 75 m
  [5800, 6200],   [7200, 7600],   [9400, 9900],   [11600, 12100],
  [13570, 13870], [15100, 15830], [17480, 17900], [18900, 19020],
  [21450, 21850], [25670, 26100],
];
const inBroadcastBand = (khz) => BC_BANDS.some(([lo, hi]) => khz >= lo && khz <= hi);

/**
 * Mode, inferred and labelled as such.
 *
 * Shortwave broadcasting is AM and almost nothing else, so the default is safe.
 * Morse needs a narrow CW filter or it is a hiss, and digital traffic is upper
 * sideband by convention. Where EiBi states a sideband in the qualifier column,
 * that wins over any of it.
 */
function modeOf(entry) {
  const [, , , days, , , lang] = entry;
  if (/\bLSB\b/.test(days)) return "lsb";
  if (/\bUSB\b/.test(days)) return "usb";
  return UTILITY[lang] || "am";
}

/**
 * Roughly where a broadcast is aimed.
 *
 * Without this the list is useless: a Wellington receiver led with Norwegian
 * coastal stations on 1.7 MHz beamed at northern Europe, because the only
 * ordering available was frequency.
 *
 * EiBi's target codes are compositional — the README defines base regions plus
 * `N..`, `S..`, `E..`, `W..`, `C..` prefixes, so `SEu` is southern Europe and
 * `WNA` western North America. That structure is reproduced here rather than
 * enumerated, which is why a code we have never seen still resolves.
 *
 * These are continent-scale centroids and nothing more. They answer "is this
 * pointed anywhere near me", which is the question, and they would be a poor
 * basis for anything finer.
 */
const REGION = {
  Af: [0, 20],      Am: [5, -80],     As: [45, 90],     Car: [18, -75],
  Cau: [42, 45],    CIS: [55, 65],    Eu: [50, 15],     FE: [35, 120],
  In: [22, 78],     LAm: [-10, -60],  ME: [28, 45],     NAm: [45, -100],
  NAO: [45, -30],   Oc: [-20, 160],   SAm: [-15, -60],  Sib: [62, 100],
  // `ENA` and `WNA` are listed in the README as codes in their own right, but
  // they are plainly E/W + North America, and peeling only works if the stem
  // exists under the name actually used.
  NA: [45, -100],   SA: [-15, -60],   Oce: [-20, 160],
  SEA: [10, 105],   Tib: [31, 89],    Tas: [-42, 147],  ATA: [-80, 0],
  ANO: [10, -30],   PAO: [0, -160],   IND: [-20, 75],
  SEE: [43, 22],    // south-east Europe: two prefixes deep, so spelled out
};

/** Transmitter targets written as a country. Only the ones the schedule uses. */
const PLACE = {
  CHN: [35, 105],  RUS: [60, 95],   KRE: [40, 127],  TWN: [24, 121],
  INS: [-2, 118],  IRN: [32, 53],   AFG: [34, 66],   AUS: [-25, 134],
  J:   [36, 138],  B:   [-10, -53], PAK: [30, 70],   PHL: [13, 122],
  USA: [39, -98],  CUB: [22, -79],  MNG: [47, 104],  NZL: [-41, 174],
  HNG: [47, 19],   NIG: [10, 8],    ROU: [46, 25],   TUN: [34, 9],
  UKR: [49, 32],   VUT: [-16, 167], ETH: [8, 39],    PRU: [-10, -76],
  CHL: [-30, -71], MLA: [4, 102],   BGD: [24, 90],   BLR: [53, 28],
  BOL: [-17, -64], MOZ: [-18, 35],  AGL: [-12, 17],  MYA: [21, 96],
  CLN: [7, 81],    ARG: [-34, -64], BUL: [42, 25],   ISR: [31, 35],
  FIN: [64, 26],   BER: [32, -65],  NPL: [28, 84],   COD: [-2, 23],
  EGY: [27, 30],   SDN: [15, 30],   MDG: [-20, 47],  SSD: [7, 30],
  CLM: [4, -73],   VEN: [8, -66],   HOL: [52, 5],    IRL: [53, -8],
  SEY: [-4, 55],   BTN: [27, 90],   KOR: [36, 128],  I:   [42, 12],
};

/** How far each prefix moves the centre, in degrees. Continent-scale, like the table. */
const SHIFT = { N: [14, 0], S: [-14, 0], E: [0, 22], W: [0, -22], C: [0, 0] };

/**
 * Resolve a target code to a point, peeling prefixes as it goes so `WNA`
 * becomes North America shifted west and `SEA` stays Southeast Asia because the
 * base table is consulted first.
 */
function targetPoint(code, depth = 0) {
  if (!code || depth > 2) return null;
  if (REGION[code]) return REGION[code];
  if (PLACE[code]) return PLACE[code];
  const m = /^([NSEWC])(.+)$/.exec(code);
  if (!m) return null;
  const base = targetPoint(m[2], depth + 1);
  if (!base) return null;
  const [dLat, dLon] = SHIFT[m[1]];
  // Oceania shifted east lands past the date line; leaving it at 182 would put
  // the target a quarter of the globe from where the distance maths expects it.
  const lon = (((base[1] + dLon + 180) % 360) + 360) % 360 - 180;
  return [Math.max(-85, Math.min(85, base[0] + dLat)), lon];
}

/** Great-circle kilometres. */
function haversine(aLat, aLon, bLat, bLon) {
  const r = Math.PI / 180, R = 6371;
  const dLat = (bLat - aLat) * r, dLon = (bLon - aLon) * r;
  const h = Math.sin(dLat / 2) ** 2 +
            Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Everything transmitting at `when`.
 *
 * @param {Date}   when
 * @param {object} [opts]
 * @param {number} [opts.minKHz=1700]  above the medium-wave band by default; a
 *                                     shortwave receiver's own limits are wider
 *                                     than what is worth listing.
 * @param {number} [opts.maxKHz=30000]
 * @param {boolean}[opts.utility=true] include morse, time signals and digital
 */
function onAir(when = new Date(), opts = {}) {
  const { minKHz = 1700, maxKHz = 30000, utility = true, lat = null, lng = null } = opts;
  const here = Number.isFinite(lat) && Number.isFinite(lng);
  const db = load();
  const mins = when.getUTCHours() * 60 + when.getUTCMinutes();
  const dow = when.getUTCDay();
  const out = [];

  for (const e of db.entries) {
    const [khz, start, end, days, itu, station, lang, target, site, , from, to] = e;
    if (khz < minKHz || khz > maxKHz) continue;
    if (!utility && lang in UTILITY) continue;

    // 0000-2400 is EiBi's "always"; a window may also wrap midnight.
    const live = end > start ? (mins >= start && mins < end)
                             : (mins >= start || mins < end);
    if (!live) continue;

    const day = runsToday(days, dow);
    if (!day.ok) continue;
    if (!inSeasonWindow(from, to, when)) continue;

    out.push({
      khz, mode: modeOf(e), station,
      // "E,F" is a broadcast carrying both English and French, not a code.
      lang: lang ? lang.split(",").map((l) => db.lang[l] || l).join(" / ") : null,
      country: db.country[itu] || itu || null,
      target: db.target[target] || target || null,
      site: site || null,
      // Morse and telemetry say so; everything else is judged by where it sits.
      utility: lang in UTILITY || !inBroadcastBand(khz),
      note: day.note || null,
      // Distance from the receiver to the middle of the target area. Null when
      // the code does not resolve — better an unranked row than a wrong one.
      beamKm: (() => {
        if (!here) return null;
        const p = targetPoint(target);
        return p ? Math.round(haversine(lat, lng, p[0], p[1])) : null;
      })(),
      // Minutes left, so the list can say what is about to end.
      until: end > start ? end - mins : (end + 1440 - mins) % 1440,
    });
  }

  out.sort((a, b) => a.khz - b.khz);

  // The same broadcast is sometimes listed twice — a relay noted separately, or
  // one entry per transmitter site. On a tuning list they are the same row.
  const seen = new Set();
  return out.filter((e) => {
    const k = `${e.khz}|${e.station}|${e.mode}`;
    return seen.has(k) ? false : (seen.add(k), true);
  });
}

/**
 * Which half of the day a frequency belongs to.
 *
 * `outlook()` scores a band using the operator's rule of thumb and needs to know
 * whether the band is a day or a night band. The 21 hand-written bands carried
 * that as a field; nine thousand schedule entries cannot, so it is derived from
 * the frequency by the same rule the table was written with.
 */
const whenFor = (khz) => (khz < 8000 ? "night" : khz <= 11000 ? "any" : "day");

const meta = () => ({ season: load().season, built: load().built, count: load().entries.length });

module.exports = { onAir, meta, runsToday, inSeasonWindow, modeOf, whenFor,
                   targetPoint, haversine, inBroadcastBand };
