/**
 * GlobeFM — main process.
 *
 * Owns the tray icon and the popover window. The popover is created once and
 * hidden rather than destroyed, so audio keeps playing while it's out of sight.
 */

const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, screen, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

const POPOVER = { width: 380, height: 560 };
const STORE = path.join(app.getPath("userData"), "state.json");

let tray = null;
let win = null;
let quitting = false;

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
    vibrancy: "under-window",
    visualEffectState: "active",
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
}
function hide() { if (win?.isVisible()) win.hide(); }
function toggle() { win.isVisible() ? hide() : show(); }

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
ipcMain.on("popover:hide", hide);
ipcMain.on("tray:title", (_e, text) => {
  // Station name next to the menu bar icon while playing. Truncated so it can't
  // eat the whole menu bar.
  tray?.setTitle(text ? ` ${text.slice(0, 22)}` : "");
});

// ── lifecycle ─────────────────────────────────────────────────────────────────
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => show());

  app.whenReady().then(() => {
    // Menu bar app: no Dock icon, no app switcher entry.
    app.dock?.hide();
    createWindow();
    createTray();
  });

  app.on("window-all-closed", () => { /* stay alive in the tray */ });
  app.on("before-quit", () => { quitting = true; });
}
