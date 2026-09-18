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
wireShortwave();

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
  marketTimer = setInterval(renderMarkets, 1000);

  // The buttons that never change state get their icon once.
  Icons.set($("newsBtn"), "headlines");
  Icons.set($("layersBtn"), "layers");
  Icons.set($("favBtn"), "star");
  Icons.set($("tripBtn"), "plane");
  Icons.set($("setBtn"), "settings");
  Icons.set($("newsSrc"), "source");
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
  } catch (err) {
    // Reveal the status bar for this: an init failure is the one time the read-out
    // has to be visible whether or not the user asked for it.
    const el = $("globestatus") || $("globehint");
    if (el) { el.textContent = err.message; $("globehint").hidden = false; }
  }

  // Quietly flag a stale catalog rather than letting it rot invisibly.
  const st = await window.auralfm.stats();
  const days = st.generated ? Math.floor((Date.now() - new Date(st.generated)) / 86400000) : 0;
  if (days >= 120) {
    placeHeadEl.textContent =
      `${placeHeadEl.textContent} · catalog ${days} days old — run npm run crawl`;
  }
})();
