#!/usr/bin/env node
/**
 * The vibe icons, brought to one line weight and one frame.
 *
 *   node scripts/build-vibe-icons.mjs          writes art/vibes/<id>.svg from art/vibes/originals/
 *   node scripts/build-vibe-icons.mjs --check  exits 1 if any is out of date
 *
 * Melton's icons (September 2026) come from different sets: viewBoxes from
 * 64 × 80 to 128 × 160, and lines drawn as filled outlines between 2.4% and
 * 4.7% of the icon's size. Filled outlines have no stroke width to set, so:
 *
 *   - each icon's content box and line weight were measured once by rendering
 *     it and taking the median ridge of its distance transform (the measuring
 *     script is in the commit that added this); the numbers are
 *     art/vibes/weights.json, "units" being the line in the icon's own units;
 *   - an icon lighter than TARGET gets an outline stroke of the difference, in
 *     the same colour, which thickens every line evenly (round joins, like the
 *     drawings themselves);
 *   - an icon heavier than TARGET would have to be drawn smaller inside its
 *     frame, since a filled line cannot be thinned; only Community was, and at
 *     70% of the others' size it read as a lesser vibe, so it is redrawn (below);
 *   - every icon is centred in a square frame of the same proportions, so at
 *     one display size they share one visual size and one line weight.
 *
 * The output uses currentColor, so CSS colours them. A new icon: drop it in
 * originals/, measure it (see weights.json), add its entry, and rebuild.
 *
 * HAND are the exceptions, drawn by hand as strokes at the same TARGET weight
 * and rounded ends, in the same square frame, and not generated here: community,
 * after Melton's drawing (kept in originals/ for reference), because its line
 * was too heavy to match. (House was one too until Melton's turntable came.)
 * The five vibes added on 5 Oct 2026 (hiphop, rnb, soul, rock, afro) are drawn
 * the same way and have no original: they stand in until Melton draws his own.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const R = (...p) => path.join(ROOT, ...p);
const check = process.argv.includes("--check");

/** Line weight as a share of the icon's longest side: the set's middle. */
export const TARGET = 0.034;
/** Space around the content inside the square frame, as a share of it. */
const PAD = 0.06;

const weights = JSON.parse(fs.readFileSync(R("art/vibes/weights.json"), "utf8"));
const n = (v) => +v.toFixed(3);

function normalize(id, svg) {
  const w = weights[id];
  if (!w) throw new Error(`vibe-icons: no measured weight for ${id} in art/vibes/weights.json`);
  const [bx, by, bw, bh] = w.box;
  const long = Math.max(bw, bh);
  const relative = w.units / long;
  const stroke = relative < TARGET ? (TARGET - relative) * long : 0;
  const scale = relative > TARGET ? relative / TARGET : 1; // >1 means the frame grows around it
  const half = (long / 2) * scale * (1 + PAD * 2) + stroke / 2;
  const cx = bx + bw / 2, cy = by + bh / 2;
  const inner = svg
    .replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "")
    .replace(/<defs>[\s\S]*?<\/defs>/g, "")
    .replace(/<g clip-path="[^"]*">/g, "<g>")
    .replace(/fill="(black|#000000|#000)"/g, 'fill="currentColor"')
    .replace(/\s+\n/g, "\n").trim();
  const strokeAttrs = stroke ? ` stroke="currentColor" stroke-width="${n(stroke)}" stroke-linejoin="round" stroke-linecap="round"` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${n(cx - half)} ${n(cy - half)} ${n(half * 2)} ${n(half * 2)}">`
    + `<g${strokeAttrs}>${inner}</g></svg>\n`;
}

const HAND = new Set(["community"]);

let stale = 0;
for (const file of fs.readdirSync(R("art/vibes/originals")).filter((f) => f.endsWith(".svg"))) {
  const id = path.basename(file, ".svg");
  if (HAND.has(id)) continue;
  const want = normalize(id, fs.readFileSync(R("art/vibes/originals", file), "utf8"));
  const out = R("art/vibes", `${id}.svg`);
  const now = fs.existsSync(out) ? fs.readFileSync(out, "utf8") : "";
  if (now === want) continue;
  if (check) { stale++; console.log(`vibe-icons: art/vibes/${id}.svg is out of date — run node scripts/build-vibe-icons.mjs`); }
  else { fs.writeFileSync(out, want); console.log(`vibe-icons: wrote art/vibes/${id}.svg`); }
}
if (check && stale) process.exit(1);
