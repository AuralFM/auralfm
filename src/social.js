/**
 * People you have chosen to keep: favorites, and the ones you have verified.
 *
 * [muted.js] is the same shape for the opposite feeling, and the reasoning about
 * why it is a separate file from state.json applies here word for word: renderers
 * round-trip the whole state object, so anything main writes there can be
 * clobbered by a stale copy. A contact list that silently forgets people is
 * worse than not having one.
 *
 * ## What a contact is
 *
 * A public key, plus what you know about it. Three independent things, and
 * conflating any two of them would be a lie:
 *
 *   **favorite** — you want to hear from them. Your decision alone, and it says
 *   nothing about whether they know you exist.
 *
 *   **mutual** — they favorited you back. This one is not your decision; it is
 *   set only when a signed private envelope arrives from them carrying the
 *   signal. It cannot be faked without their key, because the seal inside a
 *   kind-1059 is signed by the sender and [nostr-private.js] refuses to report a
 *   sender whose signature does not verify.
 *
 *   **verified** — you compared fingerprints with this person, out of band, and
 *   they matched. This is the only claim here that means anything about a human
 *   being, and it is the only one the app can never set on your behalf. Doing so
 *   automatically would turn the one honest security signal in the app into
 *   decoration.
 *
 * ## The limit worth knowing before you use it
 *
 * Most keys on the network are ephemeral, including all of ours by default —
 * generated per area, per launch, never stored. Favoriting one of those is
 * favoriting something that will not exist tomorrow. Contacts only stay
 * meaningful for keys that persist, which means a bitchat user, or an AuralFM
 * user who has switched on the durable identity in [identity.js].
 *
 * That is not a bug to be fixed here — it is the cost of not having stable
 * identities, and the app should say so where somebody is about to rely on it
 * rather than bury it in a file like this one.
 */

const fs = require("node:fs");
const path = require("node:path");

/** Past this it is an address book, which is a different feature. */
const MAX = 500;
/** A note to yourself about who somebody is, not a biography. */
const MAX_LABEL = 40;

let FILE = null;
let cache = null;

function init(userDataPath) {
  FILE = path.join(userDataPath, "contacts.json");
  cache = null;
}

/** A Nostr pubkey is 64 lowercase hex characters. Anything else is not one. */
const isKey = (k) => typeof k === "string" && /^[0-9a-f]{64}$/.test(k);

const blank = () => ({ favorite: false, mutual: false, verified: false, label: "", at: 0 });

function load() {
  if (cache) return cache;
  cache = {};
  if (!FILE) return cache;
  try {
    const j = JSON.parse(fs.readFileSync(FILE, "utf8"));
    const src = j && typeof j.people === "object" && j.people ? j.people : {};
    for (const [k, v] of Object.entries(src)) {
      if (!isKey(k) || Object.keys(cache).length >= MAX) continue;
      if (!v || typeof v !== "object") continue;
      cache[k] = {
        favorite: !!v.favorite,
        mutual: !!v.mutual,
        verified: !!v.verified,
        label: String(v.label ?? "").slice(0, MAX_LABEL),
        at: Number.isFinite(v.at) ? v.at : 0,
      };
    }
  } catch { /* absent or unreadable, which is the same as empty */ }
  return cache;
}

function save() {
  if (!FILE || !cache) return;
  try { fs.writeFileSync(FILE, JSON.stringify({ people: cache })); }
  catch (err) { console.error("social: save failed —", err.message); }
}

/** Everything, newest first, with the key included so a renderer can act on it. */
function list() {
  return Object.entries(load())
    .map(([pubkey, v]) => ({ pubkey, ...v }))
    .sort((a, b) => b.at - a.at);
}

function get(pubkey) {
  if (!isKey(pubkey)) return null;
  return load()[pubkey] ? { pubkey, ...load()[pubkey] } : null;
}

/** Change one thing about one person, creating the entry if needed. */
function set(pubkey, patch, now = Date.now()) {
  if (!isKey(pubkey) || !patch || typeof patch !== "object") return false;
  const all = load();
  if (!all[pubkey]) {
    if (Object.keys(all).length >= MAX) return false;
    all[pubkey] = blank();
  }
  const e = all[pubkey];
  if ("favorite" in patch) e.favorite = !!patch.favorite;
  if ("mutual" in patch) e.mutual = !!patch.mutual;
  if ("verified" in patch) e.verified = !!patch.verified;
  if ("label" in patch) e.label = String(patch.label ?? "").slice(0, MAX_LABEL);
  e.at = now;

  // Nothing left to remember about them. Keeping an all-false row would grow the
  // file forever and make "is this person a contact" answerable two ways.
  if (!e.favorite && !e.mutual && !e.verified && !e.label) delete all[pubkey];
  save();
  return true;
}

const isMutual = (pubkey) => !!get(pubkey)?.mutual;

/**
 * Record that somebody favorited us.
 *
 * Only ever called with a pubkey that [nostr-private.js] has authenticated, so
 * `mutual` cannot be set by an unsigned claim. Note what it does *not* do: it
 * never sets `favorite`. Somebody adding you is not you adding them, and
 * collapsing the two would let a stranger put themselves in your favorites.
 */
function noteMutual(pubkey, on = true, now = Date.now()) {
  if (!isKey(pubkey)) return false;
  const all = load();
  if (!all[pubkey]) {
    if (!on) return false;                        // nothing to clear
    if (Object.keys(all).length >= MAX) return false;
    all[pubkey] = blank();
  }
  all[pubkey].mutual = !!on;
  all[pubkey].at = now;
  if (!all[pubkey].favorite && !all[pubkey].mutual
      && !all[pubkey].verified && !all[pubkey].label) delete all[pubkey];
  save();
  return true;
}

/** Forget everyone. The panic wipe's entry point. */
function clear() {
  cache = {};
  save();
}

module.exports = { init, list, get, set, clear, noteMutual, isMutual, isKey };
