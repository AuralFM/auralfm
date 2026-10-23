/**
 * Favorites, the same on every device that holds the code.
 *
 * There is no account, so there is nothing to sign in to. Instead one device
 * makes a secret, the listener carries it to the others (`auralfm-sync1:…`), and
 * every device that holds it reads and writes one note on a few public relays.
 *
 * What a relay sees: a key it has never seen before, writing a blob it cannot
 * read. The key is derived from the secret, so it is not the chat identity, not
 * the lasting identity, and not linkable to either. The blob is the list sealed
 * with XChaCha20-Poly1305 under a second key from the same secret. Whoever has
 * the code can read and change the list; nobody else can do either.
 *
 * The note is a replaceable event (NIP-78, kind 30078): the relay keeps the
 * newest and drops the rest, so there is no history of what you listened to.
 *
 * Merging is per station, newest wins: each entry carries when it was starred
 * or un-starred. Two devices that both change the list while apart lose nothing
 * but the older of two changes to the *same* station.
 *
 * Nothing here stays connected. A round opens the relays, reads, merges, writes
 * if it has something to say, and hangs up.
 *
 * The same file runs in the browser (web/messaging.js bundles it, with
 * web/shims/ standing in for node:fs and node:crypto).
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { schnorr } = require("@noble/curves/secp256k1.js");
const { sha256 } = require("@noble/hashes/sha2.js");
const { hkdf } = require("@noble/hashes/hkdf.js");
const { xchacha20poly1305 } = require("@noble/ciphers/chacha.js");

const TAG = "auralfm-sync1:";
const KIND = 30078;
const D = "auralfm:favorites";
/**
 * Three relays that take a write from a key they have never seen. Not the chat's
 * anchors: one of those is paid, and a list that only two relays hold is a list
 * one outage away from being unreadable.
 */
const RELAYS = ["wss://nos.lol", "wss://relay.primal.net", "wss://relay.damus.io"];
const WAIT_MS = 7000;
/** Relays refuse an event much past 64 KB; this is the sealed text, base64. */
const MAX_CONTENT = 60000;
/** How long an un-star is remembered, so a device away for a season still hears of it. */
const GONE_MS = 180 * 86400e3;
const SETTLE_MS = 2500;
const WAKE_MS = 60e3;

let FILE = null;
let host = { get: () => null, set: () => {}, changed: () => {} };
let relays = RELAYS;

function init(dir, h, opts = {}) {
  FILE = path.join(dir, "favsync.json");
  host = { ...host, ...h };
  if (Array.isArray(opts.relays)) relays = opts.relays;
}

const hex = (b) => Buffer.from(b).toString("hex");
const b64u = (b) => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

// ── what this device remembers ───────────────────────────────────────────────
// { secret, seen: {id: ms starred}, gone: {id: ms un-starred}, at, error, before }
function read() {
  if (!FILE) return null;
  try {
    const j = JSON.parse(fs.readFileSync(FILE, "utf8"));
    return typeof j.secret === "string" && /^[0-9a-f]{64}$/.test(j.secret) ? j : null;
  } catch { return null; }
}
function write(j) {
  if (!FILE) return;
  try {
    // 0600 before anything is in it: the secret is the whole of the access.
    const fd = fs.openSync(FILE, "w", 0o600);
    try { fs.writeFileSync(fd, JSON.stringify(j)); } finally { fs.closeSync(fd); }
  } catch (err) { console.error("favsync: could not save —", err.message); }
}

function keys(secretHex) {
  const ikm = Uint8Array.from(Buffer.from(secretHex, "hex"));
  const salt = new TextEncoder().encode("auralfm-favsync");
  const part = (info) => hkdf(sha256, ikm, salt, new TextEncoder().encode(info), 32);
  const sk = part("sign");
  return { sk, pk: hex(schnorr.getPublicKey(sk)), key: part("seal") };
}

// ── the list on the wire ─────────────────────────────────────────────────────
// { v: 1, items: { id: [ms, title, place, country, lat, lon, secure] | [ms] } }
// One element means un-starred. Short on purpose: the whole list is one event.
const slim = (t, f) => [t, f.title, f.place ?? "", f.country ?? "", f.lat ?? null, f.lon ?? null, f.secure ? 1 : 0];
const full = (id, a) => ({
  id, title: String(a[1]).slice(0, 200), place: String(a[2] || "").slice(0, 200), country: String(a[3] || "").slice(0, 100),
  secure: !!a[6],
  lat: typeof a[4] === "number" ? a[4] : undefined, lon: typeof a[5] === "number" ? a[5] : undefined,
});
const valid = (id, a) => typeof id === "string" && id.length <= 200 && Array.isArray(a)
  && Number.isFinite(a[0]) && (a.length === 1 || typeof a[1] === "string");

/**
 * Merge this device's list with the one the relays hold.
 *
 * Pure: the same inputs give the same answer, and nothing is read or written.
 * `remote` is null when the relays hold nothing yet.
 *
 * Two rules keep a mistake from travelling. A station is only called un-starred
 * here if this device saw it starred at the last round and it is gone now. And
 * an empty list never un-stars a full one: a list that vanished (a lost file, a
 * cleared browser) is a device to be filled, not an instruction to the others.
 */
function merge(local, meta, remote, now) {
  const seen = meta.seen || {}, gone = meta.gone || {};
  const lost = local.length === 0 && Object.keys(seen).length > 2;

  const mine = new Map();
  for (const f of local) mine.set(f.id, { t: seen[f.id] || now, f });
  if (!lost) for (const id of Object.keys(seen)) if (!mine.has(id)) mine.set(id, { t: now, f: null });
  for (const id of Object.keys(gone)) if (!mine.has(id)) mine.set(id, { t: gone[id], f: null });

  const out = new Map(mine);
  for (const [id, a] of Object.entries(remote || {})) {
    if (!valid(id, a)) continue;
    // A clock set wrong on another device does not get to decide the future.
    const t = Math.min(a[0], now + 600e3);
    const theirs = { t, f: a.length > 1 ? full(id, a) : null };
    const ours = out.get(id);
    // Newest wins; level, the star does: keeping is the mistake that costs less.
    if (!ours || theirs.t > ours.t || (theirs.t === ours.t && theirs.f && !ours.f)) out.set(id, theirs);
  }

  const favorites = [];
  for (const f of local) if (out.get(f.id)?.f) favorites.push(f);          // this device's order, and its own record
  const had = new Set(local.map((f) => f.id));
  const added = [...out].filter(([id, e]) => e.f && !had.has(id)).sort((a, b) => a[1].t - b[1].t);
  for (const [, e] of added) favorites.push(e.f);

  const next = { seen: {}, gone: {} }, items = {};
  for (const [id, e] of [...out].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (e.f) { next.seen[id] = e.t; items[id] = slim(e.t, e.f); }
    else if (now - e.t < GONE_MS) { next.gone[id] = e.t; items[id] = [e.t]; }
  }
  // Compared as times and stars, not as text: a title that differs between two
  // catalogue builds is not a change worth a write.
  const mark = (m) => Object.keys(m || {}).sort().map((id) => `${id}:${valid(id, m[id]) ? Math.min(m[id][0], now + 600e3) : "?"}:${m[id]?.length > 1 ? 1 : 0}`).join("|");
  return {
    favorites, seen: next.seen, gone: next.gone, items,
    removed: local.filter((f) => !out.get(f.id)?.f).length, added: added.length,
    changedRemote: !remote || mark(items) !== mark(remote),
  };
}

// ── sealing ──────────────────────────────────────────────────────────────────
// One byte ahead of the text says how it is packed: 0 plain, 1 deflate. A list
// of station names shrinks to about a third, which is the difference between
// four hundred favorites fitting in an event and well over a thousand.
async function squeeze(bytes, Stream) {
  return Buffer.from(await new Response(new Blob([bytes]).stream().pipeThrough(new Stream("deflate-raw"))).arrayBuffer());
}
async function seal(obj, key) {
  const text = Buffer.from(JSON.stringify(obj), "utf8");
  let body = Buffer.concat([Buffer.from([0]), text]);
  if (typeof CompressionStream === "function") {
    try { body = Buffer.concat([Buffer.from([1]), await squeeze(text, CompressionStream)]); } catch { /* sent plain */ }
  }
  const nonce = crypto.randomBytes(24);
  const ct = xchacha20poly1305(key, Uint8Array.from(nonce), Buffer.from(D, "utf8")).encrypt(Uint8Array.from(body));
  return Buffer.concat([nonce, Buffer.from(ct)]).toString("base64");
}
/** Open one, or null: an event we cannot read is not ours, whoever signed it. */
async function open(content, key) {
  let raw;
  try { raw = Buffer.from(String(content), "base64"); } catch { return null; }
  if (raw.length <= 24 + 16) return null;
  try {
    const out = Buffer.from(xchacha20poly1305(key, Uint8Array.from(raw.subarray(0, 24)), Buffer.from(D, "utf8"))
      .decrypt(Uint8Array.from(raw.subarray(24))));
    const text = out[0] === 1 ? await squeeze(out.subarray(1), DecompressionStream) : out.subarray(1);
    const j = JSON.parse(Buffer.from(text).toString("utf8"));
    return j && j.v === 1 && j.items && typeof j.items === "object" ? j.items : null;
  } catch { return null; }
}

function sign(evt, k) {
  const id = sha256(new TextEncoder().encode(JSON.stringify([0, k.pk, evt.created_at, evt.kind, evt.tags, evt.content])));
  return { ...evt, pubkey: k.pk, id: hex(id), sig: hex(schnorr.sign(id, k.sk)) };
}

// ── one relay, for one round ─────────────────────────────────────────────────
function dial(url, pk) {
  let ws = null, newest = null;
  const waits = new Map();          // event id → resolve(ok)
  const got = new Promise((resolve) => {
    const done = (v) => resolve(v);
    const timer = setTimeout(() => done(false), WAIT_MS);
    try { ws = new WebSocket(url); } catch { clearTimeout(timer); return done(false); }
    ws.onopen = () => ws.send(JSON.stringify(["REQ", "f", { kinds: [KIND], authors: [pk], "#d": [D], limit: 4 }]));
    ws.onerror = () => { clearTimeout(timer); done(false); };
    ws.onclose = () => { clearTimeout(timer); done(false); for (const r of waits.values()) r(false); };
    ws.onmessage = (m) => {
      let f; try { f = JSON.parse(m.data); } catch { return; }
      if (f[0] === "EVENT" && f[2]?.pubkey === pk && f[2].kind === KIND && typeof f[2].content === "string") {
        if (!newest || f[2].created_at > newest.created_at) newest = f[2];
      } else if (f[0] === "EOSE") { clearTimeout(timer); done(true); }
      else if (f[0] === "OK" && typeof f[1] === "string") {
        const w = waits.get(f[1]);
        if (typeof w === "function") w(f[2] === true);
      }
    };
  });
  return {
    url, got, newest: () => newest,
    put: (evt) => new Promise((resolve) => {
      if (ws?.readyState !== 1) return resolve(false);
      const timer = setTimeout(() => resolve(false), WAIT_MS);
      waits.set(evt.id, (ok) => { clearTimeout(timer); resolve(ok); });
      ws.send(JSON.stringify(["EVENT", evt]));
    }),
    close: () => { try { ws?.close(); } catch { /* already gone */ } },
  };
}

// ── a round ──────────────────────────────────────────────────────────────────
let busy = null, again = false;

const status = () => {
  const j = read();
  return { on: !!j, at: j?.at || null, error: j?.error || null, count: j ? Object.keys(j.seen || {}).length : 0 };
};

async function round() {
  const j = read();
  if (!j) return status();
  const local = host.get();
  // No list at all is not an empty list: nothing is decided from a failed read.
  if (!Array.isArray(local)) return status();
  const k = keys(j.secret);
  const lines = relays.map((url) => dial(url, k.pk));
  const fail = (error) => { const now = read(); if (now) write({ ...now, error }); return status(); };
  try {
    const reached = (await Promise.all(lines.map((l) => l.got.then((ok) => (ok ? l : null))))).filter(Boolean);
    if (!reached.length) return fail("offline");

    // The newest copy any relay holds that this secret opens.
    let top = null, items = null;
    for (const l of [...reached].sort((a, b) => (b.newest()?.created_at || 0) - (a.newest()?.created_at || 0))) {
      const evt = l.newest();
      if (!evt) continue;
      items = await open(evt.content, k.key);
      if (items) { top = evt; break; }
    }

    const now = Date.now();
    const m = merge(local.filter((f) => f && typeof f.id === "string"), j, items, now);
    // Read again: a star tapped while the relays were answering is not undone.
    const during = host.get();
    if (!Array.isArray(during) || during.map((f) => f.id).join("|") !== local.map((f) => f.id).join("|")) { again = true; return status(); }

    const still = read();
    if (!still || still.secret !== j.secret) return status();          // turned off, or changed, meanwhile
    // The list as it was, kept once, whenever a round takes something away.
    const before = m.removed ? { at: now, favorites: local } : still.before;
    write({ ...still, seen: m.seen, gone: m.gone, before });
    if (m.removed || m.added) host.set(m.favorites);

    // Write when there is something new, or when a relay that answered is behind.
    const behind = reached.filter((l) => l.newest()?.id !== top?.id);
    if (m.changedRemote || behind.length) {
      const content = await seal({ v: 1, items: m.items }, k.key);
      if (content.length > MAX_CONTENT) return fail("toobig");
      const evt = m.changedRemote
        ? sign({ kind: KIND, created_at: Math.max(Math.floor(now / 1000), (top?.created_at || 0) + 1), tags: [["d", D]], content }, k)
        : top;
      const oks = await Promise.all((m.changedRemote ? reached : behind).map((l) => l.put(evt)));
      if (m.changedRemote && !oks.some(Boolean)) return fail("refused");
    }
    const done = read();
    if (done && done.secret === j.secret) write({ ...done, at: now, error: null });
    return status();
  } finally {
    for (const l of lines) l.close();
  }
}

/** Run a round; a second request while one runs becomes one more round after it. */
function sync() {
  if (busy) { again = true; return busy; }
  busy = round().catch((err) => { console.error("favsync:", err?.message || err); return status(); })
    .then((s) => {
      busy = null;
      try { host.changed(s); } catch { /* nobody listening */ }
      if (again) { again = false; touch(); }
      return s;
    });
  return busy;
}

let settle = null, woke = 0;
/** The list changed: sync once it has stopped changing. */
function touch() {
  if (!read()) return;
  clearTimeout(settle);
  settle = setTimeout(sync, SETTLE_MS);
}
/** The app came to the front: look for what the other devices did, at most once a minute. */
function wake() {
  if (!read() || Date.now() - woke < WAKE_MS) return;
  woke = Date.now();
  sync();
}

// ── turning it on and off ────────────────────────────────────────────────────
const code = () => { const j = read(); return j ? TAG + b64u(Buffer.from(j.secret, "hex")) : null; };

/** Make a secret here. The list on this device becomes the list. */
function start() {
  if (!read()) write({ secret: hex(crypto.randomBytes(32)), seen: {}, gone: {} });
  return sync();
}

/** Take a secret made elsewhere. The two lists are joined; nothing is removed. */
function join(text) {
  const s = String(text || "").replace(/[\s"'“”]/g, "");
  const at = s.indexOf(TAG);
  if (at < 0) return Promise.resolve({ ...status(), ok: false, error: "notours" });
  let raw;
  try { raw = Buffer.from(s.slice(at + TAG.length).replace(/-/g, "+").replace(/_/g, "/"), "base64"); } catch { raw = null; }
  if (!raw || raw.length !== 32) return Promise.resolve({ ...status(), ok: false, error: "damaged" });
  const secret = hex(raw);
  // seen and gone start empty: nothing this device holds is called un-starred.
  if (read()?.secret !== secret) write({ secret, seen: {}, gone: {} });
  return sync().then((st) => ({ ...st, ok: true }));
}

/** Forget the secret on this device. The favorites stay; so does the relays' copy. */
function stop() {
  clearTimeout(settle);
  try { if (FILE) fs.rmSync(FILE, { force: true }); } catch { /* nothing to remove */ }
  const s = status();
  try { host.changed(s); } catch { /* nobody listening */ }
  return s;
}

module.exports = { init, status, start, join, stop, code, sync, touch, wake, merge, seal, open, keys, RELAYS, TAG };
