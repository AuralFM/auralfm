/**
 * Explore, part 7 of 17: Preferences, palette, dot size, interface language, and the cold open.
 *
 * Explore is one page split across plain scripts that share a global scope, in
 * the order explore.html loads them. Declarations live here; anything that runs
 * at load — listeners, IPC subscriptions, one-off calls — is in wirePrefs(),
 * which explore.js calls once every part has loaded. That keeps the original
 * single-file behaviour: no handler can fire into a part that has not loaded.
 */

// ── preferences ──────────────────────────────────────────────────────────────
/**
 * Appearance, contrast and dot size are set in Settings and pushed to every
 * window, so this reacts rather than polls.
 *
 * "system" removes the attribute entirely instead of writing data-theme="system",
 * which lets the prefers-color-scheme media query win again — an explicit value
 * here would permanently outrank the OS.
 */
let prefs = { theme: "system", contrast: "system", dotSize: "normal", language: "system",
              palette: "onair" };

/**
 * The active colour scheme.
 *
 * A palette touches the things around the planet, never the planet — the Earth
 * is real satellite imagery and recolouring it would destroy the one property
 * the whole app rests on. So: the accent, the station dots, the receiver dots,
 * the atmosphere glow and the stars.
 *
 * The dots are the surface that actually reads as a theme from across the room;
 * there are seven hundred of them and two colours of them.
 */
let palette = null;

async function applyPalette() {
  palette = (await window.auralfm.palette()) || null;
  if (!palette) return;
  const r = document.documentElement;
  // Light appearance needs the darker variant to stay legible on a pale panel,
  // exactly as the hand-written tokens did before palettes existed.
  const light = r.getAttribute("data-theme") === "light" ||
    (r.getAttribute("data-theme") !== "dark" && !matchMedia("(prefers-color-scheme: dark)").matches);
  r.style.setProperty("--accent", light ? palette.accentLight : palette.accent);
  // What sits on the globe is on space, which is dark in both themes.
  r.style.setProperty("--accent-night", palette.accent);
  // Remembered for the web launch screen, which paints before any of this has
  // loaded and so can only wear the theme it was last given (web/launch.js).
  try { localStorage.setItem("auralfm.accent", palette.accent); } catch { /* private mode */ }
  // In light theme the star follows the accent, not `palette.star`.
  // Every palette's star is a near-white or a pale tint -- #F5F0E4, #DCE7FF,
  // #FFE9B0 -- because it was chosen to sit on the night side of a globe. On the
  // light background those measure 1.01 to 1.40:1, which is invisible: Melton
  // could not find the favourite stars at all. accentLight is already designed
  // for this background and clears the 3:1 floor WCAG sets for non-text UI in all
  // nine palettes. Dark theme keeps the pale star, where it measures 12 to 18:1.
  r.style.setProperty("--star", light ? palette.accentLight : palette.star);
  if (globe) {
    globe.atmosphereColor(palette.atmosphere);
    applyLod(true);                       // merged geometry: colour means rebuild
    drawSky();
  }
}

// Large is ~1.7×: enough to be visibly easier to see and to hit, short of the
// point where dense regions like western Europe fuse into one blob.
const DOT_SCALE = { normal: 1, large: 1.7 };
const dotRadius = (d) =>
  (0.09 + Math.sqrt(d.count) * 0.013) * (DOT_SCALE[prefs.dotSize] || 1);

function applyPrefs(next) {
  // Help tags follow the pref, and adopt() migrates any title= that arrived
  // with a freshly rendered row.
  window.Tips?.setEnabled(next?.tips !== false);
  window.Tips?.adopt();
  // Runs once, after the reveal, and only if it has never run.
  window.Tour?.maybeStart(next);
  const prev = prefs;
  prefs = { ...prefs, ...next };
  const r = document.documentElement;

  if (prefs.theme === "system") r.removeAttribute("data-theme");
  else r.setAttribute("data-theme", prefs.theme);
  r.setAttribute("data-contrast", prefs.contrast === "more" ? "more" : "normal");

  // Points are merged into a single geometry, so a size change means a rebuild.
  if (globe && prefs.dotSize !== prev.dotSize && layers.stations) applyLod(true);

  if (prefs.language !== prev.language) {
    applyStrings();
    drawSky();          // the constellation names are part of the interface too
  }
  // Appearance changes swap the accent between its light and dark variants.
  if (prefs.palette !== prev.palette || prefs.theme !== prev.theme ||
      prefs.contrast !== prev.contrast) applyPalette();
}

// ── interface language ───────────────────────────────────────────────────────
/**
 * Only AuralFM's own chrome is translated. Station names, place names and
 * headlines stay in the language of the place they come from — translating
 * those would be wrong, not helpful.
 */
let T = {};
const t = (key, fallback) => T[key] || fallback;

async function applyStrings() {
  T = (await window.auralfm.strings()) || {};
  for (const el of document.querySelectorAll("[data-i18n]")) {
    const v = T[el.dataset.i18n];
    if (v) el.textContent = v;
  }
  for (const el of document.querySelectorAll("[data-i18n-title]")) {
    const v = T[el.dataset.i18nTitle];
    if (v) { el.title = v; el.setAttribute("aria-label", v); }
  }
  // After translation, not before. adopt() moves `title` onto `data-tip` and
  // removes it, and running it first captured the untranslated literal that the
  // markup ships as a fallback — the Layers button showed "Layers" instead of
  // "Choose what the globe shows".
  window.Tips?.adopt();
  for (const el of document.querySelectorAll("[data-i18n-ph]")) {
    const v = T[el.dataset.i18nPh];
    if (v) el.placeholder = v;
  }
}

/**
 * The cold open.
 *
 * Before anything is selected the rail was a single line of instruction above a
 * tall empty panel. Spinning the globe fills it — `followCentre` selects
 * whatever is under the middle — but at launch nobody has spun anything yet, so
 * the first thing the app shows is a blank.
 *
 * What goes there should be *alive*, so the world reads as awake before you
 * touch it, and it should be a door rather than a poster. So: the places where
 * it is currently the middle of the night, which is when radio is most itself —
 * the overnight shows, the stations nobody is watching. Every row flies you
 * there.
 *
 * The hour is solar, computed from longitude rather than a timezone database.
 * That is not a shortcut standing in for civil time: it is the same arithmetic
 * the terminator on the globe uses, so the list and the darkness agree with each
 * other, which they would not if one followed politics and the other the sun.
 */
async function paintColdOpen() {
  // Built rather than found: the station list clears its own innerHTML whenever
  // a place is selected or a search runs, so a static child would exist exactly
  // until the first time anything happened.
  if (selection.placeIndex !== null || sdrSel || showingFavorites) return;
  const el = document.createElement("div");
  el.className = "empty";
  el.id = "coldopen";                   // #coldopen in the stylesheet undoes .empty's centring

  let places = [], stats = null;
  try {
    [places, stats] = await Promise.all([
      window.auralfm.places("", 600).then((r) => r.places || []),
      window.auralfm.stats().catch(() => null),
    ]);
  } catch { return; }

  const utcMin = new Date().getUTCHours() * 60 + new Date().getUTCMinutes();
  const solarHour = (lon) => (((utcMin + lon * 4) / 60) % 24 + 24) % 24;

  const night = places
    .map((p) => ({ ...p, h: solarHour(p.lon) }))
    .filter((p) => p.h >= 22 || p.h < 5)
    .sort((a, b) => b.count - a.count)
    .slice(0, 9);

  // Only now, once the data is in hand, does the placeholder get replaced —
  // otherwise a slow catalogue leaves the rail blank for longer than before.
  if (selection.placeIndex !== null || sdrSel) return;
  stationListEl.innerHTML = "";
  stationListEl.append(el);

  const lead = document.createElement("div");
  lead.className = "colead";
  lead.innerHTML = stats
    ? `<b>${stats.channels.toLocaleString()}</b> ${t("cold.stations", "stations")} · ` +
      `<b>${(stats.places || 0).toLocaleString()}</b> ${t("cold.places", "places")}`
    : "";
  el.append(lead);

  if (!night.length) return;

  const head = document.createElement("div");
  head.className = "cohead";
  head.textContent = t("cold.night", "Where it is the middle of the night");
  const note = document.createElement("div");
  note.className = "conote";
  note.textContent = t("cold.nightWhy",
    "The overnight shows — the hours radio keeps to itself.");
  el.append(head, note);

  const unit = (n) => (n === 1 ? t("cold.station", "station") : t("cold.stationsShort", "stations"));
  for (const p of night) {
    const hh = String(Math.floor(p.h)).padStart(2, "0");
    const mm = String(Math.floor((p.h % 1) * 60)).padStart(2, "0");
    el.append(placeSuggestion(p, `${hh}:${mm} · ${p.country} · ${p.count} ${unit(p.count)}`));
  }
}

function wirePrefs() {
  window.auralfm.onPrefs((next) => { applyPrefs(next); syncChat(next); });

  /**
   * Stations you add or remove can change in another window — Settings has a
   * "Your stations" list with a Remove button on it. Without this, removing one
   * there left it sitting in the rail here until you navigated away and back,
   * and left the globe's dot counting a station that no longer existed.
   */
  window.auralfm.onMineChanged(async () => {
    const raw = await window.auralfm.globePoints();
    globePts = raw.map(([i, lng, lat, count]) => ({ i, lng, lat, count }));
    if (selection.placeIndex != null) await selectPlace(selection.placeIndex, { keepFilter: true });
    applyLod(true);
  });
}
