/**
 * Write a file so it is either the old contents or the new, never half of each.
 *
 * writeFileSync over the file itself truncates it first and then writes. A
 * crash, a forced quit or the battery running out in between leaves a torn
 * file; JSON.parse fails on the next launch, the loader falls back to empty,
 * and the next save makes the loss permanent. That is every favourite, the
 * history and the stations someone added by hand.
 *
 * So the bytes go to a file beside it, and a rename puts that file in place.
 * A rename within one directory is atomic on macOS, Linux and Windows (NTFS):
 * whoever opens the path sees one file or the other.
 */
const fs = require("node:fs");

function writeAtomic(file, data) {
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tmp, data);
    fs.renameSync(tmp, file);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch { /* nothing to tidy */ }
    throw err;
  }
}

/**
 * Read a JSON file, and set it aside if it cannot be read.
 *
 * Every caller answers an unreadable file with an empty value, and its next
 * save writes over the file: favourites, the history or the stations someone
 * added, gone with no copy. A file restored half-copied from a backup, or
 * edited by hand, is the usual way in. Renamed aside first, the next save
 * starts a new file and the old bytes are still there to recover.
 */
function readJson(file, fallback) {
  let text;
  try { text = fs.readFileSync(file, "utf8"); } catch { return fallback; }   // missing: a first run
  try { return JSON.parse(text); } catch (err) {
    const aside = `${file}.unreadable-${Date.now()}`;
    try { fs.renameSync(file, aside); console.error(`${file} could not be read (${err.message}); kept as ${aside}`); }
    catch { /* left where it is */ }
    return fallback;
  }
}

module.exports = { writeAtomic, readJson };
