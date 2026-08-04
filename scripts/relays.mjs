#!/usr/bin/env node
/**
 * Build the relay directory.
 *
 *   npm run relays
 *
 * Presence and chat talked to three hardcoded relays. That is why the geohash
 * channels looked quieter than they are: a message posted in Rio reaches the
 * relays *near Rio*, and three servers picked once, months ago, are not those.
 * bitchat ships a directory and selects from it by distance, which is most of
 * why their rooms have people in them and ours looked empty.
 *
 * Source is permissionlesstech/georelays — 411 Nostr relays with estimated
 * coordinates, MIT licensed, from the same people who wrote bitchat. MIT is
 * worth saying out loud after Meshtastic, WSJT-X, Element, Cinny and Nheko all
 * turned out to be GPL or AGPL walls: this one we can simply use.
 *
 * Committed rather than fetched at runtime, like every other dataset here.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "data", "relays.json");
const SRC = "https://raw.githubusercontent.com/permissionlesstech/georelays/main/nostr_relays.csv";
const UA = "AuralFM/0.1 (+https://github.com/meltonbell/globefm; meltonbell@icloud.com)";

const res = await fetch(SRC, { headers: { "user-agent": UA } });
if (!res.ok) throw new Error(`georelays: HTTP ${res.status}`);
const csv = await res.text();

const rows = [];
const seen = new Set();
for (const line of csv.split(/\r?\n/).slice(1)) {
  const [host, lat, lon] = line.split(",");
  if (!host) continue;
  const la = parseFloat(lat), lo = parseFloat(lon);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) continue;

  // The CSV carries bare hosts; we need a URL. Anything already carrying a
  // scheme keeps it, and a port implies plain ws rather than wss.
  // :443 is the default for wss, so `host` and `host:443` are the same server.
  // Left in, they cost two sockets and two copies of every event.
  const bare = host.trim().replace(/^wss?:\/\//, "").replace(/\/+$/, "").replace(/:443$/, "");
  if (!bare || bare.includes(" ")) continue;
  // Skip anything that is not a plausible hostname — a few rows are junk.
  if (!/^[a-z0-9.-]+(:\d+)?$/i.test(bare)) continue;
  if (seen.has(bare)) continue;
  seen.add(bare);

  rows.push([`wss://${bare}`, +la.toFixed(3), +lo.toFixed(3)]);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({
  built: new Date().toISOString().slice(0, 10),
  source: "permissionlesstech/georelays (MIT)",
  relays: rows,
}));
console.log(`relays: ${rows.length} with coordinates -> data/relays.json ` +
            `(${(fs.statSync(OUT).size / 1024).toFixed(0)} kB)`);
