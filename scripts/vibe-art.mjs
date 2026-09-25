/**
 * Line art for the ten vibes: one line weight, square ends, no fill.
 *
 * Drawn to be replaced. Melton may draw his own; these hold the place and set
 * the rules his will follow — a 200 × 120 box, strokes only, every shape given
 * pathLength="1" so CSS can draw any of them in the same way (dasharray 1,
 * dashoffset 1 → 0) whatever its real length. Each is an object from the room
 * the music is made in, not an icon of a genre: the record on the platter, the
 * sixteen steps of a drum machine, the microphone, the cathedral radio set,
 * the sound system and its echo.
 *
 * Used by scripts/build-vibes.mjs on the homepage cards, the /vibes/ index and
 * the top of each vibe's page.
 */
const P = (d) => `<path pathLength="1" d="${d}"/>`;
const C = (cx, cy, r) => `<circle pathLength="1" cx="${cx}" cy="${cy}" r="${r}"/>`;
const R = (x, y, w, h) => `<rect pathLength="1" x="${x}" y="${y}" width="${w}" height="${h}"/>`;

export const VIBE_ART = {
  // A record on the platter, the tonearm down in the groove.
  house: [C(78, 62, 50), C(78, 62, 34), C(78, 62, 12), C(78, 62, 2), P("M176 8V22L160 84L128 74"), R(170, 2, 12, 10)],
  // Sixteen steps of a drum machine, the kick on every fourth.
  techno: [
    ...[0, 1, 2, 3].map((i) => P(`M${22 + i * 48} 70V${14 + (i % 2) * 18}`)),
    ...Array.from({ length: 16 }, (_, i) => R(8 + i * 12, 88, 8, i % 4 === 0 ? 24 : 12)),
  ],
  // A sine turning square, and the knob that turns it.
  electronic: [P("M4 60C18 14 32 14 46 60S74 106 88 60V24H114V96H140V60"), C(172, 60, 20), P("M172 60L186 44"), P("M150 92H194")],
  // A microphone on its stand, the voice coming off it.
  talk: [R(84, 8, 32, 58), P("M70 44V56C70 72 84 84 100 84S130 72 130 56V44"), P("M100 84V112M78 112H122"),
    P("M146 22C156 32 156 52 146 62"), P("M160 12C176 28 176 56 160 72")],
  // A cathedral radio set: the arch, the grille, two knobs.
  otr: [P("M40 116V56C40 20 70 4 100 4S160 20 160 56V116Z"), P("M62 60V92M78 46V92M94 40V92M110 40V92M126 46V92M142 60V92"),
    C(78, 106, 5), C(122, 106, 5)],
  // An arched window and the light through it.
  faith: [P("M64 116V52C64 30 80 16 100 16S136 30 136 52V116"), P("M100 16V116M64 70H136"),
    P("M100 4V-10M70 10L60 -2M130 10L140 -2M50 34L36 28M150 34L164 28")],
  // A saxophone: the neck, the body, the bell, its keys.
  jazz: [P("M120 4L96 14L96 80C96 104 112 114 128 114S160 104 160 84L168 70"), P("M156 74L180 60"),
    C(96, 34, 4), C(96, 50, 4), C(96, 66, 4), C(110, 100, 4)],
  // A palm, the sun behind it and the water under it.
  tropical: [C(150, 36, 22), P("M70 116C74 88 72 60 82 36"), P("M82 36C60 22 40 26 26 40M82 36C98 16 120 12 136 18M82 36C70 50 62 66 60 80M82 36C100 42 112 56 116 72"),
    P("M4 116Q24 106 44 116T84 116T124 116T164 116T204 116")],
  // A sound system: the stack, its cones, the dub echo off the side.
  reggae: [R(28, 10, 70, 50), R(28, 60, 70, 56), C(63, 35, 16), C(63, 88, 22), C(63, 88, 6),
    P("M114 40C124 52 124 78 114 90"), P("M130 30C146 48 146 82 130 100"), P("M148 20C170 44 170 86 148 110")],
  // Three rooftops and the one antenna they share.
  community: [P("M10 116V84L34 64L58 84V116M74 116V76L100 54L126 76V116M142 116V84L166 64L190 84V116"),
    P("M100 54V14M88 26L100 14L112 26M84 38L100 26L116 38"), P("M34 64Q66 20 100 14Q134 20 166 64")],
};

/** One vibe's drawing as an inline SVG, or nothing if it has none. */
export function vibeSvg(id, cls = "vibe-art") {
  const parts = VIBE_ART[id];
  if (!parts) return "";
  return `<svg class="${cls}" viewBox="-6 -14 212 136" aria-hidden="true" focusable="false">${parts.join("")}</svg>`;
}
