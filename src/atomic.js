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

module.exports = { writeAtomic };
