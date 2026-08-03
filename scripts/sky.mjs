#!/usr/bin/env node
/**
 * Build the star bundle: real stars and constellation figures.
 *
 *   npm run sky
 *
 * Source is d3-celestial's published data, itself derived from the Yale Bright
 * Star Catalog and HYG — public-domain astronomy. Fetched once at build time and
 * compacted, so the app ships real sky rather than a decorative texture and
 * still contacts nothing at runtime.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "assets", "sky.json");
const SRC = "https://raw.githubusercontent.com/ofrohn/d3-celestial/master/data";

const grab = async (f) => {
  const res = await fetch(`${SRC}/${f}`, { headers: { "User-Agent": "AuralFM/0.1" } });
  if (!res.ok) throw new Error(`${f}: HTTP ${res.status}`);
  return res.json();
};

const [stars, lines, names] = await Promise.all([
  grab("stars.6.json"),
  grab("constellations.lines.json"),
  grab("constellations.json"),
]);

// [raDeg, decDeg, magnitude] — rounded, because sub-arcsecond precision is
// meaningless at the size these are drawn.
const s = stars.features
  .filter((f) => f.properties.mag <= 6.0)
  .map((f) => [
    +f.geometry.coordinates[0].toFixed(2),
    +f.geometry.coordinates[1].toFixed(2),
    +f.properties.mag.toFixed(1),
  ]);

const l = lines.features.map((f) => ({
  id: f.id,
  l: f.geometry.coordinates.map((seg) =>
    seg.map(([ra, dec]) => [+ra.toFixed(1), +dec.toFixed(1)])),
}));

/**
 * The twelve the Sun passes through, by IAU abbreviation.
 *
 * Worth stating plainly because the app will draw it: the Sun also crosses
 * Ophiuchus for about three weeks every year, and has since the boundaries were
 * fixed in 1930. The zodiac is twelve because the Babylonians wanted twelve
 * equal signs, not because there are twelve constellations on the ecliptic.
 * Ophiuchus is drawn like any other figure here and simply is not in this list.
 */
const ZODIAC = new Set(["Ari", "Tau", "Gem", "Cnc", "Leo", "Vir",
                        "Lib", "Sco", "Sgr", "Cap", "Aqr", "Psc"]);

/**
 * Names, with the label point the catalogue gives for each figure.
 *
 * Portuguese is absent from the source, so it falls back to Latin — which is
 * not a compromise: the Latin name *is* the IAU name, and it is what an atlas
 * in any language prints.
 */
const n = names.features.map((f) => {
  const p = f.properties;
  const [ra, dec] = f.geometry.coordinates;
  return {
    id: f.id,
    ra: +ra.toFixed(1),
    dec: +dec.toFixed(1),
    rank: +p.rank || 3,
    z: ZODIAC.has(f.id) ? 1 : 0,
    name: { en: p.en, es: p.es, fr: p.fr, de: p.de, pt: p.la, la: p.la },
  };
});

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ stars: s, constellations: l, names: n }));
console.log(`sky: ${s.length} stars, ${l.length} figures, ${n.length} names `
  + `(${n.filter((x) => x.z).length} zodiacal) -> assets/sky.json `
  + `(${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
