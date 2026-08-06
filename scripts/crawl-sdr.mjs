#!/usr/bin/env node
/**
 * Build the shortwave receiver bundle.
 *
 *   node scripts/crawl-sdr.mjs
 *
 * Source is rx.linkfanel.net's machine-readable mirror of rx.kiwisdr.com, which
 * is regenerated hourly for exactly this purpose. One request to one aggregator,
 * never to the 849 receivers themselves — those are private machines on private
 * bandwidth and nothing in AuralFM may enumerate them.
 *
 * The result ships with the app so the receivers are on the globe with the
 * network unplugged, same as the stations. It goes stale in the same way and for
 * the same reason, and `src/sdr.js` refreshes it at most twice a day at runtime.
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "data", "sdr.min.json");
const SRC = "http://rx.linkfanel.net/kiwisdr_com.js";
const { UA } = require("../src/useragent.js");

/**
 * The file is a JS assignment, not JSON, and it carries a trailing comma the
 * spec does not allow. Slicing to the array and dropping trailing commas is
 * enough — pulling in a JS parser to read a list of receivers would be silly.
 */
export function parse(text) {
  const body = text.slice(text.indexOf("[")).trim().replace(/;$/, "");
  return JSON.parse(body.replace(/,(\s*[\]}])/g, "$1"));
}

const num = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : 0; };

/** "(-34.273700, 138.771000)" -> [lat, lng], or null if the operator left it unset. */
function gps(s) {
  const m = /^\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)$/.exec(s || "");
  if (!m) return null;
  const lat = +m[1], lng = +m[2];
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  // A surprising number of receivers report exactly (0,0) rather than nothing.
  if (lat === 0 && lng === 0) return null;
  return [lat, lng];
}

// Shared with the runtime so the two can never disagree about which port a
// receiver is on — see src/sdr.js for why *.proxy.kiwisdr.com needs resolving.
const { hostFrom: host } = require("../src/sdr.js");

/**
 * Receivers whose operators have asked to be left out.
 *
 * These are volunteers. Somebody who does not want their radio in a piece of
 * software they did not choose should not have to argue about it, and should
 * not have to block us at the firewall to make it stop — that costs them work
 * and costs everyone else the receiver.
 *
 * So: one line in `data/sdr-exclude.json`, and they are gone from the next
 * build. No server, no request at runtime, no record in the app of who asked.
 * The exclusion happens here, at crawl time, so an excluded host never reaches
 * a shipped file.
 */
const EXCLUDE = new Set(
  (JSON.parse(fs.readFileSync(new URL("../data/sdr-exclude.json", import.meta.url), "utf8")).hosts || [])
    .map((h) => String(h).trim().toLowerCase())
    .filter(Boolean),
);

/**
 * Operators decorate names heavily — block characters, emoji, the hardware
 * string, the frequency range. Keep something a list can show.
 */
function clean(name) {
  return String(name || "")
    .replace(/[█▀▄░▒▓■□◆●★☆]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

export function build(recs) {
  const out = [];
  const seen = new Set();
  // Operators who have asked not to be listed. Checked here rather than in the
  // app, so an excluded receiver never reaches a build at all — there is no
  // shipped list of who opted out, and nothing to leak.
  let excluded = 0;
  for (const r of recs) {
    if (r.status !== "active" || r.offline === "yes") continue;
    const g = gps(r.gps);
    const h = host(r.url);
    if (h && EXCLUDE.has(h.toLowerCase())) { excluded++; continue; }
    if (!g || !h || seen.has(h)) continue;
    seen.add(h);
    out.push({
      h,
      n: clean(r.name),
      l: clean(r.loc),
      lat: +g[0].toFixed(4),
      lng: +g[1].toFixed(4),
      m: num(r.users_max) || 4,     // slots the operator publishes
      a: num(r.asl),                // metres above sea level
    });
  }
  // Say it out loud. An exclusion that happens silently is indistinguishable
  // from a receiver that vanished, and the difference matters.
  if (excluded) {
    console.log(`sdr: ${excluded} receiver(s) excluded at the operator's request` +
                ` — data/sdr-exclude.json`);
  }
  return out;
}

async function main() {
  console.log("sdr: fetching receiver list…");
  const res = await fetch(SRC, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(45000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();

  const recs = parse(text);
  const list = build(recs);
  if (!list.length) throw new Error("no usable receivers — refusing to write an empty bundle");

  const stamp = /data timestamp:\s*(.+)/.exec(text);
  const bundle = {
    g: new Date().toISOString(),
    src: stamp ? stamp[1].trim() : null,
    r: list.map((r) => [r.h, r.n, r.l, r.lat, r.lng, r.m, r.a]),
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(bundle));

  const south = list.filter((r) => r.lat < 0).length;
  console.log(
    `sdr: ${list.length} receivers of ${recs.length} listed · ${south} southern hemisphere\n` +
    `     ${path.relative(ROOT, OUT)}  ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => { console.error("sdr:", err.message); process.exit(1); });
}
