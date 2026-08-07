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
 * docs/DECENTRALIZATION.md §3). This is seeding a convention, not joining a
 * thriving one. It costs nothing when idle and shows nothing until people arrive.
 */

const crypto = require("node:crypto");
const { haversine } = require("./geo");
const fs = require("node:fs");
const path = require("node:path");
const { schnorr } = require("@noble/curves/secp256k1.js");

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
const messages = [];              // newest last, capped at HISTORY
const seenIds = new Set();        // relays deliver the same event more than once
let onPeers = () => {};
let onMessages = () => {};

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
    // The cell travels with the peer. Without it the renderer can only place a
    // ring on the globe, and any count it shows beside a place name would be a
    // worldwide total wearing a local label.
    if (c) list.push({ id: pubkey.slice(0, 8), lat: c.lat, lon: c.lon,
                       label: v.label, geohash: v.geohash });
  }
  onPeers(list);
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
function subscribe(only) {
  const msg = JSON.stringify(["REQ", "auralfm", {
    kinds: [PRESENCE_KIND, CHAT_KIND, LABEL_KIND],
    since: Math.floor(Date.now() / 1000) - LOOKBACK_SEC,
  }]);
  for (const w of (only ? [only] : alive())) {
    if (w.readyState !== 1) continue;
    try { w.send(msg); } catch { /* relay went away */ }
  }
}

/**
 * Push one signed event to relays.
 *
 * @param {WebSocket} [only]  send to just this socket. Used when a relay has
 *   only now connected: without it, `announce()` on each `onopen` broadcast to
 *   every socket already up, so three relays received six copies of the same
 *   heartbeat instead of three. Harmless to us and rude to them, which is the
 *   same category of mistake as the retry loop that got us blocked by Celestrak.
 */
function publish(evt, only) {
  const msg = JSON.stringify(["EVENT", evt]);
  for (const w of (only ? [only] : alive())) {
    if (w.readyState !== 1) continue;
    try { w.send(msg); } catch { /* relay went away */ }
  }
}

function announce(only) {
  if (!here) return;
  const created_at = Math.floor(Date.now() / 1000);

  // The shared heartbeat. Empty content and a `g` tag, nothing else — the
  // convention says so and other clients read it.
  publish(sign({ kind: PRESENCE_KIND, created_at, tags: [["g", here.geohash]], content: "" }), only);

  // Ours: the same cell, plus what is playing there.
  publish(sign({
    kind: LABEL_KIND, created_at,
    tags: [["g", here.geohash], ["client", "auralfm"]],
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
  return true;
}

/** Add a message to the log, newest last, and tell the renderer. */
function record(evt, mine = false) {
  if (seenIds.has(evt.id)) return;
  seenIds.add(evt.id);
  const g = (evt.tags || []).find((t) => t[0] === "g")?.[1] || null;
  messages.push({
    id: evt.id,
    at: (evt.created_at || 0) * 1000,
    geohash: g,
    from: String(evt.pubkey || "").slice(0, 8),
    nick: (evt.tags || []).find((t) => t[0] === "n")?.[1]?.slice(0, 32) || null,
    // Someone posting into a cell they are not standing in — us, always, and
    // some of them. Worth showing rather than flattening.
    teleport: (evt.tags || []).some((t) => t[0] === "t" && t[1] === "teleport"),
    text: String(evt.content || "").slice(0, MAX_MESSAGE),
    mine,
  });
  // created_at is whatever the sender's clock said, so arrival order is not
  // time order. Sort rather than trust it.
  messages.sort((a, b) => a.at - b.at);
  if (messages.length > HISTORY) messages.splice(0, messages.length - HISTORY);
  onMessages(messages.slice());
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
    };
    w.onmessage = (m) => {
      let d;
      try { d = JSON.parse(m.data); } catch { return; }
      if (d[0] !== "EVENT" || !d[2]) return;
      const e = d[2];
      if (e.pubkey === pk) return;                 // our own, echoed back
      const g = (e.tags || []).find((t) => t[0] === "g")?.[1];
      if (!g || !/^[0-9b-hjkmnp-z]{2,9}$/.test(g)) return;

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
  messages.length = 0;
  seenIds.clear();
  onMessages([]);
  emit();
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
    seenIds.clear();
    peers.clear();
    onMessages([]);
    emit();
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
  seenIds.clear();
  emit();
  onMessages([]);
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
  // The cell being read while browsing, if it is not the one being listened to.
  // The renderer needs this to label the conversation honestly and to disable
  // the composer — you cannot speak into a room you are not standing in.
  viewing: viewing && viewing !== here?.geohash ? viewing : null,
});

module.exports = { join, leave, view, say, stats, setExtraRelays, geohash, ungeohash, sameCell,
                   history: () => messages.slice(),
                   onPeers: (fn) => { onPeers = fn; },
                   onMessages: (fn) => { onMessages = fn; } };
