/**
 * People you have chosen not to hear from.
 *
 * The chat is other people's messages arriving over relays this app does not own
 * and cannot moderate. That is a real limit and it is not going away: nobody here
 * can delete a message from somebody else's relay. What can be done is give the
 * person reading it complete control over their own window, which is the only
 * moderation that needs no permission from anyone.
 *
 * Two decisions worth stating.
 *
 * **It filters in the main process.** A muted message is dropped before it
 * reaches a renderer, so it is not hidden by CSS or skipped by a paint function
 * — it never arrives. There is nothing in the DOM to inspect and nothing to
 * accidentally render later.
 *
 * **It keys on the whole public key.** The renderer only ever sees the first
 * eight characters of a pubkey, which is fine for a label and not fine for a
 * block list: eight hex characters is thirty-two bits, and picking a key that
 * collides with somebody's mute entry is a few seconds of work. Muting is done
 * by main, which has the full key.
 *
 * Its own file, deliberately. state.json is round-tripped whole by the renderers,
 * so anything main writes there can be overwritten by a stale copy — the same bug
 * that ate the tip counts. A block list that silently forgets an entry is worse
 * than not having one.
 */

const fs = require("node:fs");
const path = require("node:path");

const MAX = 500;                      // a list this long is a different problem
let FILE = null;
let cache = null;

function init(userDataPath) {
  FILE = path.join(userDataPath, "muted.json");
  cache = null;
}

function load() {
  if (cache) return cache;
  if (!FILE) return (cache = { keys: [] });
  try {
    const j = JSON.parse(fs.readFileSync(FILE, "utf8"));
    const keys = Array.isArray(j.keys) ? j.keys.filter(isKey) : [];
    cache = { keys: [...new Set(keys)].slice(0, MAX) };
  } catch { cache = { keys: [] }; }
  return cache;
}

function save() {
  if (!FILE || !cache) return;
  try { fs.writeFileSync(FILE, JSON.stringify(cache)); }
  catch (err) { console.error("muted: save failed —", err.message); }
}

/** A Nostr pubkey is 64 lowercase hex characters. Anything else is not one. */
const isKey = (k) => typeof k === "string" && /^[0-9a-f]{64}$/.test(k);

const set = () => new Set(load().keys);

function list() { return [...load().keys]; }
function has(pubkey) { return isKey(pubkey) && set().has(pubkey); }

function add(pubkey) {
  if (!isKey(pubkey)) return false;
  const s = set();
  if (s.has(pubkey)) return true;
  if (s.size >= MAX) return false;
  cache.keys = [...s, pubkey];
  save();
  return true;
}

function remove(pubkey) {
  if (!isKey(pubkey)) return false;
  const s = set();
  if (!s.delete(pubkey)) return false;
  cache.keys = [...s];
  save();
  return true;
}

/**
 * Forget everyone.
 *
 * Not the same as unmuting one person: this is the "clear everything" path, and
 * it exists so a panic wipe has something to call.
 */
function clear() {
  cache = { keys: [] };
  save();
}

/** Drop anything from a muted key. Called on the way to the renderer. */
function filter(messages) {
  if (!Array.isArray(messages)) return messages;
  const s = set();
  if (!s.size) return messages;
  return messages.filter((m) => !(m && typeof m.pubkey === "string" && s.has(m.pubkey)));
}

module.exports = { init, list, has, add, remove, clear, filter, isKey, MAX };
