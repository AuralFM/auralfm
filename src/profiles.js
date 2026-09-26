/**
 * A station's profile, read from the files that ship with the app.
 *
 * scripts/profiles.mjs writes what each station says about itself (website,
 * description, socials, genres, a claim with its tip address) into
 * data/profiles/<xx>.json, 256 files by a hash of the station id. The desktop
 * reads them from disk, so a profile opens without the network: the catalogue
 * lives on your machine. The web version fetches the same files (web/bridge.js).
 */
const fs = require("node:fs");
const path = require("node:path");

const DIR = path.join(__dirname, "..", "data", "profiles");
const shards = new Map();

/** The shard a station's profile lives in. scripts/profiles.mjs and web/bridge.js use the same hash. */
function shardOf(id) {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return ((h >>> 0) & 0xff).toString(16).padStart(2, "0");
}

function profile(id) {
  id = String(id || "");
  if (!id || id.length > 80) return null;
  const s = shardOf(id);
  if (!shards.has(s)) {
    try { shards.set(s, JSON.parse(fs.readFileSync(path.join(DIR, `${s}.json`), "utf8"))); }
    catch { shards.set(s, {}); }
  }
  return shards.get(s)[id] || null;
}

module.exports = { profile, shardOf };
