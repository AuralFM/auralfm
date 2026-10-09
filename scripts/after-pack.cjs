"use strict";
/**
 * After electron-builder has put the app together, take two things back out.
 *
 * Both were left out by the builder itself until 26.17, and came back with it
 * (found 8 Oct 2026: the catalogue had just been packed to save 28 MB, and the
 * app came out the same size).
 *
 *   LICENSES.chromium.html, 19 MB. The app ships Chromium's own notice and
 *   says where the full set is (scripts/notices.mjs, THIRD-PARTY-NOTICES.md).
 *
 *   Chromium's gendered language folders (en_FEMININE.lproj and the like): 24
 *   of them beside the eight languages in build.mac.electronLanguages, 7 MB.
 *   Chromium falls back to the plain language, which is what shipped before.
 *
 * Runs before signing, so a signed build signs what is left.
 */
const fs = require("node:fs");
const path = require("node:path");

/** Remove both from one .app, and say what went. Exported for the audit. */
function trim(appPath) {
  const gone = [];
  const licences = path.join(appPath, "Contents", "Resources", "LICENSES.chromium.html");
  if (fs.existsSync(licences)) { fs.rmSync(licences); gone.push("LICENSES.chromium.html"); }
  const res = path.join(appPath, "Contents", "Frameworks", "Electron Framework.framework", "Versions", "A", "Resources");
  if (fs.existsSync(res)) {
    for (const name of fs.readdirSync(res)) {
      if (/_(FEMININE|MASCULINE|NEUTER)\.lproj$/.test(name)) { fs.rmSync(path.join(res, name), { recursive: true }); gone.push(name); }
    }
  }
  return gone;
}

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  const gone = trim(app);
  if (gone.length) console.log(`  • after-pack      removed ${gone.length} item(s) the app does not need (${gone[0]}${gone.length > 1 ? ", …" : ""})`);
};
module.exports.trim = trim;
