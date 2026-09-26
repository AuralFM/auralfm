#!/usr/bin/env node
/**
 * Where each station's audio actually comes from.
 *
 *   node scripts/streams.mjs              resume (or start): every channel without an answer yet
 *   node scripts/streams.mjs --limit 30   a sample, to see it work
 *   node scripts/streams.mjs --report     what is known so far, no network
 *
 * radio.garden's listen endpoint answers with a redirect to the station's own
 * stream; the app has followed it on every play. Asking once per station and
 * keeping the answer gives two things: the strongest key there is for matching
 * a station in radio-browser (the same stream is the same station, whatever
 * either directory calls it), and a catalogue that can play without
 * radio.garden in the middle.
 *
 * One request per station, never the audio (redirect: manual stops at the
 * Location header), at most `--rate` a second. Answers are appended to
 * data/_streams.jsonl as they come, so Ctrl-C loses nothing.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const F = { full: path.join(ROOT, "data/stations.json"), out: path.join(ROOT, "data/_streams.jsonl") };
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : d; };
const CFG = { limit: opt("limit", Infinity), rate: opt("rate", 4), concurrency: opt("concurrency", 4) };

const LISTEN = "https://radio.garden/api/ara/content/listen";
// The same headers the app sends (src/resolver.js): radio.garden 403s anything else.
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
                "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Accept": "*/*",
  "Referer": "https://radio.garden/",
};

const known = new Map();
if (fs.existsSync(F.out)) for (const line of fs.readFileSync(F.out, "utf8").split("\n")) {
  if (!line) continue;
  try { const r = JSON.parse(line); known.set(r.id, r); } catch { /* a half-written last line */ }
}

if (argv.includes("--report")) {
  const all = [...known.values()];
  const n = (f) => all.filter(f).length;
  console.log(`${all.length} channels asked: ${n((r) => r.url)} with a stream, ${n((r) => !r.url)} without ` +
    `(${Object.entries(all.filter((r) => !r.url).reduce((m, r) => (m[r.why] = (m[r.why] || 0) + 1, m), {}))
      .map(([k, v]) => `${k} ${v}`).join(", ")})`);
  process.exit(0);
}

const { channels } = JSON.parse(fs.readFileSync(F.full, "utf8"));
const todo = channels.filter((c) => !known.has(c.id)).slice(0, CFG.limit);
console.log(`streams: ${known.size} known, ${todo.length} to ask at ${CFG.rate}/s`);

async function ask(id, tries = 3) {
  for (let t = 1; t <= tries; t++) {
    try {
      const res = await fetch(`${LISTEN}/${id}/channel.mp3`, { headers: HEADERS, redirect: "manual",
        signal: AbortSignal.timeout(10000) });
      const loc = res.headers.get("location");
      res.body?.cancel();
      if (res.status >= 300 && res.status < 400 && loc) return { url: loc };
      if (res.status === 429 || res.status >= 500) { await new Promise((r) => setTimeout(r, 2000 * t)); continue; }
      return { url: "", why: `http ${res.status}` };
    } catch (err) {
      if (t === tries) return { url: "", why: err.name === "TimeoutError" ? "timeout" : "network" };
      await new Promise((r) => setTimeout(r, 1000 * t));
    }
  }
  return { url: "", why: "retries" };
}

const out = fs.createWriteStream(F.out, { flags: "a" });
let next = 0, done = 0, found = 0, lastStart = 0;
const started = Date.now();
async function worker() {
  while (next < todo.length) {
    const c = todo[next++];
    // Spread starts evenly: never more than CFG.rate a second, across all workers.
    const wait = lastStart + 1000 / CFG.rate - Date.now();
    lastStart = Math.max(Date.now(), lastStart + 1000 / CFG.rate);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    const r = await ask(c.id);
    out.write(JSON.stringify({ id: c.id, ...r, at: new Date().toISOString().slice(0, 10) }) + "\n");
    done++; if (r.url) found++;
    if (done % 500 === 0 || done === todo.length) {
      const rate = done / ((Date.now() - started) / 1000);
      console.log(`  ${done}/${todo.length} · ${found} streams · ${rate.toFixed(1)}/s · ` +
        `~${Math.round((todo.length - done) / rate / 60)} min left`);
    }
  }
}
await Promise.all(Array.from({ length: CFG.concurrency }, worker));
out.end();
console.log(`streams: asked ${done}, ${found} answered with a stream`);
