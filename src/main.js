/**
 * AuralFM — main process.
 *
 * Owns the tray icon and the popover window. The popover is created once and
 * hidden rather than destroyed, so audio keeps playing while it's out of sight.
 */

const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, screen, shell, globalShortcut, dialog, session, nativeTheme, protocol } = require("electron");
const path = require("node:path");

/**
 * Identify this app to every server it touches, including the receivers.
 *
 * The rule this follows: send a contactable User-Agent, because
 * the Node-side fetches already do. The renderer did not: a browser WebSocket
 * cannot set its own User-Agent header, so every connection to a volunteer's
 * KiwiSDR was arriving labelled as Chrome. An operator watching their own logs
 * could see the traffic and had no way to tell what it was or who to contact —
 * which is the exact situation that ends with a receiver being firewalled
 * rather than a maintainer being emailed.
 *
 * `userAgentFallback` covers the whole session: renderer fetches, WebSocket
 * upgrades, everything. Set before any window exists, because the value is read
 * when a session is created.
 */
app.userAgentFallback = require("./useragent").UA;
const fs = require("node:fs");
const catalog = require("./catalog");
const resolver = require("./resolver");
const weather = require("./weather");
const markets = require("./markets");
const prefs = require("./prefs");
const mine = require("./mystations");
const tips = require("./tips");
const muted = require("./muted");
const social = require("./social");
const durable = require("./identity");
const safety = require("./safety");

/**
 * Everything that reaches a renderer's chat goes through here.
 *
 * Three separate decisions — muted, filtered, strangers — applied in one place
 * so they cannot drift apart. The bug this prevents is specific and was already
 * live once in a smaller form: notes and private messages each got their own
 * `muted.filter()` call, and any fourth channel added later would have quietly
 * shipped without one. One funnel, and adding a channel means calling it.
 *
 * All of it runs in main, so a hidden message is never in a renderer at all.
 */
function visible(list) {
  const p = getPrefs();
  return safety.apply(muted.filter(list), {
    filter: p.filterChat !== false,
    onlyKept: p.onlyKept === true,
    kept: (pk) => social.isMutual(pk),
  });
}
const i18n = require("./i18n");
const failures = require("./failures");
const nostr = require("./presence-nostr");
const clouds = require("./clouds");
const iss = require("./iss");
const satellites = require("./satellites");
const sdr = require("./sdr");
const schedule = require("./schedule");
const wspr = require("./wspr");
const space = require("./space");

// height is the cap, not the size — the panel grows to fit its content. The cap
// is a share of the usable screen so it doesn't overflow a small display.
// Without this the app menu reads "Electron" when running from source; the
// packaged build gets it from productName.
app.setName("AuralFM");

/**
 * Cap the HTTP cache.
 *
 * Chromium sizes its disk cache from free space, which on a large drive means
 * hundreds of megabytes for an app whose entire job is streaming audio it never
 * needs to read twice. Measured on the development machine before this line
 * existed: 633 MB of HTTP cache, and 648 MB more in CacheStorage.
 *
 * 150 MB is generous for the globe textures and the schedule, which are the
 * only things here worth keeping between launches. Must be set before the
 * first session exists, which is why it is up here rather than in whenReady.
 */
app.commandLine.appendSwitch("disk-cache-size", String(150 * 1024 * 1024));

/**
 * The studio's own address for a track from a link (src/main/ipc-app.js).
 *
 * A show's music from a link used to be downloaded whole before a note of it
 * played, which for an hour-long mix is minutes of nothing (Melton, 5 Oct: "it
 * takes hours to load"). Under this scheme the main process passes the file
 * through as it arrives, so it plays from the first second and seeks like any
 * other. It has to be declared before the app is ready; `stream` lets an
 * <audio> element read it, and `corsEnabled` lets the studio's mixer hear it.
 */
protocol.registerSchemesAsPrivileged([{ scheme: "auralfm-track",
  privileges: { standard: true, secure: true, stream: true, corsEnabled: true, supportFetchAPI: true } }]);

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
const { load, save } = require("./main/store");

let tray = null;
let win = null;          // popover — also the one and only audio player
let explore = null;
let quitting = false;
let playerState = { channel: null, status: "", playing: false };
let settingsWin = null;

// ── window hardening ─────────────────────────────────────────────────────────
/**
 * Hand a link to the browser, http(s) only.
 *
 * Station homepages come from crawled third-party listings, so a link can say
 * anything — `file:`, `smb:`, an app's own URL scheme — and `shell.openExternal`
 * will open whatever it is handed. `open:external` already had this check; the
 * popover's window-open handler did not.
 */
function openOutside(url) {
  const u = String(url || "");
  // A station's Tip button (explore-profile.js) is lightning:name@host, handed to
  // the listener's own Lightning wallet. Only that exact shape: nothing else in a
  // lightning: link reaches the wallet from here.
  if (/^https?:\/\//i.test(u) || /^lightning:[\w.+-]{1,64}@[\w.-]{1,120}\.[a-z]{2,}$/i.test(u)) shell.openExternal(u);
}

/**
 * No window of ours opens another window or navigates away from its own page.
 *
 * Without a handler Electron answers `target="_blank"` and `window.open` with a
 * new BrowserWindow loading the remote page inside the app, and a stray link or
 * a dropped file navigates the window itself — with the preload still attached.
 * Only the popover had a handler. The in-app Privacy and Terms render links as
 * `target="_blank"`, so the first document to gain one would have opened a bare
 * Electron window over Settings. Both paths now go to the browser, or nowhere.
 *
 * Reloads do not raise `will-navigate`, so the View menu's Reload still works.
 */
function lockDown(w) {
  w.webContents.setWindowOpenHandler(({ url }) => { openOutside(url); return { action: "deny" }; });
  w.webContents.on("will-navigate", (e, url) => { e.preventDefault(); openOutside(url); });
  return w;
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
      // This window holds the audio and, for shortwave, a live WebSocket to a
      // volunteer's receiver kept open by a setInterval. Chromium throttles
      // timers in hidden windows, and a throttled keepalive means the Kiwi
      // drops us as a silent client. Tuning a receiver used to force this panel
      // visible for exactly that reason. It is a small, mostly idle window, and
      // not throttling it is cheaper than a menu bar panel that appears over
      // your work uninvited.
      backgroundThrottling: false,
    },
  });

  win.loadFile(path.join(__dirname, "renderer", "popover.html"));

  // Clicking away hides the popover — but only hides it, so audio continues.
  win.on("blur", () => { if (!win.webContents.isDevToolsOpened()) hide(); });

  // Keep the window alive across close attempts until we're really quitting.
  win.on("close", (e) => { if (!quitting) { e.preventDefault(); hide(); } });

  // Radio station links open in the real browser, not inside the popover.
  lockDown(win);
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
    // Centred on the 40pt toolbar: the lights are 12pt tall, so 14 puts their
    // middle on its middle, level with the toolbar's tiles.
    trafficLightPosition: { x: 14, y: 14 },
    // No vibrancy or transparent backgroundColor here. On a packaged build this
    // combination broke GPU compositing — the window laid out correctly (DOM,
    // canvas and WebGL context all healthy) but never painted, so it showed as a
    // blank grey rectangle. The popover still uses vibrancy; it is small,
    // frameless, and does not host a WebGL canvas.
    //
    // Onyx rather than #1c1c1e, which was Apple's secondarySystemBackground.
    // The page fades up from this colour on first reveal, so it must match the
    // theme the page is about to paint in — a dark window under a light page
    // means the fade starts on a dark flash, and vice versa.
    backgroundColor: groundColour(),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  lockDown(explore);
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

/**
 * The colour a window shows before its page has painted.
 *
 * This is only visible for a moment, but it is visible: Explore fades its
 * content up on first reveal, so for that fade's duration the window's own
 * background is the backdrop. It has to agree with the theme the page will
 * paint in, or the reveal begins with a flash of the opposite one.
 *
 * These two values are `--bg` from the renderers' token blocks. They are
 * duplicated here because a BrowserWindow needs its colour before any
 * stylesheet exists to ask.
 */
/**
 * Tell macOS which appearance this app is in.
 *
 * The renderer has always honoured the preference: it sets `data-theme` on the
 * root element and the CSS follows. But `nativeTheme.themeSource` was never
 * touched, and that is the only thing macOS reads. So everything the page does
 * not paint kept following the OS instead of the app -- the title bar, the
 * traffic lights, the native menus, the file and message dialogs.
 *
 * On a dark Mac nobody noticed, because the OS and the app agreed by accident.
 * Force light on a dark Mac and the page turns to warm paper under a black
 * title bar, which is where this shows up.
 *
 * Setting it also makes `nativeTheme.shouldUseDarkColors` mean what
 * `groundColour()` assumes it means: the app's appearance rather than the
 * system's.
 */
/**
 * Wear the chosen icon in the Dock.
 *
 * `app.dock.setIcon` is the whole mechanism and it only reaches the Dock. The
 * icon Finder shows lives in the bundle's Info.plist, is read once when the
 * bundle is registered, and cannot be changed by a running process. So this
 * setting does exactly one visible thing, and the Settings copy says so rather
 * than letting somebody wonder why Finder disagrees.
 */
function applyAppIcon(which) {
  if (!app.dock) return;                       // not macOS
  const file = path.join(__dirname, "..", "assets", "generated", `dock-${which || "onyx"}.png`);
  const img = nativeImage.createFromPath(file);
  if (!img.isEmpty()) app.dock.setIcon(img);   // a missing file leaves the default
}

function applyThemeSource(pref) {
  nativeTheme.themeSource = pref === "light" || pref === "dark" ? pref : "system";
}

function groundColour() {
  const pref = getPrefs().theme;
  const dark = pref === "dark" || (pref !== "light" && nativeTheme.shouldUseDarkColors);
  return dark ? "#0C0B0B" : "#FFFFFF";
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
  lockDown(splash);
  // The wave wears the chosen palette's accent (splash.js reads it).
  let accent = "";
  try { accent = require("./palettes").byId(getPrefs().palette)?.accent || ""; } catch { /* bone */ }
  splash.loadFile(path.join(__dirname, "renderer", "splash.html"), { query: accent ? { accent } : {} });
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
      "Stations: radio-browser.info · the stations themselves\n" +
      "Places: GeoNames (CC BY 4.0)\n" +
      "Imagery: NASA GIBS (VIIRS, GOES) · Blue Marble\n" +
      "Sky: Yale Bright Star Catalog via d3-celestial\n" +
      "Weather: Open-Meteo · ISS: wheretheiss.at\n" +
      "Orbits: Celestrak (TLEs) · Headlines: Google News\n" +
      "Markets: CoinGecko\n\n" +
      "The globe, and every mark in the app, drawn by Melton Bell III.\n\n" +
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
  // Off by default: it polls a volunteer service, so it should be a thing you
  // ask for rather than a thing you have to notice and switch off.
  { id: "wspr",           key: "layer.wspr",           default: false },
  { id: "constellations", key: "layer.constellations", default: true },
  { id: "drift",          key: "layer.drift",          default: true },
  // On. It was off "until the read-outs earn their place", and they since have:
  // they were rewritten to lead with where you are looking and moved flush to
  // the bottom of the globe, which is where the maintainer asked for them. A
  // read-out that costs nothing and answers "where am I pointed" is a poor
  // candidate for something you have to discover in a menu.
  // The pulsing rings for other people listening. This had no entry here at
  // all, which meant the rings were the one thing on the globe you could not
  // switch off: turning every layer off left them pulsing.
  { id: "listeners",      key: "layer.listeners",      default: true },
  { id: "statusBar",      key: "layer.statusBar",      default: true },
];

/**
 * Every launch starts quiet: the station dots and the shortwave receivers, and
 * nothing else (Melton, 26 Sept). Clouds, day and night, the ISS, the
 * constellations, the drift, the listeners' rings and the status read-out all
 * come back off each time the app is started from closed, however they were
 * left, so a cold start draws and fetches only what the globe is for. Turning
 * one on lasts until the app quits; closing and reopening the window keeps it.
 * Favourites, the last station and the preferences are untouched.
 */
const ON_AT_LAUNCH = new Set(["stations", "shortwave"]);
function startQuiet() {
  const st = load();
  st.layers = Object.fromEntries(LAYERS.map((l) => [l.id, ON_AT_LAUNCH.has(l.id)]));
  save(st);
}

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

function setPrefs(incoming) {
  // Known keys of the right kind only; see prefs.pick. Everything below branches
  // on which keys are present, so the filtering has to come first.
  const patch = prefs.pick(incoming);
  const st = load();
  if (!Object.keys(patch).length) return getPrefs();
  st.prefs = { ...getPrefs(), ...patch };
  save(st);
  if ("theme" in patch) applyThemeSource(st.prefs.theme);
  if ("appIcon" in patch) applyAppIcon(st.prefs.appIcon);
  broadcast("prefs:changed", st.prefs);
  if ("presence" in patch) syncNostrPresence();
  // Applied before presence so a relay added in the same breath as switching
  // presence on is dialled on the first connection rather than the second.
  if ("relays" in patch) nostr.setExtraRelays(st.prefs.relays);
  // Both change what is allowed through the funnel, so what is already on screen
  // is now wrong. Repaint from main's copy rather than waiting for the next
  // message — switching the filter on and watching nothing happen reads as a
  // dead setting.
  if ("hideExplicit" in patch) catalog.setHideExplicit(st.prefs.hideExplicit);
  if ("filterChat" in patch || "onlyKept" in patch) refreshChat();
  if ("powFloor" in patch) { nostr.setPowFloor(getPrefs().powFloor || 0); refreshChat(); }
  /**
   * Switching the durable identity on mints the key; switching it off destroys
   * it, and destroying it is not reversible.
   *
   * Turning it off cannot be a soft toggle that leaves the file sitting there —
   * "off" has to mean the key is gone, or the setting is a lie about what is on
   * disk. The consequence is that anyone holding your fingerprint now holds a
   * fingerprint of nothing, which is why Settings says so before it happens
   * rather than after.
   */
  if ("durableIdentity" in patch) {
    if (st.prefs.durableIdentity) durable.ensure();
    else durable.forget();
    // The inbox set just changed, so the envelope subscription has to be re-sent
    // with the new key list or nothing would arrive until the next cell change.
    nostr.resubscribeDms();
    broadcast("presence:stats", nostr.stats());
  }
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
    backgroundColor: groundColour(),   // follows the theme, like Explore
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  lockDown(settingsWin);
  settingsWin.loadFile(path.join(__dirname, "renderer", "settings.html"));
  settingsWin.on("closed", () => { settingsWin = null; });
}

/** Interface strings for the resolved language, English-filled. */
const getStrings = () => i18n.strings(getPrefs().language, app.getLocale());


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
  nostr.setPowFloor(getPrefs().powFloor || 0);
  // A host is in their show's town (below), whatever was playing before.
  const ch = hosting || (playerState.playing ? playerState.channel : null);
  if (!on || !ch || typeof ch.lat !== "number" || typeof ch.lon !== "number") {
    nostr.leave();
    return;
  }
  nostr.join(ch.lat, ch.lon, hosting ? "" : ch.title || "");
}

/**
 * Your show: the host stands in the town the show goes out from.
 *
 * The studio's panel puts that town's room beside the globe so a host can read
 * and answer the people there (Melton, 5 Oct 2026). It is the same rule as a
 * station, with the same two conditions: presence is on, and the place is one
 * the host chose on the globe, never where they are. No label goes out with it
 * (a station's name would): a show nobody can hear yet is not something to
 * announce as playing.
 */
let hosting = null;
ipcMain.on("studio:host", (_e, lat, lon) => {
  const next = typeof lat === "number" && typeof lon === "number" && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;
  if (JSON.stringify(next) === JSON.stringify(hosting)) return;
  hosting = next;
  syncNostrPresence();
});

// ── tray ──────────────────────────────────────────────────────────────────────
/**
 * The globe in the menu bar, and why it turns.
 *
 * The old icon was the licensed line mark: eight parallels inside a circle. At
 * sixteen pixels those parallels sit one pixel apart and average into a grey
 * disc, which is neither legible nor recognisable as anything. This is the
 * glyph everyone already reads as a globe -- an outline, an equator, two
 * meridians -- and it survives the size.
 *
 * It rotates only while something is playing, and that is the point rather than
 * decoration: the menu bar tells you the app is making sound without you having
 * to open anything. Idle, it holds frame zero and no timer exists.
 *
 * Twelve frames at 125ms is one turn every 1.5 seconds, and the work per tick
 * is swapping an already-decoded 16px image. On the low-end hardware this app
 * targets, that is cheaper than the globe it represents drawing a single frame.
 */
const TRAY_FRAMES = [];
let trayFrame = 0, trayTimer = null;

function loadTrayFrames() {
  for (let i = 0; i < 12; i++) {
    const img = nativeImage.createFromPath(
      path.join(__dirname, "..", "assets", "tray", `globe-${String(i).padStart(2, "0")}.png`));
    if (img.isEmpty()) return false;
    // Template images are recoloured by macOS to match the menu bar, in both
    // appearances and inverted while a menu is open. Without this they stay
    // black and vanish on a dark menu bar.
    img.setTemplateImage(true);
    TRAY_FRAMES.push(img);
  }
  return true;
}

function spinTray(on) {
  if (!tray || TRAY_FRAMES.length !== 12) return;
  if (on && !trayTimer) {
    trayTimer = setInterval(() => {
      trayFrame = (trayFrame + 1) % 12;
      tray.setImage(TRAY_FRAMES[trayFrame]);
    }, 125);
  } else if (!on && trayTimer) {
    clearTimeout(trayTimer); clearInterval(trayTimer); trayTimer = null;
    trayFrame = 0;
    tray.setImage(TRAY_FRAMES[0]);        // always parked in the same place
  }
}

/**
 * The globe, for the one menu item that opens it.
 *
 * Read once and kept. Menus are rebuilt on every right-click so the language can
 * change, and re-reading two files from disk each time to draw a 16px picture is
 * work for nothing. Failure is not fatal: a menu item without a picture is still
 * a menu item, and an icon is not worth taking the tray down for.
 */
let menuGlobe;
function menuGlobeIcon() {
  if (menuGlobe === undefined) {
    try {
      menuGlobe = nativeImage.createFromPath(
        path.join(__dirname, "..", "assets", "generated", "menuGlobe.png"));
      if (menuGlobe.isEmpty()) menuGlobe = null;
    } catch { menuGlobe = null; }
  }
  return menuGlobe || undefined;
}


function createTray() {
  // Fall back to the shipped mark if the frames are missing rather than
  // starting with no tray icon at all, which would leave a menu bar app with
  // nothing to click.
  const icon = loadTrayFrames()
    ? TRAY_FRAMES[0]
    : (() => {
        const i = nativeImage.createFromPath(
          path.join(__dirname, "..", "assets", "generated", "trayTemplate.png"));
        i.setTemplateImage(true);
        return i;
      })();

  tray = new Tray(icon);
  tray.setToolTip("AuralFM");
  tray.on("click", toggle);

  tray.on("right-click", () => {
    // Built on demand so it always reflects the current language.
    const t = getStrings();
    tray.popUpContextMenu(Menu.buildFromTemplate([
      { label: "AuralFM", enabled: false },
      { type: "separator" },
      { label: t["menu.openGlobe"], icon: menuGlobeIcon(), click: openExplore },
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
/**
 * The handlers live in src/main/ipc-*.js, one module per area. This is what
 * they need from here: shared helpers, and getters for the windows, which are
 * created and destroyed long after the handlers are registered.
 */
const ctx = {
  get win() { return win; },
  POPOVER, broadcast, getPrefs, getStrings, hide, hydrateMine, layerState, load, maxPopoverHeight, openExplore, openOutside, openSettings, refreshChat, save, setLayer, setPrefs, visible,
};
for (const mod of ["errors","app","catalog","player","chat","globe","card"]) require(`./main/ipc-${mod}`)(ctx);


/** Repaint every chat channel from main's copy, after a rule changed. */
function refreshChat() {
  broadcast("presence:messages", visible(nostr.history()));
  broadcast("presence:notes", visible(nostr.noteHistory()));
  broadcast("presence:dms", visible(nostr.dmHistory()));
}

/** The popover is the source of truth for playback; everyone else observes. */
ipcMain.on("player:state", (_e, state) => {
  playerState = state;
  spinTray(!!state.playing);
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
    // Before any window exists: a saved theme preference has to reach macOS
    // before the first title bar is drawn, or the app launches in the system
    // appearance and corrects itself only when the setting is next touched.
    applyThemeSource(getPrefs().theme);
    applyAppIcon(getPrefs().appIcon);

    // A launch is a launch whether or not a window renders, so it is donated
    // here rather than from the renderer.
    tips.init(app.getPath("userData"));
    muted.init(app.getPath("userData"));
    social.init(app.getPath("userData"));
    safety.init(app.getPath("userData"));
    durable.init(app.getPath("userData"));
    /**
     * The preference being on *is* the request, so honour it even if the file is
     * missing.
     *
     * This used to read `&& durable.exists()`, guarding against minting a key on
     * a first launch. That guard was protecting against a state that cannot
     * happen — the preference defaults to false, so a fresh install asks for
     * nothing — and in exchange it created one that can: preference on, no key.
     * Settings then showed the switch ON next to "off — no lasting key exists",
     * and the person believed they were reachable at a durable identity while the
     * envelope subscription never included one. Nobody could write to them.
     */
    if (getPrefs().durableIdentity) durable.ensure();
    tips.donate("appOpened");

    // Standalone app with a menu bar companion: the globe is what people came
    // for, so it opens on launch rather than hiding behind an unlabelled tray
    // icon. The menu bar keeps every behaviour it had — it is now the thing that
    // keeps playback going once the window is closed.
    catalog.load();
    catalog.setHideExplicit(getPrefs().hideExplicit);
    // Favourites and the last station saved under the catalogue's old ids find
    // themselves again by name (catalog.relinkSaved); nothing else is touched.
    {
      const { state, moved } = catalog.relinkSaved(load());
      if (moved) { save(state); console.log(`catalog: ${moved} saved stations moved to their new ids`); }
    }
    startQuiet();
    resolver.init(app.getPath("userData"));
    failures.init(app.getPath("userData"));
    clouds.init(app.getPath("userData"));
    satellites.init(app.getPath("userData"));
    mine.init(app.getPath("userData"));
    sdr.init(app.getPath("userData"));
    sdr.refresh();          // never awaited: a stale receiver list is a fine list
    markets.start();        // live crypto feed; falls back to polling on its own
    nostr.onPeers((list) => explore?.webContents.send("presence:peers", list));
    // Filtered here, not in the renderer. A muted message never crosses the
    // bridge, so there is nothing in the DOM to hide and nothing to render by
    // accident later.
    nostr.onMessages((list) =>
      explore?.webContents.send("presence:messages", visible(list)));
    // Notes and private messages go through the same mute filter, for the same
    // reason: somebody you have silenced is silenced everywhere, not only in the
    // channel where you happened to silence them.
    nostr.onNotes((list) =>
      explore?.webContents.send("presence:notes", visible(list)));
    // A hub is a private room, but muting and the word filter are about your
    // window rather than about the channel, so it goes through the same funnel.
    nostr.onHub((list) =>
      explore?.webContents.send("hub:messages", visible(list)));
    nostr.onDms((list) => {
      const clean = visible(list);
      explore?.webContents.send("presence:dms", clean);
      // The menu bar shows the count, so it has to hear about it too.
      win?.webContents.send("presence:unread", clean.filter((m) => m.unread).length);
    });
    /**
     * They favorited us. Authenticated inside the envelope — see the note in
     * presence-nostr's takeDm — so this is a fact about a keyholder rather than
     * a claim by a relay.
     */
    nostr.onFavorited((pubkey, on) => {
      if (muted.has(pubkey)) return;      // a blocked person cannot become a contact
      social.noteMutual(pubkey, on);
      explore?.webContents.send("social:changed", social.list());
    });
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
