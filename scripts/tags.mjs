#!/usr/bin/env node
/**
 * Fold radio-browser genre tags into the GlobeFM catalog.
 *
 *   node scripts/tags.mjs            # download, match, rebuild bundle with tags
 *   node scripts/tags.mjs --offline  # reuse a previously downloaded dump
 *
 * radio.garden ships no genre metadata, so "jazz new orleans" can only ever find
 * stations with "jazz" in the name. radio-browser has ~11.7k tags but no useful
 * coordinates — so we crawl geography from one and genre from the other and join
 * them here.
 *
 * The join is the whole problem: two directories, no shared identifier. Matching
 * is tiered from most to least trustworthy, first hit wins, and every tier that
 * could produce a false positive is gated on corroborating evidence.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "data");
const F = {
  dump: path.join(DATA, "_radiobrowser.json"),
  full: path.join(DATA, "stations.json"),
  min:  path.join(DATA, "stations.min.json"),
};

const RB = "https://de1.api.radio-browser.info/json/stations?limit=100000&offset=0";
const offline = process.argv.includes("--offline");

// ── normalisation ────────────────────────────────────────────────────────────
const norm = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Drops the noise that differs between directories for the same station:
// "Radio X FM 90.7" vs "Radio X". Only used with corroborating evidence.
const loose = (s) => norm(s)
  .replace(/\b(fm|am|radio|the|hd\d?)\b/g, " ")
  .replace(/\b\d+([.,]\d+)?\b/g, " ")
  .replace(/\s+/g, " ").trim();

const domainOf = (u) => {
  if (!u) return null;
  try { return new URL(u.startsWith("http") ? u : "http://" + u).hostname.replace(/^www\./, "").toLowerCase(); }
  catch { return null; }
};

const cleanTags = (t) => [...new Set(
  (t || "").split(",").map((x) => x.trim().toLowerCase()).filter((x) => x && x.length < 32)
)];

// ── fetch ────────────────────────────────────────────────────────────────────
async function getDump() {
  if (offline || fs.existsSync(F.dump)) {
    if (fs.existsSync(F.dump)) {
      console.log("radio-browser: using cached dump");
      return JSON.parse(fs.readFileSync(F.dump, "utf8"));
    }
    throw new Error("--offline but no cached dump at data/_radiobrowser.json");
  }
  console.log("radio-browser: downloading full station list…");
  const res = await fetch(RB, { headers: { "User-Agent": "GlobeFM/0.1" } });
  if (!res.ok) throw new Error(`radio-browser HTTP ${res.status}`);
  const all = await res.json();
  // Keep only what we need — the raw dump is ~68 MB and we want none of it on disk.
  const slim = all
    .filter((s) => s.tags && s.tags.trim())
    .map((s) => ({ name: s.name.trim(), country: s.country || "", home: s.homepage || "", tags: s.tags }));
  fs.writeFileSync(F.dump, JSON.stringify(slim));
  console.log(`radio-browser: ${all.length} stations, ${slim.length} with tags`);
  return slim;
}

// ── match ────────────────────────────────────────────────────────────────────
function buildIndexes(rb) {
  const byName = new Map(), byLoose = new Map(), byDomain = new Map();
  const push = (m, k, v) => { if (!k) return; if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
  for (const s of rb) {
    push(byName, norm(s.name), s);
    const l = loose(s.name); if (l.length > 3) push(byLoose, l, s);
    push(byDomain, domainOf(s.home), s);
  }
  return { byName, byLoose, byDomain };
}

/** True when one loose name is a whole-token prefix of the other. */
function tokenPrefix(a, b) {
  if (!a || !b) return false;
  const x = a.split(" "), y = b.split(" ");
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  if (!short.length || short.join("").length < 3) return false;
  return short.every((t, i) => long[i] === t);
}

function match(ch, country, ix) {
  const sameCountry = (list) =>
    list.find((s) => s.country && country && s.country.toLowerCase() === country.toLowerCase());
  const one = (s, via) => ({ tags: cleanTags(s.tags), via });

  // 1. Exact name in the same country — the only tier that needs no corroboration.
  const exact = ix.byName.get(norm(ch.title));
  if (exact) {
    const s = sameCountry(exact);
    if (s) return one(s, "name+country");
  }

  const dom = ix.byDomain.get(domainOf(ch.website));
  if (dom) {
    // 2. Domain owned by exactly one tagged station — unambiguous.
    if (dom.length === 1) return one(dom[0], "domain(unique)");

    const l = loose(ch.title);
    // 3. Shared domain, exact loose-name agreement.
    const byName = dom.find((s) => loose(s.name) === l);
    if (byName) return one(byName, "domain+name");

    // 3b. Shared domain where every candidate carries the same tags — that's
    //     radio-browser holding duplicates of one station (different bitrates or
    //     spellings), not a broadcaster with distinct genres.
    const sets = new Set(dom.map((s) => cleanTags(s.tags).sort().join("|")));
    if (sets.size === 1) return one(dom[0], "domain(agreed)");

    // 3c. Shared domain where the names overlap as a token prefix. This is the
    //     WWOZ case: radio.garden says "WWOZ FM 90.7", radio-browser has
    //     "WWOZ - New Orleans Public Radio" and "WWOZ 90.7 New Orleans, LA".
    //     Same domain plus a name prefix is strong enough; union the tags,
    //     since each entry describes the same station from a different angle.
    const overlap = dom.filter((s) => tokenPrefix(l, loose(s.name)));
    if (overlap.length) {
      const tags = [...new Set(overlap.flatMap((s) => cleanTags(s.tags)))];
      if (tags.length) return { tags, via: "domain+prefix" };
    }
  }

  // 4. Globally unique exact name, country unknown or mismatched.
  if (exact && exact.length === 1) return one(exact[0], "name(unique)");

  // 5. Loosened name, but only within the same country.
  const lo = ix.byLoose.get(loose(ch.title));
  if (lo) {
    const s = sameCountry(lo);
    if (s) return one(s, "loose+country");
  }
  return null;
}

// ── main ─────────────────────────────────────────────────────────────────────
const rb = await getDump();
const full = JSON.parse(fs.readFileSync(F.full, "utf8"));
const ix = buildIndexes(rb);

const stats = {};
let tagged = 0;
for (const ch of full.channels) {
  const country = full.places[ch.p]?.country;
  const m = match(ch, country, ix);
  if (!m || !m.tags.length) continue;
  ch.tags = m.tags;
  tagged++;
  stats[m.via] = (stats[m.via] || 0) + 1;
}

const pct = (n) => `${((100 * n) / full.channels.length).toFixed(1)}%`;
console.log(`\nmatched ${tagged} / ${full.channels.length} channels (${pct(tagged)})`);
for (const [via, n] of Object.entries(stats).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${via.padEnd(16)} ${String(n).padStart(6)}  ${pct(n)}`);
}

// Rewrite both bundles with tags folded in.
fs.writeFileSync(F.full, JSON.stringify(full));
const min = {
  g: full.generated,
  p: full.places.map((p) => [p.title, p.country, p.geo[0], p.geo[1]]),
  c: full.channels.map((c) => {
    const row = [c.id, c.title, c.p, c.secure ? 1 : 0];
    if (c.tags?.length) row.push(c.tags.join(","));   // 5th slot, only when present
    return row;
  }),
};
fs.writeFileSync(F.min, JSON.stringify(min));

const mb = (f) => (fs.statSync(f).size / 1e6).toFixed(1);
console.log(`\nstations.json      ${mb(F.full)} MB`);
console.log(`stations.min.json  ${mb(F.min)} MB`);

const top = {};
for (const c of full.channels) for (const t of c.tags || []) top[t] = (top[t] || 0) + 1;
console.log("\ntop tags: " + Object.entries(top).sort((a, b) => b[1] - a[1])
  .slice(0, 12).map(([t, n]) => `${t}(${n})`).join(" · "));
