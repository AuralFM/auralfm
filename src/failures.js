/**
 * Remembers which streams failed, so a station that is reliably dead stops
 * getting offered first.
 *
 * Deliberately forgiving: a failure decays after a day, because streams go down
 * for maintenance and come back, and permanently burying a good station over one
 * bad night would be worse than the problem it solves.
 */

const fs = require("node:fs");
const path = require("node:path");

const DECAY_MS = 24 * 60 * 60 * 1000;
let file = null;
let store = {};                 // id -> { n, at }

function init(userDataPath) {
  file = path.join(userDataPath, "failures.json");
  try { store = JSON.parse(fs.readFileSync(file, "utf8")); } catch { store = {}; }
}

const flush = () => { try { fs.writeFileSync(file, JSON.stringify(store)); } catch {} };

function markFailed(id) {
  if (!id) return;
  const rec = store[id];
  const fresh = !rec || Date.now() - rec.at > DECAY_MS;
  store[id] = { n: fresh ? 1 : rec.n + 1, at: Date.now() };
  flush();
}

function markPlayed(id) {
  if (id && store[id]) { delete store[id]; flush(); }   // it works — forget the grudge
}

/** How suspect is this station right now? 0 = fine. */
function penalty(id) {
  const rec = store[id];
  if (!rec) return 0;
  if (Date.now() - rec.at > DECAY_MS) return 0;
  return Math.min(rec.n, 3);
}

const recentlyFailed = () =>
  Object.keys(store).filter((id) => penalty(id) > 0);

module.exports = { init, markFailed, markPlayed, penalty, recentlyFailed };
