#!/usr/bin/env node
/**
 * Fold what stations say about themselves into the catalogue, and write each
 * station's profile.
 *
 *   node scripts/profiles.mjs          fold and write
 *   node scripts/profiles.mjs --dry    say what would change, write nothing
 *
 * Runs after scripts/enrich.mjs (and after tags.mjs and expand.mjs, which it
 * builds on; like them it can run again and again).
 *
 * Into the catalogue (stations.json and the bundle the app loads):
 *   tags    the genres a station's stream announces (icy-genre) and its claim
 *           file names are added to its tags, so the taxonomy sees them
 *   ok      a station that answered on its stream is on the air
 *
 * Beside it, data/profiles/<xx>.json: one file per 256th of the catalogue, by a
 * hash of the station id, so the app fetches the one small file it needs when a
 * station is opened instead of carrying every description all the time:
 *   website, description, image, language, socials, bitrate, genres, moods,
 *   and a claim (Lightning address, Nostr key) when the station has published
 *   /.well-known/auralfm.json on its own site.
 * Where sources differ, the station's own claim wins, then its homepage, then
 * its stream. Images only over https, which is all a web page can show.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { writeBundles } from "./lib/match.mjs";
import { shardOf } from "./lib/shard.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const F = {
  full: path.join(ROOT, "data/stations.json"),
  min: path.join(ROOT, "data/stations.min.json"),
  enrich: path.join(ROOT, "data/_enrich.jsonl"),
  dump: path.join(ROOT, "data/_radiobrowser.json"),
  profiles: path.join(ROOT, "data/profiles"),
};
const dry = process.argv.includes("--dry");
const T = createRequire(import.meta.url)(path.join(ROOT, "src/taxonomy.js"));
// Names, not ids, so the app can show them without carrying the taxonomy.
const NAME = new Map([...T.GENRES, ...T.SCENES, ...T.FORMATS, ...T.MOODS].map((c) => [c.id, c.name]));
const names = (ids) => ids.map((i) => NAME.get(i) || i);

// "Pop, Dance/Hits; 128kbps" → ["pop", "dance", "hits"]
const genresFrom = (s) => [...new Set(String(s || "").split(/[,;/|]+/).map((g) => g.trim().toLowerCase())
  .filter((g) => g.length > 1 && g.length < 31 && !/^\d+$/.test(g) && !/kbps|https?:|www\.|\.com/.test(g)))].slice(0, 10);
const https = (u) => (typeof u === "string" && /^https:\/\/[^\s"'<>]+$/.test(u) ? u : undefined);
const clean = (o) => { for (const k of Object.keys(o)) if (o[k] === undefined || o[k] === "" || (Array.isArray(o[k]) && !o[k].length)) delete o[k]; return o; };

const full = JSON.parse(fs.readFileSync(F.full, "utf8"));
const enrich = new Map();
if (fs.existsSync(F.enrich)) for (const line of fs.readFileSync(F.enrich, "utf8").split("\n")) {
  try { const r = JSON.parse(line); enrich.set(r.id, r); } catch { /* half a line */ }
}
// Claims approved through scripts/claims.mjs (the form at docs.auralfm.xyz/claim):
// the station's own words, which win over anything crawled. Names and emails
// stay in data/claims.json; only what the station sent to be shown is used.
const approved = fs.existsSync(path.join(ROOT, "data/claims.json"))
  ? JSON.parse(fs.readFileSync(path.join(ROOT, "data/claims.json"), "utf8")).approved || {} : {};
const SOCIAL_HOST = [["instagram", /instagram\.com/], ["facebook", /facebook\.com|fb\.com/], ["x", /(^|\.)(x|twitter)\.com/],
  ["youtube", /youtube\.com|youtu\.be/], ["tiktok", /tiktok\.com/], ["soundcloud", /soundcloud\.com/], ["mixcloud", /mixcloud\.com/],
  ["spotify", /spotify\.com/], ["bluesky", /bsky\.app/], ["telegram", /t\.me|telegram\.me/], ["whatsapp", /wa\.me|whatsapp\.com/]];
const socialFrom = (links = []) => {
  const out = {};
  for (const l of links) { let h = ""; try { h = new URL(l).hostname; } catch { continue; }
    const hit = SOCIAL_HOST.find(([, re]) => re.test(h)); if (hit && !out[hit[0]]) out[hit[0]] = l; }
  return out;
};

const rb = new Map();
if (fs.existsSync(F.dump)) for (const s of JSON.parse(fs.readFileSync(F.dump, "utf8"))) rb.set(s.uuid, s);
console.log(`profiles: ${full.channels.length} stations, ${enrich.size} of them asked about themselves`);

const shards = new Map();
const n = { tagged: 0, newlyTagged: 0, onAir: 0, described: 0, social: 0, image: 0, claimed: 0, tips: 0 };
for (const c of full.channels) {
  const e = enrich.get(c.id), r = c.rbuuid ? rb.get(c.rbuuid) : null;
  const stream = e?.stream || {}, site = e?.site || {};
  // A form claim that was approved outranks a claim file, which outranks the crawl.
  const form = approved[c.id];
  const claim = { ...(site.claim || {}), ...(form || {}) };
  const formSocial = form ? socialFrom(form.links) : {};

  const before = (c.tags || []).length;
  const tags = [...new Set([...(c.tags || []), ...genresFrom(stream.genre), ...genresFrom(claim.genres)])];
  if (tags.length) { c.tags = tags; n.tagged++; if (!before) n.newlyTagged++; }
  if (stream.ok) { c.ok = 1; n.onAir++; }

  const k = T.classify({ tags: c.tags || [], title: c.title, country: c.country });
  const place = full.places[c.p] || {};
  const profile = clean({
    id: c.id, title: c.title, place: place.title, country: c.country, region: c.region || place.region,
    website: claim.website || site.final || c.website || stream.url || r?.home,
    description: claim.description || site.description || stream.description,
    image: https(claim.logo) || https(site.image) || https(c.logo) || https(r?.logo),
    lang: site.lang || c.lang || r?.lang,
    social: Object.keys({ ...(site.social || {}), ...formSocial }).length ? { ...(site.social || {}), ...formSocial } : undefined,
    bitrate: stream.br, genres: names(k.genres), moods: names(k.moods), formats: names(k.formats), scenes: names(k.scenes),
    explicit: c.explicit || undefined,
    // Where it plays from: the station's own server, which both apps try first
    // (src/resolver.js, web/bridge.js). Never another directory's redirect.
    stream: c.url && /^https?:\/\//i.test(c.url) && !/radio\.garden/i.test(c.url) ? c.url : undefined,
    claim: claim.lightning || claim.nostr ? clean({ lightning: claim.lightning, nostr: claim.nostr, contact: claim.contact }) : undefined,
    checked: e?.at,
  });
  if (profile.description) n.described++;
  if (profile.social) n.social++;
  if (profile.image) n.image++;
  if (site.claim || form) n.claimed++;
  if (profile.claim?.lightning) n.tips++;
  const s = shardOf(c.id);
  if (!shards.has(s)) shards.set(s, {});
  shards.get(s)[c.id] = profile;
}

console.log(`  with tags ${n.tagged} (${n.newlyTagged} newly, from their own streams)   on air ${n.onAir}`);
console.log(`  described ${n.described}   with an image ${n.image}   with socials ${n.social}`);
console.log(`  claimed their page ${n.claimed}   with a tip address ${n.tips}`);

if (dry) { console.log("--dry: nothing written"); process.exit(0); }
writeBundles(full, F);
fs.rmSync(F.profiles, { recursive: true, force: true });
fs.mkdirSync(F.profiles, { recursive: true });
let bytes = 0;
for (const [s, obj] of shards) { const j = JSON.stringify(obj); bytes += j.length; fs.writeFileSync(path.join(F.profiles, `${s}.json`), j); }
console.log(`wrote ${shards.size} profile files, ${(bytes / 1e6).toFixed(1)} MB in all`);
