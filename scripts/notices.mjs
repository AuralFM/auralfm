#!/usr/bin/env node
/**
 * Generate THIRD-PARTY-NOTICES.md.
 *
 *   npm run notices        # write it
 *   npm run notices -- --check   # fail if it is missing or stale
 *
 * MIT is about as permissive as a licence gets and it still says: *"The above
 * copyright notice and this permission notice shall be included in all copies
 * or substantial portions of the Software."* Shipping `globe.gl.min.js` with a
 * version string and no notice is not a grey area, and it applies the moment
 * the app reaches anyone.
 *
 * Three kinds of dependency end up in a build and all three belong here:
 *
 *   - **Bundled at runtime** — the production `dependencies`, packaged into the
 *     asar by electron-builder.
 *   - **Vendored** — copied into `src/renderer/vendor` by `scripts/vendor.mjs`
 *     and shipped as files. These are the ones with no notice today.
 *   - **Fetched on demand** — the captions runtime, downloaded on first use.
 *     Not in the binary, still executed by the app, still ours to credit.
 *
 * Licence text is read from the package's own LICENSE file rather than
 * paraphrased from the `license` field. The field says "MIT"; the obligation is
 * to reproduce the copyright line, and only the file has that.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "THIRD-PARTY-NOTICES.md");
const check = process.argv.includes("--check");

/**
 * Packages whose code ends up in a build, and how.
 *
 * Listed rather than walked: the full transitive tree is hundreds of packages
 * of which almost none ship, and a notices file that credits build tooling is
 * noise that hides the entries that matter.
 */
const SHIPPED = [
  ["@noble/curves",  "bundled",  "Schnorr signatures for Nostr presence and chat"],
  ["satellite.js",   "bundled",  "SGP4 orbit propagation for satellites and the ISS"],
  ["globe.gl",       "vendored", "The globe itself"],
  ["three",          "vendored", "3D rendering, inside globe.gl"],
  ["three-globe",    "vendored", "Earth textures and globe layers"],
  ["onnxruntime-web", "fetched", "Runs the Whisper model, downloaded when captions are enabled"],
  ["@huggingface/transformers", "fetched", "Whisper pipeline, downloaded when captions are enabled"],
];

/** Data and imagery are not code and have their own obligations. */
const DATA = [
  ["Radio Browser", "Public domain",
   "The station catalogue. Data is public domain; their server software is AGPL-3.0 and is not used here."],
  ["EiBi shortwave schedule", "Free use",
   "9,289 scheduled broadcasts, resolved to what is transmitting this minute."],
  ["NASA Black Marble / GIBS", "Public domain (US Government work)",
   "City lights at 8192×4096, and imagery layers."],
  ["NOAA Space Weather Prediction Center", "Public domain (US Government work)",
   "Solar flux and K-index."],
  ["WSPRnet / wspr.live", "Community published", "Propagation reports."],
  ["radio.garden", "Referenced", "Station geography."],
  ["adsb.lol", "Community published", "Aircraft positions."],
  ["CelesTrak / SatNOGS", "Community published", "Orbital elements."],
  ["The KiwiSDR operators", "Volunteered",
   "837 receivers, on their hardware and their bandwidth, given away free. Not a licence — a debt."],
  ["Inter", "SIL Open Font License 1.1",
   "The interface typeface, vendored at `assets/fonts/InterVariable.woff2`. Copyright (c) 2016 The Inter Project Authors. Full licence at `assets/fonts/Inter-LICENSE.txt`."],
  ["Noun Project — emilegraphics", "Royalty-free, purchased",
   "Both globe icons. Certificates in `assets/licenses/`; see `assets/ATTRIBUTION.md`."],
];

const LICENSE_NAMES = [
  "LICENSE", "LICENSE.md", "LICENSE.txt", "license", "LICENCE", "LICENCE.md",
  "COPYING", "COPYING.md",
];

function pkgDir(name) {
  return path.join(ROOT, "node_modules", ...name.split("/"));
}

function readPkg(name) {
  try { return JSON.parse(fs.readFileSync(path.join(pkgDir(name), "package.json"), "utf8")); }
  catch { return null; }
}

/**
 * Packages that publish no licence file, with the upstream text checked in here.
 *
 * `onnxruntime-web` ships `license: "MIT"` in its manifest and no LICENSE file
 * in the tarball. The obligation is to reproduce the copyright notice, and a
 * manifest field is not a copyright notice — so the text below was taken from
 * the repository the manifest points at, microsoft/onnxruntime, and is recorded
 * as such rather than silently generated. Verified against the upstream LICENSE.
 *
 * This is checked in rather than fetched at build time: a notices file that
 * needs the network to be correct is a notices file that will one day be wrong.
 */
const UPSTREAM = {
  "onnxruntime-web": {
    from: "https://github.com/microsoft/onnxruntime/blob/main/LICENSE",
    note: "The published npm package contains no licence file. This text is the " +
          "upstream LICENSE from the repository named in its manifest.",
    text: `MIT License

Copyright (c) Microsoft Corporation

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`,
  },
};

function readLicence(name) {
  const dir = pkgDir(name);
  for (const f of LICENSE_NAMES) {
    const p = path.join(dir, f);
    try { if (fs.statSync(p).isFile()) return { text: fs.readFileSync(p, "utf8").trim() }; } catch {}
  }
  const up = UPSTREAM[name];
  return up ? { text: up.text, note: `${up.note} Source: ${up.from}` } : null;
}

const HOW = {
  bundled:  "Bundled in the application",
  vendored: "Vendored into `src/renderer/vendor`",
  fetched:  "Downloaded on first use, when captions are enabled",
};

const entries = [];
const missing = [];
for (const [name, how, why] of SHIPPED) {
  const pkg = readPkg(name);
  if (!pkg) { missing.push(name); continue; }
  const lic = readLicence(name);
  if (!lic) missing.push(`${name} (no licence text anywhere)`);
  entries.push({ name, how, why, version: pkg.version, spdx: pkg.license || "see text",
                 text: lic?.text, note: lic?.note });
}

const body = `# Third-party notices

AuralFM is MIT licensed; see \`LICENSE\` for its own terms. It also ships, vendors
or downloads the software below, and each of those licences requires its notice
to travel with the code. They are reproduced in full here.

Generated by \`scripts/notices.mjs\`. Do not edit by hand — run \`npm run notices\`.

---

## Software

${entries.map((e) => `- **${e.name}** ${e.version} — ${e.spdx} — ${e.why}. *${HOW[e.how]}.*`).join("\n")}

${entries.map((e) => `---

### ${e.name} ${e.version}

${e.spdx} · ${HOW[e.how]} · ${e.why}
${e.note ? `\n> ${e.note}\n` : ""}
\`\`\`
${(e.text || "No licence text was found. This is a bug — report it.").trim()}
\`\`\`
`).join("\n")}
---

## Data, imagery and artwork

Not code, and mostly not copyrightable — but credited because the people who
publish it are the reason this app has anything to show.

${DATA.map(([n, l, d]) => `- **${n}** — ${l}. ${d}`).join("\n")}
`;

if (check) {
  let current = null;
  try { current = fs.readFileSync(OUT, "utf8"); } catch {}
  if (current === null) {
    console.error("THIRD-PARTY-NOTICES.md is missing — run `npm run notices`");
    process.exit(1);
  }
  if (current.trim() !== body.trim()) {
    console.error("THIRD-PARTY-NOTICES.md is stale — run `npm run notices`");
    process.exit(1);
  }
  if (missing.length) {
    console.error("no licence text for: " + missing.join(", "));
    process.exit(1);
  }
  console.log(`  ok    ${entries.length} packages, all licence texts present`);
  process.exit(0);
}

fs.writeFileSync(OUT, body);
console.log(`notices: ${entries.length} packages -> THIRD-PARTY-NOTICES.md ` +
            `(${(body.length / 1024).toFixed(0)} KB)`);
if (missing.length) {
  console.warn("notices: NO LICENCE TEXT for " + missing.join(", "));
  process.exit(1);
}
