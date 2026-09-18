/**
 * IPC: The share card: the level meter it samples, and copying, saving and linking it.
 *
 * Registered once, from main.js, which passes `ctx`: the helpers these
 * handlers share with the rest of the main process, and getters for the windows
 * — getters, because the windows are created and destroyed after registration.
 */

const { clipboard, dialog, ipcMain, nativeImage } = require("electron");
const fs = require("node:fs");

module.exports = function register(ctx) {
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
    if (!ctx.win || ctx.win.isDestroyed()) return resolve(null);
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
    ctx.win.webContents.send("card:levelsWanted");
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
};
