/**
 * Presence client — disabled unless a server is configured.
 *
 * GlobeFM ships with no presence endpoint set, so out of the box it contacts
 * nothing and behaves exactly as before. Point GLOBEFM_PRESENCE_URL at a
 * deployment of server/presence.mjs to switch it on.
 *
 * Opt-in by construction: an app that quietly starts reporting what you listen
 * to would be a different app than the one people installed.
 */

const crypto = require("node:crypto");

const BASE = process.env.GLOBEFM_PRESENCE_URL || null;
const BEAT_MS = 30_000;

// Random per-process id. Not tied to the machine or the user, and it changes
// every launch — enough to count sessions, useless for identifying anyone.
const clientId = crypto.randomUUID();

let timer = null;
let station = null;
let onCount = () => {};

const enabled = () => !!BASE;

async function ping(leave = false) {
  if (!BASE || !station) return;
  const u = new URL("/presence", BASE);
  u.searchParams.set("station", station);
  u.searchParams.set("client", clientId);
  if (leave) u.searchParams.set("leave", "1");
  try {
    const res = await fetch(u, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return;
    const { listeners } = await res.json();
    if (!leave) onCount(listeners ?? 0);
  } catch { /* presence is decorative; never surface a failure */ }
}

function join(stationId) {
  if (!BASE) return;
  if (station && station !== stationId) ping(true);
  station = stationId;
  clearInterval(timer);
  ping();
  timer = setInterval(ping, BEAT_MS);
  timer.unref?.();
}

function leave() {
  if (!BASE) return;
  ping(true);
  clearInterval(timer);
  timer = null;
  station = null;
  onCount(0);
}

module.exports = { enabled, join, leave, onCountChange: (fn) => { onCount = fn; } };
