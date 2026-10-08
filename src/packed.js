"use strict";
/**
 * The catalogue's files, read plain or packed.
 *
 * A checkout has data/stations.min.json and data/profiles/<xx>.json as written
 * by the catalogue scripts. The packaged Mac app carries them gzipped instead
 * (scripts/pack-data.mjs, run by `npm run dist`): 38 MB of JSON as 13.
 *
 * Plain wins when both are there. A checkout that has been packaged once still
 * has data/packed/, and a catalogue rebuilt since must not be shadowed by it.
 */
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const DATA = path.join(__dirname, "..", "data");

/** The text of data/<rel>, or null when neither form is there. */
function read(rel) {
  const plain = path.join(DATA, rel);
  if (fs.existsSync(plain)) return fs.readFileSync(plain, "utf8");
  const gz = path.join(DATA, "packed", rel + ".gz");
  if (fs.existsSync(gz)) return zlib.gunzipSync(fs.readFileSync(gz)).toString("utf8");
  return null;
}

module.exports = { read };
