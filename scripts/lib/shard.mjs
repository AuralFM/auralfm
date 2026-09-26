/**
 * The file a station's profile lives in: one of 256, by an FNV-1a hash of its
 * id. scripts/profiles.mjs files profiles by it; src/profiles.js (desktop) and
 * web/bridge.js (web) find them by the same function, and the audit runs all
 * three to be sure they agree.
 */
export function shardOf(id) {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return ((h >>> 0) & 0xff).toString(16).padStart(2, "0");
}
