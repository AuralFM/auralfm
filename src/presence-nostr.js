/**
 * Presence over Nostr — "someone near here is listening too", with no server.
 *
 * `presence.js` does the same job over HTTP and needs somewhere to run, which is
 * why #10 has sat open: standing up a server contradicts the whole position.
 * This is the version that does not need one.
 *
 * Three properties make Nostr right for this specifically:
 *
 *  - **Ephemeral events.** NIP-01 reserves kinds 20000–29999 for events relays
 *    forward to current subscribers and do not store. That is not a privacy
 *    setting we are trusting someone to honour on our behalf; it is what the
 *    kind *means*. Nothing is written down anywhere, by design.
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
 * docs/DECENTRALIZATION.md §3). This is seeding a convention, not joining a
 * thriving one. It costs nothing when idle and shows nothing until people arrive.
 */

const crypto = require("node:crypto");
const { schnorr } = require("@noble/curves/secp256k1.js");

/**
 * Ephemeral kind, so relays forward and forget. Picked from the unassigned part
 * of the range; nothing else uses it, and nothing needs to.
 */
const KIND = 20808;

/**
 * Relays that answered when this was written. Several of the best-known ones
 * refuse connections on any given day, so this is a list rather than a host, and
 * a failure to connect is not an error worth surfacing.
 */
const RELAYS = [
  "wss://nos.lol",
  "wss://relay.primal.net",
  "wss://nostr.wine",
];

const BEAT_MS = 60_000;
const STALE_MS = 4 * 60_000;      // drop a peer we have not heard from
const GEOHASH_PRECISION = 4;      // ~20km. Enough for "near here", too coarse to find anyone.

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

// Fresh identity per launch. Never persisted, never asked for.
let sk = null, pk = null;
const identity = () => {
  if (!sk) { sk = schnorr.utils.randomSecretKey(); pk = hex(schnorr.getPublicKey(sk)); }
  return { sk, pk };
};

/** NIP-01 event id: sha256 over a canonical array. Order is part of the spec. */
function sign(evt) {
  const { sk: k, pk: p } = identity();
  const serial = JSON.stringify([0, p, evt.created_at, evt.kind, evt.tags, evt.content]);
  const id = crypto.createHash("sha256").update(serial).digest();
  return { ...evt, pubkey: p, id: hex(id), sig: hex(schnorr.sign(id, k)) };
}

let sockets = [];
let beat = null;
let here = null;                  // { geohash, label }
const peers = new Map();          // pubkey -> { geohash, label, at }
let onPeers = () => {};

const alive = () => sockets.filter((w) => w.readyState === 1);

function prune() {
  const cut = Date.now() - STALE_MS;
  let changed = false;
  for (const [k, v] of peers) if (v.at < cut) { peers.delete(k); changed = true; }
  if (changed) emit();
}

function emit() {
  const list = [];
  for (const [pubkey, v] of peers) {
    const c = ungeohash(v.geohash);
    if (c) list.push({ id: pubkey.slice(0, 8), lat: c.lat, lon: c.lon, label: v.label });
  }
  onPeers(list);
}

function announce() {
  if (!here) return;
  const evt = sign({
    kind: KIND,
    created_at: Math.floor(Date.now() / 1000),
    // `g` is the geohash convention used by NIP-52 and, informally, by everything
    // else that has tried this. Following it costs nothing and might one day mean
    // we are not alone.
    tags: [["g", here.geohash], ["client", "auralfm"]],
    content: JSON.stringify({ l: here.label }),
  });
  const msg = JSON.stringify(["EVENT", evt]);
  for (const w of alive()) { try { w.send(msg); } catch { /* relay went away */ } }
}

function connect() {
  if (sockets.length) return;
  for (const url of RELAYS) {
    let w;
    try { w = new WebSocket(url); } catch { continue; }
    sockets.push(w);
    w.onopen = () => {
      // Listen for anyone else running this, anywhere. Geographic filtering
      // happens here rather than at the relay: the filter set would otherwise
      // leak roughly where you are to every relay you connect to.
      w.send(JSON.stringify(["REQ", "auralfm", {
        kinds: [KIND], since: Math.floor(Date.now() / 1000) - 300,
      }]));
      announce();
    };
    w.onmessage = (m) => {
      let d;
      try { d = JSON.parse(m.data); } catch { return; }
      if (d[0] !== "EVENT" || !d[2]) return;
      const e = d[2];
      if (e.kind !== KIND || e.pubkey === pk) return;
      const g = (e.tags || []).find((t) => t[0] === "g")?.[1];
      if (!g || !/^[0-9b-hjkmnp-z]{2,9}$/.test(g)) return;
      let label = null;
      try { label = JSON.parse(e.content)?.l ?? null; } catch { /* content is optional */ }
      peers.set(e.pubkey, { geohash: g, label: String(label || "").slice(0, 60), at: Date.now() });
      emit();
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
function join(lat, lon, label) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
  here = { geohash: geohash(lat, lon), label: String(label || "").slice(0, 60) };
  connect();
  announce();
  clearInterval(beat);
  beat = setInterval(() => { announce(); prune(); }, BEAT_MS);
}

function leave() {
  here = null;
  clearInterval(beat);
  beat = null;
  for (const w of sockets) { try { w.close(); } catch {} }
  sockets = [];
  peers.clear();
  emit();
}

const stats = () => ({
  relays: RELAYS.length,
  connected: alive().length,
  peers: peers.size,
  announcing: !!here,
});

module.exports = { join, leave, stats, geohash, ungeohash,
                   onPeers: (fn) => { onPeers = fn; } };
