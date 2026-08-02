#!/usr/bin/env node
/**
 * Fold radio-browser genre tags into the AuralFM catalog.
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

/**
 * The two directories name countries differently — radio.garden says "United
 * States", radio-browser says "The United States Of America". Comparing them
 * literally silently failed the country gate for the largest country in the
 * catalog, and for the UK, Netherlands, Russia and others: roughly 9,900
 * stations that could never pass tiers 1 or 5.
 *
 * Containment resolves 211 of 227: "united states of america" contains
 * "united states", "russian federation" starts with "russia".
 */
const countryKey = (c) => (c || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim().replace(/^the /, "");

function sameCountryName(a, b) {
  const x = countryKey(a), y = countryKey(b);
  if (!x || !y) return false;
  if (x === y) return true;
  return x.length >= 4 && y.length >= 4 && (x.includes(y) || y.includes(x));
}

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
  const res = await fetch(RB, { headers: { "User-Agent": "AuralFM/0.1" } });
  if (!res.ok) throw new Error(`radio-browser HTTP ${res.status}`);
  const all = await res.json();
  // Keep only what we need — the raw dump is ~68 MB and we want none of it on disk.
  // Keep untagged stations too now: they still carry a UUID (for click
  // reporting) and a daily check result (for dead-stream detection).
  const slim = all.map((s) => ({
    uuid: s.stationuuid,
    name: (s.name || "").trim(),
    country: s.country || "",
    home: s.homepage || "",
    tags: s.tags || "",
    ok: s.lastcheckok,            // radio-browser probes every station daily
  }));
  fs.writeFileSync(F.dump, JSON.stringify(slim));
  const tagged = slim.filter((s) => s.tags.trim()).length;
  const broken = slim.filter((s) => s.ok === 0).length;
  console.log(`radio-browser: ${all.length} stations · ${tagged} tagged · ${broken} failing their last check`);
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

/**
 * Ordered candidate sets, most trustworthy first. Returning a *list* per tier
 * rather than one station matters: a tier can match an entry that happens to
 * carry no tags, and short-circuiting there loses tags a later tier would have
 * found. Fixing the country gate exposed exactly that — matching improved while
 * tagging fell, because tier 1 started winning with untagged entries.
 */
function candidateTiers(ch, country, ix) {
  const tiers = [];
  const inCountry = (list) => list.filter((s) => sameCountryName(s.country, country));

  const exact = ix.byName.get(norm(ch.title)) || [];
  if (exact.length) tiers.push(["name+country", inCountry(exact)]);

  const dom = ix.byDomain.get(domainOf(ch.website)) || [];
  if (dom.length === 1) tiers.push(["domain(unique)", dom]);
  else if (dom.length > 1) {
    const l = loose(ch.title);
    tiers.push(["domain+name", dom.filter((s) => loose(s.name) === l)]);
    const sets = new Set(dom.map((s) => cleanTags(s.tags).sort().join("|")));
    if (sets.size === 1) tiers.push(["domain(agreed)", dom]);
    tiers.push(["domain+prefix", dom.filter((s) => tokenPrefix(l, loose(s.name)))]);
  }

  if (exact.length === 1) tiers.push(["name(unique)", exact]);

  const lo = ix.byLoose.get(loose(ch.title)) || [];
  if (lo.length) tiers.push(["loose+country", inCountry(lo)]);

  return tiers.filter(([, list]) => list.length);
}

function match(ch, country, ix) {
  const tiers = candidateTiers(ch, country, ix);
  if (!tiers.length) return null;

  // Identity (uuid + last check) comes from the most trustworthy match.
  const [via, first] = tiers[0];
  const idFrom = first.find((s) => s.ok === 1) || first[0];

  // Tags come from the most trustworthy tier that actually has any. Union within
  // the tier: two entries for one station often describe it from different
  // angles (the WWOZ case — "jazz" on one, "blues, jazz, new orleans" on the other).
  let tags = [], tagVia = via;
  for (const [tv, list] of tiers) {
    const union = [...new Set(list.flatMap((s) => cleanTags(s.tags)))];
    if (union.length) { tags = union; tagVia = tv; break; }
  }

  return { tags, uuid: idFrom.uuid, ok: idFrom.ok, via: tagVia };
}

// ── main ─────────────────────────────────────────────────────────────────────
const rb = await getDump();
const full = JSON.parse(fs.readFileSync(F.full, "utf8"));
const ix = buildIndexes(rb);

const stats = {};
let tagged = 0, matched = 0;
for (const ch of full.channels) {
  const country = full.places[ch.p]?.country;
  const m = match(ch, country, ix);
  if (!m) continue;
  if (m.tags.length) { ch.tags = m.tags; tagged++; }
  if (m.uuid) ch.rbuuid = m.uuid;          // for click reporting
  if (m.ok === 0 || m.ok === 1) ch.ok = m.ok;
  matched++;
  stats[m.via] = (stats[m.via] || 0) + 1;
}

const pct = (n) => `${((100 * n) / full.channels.length).toFixed(1)}%`;
const broken = full.channels.filter((c) => c.ok === 0).length;
console.log(`\nmatched ${matched} / ${full.channels.length} channels (${pct(matched)})`);
console.log(`  with genre tags   ${String(tagged).padStart(6)}  ${pct(tagged)}`);
console.log(`  with radio-browser id ${String(full.channels.filter((c) => c.rbuuid).length).padStart(2)}`);
console.log(`  failing last check ${String(broken).padStart(5)}  ${pct(broken)}`);
for (const [via, n] of Object.entries(stats).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${via.padEnd(16)} ${String(n).padStart(6)}  ${pct(n)}`);
}

// Rewrite both bundles with tags folded in.
fs.writeFileSync(F.full, JSON.stringify(full));
const min = {
  g: full.generated,
  p: full.places.map((p) => [p.title, p.country, p.geo[0], p.geo[1]]),
  // [id, title, placeIndex, secure, tags, radioBrowserUuid, lastCheckOk]
  // Fixed arity now that later slots exist — optional trailing fields stop
  // working the moment anything follows them.
  c: full.channels.map((c) => [
    c.id, c.title, c.p, c.secure ? 1 : 0,
    c.tags?.length ? c.tags.join(",") : "",
    c.rbuuid || "",
    c.ok === 0 ? 0 : c.ok === 1 ? 1 : "",
  ]),
};
fs.writeFileSync(F.min, JSON.stringify(min));

const mb = (f) => (fs.statSync(f).size / 1e6).toFixed(1);
console.log(`\nstations.json      ${mb(F.full)} MB`);
console.log(`stations.min.json  ${mb(F.min)} MB`);

const top = {};
for (const c of full.channels) for (const t of c.tags || []) top[t] = (top[t] || 0) + 1;
console.log("\ntop tags: " + Object.entries(top).sort((a, b) => b[1] - a[1])
  .slice(0, 12).map(([t, n]) => `${t}(${n})`).join(" · "));
