/**
 * The captions runtime, fetched on demand.
 *
 * Whisper needs two things: model weights and an ONNX runtime to execute them.
 * The weights were always downloaded on first use — they are 40-80 MB and
 * nobody should carry them for a feature they never switch on. The runtime was
 * not: 11 MB of WebAssembly shipped inside every copy of the app, for a feature
 * that is off by default and, on the hardware this was measured on, too slow to
 * be usable at all. That is the whole download budget of a small app spent on
 * something most people will never turn on.
 *
 * So it comes down the same way the weights do, and for the same reason.
 *
 * **The main process does the downloading, not the renderer.** Two reasons, and
 * the second is the important one. The renderer's CSP would have to be widened
 * with a `connect-src` for a CDN, and a page that can talk to a CDN is a page
 * that can be talked *to*. And verification belongs where it cannot be reached
 * by anything running in a web page.
 *
 * **Every file is pinned to a SHA-256 recorded at build time.** This is not
 * optional decoration. Without it the app would fetch executable WebAssembly
 * from a third-party CDN and run it in a renderer, which is a supply-chain
 * attack with the app's own hands. The hashes are computed by `scripts/vendor.mjs`
 * from the exact bytes in `node_modules` — the same bytes the feature was tested
 * against — so a CDN that serves anything else fails the install rather than
 * executing. A mismatched file is deleted, not kept.
 *
 * **What this costs, honestly.** It adds one third party to a feature that
 * already had one. Enabling captions already told Hugging Face your IP; it now
 * also tells jsDelivr, once, on first use. Nothing is sent either way but the
 * request, no audio ever leaves the machine, and none of it happens unless the
 * `captions` pref is switched on. Documented in `docs/PRIVACY.md` rather than
 * left for someone to discover in a network log.
 */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const https = require("node:https");

const MANIFEST = path.join(__dirname, "..", "assets", "generated", "captions-runtime.json");

/**
 * Where the downloaded runtime lives — outside the app bundle on purpose,
 * because writing into a signed `.app` breaks its signature.
 *
 * The base directory is passed in rather than read from `app.getPath`. This
 * module has no business importing electron: keeping it out means it can be
 * exercised without a running app, and the audit enforces the rule across the
 * whole `src/` tree rather than trusting anyone to remember it.
 */
const dir = (userData) => path.join(userData, "captions-runtime");

function manifest() {
  try { return JSON.parse(fs.readFileSync(MANIFEST, "utf8")); }
  catch { return null; }
}

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

/** A file counts as present only if its bytes still hash to the pinned value —
 *  a truncated download from a dropped connection must not look installed. */
function verified(file, want) {
  try { return sha256(fs.readFileSync(file)) === want; } catch { return false; }
}

function get(url, redirects = 5) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "user-agent": "AuralFM" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (!redirects) return reject(new Error("too many redirects"));
        return resolve(get(new URL(res.headers.location, url).href, redirects - 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    }).on("error", reject);
  });
}

/** Is everything already on disk and intact? Cheap enough to call on every
 *  settings paint — four hashes over 11 MB. */
function status(userData) {
  const m = manifest();
  if (!m?.files?.length) return { ready: false, reason: "no manifest" };
  const d = dir(userData);
  const missing = m.files.filter((f) => !verified(path.join(d, f.name), f.sha256));
  return {
    ready: missing.length === 0,
    dir: d,
    bytes: m.files.reduce((n, f) => n + f.bytes, 0),
    missing: missing.map((f) => f.name),
  };
}

let installing = null;

/**
 * Download whatever is missing, verify it, and return the directory.
 *
 * Idempotent and safe to call concurrently: the second caller awaits the first
 * rather than starting a parallel download of the same 11 MB.
 */
function ensure(userData, onProgress = () => {}) {
  if (installing) return installing;
  const st = status(userData);
  if (st.ready) return Promise.resolve({ ok: true, dir: st.dir });
  const m = manifest();
  if (!m?.files?.length) {
    return Promise.resolve({ ok: false, error: "captions runtime manifest is missing from this build" });
  }

  installing = (async () => {
    const d = dir(userData);
    fs.mkdirSync(d, { recursive: true });
    let done = 0;
    const total = m.files.reduce((n, f) => n + f.bytes, 0);
    try {
      for (const f of m.files) {
        const out = path.join(d, f.name);
        if (verified(out, f.sha256)) { done += f.bytes; onProgress({ done, total }); continue; }
        onProgress({ done, total, fetching: f.name });
        const buf = await get(f.url);
        const got = sha256(buf);
        if (got !== f.sha256) {
          // Deleted rather than left on disk: a bad file that stays would be
          // re-verified and re-rejected forever, and a half-installed runtime
          // directory is worse than an empty one.
          try { fs.rmSync(out, { force: true }); } catch {}
          throw new Error(
            `${f.name} failed verification — expected ${f.sha256.slice(0, 12)}…, got ${got.slice(0, 12)}…`);
        }
        // Write to a temp name and rename, so an interrupted write can never
        // leave a file that looks complete.
        const tmp = out + ".part";
        fs.writeFileSync(tmp, buf);
        fs.renameSync(tmp, out);
        done += f.bytes;
        onProgress({ done, total });
      }
      return { ok: true, dir: d };
    } catch (e) {
      return { ok: false, error: String((e && e.message) || e) };
    } finally {
      installing = null;
    }
  })();
  return installing;
}

/** The panic wipe already clears all of userData, so this is for anyone who
 *  just wants the 11 MB back without erasing everything else. */
function remove(userData) {
  try { fs.rmSync(dir(userData), { recursive: true, force: true }); return true; }
  catch { return false; }
}

module.exports = { ensure, status, remove, dir };
