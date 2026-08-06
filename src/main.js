/**
 * AuralFM — main process.
 *
 * Owns the tray icon and the popover window. The popover is created once and
 * hidden rather than destroyed, so audio keeps playing while it's out of sight.
 */

const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, screen, shell, globalShortcut, dialog, session } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const catalog = require("./catalog");
const resolver = require("./resolver");
const weather = require("./weather");
const news = require("./news");
const markets = require("./markets");
const prefs = require("./prefs");
const palettes = require("./palettes");
const mine = require("./mystations");
const i18n = require("./i18n");
const captionsRuntime = require("./captions-runtime");
const failures = require("./failures");
const presence = require("./presence");
const nostr = require("./presence-nostr");
const clouds = require("./clouds");
const iss = require("./iss");
const satellites = require("./satellites");
const sdr = require("./sdr");
const schedule = require("./schedule");
const flights = require("./flights");
const wspr = require("./wspr");
const space = require("./space");

// height is the cap, not the size — the panel grows to fit its content. The cap
// is a share of the usable screen so it doesn't overflow a small display.
// Without this the app menu reads "Electron" when running from source; the
// packaged build gets it from productName.
app.setName("AuralFM");

/**
 * Carry data over from the GlobeFM name.
 *
 * Electron derives userData from the app name, so renaming moved the whole
 * folder and orphaned everything in it — favourites, the last station, the
 * stations you added yourself, the cached stream URLs that make a dead directory
 * survivable. Losing someone's data to a rename is not an acceptable cost of
 * changing our minds about a name.
 *
 * Copies only our own files, never Electron's caches or cookies, and only when
 * the new location is genuinely empty, so it can never overwrite newer state.
 */
(function migrateFromGlobeFM() {
  const OURS = ["state.json", "streams.json", "failures.json", "tles.json",
                "sdr.json", "stations.user.json"];
  try {
    const next = app.getPath("userData");
    if (fs.existsSync(path.join(next, "state.json"))) return;   // already ours
    const prev = path.join(path.dirname(next), "GlobeFM");
    if (!fs.existsSync(prev)) return;

    fs.mkdirSync(next, { recursive: true });
    const moved = [];
    for (const name of OURS) {
      const from = path.join(prev, name);
      if (!fs.existsSync(from)) continue;
      fs.copyFileSync(from, path.join(next, name));
      moved.push(name);
    }
    // Cached satellite imagery too — it is large and re-downloading is rude.
    for (const f of fs.readdirSync(prev)) {
      if (!/^sky-.*\.(jpe?g|png)$/i.test(f)) continue;
      fs.copyFileSync(path.join(prev, f), path.join(next, f));
      moved.push(f);
    }
    if (moved.length) console.log(`migrated from GlobeFM: ${moved.join(", ")}`);
  } catch (err) {
    // A failed migration must never stop the app starting.
    console.warn("migration skipped:", err.message);
  }
})();

const POPOVER = { width: 392, height: 560, min: 200 };
const STORE = path.join(app.getPath("userData"), "state.json");

let tray = null;
let win = null;          // popover — also the one and only audio player
let explore = null;
let quitting = false;
let playerState = { channel: null, status: "", playing: false };
let settingsWin = null;

// ── tiny JSON store ───────────────────────────────────────────────────────────
function load() {
  try { return JSON.parse(fs.readFileSync(STORE, "utf8")); } catch { return {}; }
}
function save(state) {
  try {
    fs.mkdirSync(path.dirname(STORE), { recursive: true });
    fs.writeFileSync(STORE, JSON.stringify(state));
  } catch (err) { console.error("save failed:", err.message); }
}

// ── popover ───────────────────────────────────────────────────────────────────
function createWindow() {
  win = new BrowserWindow({
    ...POPOVER,
    show: false,
    frame: false,
    resizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    // "popover" is the AppKit material menu bar extras use — lighter and more
    // translucent than under-window, and it keeps its look while unfocused.
    vibrancy: "popover",
    visualEffectState: "active",
    roundedCorners: true,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, "renderer", "popover.html"));

  // Clicking away hides the popover — but only hides it, so audio continues.
  win.on("blur", () => { if (!win.webContents.isDevToolsOpened()) hide(); });

  // Keep the window alive across close attempts until we're really quitting.
  win.on("close", (e) => { if (!quitting) { e.preventDefault(); hide(); } });

  // Radio station links should open in the real browser, not inside the popover.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

function maxPopoverHeight() {
  const b = tray?.getBounds?.() ?? { x: 0, y: 0 };
  const wa = screen.getDisplayNearestPoint({ x: b.x, y: b.y }).workArea;
  // Leave a comfortable margin below; never taller than 78% of the usable height.
  return Math.max(POPOVER.min, Math.min(Math.round(wa.height * 0.78), wa.height - 60));
}

function positionUnderTray() {
  const trayBounds = tray.getBounds();
  const display = screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y });
  const { width } = win.getBounds();

  let x = Math.round(trayBounds.x + trayBounds.width / 2 - width / 2);
  const y = Math.round(trayBounds.y + trayBounds.height + 4);

  // Don't let it hang off the edge of the screen.
  const max = display.workArea.x + display.workArea.width - width - 8;
  x = Math.max(display.workArea.x + 8, Math.min(x, max));

  win.setPosition(x, y, false);
}

function show() {
  positionUnderTray();
  win.show();
  win.focus();
  // Lets the renderer replay its entrance. The window is reused rather than
  // recreated, so a CSS animation alone would only ever run once.
  win.webContents.send("popover:shown");
}
function hide() { if (win?.isVisible()) win.hide(); }
function toggle() { win.isVisible() ? hide() : show(); }

// ── explore window ────────────────────────────────────────────────────────────
function openExplore() {
  if (explore && !explore.isDestroyed()) { explore.show(); explore.focus(); return; }

  showSplash();
  explore = new BrowserWindow({
    width: 940, height: 640, minWidth: 760, minHeight: 460,
    title: "AuralFM",
    // Hidden until the globe has actually painted. Without this the window
    // appears instantly as a grey rectangle and you watch the app assemble
    // itself — textures arriving, dots appearing, the sky replacing a flat
    // colour. Nothing is faster this way; it simply stops being visible.
    show: false,
    titleBarStyle: "hiddenInset",     // traffic lights over our own toolbar
    // No vibrancy or transparent backgroundColor here. On a packaged build this
    // combination broke GPU compositing — the window laid out correctly (DOM,
    // canvas and WebGL context all healthy) but never painted, so it showed as a
    // blank grey rectangle. The popover still uses vibrancy; it is small,
    // frameless, and does not host a WebGL canvas.
    //
    // Onyx rather than #1c1c1e, which was Apple's secondarySystemBackground. The
    // page fades up from this colour on first reveal, so it has to be the same
    // onyx the splash card uses or the fade starts on a grey flash.
    backgroundColor: "#0C0B0B",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  explore.loadFile(path.join(__dirname, "renderer", "explore.html"));

  // A menu bar app runs as an "accessory" with no Dock icon, which also means
  // its windows can't take proper focus or own the menu bar. Become a regular
  // app while Explore is open, then drop back to accessory when it closes.
  explore.on("closed", () => { explore = null; });

  explore.webContents.on("did-finish-load", () => {
    explore?.webContents.send("player:state", playerState);
    explore?.webContents.send("globe:layers", layerState());
    explore?.webContents.send("prefs:changed", getPrefs());
  });

  // Never let the splash strand the app: a renderer that throws before it
  // reports ready would leave a breathing logo and nothing behind it, which is
  // a worse failure than any amount of visible loading.
  clearTimeout(revealTimer);
  revealTimer = setTimeout(revealExplore, 6000);
  explore.on("closed", () => { clearTimeout(revealTimer); closeSplash(); });
}

let revealTimer = null;

/** Swap the splash for the finished window. Safe to call more than once. */
function revealExplore() {
  clearTimeout(revealTimer);
  closeSplash();
  if (explore && !explore.isDestroyed() && !explore.isVisible()) {
    explore.show();
    explore.focus();
  }
}

// Sent by the renderer once the globe has drawn its first frame with points on
// it. Registered here rather than inside openExplore so there is exactly one
// handler for the lifetime of the app.
ipcMain.on("explore:ready", revealExplore);

/**
 * The splash, which is a window and not a picture.
 *
 * Frameless, transparent and not resizable, so the rounded card in the page is
 * the whole visible object. Centred on whichever display the pointer is on
 * rather than the primary one — on a two-monitor desk the primary is often not
 * the one being looked at.
 */
let splash = null;

function showSplash() {
  if (splash && !splash.isDestroyed()) return;
  splash = new BrowserWindow({
    width: 260, height: 260,
    frame: false, transparent: true, resizable: false, movable: true,
    alwaysOnTop: true, skipTaskbar: true, show: false,
    backgroundColor: "#00000000",
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  splash.loadFile(path.join(__dirname, "renderer", "splash.html"));
  splash.once("ready-to-show", () => {
    if (!splash || splash.isDestroyed()) return;
    const pt = screen.getCursorScreenPoint();
    const wa = screen.getDisplayNearestPoint(pt).workArea;
    splash.setBounds({
      x: Math.round(wa.x + (wa.width - 260) / 2),
      y: Math.round(wa.y + (wa.height - 260) / 2),
      width: 260, height: 260,
    });
    splash.show();
  });
  splash.on("closed", () => { splash = null; });
}

function closeSplash() {
  if (splash && !splash.isDestroyed()) splash.close();
  splash = null;
}

/**
 * About panel.
 *
 * Required rather than decorative. The credits have to appear wherever the app
 * is distributed, and the full licence texts have to travel with the code — MIT
 * says so in as many words. `THIRD-PARTY-NOTICES.md` carries those and ships in
 * the bundle; this panel points at it, because a notices file nobody can find
 * from inside the app is a file that satisfies nothing.
 *
 * It is also the right place to state the privacy position plainly, because
 * "collects nothing" is only worth anything if it is said out loud where people
 * can check it.
 */
function showAbout() {
  app.setAboutPanelOptions({
    applicationName: "AuralFM",
    applicationVersion: app.getVersion(),
    copyright:
      "Offline-first · no account · no telemetry · no backend of ours\n" +
      "The station catalogue lives on your machine. Nothing about what you\n" +
      "listen to leaves it.\n\n" +
      "Stations: radio.garden · radio-browser.info\n" +
      "Imagery: NASA GIBS (VIIRS, GOES) · Blue Marble\n" +
      "Sky: Yale Bright Star Catalog via d3-celestial\n" +
      "Weather: Open-Meteo · ISS: wheretheiss.at\n" +
      "Orbits: Celestrak (TLEs) · Headlines: Google News\n" +
      "Markets: CoinGecko\n\n" +
      "Globe icons by emilegraphics, the Noun Project — royalty-free licences\n" +
      "purchased 4 Aug 2026.\n\n" +
      "Full licence texts for everything this app ships, vendors or downloads\n" +
      "are in THIRD-PARTY-NOTICES.md, beside the application.",
  });
  app.showAboutPanel();
}

/**
 * Application menu.
 *
 * Standalone apps need one — without it there is no View menu, which is how
 * people leave full screen when a window has no title bar. It is also the right
 * home for the globe layer toggles: they are view options, not settings.
 */
const LAYERS = [
  { id: "clouds",         key: "layer.clouds",         default: true },
  { id: "dayNight",       key: "layer.dayNight",       default: true },
  { id: "stations",       key: "layer.stations",       default: true },
  { id: "shortwave",      key: "layer.shortwave",      default: true },
  { id: "iss",            key: "layer.iss",            default: true },
  // Off by default: it polls a volunteer feed, so it should be a thing you ask
  // for rather than a thing you have to notice and switch off.
  { id: "flights",        key: "layer.flights",        default: false },
  // Off by default like flights: it polls a volunteer service, so it should be
  // a thing you ask for rather than a thing you have to notice and switch off.
  { id: "wspr",           key: "layer.wspr",           default: false },
  { id: "constellations", key: "layer.constellations", default: true },
  { id: "drift",          key: "layer.drift",          default: true },
  // On. It was off "until the read-outs earn their place", and they since have:
  // they were rewritten to lead with where you are looking and moved flush to
  // the bottom of the globe, which is where the maintainer asked for them. A
  // read-out that costs nothing and answers "where am I pointed" is a poor
  // candidate for something you have to discover in a menu.
  { id: "statusBar",      key: "layer.statusBar",      default: true },
];

function layerState() {
  const saved = load().layers || {};
  const out = {};
  for (const l of LAYERS) out[l.id] = saved[l.id] ?? l.default;
  return out;
}

let menuRebuild = null;

function setLayer(id, on) {
  const st = load();
  st.layers = { ...(st.layers || {}), [id]: on };
  save(st);
  explore?.webContents.send("globe:layers", layerState());
  /**
   * The menu's checkmarks come from this state, so they have to be rebuilt when
   * it changes elsewhere — otherwise toggling a layer in the inspector leaves
   * the menu showing the old answer.
   *
   * Coalesced, because rebuilding the entire application menu on every click is
   * work nobody is looking at: the menu is not open while someone is using the
   * inspector, and flipping four layers in a row rebuilt it four times.
   */
  clearTimeout(menuRebuild);
  menuRebuild = setTimeout(buildMenu, 250);
}

/**
 * Erase everything and quit.
 *
 * The app already claims to keep nothing about you anywhere but this machine.
 * That claim is worth being able to *act on* rather than only read: one item,
 * one confirmation, and the whole of it is gone in under a second.
 *
 * Deliberately wipes the browser storage too — cookies, local storage, caches,
 * the speech model if it was ever downloaded. Those are not "ours" in the sense
 * that we wrote them, which is exactly why leaving them behind would make this a
 * gesture rather than a promise.
 *
 * Not offered as an undo. The dialog says so, there is no backup, and the app
 * quits rather than carrying on with half a state directory.
 */
async function panicWipe() {
  const t = getStrings();
  const { response } = await dialog.showMessageBox({
    type: "warning",
    buttons: [t["erase.confirm"], t["erase.cancel"]],
    defaultId: 1,
    cancelId: 1,
    message: t["erase.title"],
    detail: t["erase.detail"],
  });
  if (response !== 0) return;

  try { nostr.leave(); } catch { /* nothing announced */ }
  try {
    // Cookies, storage, caches — everything Chromium keeps on our behalf.
    await session.defaultSession.clearStorageData();
    await session.defaultSession.clearCache();
  } catch { /* best effort; the files below are the substance */ }

  const dir = app.getPath("userData");
  for (const name of fs.readdirSync(dir)) {
    // SingletonLock and friends belong to the running process; removing them
    // mid-flight is how you get a second instance on the next launch.
    if (name.startsWith("Singleton")) continue;
    try { fs.rmSync(path.join(dir, name), { recursive: true, force: true }); } catch { /* gone already */ }
  }

  app.relaunch();
  app.exit(0);
}

function buildMenu() {
  const layers = layerState();
  const t = getStrings();
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: app.name,
      submenu: [
        { label: t["menu.about"], click: showAbout },
        { type: "separator" },
        { label: t["menu.settings"], accelerator: "Command+,", click: openSettings },
        { type: "separator" },
        { label: t["menu.erase"], click: panicWipe },
        { type: "separator" },
        { label: t["menu.openAtLogin"],
          type: "checkbox",
          checked: app.getLoginItemSettings().openAtLogin,
          click: (i) => app.setLoginItemSettings({ openAtLogin: i.checked }) },
        { type: "separator" },
        { role: "hide" }, { role: "hideOthers" }, { type: "separator" },
        { label: t["menu.quit"], accelerator: "Command+Q",
          click: () => { quitting = true; app.quit(); } },
      ],
    },
    { label: t["menu.edit"], submenu: [
      { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" },
    ]},
    {
      label: t["menu.view"],
      submenu: [
        { label: t["menu.openGlobe"], accelerator: "Command+G", click: openExplore },
        { type: "separator" },
        // The reason this menu exists at all: a hidden-title-bar window gives
        // people no obvious way back out of full screen.
        { role: "togglefullscreen" },
        { type: "separator" },
        ...LAYERS.map((l) => ({
          label: t[l.key],
          type: "checkbox",
          checked: layers[l.id],
          click: (item) => setLayer(l.id, item.checked),
        })),
        { type: "separator" },
        { role: "reload" }, { role: "toggleDevTools" },
      ],
    },
    { label: t["menu.window"], submenu: [
      { role: "minimize" }, { role: "zoom" }, { role: "close" },
    ]},
  ]));
}

// ── preferences ───────────────────────────────────────────────────────────────
const getPrefs = () => prefs.normalize(load().prefs);

function setPrefs(patch) {
  const st = load();
  st.prefs = { ...getPrefs(), ...patch };
  save(st);
  broadcast("prefs:changed", st.prefs);
  if ("presence" in patch) syncNostrPresence();
  // Applied before presence so a relay added in the same breath as switching
  // presence on is dialled on the first connection rather than the second.
  if ("relays" in patch) nostr.setExtraRelays(st.prefs.relays);
  // Menu labels are baked in at build time, so a language change means a rebuild.
  if ("language" in patch) buildMenu();
  return st.prefs;
}

function broadcast(channel, payload) {
  for (const w of [win, explore, settingsWin]) {
    if (w && !w.isDestroyed()) w.webContents.send(channel, payload);
  }
}

function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) { settingsWin.show(); settingsWin.focus(); return; }
  settingsWin = new BrowserWindow({
    width: 460, height: 560,
    resizable: false, minimizable: false, maximizable: false,
    title: "AuralFM Settings",
    titleBarStyle: "hiddenInset",
    backgroundColor: "#1c1c1e",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  settingsWin.loadFile(path.join(__dirname, "renderer", "settings.html"));
  settingsWin.on("closed", () => { settingsWin = null; });
}

/** Interface strings for the resolved language, English-filled. */
const getStrings = () => i18n.strings(getPrefs().language, app.getLocale());

/**
 * Legal documents ship inside the app bundle, which means they live in the asar
 * archive — `shell.openPath` can't reach that, and a .md file has no reliable
 * handler anyway. So we render them ourselves in a plain reading window.
 */
const docWins = new Map();
function openDoc(name) {
  const existing = docWins.get(name);
  if (existing && !existing.isDestroyed()) { existing.show(); existing.focus(); return; }
  const w = new BrowserWindow({
    width: 720, height: 720,
    title: "AuralFM",
    titleBarStyle: "hiddenInset",
    backgroundColor: "#1c1c1e",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  w.loadFile(path.join(__dirname, "renderer", "doc.html"), { query: { name } });
  w.on("closed", () => docWins.delete(name));
  docWins.set(name, w);
}

function docText(name) {
  const file = path.join(__dirname, "..", "docs", name);
  try { return fs.readFileSync(file, "utf8"); } catch { return ""; }
}

/**
 * Announce on Nostr, or stop.
 *
 * Two conditions, both required: the user has switched presence on, and
 * something is actually playing. Announcing silence would be noise, and
 * announcing without being asked would break the only promise this app makes
 * that it could not take back.
 *
 * The coordinates sent are the *station's*, blurred to a four-character geohash
 * — about twenty kilometres. Never the listener's. That is the same rule weather
 * already follows, and it is what makes this honest: "someone is listening to
 * this place" says nothing about where the listener is.
 */
function syncNostrPresence() {
  const on = getPrefs().presence === true;
  nostr.setExtraRelays(getPrefs().relays || []);
  const ch = playerState.playing ? playerState.channel : null;
  if (!on || !ch || typeof ch.lat !== "number" || typeof ch.lon !== "number") {
    nostr.leave();
    return;
  }
  nostr.join(ch.lat, ch.lon, ch.title || "");
}

// ── tray ──────────────────────────────────────────────────────────────────────
function createTray() {
  const icon = nativeImage.createFromPath(
    path.join(__dirname, "..", "assets", "generated", "trayTemplate.png")
  );
  // Template images are recolored by macOS to match the menu bar (light/dark,
  // and inverted while a menu is open). Without this the icon stays black.
  icon.setTemplateImage(true);

  tray = new Tray(icon);
  tray.setToolTip("AuralFM");
  tray.on("click", toggle);

  tray.on("right-click", () => {
    // Built on demand so it always reflects the current language.
    const t = getStrings();
    tray.popUpContextMenu(Menu.buildFromTemplate([
      { label: "AuralFM", enabled: false },
      { type: "separator" },
      { label: t["menu.openGlobe"], click: openExplore },
      { label: t["menu.settings"], click: openSettings },
      { label: t["menu.about"], click: showAbout },
      { type: "separator" },
      {
        label: t["menu.openAtLogin"],
        type: "checkbox",
        checked: app.getLoginItemSettings().openAtLogin,
        click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }),
      },
      { type: "separator" },
      { label: t["menu.quit"], accelerator: "Command+Q", click: () => { quitting = true; app.quit(); } },
    ]));
  });
}

/**
 * Give a user station the same shape as a catalogue channel, so every consumer —
 * the lists, the globe, favourites, the player — needs no special case. `mine`
 * is the only new field, and it exists so the UI can offer to remove it.
 */
function hydrateMine(s) {
  const pl = catalog.placeById?.(s.placeIndex);
  return {
    id: s.id,
    title: s.title,
    secure: s.url.startsWith("https:"),
    tags: s.tags || [],
    band: null,
    rbuuid: null,
    ok: true,
    mine: true,
    place: pl?.title || "",
    country: pl?.country || "",
    lon: pl?.lon ?? null,
    lat: pl?.lat ?? null,
  };
}

// ── ipc ───────────────────────────────────────────────────────────────────────
ipcMain.handle("state:get", () => load());
ipcMain.handle("state:set", (_e, state) => { save(state); return true; });
ipcMain.handle("catalog:search", (_e, q, limit, filter) => {
  // Push known-bad streams down rather than hiding them — a station that failed
  // last night may be fine now, and silently vanishing would be worse.
  const hits = catalog.search(q, limit, filter);
  hits.sort((a, b) => failures.penalty(a.id) - failures.penalty(b.id));
  // Your own stations first. You added them deliberately, so a query that
  // matches one should not have to out-rank 38,000 others to surface it.
  return [...mine.search(q).map(hydrateMine), ...hits];
});
/**
 * Hardware media keys, held only while AuralFM is actually playing.
 *
 * globalShortcut is exclusive: whoever registers a key owns it system-wide. So
 * holding these permanently would steal F7/F8/F9 from Music and Spotify even
 * when AuralFM is silent. Registering on play and releasing on stop keeps the
 * keys with whatever is making sound.
 */
let mediaKeysHeld = false;
function setMediaKeys(on) {
  if (on === mediaKeysHeld) return;
  if (!on) {
    globalShortcut.unregisterAll();
    mediaKeysHeld = false;
    console.log(`media keys: released (playpause=${globalShortcut.isRegistered("MediaPlayPause")})`);
    return;
  }
  const send = (action) => win?.webContents.send("player:mediakey", action);
  const ok = globalShortcut.register("MediaPlayPause", () => send("playpause"))
          && globalShortcut.register("MediaNextTrack", () => send("next"))
          && globalShortcut.register("MediaPreviousTrack", () => send("prev"));
  mediaKeysHeld = ok;
  if (!ok) globalShortcut.unregisterAll();   // all or nothing; half is confusing
  console.log(`media keys: ${ok ? "held" : "NOT registered"}`
    + ` (playpause=${globalShortcut.isRegistered("MediaPlayPause")})`);
}
ipcMain.on("player:mediakeys", (_e, on) => setMediaKeys(!!on));
ipcMain.on("player:transport", (_e, msg) => win?.webContents.send("player:transport", msg));
// Captions are produced where the audio is and drawn where the globe is.
ipcMain.on("caption:line", (_e, msg) => explore?.webContents.send("caption:line", msg));
ipcMain.on("player:failed", (_e, id) => failures.markFailed(id));
ipcMain.on("player:ok", (_e, id) => failures.markPlayed(id));
ipcMain.handle("player:next", (_e, ch, tried) =>
  catalog.nextInPlace(ch, [...(tried || []), ...failures.recentlyFailed()]));
ipcMain.handle("catalog:stats", () => catalog.stats());
ipcMain.handle("stream:resolve", (_e, ch) => {
  // Nothing to resolve: you told us the URL. Going through the three-tier
  // resolver would ask radio.garden about a station it has never heard of.
  if (mine.isMine(ch?.id)) {
    const s = mine.get(ch.id);
    return s ? { url: s.url } : null;
  }
  return resolver.resolve(ch);
});
ipcMain.handle("mine:list", () => mine.all().map(hydrateMine));
ipcMain.handle("mine:add", (_e, input) => {
  const r = mine.add(input);
  if (r.ok) broadcast("mine:changed");
  return r.ok ? { ok: true, station: hydrateMine(r.station) } : r;
});
ipcMain.handle("mine:remove", (_e, id) => {
  const ok = mine.remove(id);
  if (ok) broadcast("mine:changed");
  return ok;
});
ipcMain.on("popover:hide", hide);
ipcMain.on("popover:height", (_e, h) => {
  // AppKit popovers size to their content; a fixed-height panel with a pool of
  // dead space under a short list is the giveaway that this isn't native.
  if (!win || win.isDestroyed()) return;
  const height = Math.round(Math.max(POPOVER.min, Math.min(maxPopoverHeight(), h)));
  const b = win.getBounds();
  if (Math.abs(b.height - height) < 2) return;
  win.setBounds({ ...b, height }, false);
});
ipcMain.handle("catalog:places", (_e, q, limit) => catalog.placeSearch(q, limit));
ipcMain.handle("catalog:placeChannels", (_e, i, filter) => {
  const r = catalog.placeChannels(i, filter);
  if (!r.place) return r;
  // Filters describe catalogue metadata (band, radio-browser tag) that a
  // hand-added station does not have, so yours are only hidden when a filter is
  // actually on — otherwise they would vanish for no reason the user can see.
  const own = (filter?.band || filter?.tag) ? [] : mine.forPlace(i).map(hydrateMine);
  return { ...r, channels: [...own, ...r.channels], total: r.total + own.length };
});
ipcMain.handle("catalog:placeFacets", (_e, i) => ({ tags: catalog.placeTags(i), bands: catalog.placeBands(i) }));
ipcMain.handle("catalog:globePoints", () => {
  const pts = catalog.globePoints();
  const extra = mine.countsByPlace();
  if (!extra.size) return pts;
  const seen = new Set();
  for (const p of pts) {
    const n = extra.get(p[0]);
    if (n) { p[3] += n; seen.add(p[0]); }
  }
  // A station you added somewhere the catalogue has none puts a dot on the
  // globe that was not there before.
  for (const [i, n] of extra) {
    if (seen.has(i)) continue;
    const pl = catalog.placeById?.(i);
    if (pl) pts.push([i, pl.lon, pl.lat, n]);
  }
  return pts;
});
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
    const sky = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "assets", "sky.json"), "utf8"));
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
 */
function resolveArticle(url) {
  if (!/^https?:\/\//i.test(String(url || ""))) return Promise.resolve(null);
  if (!/(^|\.)news\.google\.com$/i.test(new URL(url).hostname)) return Promise.resolve(url);

  return new Promise((done) => {
    let win = new BrowserWindow({
      show: false,
      webPreferences: { offscreen: true, javascript: true, images: false, sandbox: true },
    });
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
ipcMain.handle("prefs:get", () => getPrefs());
ipcMain.handle("prefs:set", (_e, patch) => setPrefs(patch));
ipcMain.on("settings:open", openSettings);
ipcMain.on("doc:open", (_e, name) => {
  if (["PRIVACY.md", "TERMS.md"].includes(name)) openDoc(name);
});
ipcMain.on("mail:open", () => shell.openExternal("mailto:meltonbell@icloud.com?subject=AuralFM"));
ipcMain.handle("doc:text", (_e, name) =>
  ["PRIVACY.md", "TERMS.md"].includes(name) ? docText(name) : "");
ipcMain.handle("i18n:strings", () => getStrings());
ipcMain.handle("i18n:languages", () => i18n.LANGUAGES);
ipcMain.handle("palettes:list", () => palettes.list());
ipcMain.handle("palettes:get", () => palettes.byId(getPrefs().palette));
ipcMain.handle("app:version", () => app.getVersion());

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
ipcMain.handle("flights:get", (_e, lat, lng, span, want) => flights.get(lat, lng, span, want));
ipcMain.handle("wspr:get", (_e, band) => wspr.get(band));
ipcMain.handle("space:get", () => space.get());
ipcMain.handle("presence:stats", () => nostr.stats());

/**
 * Look at a cell without joining it.
 *
 * Only ever a read. `nostr.say` still guards on the *listening* cell, so this
 * cannot be turned into a way to post somewhere you are not, and nothing is
 * announced — which is the point, because a presence beacon that followed the
 * globe would publish a location trail while somebody browsed.
 *
 * Ignored entirely when presence is off, so browsing never quietly starts
 * talking to relays for someone who switched the feature off.
 */
ipcMain.on("presence:view", (_e, lat, lon) => {
  if (getPrefs().presence !== true) return;
  nostr.view(lat, lon);
});

/**
 * The captions runtime — 11 MB of ONNX that is fetched rather than shipped.
 *
 * `status` is cheap and safe to poll; it hashes what is on disk so a truncated
 * download reports as missing rather than as installed. `install` is the only
 * thing here that touches the network, it is idempotent, and progress goes back
 * to the window that asked so an 11 MB download is not a frozen toggle.
 */
ipcMain.handle("captions:runtimeStatus", () => captionsRuntime.status(app.getPath("userData")));
ipcMain.handle("captions:installRuntime", (e) =>
  captionsRuntime.ensure(app.getPath("userData"), (p) => {
    // The renderer may be gone by the time a slow download finishes.
    if (!e.sender.isDestroyed()) e.sender.send("captions:runtimeProgress", p);
  }));
ipcMain.handle("presence:history", () => nostr.history());
// Returns false when there is nowhere to say it — nothing playing, presence off,
// or no relay up. The renderer needs to know rather than assume it landed.
ipcMain.handle("presence:say", (_e, text, nick) => nostr.say(text, nick));
/**
 * Explore asks, the popover plays — same rule as stations, so there is still
 * exactly one thing in this app that makes sound.
 */
ipcMain.on("sdr:tune", (_e, rx) => {
  win?.webContents.send("sdr:tune", rx);
  if (!win?.isVisible()) show();
});
// Headlines open in the real browser. AuralFM is not a reader and should not
// pretend to be one — see the note in src/news.js.
ipcMain.on("open:external", (_e, url) => {
  if (/^https?:\/\//i.test(url)) shell.openExternal(url);
});
ipcMain.on("explore:open", openExplore);

/**
 * There is exactly one <audio> element in this app and it lives in the popover.
 * Explore never plays anything itself — it asks, main forwards, the popover
 * plays. Two windows with their own audio elements would mean two overlapping
 * streams the moment you clicked a station in each.
 */
ipcMain.on("player:tune", (_e, channel) => {
  win?.webContents.send("player:tune", channel);
});

/** The popover is the source of truth for playback; everyone else observes. */
ipcMain.on("player:state", (_e, state) => {
  playerState = state;
  // Presence is opt-in and no-ops entirely when unconfigured.
  if (state.playing && state.channel?.id) presence.join(state.channel.id);
  else presence.leave();
  syncNostrPresence();
  // Station name next to the menu bar icon. Truncated so it can't eat the bar.
  const t = state.playing && state.channel?.title ? state.channel.title : "";
  tray?.setTitle(t ? ` ${t.slice(0, 22)}` : "");
  if (explore && !explore.isDestroyed()) explore.webContents.send("player:state", state);
});

// ── deep links ────────────────────────────────────────────────────────────────
/**
 * auralfm://play?station=KEXP        play the best match for a station name
 * auralfm://play?place=New%20Orleans play the top station in a place
 * auralfm://pause  ·  auralfm://stop  ·  auralfm://next  ·  auralfm://open
 *
 * This is what makes AuralFM callable from Shortcuts and therefore from Siri —
 * the thing Apple's own radio support used to do. A Shortcut just opens a URL.
 */
async function handleDeepLink(raw) {
  let u;
  try { u = new URL(raw); } catch { return; }
  if (u.protocol !== "auralfm:") return;

  const action = (u.hostname || u.pathname.replace(/\//g, "") || "open").toLowerCase();
  const q = u.searchParams;

  if (action === "open") return show();
  if (action === "pause" || action === "stop") return win?.webContents.send("player:mediakey", "playpause");
  if (action === "next") return win?.webContents.send("player:mediakey", "next");
  if (action !== "play") return;

  const station = q.get("station");
  const place = q.get("place");
  let target = null;

  if (station) {
    target = catalog.search(station, 1)[0] || null;
  } else if (place) {
    const hit = catalog.placeSearch(place, 1).places[0];
    if (hit) {
      const list = catalog.placeChannels(hit.i).channels;
      target = list.find((c) => c.ok !== false) || list[0] || null;
    }
  }
  if (target) win?.webContents.send("player:tune", target);
  else console.warn(`deep link: nothing matched ${raw}`);
}

app.setAsDefaultProtocolClient("auralfm");
app.on("open-url", (e, url) => { e.preventDefault(); handleDeepLink(url); });

// ── lifecycle ─────────────────────────────────────────────────────────────────
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", (_e, argv) => {
    const link = argv.find((a) => a.startsWith("auralfm://"));
    if (link) handleDeepLink(link); else openExplore();
  });

  app.whenReady().then(() => {
    // Standalone app with a menu bar companion: the globe is what people came
    // for, so it opens on launch rather than hiding behind an unlabelled tray
    // icon. The menu bar keeps every behaviour it had — it is now the thing that
    // keeps playback going once the window is closed.
    catalog.load();
    resolver.init(app.getPath("userData"));
    failures.init(app.getPath("userData"));
    clouds.init(app.getPath("userData"));
    satellites.init(app.getPath("userData"));
    mine.init(app.getPath("userData"));
    sdr.init(app.getPath("userData"));
    sdr.refresh();          // never awaited: a stale receiver list is a fine list
    markets.start();        // live crypto feed; falls back to polling on its own
    presence.onCountChange((n) => win?.webContents.send("player:listeners", n));
    nostr.onPeers((list) => explore?.webContents.send("presence:peers", list));
    nostr.onMessages((list) => explore?.webContents.send("presence:messages", list));
    if (presence.enabled()) console.log("presence: enabled");
    buildMenu();
    createWindow();
    createTray();
    openExplore();                 // the globe is the app

    // Clicking the Dock icon with no window open reopens the globe, which is
    // what every native macOS app does.
    app.on("activate", () => openExplore());
  });

  // Closing the globe leaves the app alive in the menu bar, still playing. That
  // is the whole point of keeping the companion.
  app.on("window-all-closed", () => { /* stay alive in the tray */ });
  app.on("before-quit", () => { quitting = true; globalShortcut.unregisterAll(); });
}
