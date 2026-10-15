/**
 * IPC: The app-level handlers: saved state, preferences, language, palettes, the in-app documents, tips, and opening things elsewhere.
 *
 * Registered once, from main.js, which passes `ctx`: the helpers these
 * handlers share with the rest of the main process, and getters for the windows
 * — getters, because the windows are created and destroyed after registration.
 */

const { app, clipboard, ipcMain, net, protocol, shell, systemPreferences } = require("electron");
const crypto = require("node:crypto");
const docs = require("../docs");
const geo = require("../geo");
const i18n = require("../i18n");
const palettes = require("../palettes");
const tips = require("../tips");
const favsync = require("../favsync");

module.exports = function register(ctx) {
  const { broadcast, getPrefs, getStrings, load, openExplore, openOutside, openSettings, save, setPrefs } = ctx;

  // ── ipc ───────────────────────────────────────────────────────────────────────
  ipcMain.handle("state:get", () => load());
  /**
   * What a renderer is allowed to write.
   *
   * `state:set` used to take whatever it was handed and write the file. Every
   * renderer that calls it does read-then-write-whole — the popover loads the
   * entire saved state into a local object at start-up and persists all of it on
   * every volume nudge — so anything main changed in between was overwritten by a
   * copy that predated it. That is not a race that can be won by merging, because
   * the renderer is *sending* the stale keys, not omitting them.
   *
   * So ownership rather than merging. These five belong to the renderers, and
   * everything else in the file is main's: `prefs` has setPrefs, `layers` has
   * setLayers, and neither is ever written through here. Keys outside this list are
   * dropped rather than rejected — a renderer sending a stale `prefs` is not
   * misbehaving, it is round-tripping something it was given.
   *
   * It closes a small hole as well. A renderer could previously rewrite every
   * preference through state:set, bypassing the type checks in prefs.normalize.
   */
  const RENDERER_KEYS = ["favorites", "vol", "lastChannel", "exploreView", "locked"];

  /**
   * Merge a patch from a renderer.
   *
   * Only the keys actually present are taken, and that is load-bearing rather than
   * defensive: two windows write here, they each hold their own copy, and the one
   * that sends a whole state object sends whatever it last read — which is not
   * what is on disk.
   *
   * That once lost a user's favorites. The popover reads state once at launch and
   * never again; every volume nudge and every tune called `persist()`, which sent
   * its entire boot-time snapshot back. Star a station in Explore, then touch the
   * volume, and the popover's stale `favorites` array overwrote it. It looked
   * intermittent and sequence-dependent because it was: it depended on which
   * window wrote last.
   *
   * Both renderers now send only what they changed, and the result is broadcast so
   * neither one is ever working from a copy the other has already replaced. This
   * is the same reasoning that put muted.js, social.js and mystations.js in files
   * of their own — favorites are the one list of the user's that never got that
   * treatment.
   */
  ipcMain.handle("state:set", (_e, incoming) => {
    if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) return false;
    const current = load();
    const merged = { ...current };
    const touched = [];
    for (const k of RENDERER_KEYS) {
      if (k in incoming) { merged[k] = incoming[k]; touched.push(k); }
    }
    const ok = save(merged);
    // Tell every window what the truth is now, so the next patch is built on it.
    if (ok && touched.length) broadcast("state:changed", merged);
    if (ok && touched.includes("favorites")) favsync.touch();
    return ok;
  });

  /**
   * Favorites sync (src/favsync.js): on, off, the code, and "now".
   *
   * One channel, because Settings is the only caller and the web build answers
   * the same call (web/bridge.js). The code is the whole of the access to the
   * list, so it is handed over only when asked for, never in a status.
   */
  ipcMain.handle("favsync", (_e, op, arg) => {
    if (op === "start") return favsync.start();
    if (op === "join") return favsync.join(String(arg || "").slice(0, 400));
    if (op === "stop") return favsync.stop();
    if (op === "code") return favsync.code();
    // Copied here, not in the page: a window may only write the clipboard while
    // it has the focus, and the code is too long to ask anyone to select.
    if (op === "copy") { const c = favsync.code(); if (c) clipboard.writeText(c); return !!c; }
    if (op === "now") return favsync.sync();
    return favsync.status();
  });

  /**
   * Rule-based tips.
   *
   * The store lives in the state file, so main owns it. Donating is fire-and-forget
   * — a tip that failed to record an event is not worth interrupting anyone over —
   * and asking for the next one is a question, so it invokes.
   */
  ipcMain.on("tips:donate", (_e, id) => tips.donate(String(id || "")));

  ipcMain.handle("tips:next", (_e, uptime) => {
    const tip = tips.next({ uptime: Number(uptime) || 0 });
    if (tip) tips.shown();
    return tip;
  });

  ipcMain.on("tips:retire", (_e, id, reason) =>
    tips.retire(String(id || ""), String(reason || "dismissed")));

  ipcMain.handle("docs:list", () => docs.list());
  ipcMain.handle("docs:read", (_e, id) => docs.read(id));
  ipcMain.handle("prefs:get", () => getPrefs());
  ipcMain.handle("prefs:set", (_e, patch) => setPrefs(patch));
  ipcMain.on("settings:open", openSettings);
  ipcMain.on("mail:open", () => shell.openExternal("mailto:hello@auralfm.xyz?subject=AuralFM"));
  /**
   * The microphone, as macOS sees it (Your show). Chromium can be handed a
   * microphone macOS has blocked and get silence, or a vague error; asking the
   * system first gives the studio a true answer and, the first time, the
   * system's own prompt. Anything but macOS answers "granted" and lets the
   * browser decide as it always did.
   */
  ipcMain.handle("mic:access", async () => {
    if (process.platform !== "darwin") return "granted";
    let status = systemPreferences.getMediaAccessStatus("microphone");
    if (status === "not-determined") status = (await systemPreferences.askForMediaAccess("microphone")) ? "granted" : "denied";
    return status;
  });
  /**
   * Your show: a track from a link.
   *
   * The studio's page may not reach arbitrary addresses (its
   * Content-Security-Policy), so the link is opened here and handed back as an
   * address of our own, auralfm-track://<token>/, which the page may play. The
   * file is passed through as it arrives, ranges and all: it starts at once and
   * is never held whole in memory (it was downloaded whole first, up to 300 MB,
   * and sent across as one buffer).
   *
   * A direct link to an audio file the host has the right to play, over https;
   * never a web page (a Mixcloud or SoundCloud page is not the audio, and those
   * services do not let other apps take it), and never a live stream, which is
   * a station, not a track.
   */
  const linked = new Map();          // token → the link it stands for
  const UA = { "User-Agent": "AuralFM/0.1" };
  ipcMain.handle("studio:openTrack", async (_e, url) => {
    if (typeof url !== "string" || !/^https:\/\/\S+$/i.test(url)) return { error: "https" };
    try {
      // Two bytes are enough to learn what it is.
      const res = await net.fetch(url, { redirect: "follow", headers: { ...UA, Range: "bytes=0-1" }, signal: AbortSignal.timeout(20000) });
      res.body?.cancel().catch(() => {});
      if (!res.ok) return { error: "status", status: res.status };
      const type = res.headers.get("content-type") || "";
      if (/text\/html|application\/xhtml/i.test(type)) return { error: "page" };
      if (/mpegurl|x-scpls/i.test(type) || res.headers.get("icy-name") || res.headers.get("icy-br")) return { error: "stream" };
      const token = crypto.randomBytes(16).toString("hex");
      linked.set(token, res.url || url);
      // A studio holds one track at a time; the last few are kept for "Change".
      while (linked.size > 8) linked.delete(linked.keys().next().value);
      const name = decodeURIComponent(new URL(res.url || url).pathname.split("/").pop() || "") || "Track from a link";
      return { name, src: `auralfm-track://${token}/` };
    } catch (e) {
      return { error: e?.name === "TimeoutError" ? "slow" : "failed" };
    }
  });
  app.whenReady().then(() => {
    protocol.handle("auralfm-track", async (req) => {
      const to = linked.get(new URL(req.url).hostname);
      if (!to) return new Response(null, { status: 404 });
      const range = req.headers.get("range");
      try {
        const res = await net.fetch(to, { redirect: "follow", headers: range ? { ...UA, Range: range } : UA, signal: req.signal });
        const headers = new Headers();
        for (const k of ["content-type", "content-length", "content-range", "accept-ranges"]) {
          const v = res.headers.get(k); if (v) headers.set(k, v);
        }
        // The studio mixes this track with the microphone (Web Audio), and a
        // mixer hears silence from anything that does not say it may be read.
        headers.set("Access-Control-Allow-Origin", "*");
        return new Response(res.body, { status: res.status, headers });
      } catch {
        return new Response(null, { status: 502 });
      }
    });
  });
  ipcMain.on("mic:settings", () => {
    if (process.platform === "darwin") shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone");
  });
  ipcMain.handle("i18n:strings", () => getStrings());
  ipcMain.handle("i18n:languages", () => i18n.LANGUAGES);
  ipcMain.handle("palettes:list", () => palettes.list());
  ipcMain.handle("palettes:get", () => palettes.byId(getPrefs().palette));
  /**
   * Version, and which channel built it.
   *
   * `buildChannel` is stamped into the packaged package.json by electron-builder
   * at build time (see the dist:* scripts). It is absent in development and on a
   * production build, which is the point: a tester should be able to read "beta"
   * off the About panel without being asked which DMG they installed, and a
   * release should say nothing extra.
   */
  ipcMain.handle("app:version", () => {
    let channel = null;
    // From the app's own folder, not a path relative to this file: this moved
    // from src/main.js into src/main/ with "../package.json" unchanged, which
    // then named a file that does not exist, and every build said no channel.
    try { channel = require(require("node:path").join(app.getAppPath(), "package.json")).buildChannel || null; } catch { /* dev */ }
    return { version: app.getVersion(), channel, dev: !app.isPackaged };
  });
  // Which of the two the listener uses, for the lines the page words itself.
  ipcMain.handle("geo:unit", (_e, units) => geo.resolveUnits(units, app.getLocale()));
  ipcMain.handle("geo:distance", (_e, aLat, aLon, bLat, bLon, units) =>
    geo.format(geo.haversine(aLat, aLon, bLat, bLon),
               geo.resolveUnits(units, app.getLocale())));

  // Headlines open in the real browser. AuralFM is not a reader and should not
  // pretend to be one — see the note in src/news.js.
  ipcMain.on("open:external", (_e, url) => {
    openOutside(url);
  });
  ipcMain.on("explore:open", openExplore);
};
