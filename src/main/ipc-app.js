/**
 * IPC: The app-level handlers: saved state, preferences, language, palettes, the in-app documents, tips, and opening things elsewhere.
 *
 * Registered once, from main.js, which passes `ctx`: the helpers these
 * handlers share with the rest of the main process, and getters for the windows
 * — getters, because the windows are created and destroyed after registration.
 */

const { app, ipcMain, shell } = require("electron");
const docs = require("../docs");
const geo = require("../geo");
const i18n = require("../i18n");
const palettes = require("../palettes");
const tips = require("../tips");

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
   * That cost Melton his favorites. The popover reads state once at launch and
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
    return ok;
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
  ipcMain.on("mail:open", () => shell.openExternal("mailto:meltonbell@icloud.com?subject=AuralFM"));
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
    try { channel = require("../package.json").buildChannel || null; } catch { /* dev */ }
    return { version: app.getVersion(), channel, dev: !app.isPackaged };
  });
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
