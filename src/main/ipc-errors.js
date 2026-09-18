/**
 * IPC: Errors from every process, written to one log: renderer reports, main's own uncaught exceptions, and the log's path and contents for the Settings window.
 *
 * Registered once, from main.js, which passes `ctx`: the helpers these
 * handlers share with the rest of the main process, and getters for the windows
 * — getters, because the windows are created and destroyed after registration.
 */

const { app, ipcMain } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

module.exports = function register(ctx) {
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
};
