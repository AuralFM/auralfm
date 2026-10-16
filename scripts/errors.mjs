#!/usr/bin/env node
/**
 * What the web version's error reports say, grouped.
 *
 *   node scripts/errors.mjs            group the reports: how often, which build, which devices, last seen
 *   node scripts/errors.mjs --days 7   only the last week
 *   node scripts/errors.mjs --show N   also print the stack of the N most frequent
 *   node scripts/errors.mjs --clear    delete every report read (after they have been dealt with)
 *
 * Reports are sent only by listeners who turned "Send error reports" on
 * (web/bridge.js, sendReport) and land in the `errors` Site Data collection of
 * the web player's site, readable with the owner key in ~/.herenow/credentials.
 * They carry no address, no key and nothing about the listener; see
 * docs/PRIVACY.md.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SITE = "gleaming-ravine-79cz";
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const days = +arg("--days") || 0, show = +arg("--show") || 0, clear = process.argv.includes("--clear");
const key = (() => { try { return fs.readFileSync(path.join(os.homedir(), ".herenow/credentials"), "utf8").trim(); } catch { return ""; } })();
if (!key) { console.error("errors: no here.now key in ~/.herenow/credentials"); process.exit(1); }
const H = { Authorization: `Bearer ${key}`, "X-HereNow-Client": "claude-code/errors" };
const API = `https://here.now/api/v1/publishes/${SITE}/data/errors`;

const rows = [], seen = new Set();
let cursor = null;
do {
  const res = await fetch(cursor ? `${API}?cursor=${encodeURIComponent(cursor)}` : API, { headers: H, signal: AbortSignal.timeout(20000) });
  if (!res.ok) { console.error(`errors: here.now answered ${res.status}`); process.exit(1); }
  const b = await res.json();
  rows.push(...(b.records || []));
  seen.add(cursor);
  cursor = b.nextCursor || null;
  if (cursor && seen.has(cursor)) { console.error("errors: the same page came back twice"); process.exit(1); }
} while (cursor);

const since = days ? Date.now() - days * 86400000 : 0;
const get = (r) => ({ id: r.id, at: Date.parse(r.created_at || r.createdAt || 0) || 0, ...(r.data || r) });
const all = rows.map(get).filter((r) => r.at >= since);
if (!all.length) { console.log(`errors: no reports${days ? ` in the last ${days} days` : ""}`); process.exit(0); }

const groups = new Map();
for (const r of all) {
  const k = `${r.where} · ${r.message}`;
  const g = groups.get(k) || { n: 0, last: 0, builds: new Set(), platforms: {}, stack: r.stack };
  g.n += r.repeat || 1; g.last = Math.max(g.last, r.at); g.builds.add(r.build || "?");
  const p = `${r.platform || "?"}${r.standalone ? " (home screen)" : ""}`;
  g.platforms[p] = (g.platforms[p] || 0) + 1;
  groups.set(k, g);
}
const sorted = [...groups].sort((a, b) => b[1].n - a[1].n);
console.log(`errors: ${all.length} reports, ${sorted.length} distinct${days ? `, last ${days} days` : ""}\n`);
sorted.forEach(([k, g], i) => {
  console.log(`${String(g.n).padStart(5)}  ${k.slice(0, 140)}`);
  console.log(`       last ${new Date(g.last).toISOString().slice(0, 16).replace("T", " ")} · build ${[...g.builds].join(", ")} · ${Object.entries(g.platforms).map(([p, n]) => `${p} ${n}`).join(", ")}`);
  if (i < show && g.stack) console.log(g.stack.split("\n").map((l) => `         ${l}`).join("\n"));
});

if (clear) {
  let gone = 0;
  for (const r of all) {
    const res = await fetch(`${API}/${encodeURIComponent(r.id)}`, { method: "DELETE", headers: H, signal: AbortSignal.timeout(20000) });
    if (res.ok) gone++;
  }
  console.log(`\nerrors: ${gone} of ${all.length} reports deleted`);
}
