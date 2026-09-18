/**
 * The state file: favourites, volume, the last station, layers and preferences.
 *
 * Required from main.js after `app.setName`, because Electron derives the
 * userData path from the app name and STORE is resolved on require.
 */

const { app } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const STORE = path.join(app.getPath("userData"), "state.json");

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

module.exports = { load, save };
