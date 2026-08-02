/**
 * GlobeFM — main process.
 *
 * Owns the tray icon and the popover window. The popover is created once and
 * hidden rather than destroyed, so audio keeps playing while it's out of sight.
 */

const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, screen, shell, globalShortcut } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const catalog = require("./catalog");
const resolver = require("./resolver");
const weather = require("./weather");
const news = require("./news");
const failures = require("./failures");
const presence = require("./presence");

// height is the cap, not the size — the panel grows to fit its content. The cap
// is a share of the usable screen so it doesn't overflow a small display.
const POPOVER = { width: 392, height: 560, min: 200 };
const STORE = path.join(app.getPath("userData"), "state.json");

let tray = null;
let win = null;          // popover — also the one and only audio player
let explore = null;
let quitting = false;
let playerState = { channel: null, status: "", playing: false };

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

  explore = new BrowserWindow({
    width: 940, height: 640, minWidth: 760, minHeight: 460,
    title: "Explore",
    titleBarStyle: "hiddenInset",     // traffic lights over our own toolbar
    vibrancy: "sidebar",
    visualEffectState: "active",
    backgroundColor: "#00000000",
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
  app.dock?.show();
  explore.on("closed", () => {
    explore = null;
    app.dock?.hide();
  });

  explore.webContents.on("did-finish-load", () => {
    explore?.webContents.send("player:state", playerState);
  });
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
  tray.setToolTip("GlobeFM");
  tray.on("click", toggle);

  tray.on("right-click", () => {
    tray.popUpContextMenu(Menu.buildFromTemplate([
      { label: "GlobeFM", enabled: false },
      { type: "separator" },
      {
        label: "Open at Login",
        type: "checkbox",
        checked: app.getLoginItemSettings().openAtLogin,
        click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }),
      },
      { type: "separator" },
      { label: "Quit GlobeFM", accelerator: "Command+Q", click: () => { quitting = true; app.quit(); } },
    ]));
  });
}

// ── ipc ───────────────────────────────────────────────────────────────────────
ipcMain.handle("state:get", () => load());
ipcMain.handle("state:set", (_e, state) => { save(state); return true; });
ipcMain.handle("catalog:search", (_e, q, limit, filter) => {
  // Push known-bad streams down rather than hiding them — a station that failed
  // last night may be fine now, and silently vanishing would be worse.
  const hits = catalog.search(q, limit, filter);
  return hits.sort((a, b) => failures.penalty(a.id) - failures.penalty(b.id));
});
/**
 * Hardware media keys, held only while GlobeFM is actually playing.
 *
 * globalShortcut is exclusive: whoever registers a key owns it system-wide. So
 * holding these permanently would steal F7/F8/F9 from Music and Spotify even
 * when GlobeFM is silent. Registering on play and releasing on stop keeps the
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
ipcMain.on("player:failed", (_e, id) => failures.markFailed(id));
ipcMain.on("player:ok", (_e, id) => failures.markPlayed(id));
ipcMain.handle("player:next", (_e, ch, tried) =>
  catalog.nextInPlace(ch, [...(tried || []), ...failures.recentlyFailed()]));
ipcMain.handle("catalog:stats", () => catalog.stats());
ipcMain.handle("stream:resolve", (_e, ch) => resolver.resolve(ch));
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
ipcMain.handle("catalog:placeChannels", (_e, i, filter) => catalog.placeChannels(i, filter));
ipcMain.handle("catalog:placeFacets", (_e, i) => ({ tags: catalog.placeTags(i), bands: catalog.placeBands(i) }));
ipcMain.handle("catalog:globePoints", () => catalog.globePoints());
ipcMain.handle("weather:get", (_e, i, lat, lon) => weather.get(i, lat, lon));
ipcMain.handle("news:get", (_e, country) => news.get(country));
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
  // Station name next to the menu bar icon. Truncated so it can't eat the bar.
  const t = state.playing && state.channel?.title ? state.channel.title : "";
  tray?.setTitle(t ? ` ${t.slice(0, 22)}` : "");
  if (explore && !explore.isDestroyed()) explore.webContents.send("player:state", state);
});

// ── deep links ────────────────────────────────────────────────────────────────
/**
 * globefm://play?station=KEXP        play the best match for a station name
 * globefm://play?place=New%20Orleans play the top station in a place
 * globefm://pause  ·  globefm://stop  ·  globefm://next  ·  globefm://open
 *
 * This is what makes GlobeFM callable from Shortcuts and therefore from Siri —
 * the thing Apple's own radio support used to do. A Shortcut just opens a URL.
 */
async function handleDeepLink(raw) {
  let u;
  try { u = new URL(raw); } catch { return; }
  if (u.protocol !== "globefm:") return;

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

app.setAsDefaultProtocolClient("globefm");
app.on("open-url", (e, url) => { e.preventDefault(); handleDeepLink(url); });

// ── lifecycle ─────────────────────────────────────────────────────────────────
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", (_e, argv) => {
    const link = argv.find((a) => a.startsWith("globefm://"));
    if (link) handleDeepLink(link); else show();
  });

  app.whenReady().then(() => {
    // Menu bar app: no Dock icon, no app switcher entry.
    app.dock?.hide();
    catalog.load();
    resolver.init(app.getPath("userData"));
    failures.init(app.getPath("userData"));
    presence.onCountChange((n) => win?.webContents.send("player:listeners", n));
    if (presence.enabled()) console.log("presence: enabled");
    createWindow();
    createTray();
  });

  app.on("window-all-closed", () => { /* stay alive in the tray */ });
  app.on("before-quit", () => { quitting = true; globalShortcut.unregisterAll(); });
}
