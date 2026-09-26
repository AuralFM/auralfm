#!/usr/bin/env node
/**
 * What each station says about itself.
 *
 *   node scripts/enrich.mjs               resume (or start): every station not yet asked
 *   node scripts/enrich.mjs --limit 50    a sample
 *   node scripts/enrich.mjs --report      what is known so far, no network
 *   node scripts/enrich.mjs --again       ask again the ones older than --days (default 30)
 *   node scripts/enrich.mjs --retry       ask again only the ones whose stream timed out
 *                                         (run gently, --concurrency 16: a busy moment on
 *                                         this end is not a station off the air)
 *   node scripts/enrich.mjs --ids FILE    ask again exactly these stations (ids, one per line)
 *   node scripts/enrich.mjs --streamed    only stations whose stream is already known
 *                                         (the catalogue records one for nearly all)
 *
 * Two questions per station, both put to the station itself:
 *
 *   its stream   one connection, headers only, then hang up before the audio.
 *                Internet radio servers announce themselves there: icy-name,
 *                icy-genre, icy-url, icy-description, icy-br. The answer also
 *                says whether the station is on the air right now.
 *   its website  one page, the homepage, when robots.txt allows it: the title,
 *                the description, the image it chose to be shared with, the
 *                language, and its links out — Facebook, Instagram, X, YouTube,
 *                TikTok, SoundCloud, Mixcloud, Telegram, WhatsApp, Bluesky,
 *                Mastodon, Nostr — and any Lightning address it publishes.
 *
 *   its claim   /.well-known/auralfm.json on the station's own website, if it
 *               has put one there: a station claiming its page. Only whoever
 *               runs the website can publish that file, so what it says (a
 *               Lightning address for tips, a Nostr key, its own description) is
 *               the station speaking. See docs.auralfm.xyz/stations/.
 *
 * Nothing about listeners is involved: this is a directory reading the public
 * pages of the stations it lists, once, politely (AuralFM's name in the
 * User-Agent, robots.txt respected, one request at a time per host).
 *
 * Old Shoutcast servers answer "ICY 200 OK" instead of HTTP, which fetch()
 * refuses outright, so the stream question is asked over a plain socket and the
 * reply read by hand. Answers are appended to data/_enrich.jsonl as they come.
 */
import fs from "node:fs";
import dns from "node:dns";
import net from "node:net";
import tls from "node:tls";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ── names, through public resolvers ─────────────────────────────────────────
// Looked up through the system, names go to the home router, which answered 250
// of 300 lookups too slowly when asked all at once (26 Sept): every station
// then "timed out". Public resolvers answered 293 of the same 300. So the crawl
// asks them, keeps each answer for the run, and falls back to the system only
// when they have nothing.
const resolver = new dns.promises.Resolver({ timeout: 4000, tries: 2 });
resolver.setServers(["1.1.1.1", "8.8.8.8", "9.9.9.9", "1.0.0.1"]);
const systemLookup = dns.lookup.bind(dns);
const names = new Map();
function publicLookup(host, opts, cb) {
  if (typeof opts === "function") { cb = opts; opts = {}; }
  if (typeof opts === "number") opts = { family: opts };
  opts = opts || {};
  if (net.isIP(host)) {
    const family = net.isIP(host);
    return process.nextTick(() => (opts.all ? cb(null, [{ address: host, family }]) : cb(null, host, family)));
  }
  if (!names.has(host)) names.set(host, (async () => {
    try { const a = await resolver.resolve4(host); if (a.length) return a.map((address) => ({ address, family: 4 })); } catch { /* next */ }
    try { const a = await resolver.resolve6(host); if (a.length) return a.map((address) => ({ address, family: 6 })); } catch { /* next */ }
    return new Promise((res) => systemLookup(host, { all: true }, (err, list) => res(err ? [] : list)));
  })());
  names.get(host).then((list) => {
    if (!list.length) { const e = new Error(`no address for ${host}`); e.code = "ENOTFOUND"; return cb(e); }
    if (opts.all) cb(null, list); else cb(null, list[0].address, list[0].family);
  });
}
dns.lookup = publicLookup;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const F = {
  full: path.join(ROOT, "data/stations.json"),
  dump: path.join(ROOT, "data/_radiobrowser.json"),
  out: path.join(ROOT, "data/_enrich.jsonl"),
};
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : d; };
const CFG = { limit: opt("limit", Infinity), concurrency: opt("concurrency", 24), days: opt("days", 30), again: argv.includes("--again"),
  streamed: argv.includes("--streamed"), retry: argv.includes("--retry") };
const UA = "AuralFM-directory/0.2 (+https://docs.auralfm.xyz; hello@auralfm.xyz)";

// ── what is known ───────────────────────────────────────────────────────────
const known = new Map();
if (fs.existsSync(F.out)) for (const line of fs.readFileSync(F.out, "utf8").split("\n")) {
  if (!line) continue;
  try { const r = JSON.parse(line); known.set(r.id, r); } catch { /* half a line */ }
}

if (argv.includes("--report")) {
  const all = [...known.values()], n = (f) => all.filter(f).length, pct = (k) => `${(100 * k / (all.length || 1)).toFixed(0)}%`;
  const nets = {};
  for (const r of all) for (const k of Object.keys(r.site?.social || {})) nets[k] = (nets[k] || 0) + 1;
  console.log(`${all.length} stations asked`);
  console.log(`  stream on air      ${n((r) => r.stream?.ok)} (${pct(n((r) => r.stream?.ok))})`);
  console.log(`  says its genre     ${n((r) => r.stream?.genre)}   its website ${n((r) => r.stream?.url)}   describes itself ${n((r) => r.stream?.description)}`);
  console.log(`  website read       ${n((r) => r.site?.ok)}   robots said no ${n((r) => r.site?.why === "robots")}`);
  console.log(`  with a description ${n((r) => r.site?.description)}   an image ${n((r) => r.site?.image)}   a language ${n((r) => r.site?.lang)}`);
  console.log(`  with socials       ${n((r) => r.site?.social && Object.keys(r.site.social).length)}: ` +
    Object.entries(nets).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(" · "));
  console.log(`  a Lightning address ${n((r) => r.site?.lightning)}   a Nostr key ${n((r) => r.site?.social?.nostr)}   ` +
    `claimed their page ${n((r) => r.site?.claim)}`);
  process.exit(0);
}

// ── who to ask ──────────────────────────────────────────────────────────────
const { channels } = JSON.parse(fs.readFileSync(F.full, "utf8"));
const rbHome = new Map();
if (fs.existsSync(F.dump)) for (const s of JSON.parse(fs.readFileSync(F.dump, "utf8"))) if (s.home) rbHome.set(s.uuid, s.home);

const stale = (r) => CFG.again && (Date.now() - Date.parse(r.at)) / 864e5 > CFG.days;
const timedOut = (r) => r.stream?.why === "timeout";
const idsAt = argv.indexOf("--ids");
const only = idsAt >= 0 ? new Set(fs.readFileSync(argv[idsAt + 1], "utf8").split(/\s+/).filter(Boolean)) : null;
const todo = channels.filter((c) => (only ? only.has(c.id)
    : CFG.retry ? known.has(c.id) && timedOut(known.get(c.id)) : !known.has(c.id) || stale(known.get(c.id))))
  .map((c) => ({ id: c.id, stream: c.url || "", site: c.website || rbHome.get(c.rbuuid) || "" }))
  .filter((t) => !CFG.streamed || t.stream)
  .slice(0, CFG.limit);
// The catalogue is in place order, so neighbours share a town's hosting company
// and every worker would queue on one server. Shuffled (the same way every run),
// the workers are spread across hosts.
{ let seed = 42; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = todo.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [todo[i], todo[j]] = [todo[j], todo[i]]; } }
console.log(`enrich: ${known.size} known, ${todo.length} to ask, ${CFG.concurrency} at a time`);

// ── one request per host at a time ──────────────────────────────────────────
// A station's own server gets one request at a time. The big streaming
// providers, which carry thousands of stations each and are built for that
// traffic, get a few lanes, or a 38,000-station pass would take most of a day.
const PROVIDERS = /(^|\.)(zeno\.fm|streamtheworld\.com|radio\.co|streamguys1\.com|securenetsystems\.net|infomaniak\.ch|radioca\.st|laut\.fm|qtfm\.cn|qingting\.fm|ice\.infomaniak\.ch|streamabc\.net|radiojar\.com|audio\.com\.br|radiohost\.pl|shoutcast\.com|listen2myradio\.com|streema\.com|mixlr\.com|live365\.com|radioking\.com|stream\.laut\.fm|icecast\.omroep\.nl|rtvelivestream\.akamaized\.net|akamaized\.net|cloudfront\.net)$/i;
const LANES = 6;
let lane = 0;
// Any host carrying more than 20 of the stations to ask is a provider too, named
// or not: Brazil alone has hosting companies with hundreds of stations each.
const hostCount = new Map();
for (const t of todo) for (const u of [t.stream, t.site]) {
  try { const h = new URL(/^https?:/i.test(u) ? u : `http://${u}`).hostname; hostCount.set(h, (hostCount.get(h) || 0) + 1); } catch { /* none */ }
}
const laneFor = (host) => {
  const bare = host.replace(/^stream:/, "");
  return PROVIDERS.test(bare) || (hostCount.get(bare) || 0) > 20 ? `${host}#${lane++ % LANES}` : host;
};
const busy = new Map();
async function politely(host, fn) {
  host = laneFor(host);
  while (busy.get(host)) await busy.get(host).catch(() => {});
  const p = (async () => { try { return await fn(); } finally { await new Promise((r) => setTimeout(r, 250)); } })();
  busy.set(host, p);
  try { return await p; } finally { if (busy.get(host) === p) busy.delete(host); }
}

// ── the stream: headers only, over a socket ─────────────────────────────────
function streamHeaders(url, hops = 0) {
  return new Promise((resolve) => {
    let u; try { u = new URL(url); } catch { return resolve({ ok: false, why: "bad url" }); }
    const secure = u.protocol === "https:";
    const port = Number(u.port) || (secure ? 443 : 80);
    const done = (r) => { clearTimeout(timer); sock.destroy(); resolve(r); };
    const opts = { host: u.hostname, port, servername: u.hostname, rejectUnauthorized: false, lookup: publicLookup };
    const sock = secure ? tls.connect(opts) : net.connect(opts);
    const timer = setTimeout(() => done({ ok: false, why: "timeout" }), 8000);
    let buf = Buffer.alloc(0);
    sock.on("connect", () => !secure && send());
    sock.on("secureConnect", send);
    function send() {
      sock.write(`GET ${u.pathname || "/"}${u.search} HTTP/1.0\r\nHost: ${u.host}\r\nUser-Agent: ${UA}\r\n` +
        `Icy-MetaData: 1\r\nAccept: */*\r\nConnection: close\r\n\r\n`);
    }
    sock.on("data", (d) => {
      buf = Buffer.concat([buf, d]);
      const end = buf.indexOf("\r\n\r\n");
      if (end < 0 && buf.length < 16384) return;
      const lines = buf.slice(0, end < 0 ? buf.length : end).toString("latin1").split("\r\n");
      const status = Number((/^(?:HTTP\/[\d.]+|ICY)\s+(\d{3})/i.exec(lines[0]) || [])[1] || 0);
      const h = {};
      for (const l of lines.slice(1)) { const i = l.indexOf(":"); if (i > 0) h[l.slice(0, i).trim().toLowerCase()] = l.slice(i + 1).trim(); }
      if (status >= 300 && status < 400 && h.location && hops < 4) {
        clearTimeout(timer); sock.destroy();
        return resolve(streamHeaders(new URL(h.location, url).href, hops + 1));
      }
      const txt = (k) => (h[k] && h[k] !== "-" && !/^(unspecified|default|n\/a|none|various|misc|no name|unnamed|stream|radio|my radio)$/i.test(h[k]) ? h[k].slice(0, 300) : undefined);
      done({
        ok: status === 200, status, name: txt("icy-name"), genre: txt("icy-genre"), url: txt("icy-url"),
        description: txt("icy-description"), br: Number(h["icy-br"]) || undefined, type: h["content-type"],
      });
    });
    sock.on("error", (e) => done({ ok: false, why: e.code || "error" }));
  });
}

// ── the website: robots.txt, then the homepage ──────────────────────────────
// Social networks and link hubs are not a station's own website: reading them
// is reading someone else's pages, and they turn directories away anyway.
const NOT_A_SITE = /(^|\.)(facebook\.com|fb\.com|instagram\.com|twitter\.com|x\.com|youtube\.com|tiktok\.com|linktr\.ee|zeno\.fm|radio\.garden|tunein\.com|google\.com|sites\.google\.com|wixsite\.com|blogspot\.com|mixcloud\.com|soundcloud\.com)$/i;
const robots = new Map();
async function allowed(u) {
  const origin = u.origin;
  if (!robots.has(origin)) robots.set(origin, (async () => {
    try {
      const r = await fetch(`${origin}/robots.txt`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(5000) });
      if (!r.ok) return [];
      const rules = [], lines = (await r.text()).split(/\r?\n/);
      let applies = false;
      for (const raw of lines) {
        const l = raw.replace(/#.*/, "").trim(); if (!l) continue;
        const [k, ...v] = l.split(":"); const val = v.join(":").trim(), key = k.trim().toLowerCase();
        if (key === "user-agent") applies = val === "*" || /auralfm/i.test(val);
        else if (key === "disallow" && applies && val) rules.push(val);
      }
      return rules;
    } catch { return []; }
  })());
  const rules = await robots.get(origin);
  return !rules.some((r) => (u.pathname || "/").startsWith(r));
}

const SOCIAL = [
  ["facebook", /https?:\/\/(?:www\.|m\.)?facebook\.com\/(?!sharer|share|plugins|dialog|tr\b|login)[\w.\-/%]+/i],
  ["instagram", /https?:\/\/(?:www\.)?instagram\.com\/(?!p\/|explore|accounts)[\w.\-]+/i],
  ["x", /https?:\/\/(?:www\.)?(?:twitter|x)\.com\/(?!share|intent|home|search)[\w]+/i],
  ["youtube", /https?:\/\/(?:www\.)?youtube\.com\/(?:@[\w.\-]+|channel\/[\w\-]+|c\/[\w.\-]+|user\/[\w.\-]+)/i],
  ["tiktok", /https?:\/\/(?:www\.)?tiktok\.com\/@[\w.\-]+/i],
  ["soundcloud", /https?:\/\/(?:www\.)?soundcloud\.com\/[\w\-]+/i],
  ["mixcloud", /https?:\/\/(?:www\.)?mixcloud\.com\/[\w\-]+/i],
  ["telegram", /https?:\/\/(?:t\.me|telegram\.me)\/[\w]+/i],
  ["whatsapp", /https?:\/\/(?:wa\.me|api\.whatsapp\.com\/send)[^\s"'<>]*/i],
  ["bluesky", /https?:\/\/bsky\.app\/profile\/[\w.:\-]+/i],
  ["spotify", /https?:\/\/open\.spotify\.com\/(?:show|user|artist|playlist)\/[\w]+/i],
  ["nostr", /\bnpub1[02-9ac-hj-np-z]{58}\b/],
];

/**
 * What a homepage says, in one straight pass. The first version ran a dozen
 * backtracking patterns over up to 600 KB each; at a hundred pages at once that
 * starved the event loop long enough for every socket timer to fire first, and
 * nearly every station "timed out". Now the page is cut into its meta tags and
 * its links once, and the patterns only ever look at those short strings.
 */
function readPage(html, base) {
  const head = html.slice(0, 150000);
  const metas = {};
  for (const m of head.matchAll(/<meta\b([^>]{0,1500})>/gi)) {
    const attrs = {};
    for (const a of m[1].matchAll(/([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) attrs[a[1].toLowerCase()] = a[3] ?? a[4];
    const key = (attrs.property || attrs.name || "").toLowerCase();
    if (key && attrs.content && !(key in metas)) metas[key] = decode(attrs.content).trim().slice(0, 400);
  }
  const prop = (k) => metas[k] || undefined;
  const hrefs = [...html.matchAll(/href\s*=\s*["']([^"'\s>]{8,400})["']/gi)].map((m) => m[1]);
  const social = {};
  for (const [k, re] of SOCIAL) {
    if (k === "nostr") { const m = /npub1[02-9ac-hj-np-z]{58}/.exec(html); if (m) social.nostr = m[0]; continue; }
    const hit = hrefs.find((h) => re.test(h));
    if (hit) social[k] = hit.replace(/[)"'.,;]+$/, "");
  }
  for (const m of html.matchAll(/<a\b([^>]{0,600})>/gi)) {
    if (!/\brel\s*=\s*["'][^"']{0,40}\bme\b/i.test(m[1])) continue;
    const h = /href\s*=\s*["'](https:\/\/[^"'\s]+\/@\w+)["']/i.exec(m[1]);
    if (h && !/twitter|x\.com|instagram|facebook|threads/.test(h[1])) { social.mastodon = h[1]; break; }
  }
  // A Lightning address the station publishes itself: lightning:name@host, or lud16.
  const ln = /lightning:([\w.+-]{1,64}@[\w.-]{1,120}\.[a-z]{2,})/i.exec(html) || /"lud16"\s*:\s*"([\w.+-]{1,64}@[\w.-]{1,120}\.[a-z]{2,})"/i.exec(html);
  let image = prop("og:image") || prop("twitter:image");
  try { if (image) image = new URL(image, base).href; } catch { image = undefined; }
  const title = /<title[^>]{0,200}>([^<]{1,300})<\/title>/i.exec(head);
  const out = {
    ok: true,
    title: title ? decode(title[1]).trim() : undefined,
    description: prop("og:description") || prop("description"),
    image, name: prop("og:site_name"),
    lang: (/<html\b[^>]{0,500}\blang\s*=\s*["']([\w-]{2,10})["']/i.exec(head) || [])[1],
    ...(Object.keys(social).length ? { social } : {}),
    ...(ln ? { lightning: ln[1] } : {}),
  };
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  // A substring keeps its whole page alive in V8; kept for every homepage in the
  // run, that ran the crawl out of memory at 2 GB. A JSON round trip copies each
  // string out, and the pages can go.
  return JSON.parse(JSON.stringify(out));
}
const decode = (s) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/\s+/g, " ");

/**
 * A station's claim: /.well-known/auralfm.json on its own site. Kept only as the
 * fields the spec names, each a short string, so a claim cannot smuggle in
 * anything else. Lightning addresses must look like name@host.
 */
const CLAIM_FIELDS = { name: 120, description: 600, lightning: 120, nostr: 70, logo: 300, contact: 120, genres: 200 };
async function readClaim(origin) {
  try {
    const r = await fetch(`${origin}/.well-known/auralfm.json`, { headers: { "User-Agent": UA, Accept: "application/json" },
      redirect: "follow", signal: AbortSignal.timeout(5000) });
    // A claim is JSON from the station's own origin, and says something only a
    // station would: a tip address, a Nostr key or a description. Sites that
    // answer every missing page with a JSON "404-error" and a 200 (Moody Radio)
    // must not read as claims.
    if (r.status !== 200 || new URL(r.url).origin !== origin || !/json/i.test(r.headers.get("content-type") || "")) return null;
    const j = await r.json();
    if (!j || typeof j !== "object" || !(j.lightning || j.nostr || j.description)) return null;
    const c = {};
    for (const [k, max] of Object.entries(CLAIM_FIELDS)) if (typeof j[k] === "string" && j[k].trim()) c[k] = j[k].trim().slice(0, max);
    if (c.lightning && !/^[\w.+\-]+@[\w.\-]+\.[a-z]{2,}$/i.test(c.lightning)) delete c.lightning;
    if (c.nostr && !/^npub1[02-9ac-hj-np-z]{58}$/.test(c.nostr)) delete c.nostr;
    return Object.keys(c).length ? c : null;
  } catch { return null; }
}

// A network's channels often share one homepage (181 NRJ channels, one nrj.fr):
// read it once and give every one of them the same answer.
const pages = new Map();
function website(raw) {
  const key = String(raw || "").trim().replace(/\/+$/, "").toLowerCase();
  if (!pages.has(key)) pages.set(key, readWebsite(raw));
  return pages.get(key);
}

async function readWebsite(raw) {
  let u; try { u = new URL(/^https?:/i.test(raw) ? raw : `http://${raw}`); } catch { return { ok: false, why: "bad url" }; }
  if (NOT_A_SITE.test(u.hostname.replace(/^www\./, ""))) return { ok: false, why: "not its own site" };
  return politely(u.hostname, async () => {
    if (!(await allowed(u))) return { ok: false, why: "robots" };
    try {
      const r = await fetch(u.href, { headers: { "User-Agent": UA, Accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(10000) });
      if (!r.ok) return { ok: false, why: `http ${r.status}` };
      if (!/html/i.test(r.headers.get("content-type") || "")) return { ok: false, why: "not html" };
      const reader = r.body.getReader(); let html = "", got = 0; const dec = new TextDecoder();
      while (got < 300000) { const { value, done } = await reader.read(); if (done) break; got += value.length; html += dec.decode(value, { stream: true }); }
      reader.cancel().catch(() => {});
      const claim = await readClaim(new URL(r.url).origin);
      return { ...readPage(html, r.url), final: r.url !== u.href ? r.url : undefined, ...(claim ? { claim } : {}) };
    } catch (e) { return { ok: false, why: e.name === "TimeoutError" ? "timeout" : "network" }; }
  });
}

// ── run ─────────────────────────────────────────────────────────────────────
// Node's fetch can throw from inside a socket's end event when a body is
// cancelled mid-read (an assertion in undici, seen 26 Sept), which no await can
// catch. One station's odd server must not end a 26,000-station pass: say so and
// go on; whatever was asked is already written, and a resume asks the rest.
process.on("uncaughtException", (err) => console.error(`  (carried on past: ${err.code || err.name}: ${String(err.message).slice(0, 80)})`));
const out = fs.createWriteStream(F.out, { flags: "a" });
let next = 0, done = 0, onAir = 0;
const started = Date.now();
async function worker() {
  while (next < todo.length) {
    const t = todo[next++];
    let host = ""; try { host = new URL(t.stream).hostname; } catch { /* none */ }
    const [stream, site] = await Promise.all([
      t.stream ? politely(`stream:${host}`, () => streamHeaders(t.stream)) : { ok: false, why: "no stream" },
      t.site || null ? website(t.site) : { ok: false, why: "no website" },
    ]);
    // When the stream names a website and we had none, read that one.
    let s2 = site;
    if (!site.ok && stream.url && /^https?:/i.test(stream.url) && site.why !== "robots") s2 = await website(stream.url);
    out.write(JSON.stringify({ id: t.id, at: new Date().toISOString().slice(0, 10), stream, site: s2 }) + "\n");
    done++; if (stream.ok) onAir++;
    if (done % 500 === 0 || done === todo.length) {
      const rate = done / ((Date.now() - started) / 1000);
      console.log(`  ${done}/${todo.length} · ${onAir} on air · ${rate.toFixed(1)}/s · ~${Math.round((todo.length - done) / rate / 60)} min left`);
    }
  }
}
await Promise.all(Array.from({ length: CFG.concurrency }, worker));
out.end();
