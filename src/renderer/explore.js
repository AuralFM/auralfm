/**
 * Explore, part 17 of 17: wiring and boot.
 *
 * The parts before this one only declare. Their wiring runs here, in the order
 * the single explore.js used to run it — the order matters for listeners on the
 * same event, which fire in the order they were added.
 */
wirePlayback();
wirePanels();
wireView();
wirePrefs();
wireDial();
wireLayers();
wireChat();
wireCommands();
wireTrackers();
wireSearch();
// The web build ships no shortwave — an https page may not open a receiver's
// ws:// — so kiwi.js and explore-shortwave.js are not copied into it.
if (typeof wireShortwave === "function") wireShortwave();

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && document.activeElement === qEl && qEl.value) {
    qEl.value = ""; runSearch("");
  }
});

// ── boot ─────────────────────────────────────────────────────────────────────
(async () => {
  const state = (await window.auralfm.getState()) || {};
  favorites = Array.isArray(state.favorites) ? state.favorites : [];
  // Before the globe builds, so the first point layer is already the right size.
  applyPrefs((await window.auralfm.getPrefs()) || {});
  await applyPalette();                  // before the globe, so the first build is themed
  await applyStrings();
  setLocked(!!state.locked);
  renderMarkets();
  clearInterval(marketTimer);
  // 1 Hz: the socket is faster than that, but a ticker that changes more often
  // than you can read it is noise, not information.
  // Not while the window is hidden: a price nobody can see is a second of work
  // every second for nothing. The next tick after it is shown catches up.
  marketTimer = setInterval(() => { if (!document.hidden) renderMarkets(); }, 1000);

  // The buttons that never change state get their icon once.
  Icons.set($("newsBtn"), "headlines");
  Icons.set($("layersBtn"), "layers");
  Icons.set($("favBtn"), "star");
  Icons.set($("tripBtn"), "shuffle");
  Icons.set($("setBtn"), "gear");
  // The button chooses whose headlines — the world's, this place's, or the
  // station's — and shows where a tap goes: a pin to local, the globe back to
  // World (renderNewsPanel). The panel opens on World, so it starts as a pin.
  Icons.set($("newsSrc"), "pin");
  setPlayName(false);
  Icons.set($("lock"), "unlock");
  Icons.set($("mute"), "volumeHigh");
  Icons.set($("nowStar"), "star");
  Icons.set($("nowShare"), "dots");
  renderOutputs();

  await loadPlaces("");
  paintColdOpen();
  // The night moves. Repaint on the hour so a window left open overnight is not
  // still offering places where the sun came up hours ago.
  setInterval(paintColdOpen, 15 * 60_000);
  // Receivers before the globe, so the first point layer already carries them.
  try {
    sdrPts = await guard("sdrPoints", () => window.auralfm.sdrPoints(), sdrPts || []);
  } catch { sdrPts = []; }
  try {
    await initGlobe();
    await homeView();          // open on this device's own city, and hold still
  } catch (err) {
    // Reveal the status bar for this: an init failure is the one time the read-out
    // has to be visible whether or not the user asked for it.
    const el = $("globestatus") || $("globehint");
    if (el) { el.textContent = err.message; $("globehint").hidden = false; }
    // And show the app now rather than on a fallback timer: a globe that failed
    // is said so above, which nobody can read behind a splash.
    window.auralfm.exploreReady?.();
  }

  // Quietly flag a stale catalog rather than letting it rot invisibly — but
  // only to somebody who can do something about it. A packaged Mac app cannot
  // run npm, and on the web and the iOS PWA the reader has no terminal at all;
  // for them a slightly old catalogue is not a fault to report, it is a few
  // dead streams the auto-skip already handles. version() answers "is this a
  // build you can rebuild" with the same `dev` the settings badge reads, and
  // the web bridge does not set it. Everyone else is spared the stats() call.
  const { dev } = await window.auralfm.version();
  if (dev) {
    const st = await window.auralfm.stats();
    const days = st.generated ? Math.floor((Date.now() - new Date(st.generated)) / 86400000) : 0;
    if (days >= 120) {
      placeHeadEl.textContent =
        `${placeHeadEl.textContent} · catalog ${days} days old — run npm run catalogue`;
    }
  }
})();
