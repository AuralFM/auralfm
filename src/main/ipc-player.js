/**
 * IPC: Handlers that drive the player, which lives in the popover: media keys, transport, tuning, and sizing the popover.
 *
 * Registered once, from main.js, which passes `ctx`: the helpers these
 * handlers share with the rest of the main process, and getters for the windows
 * — getters, because the windows are created and destroyed after registration.
 */

const { globalShortcut, ipcMain } = require("electron");

module.exports = function register(ctx) {
  const { POPOVER, hide, maxPopoverHeight } = ctx;

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
    const send = (action) => ctx.win?.webContents.send("player:mediakey", action);
    const ok = globalShortcut.register("MediaPlayPause", () => send("playpause"))
            && globalShortcut.register("MediaNextTrack", () => send("next"))
            && globalShortcut.register("MediaPreviousTrack", () => send("prev"));
    mediaKeysHeld = ok;
    if (!ok) globalShortcut.unregisterAll();   // all or nothing; half is confusing
    console.log(`media keys: ${ok ? "held" : "NOT registered"}`
      + ` (playpause=${globalShortcut.isRegistered("MediaPlayPause")})`);
  }
  ipcMain.on("player:mediakeys", (_e, on) => setMediaKeys(!!on));
  ipcMain.on("player:transport", (_e, msg) => ctx.win?.webContents.send("player:transport", msg));
  ipcMain.on("popover:hide", hide);
  ipcMain.on("popover:height", (_e, h) => {
    // AppKit popovers size to their content; a fixed-height panel with a pool of
    // dead space under a short list is the giveaway that this isn't native.
    if (!ctx.win || ctx.win.isDestroyed()) return;
    const height = Math.round(Math.max(POPOVER.min, Math.min(maxPopoverHeight(), h)));
    const b = ctx.win.getBounds();
    if (Math.abs(b.height - height) < 2) return;
    ctx.win.setBounds({ ...b, height }, false);
  });
  /**
   * Explore asks, the popover plays — same rule as stations, so there is still
   * exactly one thing in this app that makes sound.
   */
  ipcMain.on("sdr:tune", (_e, rx) => {
    ctx.win?.webContents.send("sdr:tune", rx);
    // Deliberately does not show the popover. It used to, and that made the menu
    // bar panel appear over whatever you were doing every single time you clicked
    // a receiver -- which is not what a menu bar panel is for, and is not what
    // tuning a station does. The popover needs to be alive to hold the audio, not
    // visible; it is created hidden at launch and stays that way until somebody
    // clicks the tray icon.
  });

  /**
   * There is exactly one <audio> element in this app and it lives in the popover.
   * Explore never plays anything itself — it asks, main forwards, the popover
   * plays. Two windows with their own audio elements would mean two overlapping
   * streams the moment you clicked a station in each.
   */
  ipcMain.on("player:tune", (_e, channel) => {
    ctx.win?.webContents.send("player:tune", channel);
  });
};
