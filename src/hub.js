/**
 * Hubs — a private room whose only door is a name and a password.
 *
 * There is no registry, no invitation and nothing to join. Two people who type
 * the same pair are in the same room; two rooms sharing a name but not a
 * password never touch, because the name alone decides nothing.
 *
 * The shape of it: one slow key derivation over the pair produces sixty-four
 * bytes. The first half is the key the messages are encrypted with and it never
 * leaves this machine. The second half becomes the public tag the messages ride
 * on, so relays can carry a room they cannot read and cannot name.
 *
 * The idea is glub.chat's, and only the idea. Their source carries no licence —
 * no LICENSE file, no `license` field, no mention in the README — which under
 * copyright means all rights reserved however friendly the author is. So this
 * was written from the description and from primitives already in this app,
 * without reading theirs. If they ever add a licence, that changes what may be
 * borrowed; it does not change anything here.
 *
 * ## What a hub is not
 *
 * **Not deniable, and not forward secret.** Everyone who knows the pair can read
 * everything sent to it, including anything sent before they knew it, for as
 * long as a relay holds it. Changing the password does not lock anybody out of
 * what they already have — it makes a *different room*, which is the honest way
 * to say it and the only way to leave somebody behind.
 *
 * **Not anonymous within the room.** Messages are signed, so members can tell
 * each other apart. That is the point; a room where anyone can be anyone is not
 * a room.
 *
 * **Only as good as the password.** The tag is public. Anyone can collect the
 * traffic for a tag and attack the password offline at their leisure, which is
 * why the derivation is deliberately slow and memory-hard rather than a hash.
 */

const crypto = require("node:crypto");
const { sha256 } = require("@noble/hashes/sha2.js");
const { xchacha20poly1305 } = require("@noble/ciphers/chacha.js");

/**
 * Derivation cost, measured rather than guessed.
 *
 * On this project's reference machine — the 2019 i5-8257U the captions work was
 * benchmarked on — with r=8, p=1:
 *
 *   N = 2^14    16 MB     37ms
 *   N = 2^15    32 MB     89ms
 *   N = 2^16    64 MB    149ms      <- chosen
 *   N = 2^17   128 MB    365ms
 *
 * Paid once, when somebody joins a room, and never per message. A seventh of a
 * second is nothing to a person opening a door and a great deal to anybody
 * grinding passwords against a tag they scraped: sixty-four megabytes per guess
 * is what makes it expensive, more than the time is.
 */
const N = 1 << 16, R = 8, P = 1;
const MAXMEM = 256 * 1024 * 1024;      // scrypt refuses above this; ours needs 64

/** Versioned, so a future change to the derivation cannot silently collide. */
const SALT_PREFIX = "auralfm:hub:v1:";

const MAX_NAME = 64;
const MAX_TEXT = 2000;

const hex = (b) => Buffer.from(b).toString("hex");

/**
 * Two people must type "Radio Club" and "radio club " and land in the same room,
 * and must not have to wonder which. Case and surrounding space are noise; what
 * is between words is not, so it is collapsed rather than removed.
 */
const normalize = (s) => String(s || "").trim().replace(/\s+/g, " ").toLowerCase();

/**
 * A name and a password become a room.
 *
 * @returns {{name: string, tag: string, key: Uint8Array}|null}
 */
function derive(name, password) {
  const n = normalize(name).slice(0, MAX_NAME);
  const p = String(password || "");
  // A hub with no password is a public channel with extra steps, and one with no
  // name cannot be told from any other. Both are refused rather than fudged.
  if (!n || !p) return null;

  const material = crypto.scryptSync(p, SALT_PREFIX + n, 64, { N, r: R, p: P, maxmem: MAXMEM });
  const key = Uint8Array.from(material.subarray(0, 32));

  /**
   * The public half is hashed before it is published.
   *
   * Publishing raw derivation output would put thirty-two bytes of it on every
   * relay in the world next to thirty-two bytes we are relying on staying
   * secret. They are different halves and that should be enough — but "should be
   * enough" is doing load-bearing work in that sentence, and a hash costs
   * nothing.
   */
  const tag = hex(sha256(Uint8Array.from(material.subarray(32)))).slice(0, 32);
  return { name: n, tag, key };
}

/**
 * Encrypt for a hub.
 *
 * The tag travels as associated data, so a ciphertext lifted from one room and
 * replayed into another fails to open rather than appearing as noise somebody
 * has to reason about.
 */
function seal(text, hub) {
  const body = String(text || "").slice(0, MAX_TEXT);
  if (!body || !hub?.key) return null;
  const nonce = crypto.randomBytes(24);
  const ct = xchacha20poly1305(hub.key, nonce, Buffer.from(hub.tag, "utf8"))
    .encrypt(Buffer.from(body, "utf8"));
  return Buffer.concat([nonce, Buffer.from(ct)]).toString("base64");
}

/** Open one, or return null. A message we cannot read is not an error. */
function open(payload, hub) {
  if (!hub?.key || typeof payload !== "string") return null;
  let raw;
  try { raw = Buffer.from(payload, "base64"); } catch { return null; }
  if (raw.length <= 24 + 16) return null;          // nonce + tag, at minimum
  try {
    const out = xchacha20poly1305(hub.key, Uint8Array.from(raw.subarray(0, 24)),
                                  Buffer.from(hub.tag, "utf8"))
      .decrypt(Uint8Array.from(raw.subarray(24)));
    const text = Buffer.from(out).toString("utf8");
    return text.length > MAX_TEXT ? text.slice(0, MAX_TEXT) : text;
  } catch {
    // Wrong password, wrong room, or somebody else's noise on a colliding tag.
    return null;
  }
}

/** A tag is 128 bits of hex and nothing else. */
const isTag = (t) => typeof t === "string" && /^[0-9a-f]{32}$/.test(t);

module.exports = { derive, seal, open, isTag, normalize, MAX_TEXT, MAX_NAME };
