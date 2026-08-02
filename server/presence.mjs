#!/usr/bin/env node
/**
 * GlobeFM presence — the cheapest credible version.
 *
 *   node server/presence.mjs          # listens on :8787
 *   PORT=9000 node server/presence.mjs
 *
 * Answers one question: how many people are listening to this station right now.
 *
 * Deliberately holds no database, no accounts, and no message content — there is
 * nothing here to moderate, which is the entire reason this exists instead of
 * chat (see issue #11). Counts live in memory and evaporate on restart; that is
 * a feature, not a limitation.
 *
 * Privacy: clients send a random id they generate themselves and a station id.
 * No IP is stored, nothing is written to disk, and a listener disappears ~90s
 * after they stop checking in.
 */

import http from "node:http";

const PORT = Number(process.env.PORT || 8787);
const TTL_MS = 90_000;          // a client heartbeats every ~30s; miss 3 and you're gone
const MIN_REPORTED = 3;         // below this, report 0 — one listener is identifiable

/** stationId -> Map(clientId -> lastSeen) */
const rooms = new Map();

function heartbeat(stationId, clientId) {
  if (!stationId || !clientId) return;
  if (!rooms.has(stationId)) rooms.set(stationId, new Map());
  rooms.get(stationId).set(clientId, Date.now());
}

function leave(stationId, clientId) {
  rooms.get(stationId)?.delete(clientId);
}

function sweep() {
  const cutoff = Date.now() - TTL_MS;
  for (const [station, members] of rooms) {
    for (const [id, seen] of members) if (seen < cutoff) members.delete(id);
    if (!members.size) rooms.delete(station);
  }
}
setInterval(sweep, 30_000).unref();

const countFor = (stationId) => {
  const n = rooms.get(stationId)?.size ?? 0;
  return n >= MIN_REPORTED ? n : 0;
};

const send = (res, code, body) => {
  const json = JSON.stringify(body);
  res.writeHead(code, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "cache-control": "no-store",
  });
  res.end(json);
};

http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");

  if (url.pathname === "/health") return send(res, 200, { ok: true, rooms: rooms.size });

  // GET /presence?station=<id>&client=<id>  -> heartbeat + current count
  if (url.pathname === "/presence") {
    const station = url.searchParams.get("station");
    const client = url.searchParams.get("client");
    if (url.searchParams.get("leave") === "1") leave(station, client);
    else heartbeat(station, client);
    return send(res, 200, { station, listeners: countFor(station) });
  }

  send(res, 404, { error: "not found" });
}).listen(PORT, () => {
  console.log(`presence listening on :${PORT}  (ttl ${TTL_MS / 1000}s, min reported ${MIN_REPORTED})`);
});
