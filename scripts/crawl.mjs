#!/usr/bin/env node
/**
 * GlobeFM station crawler.
 *
 * Builds the static station bundle the app ships with, so that at runtime we
 * never depend on radio.garden being reachable or unblocked.
 *
 *   node scripts/crawl.mjs              # resume (or start) a full crawl, then build
 *   node scripts/crawl.mjs --limit 25   # smoke test against 25 places
 *   node scripts/crawl.mjs --build      # rebuild bundles from existing progress, no network
 *   node scripts/crawl.mjs --fresh      # discard progress and start over
 *
 * Safe to Ctrl-C at any point. Progress is appended to data/_channels.jsonl and
 * the next run picks up exactly where it stopped.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "data");

const F = {
  places:   path.join(DATA, "places.json"),
  progress: path.join(DATA, "_channels.jsonl"),
  full:     path.join(DATA, "stations.json"),
  min:      path.join(DATA, "stations.min.json"),
};

const API = "https://radio.garden/api/ara/content";
// radio.garden sits behind Cloudflare and 403s anything that doesn't look like a
// browser. This is the minimum set of headers that gets a 200.
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
                "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": "https://radio.garden/",
};

// ── args ──────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt  = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : d;
};

const CFG = {
  limit:       opt("limit", Infinity),
  concurrency: opt("concurrency", 4),
  rate:        opt("rate", 4),       // requests per second, ceiling
  retries:     opt("retries", 4),
  buildOnly:   flag("build"),
  fresh:       flag("fresh"),
  check:       flag("check"),
};

/**
 * Is the shipped bundle stale? Stations come and go, so the catalog is a
 * snapshot with a shelf life. This just reports — it never re-crawls on its own,
 * because a surprise 50-minute crawl is a worse outcome than stale data.
 */
function checkAge() {
  const f = path.join(DATA, "stations.min.json");
  if (!fs.existsSync(f)) {
    console.log("catalog: missing — run `npm run crawl`");
    return process.exit(1);
  }
  const bundle = JSON.parse(fs.readFileSync(f, "utf8"));
  const days = Math.floor((Date.now() - new Date(bundle.g)) / 86400000);
  console.log(`catalog: ${bundle.c.length.toLocaleString()} channels · ${bundle.p.length.toLocaleString()} places`);
  console.log(`built:   ${new Date(bundle.g).toISOString().slice(0, 10)} (${days} day${days === 1 ? "" : "s"} ago)`);
  if (days >= 120) console.log("verdict: stale — worth re-running `npm run crawl && npm run tags`");
  else if (days >= 60) console.log("verdict: ageing — fine, but plan a refresh");
  else console.log("verdict: fresh");
  process.exit(0);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── polite rate limiter ───────────────────────────────────────────────────────
// Global across all workers: hands out request slots no faster than CFG.rate/sec.
let nextSlot = 0;
async function takeSlot() {
  const gap = 1000 / CFG.rate;
  const now = Date.now();
  const at = Math.max(now, nextSlot);
  nextSlot = at + gap;
  if (at > now) await sleep(at - now);
}

let blocked = 0;   // consecutive 403s — a spike means Cloudflare cut us off

async function getJSON(url) {
  let wait = 1000;
  for (let attempt = 0; attempt <= CFG.retries; attempt++) {
    await takeSlot();
    try {
      const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(20000) });

      if (res.ok) { blocked = 0; return await res.json(); }

      if (res.status === 404) return null;            // place has no channel page

      if (res.status === 403) {
        blocked++;
        if (blocked >= 8) {
          throw new Error(
            "BLOCKED: 8 consecutive 403s from Cloudflare. Stopping so we don't make it worse.\n" +
            "  Progress is saved — wait an hour and re-run to resume, or lower --rate."
          );
        }
      }
      if (res.status !== 429 && res.status < 500 && res.status !== 403) {
        throw new Error(`HTTP ${res.status}`);        // genuine client error, don't retry
      }
    } catch (err) {
      if (String(err.message).startsWith("BLOCKED")) throw err;
      if (attempt === CFG.retries) throw err;
    }
    await sleep(wait + Math.random() * 500);          // jitter so retries don't sync up
    wait = Math.min(wait * 2, 30000);
  }
  throw new Error("unreachable");
}

// ── step 1: places ────────────────────────────────────────────────────────────
async function getPlaces() {
  if (fs.existsSync(F.places) && !CFG.fresh) {
    const cached = JSON.parse(fs.readFileSync(F.places, "utf8"));
    console.log(`places: ${cached.length} (cached)`);
    return cached;
  }
  console.log("places: fetching…");
  const body = await getJSON(`${API}/places`);
  const places = body.data.list.map((p) => ({
    id: p.id,
    title: p.title,
    country: p.country,
    geo: p.geo,           // [lon, lat]
    size: p.size,         // channel count per radio.garden
  }));
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(F.places, JSON.stringify(places));
  console.log(`places: ${places.length} fetched`);
  return places;
}

// ── step 2: channels per place ────────────────────────────────────────────────
function readProgress() {
  const done = new Map();
  if (!fs.existsSync(F.progress)) return done;
  for (const line of fs.readFileSync(F.progress, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try { const r = JSON.parse(line); done.set(r.place, r); } catch { /* torn last line */ }
  }
  return done;
}

function parseChannels(body, place) {
  if (!body?.data?.content) return [];
  const out = [];
  for (const block of body.data.content) {
    for (const item of block.items ?? []) {
      const pg = item.page;
      if (!pg?.url) continue;
      const id = pg.url.split("/").pop();             // /listen/{slug}/{channelId}
      if (!id) continue;
      out.push({
        id,
        title: (pg.title ?? "").trim(),
        place: place.id,
        country: pg.country?.title ?? place.country,
        website: pg.website ?? "",
        secure: !!pg.secure,                          // station offers https
        stream: pg.stream ?? "",                      // provider, useful for debugging
      });
    }
  }
  return out;
}

async function crawl(places) {
  const done = readProgress();
  const todo = places.filter((p) => !done.has(p.id)).slice(0, CFG.limit);

  console.log(
    `channels: ${done.size} places already done, ${todo.length} to go ` +
    `(${CFG.concurrency} workers, ${CFG.rate}/s)`
  );
  if (!todo.length) return done;

  const out = fs.createWriteStream(F.progress, { flags: "a" });
  const started = Date.now();
  let n = 0, failed = 0, channels = 0, stop = false;

  const onSig = () => { stop = true; console.log("\ninterrupted — finishing in-flight requests…"); };
  process.on("SIGINT", onSig);

  let cursor = 0;
  async function worker() {
    while (!stop) {
      const i = cursor++;
      if (i >= todo.length) return;
      const place = todo[i];
      let rec;
      try {
        const body = await getJSON(`${API}/page/${place.id}/channels`);
        rec = { place: place.id, ch: parseChannels(body, place) };
        channels += rec.ch.length;
      } catch (err) {
        if (String(err.message).startsWith("BLOCKED")) { stop = true; throw err; }
        rec = { place: place.id, ch: [], err: String(err.message).slice(0, 80) };
        failed++;
      }
      out.write(JSON.stringify(rec) + "\n");
      done.set(place.id, rec);

      if (++n % 50 === 0 || n === todo.length) {
        const secs = (Date.now() - started) / 1000;
        const rate = n / secs;
        const eta = Math.round((todo.length - n) / rate);
        process.stdout.write(
          `\r  ${n}/${todo.length} places · ${channels} channels · ` +
          `${rate.toFixed(1)}/s · ${failed} failed · ETA ${fmt(eta)}   `
        );
      }
    }
  }

  try {
    await Promise.all(Array.from({ length: CFG.concurrency }, worker));
  } finally {
    process.off("SIGINT", onSig);
    await new Promise((r) => out.end(r));
    console.log();
  }
  if (failed) console.log(`  ${failed} places failed — re-run to retry just those`);
  return done;
}

const fmt = (s) =>
  s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}m` : `${(s / 3600).toFixed(1)}h`;

// ── step 3: build bundles ─────────────────────────────────────────────────────
function build(places) {
  const done = readProgress();
  if (!done.size) {
    console.log("build: no progress found — run the crawl first");
    return;
  }

  const kept = places.filter((p) => done.get(p.id)?.ch?.length);
  const full = { generated: new Date().toISOString(), places: [], channels: [] };

  kept.forEach((p, idx) => {
    full.places.push({ id: p.id, title: p.title, country: p.country, geo: p.geo });
    for (const c of done.get(p.id).ch) full.channels.push({ ...c, p: idx });
  });

  fs.writeFileSync(F.full, JSON.stringify(full));

  // Trimmed bundle: short keys, place referenced by index. This is what ships.
  const min = {
    g: full.generated,
    p: full.places.map((p) => [p.title, p.country, p.geo[0], p.geo[1]]),
    c: full.channels.map((c) => [c.id, c.title, c.p, c.secure ? 1 : 0]),
  };
  fs.writeFileSync(F.min, JSON.stringify(min));

  const mb = (f) => (fs.statSync(f).size / 1e6).toFixed(1) + " MB";
  console.log(
    `build: ${full.places.length} places · ${full.channels.length} channels\n` +
    `  ${path.relative(ROOT, F.full)}  ${mb(F.full)}\n` +
    `  ${path.relative(ROOT, F.min)}  ${mb(F.min)}`
  );

  const empty = places.length - kept.length;
  if (empty) console.log(`  (${empty} places had no channels and were dropped)`);
}

// ── main ──────────────────────────────────────────────────────────────────────
const t0 = Date.now();
if (CFG.check) checkAge();
try {
  if (CFG.fresh && fs.existsSync(F.progress)) {
    fs.unlinkSync(F.progress);
    console.log("fresh: cleared previous progress");
  }
  const places = await getPlaces();
  if (!CFG.buildOnly) await crawl(places);
  build(places);
  console.log(`done in ${fmt(Math.round((Date.now() - t0) / 1000))}`);
} catch (err) {
  console.error("\n" + err.message);
  process.exit(1);
}
