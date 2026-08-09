/**
 * Private messages, in bitchat's envelope format.
 *
 * Three layers, and each one hides a different thing:
 *
 *   **kind 14 — the rumor.** The message itself, unsigned. It carries the
 *   sender's pubkey and the real timestamp, and it never touches a relay in the
 *   clear. Unsigned on purpose: a signature here would be a portable, verifiable
 *   statement that a named key said these words, which the recipient could show
 *   to anyone. Deniability is the point.
 *
 *   **kind 13 — the seal.** The rumor, encrypted to the recipient, then signed
 *   with the sender's *real* per-area key. This is the layer that proves who
 *   sent it. bitchat's own comment is worth repeating: signing with a throwaway
 *   key here would leave private messages forgeable. Its timestamp is fuzzed by
 *   up to fifteen minutes so the outer envelope cannot be correlated by clock.
 *
 *   **kind 1059 — the gift wrap.** The seal, encrypted again and signed with a
 *   key minted for this one message and then discarded. This is what relays
 *   see: an event from a key that has never existed before and never will again,
 *   addressed to a recipient. They learn who is being written to and nothing
 *   whatsoever about who wrote it.
 *
 * ## This is not NIP-44, and not NIP-17
 *
 * The kind numbers are borrowed from NIP-17/NIP-59 and the HKDF info string
 * still says `nip44-v2`, but the construction is bitchat's own and will not
 * interoperate with a NIP-44 client. The differences, stated so nobody has to
 * rediscover them:
 *
 *   - NIP-44 uses HKDF-**extract** with `nip44-v2` as the *salt*. This uses full
 *     HKDF (extract then expand) with an *empty* salt and `nip44-v2` as *info*.
 *   - NIP-44 takes the raw x-coordinate as key material. This takes
 *     SHA-256 of the compressed point — libsecp256k1's default ECDH — because
 *     that is what CryptoKit's `sharedSecretFromKeyAgreement` returns and that
 *     is what bitchat calls.
 *   - NIP-44 uses ChaCha20 with per-message expanded keys and a padded,
 *     length-prefixed plaintext. This uses XChaCha20-Poly1305 with a 24-byte
 *     random nonce and no padding.
 *   - The payload is `v2:` ‖ base64url(nonce24 ‖ ciphertext ‖ tag), which is not
 *     a NIP-44 payload in any version.
 *
 * ## What could not be verified from here, and why it is written down
 *
 * The ECDH step is the one detail inferred rather than read. bitchat calls
 * swift-secp256k1's `sharedSecretFromKeyAgreement(with:format: .compressed)`,
 * whose source is not in the repository — so "the shared secret is SHA-256 of
 * the compressed point" comes from libsecp256k1's documented default hash
 * function, not from reading their call site. Their test suite has no
 * cross-client vectors to check it against.
 *
 * Two consequences, both deliberate:
 *
 *   - `open()` tries the un-hashed x-coordinate as a fallback. Costs one extra
 *     ECDH on a message that was going to fail anyway, and makes us tolerant of
 *     exactly the thing that is uncertain.
 *   - `seal()` cannot hedge — it has to choose — so it uses the hashed form. If
 *     that inference is wrong, we can read bitchat and bitchat cannot read us,
 *     which is the failure that shows up in testing rather than the one that
 *     silently leaks.
 *
 * ## What this does not give you
 *
 * **No forward secrecy.** Straight from the whitepaper: compromise of the
 * recipient's static key exposes every stored envelope addressed to it. There is
 * no ratchet and no ephemeral handshake — the gift wrap's throwaway key protects
 * the sender's anonymity, not the message's future. In this app the per-area key
 * is generated at launch and never written to disk, which limits the window to a
 * single session, but that is a property of how we hold keys and not of the
 * envelope.
 *
 * **No metadata privacy for the recipient.** The `p` tag is public. Relays learn
 * that somebody sent something to this key, and when.
 */

const crypto = require("node:crypto");
const { secp256k1, schnorr } = require("@noble/curves/secp256k1.js");
const { sha256 } = require("@noble/hashes/sha2.js");
const { hkdf } = require("@noble/hashes/hkdf.js");
const { xchacha20poly1305 } = require("@noble/ciphers/chacha.js");

const DM_KIND = 14;
const SEAL_KIND = 13;
const WRAP_KIND = 1059;

/** Matches bitchat's own ceiling on an inbound envelope. */
const MAX_ENVELOPE = 64 * 1024;
/** A private message is a message, not a file transfer. */
const MAX_TEXT = 2000;

const hex = (b) => Buffer.from(b).toString("hex");
const isKey = (k) => typeof k === "string" && /^[0-9a-f]{64}$/.test(k);

/** base64url, without padding — what bitchat's Base64URLCoding produces. */
const b64u = {
  encode: (bytes) => Buffer.from(bytes).toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
  decode: (s) => {
    if (!/^[A-Za-z0-9_-]*$/.test(s)) return null;
    try { return new Uint8Array(Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64")); }
    catch { return null; }
  },
};

/**
 * NIP-01 event id and signature, with a key given rather than looked up.
 *
 * The presence module derives its key from the event's `g` tag, which is right
 * for a geohash channel and wrong here: a seal signs with the sender's identity
 * and a gift wrap signs with a key that exists for one message.
 */
function signWith(sk, evt) {
  const pubkey = hex(schnorr.getPublicKey(sk));
  const serial = JSON.stringify([0, pubkey, evt.created_at, evt.kind, evt.tags, evt.content]);
  const id = crypto.createHash("sha256").update(serial).digest();
  return { ...evt, pubkey, id: hex(id), sig: hex(schnorr.sign(id, sk)) };
}

/** Is this event's signature its own? Cheap, and the only thing authenticating a seal. */
function verify(evt) {
  try {
    if (!isKey(evt?.pubkey) || !isKey(evt?.id) || typeof evt.sig !== "string") return false;
    const serial = JSON.stringify([0, evt.pubkey, evt.created_at, evt.kind, evt.tags, evt.content]);
    if (crypto.createHash("sha256").update(serial).digest("hex") !== evt.id) return false;
    return schnorr.verify(Buffer.from(evt.sig, "hex"), Buffer.from(evt.id, "hex"),
                          Buffer.from(evt.pubkey, "hex"));
  } catch { return false; }
}

/**
 * The symmetric key for a conversation.
 *
 * A Nostr pubkey is x-only, so the y parity is unknown and both have to be
 * tried — the same reason bitchat tries even then odd. `hashed` selects the
 * shared-secret form; see the header for why there are two.
 */
function envelopeKey(sk, pkHex, parity, hashed = true) {
  const point = new Uint8Array(33);
  point[0] = parity;
  point.set(Buffer.from(pkHex, "hex"), 1);
  const shared = secp256k1.getSharedSecret(sk, point);   // 33-byte compressed
  const ikm = hashed ? sha256(shared) : shared.slice(1); // sha256(point) | raw x
  return hkdf(sha256, ikm, new Uint8Array(0), new TextEncoder().encode("nip44-v2"), 32);
}

/** `v2:` ‖ base64url(nonce24 ‖ ciphertext ‖ tag). */
function encrypt(plaintext, recipientPkHex, senderSk) {
  const nonce = crypto.randomBytes(24);
  const key = envelopeKey(senderSk, recipientPkHex, 2);
  // noble returns ciphertext with the 16-byte tag already appended, which is
  // the order bitchat writes it in.
  const sealed = xchacha20poly1305(key, nonce).encrypt(new TextEncoder().encode(plaintext));
  return "v2:" + b64u.encode(Buffer.concat([nonce, Buffer.from(sealed)]));
}

/**
 * Undo `encrypt`. Returns null rather than throwing: every input here came off a
 * stranger's relay, and a malformed envelope is a normal event, not an error.
 */
function decrypt(content, senderPkHex, recipientSk) {
  if (typeof content !== "string" || content.length > MAX_ENVELOPE) return null;
  if (!content.startsWith("v2:") || !isKey(senderPkHex)) return null;
  const raw = b64u.decode(content.slice(3));
  if (!raw || raw.length <= 24 + 16) return null;
  const nonce = raw.slice(0, 24);
  const body = raw.slice(24);
  // Both parities, then both shared-secret forms. Four attempts on a message
  // that is either ours to read or noise.
  for (const hashed of [true, false]) {
    for (const parity of [2, 3]) {
      try {
        const out = xchacha20poly1305(envelopeKey(recipientSk, senderPkHex, parity, hashed), nonce)
          .decrypt(body);
        return new TextDecoder("utf-8", { fatal: true }).decode(out);
      } catch { /* wrong key, wrong parity, or not for us */ }
    }
  }
  return null;
}

/**
 * ±15 minutes, as bitchat does it.
 *
 * The seal and the wrap both carry a fuzzed clock so that an observer holding a
 * pile of envelopes cannot line them up by time. The true timestamp survives
 * inside the rumor, where only the recipient sees it.
 */
function fuzzedNow(now = Date.now()) {
  const offset = crypto.randomInt(-900, 901);
  return Math.floor(now / 1000) + offset;
}

/**
 * Build the outer kind-1059 event for one recipient.
 *
 * @param {string} text            what to say
 * @param {string} recipientPkHex  64 hex characters
 * @param {Uint8Array} senderSk    our per-area key; identifies us to them alone
 * @param {Array<Array<string>>} [tags]  inner tags, e.g. a favorite signal
 * @returns {object|null} a signed event ready to publish
 */
function wrap(text, recipientPkHex, senderSk, tags = []) {
  const body = String(text ?? "").slice(0, MAX_TEXT);
  /**
   * An empty body is legal when there are tags, and getting this wrong cost a
   * whole feature.
   *
   * The guard used to be `if (!body)`, written for the obvious case — refuse to
   * send an empty chat message. But the favorite signal is *deliberately*
   * bodiless: it is a `["fav","1"]` tag and nothing else, because it is a fact
   * to be recorded rather than a line to be read. So every favorite silently
   * failed to send, mutual status could never be reached by anyone, and nothing
   * reported an error — `dm()` returned false into a caller that had already
   * saved the local half.
   *
   * Caught by round-tripping a real envelope through real relays. No unit test
   * on this function would have found it: it returns null perfectly correctly
   * for the input it was given.
   */
  if ((!body && !tags.length) || !isKey(recipientPkHex)) return null;

  // 1. The rumor. Unsigned, real timestamp, `id: ""` — bitchat's encoder omits
  //    a nil sig and writes an empty id, and their parser accepts both.
  const rumor = {
    id: "",
    pubkey: hex(schnorr.getPublicKey(senderSk)),
    created_at: Math.floor(Date.now() / 1000),
    kind: DM_KIND,
    tags,
    content: body,
  };

  // 2. The seal. Signed with our real key so they can tell it is us.
  const seal = signWith(senderSk, {
    created_at: fuzzedNow(),
    kind: SEAL_KIND,
    tags: [],
    content: encrypt(JSON.stringify(rumor), recipientPkHex, senderSk),
  });

  // 3. The gift wrap. A key for this one message, then gone. Exactly one `p`
  //    tag: bitchat rejects an inbound wrap whose tags are anything else.
  const once = schnorr.utils.randomSecretKey();
  return signWith(once, {
    created_at: fuzzedNow(),
    kind: WRAP_KIND,
    tags: [["p", recipientPkHex]],
    content: encrypt(JSON.stringify(seal), recipientPkHex, once),
  });
}

/**
 * Open an inbound kind-1059 addressed to us.
 *
 * Every check here exists because the input is hostile until proven otherwise.
 * The one that matters most is the last: the seal's pubkey is the sender, and it
 * is only the sender if the seal's own signature verifies. Skipping that check
 * turns "who sent this" into "who claims to have sent this", which is the whole
 * value of the middle layer.
 *
 * @returns {{text:string, pubkey:string, at:number, tags:Array}|null}
 */
function unwrap(giftWrap, recipientSk, recipientPkHex) {
  const g = giftWrap;
  if (!g || g.kind !== WRAP_KIND) return null;
  // Exactly one `p` tag, naming us. Same guard bitchat applies.
  if (!Array.isArray(g.tags) || g.tags.length !== 1) return null;
  if (g.tags[0]?.[0] !== "p" || g.tags[0]?.[1] !== recipientPkHex) return null;
  if (!verify(g)) return null;

  const sealJson = decrypt(g.content, g.pubkey, recipientSk);
  if (!sealJson) return null;
  let seal;
  try { seal = JSON.parse(sealJson); } catch { return null; }
  if (!seal || seal.kind !== SEAL_KIND) return null;
  // The signature on the seal is the only thing that makes the sender a fact.
  if (!verify(seal)) return null;

  const rumorJson = decrypt(seal.content, seal.pubkey, recipientSk);
  if (!rumorJson) return null;
  let rumor;
  try { rumor = JSON.parse(rumorJson); } catch { return null; }
  if (!rumor || rumor.kind !== DM_KIND) return null;
  // A rumor claiming a different author than the key that signed the seal is an
  // attempt to put words in somebody else's mouth. The seal wins.
  if (rumor.pubkey && rumor.pubkey !== seal.pubkey) return null;

  const at = Number(rumor.created_at) * 1000;
  return {
    text: String(rumor.content ?? "").slice(0, MAX_TEXT),
    pubkey: seal.pubkey,
    at: Number.isFinite(at) && at > 0 ? at : Date.now(),
    tags: Array.isArray(rumor.tags) ? rumor.tags : [],
  };
}

// Only what somebody outside this file actually calls. The first version
// exported all fifteen symbols on the theory that a crypto module should expose
// its primitives; nothing ever imported ten of them, and an unused export is a
// promise to keep something working that nobody uses.
module.exports = { WRAP_KIND, MAX_TEXT, wrap, unwrap, isKey };
