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
  ["@noble/ciphers", "bundled",  "XChaCha20-Poly1305 for private messages"],
  ["@noble/hashes",  "bundled",  "SHA-256 and HKDF for the private-message key schedule"],
  ["satellite.js",   "bundled",  "SGP4 orbit propagation for satellites and the ISS"],
  ["globe.gl",       "vendored", "The globe itself"],
  /**
   * The published package carries no LICENSE file — the notice lives in the
   * source header instead, where it stays because the file is vendored whole.
   * `assets/licenses/qrcode-generator-LICENSE.txt` reproduces that header
   * verbatim and then the MIT text it designates by URL, so what ships is the
   * author's own notice rather than one assumed on their behalf.
   */
  ["qrcode-generator", "vendored", "The QR code on the share card",
   "assets/licenses/qrcode-generator-LICENSE.txt"],
  ["three",          "vendored", "3D rendering, inside globe.gl"],
  ["three-globe",    "vendored", "Earth textures and globe layers"],
  // The runtime itself. Its MIT notice was missing from every build: the app
  // bundle and the DMG contained no licence file at all, and this file did not
  // mention Electron. Chromium's own notice is a separate, unresolved item —
  // see the note printed below.
  ["electron",       "runtime",  "Chromium and Node, the runtime the app is built on"],
];

/**
 * Notices that do not come from an npm package.
 *
 * Chromium is the case that forced this. Electron bundles it, its BSD-3-Clause
 * requires the notice reproduced in binary redistributions, and there is no
 * `node_modules/chromium` to read it from. Its full third-party credits
 * (`LICENSES.chromium.html`) are 19 MB, so this build ships Chromium's own notice
 * verbatim and links the full set upstream.
 *
 * Provenance lives in `assets/licenses/chromium-notice.json` — the exact Chromium
 * version, the source URL at that tag, and a sha256. `npm run audit` fails if the
 * Electron version recorded there stops matching the installed one, so an Electron
 * upgrade cannot silently leave a stale notice behind.
 */
const FROM_FILE = [
  {
    name: "Chromium",
    how: "runtime",
    why: "The browser engine inside Electron",
    text: "assets/licenses/chromium-LICENSE.txt",
    meta: "assets/licenses/chromium-notice.json",
  },
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
  ["CelesTrak / SatNOGS", "Community published", "Orbital elements."],
  ["The KiwiSDR operators", "Volunteered",
   "837 receivers, on their hardware and their bandwidth, given away free. Not a licence — a debt."],
  ["Inter", "SIL Open Font License 1.1",
   "The interface typeface, vendored at `assets/fonts/InterVariable.woff2`. Copyright (c) 2016 The Inter Project Authors. Full licence at `assets/fonts/Inter-LICENSE.txt`."],
  ["The AuralFM marks", "Original work",
   "The globe and every icon in the app are drawn by Melton Bell III and owned outright. Two Noun Project globes were licensed and shipped until they were replaced; see `assets/ATTRIBUTION.md`."],
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

function readLicence(name, override) {
  // Some packages publish no licence file and carry the notice in the source
  // instead. Those name a shipped file rather than being skipped.
  if (override) {
    try { return { text: fs.readFileSync(path.join(ROOT, override), "utf8").trim() }; }
    catch { /* fall through and report it missing, which is the honest outcome */ }
  }
  const dir = pkgDir(name);
  for (const f of LICENSE_NAMES) {
    const p = path.join(dir, f);
    try { if (fs.statSync(p).isFile()) return { text: fs.readFileSync(p, "utf8").trim() }; } catch {}
  }
  return null;
}

const HOW = {
  bundled:  "Bundled in the application",
  vendored: "Vendored into `src/renderer/vendor`",
  runtime:  "The application runtime",
};

const entries = [];
const missing = [];
for (const [name, how, why, licenceOverride] of SHIPPED) {
  const pkg = readPkg(name);
  if (!pkg) { missing.push(name); continue; }
  const lic = readLicence(name, licenceOverride);
  if (!lic) missing.push(`${name} (no licence text anywhere)`);
  entries.push({ name, how, why, version: pkg.version, spdx: pkg.license || "see text",
                 text: lic?.text, note: lic?.note });
}

for (const f of FROM_FILE) {
  let text = null, meta = {};
  try { text = fs.readFileSync(path.join(ROOT, f.text), "utf8").trim(); }
  catch { missing.push(`${f.name} (${f.text} not found)`); continue; }
  try { meta = JSON.parse(fs.readFileSync(path.join(ROOT, f.meta), "utf8")); } catch {}
  const full = meta.fullCredits || {};
  entries.push({
    name: f.name, how: f.how, why: f.why, version: meta.chromium || "version unknown",
    spdx: "BSD-3-Clause", text,
    note: "This is Chromium's own notice. Its bundled third-party components have "
        + `their own licences, collected in ${full.file || "LICENSES.chromium.html"} — `
        + "not reproduced here for size. The full set for this exact build is at "
        + `${full.electronRelease || "the Electron release"} , and the Chromium source `
        + `at ${full.chromiumSource || "chromium.googlesource.com"} .`,
  });
}

const body = `# Third-party notices

**AuralFM is open source, under the MIT licence** — see \`LICENSE\`, and
\`docs/TERMS.md\` for what that means to somebody using the app rather than
building on it.

It also bundles, vendors and runs on the software below, each under its own
licence, and each of those licences requires its notice to travel with the code.
Nothing in AuralFM's terms restricts any right they grant you. They are
reproduced in full here.

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
