/**
 * The vibe icons, inlined so CSS can colour them.
 *
 * Melton's icons (art/vibes/originals/), brought to one line weight and one
 * square frame by scripts/build-vibe-icons.mjs; Deep & house is drawn by hand
 * to the same weight (art/vibes/house.svg). They replaced placeholder line
 * drawings on 25 September 2026.
 *
 * Used by scripts/build-vibes.mjs on the homepage cards, the /vibes/ index and
 * the top of each vibe's page.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ART = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "art", "vibes");

/** One vibe's icon as an inline SVG, or nothing if it has none. */
export function vibeSvg(id, cls = "vibe-art") {
  const file = path.join(ART, `${id}.svg`);
  if (!fs.existsSync(file)) return "";
  return fs.readFileSync(file, "utf8").trim()
    .replace(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/, `<svg class="${cls}" aria-hidden="true" focusable="false"`);
}
