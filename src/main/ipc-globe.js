/**
 * IPC: What the globe shows: clouds, satellites, the ISS, the sky, weather, headlines and the article reader, markets, receivers and the shortwave schedule, WSPR and space weather.
 *
 * Registered once, from main.js, which passes `ctx`: the helpers these
 * handlers share with the rest of the main process, and getters for the windows
 * — getters, because the windows are created and destroyed after registration.
 */

const { BrowserWindow, app, ipcMain } = require("electron");
const clouds = require("../clouds");
const fs = require("node:fs");
const i18n = require("../i18n");
const iss = require("../iss");
const markets = require("../markets");
const news = require("../news");
const path = require("node:path");
const satellites = require("../satellites");
const schedule = require("../schedule");
const sdr = require("../sdr");
const space = require("../space");
const weather = require("../weather");
const wspr = require("../wspr");
// The app's src/ directory. This file is one level below it.
const SRC = path.join(__dirname, "..");

module.exports = function register(ctx) {
  const { getPrefs, layerState, setLayer } = ctx;

  ipcMain.handle("clouds:get", () => clouds.get());
  ipcMain.handle("iss:get", () => iss.get());
  ipcMain.handle("sats:get", () => satellites.get());
  // The renderer has no filesystem access by design, so the star catalogue comes
  // over IPC rather than a fetch the CSP would block anyway.
  ipcMain.handle("globe:layers", () => layerState());
  // The inspector in Explore writes through the same path the menu uses, so the
  // two can never hold different opinions about what is on.
  ipcMain.on("globe:setLayers", (_e, patch) => {
    for (const [id, on] of Object.entries(patch || {})) setLayer(id, !!on);
  });
  ipcMain.handle("sky:get", () => {
    try {
      const sky = JSON.parse(fs.readFileSync(path.join(SRC, "..", "assets", "sky.json"), "utf8"));
      // Constellation names ship in five languages, and only this process knows
      // which one is in force — "system" is resolved against the OS locale here,
      // not in the renderer. Resolving it now means the canvas never has to guess.
      sky.lang = i18n.resolve(getPrefs().language, app.getLocale());
      return sky;
    } catch { return null; }
  });
  ipcMain.handle("weather:get", (_e, i, lat, lon) => weather.get(i, lat, lon));
  ipcMain.handle("news:get", (_e, country) => news.get(country));

  /**
   * Resolve a Google News link to the article it actually points at.
   *
   * Google News RSS gives `news.google.com/rss/articles/CBMi…` links, and that
   * page is a 590 KB interstitial containing exactly one paragraph and no
   * destination URL — the real address is fetched at runtime by an internal RPC.
   * Following redirects server-side lands on the interstitial and extracts
   * nothing, which is why the reader view returned empty for every story.
   *
   * So a real browser does what a real browser does. A hidden window loads the
   * link, the page's own JavaScript navigates to the publisher, and the first
   * navigation away from google.com is the answer. Nothing is scraped and no
   * private API is reimplemented; this is a click, performed off-screen.
   *
   * Bounded hard: images and media are blocked so only the document loads, the
   * window is destroyed either way, and eight seconds is the whole budget.
   *
   * **Its own session, in memory.** This page runs Google's JavaScript, and in the
   * default session any cookie it set would persist across launches and be sent
   * with every later read — a stable identifier, where PRIVACY.md promises Google
   * gets an IP address and nothing else. A partition without the `persist:`
   * prefix is never written to disk and dies with the process. It navigates on
   * purpose, so it gets no `will-navigate` guard, but it never opens a window.
   */
  const RESOLVER_PARTITION = "news-resolver";   // no "persist:" — memory only

  function resolveArticle(url) {
    if (!/^https?:\/\//i.test(String(url || ""))) return Promise.resolve(null);
    if (!/(^|\.)news\.google\.com$/i.test(new URL(url).hostname)) return Promise.resolve(url);

    return new Promise((done) => {
      let win = new BrowserWindow({
        show: false,
        webPreferences: {
          offscreen: true, javascript: true, images: false, sandbox: true,
          partition: RESOLVER_PARTITION,
        },
      });
      win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { if (win && !win.isDestroyed()) win.destroy(); } catch { /* already gone */ }
        win = null;
        done(result);
      };
      const timer = setTimeout(() => finish(null), 8000);

      win.webContents.on("did-navigate", (_e, to) => {
        try {
          if (!/(^|\.)google\.com$/i.test(new URL(to).hostname)) finish(to);
        } catch { /* not a URL we can read */ }
      });
      win.webContents.on("did-fail-load", () => finish(null));
      win.loadURL(url).catch(() => finish(null));
    });
  }

  ipcMain.handle("news:read", async (_e, url) => {
    const real = await resolveArticle(url);
    if (!real) return null;
    const doc = await news.read(real);
    return doc ? { ...doc, url: real } : null;
  });
  ipcMain.handle("markets:get", () => markets.get());

  // ── shortwave ────────────────────────────────────────────────────────────────
  // Only the aggregate list is served from here. An individual receiver is
  // contacted by the popover, once, when someone clicks it — see src/sdr.js for
  // why that distinction is the whole discipline.
  ipcMain.handle("sdr:points", () => sdr.points());
  ipcMain.handle("sdr:get", (_e, i) => sdr.get(i));
  ipcMain.handle("sdr:stats", () => sdr.stats());
  ipcMain.handle("sdr:nearest", (_e, lat, lng, n) => sdr.nearest(lat, lng, n));
  // What is transmitting right now, from the EiBi schedule. A receiver is a place
  // to listen from; this is the thing to listen to. Computed here rather than in
  // the renderer so the 9,289-row table is parsed once, in one process.
  ipcMain.handle("sdr:onair", (_e, opts) => schedule.onAir(new Date(), opts || {}));
  ipcMain.handle("sdr:schedule", () => schedule.meta());
  ipcMain.handle("wspr:get", (_e, band) => wspr.get(band));
  ipcMain.handle("space:get", () => space.get());
};
