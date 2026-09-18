/**
 * AuralFM — main process.
 *
 * Owns the tray icon and the popover window. The popover is created once and
 * hidden rather than destroyed, so audio keeps playing while it's out of sight.
 */

const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, screen, shell, globalShortcut, dialog, session, nativeTheme, clipboard } = require("electron");
const path = require("node:path");
const geo = require("./geo");

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
const news = require("./news");
const markets = require("./markets");
const prefs = require("./prefs");
const palettes = require("./palettes");
const mine = require("./mystations");
const docs = require("./docs");
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
const flights = require("./flights");
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
/**
 * Write the state file, with a ceiling.
 *
 * IPC is this app's request boundary — there is no HTTP server, so `state:set`
 * is the closest thing it has to a POST body, and it took whatever it was given
 * and wrote it to disk. No size limit, no shape check. A renderer bug that
 * appended to an array in a loop, or anything that ever got code execution in a
 * renderer, could fill the disk one call at a time.
 *
 * 4 MB is roughly forty times the largest state this app has ever produced
 * (1.4 KB with favourites and history), so it cannot be hit by legitimate use
 * and is nowhere near a size that hurts to write.
 *
 * The old state is left alone when a write is rejected. Losing what is already
 * there because the new value was bad is the worse of the two failures.
 */
const STATE_MAX_BYTES = 4 * 1024 * 1024;

function save(state) {
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    console.error("save refused: state must be a plain object");
    return false;
  }
  let json;
  try {
    json = JSON.stringify(state);
  } catch (err) {
    // Circular structures and BigInt both land here.
    console.error("save refused: not serialisable —", err.message);
    return false;
  }
  if (!json || Buffer.byteLength(json) > STATE_MAX_BYTES) {
    console.error(`save refused: ${Buffer.byteLength(json || "")} bytes exceeds the ${STATE_MAX_BYTES} cap`);
    return false;
  }
  try {
    fs.mkdirSync(path.dirname(STORE), { recursive: true });
    fs.writeFileSync(STORE, json);
    return true;
  } catch (err) { console.error("save failed:", err.message); return false; }
}

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
  if (/^https?:\/\//i.test(String(url || ""))) shell.openExternal(url);
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
  return dark ? "#0C0B0B" : "#F2EFE9";
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
  // The pulsing rings for other people listening. This had no entry here at
  // all, which meant the rings were the one thing on the globe you could not
  // switch off: turning every layer off left them pulsing.
  { id: "listeners",      key: "layer.listeners",      default: true },
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
  const ch = playerState.playing ? playerState.channel : null;
  if (!on || !ch || typeof ch.lat !== "number" || typeof ch.lon !== "number") {
    nostr.leave();
    return;
  }
  nostr.join(ch.lat, ch.lon, ch.title || "");
}

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
// The documentation, read in the app rather than on GitHub. `docs.read` takes
// an id and looks it up in its own allowlist, so no path from the renderer ever
// reaches the filesystem.
/**
 * Errors, written down and kept here.
 *
 * A rolling local file in userData, capped so it can never grow without bound.
 * There is deliberately no upload: "nothing that reports back" is the project's
 * position and crash data is exactly the kind of exception that erodes one. If a
 * user wants to send a report they can open the file and choose to.
 */
/**
 * The main process needs a boundary too.
 *
 * errors.js covers the renderers, and that felt like the job was done. It was
 * not: a throw in main has no listener, so Electron shows its own dialog — a grey
 * box with a stack trace and an OK button, which is the least reassuring thing a
 * shipped app can put in front of somebody. Melton hit exactly that when a
 * relay's message handler threw.
 *
 * What this does and does not do:
 *
 *   **It does not quit.** Most of what reaches here is one subsystem failing on
 *   somebody else's data — a relay sending something unexpected, a poll returning
 *   a shape that changed. The globe, the audio and every other subsystem are
 *   fine, and taking the app down would be a worse outcome than the bug.
 *
 *   **It does not tell the user.** They cannot act on a stack trace. It goes to
 *   the same errors.log the renderers use, so there is one place to look.
 *
 *   **It stops if it cannot stop.** Ten of the same fault in a minute means
 *   something is looping rather than glitching, and a log growing without bound
 *   is its own problem.
 */
const ERR_LOG = path.join(app.getPath("userData"), "errors.log");
const ERR_LOG_MAX = 256 * 1024;

ipcMain.on("app:error", (_e, r) => {
  const line = JSON.stringify({
    at: new Date().toISOString(),
    page: r?.page, where: r?.where, repeat: r?.repeat,
    message: String(r?.message || "").slice(0, 500),
    stack: String(r?.stack || "").slice(0, 2000),
    version: app.getVersion(),
  }) + "\n";
  try {
    // Truncate rather than rotate. Nobody is going to read errors.log.1, and a
    // second file is a second thing to forget to clean up.
    if (fs.existsSync(ERR_LOG) && fs.statSync(ERR_LOG).size > ERR_LOG_MAX) {
      fs.writeFileSync(ERR_LOG, "");
    }
    fs.appendFileSync(ERR_LOG, line);
  } catch { /* logging must never be the thing that breaks */ }
  if (!app.isPackaged) console.error("renderer error:", r?.where, r?.message);
});

{
  const recent = new Map();
  const note = (where, err) => {
    const key = `${where}|${err?.message || err}`;
    const n = (recent.get(key) || 0) + 1;
    recent.set(key, n);
    setTimeout(() => recent.delete(key), 60_000);
    if (n > 10) return;                       // looping, not glitching
    console.error(`main ${where}:`, err?.stack || err);
    try {
      if (fs.existsSync(ERR_LOG) && fs.statSync(ERR_LOG).size > ERR_LOG_MAX) fs.writeFileSync(ERR_LOG, "");
      fs.appendFileSync(ERR_LOG, JSON.stringify({
        at: new Date().toISOString(), page: "main", where,
        message: String(err?.message || err).slice(0, 500),
        stack: String(err?.stack || "").slice(0, 2000),
        version: app.getVersion(), repeat: n,
      }) + "\n");
    } catch { /* logging must never be the thing that breaks */ }
  };
  process.on("uncaughtException", (err) => note("uncaughtException", err));
  process.on("unhandledRejection", (reason) => note("unhandledRejection", reason));
}

ipcMain.handle("app:errorLogPath", () => ERR_LOG);
ipcMain.handle("app:errorLogRead", () => {
  try { return fs.readFileSync(ERR_LOG, "utf8").slice(-ERR_LOG_MAX); } catch { return ""; }
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

/**
 * The mute list.
 *
 * Muting takes the eight-character label the renderer shows and resolves it to a
 * full key through the messages main already has, because the renderer never
 * holds a whole pubkey and should not have to.
 */
/**
 * Panic wipe.
 *
 * BitChat's triple-tap, which throws everything away at once. Worth having for
 * the same reason it has one: somebody may need this app to stop describing them
 * immediately, and hunting through a settings panel is not that.
 *
 * What it clears, and it is deliberately everything: favourites and listening
 * history, the presence identities for every place visited (in memory only —
 * they were never written), the mute list, the tip bookkeeping, and the error
 * log. Preferences survive, because appearance is not a record of anybody.
 *
 * Presence is left off afterwards. Turning it back on is a decision, and a wipe
 * is not the moment to make it on somebody's behalf.
 */
ipcMain.handle("panic:wipe", () => {
  const done = [];
  try { nostr.leave(); nostr.forgetIdentities(); done.push("presence identities"); } catch {}
  try { muted.clear(); done.push("mute list"); } catch {}
  try { social.clear(); done.push("contacts"); } catch {}
  try { nostr.forgetDms(); done.push("private messages"); } catch {}
  // The one key in this app that outlives a session, so the one the wipe has to
  // reach. Nothing to revoke and nobody to notify — anyone holding the
  // fingerprint simply finds that nothing answers to it any more.
  try { durable.forget(); done.push("durable identity"); } catch {}
  // The added terms are a record of what somebody was trying not to see, which
  // is personal even though the shipped list is not. "Erase everything" has to
  // mean it.
  try { safety.reset(); done.push("word list changes"); } catch {}

  const userData = app.getPath("userData");
  for (const f of ["tips.json", "muted.json", "contacts.json", "identity.json",
                   "filter.json", "errors.log"]) {
    try { fs.rmSync(path.join(userData, f), { force: true }); done.push(f); } catch {}
  }

  // The state file is rewritten rather than deleted, so preferences survive and
  // the app does not restart into a first run it did not earn.
  try {
    const keep = load();
    // durableIdentity goes false with it: the key has just been destroyed, and a
    // preference still claiming to be on would silently mint a new one on the
    // next launch — a fresh permanent identity nobody asked for, created by a
    // wipe.
    save({ prefs: { ...(keep.prefs || {}), presence: false, durableIdentity: false },
           layers: keep.layers || {} });
    done.push("favourites and history");
  } catch {}

  broadcast("panic:wiped");
  return done;
});

ipcMain.handle("mute:list", () => muted.list());

ipcMain.handle("mute:add", (_e, pubkey) => {
  const ok = muted.add(String(pubkey || ""));
  // Repaint at once so the muted messages leave the window in the same gesture.
  if (ok) broadcast("presence:messages", visible(nostr.history()));
  return ok;
});

ipcMain.handle("mute:remove", (_e, pubkey) => {
  const ok = muted.remove(String(pubkey || ""));
  if (ok) broadcast("presence:messages", visible(nostr.history()));
  return ok;
});

/**
 * Location notes, private messages, contacts.
 *
 * All of it goes through here rather than being reachable from a renderer,
 * because all of it needs a private key and a renderer must never hold one.
 */
ipcMain.handle("notes:history", () => visible(nostr.noteHistory()));
ipcMain.handle("notes:drop", (_e, text) => nostr.drop(text, getPrefs().nickname));

ipcMain.handle("dm:history", () => visible(nostr.dmHistory()));
ipcMain.handle("dm:thread", (_e, pubkey) => visible(nostr.thread(String(pubkey || ""))));
ipcMain.handle("dm:send", (_e, pubkey, text) => {
  const to = String(pubkey || "");
  // Refusing to write to somebody you have muted. Not a technical limit — it is
  // that a mute is a decision about a person, and a UI that lets you message
  // someone whose replies you cannot see is a trap for the person who muted.
  if (muted.has(to)) return false;
  return nostr.dm(to, text);
});
ipcMain.handle("dm:read", (_e, pubkey) => nostr.markRead(String(pubkey || "")));

/**
 * The word filter.
 *
 * Every term is removable, including the shipped ones. A filter whose list you
 * cannot see or change is a stranger's opinion about your window, and the whole
 * argument of this app is that the window is yours.
 */
ipcMain.handle("filter:list", () => ({
  terms: safety.terms(),
  shipped: safety.defaults(),
}));
ipcMain.handle("filter:add", (_e, term) => {
  const ok = safety.add(String(term || ""));
  if (ok) refreshChat();
  return ok;
});
ipcMain.handle("filter:remove", (_e, term) => {
  const ok = safety.remove(String(term || ""));
  if (ok) refreshChat();
  return ok;
});
ipcMain.handle("filter:reset", () => { safety.reset(); refreshChat(); return safety.terms(); });

/** Repaint every chat channel from main's copy, after a rule changed. */
function refreshChat() {
  broadcast("presence:messages", visible(nostr.history()));
  broadcast("presence:notes", visible(nostr.noteHistory()));
  broadcast("presence:dms", visible(nostr.dmHistory()));
}

/**
 * Report somebody.
 *
 * With no server there is nothing to POST to, and standing one up to receive
 * reports would be the backend this project exists without. So the report is an
 * email the person chooses to send, composed for them with the evidence already
 * in it, going to a published address — which is what guideline 1.2 asks for and
 * is the only mechanism here that does not require becoming a host.
 *
 * Two things it deliberately does:
 *
 *   **It mutes them first.** A report that leaves somebody visible while you wait
 *   for a reply has done nothing for the person who filed it. The mute is the
 *   part that takes effect immediately; the email is the part that might matter
 *   later.
 *
 *   **It sends nothing on its own.** It opens a draft. Nothing leaves this Mac
 *   unless the person presses send, and they can read and cut every line of it
 *   first — including the key and the quoted message.
 */
ipcMain.handle("chat:report", (_e, payload) => {
  const p = payload && typeof payload === "object" ? payload : {};
  const key = String(p.pubkey || "");
  if (muted.isKey(key)) muted.add(key);
  refreshChat();

  const lines = [
    "Reporting a message seen in AuralFM's place chat.",
    "",
    `Sender key: ${key || "(unknown)"}`,
    `Place cell: ${String(p.geohash || "(unknown)")}`,
    `Seen at:    ${new Date(Number(p.at) || Date.now()).toISOString()}`,
    "",
    "Message:",
    String(p.text || "").slice(0, 1000),
    "",
    "--",
    "Sent from AuralFM. Nothing was transmitted automatically — this draft was",
    "composed locally and sent by hand. AuralFM has no server and cannot delete",
    "this message from the relays that carry it; the sender is now muted on this",
    "Mac.",
  ];
  const url = "mailto:meltonbell@icloud.com"
    + "?subject=" + encodeURIComponent("AuralFM — reported chat message")
    + "&body=" + encodeURIComponent(lines.join("\n"));
  // mailto has practical length limits in some clients; the quote is already
  // capped, and this is the belt to that braces.
  shell.openExternal(url.slice(0, 8000));
  return true;
});

ipcMain.handle("social:list", () => social.list());
ipcMain.handle("social:get", (_e, pubkey) => social.get(String(pubkey || "")));

/**
 * Favorite somebody, and tell them.
 *
 * The signal is a private message with an empty body and a `fav` tag, so it
 * arrives as a fact rather than as a line of chat. It only reaches them if
 * something is connected — a favorite still records locally when it does not,
 * because your own list should not depend on a relay being up.
 */
ipcMain.handle("social:favorite", (_e, pubkey, on) => {
  const key = String(pubkey || "");
  if (muted.has(key)) return false;
  const ok = social.set(key, { favorite: !!on });
  if (ok) {
    nostr.dm(key, "", [["fav", on ? "1" : "0"]]);
    broadcast("social:changed", social.list());
  }
  return ok;
});

/**
 * Mark a key as verified, or not.
 *
 * Deliberately a plain setter with no cleverness behind it. This is the only
 * claim in the app that means something about a human being — that you compared
 * fingerprints with them and they matched — and the app inferring it from
 * anything at all would make it worthless.
 */
ipcMain.handle("social:verify", (_e, pubkey, on) => {
  const ok = social.set(String(pubkey || ""), { verified: !!on });
  if (ok) broadcast("social:changed", social.list());
  return ok;
});

ipcMain.handle("social:label", (_e, pubkey, label) => {
  const ok = social.set(String(pubkey || ""), { label: String(label || "") });
  if (ok) broadcast("social:changed", social.list());
  return ok;
});

/** The fingerprint of any key, for reading aloud. Pure function, no state. */
ipcMain.handle("social:fingerprint", (_e, pubkey) => {
  const key = String(pubkey || "");
  if (!social.isKey(key)) return null;
  return { fingerprint: durable.fingerprint(key), readable: durable.readable(durable.fingerprint(key)) };
});

ipcMain.handle("docs:list", () => docs.list());
ipcMain.handle("docs:read", (_e, id) => docs.read(id));

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
/** One station by id — for anything holding a name that has lost its place. */
ipcMain.handle("catalog:byId", (_e, id) => catalog.byId(String(id || "")) || null);

/** Somewhere else. The renderer names no station; the catalogue picks. */
ipcMain.handle("catalog:random", () => catalog.randomChannel());

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
ipcMain.handle("prefs:get", () => getPrefs());
ipcMain.handle("prefs:set", (_e, patch) => setPrefs(patch));
ipcMain.on("settings:open", openSettings);
ipcMain.on("mail:open", () => shell.openExternal("mailto:meltonbell@icloud.com?subject=AuralFM"));
ipcMain.handle("i18n:strings", () => getStrings());
ipcMain.handle("i18n:languages", () => i18n.LANGUAGES);
ipcMain.handle("palettes:list", () => palettes.list());
ipcMain.handle("palettes:get", () => palettes.byId(getPrefs().palette));
ipcMain.handle("presence:history", () => visible(nostr.history()));
/**
 * Hubs. A private room reached by knowing a name and a password.
 *
 * The password crosses the bridge once, on the way in, and is never stored or
 * echoed back — `hubState()` returns the name and the public tag, never the key.
 * Messages go through `visible()` like every other channel, because muting and
 * the word filter are about your window and a private room is still your window.
 */
ipcMain.handle("hub:join", (_e, name, password) => nostr.joinHub(name, password));
ipcMain.handle("hub:leave", () => { nostr.leaveHub(); return true; });
ipcMain.handle("hub:state", () => nostr.hubState());
ipcMain.handle("hub:say", (_e, text) => nostr.sayHub(text, getPrefs().nickname));
ipcMain.handle("hub:history", () => visible(nostr.hubHistory()));
/**
 * Look one person up. Reads only, one at a time, and never in bulk — see the
 * note in presence-nostr: a list of authors is a list of who is in your cell.
 */
ipcMain.handle("profile:get", (_e, pubkey) => nostr.lookupProfile(String(pubkey || "")));
ipcMain.handle("profile:known", () => nostr.knownProfiles());

/**
 * A card of what is playing, onto the clipboard.
 *
 * The renderer draws it and hands over a data URL; this only turns that into an
 * image and puts it where a paste will find it. Nothing is uploaded and no
 * network call happens anywhere in this path — a share button is the usual place
 * a privacy promise quietly ends, and this one does not.
 */
/**
 * The card is drawn in Explore; only the popover can hear. So Explore asks, main
 * relays, the popover answers — with a deadline, because a window that is busy
 * or gone must not leave a card waiting forever. No answer simply means a card
 * without a waveform, which is the honest fallback.
 */
let levelsWaiting = null;
ipcMain.handle("card:levels", () => new Promise((resolve) => {
  if (!win || win.isDestroyed()) return resolve(null);
  /**
   * Each request settles itself, exactly once.
   *
   * The first version kept one shared slot and checked "is anybody waiting?".
   * Open the sheet twice and the second request replaced the slot; then the
   * *first* request's timer fired, saw the slot occupied, cleared the second
   * request's timer and resolved itself — leaving the second promise with
   * nothing left to settle it. It hung forever, and an `await` on it hung the
   * share sheet with it. Found by opening the sheet a second time.
   */
  const entry = { settled: false };
  entry.done = (v) => {
    if (entry.settled) return;
    entry.settled = true;
    clearTimeout(entry.timer);
    if (levelsWaiting === entry) levelsWaiting = null;
    resolve(v);
  };
  entry.timer = setTimeout(() => entry.done(null), 700);
  levelsWaiting = entry;
  win.webContents.send("card:levelsWanted");
}));
ipcMain.on("card:levelsAre", (_e, levels) => {
  levelsWaiting?.done(Array.isArray(levels) ? levels.slice(0, 256).map(Number) : null);
});

ipcMain.handle("card:copy", (_e, dataUrl) => {
  const s = String(dataUrl || "");
  if (!/^data:image\/png;base64,/.test(s) || s.length > 12 * 1024 * 1024) return false;
  const img = nativeImage.createFromDataURL(s);
  if (img.isEmpty()) return false;
  clipboard.writeImage(img);
  return true;
});

/** The deep link for what is playing, so it can be pasted beside the card. */
/** Save the card where somebody chooses. Cancelling returns null, not an error. */
ipcMain.handle("card:save", async (_e, dataUrl) => {
  const str = String(dataUrl || "");
  if (!/^data:image\/png;base64,/.test(str) || str.length > 12 * 1024 * 1024) return null;
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath: `AuralFM ${stamp}.png`,
    filters: [{ name: "PNG", extensions: ["png"] }],
  });
  if (canceled || !filePath) return null;
  try {
    fs.writeFileSync(filePath, Buffer.from(str.split(",")[1], "base64"));
    return filePath;
  } catch { return null; }
});

ipcMain.handle("card:link", (_e, title) => {
  const t = String(title || "").trim().slice(0, 120);
  if (!t) return null;
  const link = `auralfm://play?station=${encodeURIComponent(t)}`;
  clipboard.writeText(link);
  return link;
});
// Returns false when there is nowhere to say it — nothing playing, presence off,
// or no relay up. The renderer needs to know rather than assume it landed.
// The nickname comes from prefs unless the caller overrides it, so there is one
// authoritative answer to "who am I" rather than a renderer remembering to pass
// one. It was passing null, so the nickname pref had no effect at all.
ipcMain.handle("presence:say", (_e, text, nick) =>
  nostr.say(text, nick ?? getPrefs().nickname));
/**
 * Explore asks, the popover plays — same rule as stations, so there is still
 * exactly one thing in this app that makes sound.
 */
ipcMain.on("sdr:tune", (_e, rx) => {
  win?.webContents.send("sdr:tune", rx);
  // Deliberately does not show the popover. It used to, and that made the menu
  // bar panel appear over whatever you were doing every single time you clicked
  // a receiver -- which is not what a menu bar panel is for, and is not what
  // tuning a station does. The popover needs to be alive to hold the audio, not
  // visible; it is created hidden at launch and stays that way until somebody
  // clicks the tray icon.
});
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

// Headlines open in the real browser. AuralFM is not a reader and should not
// pretend to be one — see the note in src/news.js.
ipcMain.on("open:external", (_e, url) => {
  openOutside(url);
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
