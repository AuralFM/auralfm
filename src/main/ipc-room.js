/**
 * IPC: The listening room — the map on a ceiling, for a room full of people.
 *
 * A full-screen window of its own (renderer/room.html) that shows the Earth at
 * night with every town that broadcasts, rings the town that is playing, and
 * keeps the route lit. It plays nothing itself: like Explore it asks main, main
 * forwards to the popover, and the popover's one <audio> element is the room's
 * sound. So the room is only ever showing what the app is actually playing.
 *
 * It opens on a second display when there is one — the projector or the LED
 * processor — and full screen, so the laptop stays free for whoever is hosting.
 * Plan and reasons: the vault's LISTENING-ROOM-2026-11.
 *
 * Registered once, from main.js, which passes `ctx`. It adds `openRoom` and a
 * `roomWin` getter to ctx so the menus and the player-state relay can reach it.
 */

const { BrowserWindow, ipcMain, screen } = require("electron");
const path = require("node:path");

module.exports = function register(ctx) {
  let room = null, external = false;

  /** The display to fill: the first one that is not the laptop's own, else the laptop's. */
  function targetDisplay() {
    const primary = screen.getPrimaryDisplay();
    return screen.getAllDisplays().find((d) => d.id !== primary.id) || primary;
  }

  function openRoom() {
    if (room && !room.isDestroyed()) { room.show(); room.focus(); return room; }
    const shown = targetDisplay();
    const { bounds } = shown;
    external = shown.id !== screen.getPrimaryDisplay().id;
    room = new BrowserWindow({
      x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height,
      title: "AuralFM · Listening room",
      show: false,
      fullscreen: true,
      // Onyx, so the moment before the first frame is the room's own dark.
      backgroundColor: "#0C0B0B",
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, "..", "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        // The room is often on a projector while the host works on the laptop:
        // a throttled hidden-window timer would stall the drift and the map.
        backgroundThrottling: false,
      },
    });
    // Like every other window: nothing opens inside the app, and a link leaves it.
    ctx.lockDown(room);
    room.loadFile(path.join(__dirname, "..", "renderer", "room.html"));
    room.once("ready-to-show", () => { room?.show(); room?.focus(); });
    room.on("closed", () => { room = null; ctx.explore?.webContents.send("room:status", { open: false }); });
    ctx.explore?.webContents.send("room:status", { open: true, external });
    return room;
  }

  ctx.openRoom = openRoom;
  Object.defineProperty(ctx, "roomWin", { get: () => (room && !room.isDestroyed() ? room : null) });

  ipcMain.on("room:open", () => openRoom());
  // Explore's room panel steers; the room reports its mode back to it.
  ipcMain.on("room:command", (_e, cmd, arg) => room?.webContents.send("room:command", { cmd: String(cmd || ""), arg }));
  ipcMain.on("room:status", (_e, s) => ctx.explore?.webContents.send("room:status", { ...(s || {}), open: !!room, external }));
  ipcMain.handle("room:isOpen", () => !!(room && !room.isDestroyed()));
  ipcMain.on("room:close", () => { if (room && !room.isDestroyed()) room.close(); });
  // The room's space bar: the same play/pause the media keys use.
  ipcMain.on("room:playpause", () => ctx.win?.webContents.send("player:mediakey", "playpause"));
};
