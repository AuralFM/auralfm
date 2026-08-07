/**
 * Shortwave receivers.
 *
 * Ships as a static bundle so the receivers are on the globe with the network
 * unplugged, exactly like the stations. Refreshed at most twice a day from the
 * hourly aggregate mirror — one request to one aggregator that exists for this
 * purpose, never to the receivers themselves.
 *
 * That distinction is the whole discipline here. A KiwiSDR is one person's
 * BeagleBone on one person's bandwidth, and there are 838 of them. Enumerating
 * them to check who is free would be 838 requests from every copy of AuralFM on
 * earth. We got IP-blocked by Celestrak for far less. So: the aggregate list is
 * the only thing polled, and an individual receiver is contacted only when
 * someone clicks it.
 *
 * Plain Node, no Electron — same as every other data module here.
 */

const fs = require("node:fs");
const path = require("node:path");
const { cooldown } = require("./backoff");
const { haversine } = require("./geo");

/**
 * The aggregate list, over cleartext HTTP.
 *
 * Not a choice: `rx.linkfanel.net` serves no HTTPS at all — the TLS connection
 * fails outright, measured. So the response can be rewritten by anyone able to
 * modify traffic, and the honest answer is not to pretend otherwise but to make
 * a rewritten list useless.
 *
 * Three gates below, in `refresh()`. Individually they are cheap; together an
 * attacker cannot point this app at a server of their choosing:
 *
 *   1. Every host must look like a real public hostname — no IP literals, no
 *      private ranges, no bare names, no credentials, no odd ports.
 *   2. Every coordinate must be on Earth.
 *   3. The new list must still *resemble the one already trusted*. Receivers
 *      come and go slowly, so a refresh sharing almost nothing with the current
 *      list is either the aggregator having a bad day or somebody substituting
 *      it. Both are reasons to keep what we have.
 *
 * The chain starts at the snapshot shipped in the bundle, which arrives signed
 * inside the app, and each accepted refresh has to look like the last one.
 * Worst case we keep serving a stale list, which is exactly what this module
 * was designed to do anyway.
 */
const SRC = "http://rx.linkfanel.net/kiwisdr_com.js";
const { UA } = require("./useragent");
const REFRESH_MS = 12 * 60 * 60 * 1000;
const BUNDLE = path.join(__dirname, "..", "data", "sdr.min.json");

let receivers = [];       // { host, name, loc, lat, lng, slots, asl }
let generated = null;
let cacheFile = null;
let lastRefresh = 0;

const cool = cooldown({ min: 30 * 60_000, max: 12 * 60 * 60_000, label: "sdr" });

/**
 * "http://host/" or "http://host:8073/" -> "host:8073"
 *
 * Nearly half the receivers (392 of 838) sit behind *.proxy.kiwisdr.com, which
 * answers plain HTTP on port 80 with a 307 to port 8073. A browser following a
 * link never notices. A WebSocket does: the handshake does not follow redirects,
 * so it just fails, and every one of those receivers looks dead. Resolve the
 * port here instead of discovering it 392 times.
 */
function hostFrom(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  const port = u.port || (/\.proxy\.kiwisdr\.com$/i.test(u.hostname) ? "8073" : "");
  return port && port !== "80" ? `${u.hostname}:${port}` : u.hostname;
}

/**
 * Is this a plausible public receiver host?
 *
 * Rejects the shapes an injected list would use to make the app talk to
 * something it should not: loopback and link-local names, IP literals of any
 * kind (a real KiwiSDR in this list is a DNS name), RFC1918 space, embedded
 * credentials, and ports outside the range these things actually use.
 */
function validHost(host) {
  if (typeof host !== "string" || host.length > 255) return false;
  if (/[@\s/\\?#]/.test(host)) return false;              // creds, paths, junk
  const [name, port] = host.split(":");
  if (port !== undefined) {
    if (!/^\d{1,5}$/.test(port)) return false;
    const n = +port;
    if (n < 81 || n > 65535) return false;                 // 8073 and friends
  }
  if (!/^[a-z0-9.-]+$/i.test(name)) return false;
  if (!name.includes(".") || name.startsWith(".") || name.endsWith(".")) return false;
  if (/^\d+(\.\d+)*$/.test(name)) return false;            // any IPv4 literal
  if (/(^|\.)(localhost|local|internal|home|lan|corp)$/i.test(name)) return false;
  return true;
}

const onEarth = (lat, lng) =>
  Number.isFinite(lat) && Number.isFinite(lng) &&
  lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;

const expand = (rows) => rows.map(([h, n, l, lat, lng, m, a]) => ({
  host: h, name: n, loc: l, lat, lng, slots: m, asl: a,
}));

function adopt(bundle) {
  if (!bundle?.r?.length) return false;
  receivers = expand(bundle.r);
  generated = bundle.g;
  return true;
}

/** @param {string} userDataPath where a refreshed list is cached between launches */
function init(userDataPath) {
  cacheFile = path.join(userDataPath, "sdr.json");
  // Prefer a cached refresh over the shipped snapshot when it is newer.
  let shipped = null, cached = null;
  try { shipped = JSON.parse(fs.readFileSync(BUNDLE, "utf8")); } catch {}
  try { cached = JSON.parse(fs.readFileSync(cacheFile, "utf8")); } catch {}
  const pick = (cached && shipped && Date.parse(cached.g) > Date.parse(shipped.g)) ? cached
             : (shipped || cached);
  if (!adopt(pick)) {
    console.warn("sdr: no receiver bundle — run `npm run crawl:sdr`");
    return;
  }
  const days = Math.floor((Date.now() - Date.parse(generated)) / 86400000);
  console.log(`sdr: ${receivers.length} shortwave receivers (list ${days}d old)`);
}

/**
 * Refresh from the aggregate mirror. Deliberately never awaited by callers: a
 * stale receiver list is a fine list, and the globe should never wait on it.
 */
async function refresh() {
  if (Date.now() - lastRefresh < REFRESH_MS || cool.blocked) return;
  lastRefresh = Date.now();
  try {
    const res = await fetch(SRC, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(45000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const body = text.slice(text.indexOf("[")).trim().replace(/;$/, "");
    const recs = JSON.parse(body.replace(/,(\s*[\]}])/g, "$1"));

    const seen = new Set();
    const rows = [];
    for (const r of recs) {
      if (r.status !== "active" || r.offline === "yes") continue;
      const m = /^\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)$/.exec(r.gps || "");
      if (!m) continue;
      const lat = +m[1], lng = +m[2];
      if (!lat && !lng) continue;
      if (!onEarth(lat, lng)) continue;
      const host = hostFrom(r.url);
      if (!host || !validHost(host) || seen.has(host)) continue;
      seen.add(host);
      const clean = (s) => String(s || "").replace(/[█▀▄░▒▓■□◆●★☆]/g, " ")
        .replace(/\s+/g, " ").trim().slice(0, 80);
      rows.push([host, clean(r.name), clean(r.loc), +lat.toFixed(4), +lng.toFixed(4),
                 parseInt(r.users_max, 10) || 4, parseInt(r.asl, 10) || 0]);
    }
    if (!rows.length) throw new Error("no usable receivers");

    /**
     * Does this still look like the list we already trust?
     *
     * The substitution this defends against is wholesale: a rewritten response
     * pointing at hosts of the attacker's choosing. Such a list shares almost
     * nothing with the one in hand. Genuine churn is slow — receivers appear and
     * disappear over weeks — so requiring a solid majority of familiar hosts
     * costs nothing real and closes the door.
     *
     * Skipped only when there is nothing to compare against, which cannot happen
     * in a shipped build because the bundle is always present.
     */
    if (receivers.length) {
      const known = new Set(receivers.map((r) => r.host));
      const overlap = rows.reduce((n, r) => n + (known.has(r[0]) ? 1 : 0), 0);
      const share = overlap / rows.length;
      const shrunk = rows.length < receivers.length * 0.5;
      if (share < 0.6 || shrunk) {
        throw new Error(
          `refused: ${(share * 100).toFixed(0)}% overlap with the known list, ` +
          `${rows.length} vs ${receivers.length} receivers`);
      }
    }

    const bundle = { g: new Date().toISOString(), src: null, r: rows };
    adopt(bundle);
    try { fs.writeFileSync(cacheFile, JSON.stringify(bundle)); } catch {}
    cool.ok();
    console.log(`sdr: refreshed — ${rows.length} receivers`);
  } catch (err) {
    cool.fail(err);
  }
}

/**
 * Everything the globe needs, in one call. An earlier version handed back index
 * tuples and let the renderer fetch each receiver, which was 838 IPC round trips
 * at boot for data that fits comfortably in one message.
 */
const points = () => receivers.map((r, i) => ({
  kind: "sdr", i, host: r.host, name: r.name, loc: r.loc,
  lat: r.lat, lng: r.lng, slots: r.slots, asl: r.asl,
}));

const get = (i) => receivers[i] || null;

const stats = () => ({ count: receivers.length, generated });

/**
 * Nearest receivers to a place, for "listen to the sky over here". Great-circle
 * distance; the list is under a thousand entries so a sort is fine.
 */
function nearest(lat, lng, limit = 8) {
  return receivers
    .map((r, i) => ({ ...r, i, km: Math.round(haversine(lat, lng, r.lat, r.lng)) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, limit);
}

module.exports = { init, refresh, points, get, stats, nearest, hostFrom };
