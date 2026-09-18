/**
 * Presence over Nostr — "someone near here is listening too", with no server.
 *
 * An HTTP version (`presence.js` plus `server/presence.mjs`) came first and
 * needed somewhere to run, which is why #10 sat open: standing up a server
 * contradicts the whole position. It never shipped switched on and has been
 * removed; this is the version that does not need one.
 *
 * Three properties make Nostr right for this specifically:
 *
 *  - **Ephemeral events.** NIP-01 reserves kinds 20000–29999 for events relays
 *    *should not* store, only forward to whoever is subscribed at the time.
 *
 *    Said precisely, because the first draft of this comment overclaimed and
 *    testing caught it: that is a SHOULD, not a MUST. Subscribing with a
 *    five-minute lookback returned an announcement from a previous run of this
 *    very app, which means at least one relay in the list keeps them for a
 *    while. So the honest claim is that we ask relays not to retain this and
 *    the convention is widely honoured — not that retention is impossible.
 *
 *    Which is exactly why the payload is built to be worthless if kept: a
 *    throwaway key, a station's coordinates rather than a person's, and those
 *    rounded to about twenty kilometres.
 *
 *  - **No account.** The keypair is generated at launch and thrown away at quit.
 *    A stable key would make you the same person across sessions, which is a
 *    small amount of tracking we have no use for.
 *
 *  - **No server of ours.** Relays are other people's, interchangeable, and
 *    several will refuse us on any given day — which is fine, because none of
 *    them is load-bearing.
 *
 * Honest expectation: **it will be an empty room at first.** Querying the major
 * relays for geotagged notes returned five in seven days (see
 * the decentralization notes in the vault). This is seeding a convention, not joining a
 * thriving one. It costs nothing when idle and shows nothing until people arrive.
 */

const crypto = require("node:crypto");
const { haversine } = require("./geo");
const fs = require("node:fs");
const path = require("node:path");
const { schnorr } = require("@noble/curves/secp256k1.js");
const priv = require("./nostr-private.js");
const identity_ = require("./identity.js");
const hubs = require("./hub.js");

/**
 * Kinds, and why these ones.
 *
 * The first version of this used kind 20808, chosen because nothing else used
 * it. That was exactly the mistake: a private room, correctly built, with nobody
 * in it. Measuring the result confirmed it — five geotagged notes across the
 * major relays in seven days.
 *
 * `bitchat` (permissionlesstech/bitchat, Unlicense, on both app stores) had
 * independently arrived at the same design — ephemeral kinds, a `g` geohash tag,
 * a fresh key per area, no accounts — and published a convention other people
 * are already using. Adopting it costs us nothing we had and gains us everyone
 * who is already there. Probed across four relays with a six-hour lookback: 321
 * distinct presence events and eleven live geohash channels, against our zero.
 *
 *   20001 — presence. Empty content, `g` tag only. Their rule, followed exactly,
 *           because a heartbeat that carries a payload is a different thing and
 *           other clients are entitled to assume it does not.
 *   20000 — a public message in a geohash channel.
 *   20808 — kept, ours alone, and the reason is below.
 */
const PRESENCE_KIND = 20001;
const CHAT_KIND = 20000;

/**
 * What is playing has nowhere to live in the shared convention: kind 20001 must
 * be empty. Rather than bend their format — which would make our heartbeats
 * wrong for every other client reading them — the label goes in an event of our
 * own that only we parse. Two small events a minute, and neither one lies.
 */
const LABEL_KIND = 20808;

/**
 * Location notes — bitchat's `/drop`, and the one kind here that relays keep.
 *
 * Kind 1 is an ordinary Nostr text note: stored, served to anyone who asks,
 * indexed by every client on the network. That is what makes a note a note
 * rather than a heartbeat, and it is a genuine break from everything else in
 * this file. Two consequences that belong in the interface, not just here:
 *
 *   **The twenty-four hours is a request.** NIP-40's `expiration` tag asks
 *   relays to drop the event afterwards, and bitchat's own source says relays
 *   are not required to honour it. Ours expire on the way to the screen because
 *   that is the only enforcement anybody actually controls.
 *
 *   **A dropped note cannot be unsent.** It is signed by the per-area key, and
 *   that key is gone at quit — so there is no way to publish the NIP-09 deletion
 *   that would ask relays to forget it. Nothing else in this app is permanent.
 *   This is.
 */
const NOTE_KIND = 1;

/** How long a note asks to live. bitchat's `locationDropExpirySeconds`. */
const NOTE_TTL_MS = 24 * 3600 * 1000;
const MAX_NOTES = 200;
const MAX_NOTE = 280;

/** The outer envelope of a private message. Its layers live in nostr-private.js. */
const WRAP_KIND = priv.WRAP_KIND;

/**
 * Relays that answered when this was written, and are always dialled.
 *
 * These are the well-known, well-connected ones. They are the floor: whatever
 * else we pick, a message should still reach the places most clients watch.
 * Several refuse connections on any given day, which is why this is a list
 * rather than a host, and a failure to connect is not an error worth surfacing.
 */
const ANCHORS = [
  "wss://nos.lol",
  "wss://relay.primal.net",
  "wss://nostr.wine",
];

/** How many geographically-near relays to add on top of the anchors. */
const NEARBY = 5;

/**
 * The relay directory, and why distance matters.
 *
 * Three hardcoded relays is why the geohash channels looked quieter than they
 * are. A conversation in Rio lives on the relays *near Rio* — Nostr has no
 * global broadcast, only servers that happen to hold an event and clients that
 * happen to ask them. Picking three servers once, months ago, and then
 * concluding the network is empty is a measurement error, not a finding.
 *
 * 411 relays with coordinates, from permissionlesstech/georelays (MIT) — the
 * same people who wrote bitchat.
 */
let DIRECTORY = null;
function directory() {
  if (DIRECTORY) return DIRECTORY;
  try {
    DIRECTORY = JSON.parse(
      fs.readFileSync(path.join(__dirname, "..", "data", "relays.json"), "utf8")).relays;
  } catch {
    DIRECTORY = [];        // anchors still work; this only ever adds reach
  }
  return DIRECTORY;
}

/**
 * Which relays to dial for a given cell.
 *
 * Note what this does *not* leak. The point we measure from is the station's,
 * not the listener's — the same coordinates already published in the `g` tag of
 * every event we send. Choosing a relay near Rio tells its operator that
 * somebody cares about Rio, which the event says out loud anyway. It says
 * nothing about where that somebody is sitting.
 */
/**
 * Relays the user added by hand, tried before anything we chose for them.
 *
 * Set from main out of prefs. Kept separate from ANCHORS so the shipped list
 * can change with an update without silently discarding somebody's own.
 */
/**
 * Hide inbound messages that did not pay for themselves.
 *
 * The one moderation tool that needs no moderator: spam is cheap to send and
 * proof of work makes it less so, at the price of also hiding anyone whose
 * client does not mine. Off by default, because that price is real — bitchat
 * does not mine, and a floor of 12 would silence every bitchat user in the room.
 *
 * Deliberately applies to messages and notes only, never to presence. Filtering
 * heartbeats would empty the listener count of everyone whose client does not
 * mine, which reads as "nobody is here" rather than as a filter doing its job.
 */
let powFloor = 0;
const setPowFloor = (n) => { powFloor = Number.isFinite(+n) && +n > 0 ? Math.min(+n, 32) : 0; };

/**
 * The hub we are in, if any: { name, tag, key }.
 *
 * One at a time, deliberately. A hub is somewhere you are, like a room — being
 * in four at once is a different product with a different interface, and the
 * app has no room to show it honestly.
 */
/**
 * ─── Looking somebody up ─────────────────────────────────────────────────────
 *
 * Kind 0 is a Nostr profile: a display name, a line about themselves, a NIP-05
 * address. Most people in these rooms are eight hex characters, and a name makes
 * the room legible.
 *
 * **One person at a time, and only when asked.** The obvious implementation is a
 * bulk fetch — `{kinds:[0], authors:[everyone here]}` — and it is the one thing
 * this must not do, because that author list *is* the cell. Every other
 * subscription in this file deliberately asks for everything and filters locally
 * so no relay learns which place we care about, and a bulk profile fetch would
 * hand them the same fact by another route. Asking about one person tells a relay
 * that somebody looked up that person, which is a far smaller thing and one the
 * user chose.
 *
 * Nothing is published. This only ever reads.
 */
const profiles = new Map();          // pubkey -> { name, about, nip05, at }
const pendingProfiles = new Map();   // pubkey -> resolve
const PROFILE_WAIT_MS = 4000;
const MAX_PROFILES = 300;

const clean = (v, n) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, n);

function takeProfile(evt) {
  let j = {};
  try { j = JSON.parse(evt.content || "{}") || {}; } catch { /* a profile we cannot read */ }
  const p = {
    name: clean(j.display_name || j.displayName || j.name, 40) || null,
    about: clean(j.about, 140) || null,
    // Shown as a claim, never as a verification: checking a NIP-05 means asking
    // that domain, which is a request to somebody else's server about a person
    // we are reading. Saying "they claim" is honest and costs nothing.
    nip05: clean(j.nip05, 60) || null,
    at: (evt.created_at || 0) * 1000,
  };
  const prev = profiles.get(evt.pubkey);
  if (!prev || p.at >= prev.at) profiles.set(evt.pubkey, p);
  while (profiles.size > MAX_PROFILES) profiles.delete(profiles.keys().next().value);
  const resolve = pendingProfiles.get(evt.pubkey);
  if (resolve) { pendingProfiles.delete(evt.pubkey); resolve(profiles.get(evt.pubkey)); }
}

/** Ask the relays about one person. Resolves with what came back, or null. */
function lookupProfile(pubkey) {
  if (!priv.isKey(pubkey)) return Promise.resolve(null);
  if (profiles.has(pubkey)) return Promise.resolve(profiles.get(pubkey));
  if (!alive().length) return Promise.resolve(null);
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (done) return; done = true; pendingProfiles.delete(pubkey); resolve(v); };
    pendingProfiles.set(pubkey, finish);
    send(["REQ", `who-${pubkey.slice(0, 8)}`, { kinds: [0], authors: [pubkey], limit: 1 }]);
    setTimeout(() => finish(profiles.get(pubkey) || null), PROFILE_WAIT_MS);
  });
}

/** Everything looked up so far, for a renderer that wants to show names. */
const knownProfiles = () => Object.fromEntries(profiles);

let hub = null;
const hubMessages = [];

let extraRelays = [];
function setExtraRelays(urls) {
  const clean = (Array.isArray(urls) ? urls : [])
    .map((u) => String(u || "").trim())
    // wss only. A ws:// relay would carry presence in clear over the network,
    // which is a strange thing to opt into on the privacy path, and http(s)
    // URLs are simply not relays.
    .filter((u) => /^wss:\/\/[a-z0-9.-]+(:\d{1,5})?(\/\S*)?$/i.test(u) && u.length <= 200)
    .slice(0, 8);
  const changed = clean.join() !== extraRelays.join();
  extraRelays = clean;
  // Reconnect only if the set actually moved; this is called on every prefs
  // change, most of which are palettes.
  if (changed && here) {
    for (const w of sockets) { try { w.close(); } catch {} }
    sockets = [];
    connect();
  }
  return extraRelays.slice();
}

function relaysFor(cell) {
  const list = [...extraRelays, ...ANCHORS];
  const dir = directory();
  if (!cell || !dir.length) return list;
  const c = ungeohash(cell);
  if (!c) return list;

  const near = dir
    .map(([url, lat, lon]) => ({ url, km: haversine(c.lat, c.lon, lat, lon) }))
    .sort((a, b) => a.km - b.km);

  for (const { url } of near) {
    if (list.length >= extraRelays.length + ANCHORS.length + NEARBY) break;
    if (!list.includes(url)) list.push(url);
  }
  return list;
}

const BEAT_MS = 60_000;
const STALE_MS = 4 * 60_000;      // drop a peer we have not heard from
/**
 * ~20 km. Enough for "near here", too coarse to find anyone.
 *
 * It is also bitchat's "province" level, which is the one we were already using
 * before we knew that — so joining the shared convention needed no change to the
 * privacy dial, which would have been the one change worth arguing about.
 */
const GEOHASH_PRECISION = 4;

/** Longest message we will send or accept. Anything past this is not a chat. */
const MAX_MESSAGE = 400;

/** Most messages we keep per channel; older ones fall off the top. */
const HISTORY = 200;

const B32 = "0123456789bcdefghjkmnpqrstuvwxyz";

/** Standard geohash. Deliberately truncated — precision here is a privacy dial. */
function geohash(lat, lon, precision = GEOHASH_PRECISION) {
  let latMin = -90, latMax = 90, lonMin = -180, lonMax = 180;
  let hash = "", bits = 0, bit = 0, even = true;
  while (hash.length < precision) {
    if (even) {
      const mid = (lonMin + lonMax) / 2;
      if (lon > mid) { bit = (bit << 1) + 1; lonMin = mid; } else { bit = bit << 1; lonMax = mid; }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat > mid) { bit = (bit << 1) + 1; latMin = mid; } else { bit = bit << 1; latMax = mid; }
    }
    even = !even;
    if (++bits === 5) { hash += B32[bit]; bits = 0; bit = 0; }
  }
  return hash;
}

/** Centre of a geohash cell, for putting a peer on the globe. */
function ungeohash(hash) {
  let latMin = -90, latMax = 90, lonMin = -180, lonMax = 180, even = true;
  for (const ch of String(hash).toLowerCase()) {
    const idx = B32.indexOf(ch);
    if (idx < 0) return null;
    for (let b = 4; b >= 0; b--) {
      const on = (idx >> b) & 1;
      if (even) {
        const mid = (lonMin + lonMax) / 2;
        on ? (lonMin = mid) : (lonMax = mid);
      } else {
        const mid = (latMin + latMax) / 2;
        on ? (latMin = mid) : (latMax = mid);
      }
      even = !even;
    }
  }
  return { lat: (latMin + latMax) / 2, lon: (lonMin + lonMax) / 2 };
}

const hex = (b) => Buffer.from(b).toString("hex");

/**
 * A separate identity for every place, and none of them persisted.
 *
 * One key per launch was already better than most: nothing is stored, nothing is
 * asked for, and closing the app ends the identity. But within a session the same
 * key signed from every geohash visited, which leaves a trail on relays nobody
 * asked to publish — this key heard Reykjavik, then Lagos, then Tokyo, in that
 * order, on that evening. A listening history assembled by someone else.
 *
 * BitChat solves it with ephemeral keys per geohash area and so does this. Cell 4
 * geohashes are about twenty kilometres, so the identity changes when the place
 * does and never spans two of them.
 *
 * Capped, because a long session touching many places would otherwise hold keys
 * for all of them. Oldest first — the current cell is always the most recently
 * used, so it is never the one dropped.
 */
const MAX_IDENTITIES = 64;
const identities = new Map();     // geohash -> { sk, pk }

function identity(geohash) {
  const cell = String(geohash || "~");
  let id = identities.get(cell);
  if (id) {
    // Re-inserted so Map iteration order stays least-recently-used first.
    identities.delete(cell);
    identities.set(cell, id);
    return id;
  }
  const sk = schnorr.utils.randomSecretKey();
  id = { sk, pk: hex(schnorr.getPublicKey(sk)) };
  identities.set(cell, id);
  while (identities.size > MAX_IDENTITIES) {
    identities.delete(identities.keys().next().value);
  }
  return id;
}

/** Every pubkey this run has used, so a message can be recognised as ours. */
const mineKeys = () => new Set([...identities.values()].map((i) => i.pk));

/** Throw all of them away. Nothing to erase on disk — they were never written. */
function forgetIdentities() { identities.clear(); }

/**
 * NIP-01 event id: sha256 over a canonical array. Order is part of the spec.
 *
 * Signs with the key belonging to the event's own `g` tag, so the identity is
 * always the one for the place being posted to.
 */
/**
 * ─── Saying who we are, and paying to be heard ───────────────────────────────
 *
 * **The client tag (NIP-89).** A tag naming the software that made the event.
 * There was one already, on kind 20808 — an event only we parse, so it told
 * nobody anything. A five-minute census of live geohash traffic found 104 people
 * present and every self-identifying event saying `glub.chat`; AuralFM was not
 * countable at all. This puts it where other clients actually look.
 *
 * **Proof of work (NIP-13).** A `nonce` tag mined until the event id starts with
 * `POW_TARGET` zero bits. It is not a hoop for its own sake: clients on this
 * network offer a filter that hides messages below a difficulty, so an unmined
 * message is one they may never render. Measured on this project's reference
 * machine — the 2019 i5-8257U the captions work was benchmarked on:
 *
 *     difficulty 8    3ms median,     11ms worst of eight
 *     difficulty 12  46ms median,    110ms worst      <- what the network uses
 *     difficulty 16 670ms median,  1,250ms worst
 *     difficulty 20  7.9s median,   16.3s worst
 *
 * Twelve, because it is what the rest of the network mines to and it costs a
 * twentieth of a second on the slowest machine this project supports. Sixteen
 * would be a perceptible pause before every sentence; twenty is unusable there.
 *
 * Mining blocks, so it is capped. Past the deadline the nonce is dropped and the
 * event goes out unmined rather than holding up the app — a message that arrives
 * is worth more than one that meets a target nobody may be checking. Sending
 * without the tag is honest; sending a `nonce` that claims a difficulty the id
 * does not have is not, and would be rejected anyway.
 */
const CLIENT = "auralfm";
const POW_TARGET = 12;
const POW_DEADLINE_MS = 1500;

/** NIP-13 difficulty: leading zero bits of the id, counted from the hex. */
function powBits(idHex) {
  let n = 0;
  for (const ch of idHex) {
    const v = parseInt(ch, 16);
    if (Number.isNaN(v)) return 0;
    if (v === 0) { n += 4; continue; }
    return n + Math.clz32(v) - 28;
  }
  return n;
}

const serialize = (p, evt, tags) =>
  JSON.stringify([0, p, evt.created_at, evt.kind, tags, evt.content]);

function sign(evt, { pow = POW_TARGET } = {}) {
  // A hub message has no `g` tag — it belongs to a room, not a place — so its
  // identity is scoped to the hub instead. Same rule either way: the key that
  // signs is the key for the thing being posted to.
  const cell = (evt.tags || []).find((t) => t[0] === "g")?.[1]
            || (evt.tags || []).find((t) => t[0] === "h")?.[1]
            || null;
  const { sk: k, pk: p } = identity(cell);

  let tags = evt.tags || [];
  if (!tags.some((t) => t[0] === "client")) tags = [...tags, ["client", CLIENT]];

  let id = crypto.createHash("sha256").update(serialize(p, evt, tags)).digest();
  if (pow > 0) {
    const stop = Date.now() + POW_DEADLINE_MS;
    let nonce = 0;
    for (;;) {
      const tried = [...tags, ["nonce", String(nonce), String(pow)]];
      const h = crypto.createHash("sha256").update(serialize(p, evt, tried)).digest();
      if (powBits(hex(h)) >= pow) { tags = tried; id = h; break; }
      nonce++;
      // Checked rarely: Date.now() in the inner loop costs more than the hash.
      if ((nonce & 0x3ff) === 0 && Date.now() > stop) break;
    }
  }
  return { ...evt, tags, pubkey: p, id: hex(id), sig: hex(schnorr.sign(id, k)) };
}

let sockets = [];
let beat = null;
let here = null;                  // { geohash, label }
const peers = new Map();          // pubkey -> { geohash, label, at }
/**
 * Three lists, and one seen-set each. The pairing is the point.
 *
 * Relays deliver the same event more than once — several relays carry it, and
 * re-issuing a REQ under a subscription id that already exists makes the relay
 * replay everything stored that matches. So each list needs to know what it has
 * already taken.
 *
 * This was a single shared set, and that was a bug rather than a simplification.
 * The three lists have three different lifetimes: chat is emptied whenever the
 * view moves, notes survive that and are emptied only on a real move, private
 * messages survive both. One set could only be cleared on the shortest of those
 * lifetimes, so `view()` cleared it for the chat's sake — and the very next
 * subscription replayed a note the still-populated notes list was holding, which
 * appended a second copy. Melton found it with seven identical notes on screen
 * from one stranger who had said "hola" once.
 *
 * The rule, therefore: **a set is cleared exactly where its list is, on the same
 * lines.** Anything else and the two disagree about what has been seen. The one
 * deliberate exception is `forgetDms`, which says why on the spot.
 */
const messages = [];              // newest last, capped at HISTORY
const seenChat = new Set();
let onPeers = () => {};
let onMessages = () => {};

const notes = [];                 // location notes for the cell we are in
const seenNotes = new Set();
const dms = [];                   // private messages, decrypted, this session
const seenDms = new Set();
let onNotes = () => {};
let onDms = () => {};
let onHub = () => {};
/** Set by main so an authenticated favorite signal can be recorded. */
let onFavorited = () => {};

/**
 * Every key that may appear in a `p` tag addressed to us, and its secret.
 *
 * Two sources, and they are not the same kind of thing. The per-area keys are
 * already published in presence, so subscribing for envelopes addressed to them
 * tells relays nothing they were not told by the heartbeat — that is the
 * zero-cost path, and it only works while both people are in the same room in
 * the same session. The durable key is the opt-in one from identity.js, and it
 * is the only reason a message can reach you tomorrow.
 */
function inboxes() {
  const out = new Map();
  for (const { sk, pk } of identities.values()) out.set(pk, sk);
  const dpk = identity_.pubkey();
  if (dpk) out.set(dpk, identity_.secret());
  return out;
}

const alive = () => sockets.filter((w) => w.readyState === 1);

function prune() {
  const cut = Date.now() - STALE_MS;
  let changed = false;
  for (const [k, v] of peers) if (v.at < cut) { peers.delete(k); changed = true; }
  if (changed) emit();
}

/**
 * ─── One update per frame, not one per packet ────────────────────────────────
 *
 * Every inbound event used to hand the renderer a freshly built copy of the
 * whole list it belonged to. Measured against live relays for fifteen seconds
 * from a standing start in Mexico City:
 *
 *   peers known                545
 *   onPeers fired            2,939      ~196 per second
 *   objects handed over  1,245,312      because each call rebuilt all 545
 *
 * In Electron each of those crosses a process boundary — structured-cloned,
 * queued, and repainted at the other end. Two thousand nine hundred of them
 * queue *ahead of* the reply to whatever the renderer asked for next, which is
 * why `presenceStats()` took twelve seconds right after tuning and the chat
 * looked dead exactly when somebody opened it.
 *
 * Nothing about what is sent changes. What changes is how often: a dirty flag
 * per list and one flush on a short timer, so a burst of two hundred events
 * costs one update instead of two hundred.
 *
 * `FLUSH_MS` is a hair under a tenth of a second. Long enough that a relay
 * dumping its backlog collapses into a handful of updates, short enough that
 * nobody perceives it — and the paths where a person is *waiting* on their own
 * action do not wait for it at all: `say`, `drop`, `dm` and every clear call
 * `flush()` on the spot.
 */
const FLUSH_MS = 90;
const dirty = { peers: false, messages: false, notes: false, dms: false, hub: false };
let flushTimer = null;

function schedule(what) {
  dirty[what] = true;
  if (flushTimer) return;
  flushTimer = setTimeout(flush, FLUSH_MS);
}

/** Send whatever is dirty, now. Safe to call when nothing is. */
function flush() {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  if (dirty.peers)    { dirty.peers = false;    onPeers(peerList()); }
  if (dirty.messages) { dirty.messages = false; onMessages(messages.slice()); }
  if (dirty.notes)    { dirty.notes = false;    onNotes(liveNotes()); }
  if (dirty.dms)      { dirty.dms = false;      onDms(dms.slice()); }
  if (dirty.hub)      { dirty.hub = false;      onHub(hubMessages.slice()); }
}

const emit = () => schedule("peers");

/** For anything the person just did themselves — no waiting for the timer. */
const emitNow = (what) => { dirty[what] = true; flush(); };

function peerList() {
  const list = [];
  for (const [pubkey, v] of peers) {
    const c = ungeohash(v.geohash);
    // The cell travels with the peer. Without it the renderer can only place a
    // ring on the globe, and any count it shows beside a place name would be a
    // worldwide total wearing a local label.
    // `id` is the label — eight characters is enough to tell two strangers
    // apart on screen. `pubkey` is the address, and it has to be all of it:
    // without it a renderer can see that somebody is here and can do nothing
    // about it, because favoriting and messaging both need the whole key. That
    // is not a leak — this key was announced to every relay we are connected
    // to, by them, which is how we know they are here at all.
    if (c) list.push({ id: pubkey.slice(0, 8), pubkey, lat: c.lat, lon: c.lon,
                       label: v.label, geohash: v.geohash });
  }
  return list;
}

/**
 * How far back to ask for.
 *
 * Ephemeral kinds are ones relays are *asked* to forward and forget, so this is
 * a request rather than an expectation — some keep them for a while, most do
 * not. Six hours matches what bitchat's own gossip sync retains, so where a
 * relay does hold them the two apps agree on how much history a room has.
 *
 * What it fixes: joining a cell used to show only what arrived *after* you got
 * there. A room with people in it read as dead for the first few minutes, which
 * is exactly when someone decides whether it is worth staying.
 */
const LOOKBACK_SEC = 6 * 3600;

/**
 * Ask a relay for the room.
 *
 * Deliberately not filtered by geohash. Putting our own cell in the filter would
 * tell every relay we connect to roughly where we are, which is the one thing
 * this design exists to avoid — so the bandwidth is spent instead and the
 * filtering happens locally.
 *
 * The subscription id is constant on purpose: NIP-01 says a REQ reusing an
 * existing id *replaces* that subscription, so re-sending on a cell change
 * re-asks for history without opening a second one or closing the first.
 */
/**
 * Send one frame to the relays, or to just one of them.
 *
 * `only` is for a socket that has only now connected: without it, announcing on
 * each `onopen` broadcast to every socket already up, so three relays received
 * six copies of the same heartbeat instead of three. Harmless to us and rude to
 * them, which is the same category of mistake as the retry loop that got us
 * blocked by Celestrak.
 */
function send(frame, only) {
  const msg = JSON.stringify(frame);
  for (const w of (only ? [only] : alive())) {
    if (w.readyState !== 1) continue;
    try { w.send(msg); } catch { /* relay went away */ }
  }
}

function subscribe(only) {
  send(["REQ", "auralfm", {
    kinds: [PRESENCE_KIND, CHAT_KIND, LABEL_KIND],
    since: Math.floor(Date.now() / 1000) - LOOKBACK_SEC,
  }], only);
  subscribeNotes(only);
  subscribeDms(only);
}

/**
 * Ask for the notes left at this place — and, unlike everything above, tell the
 * relay which place that is.
 *
 * This is the one filtered subscription in the file, and the exception needs a
 * reason rather than an apology. Kind 1 is the most common event type on Nostr;
 * asking for it unfiltered is asking for the entire public firehose to filter
 * three notes out of it. That is not a privacy win, it is a broken client.
 *
 * So the cell goes in the filter, and the rule that makes it acceptable is:
 * **only ever the cell we are already announcing into.** A presence heartbeat
 * signed by our key, tagged with that cell, has already gone to these same
 * relays — the filter discloses nothing that the announcement did not.
 *
 * Which is exactly why `viewing` is excluded. Spinning the globe would otherwise
 * ask a dozen relays a minute about a dozen different cells, with no
 * announcement to justify any of them, and that is a browsing trail. Notes are
 * for the place you are listening to, and browsing shows none. That costs a
 * feature something real and it is the right way round.
 */
function subscribeNotes(only) {
  if (!here) return;
  send(["REQ", "auralfm-notes", {
    kinds: [NOTE_KIND],
    "#g": [here.geohash],
    since: Math.floor((Date.now() - NOTE_TTL_MS) / 1000),
    limit: MAX_NOTES,
  }], only);
}

/**
 * Ask for private envelopes addressed to any key we hold.
 *
 * A `#p` filter is unavoidable here — that tag *is* the address, and a client
 * that would not name it could not receive anything. For the per-area keys it
 * costs nothing, per `inboxes()`. For the durable key it is the linkability
 * already documented in identity.js, which is why that key does not exist until
 * somebody switches it on.
 */
function subscribeDms(only) {
  const keys = [...inboxes().keys()];
  if (!keys.length) return;
  send(["REQ", "auralfm-dm", {
    kinds: [WRAP_KIND],
    "#p": keys,
    // Envelope timestamps are fuzzed by up to fifteen minutes in both
    // directions, so a window that ends exactly now would drop a message that
    // was sent moments ago with a clock nudged forward.
    since: Math.floor(Date.now() / 1000) - LOOKBACK_SEC - 900,
    limit: 200,
  }], only);
}

/** Push one signed event to relays. */
const publish = (evt, only) => send(["EVENT", evt], only);

function announce(only) {
  if (!here) return;
  const created_at = Math.floor(Date.now() / 1000);

  // The shared heartbeat. Empty content and a `g` tag, nothing else — the
  // convention says so and other clients read it.
  publish(sign({ kind: PRESENCE_KIND, created_at, tags: [["g", here.geohash]], content: "" }), only);

  // Ours: the same cell, plus what is playing there.
  publish(sign({
    kind: LABEL_KIND, created_at,
    tags: [["g", here.geohash]],
    content: JSON.stringify({ l: here.label }),
  }), only);
}

/**
 * Say something in the geohash channel you are listening to.
 *
 * Deliberately not encrypted and deliberately not private: this is a public
 * square scoped to a twenty-kilometre cell, and it should be as obvious to the
 * person typing as it is to the relays. Private messaging over Nostr is a
 * different feature with a different threat model, and bitchat's own private
 * envelope is explicitly not NIP-17 — interoperating with it is not something to
 * do by halves.
 *
 * @returns {boolean} whether anything was sent
 */
function say(text, nickname) {
  const body = String(text || "").trim().slice(0, MAX_MESSAGE);
  if (!here || !body || !alive().length) return false;
  /**
   * Always teleported, and this is the honest part.
   *
   * bitchat's `t: teleport` tag marks someone posting into a cell they are not
   * physically in. For their users that is occasional. For us it is *universal*:
   * the cell is always the station's or the receiver's, never the listener's —
   * that is the whole privacy design. Somebody in Houston listening to Rio
   * appears in Rio's channel, and without this tag that reads as a claim to be
   * standing there.
   *
   * Their clients can then show us for what we are: present in the conversation,
   * not present in the place.
   */
  const tags = [["g", here.geohash], ["t", "teleport"]];
  const nick = String(nickname || "").trim().slice(0, 32);
  if (nick) tags.push(["n", nick]);
  const evt = sign({
    kind: CHAT_KIND, created_at: Math.floor(Date.now() / 1000), tags, content: body,
  });
  publish(evt);
  // Show it immediately rather than waiting for a relay to echo it back — some
  // never do, and a chat that swallows your own message feels broken.
  record(evt, true);
  flush();                    // your own words appear now, not in 90ms
  return true;
}

/**
 * Leave a note at this place, for a day.
 *
 * The wire format is bitchat's exactly: kind 1, a `g` tag, an optional `n`
 * nickname, and a NIP-40 `expiration`. What differs is the cell size, and the
 * difference is worth stating because it decides who can read this.
 *
 * bitchat drops notes at geohash precision 8 — about nineteen metres — and
 * subscribes to that cell plus its eight neighbours. That is right for a phone
 * in a crowd. It is wrong here: our cell is the *station's* location, and a
 * nineteen-metre box around a transmitter mast is a place no listener will ever
 * stand in, let alone return to. So notes go in the same cell as the
 * conversation — the twenty-kilometre room the chat already uses.
 *
 * The consequence, plainly: **we can read their notes and they cannot read
 * ours.** Their filter names precision-8 cells exactly, so a precision-4 tag
 * will not match it. Ours arrive because a bitchat note dropped anywhere inside
 * our cell shares our prefix, and prefix matching is what `sameCell` already
 * does. Asymmetric, and the readable direction is the useful one.
 *
 * @returns {boolean} whether anything was published
 */
function drop(text, nickname) {
  const body = String(text || "").trim().slice(0, MAX_NOTE);
  if (!here || !body || !alive().length) return false;
  const expires = Math.floor((Date.now() + NOTE_TTL_MS) / 1000);
  const tags = [["g", here.geohash], ["expiration", String(expires)]];
  const nick = String(nickname || "").trim().slice(0, 32);
  if (nick) tags.push(["n", nick]);
  const evt = sign({
    kind: NOTE_KIND, created_at: Math.floor(Date.now() / 1000), tags, content: body,
  });
  publish(evt);
  recordNote(evt, true);
  flush();
  return true;
}

/** Keep a note, drop the expired, newest first. */
function recordNote(evt, mine = false) {
  if (seenNotes.has(evt.id)) return;
  seenNotes.add(evt.id);
  const exp = (evt.tags || []).find((t) => t[0] === "expiration")?.[1];
  const expiresAt = Number(exp) > 0 ? Number(exp) * 1000 : null;
  notes.push({
    id: evt.id,
    at: (evt.created_at || 0) * 1000,
    expiresAt,
    geohash: (evt.tags || []).find((t) => t[0] === "g")?.[1] || null,
    from: String(evt.pubkey || "").slice(0, 8),
    pubkey: String(evt.pubkey || ""),
    nick: (evt.tags || []).find((t) => t[0] === "n")?.[1]?.slice(0, 32) || null,
    text: String(evt.content || "").slice(0, MAX_NOTE),
    mine,
  });
  emitNotes();
}

/**
 * Publish the notes, minus anything past its expiry.
 *
 * Filtered on the way out rather than on a timer: relays are not obliged to
 * honour NIP-40, so an expired note can arrive at any moment and a note on
 * screen can cross its own deadline while being read. Checking here means both
 * cases are the same case.
 */
function liveNotes() {
  const now = Date.now();
  for (let i = notes.length - 1; i >= 0; i--) {
    if (notes[i].expiresAt && notes[i].expiresAt <= now) notes.splice(i, 1);
  }
  notes.sort((a, b) => b.at - a.at);
  if (notes.length > MAX_NOTES) notes.length = MAX_NOTES;
  return notes.slice();
}

const emitNotes = () => schedule("notes");

/**
 * Send a private message to one key.
 *
 * Everything hard about this is in nostr-private.js. What is decided here is
 * *which key signs it*: the per-area identity for the cell we are in, so the
 * sender the recipient authenticates is the same identity they can see in the
 * room — unless the durable identity is on, in which case that is used, because
 * a reply tomorrow has to reach somewhere.
 *
 * @param {string} to    recipient pubkey, 64 hex
 * @param {string} text
 * @param {Array<Array<string>>} [tags]  inner tags; `["fav","1"]` is the
 *   favorite signal, carried inside the encrypted rumor where only they see it
 * @returns {boolean}
 */
function dm(to, text, tags = []) {
  if (!priv.isKey(to) || !alive().length) return false;
  const dsk = identity_.secret();
  const sk = dsk || (here ? identity(here.geohash).sk : null);
  if (!sk) return false;
  const evt = priv.wrap(text, to, sk, tags);
  if (!evt) return false;
  publish(evt);

  // A bodiless envelope is a signal, not a message — the favorite handshake. It
  // goes on the wire and nowhere near the log, because a blank line in a
  // conversation is a rendering bug wearing a feature's clothes.
  const body = String(text ?? "").trim();
  if (!body) return true;

  // Ours, shown at once. A private message that waits for a relay echo looks
  // like it failed, and unlike the public channel there is no second chance to
  // notice — nobody else will repeat it.
  const from = hex(schnorr.getPublicKey(sk));
  dms.push({ id: evt.id, at: Date.now(), with: to, pubkey: from,
             from: from.slice(0, 8), nick: null,
             text: body.slice(0, priv.MAX_TEXT), mine: true, unread: false });
  trimDms();
  emitNow("dms");
  return true;
}

function trimDms() {
  dms.sort((a, b) => a.at - b.at);
  if (dms.length > HISTORY) dms.splice(0, dms.length - HISTORY);
}

/** Add a message to the log, newest last, and tell the renderer. */
function record(evt, mine = false) {
  if (seenChat.has(evt.id)) return;
  seenChat.add(evt.id);
  const g = (evt.tags || []).find((t) => t[0] === "g")?.[1] || null;
  messages.push({
    id: evt.id,
    at: (evt.created_at || 0) * 1000,
    geohash: g,
    // Two forms on purpose. `from` is a label — eight characters is enough to
    // tell two strangers apart in a list. `pubkey` is the identity, and muting
    // has to key on all of it: eight hex characters is thirty-two bits, and
    // grinding a key that collides with somebody's mute entry is trivial.
    from: String(evt.pubkey || "").slice(0, 8),
    pubkey: String(evt.pubkey || ""),
    nick: (evt.tags || []).find((t) => t[0] === "n")?.[1]?.slice(0, 32) || null,
    // Someone posting into a cell they are not standing in — us, always, and
    // some of them. Worth showing rather than flattening.
    teleport: (evt.tags || []).some((t) => t[0] === "t" && t[1] === "teleport"),
    /**
     * What they are using, if their client says so (NIP-89).
     *
     * Already on the wire and previously thrown away. Worth keeping because the
     * first question anyone asks about this room is who these people are, and
     * "a bitchat user on a phone" is a different answer from "someone on the web
     * client". Untrusted like everything else here: it is a string a stranger
     * chose, so it is clipped and never interpreted.
     */
    client: ((evt.tags || []).find((t) => t[0] === "client")?.[1] || "")
      .slice(0, 24).replace(/[^\w.\- ]/g, "") || null,
    text: String(evt.content || "").slice(0, MAX_MESSAGE),
    mine,
  });
  // created_at is whatever the sender's clock said, so arrival order is not
  // time order. Sort rather than trust it.
  messages.sort((a, b) => a.at - b.at);
  if (messages.length > HISTORY) messages.splice(0, messages.length - HISTORY);
  schedule("messages");
}

/**
 * Try to open an inbound envelope.
 *
 * Relays send every wrap matching the `#p` filter, and the filter is the only
 * routing there is — so most of what arrives here is either ours to read or a
 * near miss. Nothing is trusted: `priv.unwrap` returns null unless the outer
 * signature is valid, the `p` tag names exactly us, and the inner seal's own
 * signature verifies. A message that fails any of those is silently dropped,
 * because a stranger's malformed event is not an error condition.
 */
function takeDm(evt) {
  if (seenDms.has(evt.id)) return;
  const box = inboxes();
  const p = (evt.tags || []).find((t) => t[0] === "p")?.[1];
  const sk = p && box.get(p);
  if (!sk) return;                      // not addressed to a key we hold
  const got = priv.unwrap(evt, sk, p);
  if (!got) return;
  seenDms.add(evt.id);

  /**
   * The favorite signal, and why it is trusted.
   *
   * `got.pubkey` came from a seal whose signature verified, so this is a
   * statement by the holder of that key and cannot be forged by a relay or a
   * bystander. It sets `mutual` only — never `favorite`. Somebody adding you is
   * not you adding them.
   */
  const fav = got.tags.find((t) => t[0] === "fav")?.[1];
  if (fav === "1" || fav === "0") {
    onFavorited(got.pubkey, fav === "1");
    // A bare favorite handshake is a signal, not something to show in a
    // conversation. Only surface it if the sender also said something.
    if (!got.text.trim()) return;
  }

  /**
   * `from` matters, and its absence was a visible bug.
   *
   * The renderer labels every line with `m.nick || m.from`. Chat records carry
   * both; these carried neither, so a real inbound private message rendered its
   * sender as the string "undefined". Self-addressed tests never showed it —
   * those arrive with `mine: true` and render as "you".
   *
   * `nick` is null on purpose rather than absent. A private envelope has nowhere
   * to put a nickname: the rumor's tags are the favorite signal, and trusting a
   * self-declared name inside an encrypted message would be worse than showing
   * the key, because the key is the thing that was actually authenticated.
   */
  dms.push({ id: evt.id, at: got.at, with: got.pubkey, pubkey: got.pubkey,
             from: got.pubkey.slice(0, 8), nick: null,
             text: got.text, mine: false, unread: true });
  trimDms();
  schedule("dms");
}

let dialled = [];        // what relaysFor() chose for the cell we are in

function connect() {
  if (sockets.length) return;
  dialled = relaysFor(here?.geohash);
  for (const url of dialled) {
    let w;
    try { w = new WebSocket(url); } catch { continue; }
    sockets.push(w);
    w.onopen = () => {
      // Listen for anyone in any cell, and filter locally. Putting our own
      // geohash in the filter would tell every relay we connect to roughly where
      // we are, which is the one thing this design exists to avoid — so the
      // bandwidth is spent instead.
      subscribe(w);
      announce(w);          // this relay only; the others already have it
    };    /**
     * Everything in here is a stranger's relay describing an event, so nothing in
     * here may be trusted to have the shape it claims. A throw used to reach the
     * main process with no listener above it, which is how a malformed event became
     * a dialog box with a stack trace in it.
     */
    w.onmessage = (m) => {
      try {
      let d;
      try { d = JSON.parse(m.data); } catch { return; }
      if (d[0] !== "EVENT" || !d[2]) return;
      const e = d[2];

      /**
       * A private envelope, handled before the `g` check below — it has no
       * geohash and never should. Also before the "ours, echoed back" check: the
       * gift wrap is signed by a one-time key that is nobody's, so there is
       * nothing to recognise.
       */
      if (e.kind === WRAP_KIND) { takeDm(e); return; }

      // A profile we asked for. No geohash, and none expected.
      if (e.kind === 0) { takeProfile(e); return; }

      /**
       * A hub message, which has no geohash and never should — it belongs to a
       * room rather than a place. Handled before the `g` gate below, which would
       * otherwise drop it for the very thing that makes it a hub message.
       */
      const h = (e.tags || []).find((t) => t[0] === "h")?.[1];
      if (h) {
        if (hub && h === hub.tag && !mineKeys().has(e.pubkey)) takeHub(e);
        return;
      }

      // Our own, echoed back. Every key this run has used, not one — there is a
      // key per place now, and comparing against a single `pk` stopped compiling
      // the moment that changed.
      if (mineKeys().has(e.pubkey)) return;
      const g = (e.tags || []).find((t) => t[0] === "g")?.[1];
      if (!g || !/^[0-9b-hjkmnp-z]{2,9}$/.test(g)) return;

      // Below the floor the reader set, this never happened. Checked before any
      // parsing work, since the whole point is to not pay for spam.
      if (powFloor && (e.kind === NOTE_KIND || e.kind === CHAT_KIND)
          && powBits(String(e.id || "")) < powFloor) return;

      if (e.kind === NOTE_KIND) {
        // Only the cell we are standing in, and prefix matching so a bitchat
        // note pinned to a street inside our cell still counts as here.
        if (!here || !sameCell(g, here.geohash)) return;
        if (!e.content || String(e.content).length > MAX_NOTE) return;
        recordNote(e);
        return;
      }

      if (e.kind === CHAT_KIND) {
        // The cell being listened to, or the one being looked at. Every other
        // channel on the network is someone else's conversation.
        const mine = here && sameCell(g, here.geohash);
        const seen = viewing && sameCell(g, viewing);
        if (!mine && !seen) return;
        if (!e.content || String(e.content).length > MAX_MESSAGE) return;
        record(e);
        return;
      }

      // Presence, either flavour. The label only exists in ours; a bitchat peer
      // is simply present, which is the whole claim being made.
      let label = null;
      if (e.kind === LABEL_KIND) {
        try { label = JSON.parse(e.content)?.l ?? null; } catch { /* optional */ }
      }
      const prev = peers.get(e.pubkey);
      peers.set(e.pubkey, {
        geohash: g,
        label: String(label ?? prev?.label ?? "").slice(0, 60),
        at: Date.now(),
      });
      emit();
    
      } catch (err) {
        // One bad event is not worth a reconnect, let alone a crash.
        console.error('presence: dropped a malformed relay event —', err.message);
      }
    };

    w.onerror = () => { /* a relay refusing us is normal, see the note above */ };
    w.onclose = () => { sockets = sockets.filter((s) => s !== w); };
  }
}

/**
 * Start announcing. Nothing is sent until this is called, and it is called only
 * when the user has switched presence on.
 *
 * @param {number} lat  the *station's* coordinates, not the listener's
 * @param {number} lon
 * @param {string} label  what is playing, or a band name
 */
/**
 * The cell being *looked at*, which is not always the cell being listened to.
 *
 * With the lock off, sweeping the globe moves the place and the station list.
 * The chat should move with them — that is the whole scanning metaphor — but
 * *announcing* must not. Spinning the world would publish presence into dozens
 * of cells a minute, which is a location trail, broadcast, at exactly the moment
 * someone is browsing idly.
 *
 * So the two are split and only one of them ever speaks:
 *
 *   `here`    where we are listening. Announced. Can send.
 *   `viewing` where we are looking. Read only. Never announced, never sent.
 *
 * Messages are kept for either. Nothing else changes: the subscription was
 * already "everything, filter locally", precisely so no relay learns which cell
 * we care about, and that stays true with two cells instead of one.
 */
let viewing = null;

/**
 * Look at a cell without joining it.
 *
 * Passing null goes back to hearing only the listening cell — which is what
 * locking, or playing something, should do.
 */
function view(lat, lon) {
  const cell = (Number.isFinite(lat) && Number.isFinite(lon)) ? geohash(lat, lon) : null;
  if (cell === viewing) return;
  viewing = cell;
  // The log is per-cell, so moving the view has to clear what belonged to the
  // last one — otherwise Lisbon's conversation appears under Tokyo's name.
  //
  // The chat and nothing else. Notes are subscribed on `here`, not `viewing`, so
  // looking elsewhere does not change which notes are ours to hold — and the
  // re-subscription below replays them, which is exactly how one note became
  // seven when this cleared a set the notes list also depended on.
  messages.length = 0;
  seenChat.clear();
  emit();
  emitNow("messages");        // flushes the peer list with it
  // Re-ask, so a cell that is quiet right now still shows its recent history
  // rather than looking dead until somebody speaks.
  if (sockets.length) subscribe();
}

function join(lat, lon, label) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
  const cell = geohash(lat, lon);
  // Tuning across the world changes which room you are in. The old room's
  // conversation is not yours any more, and showing it against a new place
  // would be a lie about where those people are.
  const moved = here && here.geohash !== cell;
  if (moved) {
    messages.length = 0;
    seenChat.clear();
    peers.clear();
    // Notes belong to the place, not the session — a note left in Lisbon shown
    // under Tokyo's name is the same lie as Lisbon's conversation would be.
    notes.length = 0;
    seenNotes.clear();
    emit();
    emitNow("messages");
    emitNow("notes");
  }
  here = { geohash: cell, label: String(label || "").slice(0, 60) };

  // Tuning from Rio to Tokyo changes which relays are near, and staying on the
  // old set would mean announcing into Tokyo's channel on South America's
  // servers — technically valid, and nobody there would ever see it.
  if (moved && dialled.join() !== relaysFor(cell).join()) {
    for (const w of sockets) { try { w.close(); } catch {} }
    sockets = [];
  }
  connect();
  // Same relays, different room: the sockets are already up, so nothing would
  // re-ask for history and the new cell would start blank until somebody spoke.
  if (moved && sockets.length) subscribe();
  announce();
  clearInterval(beat);
  beat = setInterval(() => { announce(); prune(); }, BEAT_MS);
}

function leave() {
  here = null;
  viewing = null;
  clearInterval(beat);
  beat = null;
  for (const w of sockets) { try { w.close(); } catch {} }
  sockets = [];
  peers.clear();
  // The log belongs to the cell, not to the session. Carrying a Lisbon
  // conversation into a Tokyo one would be worse than losing it.
  messages.length = 0;
  seenChat.clear();
  notes.length = 0;
  seenNotes.clear();
  emit();
  emitNow("messages");
  emitNow("notes");
  /**
   * Private messages are deliberately *not* cleared here.
   *
   * Everything else in this module is scoped to a place, so leaving one empties
   * it. A private message is scoped to a person: switching presence off is not a
   * reason to lose what somebody said to you, and silently discarding it would
   * be the app deciding a conversation was over. The panic wipe is the thing
   * that erases these, because that is the thing that is meant to.
   */
}

/**
 * Do two geohashes name the same room?
 *
 * bitchat offers six channel sizes from building to region, so a peer may be in
 * a longer or shorter cell than ours. A shorter one contains us; a longer one is
 * inside us. Either way it is the same place at a different zoom, so prefix
 * matching is the right test rather than equality.
 */
const sameCell = (a, b) => a.startsWith(b) || b.startsWith(a);

const stats = () => ({
  relays: dialled.length,
  relayUrls: dialled.slice(),
  connected: alive().length,
  peers: peers.size,
  messages: messages.length,
  // Which of the dialled relays the user chose themselves, so Settings can say
  // so rather than presenting one undifferentiated list.
  extra: extraRelays.slice(),
  cell: here?.geohash || null,
  announcing: !!here,
  /**
   * The key in use for the place currently being announced, and its fingerprint.
   *
   * BitChat's whitepaper defines the stable identity as the SHA-256 fingerprint
   * of the Noise static key, and shows the first characters for out-of-band
   * comparison. Same idea here, over the per-area key — with the difference that
   * this one changes when the place does and was never written to disk.
   */
  pubkey: here ? identity(here.geohash).pk : null,
  // Grouped in fours here rather than in each renderer. Three of them were
  // reimplementing the same split, and one carried a dead `.slice(0, 4)` that
  // could never trim anything because the hash is already sixteen characters.
  // Formatting a fingerprint for a human is one decision, so it lives in one
  // place — identity.js owns it.
  fingerprint: here ? identity_.readable(identity_.fingerprint(identity(here.geohash).pk)) : null,
  areas: identities.size,
  notes: notes.length,
  dms: dms.length,
  unread: dms.filter((m) => m.unread).length,
  /**
   * The durable identity, if there is one.
   *
   * Reported separately from `pubkey` above, which is the per-area key and
   * changes with the place. This one does not change, which is the whole point
   * and the whole cost — see identity.js.
   */
  durable: identity_.pubkey(),
  durableFingerprint: identity_.readable(identity_.fingerprint()),
  // The cell being read while browsing, if it is not the one being listened to.
  // The renderer needs this to label the conversation honestly and to disable
  // the composer — you cannot speak into a room you are not standing in.
  viewing: viewing && viewing !== here?.geohash ? viewing : null,
});

/** Everything a private conversation with one person contains, oldest first. */
function thread(pubkey) {
  if (!priv.isKey(pubkey)) return [];
  return dms.filter((m) => m.with === pubkey);
}

/** Mark a conversation read. Purely local — nobody is told, and nothing is sent. */
function markRead(pubkey) {
  let changed = false;
  for (const m of dms) if (m.with === pubkey && m.unread) { m.unread = false; changed = true; }
  if (changed) emitNow("dms");
  return changed;
}

/** Drop every private message. The panic wipe, and only the panic wipe. */
/**
 * The panic wipe's entry point, and the one place a list is emptied without its
 * seen-set.
 *
 * That is deliberate and it is the direction you want. `seenDms` keeps the ids,
 * so a wiped conversation cannot be replayed back onto the screen by the next
 * subscription — which is what "forget" has to mean for the one thing in here
 * somebody might wipe because they are frightened. Clearing the set as well
 * would make the wipe cosmetic until the next relay round trip.
 */
/**
 * ─── Hubs ────────────────────────────────────────────────────────────────────
 *
 * A room reached by knowing a name and a password. See [hub.js] for what that
 * buys and what it does not.
 *
 * The traffic rides on the same kind as public chat, with an `h` tag and no `g`
 * tag. That combination keeps it out of everyone else's way: a client watching
 * geohash channels requires a `g` tag, so a hub message is not something they
 * have to look at, and the tag it does carry means nothing without the password.
 *
 * The subscription is unchanged and deliberately unfiltered. Asking relays for
 * `#h` would be efficient and would also tell each of them exactly which room we
 * are in — a small, permanent, avoidable disclosure. The events already arrive;
 * the matching happens here.
 */
const seenHub = new Set();

function joinHub(name, password) {
  const h = hubs.derive(name, password);
  if (!h) return null;
  hub = h;
  hubMessages.length = 0;
  seenHub.clear();
  emitNow("hub");
  return { name: h.name, tag: h.tag };
}

function leaveHub() {
  hub = null;
  hubMessages.length = 0;
  seenHub.clear();
  emitNow("hub");
}

/** @returns {boolean} whether anything was published */
function sayHub(text, nickname) {
  if (!hub || !alive().length) return false;
  const body = String(text || "").trim().slice(0, hubs.MAX_TEXT);
  if (!body) return false;
  const nick = String(nickname || "").trim().slice(0, 32);
  // The nickname goes inside the envelope, never on the event. A name in a tag
  // would tell every relay who is in a room they otherwise cannot read.
  const sealed = hubs.seal(JSON.stringify({ t: body, n: nick }), hub);
  if (!sealed) return false;
  const evt = sign({
    kind: CHAT_KIND, created_at: Math.floor(Date.now() / 1000),
    tags: [["h", hub.tag]], content: sealed,
  });
  publish(evt);
  recordHub(evt, body, nick, true);
  // `flush()` alone sent nothing: recordHub does not mark the list dirty, so
  // your own message sat in the module until some unrelated event happened to
  // flush it. Found by two apps talking — the sender's log was empty while the
  // receiver's was correct, which is the one arrangement a single client cannot
  // show you.
  emitNow("hub");
  return true;
}

/** Open an inbound hub message, or ignore it. */
function takeHub(evt) {
  if (seenHub.has(evt.id)) return;
  const opened = hubs.open(evt.content, hub);
  if (opened === null) return;              // not ours, or not readable
  let body = opened, nick = "";
  try {
    const j = JSON.parse(opened);
    if (j && typeof j === "object") { body = String(j.t ?? ""); nick = String(j.n ?? "").slice(0, 32); }
  } catch { /* a simpler sender; the text is the whole of it */ }
  if (!body) return;
  recordHub(evt, body, nick, false);
  schedule("hub");
}

function recordHub(evt, text, nick, mine) {
  seenHub.add(evt.id);
  hubMessages.push({
    id: evt.id,
    at: (evt.created_at || 0) * 1000,
    from: String(evt.pubkey || "").slice(0, 8),
    pubkey: String(evt.pubkey || ""),
    nick: nick || null,
    text: String(text).slice(0, hubs.MAX_TEXT),
    mine,
  });
  hubMessages.sort((a, b) => a.at - b.at);
  if (hubMessages.length > HISTORY) hubMessages.splice(0, hubMessages.length - HISTORY);
}

function forgetDms() {
  dms.length = 0;
  emitNow("dms");
}

module.exports = { join, leave, view, say, stats, setExtraRelays, setPowFloor, powBits, geohash, ungeohash, sameCell,
                   drop, dm, thread, markRead, forgetDms,
                   joinHub, leaveHub, sayHub, lookupProfile, knownProfiles,
                   hubState: () => (hub ? { name: hub.name, tag: hub.tag } : null),
                   hubHistory: () => hubMessages.slice(),
                   onHub: (fn) => { onHub = fn; },
                   history: () => messages.slice(),
                   noteHistory: () => notes.slice(),
                   dmHistory: () => dms.slice(),
                   onPeers: (fn) => { onPeers = fn; },
                   onMessages: (fn) => { onMessages = fn; },
                   onNotes: (fn) => { onNotes = fn; },
                   onDms: (fn) => { onDms = fn; },
                   onFavorited: (fn) => { onFavorited = fn; },
                   // Re-ask for envelopes: called when the durable identity is
                   // switched on, since the inbox set has just changed and the
                   // existing subscription named only the ephemeral keys.
                   resubscribeDms: () => subscribeDms(),
                   forgetIdentities, mineKeys, identities};
