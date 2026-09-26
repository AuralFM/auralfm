/**
 * AuralFM's own station ids.
 *
 * Every station is "af-" and eight characters, drawn at random once and kept
 * in data/ids.json (tracked: an id that changed would lose everyone's
 * favourites of it). The registry maps what identifies a station in the world
 * to its id:
 *
 *   rb:<uuid>       its radio-browser entry
 *   s:<hash>        its own stream (scripts/lib/match.mjs streamKey, hashed)
 *
 * A station known both ways has one id under both keys, so it keeps its id
 * when either changes: radio-browser re-listing it under a new uuid, or the
 * station moving its stream while radio-browser follows.
 *
 * No other directory's id is ever a key. The catalogue once used radio.garden's
 * own ids as its ids; data/legacy-ids.json (not tracked, not shipped) maps those
 * old ids to these, for moving favourites, corrections and review sheets across.
 */
import fs from "node:fs";
import crypto from "node:crypto";
import { streamKey } from "./match.mjs";

const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";   // Crockford's: no i, l, o, u

export const streamRef = (url) => {
  const k = streamKey(url);
  return k ? `s:${crypto.createHash("sha1").update(k).digest("hex").slice(0, 16)}` : null;
};
export const rbRef = (uuid) => (uuid ? `rb:${uuid}` : null);

export function openIds(file) {
  const map = new Map();
  if (fs.existsSync(file)) for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const [id, ...keys] = line.split("\t");
    if (id) for (const k of keys) if (k) map.set(k, id);
  }
  const used = new Set(map.values());
  const fresh = () => {
    for (;;) {
      const id = "af-" + [...crypto.randomBytes(8)].map((b) => ALPHABET[b & 31]).join("");
      if (!used.has(id)) { used.add(id); return id; }
    }
  };
  let added = 0;
  return {
    /** The id for a station known by these keys (best first), made if new. */
    idFor(keys) {
      keys = keys.filter(Boolean);
      const known = keys.map((k) => map.get(k)).find(Boolean);
      const id = known || (added++, fresh());
      for (const k of keys) if (!map.has(k)) map.set(k, id);
      return id;
    },
    get size() { return used.size; },
    get added() { return added; },
    /** One line per id: the id, then every key it is known by. Sorted, so diffs stay small. */
    save() {
      const byId = new Map();
      for (const [k, id] of map) (byId.get(id) || byId.set(id, []).get(id)).push(k);
      const lines = [...byId].sort(([a], [b]) => (a < b ? -1 : 1)).map(([id, ks]) => [id, ...ks.sort()].join("\t"));
      fs.writeFileSync(file, lines.join("\n") + "\n");
    },
  };
}
