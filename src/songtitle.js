/**
 * What song a station is playing, asked of the station's own server.
 *
 * A station's server already knows the song: Icecast and Shoutcast carry it in
 * the stream itself, a block of ICY metadata every few kilobytes for a client
 * that asks with `Icy-MetaData: 1`. Nothing else is asked. The request goes to
 * the server the stream is already coming from, which sees the same address it
 * sees when the stream plays, and the answer stays on this device.
 *
 * The stream is read as far as the first block that names something (one or
 * two blocks, tens of kilobytes) and closed. Where it runs:
 *
 *   desktop (main)   any station whose server sends ICY.
 *   web              https only (an https page may not read an http server),
 *                    and only a server that lets a page send the header and
 *                    read `icy-metaint`: Icecast 2.4 and later say so in their
 *                    CORS headers; most others refuse, and the browser stops it.
 *
 * Measured on 100 random https MP3 stations from radio-browser (26 Nov 2026):
 * 37 named a song to the desktop's read, 14 to a browser's. Icecast's status
 * page (status-json.xsl), the other place a song is listed, named one for none
 * of them, so it is not asked.
 *
 * At most once every thirty seconds per station while it plays, a cooldown per
 * host behind every failure (src/backoff.js), a server that sends no ICY at
 * all is not asked again this session, and nor is a stream that named no song
 * in its first three answers. One that has named a song goes on being asked
 * through its breaks.
 *
 * ## What the text goes through
 *
 * The idea of each step is R/a/dio's (github.com/R-a-dio/valkyrie, MIT, the
 * proxy's metadata handling and the manager's song update); none of its code is
 * here, and one step is changed:
 *
 *   decode   ICY text has no declared encoding. Valid UTF-8 is UTF-8. Otherwise
 *            Shift-JIS, but only when it reads as Japanese: valkyrie takes any
 *            clean Shift-JIS decoding, and in a catalogue of the whole world a
 *            Latin-1 "Ärzte" decodes cleanly as half-width katakana. Otherwise
 *            Windows-1252, the superset of Latin-1 that real servers send.
 *            UTF-8 sent through a Latin-1 step ("BeyoncÃ©") is put back.
 *   clean    control characters out, spaces collapsed, trimmed, capped.
 *   drop     nothing, punctuation alone, the station's own name, a web address,
 *            and the placeholders servers fill the field with.
 *   split    "Artist - Title" at the first " - "; anything else is a title.
 *   repeat   the same text, ignoring case and spacing, is the same song: the
 *            caller is told nothing new.
 */
const { cooldown } = require("./backoff");

const EVERY_MS = 30_000;
const MAX_LEN = 160;
const QUIET_LIMIT = 3;          // first answers with no song before a stream is left alone
const MAX_READ = 256 * 1024;    // bytes of stream read before giving up on a block

// ── decode ───────────────────────────────────────────────────────────────────
const decoder = (label, fatal = true) => { try { return new TextDecoder(label, { fatal }); } catch { return null; } };
const UTF8 = decoder("utf-8"), SJIS = decoder("shift_jis"), CP1252 = decoder("windows-1252", false);
const JAPANESE = /[぀-ヿ㐀-䶿一-鿿]/;
const HALFWIDTH_KANA = /[｡-ﾟ]/;

const tryDecode = (d, bytes) => { if (!d) return null; try { return d.decode(bytes); } catch { return null; } };

/** UTF-8 that went through a Latin-1 step: every character fits in a byte, and the bytes are UTF-8. */
function undouble(s) {
  if (!/[Â-ô][\u0080-¿]/.test(s) || /[^\u0000-ÿ]/.test(s)) return s;
  const again = tryDecode(UTF8, Uint8Array.from(s, (c) => c.charCodeAt(0)));
  return again && again !== s ? again : s;
}

/** Bytes of ICY text, whatever they were written in, as a string. */
function decode(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes);
  const utf8 = tryDecode(UTF8, b);
  if (utf8 != null) return undouble(utf8);
  const sjis = tryDecode(SJIS, b);
  if (sjis != null && JAPANESE.test(sjis) && !HALFWIDTH_KANA.test(sjis)) return sjis;
  return CP1252 ? CP1252.decode(b) : String.fromCharCode(...b);
}

// ── clean, drop, split ───────────────────────────────────────────────────────
const PLACEHOLDER = /^(unknown|untitled|n\/?a|none|null|undefined|no ?name|-+|live|on ?air|stream|advert(isement)?|commercial( break)?|unknown artist - unknown title)$/i;
const key = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * The song, or null when what the server said is not one.
 * @param {string} raw
 * @param {string} [station] the station's name: a server that sends it back is not naming a song
 */
function clean(raw, station = "") {
  let s = undouble(String(raw ?? "")).replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return null;
  if (!/[\p{L}\p{N}]/u.test(s)) return null;
  if (PLACEHOLDER.test(s)) return null;
  if (/^(https?:\/\/|www\.)\S+$/i.test(s)) return null;
  if (station && key(s) === key(station)) return null;
  if (s.length > MAX_LEN) s = s.slice(0, MAX_LEN - 1).trimEnd() + "…";
  return s;
}

/** "Artist - Title" as its two halves; anything else is all title. */
function split(text) {
  const s = String(text || "");
  const at = s.indexOf(" - ");
  if (at <= 0 || at >= s.length - 3) return { artist: "", title: s };
  return { artist: s.slice(0, at).trim(), title: s.slice(at + 3).trim() };
}

/** Is this the same song as before? Case and spacing are not a new song. */
const same = (a, b) => key(a) === key(b);

// ── what the servers send ────────────────────────────────────────────────────
/** StreamTitle out of one ICY block (its bytes, already decoded). */
function fromIcy(block) {
  const m = /StreamTitle='([\s\S]*?)';(?:\s*Stream\w+=|\s*$)/.exec(String(block || "").replace(/\0+$/, ""));
  return m ? m[1] : null;
}

const isHls = (url) => /\.m3u8(\?|#|$)/i.test(url);

/** Read a stream as far as its first ICY block that names something, then let go. */
async function readIcy(fetchFn, url, headers, signal) {
  const res = await fetchFn(url, { headers: { ...headers, "Icy-MetaData": "1" }, signal });
  const every = parseInt(res.headers.get("icy-metaint"), 10);
  if (!res.ok || !(every > 0) || !res.body) { try { await res.body?.cancel(); } catch {} return { icy: false, text: null }; }
  const reader = res.body.getReader();
  let buf = new Uint8Array(0), seen = 0;
  const need = async (n) => {
    while (buf.length < n) {
      const { value, done } = await reader.read();
      if (done) return false;
      seen += value.length;
      const next = new Uint8Array(buf.length + value.length); next.set(buf); next.set(value, buf.length); buf = next;
      if (seen > MAX_READ) return false;
    }
    return true;
  };
  try {
    for (let block = 0; block < 2; block++) {
      if (!(await need(every + 1))) break;
      const len = buf[every] * 16;
      if (!(await need(every + 1 + len))) break;
      const text = len ? fromIcy(decode(buf.subarray(every + 1, every + 1 + len))) : null;
      buf = buf.subarray(every + 1 + len);
      if (text != null && text.trim()) return { icy: true, text };
    }
    return { icy: true, text: null };
  } finally { try { await reader.cancel(); } catch {} }
}

/**
 * One asker per process. It keeps, per host, the cooldown and whether the
 * server sends ICY at all; per stream, whether it has ever named a song.
 *
 * @param {object} o
 * @param {Function} o.fetch          the fetch to use
 * @param {boolean} [o.secureOnly]    https streams only (the web)
 * @param {object}  [o.headers]       sent with every request (the User-Agent)
 */
function createAsker({ fetch: fetchFn, secureOnly = false, headers = {} }) {
  const hosts = new Map();      // host -> { cool, noIcy }
  const quiet = new Map();      // stream -> answers with no song in them, until one has one
  const said = new Set();       // streams that have named a song
  const last = new Map();       // stream -> when it was last asked

  const hostOf = (url) => { try { return new URL(url).host; } catch { return null; } };

  /**
   * Three answers, kept apart because they mean different things to a player:
   *   undefined   not asked (too soon, cooling down, nothing to ask) or no
   *               answer: keep showing what was there
   *   null        the server answered and named no song: show none
   *   {text, artist, title}   the song
   */
  async function ask(url, station = "") {
    const host = hostOf(url);
    if (!host || isHls(url) || !/^https?:/i.test(url)) return undefined;
    if (secureOnly && !/^https:/i.test(url)) return undefined;
    if (!said.has(url) && (quiet.get(url) || 0) >= QUIET_LIMIT) return undefined;
    if (Date.now() - (last.get(url) || 0) < EVERY_MS - 1000) return undefined;
    let h = hosts.get(host);
    if (!h) hosts.set(host, (h = { cool: cooldown({ min: 60_000, max: 30 * 60_000 }), noIcy: false }));
    if (h.noIcy || h.cool.blocked) return undefined;
    last.set(url, Date.now());
    let raw;
    try {
      const r = await readIcy(fetchFn, url, headers, AbortSignal.timeout(8000));
      if (!r.icy) { h.noIcy = true; return undefined; }
      raw = r.text;
      h.cool.ok();
    } catch (err) {
      // On the web a server that will not let a page read it fails here too,
      // indistinguishable from a dropped connection: the cooldown covers both.
      h.cool.fail(err);
      return undefined;
    }
    const text = clean(raw, station);
    if (!text) { quiet.set(url, (quiet.get(url) || 0) + 1); return null; }
    said.add(url);
    return { text, ...split(text) };
  }

  return { ask };
}

module.exports = { EVERY_MS, decode, clean, split, same, fromIcy, createAsker };
