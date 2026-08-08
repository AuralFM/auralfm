/**
 * An optional durable identity, off by default.
 *
 * ## Why this file exists at all
 *
 * Everything else in this app uses a key generated at launch, per twenty-
 * kilometre area, never written to disk. That is deliberate and it is the reason
 * presence here is not a location trail. It also makes two features impossible,
 * and it is worth being exact about why rather than shipping hollow versions of
 * them:
 *
 *   **Favorites.** Marking a key as someone you want to hear from is worthless
 *   if the key stops existing when they quit. You would be keeping a list that
 *   decays into noise within a day.
 *
 *   **Verification.** Comparing fingerprints in person is a real security
 *   practice — it is how you learn that the key you are talking to belongs to
 *   the person in front of you. Verifying a key that expires in an hour is
 *   theatre.
 *
 * bitchat gets around this because it has a stable Noise static key for the
 * mesh, and pairs devices over Bluetooth before Nostr is ever involved. We have
 * no mesh, so the out-of-band channel has to be a person reading sixteen hex
 * characters aloud — which is exactly what a fingerprint is for.
 *
 * ## The trade, stated plainly
 *
 * A durable key means anyone watching relays can tell that the same identity
 * received messages on Tuesday and again on Friday. That is linkability across
 * sessions, and it is a real cost. It is why this is **off by default** and why
 * nothing turns it on implicitly.
 *
 * What it deliberately does *not* touch: presence announcements keep using the
 * per-area ephemeral keys. Turning this on does not put a stable key on the
 * globe, and does not make the places you listen to linkable. The durable key
 * appears in exactly one place on the wire — the `p` tag of a private envelope
 * addressed to you — and only once somebody you gave your fingerprint to writes
 * to you.
 *
 * ## Why its own file, and its own permissions
 *
 * This is the only secret in the app that survives a restart. state.json is
 * round-tripped whole by renderers, which is how the tip counts got eaten; a
 * private key cannot be exposed to that. It is written 0600 and it is never sent
 * to a renderer — the preload surface can ask for the public half and the
 * fingerprint, and nothing else.
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { schnorr } = require("@noble/curves/secp256k1.js");

let FILE = null;
let cache = null;          // { sk: Uint8Array, pk: string } once loaded

function init(userDataPath) {
  FILE = path.join(userDataPath, "identity.json");
  cache = null;
}

const hex = (b) => Buffer.from(b).toString("hex");

/** Does a durable identity already exist on disk? */
function exists() {
  if (!FILE) return false;
  try { return fs.statSync(FILE).isFile(); } catch { return false; }
}

/**
 * Load it, or make one.
 *
 * Only ever called when the preference is on. A key that is generated "just in
 * case" is a key that exists, and the whole point is that it does not until
 * somebody asks for it.
 */
function ensure() {
  if (cache) return cache;
  if (!FILE) return null;
  try {
    const j = JSON.parse(fs.readFileSync(FILE, "utf8"));
    if (typeof j.sk === "string" && /^[0-9a-f]{64}$/.test(j.sk)) {
      const sk = new Uint8Array(Buffer.from(j.sk, "hex"));
      cache = { sk, pk: hex(schnorr.getPublicKey(sk)) };
      return cache;
    }
  } catch { /* absent or unreadable — make a new one */ }

  const sk = schnorr.utils.randomSecretKey();
  cache = { sk, pk: hex(schnorr.getPublicKey(sk)) };
  try {
    // 0600 before anything is in it, not after. Writing the file and then
    // fixing the mode leaves a window where a secret is world-readable.
    const fd = fs.openSync(FILE, "w", 0o600);
    try { fs.writeFileSync(fd, JSON.stringify({ sk: hex(sk) })); }
    finally { fs.closeSync(fd); }
  } catch (err) {
    // In memory is better than nothing: it will work this session and be
    // regenerated next time, which is the ephemeral behaviour anyway.
    console.error("identity: could not persist —", err.message);
  }
  return cache;
}

/** The public half, or null if there is no identity. Safe to send anywhere. */
function pubkey() { return cache?.pk || (exists() ? ensure().pk : null); }

/** The secret half. Main process only — never crosses the preload boundary. */
function secret() { return cache?.sk || (exists() ? ensure().sk : null); }

/**
 * SHA-256 of the public key, which is what gets read aloud.
 *
 * bitchat's whitepaper defines the stable identity as the fingerprint of the
 * static key rather than the key itself, and shows the leading characters for
 * out-of-band comparison. Sixteen hex characters is sixty-four bits — far past
 * what anyone will grind for, and short enough to say over a phone.
 */
function fingerprint(pk) {
  const key = pk || pubkey();
  if (!key) return null;
  return crypto.createHash("sha256").update(key).digest("hex").slice(0, 16);
}

/** Group a fingerprint into fours, the way every tool that shows one does. */
const readable = (fp) => (fp ? fp.match(/.{1,4}/g).join(" ") : null);

/**
 * Destroy it.
 *
 * Called by the panic wipe and by switching the preference off. Unlinking the
 * file is the whole job — there is no revocation to publish and nobody to tell,
 * because the key was never registered anywhere. Anyone holding your fingerprint
 * simply finds that nothing answers.
 */
function forget() {
  cache = null;
  if (!FILE) return;
  try { fs.rmSync(FILE, { force: true }); }
  catch (err) { console.error("identity: could not remove —", err.message); }
}

module.exports = { init, ensure, exists, pubkey, secret, fingerprint, readable, forget };
