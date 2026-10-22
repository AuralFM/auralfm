#!/usr/bin/env node
/**
 * Pre-flight checks for the traps this codebase has actually fallen into.
 *
 * Every rule below exists because the bug it catches shipped at least once, and
 * several shipped more than once. They are cheap, they run offline in about a
 * second, and they are the difference between finding a mistake now and finding
 * it in a screenshot from someone who was just trying to listen to the radio.
 *
 *   npm run audit
 *
 * ## What is checked, and the bug each one remembers
 *
 * **Renderers and markup**
 *   renderer scripts parse .................. a syntax error in a renderer fails silently
 *   script-src needs no 'unsafe-inline' ..... the CSP refactor, kept from regressing
 *   tag balance ............................. an HTML comment opened inside a <meta>
 *   [hidden] survives an explicit display ... a panel that would not hide
 *   drag-region controls are clickable ...... a titlebar that ate its own buttons
 *   local scripts pass the CSP .............. a script blocked only in the built app
 *   no system colour keywords ............... themed windows drifting to system colours
 *   every renderer catches its own errors ... fitHeight() threw for two days, silently
 *
 * **Boundaries**
 *   every preload method has a handler ...... an IPC channel with nothing listening
 *   no Electron imports outside main/preload  a renderer reaching past the bridge
 *   state:set takes patches, not snapshots .. a stale popover copy deleted favorites
 *   every chat channel goes through visible() a safety rule covering 2 surfaces of 3
 *   every window is locked down ............. target=_blank would open a bare window
 *   links leave only as http(s) ............. station links handed file: to the OS
 *   the resolver keeps no cookies ........... Google's cookies in the app's session
 *   prefs:set takes only real preferences ... any key, any type, written to disk
 *   every clickable row works by keyboard .. no way to pick a station without a mouse
 *   no button is named by a glyph ........... the headline Close announced as "times"
 *   every input has a name ................... the nickname field announced as "Anonymous"
 *   every var() a page uses is defined ....... the output menu drew with no background
 *   help tags keep a control's name .......... the popover star announced as "button"
 *   the Settings reader holds focus .......... Tab walked into the settings behind it
 *   a refused relay keeps what was typed ..... erased, with the reason in the placeholder
 *   the share sheet holds focus .............. Tab walked out of the card into the toolbar
 *   an output's tick is not its name ......... every option announced as "✓ System output"
 *   the popover's keys yield to its menu ..... Escape in the output menu hid the whole panel
 *   Explore's styles live in the sheet ...... four inline paddings, four numbers
 *
 * **Correctness and content**
 *   every polled service has a cooldown ..... Celestrak IP-blocked this project
 *   i18n keys resolve ....................... a missing key rendering as its own name
 *   no duplicated blocks .................... a scripted edit pasted a boot sequence 3x
 *   the English strings speak one English ... "favourites" slipped in
 *   search finds 104.9 and 104,9 ............ decimal-comma locales found nothing
 *   a bodiless envelope sends with tags ..... every favorite silently never sent
 *   sweeping the globe duplicates no note ... one "hola" was drawn seven times
 *   system lines outlive a repaint ......... every explanation the chat gave vanished
 *   the renderer is told once per burst ... 2,939 IPC messages in fifteen seconds
 *   we say who we are and mine ........... invisible to a network that filters on both
 *   a hub is its name and password ....... a room the relays carry and cannot read
 *   a profile lookup names one person .... a bulk fetch would name your whole cell
 *   the chosen output moves both kinds ... shortwave would keep using the laptop
 *   a station starting keeps the globe .... a 1.4 s freeze on the first press
 *   the popover remembers the station ..... any setting changed while playing wrote "Nothing playing"
 *
 * **Design system**
 *   design tokens are not bypassed .......... radii invented outside the scale
 *   light theme agrees with itself .......... four token blocks drifting apart
 *   the favourite star survives light theme . 1.01:1 contrast in all nine palettes
 *   nothing is written under 12px ........... 52 sizes from 9px to 11.5px on three pages (new, 10 Oct 2026)
 *   on a phone the name keeps its room ...... "KU…" beside "Austin TX · United St…" (new, 10 Oct 2026)
 *
 * **What ships**
 *   shipped files exist ..................... build.files naming a missing path
 *   every data file src/ reads is shipped ... the word filter read a file not packaged
 *   third-party notices are current ......... five MIT libraries with no notice
 *   every import is declared and credited ... @noble/hashes required but undeclared
 *   every shipped licence is permissive ..... nothing stopped a copyleft dependency
 *   the project states one licence .......... see below
 *   shortwave schedule is current ........... a season's schedule going stale
 *   a show goes into a calendar ............. the wrong hour across a clock change (new, 9 Oct 2026)
 *   the newsletter goes to who asked ........ an issue reaching the shop or beta list (new, 9 Oct 2026)
 *   the FM and AM chips are a dial .......... a number that is not a frequency sending someone to dead air (new, 10 Oct 2026)
 *   a playlist stream plays in Chrome too ... about 1,800 HLS stations saying "unavailable" on a computer (new, 10 Oct 2026)
 *
 * ### The licence check, in more detail
 *
 * `LICENSE` carried the MIT grant while `docs/TERMS.md` — which ships inside the
 * app — said the software is not open source and may not be redistributed. Two
 * shipped documents granting and withholding the same rights, with
 * `THIRD-PARTY-NOTICES.md` (also shipped) siding with the MIT one.
 *
 * Settled 8 August 2026: **AuralFM is open source** (MIT then, Apache 2.0 since
 * 13 October 2026), and the terms were
 * the document that had to change. The reason is the project's own thesis — it
 * claims no backend and no collection, and in a closed binary those are promises
 * rather than facts.
 *
 * The check asserts all four statements still agree — LICENSE, the notices
 * preamble, docs/TERMS.md and package.json — because this is a legal claim that
 * reaches every user, and the failure mode was silent for months. It is written
 * to be equally strict in both directions: it would fail just as loudly if a
 * proprietary notice reappeared.
 *
 * A second check covers the other direction: what *dependencies* are licensed
 * under. It walks what actually ships — the production tree, the vendored
 * globe.gl bundle (a UMD file with its subtree inlined) and Electron — and fails
 * on anything outside a permissive allowlist. SPDX expressions are evaluated, so
 * `(MIT OR GPL-3.0)` passes and `(MIT AND GPL-3.0)` does not, and a missing
 * `license` field fails. An allowlist rather than a denylist, so an unfamiliar
 * licence stops the build and gets a decision.
 *
 * Not recursed into Electron's own npm dependencies: @electron/get and friends
 * are install-time download helpers and are never packaged. Walking them would
 * let the pass message claim they ship.
 *
 * Neither check verifies that Chromium's BSD-3-Clause notice ships. It does not —
 * the bundle and the DMG contain no licence file at all, and the notice is 19 MB.
 * That is a decision, recorded in docs/LEGAL-AND-SECURITY.md, not a check.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const R = (p) => path.join(ROOT, p);
const rel = (p) => path.relative(ROOT, p);

let failures = 0;
const fail = (rule, detail) => { failures++; console.log(`  FAIL  ${rule}\n        ${detail}`); };
const pass = (rule) => console.log(`  ok    ${rule}`);
// Some things cannot be checked everywhere. The station bundle and the receiver
// list are generated by the crawl and gitignored, so on a fresh clone or in CI
// they are simply absent. Reporting that as a failure trains people to ignore a
// red run, and reporting it as a pass is a lie about what was verified.
let skipped = 0;
// Set by `npm run dist`: files that may be absent in CI must be present in a build.
const RELEASE = process.argv.includes("--release");
const skip = (rule, why) => { skipped++; console.log(`  --    ${rule}\n        not checkable here: ${why}`); };
/**
 * The catalogue's own files.
 *
 * The station list, the taxonomy and the scripts that build them moved to
 * AuralFM/catalogue on 12 Oct 2026 (scripts/catalogue.mjs brings copies here).
 * The checks that read those scripts came with a fault each, and stay here,
 * reading the catalogue's checkout beside this one. Without it they say they
 * could not be run, which is not the same as passing.
 */
const CAT = process.env.AURALFM_CATALOGUE || path.resolve(ROOT, "..", "auralfm-catalogue");
const HAS_CAT = fs.existsSync(path.join(CAT, "scripts", "profiles.mjs"));
const C = (p) => path.join(CAT, p);
const NO_CAT = `the catalogue repo is not at ${CAT} (set AURALFM_CATALOGUE)`;

const renderers = fs.readdirSync(R("src/renderer"))
  .filter((f) => f.endsWith(".html"))
  .map((f) => ({ file: R(`src/renderer/${f}`), html: fs.readFileSync(R(`src/renderer/${f}`), "utf8") }));

const mainFiles = fs.readdirSync(R("src"))
  .filter((f) => f.endsWith(".js"))
  .map((f) => ({ file: R(`src/${f}`), src: fs.readFileSync(R(`src/${f}`), "utf8") }));

// ─────────────────────────────────────────────────────────────────────────────
console.log("\nrenderer scripts parse");
// A syntax error in a renderer's script fails silently: the file is skipped,
// every global it declared is undefined, and the window renders as a dead shell.
// This shipped once and cost an evening.
//
// Parses the files each renderer references, now that the scripts are external.
// That covers more than the old inline-block version did — the shared modules
// (errors.js, icons.js, kiwi.js, astro.js) were never checked before, and a
// renderer with no script at all is still caught, because it would reference
// none.
for (const { file, html } of renderers) {
  const srcs = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => m[1]);
  if (!srcs.length) { fail("references no script", rel(file)); continue; }
  const missing = srcs.filter((s2) => !fs.existsSync(R(`src/renderer/${s2}`)));
  if (missing.length) { fail(rel(file), `missing script: ${missing.join(", ")}`); continue; }
  try {
    for (const s2 of srcs) new vm.Script(fs.readFileSync(R(`src/renderer/${s2}`), "utf8"));
    pass(`${rel(file)}  (${srcs.length} scripts)`);
  } catch (err) {
    fail(rel(file), err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("\nno renderer needs 'unsafe-inline' for scripts");
// Every renderer's JavaScript lives in a file, so script-src can be 'self'
// alone. Reintroducing an inline block would need 'unsafe-inline' back, and that
// is the single most valuable directive in the policy.
{
  const loose = [];
  for (const { file, html } of renderers) {
    if (/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/.test(html)) loose.push(`${rel(file)} has an inline block`);
    const m = html.match(/script-src[^;"]*/);
    if (m && m[0].includes("unsafe-inline")) loose.push(`${rel(file)} still allows unsafe-inline`);
    if (/\son(?:click|input|change|submit|keydown|load|error)\s*=\s*"/.test(html)) loose.push(`${rel(file)} has an inline handler attribute`);
  }
  loose.length ? fail("script-src", loose.join("; "))
               : pass("script-src is 'self' everywhere, with no inline scripts or handlers");
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("\ntag balance");
// A regex edit once ate a closing </div>, which nested the station list inside
// a flex column and stacked the whole UI vertically.
for (const { file, html } of renderers) {
  const body = html.slice(html.indexOf("<body>"), html.indexOf("</body>"));
  let bad = [];
  for (const tag of ["div", "section", "main", "button"]) {
    const o = (body.match(new RegExp(`<${tag}[\\s>]`, "g")) || []).length;
    const c = (body.match(new RegExp(`</${tag}>`, "g")) || []).length;
    if (o !== c) bad.push(`${tag} ${o} open / ${c} close`);
  }
  bad.length ? fail(rel(file), bad.join(", ")) : pass(rel(file));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n[hidden] survives an explicit display");
// Four separate times, an element was given `display:flex` in CSS and `hidden`
// in HTML, and the attribute silently lost.
//
// This check used to accept *any* [hidden] rule, and that is why it kept
// missing them: one scoped guard like `#caption[hidden]{display:none}` satisfied
// it while every other element stayed exposed. The trap is per-element, so a
// per-element remedy can never clear the whole file.
//
// What is required now is the unscoped, !important rule. Unscoped because it has
// to cover elements nobody has thought about yet, and !important because a plain
// [hidden] is specificity (0,1,0) and loses to any `#id{display:flex}`.
// Unscoped means nothing selector-ish immediately precedes it: `#caption[hidden]`
// must not count, `[hidden]` on its own must.
const GLOBAL_HIDDEN = /(?:^|[}\s;])\[hidden\]\s*\{[^}]*display\s*:\s*none\s*!important/;
for (const { file, html } of renderers) {
  const css = (html.match(/<style>([\s\S]*?)<\/style>/) || [, ""])[1];
  const setsDisplay = /(?:^|[;{])\s*display\s*:\s*(?!none)[\w-]+/m.test(css);
  if (setsDisplay && !GLOBAL_HIDDEN.test(css)) {
    fail(rel(file), "sets an explicit display but has no global [hidden]{display:none !important}");
  } else pass(rel(file));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("\ncontrols in a drag region are clickable");
// A title bar with `-webkit-app-region: drag` swallows clicks on anything inside
// it. The Layers button spent a day looking pressed and doing nothing — clicking
// it moved the window — because the opt-out had been written per-id and the new
// button was not on the list.
for (const { file, html } of renderers) {
  // Comments first: a `/* … */` immediately above a rule gets swallowed into the
  // selector capture, and the check then hunts for a selector that is half a
  // sentence of English.
  const css = (html.match(/<style>([\s\S]*?)<\/style>/) || [, ""])[1]
    .replace(/\/\*[\s\S]*?\*\//g, "");
  // Keep the selector as written — `.toolbar` and a bare `header` are both
  // legitimate, and stripping the dot broke the element-selector case.
  const dragSel = [...css.matchAll(/([^{}]+)\{[^}]*-webkit-app-region\s*:\s*drag(?!\w)/g)]
    .map((m) => m[1].trim().split(/[,]/).pop().trim());
  if (!dragSel.length) { pass(rel(file)); continue; }
  const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Every dragging container must give its buttons a blanket no-drag.
  const blanket = dragSel.every((sel) =>
    new RegExp(`${esc(sel)}\\s+button[^{]*\\{[^}]*-webkit-app-region\\s*:\\s*no-drag`).test(css));
  blanket ? pass(rel(file))
          : fail(rel(file), "a drag region has no blanket `button{-webkit-app-region:no-drag}`");
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("\nlocal scripts are permitted by the CSP");
// Settings loaded icons.js while its CSP said `script-src 'unsafe-inline'` with
// no 'self'. The file was blocked, `Icons` was undefined, and the two calls at
// the top of the inline script threw — killing every line below them. The whole
// settings window rendered empty controls and nothing worked, with no visible
// error anywhere in the app.
for (const { file, html } of renderers) {
  const csp = (/<meta[^>]+Content-Security-Policy[^>]+content="([^"]+)"/i.exec(html) || [, ""])[1];
  const loadsLocal = /<script\s+src="(?!https?:)/i.test(html);
  const scriptSrc = (/script-src ([^;]*)/i.exec(csp) || [, ""])[1];
  if (loadsLocal && !/'self'/.test(scriptSrc)) {
    fail(rel(file), "loads a local <script src> but script-src has no 'self'");
  } else pass(rel(file));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("\nno system colour keywords in themed windows");
// Canvas and CanvasText follow the OS appearance, not our theme override, so a
// forced Dark theme on a light Mac painted black text on a dark page.
for (const { file, html } of renderers) {
  const css = (html.match(/<style>([\s\S]*?)<\/style>/) || [, ""])[1]
    .replace(/\/\*[\s\S]*?\*\//g, "");          // comments explain the rule; ignore them
  const hits = css.match(/\b(Canvas|CanvasText|Highlight|HighlightText)\b/g);
  hits ? fail(rel(file), `uses ${[...new Set(hits)].join(", ")} — use a --bg/--label token instead`)
       : pass(rel(file));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("\nevery preload method has an IPC handler");
// A typo here is invisible until a user clicks the thing.
const preload = fs.readFileSync(R("src/preload.js"), "utf8");
// The main process is src/main.js plus the modules in src/main/ it registers
// (the IPC handlers and the state store). Checks that read "main" read all of it,
// so a handler moving between those files can never make a check stop looking.
const MAIN_FILES = ["src/main.js", ...fs.readdirSync(R("src/main"))
  .filter((f) => f.endsWith(".js")).sort().map((f) => `src/main/${f}`)];
const main = MAIN_FILES.map((f) => fs.readFileSync(R(f), "utf8")).join("\n");

// Explore is one page split across plain scripts — explore-*.js, then explore.js
// — that share a global scope. Checks that read "Explore" read all of it, in the
// order explore.html loads it, so moving code between the parts can never make
// a check stop looking.
const EXPLORE = "src/renderer/explore*.js";
const EXPLORE_FILES = [...fs.readFileSync(R("src/renderer/explore.html"), "utf8")
  .matchAll(/<script src="(explore[\w-]*\.js)"/g)].map((m) => `src/renderer/${m[1]}`);
const exploreSrc = EXPLORE_FILES.map((f) => fs.readFileSync(R(f), "utf8")).join("\n");
const readSrc = (f) => (f === EXPLORE ? exploreSrc : fs.readFileSync(R(f), "utf8"));
const channels = [...preload.matchAll(/ipcRenderer\.(invoke|send|on)\(\s*"([^"]+)"/g)]
  .map((m) => ({ kind: m[1], name: m[2] }));
const missing = channels.filter(({ kind, name }) => {
  if (kind === "invoke") return !main.includes(`ipcMain.handle("${name}"`);
  if (kind === "send")   return !main.includes(`ipcMain.on("${name}"`);
  return !main.includes(`"${name}"`);           // main -> renderer push
});
missing.length
  ? fail("preload/main channels", missing.map((m) => `${m.name} (${m.kind})`).join(", "))
  : pass(`${channels.length} channels all wired`);

// ─────────────────────────────────────────────────────────────────────────────
console.log("\nevery polled service has a failure cooldown");
// A TTL that only advances on success turns the poll interval into the retry
// interval. This is how Celestrak rate-limited us.
const POLLED = ["iss.js", "satellites.js", "weather.js", "news.js", "markets.js"];
for (const name of POLLED) {
  const src = fs.readFileSync(R(`src/${name}`), "utf8");
  const guarded = /cool\.blocked|nextTry|backoff/.test(src);
  guarded ? pass(name) : fail(name, "fetches on a timer with no failure backoff");
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("\nno Electron imports outside main and preload");
// Keeps the data modules portable, and keeps the renderer's no-network promise
// honest. Checked because it is easy to break by reflex.
for (const { file, src } of mainFiles) {
  const base = path.basename(file);
  if (base === "main.js" || base === "preload.js") continue;
  /require\(["']electron["']\)/.test(src)
    ? fail(rel(file), "imports electron")
    : pass(rel(file));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("\ni18n keys resolve");
// A missing key renders as nothing, which looks like a layout bug rather than a
// translation bug and gets diagnosed as the wrong thing.
const { strings, LANGUAGES } = await import(pathToFileURL(R("src/i18n.js")).href).then((m) => m.default || m);
const en = strings("en", "en");
for (const { code, name } of LANGUAGES) {
  const t = strings(code, "en");
  const blank = Object.keys(en).filter((k) => !t[k]);
  blank.length ? fail(`${name} (${code})`, `${blank.length} blank: ${blank.slice(0, 4).join(", ")}`)
               : pass(`${name} (${code}) — ${Object.keys(en).length} keys`);
}

/**
 * No key defined twice in one language table.
 *
 * This is invisible at runtime — a later key simply wins — and it is how 27
 * French strings ended up inside the English table and never reached French.
 * The cause was an anchor shared by two languages: `"cold.station": "station"`
 * is spelled identically in English and French, so a scripted insert aimed at
 * one landed in the other. English still resolved correctly, which is exactly
 * why nobody noticed.
 *
 * The blank-value check below cannot catch it either: `strings()` fills gaps
 * from English, so a missing translation is never empty, only wrong.
 */
{
  const src = fs.readFileSync(R("src/i18n.js"), "utf8");
  for (const { code, name } of LANGUAGES) {
    const i = src.indexOf(`const ${code} = {`);
    if (i < 0) continue;
    const table = src.slice(i, src.indexOf("\n};", i));
    const counts = new Map();
    for (const m of table.matchAll(/^\s*"([\w.]+)":/gm)) {
      counts.set(m[1], (counts.get(m[1]) || 0) + 1);
    }
    const dup = [...counts].filter(([, n]) => n > 1).map(([k]) => k);
    dup.length ? fail(`${name} (${code})`, `${dup.length} duplicated: ${dup.slice(0, 4).join(", ")}`)
               : pass(`${name} (${code}) — no duplicates`);
  }
}

// Anything the renderers ask for must exist.
//
// The scripts moved out of the HTML and this check did not follow them, so for
// a while it read four files and scored 92 keys while explore.js alone asked for
// 72 more that nothing verified. Every one of those happened to be defined —
// the discipline held without the check — but a missing key renders as its own
// name, and "chat.privateOnly" appearing in the interface is the exact failure
// this was written to prevent.
const rendererScripts = fs.readdirSync(R("src/renderer"))
  .filter((f) => f.endsWith(".js"))
  .map((f) => fs.readFileSync(R(`src/renderer/${f}`), "utf8"));
const used = new Set();
for (const { html } of renderers) {
  for (const m of html.matchAll(/data-i18n(?:-title|-ph)?="([^"]+)"/g)) used.add(m[1]);
  for (const m of html.matchAll(/\bt\(\s*"([^"]+)"/g)) used.add(m[1]);
}
for (const js of rendererScripts) {
  for (const m of js.matchAll(/\bt\(\s*"([^"]+)"/g)) used.add(m[1]);
}
for (const m of main.matchAll(/t\["([^"]+)"\]/g)) used.add(m[1]);
const unknown = [...used].filter((k) => !(k in en));
unknown.length ? fail("keys used in UI", `not in i18n.js: ${unknown.join(", ")}`)
               : pass(`${used.size} keys referenced, all defined`);

// ─────────────────────────────────────────────────────────────────────────────
console.log("\nshipped files exist");
// docs/ was outside the electron-builder files list, so the legal documents
// opened to an empty window in the packaged app and nowhere else.
const pkg = JSON.parse(fs.readFileSync(R("package.json"), "utf8"));
// Negations are exclusions, not files, so "does it exist" is the wrong question
// — a `!` pattern is doing its job precisely when the path is absent.
const literals = pkg.build.files.filter((f) => !f.includes("*") && !f.startsWith("!"));
for (const f of literals) {
  // Ask git rather than guess. Everything in build.files that is generated is
  // also gitignored -- the crawl output, the sky, the icons -- so "does git
  // ignore this" is the same question as "is this generated", and it does not
  // need a list to be kept in step. The first version pattern-matched
  // `data/*.json` and missed assets/sky.json, which turned the first CI run red.
  let generated = false;
  try {
    execFileSync("git", ["check-ignore", "-q", f], { cwd: R("."), stdio: "ignore" });
    generated = true;
  } catch { /* not ignored, so it is genuinely missing */ }
  // Skipped in CI, where nothing has been crawled. Never when packaging: on
  // 18 September a build shipped without data/stations.min.json and opened to
  // "0 places" everywhere. `npm run dist` passes --release, so there it fails.
  if (fs.existsSync(R(f))) pass(f);
  else if (generated && RELEASE) fail("build.files", `${f} is generated and missing; a release would ship without it`);
  else if (generated) skip(f, "generated by the crawl, gitignored");
  else fail("build.files", `${f} is listed but missing`);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("\nno duplicated blocks");
// A scripted edit used an anchor that matched in three places, so the four-line
// boot sequence — applyPrefs, applyPalette, applyStrings — was pasted into
// toggleFav and showFavorites as well. Both still worked, just slower and with a
// full re-theme on every star click, which is why it survived review and a
// release. Verbatim repetition of a real block of logic is the signature.
const BLOCK = 5;
const boring = (l) => {
  const t = l.trim();
  return !t || "{}()[]});".includes(t) || t.startsWith("//") || t.startsWith("*")
      || t.startsWith("/*") || t.length < 8;
};
for (const { file, html } of renderers) {
  const js = html.match(/<script>([\s\S]*)<\/script>\s*<\/body>/)?.[1] ?? "";
  const lines = js.split("\n");
  const at = new Map();
  for (let i = 0; i + BLOCK <= lines.length; i++) {
    const blk = lines.slice(i, i + BLOCK);
    if (blk.some(boring)) continue;              // only blocks that are all real code
    const key = blk.join("\n");
    at.set(key, [...(at.get(key) ?? []), i + 1]);
  }
  const dupes = [...at.entries()].filter(([, v]) => v.length > 1);
  dupes.length
    ? fail(rel(file), `${BLOCK}+ identical lines at ${dupes[0][1].join(", ")}: ${dupes[0][0].split("\n")[0].trim().slice(0, 60)}`)
    : pass(rel(file));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("\nshortwave schedule is current");
// The schedule is per-season and committed, so it goes wrong on a date rather
// than on a code change: on the last Sunday in October the A-season file starts
// describing broadcasts that have moved. Nothing would fail — the app would just
// tune confidently to the wrong frequencies, which is worse.
{
  const sched = JSON.parse(fs.readFileSync(R("data/schedule.json"), "utf8"));
  const now = new Date();
  const y = now.getUTCFullYear();
  const lastSun = (month) => {
    const d = new Date(Date.UTC(y, month + 1, 0));
    d.setUTCDate(d.getUTCDate() - d.getUTCDay());
    return d;
  };
  const summer = now >= lastSun(2) && now < lastSun(9);
  const yy = String((summer ? y : now.getUTCMonth() >= 9 ? y : y - 1) % 100).padStart(2, "0");
  const want = `${summer ? "A" : "B"}${yy}`;
  sched.season === want
    ? pass(`${sched.season}, ${sched.entries.length} broadcasts, built ${sched.built}`)
    : fail("data/schedule.json", `season ${sched.season}, but it is now ${want} — run \`npm run schedule\``);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("\nthird-party notices are current");
// MIT requires the copyright notice to travel with the code, and this app
// shipped five MIT libraries with none until scripts/notices.mjs was written.
// The generator is the fix; this is what stops it rotting the next time a
// dependency moves. It regenerates in memory and compares.
{
  const r = spawnSync(process.execPath, [R("scripts/notices.mjs"), "--check"],
                      { cwd: ROOT, encoding: "utf8" });
  const out = ((r.stdout || "") + (r.stderr || "")).trim();
  if (r.status === 0) pass(out.replace(/^ok\s+/, "") || "THIRD-PARTY-NOTICES.md");
  else fail("THIRD-PARTY-NOTICES.md", out || "notices --check failed");
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("\ndesign tokens are not bypassed");
// Thirteen distinct corner radii had accumulated across the renderers before
// they were collapsed onto a five-step scale. Nothing stops the fourteenth
// except this: a literal radius is almost always someone reaching past the
// scale rather than genuinely needing a new value.
//
// Two literals stay legal. `50%` is a circle, which is not a radius on the
// scale, and `1px` is the meter bar, which is two pixels wide.
{
  const ALLOWED = new Set(["50%", "1px"]);
  const offenders = [];
  for (const { file, html } of renderers) {
    const name = path.basename(file);
    html.split("\n").forEach((line, i) => {
      if (/--r-(sm|md|lg|xl|pill):/.test(line)) return;   // the scale itself
      for (const m of line.matchAll(/border-radius:\s*([0-9]+(?:px|%))/g)) {
        if (!ALLOWED.has(m[1])) offenders.push(`${name}:${i + 1} ${m[1]}`);
      }
    });
  }
  offenders.length
    ? fail("corner radius", `off the scale — use var(--r-sm|md|lg|xl|pill): ${offenders.join(", ")}`)
    : pass("every corner radius comes from the scale");
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("\nlight theme agrees with itself");
// Light lives in two blocks in every renderer: a prefers-color-scheme media
// query, used when the theme is "system" on a light Mac, and a
// [data-theme="light"] selector, used when light is chosen explicitly. They
// have to hold identical values or the same setting looks different depending
// on how you arrived at it.
//
// This has drifted three times. Twice a new token was added to one block only
// and silently inherited the dark value; once an entire block was left on the
// old Apple palette, so choosing Light gave a different app than a light Mac on
// System. Cheaper to check than to notice.
{
  const TOKENS = (block) =>
    Object.fromEntries([...block.matchAll(/(--[\w-]+):\s*([^;]+);/g)]
      .map((m) => [m[1], m[2].trim()]));
  const drift = [];
  for (const { file, html } of renderers) {
    const name = path.basename(file);
    // Every matching block, merged, not the first one. A theme's values are
    // allowed to live in more than one rule -- `color-scheme` has its own
    // one-liner -- and matching only the first made this compare a token block
    // against a single declaration and report ninety false differences.
    const all = (re) => {
      const merged = {};
      for (const m of html.matchAll(re)) Object.assign(merged, TOKENS(m[1]));
      return merged;
    };
    const a = all(/@media \(prefers-color-scheme: light\)\{\s*\n\s*:root:not\(\[data-theme="dark"\]\)\{([\s\S]*?)\n\s*\}/g);
    // \{\s*\n skips the `{ color-scheme: light; }` one-liner: with no newline
    // before its brace, the lazy match ran on into the dark base block.
    const b = all(/:root\[data-theme="light"\]\{\s*\n([\s\S]*?)\n\s*\}/g);
    if (!Object.keys(a).length || !Object.keys(b).length) continue;
    // Tokens that exist only under an explicit theme are not drift: the motion
    // and radius scales are appearance-independent and live in the base :root.
    for (const k of Object.keys(b)) if (!(k in a) && !/^--(r-|ease|dur)/.test(k)) a[k] = a[k];
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (/^--(r-|ease|dur|color-scheme)/.test(k)) continue;   // appearance-independent
      if ((a[k] ?? "") !== (b[k] ?? "")) {
        drift.push(`${name} ${k}: system=${a[k] ?? "absent"} explicit=${b[k] ?? "absent"}`);
      }
    }
  }
  drift.length
    ? fail("light theme", `the two light blocks disagree — ${drift.join("; ")}`)
    : pass("every renderer's two light blocks hold the same values");
}

// ── search folds the decimal comma ───────────────────────────────────────────
// Two lines inside norm() carry this, and breaking them fails silently: search
// keeps working, it just stops finding anything for most of the world. The six
// countries with the most frequencies in their station names all write 104,9.
{
  console.log("\nsearch finds a frequency written either way");
  const cat = await import("../src/catalog.js").then((m) => m.default ?? m);
  if (!cat.load()) {
    skip("decimal comma", "data/stations.min.json is gitignored — runs locally");
  } else {
    const ids = (q) => cat.search(q, 60).map((x) => x.id).join(",");
    const bad = ["88.5", "101.1", "104.9"].filter((f) => ids(f) !== ids(f.replace(".", ",")));
    bad.length
      ? fail("decimal comma", `${bad.join(", ")} return different results with a comma`)
      : pass("104.9 and 104,9 return the same stations");
  }
}

// ── one English, not two ─────────────────────────────────────────────────────
// The app shipped "Open source licences" next to "favorite" and "catalog". Not
// wrong either way, but a product that cannot decide reads as one nobody is
// looking after. American, because that is what the default locale already
// mostly was and where the maintainer is.
//
// Scoped to the English block only. "Licences", "analyse" and "centre" are
// correct in the French strings and "Analyse" is correct in the German ones, so
// checking the whole file would demand breaking four translations.
{
  console.log("\nthe English strings speak one English");
  const src = fs.readFileSync(R("src/i18n.js"), "utf8");
  const en = src.slice(src.indexOf('"app.'), src.indexOf('"set.colour": "Temas"'));
  const BRIT = /\b(licence|licences|colour|colours|favourite|favourites|catalogue|centre|analyse|behaviour|organise|recognise)\b/gi;
  const found = new Set();
  for (const m of en.matchAll(/":\s*"((?:[^"\\]|\\.)*)"/g)) {
    for (const hit of m[1].match(BRIT) || []) found.add(hit.toLowerCase());
  }
  found.size
    ? fail("spelling", `British spellings in the English strings: ${[...found].join(", ")}`)
    : pass("no British spellings in the English strings");
}

// ── the star survives the light theme ────────────────────────────────────────
// Every palette's `star` is a near-white chosen to sit on the night side of a
// globe, so on the light background they measure 1.01 to 1.40:1 -- invisible.
// Both renderers must branch --star on the theme, the way they already do for
// --accent. This is a structural check, not a contrast one: the measurement is
// in the transcript, and what regresses is somebody simplifying the assignment.
{
  console.log("\nthe favourite star survives the light theme");
  let bad = [];
  for (const f of ["src/renderer/popover.html", "src/renderer/explore.html"]) {
    const html = fs.readFileSync(R(f), "utf8");
    const m = html.match(/setProperty\("--star",\s*([^)]+)\)/);
    if (!m) continue;                       // renderer does not set it at all
    if (!/light\s*\?/.test(m[1])) bad.push(`${f.split("/").pop()}: ${m[1].trim()}`);
  }
  bad.length
    ? fail("star contrast", `--star is set without a light-theme branch — ${bad.join("; ")}`)
    : pass("--star branches on the theme in every renderer that sets it");
}

// ── nothing throws into the void ─────────────────────────────────────────────
// Every renderer must load errors.js, and load it first. Before it existed there
// was not one `error` or `unhandledrejection` listener in the app: fitHeight
// threw on every call for two days, the menu bar panel silently stopped resizing
// itself, and it was found by a person noticing a gap rather than by anything
// reporting it.
{
  console.log("\nevery renderer catches its own errors");
  const bad = [];
  for (const f of fs.readdirSync(R("src/renderer")).filter((f) => f.endsWith(".html"))) {
    const html = fs.readFileSync(R(`src/renderer/${f}`), "utf8");
    const scripts = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => m[1]);
    if (!scripts.includes("errors.js")) bad.push(`${f} does not load it`);
    else if (scripts[0] !== "errors.js") bad.push(`${f} loads ${scripts[0]} first`);
  }
  bad.length
    ? fail("error capture", bad.join("; "))
    : pass("all renderers load errors.js before anything else");
}

// ── main owns its own state ──────────────────────────────────────────────────
// Every renderer that calls state:set does read-then-write-whole, so any key it
// does not own gets overwritten with a stale copy. The allowlist is what stops
// that, and it also keeps prefs from being writable through a channel that does
// not validate them.
{
  console.log("\nstate:set only accepts keys the renderers own");
  const src = main;
  const list = src.match(/const RENDERER_KEYS = \[([^\]]*)\]/);
  // Indentation-tolerant: the handler is inside ipc-app.js's register().
  const handler = src.match(/ipcMain\.handle\("state:set"[\s\S]{0,1200}?\n\s*\}\);/);
  const problems = [];
  if (!list) problems.push("RENDERER_KEYS is gone");
  else {
    for (const owned of ["prefs", "layers"]) {
      if (list[1].includes(`"${owned}"`)) problems.push(`${owned} is in RENDERER_KEYS but main owns it`);
    }
  }
  if (!handler) problems.push("state:set handler not found");
  else if (!/RENDERER_KEYS/.test(handler[0])) problems.push("state:set does not use the allowlist");

  /**
   * And every writer sends a patch, never its own copy of everything.
   *
   * This is the rule that once lost a user's favorites. Two windows write state,
   * the popover read it once at launch and never again, and `persist()` sent
   * that whole boot-time object back on every volume change — quietly restoring
   * a stale `favorites` array over the one Explore had just saved. The handler
   * is not what failed; it merged exactly what it was given. What failed was
   * being given a snapshot instead of a change.
   *
   * An object literal at the call site is the difference, and it is checkable.
   */
  for (const f of fs.readdirSync(R("src/renderer")).filter((n) => n.endsWith(".js"))) {
    const js = fs.readFileSync(R(`src/renderer/${f}`), "utf8");
    for (const m of js.matchAll(/setState\(\s*([^)]{0,40})/g)) {
      const arg = m[1].trim();
      // An object literal, and not one that just re-spreads the window's own
      // state — `{...state}` is the same snapshot wearing braces.
      if (!arg.startsWith("{") || /\.\.\.\s*state\b/.test(arg)) {
        problems.push(`${f} calls setState(${arg.slice(0, 20)}…) — send a patch, not a snapshot`);
      }
    }
  }
  // The other windows have to hear about it, or they keep building on a copy
  // that is already out of date.
  if (handler && !/broadcast\(/.test(handler[0])) {
    problems.push("state:set does not tell the other windows what changed");
  }

  problems.length
    ? fail("state:set", problems.join("; "))
    : pass("state:set merges an allowlist, renderers send patches, and changes are broadcast");
}

// ── the favorite handshake can actually be sent ───────────────────────────────
// wrap() refused an empty body, which is right for a chat message and wrong for
// the favorite signal — that one is a `fav` tag and nothing else, deliberately.
// So every favorite recorded its local half and silently never told the other
// person, mutual status was unreachable for anybody, and nothing logged a thing.
// Unit-testing wrap() in isolation would not have caught it; it returns null
// entirely correctly for the arguments it was handed. It took a real envelope
// through a real relay.
{
  console.log("\na bodiless private envelope still sends when it carries tags");
  const priv = await import(pathToFileURL(R("src/nostr-private.js")).href)
    .then((m) => m.default ?? m);
  const { schnorr } = await import("@noble/curves/secp256k1.js");
  const sk = schnorr.utils.randomSecretKey();
  const to = Buffer.from(schnorr.getPublicKey(schnorr.utils.randomSecretKey())).toString("hex");
  const problems = [];
  if (!priv.wrap("", to, sk, [["fav", "1"]])) problems.push("a fav signal cannot be wrapped");
  if (priv.wrap("", to, sk, [])) problems.push("an empty message with no tags is being sent");
  problems.length
    ? fail("favorite handshake", problems.join("; "))
    : pass("a fav tag with no words sends; an empty message with nothing in it does not");
}

// ── every chat channel goes through one funnel ────────────────────────────────
// Muted, filtered and only-people-you-keep are three separate rules, and they
// were briefly applied by hand at each send site — one `muted.filter()` per
// channel, with nothing making a fourth channel remember to do the same. That is
// how a safety rule ships covering two of three surfaces. `visible()` is the
// funnel; nothing outside it may filter a chat list.
{
  console.log("\nevery chat channel is filtered in one place");
  const src = main;
  const problems = [];
  if (!/function visible\(list\)/.test(src)) problems.push("visible() is gone");
  // Anything sending a chat payload has to hand it to visible() on the way.
  for (const ch of ["presence:messages", "presence:notes", "presence:dms"]) {
    const sends = [...src.matchAll(new RegExp(`"${ch}"\\s*,\\s*([^)\\n]*)`, "g"))].map((m) => m[1]);
    for (const arg of sends) {
      if (/\bvisible\(|\bclean\b/.test(arg)) continue;
      problems.push(`${ch} is sent unfiltered: ${arg.trim().slice(0, 40)}`);
    }
  }
  // The funnel itself is the only legitimate caller of muted.filter. Counted
  // with comments stripped, because the paragraph above visible() explains the
  // bug by naming the call and would otherwise fail its own check.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const raw = [...code.matchAll(/muted\.filter\(/g)].length;
  if (raw !== 1) problems.push(`muted.filter called ${raw}× outside comments — only visible() should`);
  problems.length
    ? fail("chat funnel", problems.join("; "))
    : pass("messages, notes and private messages all pass through visible()");
}

// ── the composer does not throw away what somebody typed ─────────────────────
// `input.value = ""` used to run *before* the command did, so every command that
// failed on a name it could not resolve deleted the message with it. Typing
// `/msg gal <a paragraph>` with the name slightly wrong lost the paragraph.
//
// Checked structurally rather than by running the renderer: inside the submit
// handler, the clear must not appear before `cmd.run`. A comment cannot enforce
// an ordering, and this ordering is the whole bug.
{
  console.log("\nthe composer keeps your words when a command fails");
  const src = exploreSrc;
  const start = src.indexOf('$("chatform").onsubmit');
  const problems = [];
  if (start < 0) problems.push("the submit handler is gone");
  else {
    const body = src.slice(start, start + 3000);
    // The invariant, stated exactly: between looking a command up and running
    // it, nothing may clear the input. Anything looser measures the private
    // branch above — which clears correctly, after a successful send — and this
    // check's own first two attempts both failed that way.
    const look = body.indexOf("COMMANDS[");
    const run = body.indexOf("cmd.run(", look < 0 ? 0 : look);
    if (look < 0 || run < 0) problems.push("nothing dispatches a command");
    else if (/input\.value\s*=\s*""/.test(body.slice(look, run))) {
      problems.push("input is cleared before the command runs — a failed command loses the message");
    }
    // And the private path has to exist, or every DM is a public message.
    if (!/dmWith\s*&&\s*!text\.startsWith\("\/"\)/.test(body)) {
      problems.push("nothing routes a private conversation to dmSend");
    }
  }
  problems.length
    ? fail("composer", problems.join("; "))
    : pass("a command runs before the input is cleared, and a private thread sends privately");
}

// ── the radio comes out of one place, whichever kind it is ───────────────────
// Two things make sound here: an <audio> element for streams and an AudioContext
// for shortwave. Routing only the first is the failure that looks like a working
// feature — the music moves to the kitchen speaker and the shortwave keeps
// playing out of the laptop, and the person reasonably concludes the app is
// broken rather than that half of it was wired.
{
  console.log("\nchoosing an output moves both kinds of audio");
  const src = fs.readFileSync(R("src/renderer/popover.js"), "utf8");
  const problems = [];
  const i = src.indexOf("async function applyOutput(");
  if (i < 0) problems.push("applyOutput is gone");
  else {
    const body = src.slice(i, src.indexOf("\n}", i));
    if (!/audio\.setSinkId/.test(body)) problems.push("streams do not follow the choice");
    if (!/audioCtx.*setSinkId/.test(body)) problems.push("shortwave does not follow the choice");
  }
  // A context made later has to be told too, or shortwave started after the
  // choice comes out of the wrong speaker.
  if (!/audioCtx = audioCtx \|\| new AudioContext\(\)[\s\S]{0,300}?setSinkId/.test(src)) {
    problems.push("a shortwave session started after the choice ignores it");
  }
  problems.length
    ? fail("audio output", problems.join("; "))
    : pass("both the stream element and the shortwave context follow the chosen output");
}

// ── a profile lookup asks about one person, never a room ─────────────────────
// Every subscription in this app asks relays for everything and filters locally,
// so no relay learns which cell anybody cares about. A profile fetch is the one
// place that is easy to undo by accident: `{kinds:[0], authors:[…]}` is efficient
// and correct-looking, and the author list *is* the set of people in your cell.
// One author per request, and only when somebody asks.
{
  console.log("\na profile lookup names one person, not a room");
  const src = fs.readFileSync(R("src/presence-nostr.js"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const problems = [];
  const i = src.indexOf("function lookupProfile(");
  if (i < 0) problems.push("lookupProfile is gone");
  else {
    const body = src.slice(i, src.indexOf("\n}", i));
    if (!/authors: \[pubkey\]/.test(body)) {
      problems.push("the request does not name exactly one author");
    }
    if (/authors: \[\.\.\.|authors: \[…\]|\.map\(|Object\.keys|peers/.test(body)) {
      problems.push("the request builds its author list from a collection");
    }
  }
  // And nothing anywhere else may subscribe to kind 0 in bulk.
  for (const m of src.matchAll(/kinds: \[0\][^}]*/g)) {
    if (!/authors: \[pubkey\]/.test(m[0])) problems.push(`a kind-0 subscription does not name one author: ${m[0].slice(0, 50)}`);
  }
  problems.length
    ? fail("profile lookup", problems.join("; "))
    : pass("profiles are fetched one person at a time, only when asked");
}

// ── typing a frequency is not a scanner ──────────────────────────────────────
// A frequency box is exactly the feature that invites automated sweeping, and
// this project has already knocked three receivers offline. The answer is built
// from data already on the machine — the schedule, the space weather, the
// receiver list — and exactly one connection is made, when a person picks a
// receiver. Also checks the parser, because "forgiving input" is where a tuner
// quietly sends somebody to the wrong end of the spectrum.
{
  console.log("\ntyping a frequency answers from local data and dials once");
  const src = exploreSrc;
  const problems = [];

  const i = src.indexOf("async function showFrequency(");
  if (i < 0) problems.push("showFrequency is gone");
  else {
    const body = src.slice(i, src.indexOf("\n}\n", i));
    for (const call of ["tunerStart", "tuneSdr"]) {
      const n = (body.match(new RegExp(call + "\\(", "g")) || []).length;
      if (n > 1) problems.push(`${call}() appears ${n}x — a frequency must dial at most one receiver`);
    }
    // The lookup itself must not reach for a radio at all.
    const clickAt = body.indexOf("const go = ()");
    const beforeClick = clickAt < 0 ? body : body.slice(0, clickAt);
    if (/tunerStart\(|tuneSdr\(/.test(beforeClick)) {
      problems.push("the lookup connects to a receiver before anybody chose one");
    }
  }

  // The parser, against what people actually type.
  const start = src.indexOf("function parseKHz(");
  if (start < 0) problems.push("parseKHz is gone");
  else {
    const fn = new Function(`${src.slice(start, src.indexOf("\n}", start) + 2)}; return parseKHz;`)();
    const cases = [["7850", 7850], ["7.850", 7850], ["7,850", 7850], ["7850 kHz", 7850],
                   ["7.850 MHz", 7850], ["7", 7000], ["4625", 4625],
                   ["0", null], ["abc", null], ["30001", null], ["-500", null]];
    for (const [input, want] of cases) {
      const got = fn(input);
      if (got !== want) problems.push(`parseKHz(${JSON.stringify(input)}) = ${got}, expected ${want}`);
    }
  }
  problems.length
    ? fail("tune by frequency", problems.join("; "))
    : pass("a frequency is answered from local data, parsed forgivingly, and dials one receiver");
}

// ── a hub is the pair, and only the pair ─────────────────────────────────────
// Two people who type the same name and password must land in the same room, and
// anything less than the same pair must land somewhere else. Every one of these
// is a way the feature could look like it works while being either broken or a
// lie about privacy: a name that decides the room on its own, a password that is
// ignored, a ciphertext that opens in the wrong room.
{
  console.log("\na hub is its name and its password together");
  const problems = [];
  try {
    const hub = await import(pathToFileURL(R("src/hub.js")).href).then((m) => m.default ?? m);
    const a = hub.derive("Radio Club", "shortwave-2026");

    if (!a) problems.push("a valid pair produced no room");
    else {
      // Written differently, same room. People type untidily and must still meet.
      const messy = hub.derive("  radio   CLUB ", "shortwave-2026");
      if (messy?.tag !== a.tag) problems.push("the same pair typed untidily lands in a different room");

      // Change either half and it is a different room.
      const otherPw = hub.derive("Radio Club", "shortwave-2025");
      const otherNm = hub.derive("Radio Clubb", "shortwave-2026");
      if (otherPw?.tag === a.tag) problems.push("the password does not decide the room");
      if (otherNm?.tag === a.tag) problems.push("the name does not decide the room");

      // The published half must not be the secret half.
      if (a.tag.includes(Buffer.from(a.key).toString("hex").slice(0, 16))) {
        problems.push("the public tag leaks the key");
      }

      const sealed = hub.seal("meet on 7.200", a);
      if (hub.open(sealed, a) !== "meet on 7.200") problems.push("a hub cannot read its own message");
      if (hub.open(sealed, otherPw) !== null) problems.push("the wrong password can read it");
      if (hub.open(sealed, otherNm) !== null) problems.push("a ciphertext opens in another room");
      if (hub.open(sealed.slice(0, -4) + "AAAA", a) !== null) problems.push("a tampered message still opens");
    }
    // A hub with only half a pair is a public channel wearing a disguise.
    if (hub.derive("named", "")) problems.push("a hub with no password was allowed");
    if (hub.derive("", "worded")) problems.push("a hub with no name was allowed");
  } catch (err) {
    problems.push(`hub.js would not run: ${err.message}`);
  }
  problems.length
    ? fail("hubs", problems.join("; "))
    : pass("the same pair meets, anything else does not, and no ciphertext travels between rooms");
}

// ── what we publish says who we are and paid to be heard ─────────────────────
// A five-minute census of live geohash traffic found 104 people present and
// every self-identifying event saying `glub.chat`. AuralFM had a client tag, but
// only on kind 20808 — an event nobody else parses — so it announced itself to
// no one. And clients on this network offer a proof-of-work filter, so an
// unmined message is one they may simply never render.
//
// Signs a real event through the real module and checks the result the way a
// relay would, because the failure that matters is not a missing tag: it is
// mining that changes the tags after the id is computed, which produces an event
// every relay rejects and nothing local would notice.
{
  console.log("\nevery event we publish is identified and mined");
  const problems = [];
  const slow = [];
  // 20,000 hashes take about 40 ms here on a quiet day. Ten times that, and the
  // processor is somebody else's for now.
  const starved = () => { const t = performance.now(); for (let i = 0; i < 20000; i++) createHash("sha256").update(`audit ${i} ${"x".repeat(180)}`).digest(); return performance.now() - t > 400; };
  try {
    const nostr = await import(pathToFileURL(R("src/presence-nostr.js")).href)
      .then((m) => m.default ?? m);
    const { schnorr } = await import("@noble/curves/secp256k1.js");
    const crypto = await import("node:crypto");
    const B = (h) => Uint8Array.from(Buffer.from(h, "hex"));

    const sent = [];
    class Capture {
      constructor() { this.readyState = 1; setTimeout(() => this.onopen?.(), 0); }
      send(d) { const f = JSON.parse(d); if (f[0] === "EVENT") sent.push(f[1]); }
      close() { this.readyState = 3; }
    }
    const realWs = globalThis.WebSocket;
    globalThis.WebSocket = Capture;
    try {
      nostr.join(19.4326, -99.1332, "audit");
      await new Promise((r) => setTimeout(r, 400));
      nostr.say("audit");
      nostr.drop("audit");
      await new Promise((r) => setTimeout(r, 200));
      nostr.leave();
    } finally { globalThis.WebSocket = realWs; }

    const kinds = new Map();
    for (const e of sent) kinds.set(e.kind, e);
    if (!kinds.size) problems.push("nothing was published at all");
    for (const [kind, e] of kinds) {
      const client = (e.tags.find((t) => t[0] === "client") || [])[1];
      if (client !== "auralfm") problems.push(`kind ${kind} does not say who sent it`);
      // Mining is capped at 1.5 s; past it the event goes out with no nonce tag.
      // That is the design, and on a starved machine it is what happens (this
      // check failed three times in three days at a load average over 200,
      // with nothing wrong). So an unmined event is a fault only if it claims
      // a difficulty it does not have, or if this machine is quick enough
      // that the cap should never have been reached.
      const bits = nostr.powBits(e.id), claims = e.tags.some((t) => t[0] === "nonce");
      if (bits < 12 && (claims || !starved())) problems.push(`kind ${kind} mined to only ${bits} bits${claims ? ", and says otherwise" : ""}`);
      else if (bits < 12) slow.push(kind);
      // The id must match the tags actually sent. Mining rewrites tags, and an
      // id computed before that rewrite is an event every relay drops.
      const serial = JSON.stringify([0, e.pubkey, e.created_at, e.kind, e.tags, e.content]);
      if (crypto.createHash("sha256").update(serial).digest("hex") !== e.id) {
        problems.push(`kind ${kind} has an id that does not match its own tags`);
      }
      let ok = false;
      try { ok = schnorr.verify(B(e.sig), B(e.id), B(e.pubkey)); } catch { ok = false; }
      if (!ok) problems.push(`kind ${kind} carries an invalid signature`);
    }
  } catch (err) {
    problems.push(`could not exercise the signer: ${err.message}`);
  }
  problems.length ? fail("client tag and proof of work", problems.join("; "))
    : slow.length ? skip("proof of work", `this machine is too busy to mine inside the 1.5 s cap (kind ${slow.join(", ")} went out unmined and untagged, as designed)`)
    : pass("every published kind names auralfm, mines to 12 bits, and still verifies");
}

// ── the renderer is told once per burst, not once per packet ─────────────────
// Every inbound event used to hand the renderer a freshly built copy of the whole
// list it belonged to. Measured against live relays for fifteen seconds: 2,939
// onPeers calls carrying 1,245,312 objects. In Electron each one is a structured
// clone across a process boundary, and they queue *ahead of* whatever the
// renderer asked for next — which is why presenceStats() took twelve seconds
// right after tuning and the chat looked dead exactly when somebody opened it.
//
// The rule that keeps it fixed: nothing calls a renderer callback directly.
// Inbound paths mark a list dirty and one flush sends it.
{
  console.log("\nthe renderer is updated per burst, not per event");
  const src = fs.readFileSync(R("src/presence-nostr.js"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const problems = [];
  const i = src.indexOf("function flush()");
  if (i < 0) problems.push("flush() is gone — updates are no longer coalesced");
  else {
    const body = src.slice(i, src.indexOf("\n}", i));
    const inside = (body.match(/\bon(?:Peers|Messages|Notes|Dms)\(/g) || []).length;
    const total = (src.match(/\bon(?:Peers|Messages|Notes|Dms)\(/g) || []).length;
    if (inside !== 4) problems.push(`flush() sends ${inside} of the 4 lists`);
    if (total > inside) {
      problems.push(`${total - inside} renderer callback(s) invoked outside flush() — a burst will flood IPC`);
    }
    if (!/setTimeout\(flush,/.test(src)) problems.push("nothing schedules a flush");
  }
  problems.length
    ? fail("update coalescing", problems.join("; "))
    : pass("every renderer update goes through one flush, so a burst costs one message");
}

// ── a room never carries a conversation ──────────────────────────────────────
// Rooms are scoped to a place and stop meaning anything when you tune away.
// Private messages are scoped to a person and follow you everywhere. Merged into
// one column, a message meant for one person appeared in every room's log and
// travelled from city to city: a PRIVATE line was seen
// sitting in a city it had nothing to do with. The two scopes stay apart.
{
  console.log("\nthe room log carries the room, not private conversations");
  const src = exploreSrc;
  const problems = [];
  const i = src.indexOf("const merged = (");
  if (i < 0) problems.push("the log's merge is gone or renamed");
  else {
    const block = src.slice(i, i + 1400);
    // The room is the last branch — whatever follows the final `: [`.
    const room = block.slice(block.lastIndexOf(": ["));
    for (const [name, why] of [
      ["dmCache", "private messages will show in every room"],
      ["hubCache", "a private hub's messages will show in every room"],
    ]) {
      if (new RegExp(name).test(room)) problems.push(`the room branch merges ${name} — ${why}`);
    }
    if (!/dmCache\.filter\(/.test(block)) {
      problems.push("the conversation branch does not filter dmCache to one person");
    }
  }
  // And the drawer has to exist to reach them, or they are unreachable.
  for (const fn of ["function conversations(", "function paintDmButton(", "function openConvos("]) {
    if (!src.includes(fn)) problems.push(`${fn}) is gone`);
  }
  problems.length
    ? fail("room vs conversation", problems.join("; "))
    : pass("the room shows the room; conversations live behind their own count");
}

// ── what the app says survives the next message ──────────────────────────────
// systemLine() appended straight into #chatlog, and repaintLog() empties that
// element and rebuilds it from the caches. So every explanation the chat gave
// lasted until the next inbound message: "Nobody here called gal" could vanish a
// second after it appeared, which made the app least articulate exactly when it
// had most to say. It has to live in a cache and be merged like any other kind.
{
  console.log("\nwhat the app says outlives the next repaint");
  const src = exploreSrc;
  const problems = [];
  const fn = src.slice(src.indexOf("function systemLine("), src.indexOf("function systemLine(") + 500);
  if (!src.includes("function systemLine(")) problems.push("systemLine is gone");
  else {
    if (/\.append\(|createElement\(/.test(fn)) {
      problems.push("systemLine writes to the DOM — repaintLog will erase it");
    }
    if (!/systemCache\.push\(/.test(fn)) problems.push("systemLine does not record what it said");
  }
  // And the repaint has to put them back, in both views.
  const rp = src.slice(src.indexOf("function repaintLog("), src.indexOf("function repaintLog(") + 2600);
  if (!/systemCache\.map\(/.test(rp)) problems.push("repaintLog does not merge systemCache");
  // Clearing the log without clearing the cache is a Clear that clears nothing.
  for (const site of ['"/clear"', "async function panicWipe("]) {
    const i = src.indexOf(site);
    if (i < 0) { problems.push(`${site} is gone`); continue; }
    if (!/clearSystemLines\(\)/.test(src.slice(i, i + 700))) {
      problems.push(`${site} empties the log but not systemCache`);
    }
  }
  problems.length
    ? fail("system lines", problems.join("; "))
    : pass("system lines are cached, repainted in both views, and cleared with the log");
}

// ── a note is not duplicated by sweeping the globe ───────────────────────────
// The three inbound lists — chat, notes, private messages — shared one seen-set,
// and they do not share a lifetime. `view()` empties the chat whenever the
// selection moves, so it cleared that set; the notes list survives a view change
// and was still holding its notes. The next subscription replayed them, the set
// no longer recognised them, and each one was appended again.
//
// Seen as seven identical notes from a stranger who had said "hola"
// once. Six selection changes, six extra copies. Nothing static would have found
// this: every function here is correct on its own, and the defect only exists in
// the order they run in.
//
// So this drives the real module against a relay that does the one thing that
// matters — serves what it has stored to every REQ it receives. No network: the
// fake is installed as `globalThis.WebSocket`, which is what `connect()` dials.
{
  console.log("\nsweeping the globe does not duplicate a note");
  const LAT = 38.72, LON = -9.14;
  let NOTE = null;

  class FakeRelay {
    constructor() { this.readyState = 1; setTimeout(() => this.onopen?.(), 0); }
    send(data) {
      let f;
      try { f = JSON.parse(data); } catch { return; }
      if (f[0] !== "REQ" || !NOTE) return;
      const [, subId, filter] = f;
      if (!(filter.kinds || []).includes(1)) return;      // not the notes subscription
      setTimeout(() => this.onmessage?.({ data: JSON.stringify(["EVENT", subId, NOTE]) }), 0);
    }
    close() { this.readyState = 3; this.onclose?.(); }
  }

  const realWs = globalThis.WebSocket;
  globalThis.WebSocket = FakeRelay;
  /**
   * Wait for the condition, never for the clock.
   *
   * This check has now been wrong twice for the same reason. First it slept
   * 140ms for a note that arrives after a coalescing flush; widening it to a
   * fixed 400ms then made it *flaky* — passing or failing depending on how long
   * eight sockets and a 599-relay distance sort happened to take. A check that
   * goes green on a re-run is worse than one that fails, because it teaches
   * everyone to re-run instead of to look.
   *
   * So: poll for what is being asserted, with a deadline long enough that only a
   * real failure reaches it. The duplicate this exists to catch is a *count*,
   * and a count is still wrong however long you wait for it.
   *
   * Third time: polling was right, four seconds was not. This went red three
   * times in one day and passed on every re-run, which is precisely the pattern
   * the paragraph above says is worse than failing. It reproduced immediately
   * with all eight cores pinned — nothing here touches the network, so what it
   * was measuring was how much CPU this process could get, not whether the note
   * arrived.
   *
   * A deadline is a statement about the machine, not about the code. Since a
   * generous one costs nothing on a green run — the poll returns the moment the
   * condition holds — the only thing a short deadline buys is a faster answer on
   * a genuine failure, which is not worth a check that cries wolf.
   */
  const settle = async (want, deadlineMs = 20000) => {
    const until = Date.now() + deadlineMs;
    while (Date.now() < until) {
      if (want()) return true;
      await new Promise((r) => setTimeout(r, 25));
    }
    return false;
  };
  const tick = (ms = 260) => new Promise((r) => setTimeout(r, ms));
  let seen = [];
  let counted = null;
  try {
    const nostr = await import(pathToFileURL(R("src/presence-nostr.js")).href)
      .then((m) => m.default ?? m);
    nostr.onNotes((list) => { seen = list; });
    NOTE = {
      id: "a".repeat(64),
      // A stranger's key, or it is discarded as our own echoed back.
      pubkey: "b".repeat(64),
      kind: 1,
      created_at: Math.floor(Date.now() / 1000),
      tags: [["g", nostr.geohash(LAT, LON)], ["n", "yuls"]],
      content: "hola",
    };
    nostr.join(LAT, LON, "test");
    await settle(() => seen.length >= 1);
    const afterJoin = seen.length;
    // Six selection changes, which is a few seconds of spinning the globe with
    // the listening lock off.
    for (const [la, lo] of [[35.68, 139.69], [-22.9, -43.2], [51.5, -0.12],
                            [40.7, -74.0], [-33.86, 151.2], [19.43, -99.13]]) {
      nostr.view(la, lo);
      // Each view re-subscribes, so wait for the replay to have been offered
      // and flushed before moving the view again — otherwise the sweep races
      // ahead of the very duplication it is trying to provoke.
      await tick();
    }
    // Give any duplicate every chance to appear before declaring there is none.
    // This one always waits the whole window when the code is correct, so it is
    // the only part of this check that costs time on a green run. 2.5s buys the
    // same immunity to load that the delivery wait gets for free.
    await settle(() => seen.length !== 1, 2500);
    counted = { afterJoin, afterSweep: seen.length };
    nostr.leave();
  } finally {
    globalThis.WebSocket = realWs;
  }

  if (!counted || counted.afterJoin !== 1) {
    // Nothing arriving and the wrong number arriving are different failures with
    // different causes, and saying "arrived as 0" for a timeout sent me looking
    // at the relay fake when the answer was the clock.
    fail("note delivery", counted && counted.afterJoin === 0
      ? "no note arrived within 20s — delivery is broken, or this machine is too busy to be measured on"
      : `one note from eight relays arrived as ${counted?.afterJoin ?? "nothing"}`);
  } else if (counted.afterSweep !== 1) {
    fail("note duplication",
         `one note became ${counted.afterSweep} after six view changes — a seen-set is being cleared without its list`);
  } else {
    pass("one note stays one note across eight relays and six view changes");
  }
}

// ── nothing routes the radio through Web Audio ──────────────────────────────
// `createMediaElementSource` permanently redirects an element's audio into the
// Web Audio graph, and for cross-origin media the browser passes silence through
// that graph. An AnalyserNode was attached on the `playing` event to draw a
// waveform on the share card, and about one station in six went quiet while
// still reporting that it was playing — the stream arriving, the clock
// advancing, the station named on screen, and no sound.
//
// Reported as "a lot of stations with no sound, very random". It is not
// random: it is whether the station's server answers a cross-origin request.
//
// The measurement that originally justified the analyser was true and
// misleading — it worked on KEXP, which sends the headers. One station is not a
// sample. Nothing may put this back without a way to sample levels that cannot
// mute the radio.
{
  console.log("\nnothing routes the radio through Web Audio");
  const guilty = [];
  for (const f of ["src/renderer/popover.js", EXPLORE]) {
    const src = readSrc(f);
    // In a comment explaining why it is absent: fine. In code: not fine.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    if (/createMediaElementSource\s*\(/.test(code)) guilty.push(f);
  }
  guilty.length
    ? fail("the radio is routed through Web Audio",
           `${guilty.join(", ")} calls createMediaElementSource — cross-origin streams will play silence`)
    : pass("no renderer routes the playing element through an AudioContext");
}

// ── the card's levels come from a copy, never from the radio ────────────────
// The waveform came back by measuring a second, private copy of the stream
// (levels.js) through a gain of zero. That is only safe while the element it
// routes through Web Audio is one it created itself: handed the popover's
// `audio`, it would be the one-in-six silence above with a new file name. So
// every createMediaElementSource there must name an element built with
// `new Audio(` in the same file, and the popover must hand it a URL.
{
  console.log("\nthe card's levels come from a copy, never from the radio");
  const code = readSrc("src/renderer/levels.js")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const made = new Set([...code.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*new Audio\(/g)].map((m) => m[1]));
  const routed = [...code.matchAll(/createMediaElementSource\s*\(\s*([^)]*?)\s*\)/g)].map((m) => m[1]);
  const foreign = routed.filter((arg) => !made.has(arg));
  const pop = readSrc("src/renderer/popover.js").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const handed = [...pop.matchAll(/AuralLevels\??\.sample\s*\(\s*([^,)]+)/g)].map((m) => m[1].trim());
  if (!routed.length) fail("the card's levels are measured", "levels.js routes nothing — the sampler is gone");
  else if (foreign.length) fail("the card's levels come from a copy", `levels.js routes ${foreign.join(", ")}, which it did not create`);
  else if (handed.some((h) => h === "audio" || /\baudio\b/.test(h) && !/Url/.test(h)))
    fail("the card's levels come from a copy", `popover.js hands the sampler ${handed.join(", ")} rather than a URL`);
  else pass("the waveform is measured from a private copy of the stream, never the playing element");
}

// ── the studio's music bed plays only what its mixer can hear ──────────────
// Tracks were decoded whole into memory, and an hour-long mix did not fit.
// studio-deck.js streams them through an <audio> element
// instead, which is the one other place an element may be routed through Web
// Audio: it must be an element that file made itself with `new Audio(`, and it
// may play two things only. A `blob:` URL of a file already on this device; or
// (5 Oct, when a link took "hours" because it was downloaded whole first) the
// desktop's own auralfm-track:// address, which passes a linked file through as
// it arrives. Never a station's stream, which would play silence (the rule
// above) — and the linked track would too unless all three hold: the deck
// refuses any other address, asks with crossOrigin "anonymous", and the main
// process answers that the file may be read.
{
  console.log("\nthe studio's music bed plays only what its mixer can hear");
  const code = readSrc("src/renderer/studio-deck.js")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const made = new Set([...code.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*new Audio\(/g)].map((m) => m[1]));
  const routed = [...code.matchAll(/createMediaElementSource\s*\(\s*([^)]*?)\s*\)/g)].map((m) => m[1]);
  const srcs = [...code.matchAll(/(\w+)\.src\s*=\s*([^;]+);/g)];
  // A source is a blob made here, or `linked ? source : URL.createObjectURL(…)`.
  const sourced = new Set([...code.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*(?:linked \? source : )?URL\.createObjectURL\(/g)].map((m) => m[1]));
  const foreign = routed.filter((arg) => !made.has(arg));
  const badSrc = srcs.filter(([, el, v]) => made.has(el) && !sourced.has(v.trim()));
  const studio = readSrc(EXPLORE);
  const main = readSrc("src/main/ipc-app.js");
  const takesLinks = /linked \? source/.test(code);
  const guarded = /if \(linked && !OWN\.test\(source\)\) return Promise\.reject/.test(code) && /const OWN = \/\^auralfm-track:/.test(code);
  const asked = /if \(linked\) (\w+)\.crossOrigin = "anonymous";/.test(code);
  const answered = /protocol\.handle\("auralfm-track"/.test(main) && /headers\.set\("Access-Control-Allow-Origin", "\*"\)/.test(main);
  const whole = /arrayBuffer\(\)/.test(main.slice(main.indexOf("studio:openTrack")));
  if (!routed.length) fail("the studio's music bed", "studio-deck.js routes nothing — tracks are not playing through it");
  else if (foreign.length) fail("the studio's music bed plays its own element", `studio-deck.js routes ${foreign.join(", ")}, which it did not create`);
  else if (badSrc.length || !srcs.length) fail("the studio's music bed plays a file or its own link", `an element is fed ${badSrc.map((m) => m[2]).join(", ") || "nothing"}, not a blob: URL or the deck's own source`);
  else if (takesLinks && !(guarded && asked && answered)) fail("a linked track can be heard by the mixer",
    [!guarded && "the deck takes an address that is not auralfm-track://", !asked && "the element is not asked for with crossOrigin \"anonymous\"", !answered && "ipc-app.js does not answer that the track may be read"].filter(Boolean).join("; "));
  else if (whole) fail("a linked track plays as it arrives", "ipc-app.js reads the whole file into memory before the studio gets any of it");
  else if (/decodeAudioData\s*\(/.test(studio)) fail("the studio streams its tracks", "explore-studio.js decodes a whole track into memory again");
  else pass("tracks stream through an element the deck made: a file on this device, or a link passed through as it arrives");
  // The host hears the music they play without switching anything on.
  /musicGain\.connect\(ctx\.destination\)/.test(studio) && !/mix\.connect\(ctx\.destination\)/.test(studio)
    ? pass("the host's music reaches their speakers always; their own voice only with \"Hear yourself\"")
    : fail("the host hears the music they play", "explore-studio.js sends music to the speakers only through the monitor switch");
}

// ── the output button does not come and go ──────────────────────────────────
// It hid whenever fewer than two outputs were enumerated. macOS reports
// `default` plus the built-in speakers and nothing else once a bluetooth speaker
// disconnects, so after the `default` duplicate is filtered out the count is
// one — and the button vanished at exactly the moment somebody had lost the
// device they were listening on, reflowing the transport bar as it went.
//
// It looked like the speaker disappearing. Both windows had the rule.
{
  console.log("\nthe output button does not come and go");
  const bad = [];
  for (const f of [EXPLORE, "src/renderer/popover.js"]) {
    const src = readSrc(f);
    const m = src.match(/wrap\.hidden\s*=\s*([^;]+);/);
    if (!m) { bad.push(`${f}: nothing sets wrap.hidden`); continue; }
    // Any threshold above "there is nothing at all" is a control that flickers
    // as devices come and go.
    if (!/outDevices\.length\s*===\s*0/.test(m[1])) {
      bad.push(`${f}: hides on \`${m[1].trim()}\``);
    }
  }
  bad.length
    ? fail("output button hides on a device count", bad.join("; "))
    : pass("both windows hide the output button only when there are no outputs at all");
}

// ── every mark carries the set's stroke weight ───────────────────────────────
// The system icons are stroked 1.6 on a 24 grid. The hand-drawn marks arrive as filled
// outlines on boxes up to 3955 units wide, so their line thickness is baked into
// the geometry and lands wherever the artwork put it — the aeroplane measured
// 0.33 CSS px against the star's 1.07 and read as a hairline in a row of icons
// that were not hairlines.
//
// `MARK` takes a weight for exactly this, and the failure mode is forgetting one
// when adding the next mark. Solid shapes are exempt: `dots` is three filled
// circles and `globe` is a filled disc, and stroking either would thicken a
// shape that has no line to thicken.
{
  console.log("\nevery outline mark carries a stroke weight");
  const src = fs.readFileSync(R("src/renderer/icons.js"), "utf8");
  const SOLID = new Set(["dots", "globe"]);
  const missing = [];
  for (const m of src.matchAll(/(\w+): MARK\("([^"]+)",\s*`[\s\S]*?`(,\s*(\d+))?\)/g)) {
    const [, name, , , weight] = m;
    if (SOLID.has(name)) continue;
    if (!weight) missing.push(name);
  }
  if (missing.length) {
    fail("mark without a weight",
         `${missing.join(", ")} would draw thinner than the 24-grid set around them`);
  } else {
    pass("every outline mark states a weight; solid marks are exempt by name");
  }
}

// ── nothing calls a function that does not exist ────────────────────────────
// `sdrEnded` was called twice in popover.js and defined nowhere, so any KiwiSDR
// session that errored or disconnected threw a ReferenceError instead of ending
// cleanly. It was in the shipped app's own error log three times before anyone
// noticed, because the throw happens inside a callback where nothing is watching.
//
// This replaces a narrower check that only read onclick handlers in Explore —
// which would never have found this one. Every script a window loads, every call
// to a bare identifier.
//
// Getting it quiet took more work than getting it loud, and that was the point:
// a check that is permanently red is a check people learn to skip. Method
// definitions (`connect(a, b) {`) are definitions, not calls. `new X(` is a
// constructor. Vendored bundles are named rather than parsed — an attempt to
// regex globe.gl.min.js did not terminate.
{
  console.log("\nnothing calls a function that does not exist");
const AMBIENT = new Set(["window","document","console","Math","JSON","Date","Number","String",
  "Array","Object","Set","Map","WeakMap","Promise","Boolean","RegExp","Error","URL","Blob",
  "Image","Audio","AudioContext","Intl","isNaN","parseInt","parseFloat","structuredClone",
  "setTimeout","clearTimeout","setInterval","clearInterval","requestAnimationFrame",
  "cancelAnimationFrame","navigator","location","fetch","alert","confirm","prompt","atob","btoa",
  "encodeURIComponent","decodeURIComponent","getComputedStyle","matchMedia","queueMicrotask",
  "Uint8Array","Int8Array","Float32Array","Uint8ClampedArray","ArrayBuffer","DataView","BigInt",
  "Symbol","Proxy","Reflect","TextEncoder","TextDecoder","WebSocket","Event","CustomEvent",
  "MediaMetadata","ResizeObserver","IntersectionObserver","MutationObserver","Notification",
  "performance","crypto","localStorage","sessionStorage","name","length","eval","top","self",
  "async","Int16Array","Int32Array","Float64Array","Uint16Array","Uint32Array","define","require",
  "addEventListener","removeEventListener","dispatchEvent","postMessage","open","close","print"]);
const KEYWORDS = new Set(["if","for","while","switch","catch","return","typeof","await","new",
  "function","else","do","throw","case","in","of","delete","void","instanceof","yield","super","this"]);

  // Blank comments and strings, keeping every newline so line numbers survive.
  const keepLines = (m) => m.replace(/[^\n]/g, " ");
  const strip = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, keepLines)
    .replace(/^\s*\/\/.*$/gm, " ")
    .replace(/`(?:\\.|[^`\\])*`/g, keepLines)
    .replace(/'(?:\\.|[^'\\\n])*'/g, "''")
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""');

  const scan = (htmlFile) => {
    const html = fs.readFileSync(R(htmlFile), "utf8");
    const dir = path.dirname(R(htmlFile));
    const scripts = [...html.matchAll(/<script src="([\w./-]+)"/g)].map((m) => m[1]);
    // Named rather than parsed: `Globe` is injected at runtime by explore.js,
    // `qrcode` by a script tag, and both are minified UMD.
    const defined = new Set([...AMBIENT, "Globe", "qrcode"]);
    const sources = [];
    for (const rel of scripts) {
      const f = path.join(dir, rel);
      if (!fs.existsSync(f) || rel.includes("vendor/")) continue;
      const raw = fs.readFileSync(f, "utf8");
      const code = strip(raw);
      sources.push({ rel, code, raw });
      for (const m of code.matchAll(/(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/g)) defined.add(m[1]);
      for (const m of code.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) defined.add(m[1]);
      for (const m of code.matchAll(/class\s+([A-Za-z_$][\w$]*)/g)) defined.add(m[1]);
      for (const m of code.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=/g)) defined.add(m[1]);
      for (const m of code.matchAll(/(?:const|let|var)\s*[\{\[]([^\}\]]*)[\}\]]/g))
        for (const q of m[1].split(",")) { const n = q.split(":").pop().split("=")[0].trim(); if (/^[A-Za-z_$][\w$]*$/.test(n)) defined.add(n); }
      for (const m of code.matchAll(/(?:function\s*\*?\s*[\w$]*\s*|\)\s*=>|catch\s*)\(([^)]*)\)/g))
        for (const q of m[1].split(",")) { const n = q.split(":").pop().split("=")[0].replace(/[.]{3}/, "").trim(); if (/^[A-Za-z_$][\w$]*$/.test(n)) defined.add(n); }
      for (const m of code.matchAll(/\(?\s*([A-Za-z_$][\w$]*)\s*\)?\s*=>/g)) defined.add(m[1]);
      for (const m of code.matchAll(/(?:^|[\s,{])(?:async\s+|get\s+|set\s+|\*\s*)?([A-Za-z_$][\w$]*)\s*\([^()]*\)\s*\{/gm)) defined.add(m[1]);
    }
    // Detect in the stripped source, report from the original: blanking loses
    // lines, and a location that is confidently wrong costs more than none.
    const realLine = (raw, name) => {
      const at = raw.split("\n").findIndex((l) => new RegExp(`(?:^|[^\\w.$])${name}\\s*\\(`).test(l));
      return at < 0 ? "?" : at + 1;
    };
    const missing = new Map();
    for (const { rel, code, raw } of sources) {
      code.split("\n").forEach((line) => {
        for (const m of line.matchAll(/(?:^|[^\w.$?])([A-Za-z_$][\w$]*)\s*\(/g)) {
          const n = m[1];
          if (defined.has(n) || KEYWORDS.has(n)) continue;
          if (/\bnew\s+$/.test(line.slice(0, m.index + m[0].length - n.length - 1))) continue;
          if (!missing.has(n)) missing.set(n, `${rel}:${realLine(raw, n)}`);
        }
      });
    }
    return missing;
  };

  const broken = [];
  for (const html of ["src/renderer/popover.html", "src/renderer/explore.html"])
    for (const [name, where] of scan(html)) broken.push(`${name}() at ${where}`);

  broken.length
    ? fail("a call with nothing behind it", [...new Set(broken)].join("; "))
    : pass("every call in both renderers resolves to something defined");
}

// ── every button in a toolbar calls something that exists ────────────────────
// The travel globe shipped calling `playChannel(pick)`. There is no such
// function in explore.js — it threw on click and the button did nothing at all,
// which is exactly what was reported. It passed review because the *data*
// path was verified (randomStation returns a station) and the handler was not.
//
// This checks the whole class: every identifier a click handler calls has to be
// defined in the file, on `window`, or on one of the bridges.
{
  console.log("\nevery click handler calls something that exists");
  const src = exploreSrc;
  const defined = new Set();
  /**
   * Every script the page loads counts, not just this one.
   *
   * `guard` lives in errors.js and is hung on `window`; scoping this to
   * explore.js alone reported four handlers as broken that work perfectly. A
   * check that cries wolf is one people learn to skip, which is the failure mode
   * this whole file exists to avoid.
   */
  const loaded = [...fs.readFileSync(R("src/renderer/explore.html"), "utf8")
    .matchAll(/<script src="([\w./-]+)"/g)].map((m) => m[1]);
  for (const rel of [...loaded, "explore.js"]) {
    const file = R(path.join("src/renderer", rel));
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    for (const m of text.matchAll(/(?:^|\n)\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g)) defined.add(m[1]);
    for (const m of text.matchAll(/(?:^|\n)\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g)) defined.add(m[1]);
    for (const m of text.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=/g)) defined.add(m[1]);
  }
  // Things the file legitimately reaches for that are not declared in it.
  const AMBIENT = new Set(["window","document","console","Math","JSON","Date","Number","String",
    "Array","Object","Set","Map","Promise","Icons","Card","t","$","setTimeout","clearTimeout",
    "setInterval","clearInterval","requestAnimationFrame","navigator","location","fetch","alert",
    "parseInt","parseFloat","isNaN","Intl","URL","Boolean","RegExp","Error","structuredClone"]);
  const bad = [];
  // Every `X.onclick = ` handler body, and every arrow assigned to one.
  //
  // Anchored on the handler's own indentation, because handlers now sit inside
  // each part's wire function; a column-0 `};` matched none of them and the
  // check passed having read nothing. A one-line handler ends on its own line —
  // the lock button's used to run on through 5,000 characters of other code.
  let handlers = 0;
  for (const m of src.matchAll(/^( *)\$\("([\w-]+)"\)\.onclick\s*=\s*(?:async\s*)?\(?\)?\s*=>\s*\{(?:([^\n]*)\};[ \t]*$|([\s\S]*?)\n\1\};)/gm)) {
    handlers++;
    const [, , id, oneLine, block] = m;
    const body = oneLine ?? block;
    for (const c of body.matchAll(/(?:^|[^\w.$])([A-Za-z_$][\w$]*)\s*\(/g)) {
      const name = c[1];
      if (defined.has(name) || AMBIENT.has(name)) continue;
      if (/^(if|for|while|switch|catch|return|typeof|await|new|function)$/.test(name)) continue;
      // The name, not the button. Matching handler bodies by regex cannot
      // reliably say *which* onclick a call sits in — the first version blamed
      // `lock` for a call in the travel button — and a failure message that
      // names the wrong control sends you to the wrong place.
      bad.push(`${name}()`);
    }
  }
  if (handlers < 5) fail("handler check", `found only ${handlers} onclick handlers in Explore — the pattern no longer matches the code`);
  else if (bad.length) fail("handler calls a missing function",
         `Explore calls ${[...new Set(bad)].join(", ")} from a click handler; nothing defines it`);
  else pass(`all ${handlers} onclick handlers in Explore call functions that are defined`);
}

// ── a favourite remembers where it is ────────────────────────────────────────
// Favourites were stored as id/title/place/country/secure — a name and a
// place-string with no point on the globe. Everything downstream that needs
// coordinates had nothing: most visibly the share card, which printed the city
// and drew no Earth. Both windows write this shape and both had to be fixed, so
// this checks both rather than the one that was noticed.
{
  console.log("\na favourite remembers where it is");
  const miss = [];
  for (const f of [EXPLORE, "src/renderer/popover.js"]) {
    const src = readSrc(f);
    const m = src.match(/favorites\.push\(\{[\s\S]{0,400}?\}\)/);
    if (!m) { miss.push(`${f}: no favorites.push found`); continue; }
    if (!/lat:\s*ch\.lat/.test(m[0]) || !/lon:\s*ch\.lon/.test(m[0])) {
      miss.push(`${f}: saves a favourite without coordinates`);
    }
  }
  if (miss.length) fail("favourite without a place", miss.join("; "));
  else pass("both windows save favourites with lat and lon");
}

// ── every data file the app reads is actually shipped ────────────────────────
// `build.files` is an allowlist, so a new data file is absent from the package
// unless somebody remembers to add it. filter-default.json was: the word filter
// shipped reading a file that was not there, `defaults()` fell back to an empty
// list, and the switch still said On. A safety feature that silently does
// nothing is worse than one that is obviously missing.
//
// This checks the whole class rather than that one file — anything under data/
// referenced from src/ has to be in the allowlist.
{
  console.log("\nevery data file src/ reads is in the build allowlist");
  const pkg = JSON.parse(fs.readFileSync(R("package.json"), "utf8"));
  const allow = new Set((pkg.build?.files || []).filter((f) => !f.startsWith("!")));
  const wanted = new Set();
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { walk(full); continue; }
      if (!/\.(js|mjs|cjs)$/.test(e.name)) continue;
      const src = fs.readFileSync(full, "utf8");
      for (const m of src.matchAll(/["'`](?:\.\.\/)*data["'`]\s*,\s*["'`]([\w.-]+\.json)["'`]/g)) {
        wanted.add(`data/${m[1]}`);
      }
      for (const m of src.matchAll(/["'`]data\/([\w.-]+\.json)["'`]/g)) wanted.add(`data/${m[1]}`);
    }
  };
  walk(R("src"));
  const missing = [...wanted].filter((f) => {
    if (allow.has(f)) return false;
    // The catalogue ships gzipped under data/packed/ (scripts/pack-data.mjs),
    // and a later check holds that it is there and current.
    if (f === "data/stations.min.json" && allow.has("data/packed/**/*")) return false;
    // A directory glob covering it counts too.
    return ![...allow].some((a) => a === "data/**/*" || a === "data/*");
  });
  missing.length
    ? fail("data files", missing.map((f) => `${f} is read but not in build.files`).join("; "))
    : pass(`all ${wanted.size} data files read by src/ are in build.files`);

  /**
   * Whether the files are actually *there* is a separate question, and it is only
   * answerable on a machine that has run the crawl.
   *
   * The first version of this check tested both halves together and so passed
   * locally and failed on CI for three commits running — data/stations.min.json
   * and friends are generated and gitignored, so a fresh clone legitimately does
   * not have them. Which also means: verifying locally is not verifying. The
   * allowlist half above runs everywhere; this half stands aside where the inputs
   * cannot exist.
   */
  const tracked = [...wanted].filter((f) => fs.existsSync(R(f)));
  if (tracked.length !== wanted.size) {
    skip("data files exist", "some data/ files are generated and gitignored — runs locally");
  } else {
    pass(`all ${wanted.size} are present on disk`);
  }
}

// ── every module src/ imports is declared, and credited ──────────────────────
// Two separate omissions from one commit, both silent.
//
// `@noble/hashes` was required directly by src/nostr-private.js and never added
// to `dependencies`. It resolved anyway, because @noble/curves depends on it and
// npm hoists — so the crypto worked on this machine and would keep working right
// up until curves bumped and dropped it, at which point private messages break
// at runtime inside a packaged app.
//
// And `@noble/ciphers` shipped without a THIRD-PARTY-NOTICES entry, because that
// list is curated by hand. MIT requires the notice to travel with the code.
{
  console.log("\nevery module src/ imports is declared and credited");
  const pkg = JSON.parse(fs.readFileSync(R("package.json"), "utf8"));
  const deps = new Set(Object.keys(pkg.dependencies || {}));
  const notices = fs.readFileSync(R("scripts/notices.mjs"), "utf8");

  const imported = new Set();
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { if (!/vendor/.test(full)) walk(full); continue; }
      if (!/\.js$/.test(e.name) || /\.min\./.test(e.name)) continue;
      const src = fs.readFileSync(full, "utf8");
      for (const m of src.matchAll(/require\("([^"]+)"\)/g)) {
        const id = m[1];
        if (id.startsWith("node:") || id.startsWith(".")) continue;
        if (id === "electron") continue;                 // provided by the runtime
        // Scoped packages keep two segments; everything else keeps one.
        imported.add(id.startsWith("@") ? id.split("/").slice(0, 2).join("/") : id.split("/")[0]);
      }
    }
  };
  walk(R("src"));

  const problems = [
    ...[...imported].filter((d) => !deps.has(d))
      .map((d) => `${d} is required by src/ but not in dependencies`),
    // Credited by name in the curated SHIPPED list, which is what generates the
    // notices file. Checking the source list rather than the output keeps this
    // honest when the output is regenerated.
    ...[...deps].filter((d) => !notices.includes(`"${d}"`))
      .map((d) => `${d} ships but has no THIRD-PARTY-NOTICES entry`),
  ];
  problems.length
    ? fail("dependencies", problems.join("; "))
    : pass(`all ${imported.size} imports declared, all ${deps.size} runtime deps credited`);
}

// ── the licence says one thing ────────────────────────────────────────────────
// LICENSE carried the MIT grant — "permission is hereby granted... to deal in
// the Software without restriction... distribute, sublicense, and/or sell" —
// while docs/TERMS.md, which ships to every user, said the software is not open
// source and may not be redistributed. Two shipped documents granting and
// withholding the same rights, and THIRD-PARTY-NOTICES.md (also shipped) sided
// with the MIT one. Resolved in favour of the licence on 8 August 2026.
//
// Since 13 Oct 2026 the licence is the Apache License 2.0 (MIT
// before). Five statements now, and a new way to be wrong: an Apache LICENSE
// is the licence's own text and nothing else, so it is compared with the
// published text by its hash, and what the project has to say for itself lives
// in NOTICE, which the licence requires to travel with the code.
{
  console.log("\nthe project states one licence for itself");
  const problems = [];
  const licence = fs.readFileSync(R("LICENSE"), "utf8");
  const terms = fs.readFileSync(R("docs/TERMS.md"), "utf8");
  // Only the preamble: the rest of the notices file is third-party licence text.
  const notices = fs.readFileSync(R("THIRD-PARTY-NOTICES.md"), "utf8").split("\n---")[0];

  // https://www.apache.org/licenses/LICENSE-2.0.txt, SHA-256.
  const APACHE_2 = "cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30";
  if (createHash("sha256").update(fs.readFileSync(R("LICENSE"))).digest("hex") !== APACHE_2) {
    problems.push(/Apache License/.test(licence) ? "LICENSE is not the Apache License 2.0 as published — it has been edited"
                                                 : "LICENSE is not the Apache License 2.0");
  }
  if (!fs.existsSync(R("NOTICE"))) problems.push("there is no NOTICE file, which the licence requires to travel with the code");
  else {
    const notice = fs.readFileSync(R("NOTICE"), "utf8");
    if (!/^AuralFM\nCopyright \d{4} Melton Bell III$/m.test(notice)) problems.push("NOTICE does not open with the name and the copyright");
    if (!/Apache License, Version 2\.0/.test(notice)) problems.push("NOTICE does not name the licence");
    if (/\bMIT\b/.test(notice)) problems.push("NOTICE still speaks of MIT");
  }
  // The two documents that ship must not contradict the grant. This is the exact
  // failure that ran for months in the other direction: LICENSE granted rights
  // while docs/TERMS.md forbade redistribution, and both reached every user.
  if (/not open source/i.test(terms)) {
    problems.push("docs/TERMS.md still says the software is not open source");
  }
  if (/you may not redistribute/i.test(terms)) {
    problems.push("docs/TERMS.md still forbids redistribution");
  }
  if (!/Apache License, version 2\.0|Apache 2\.0 licen[cs]e/i.test(terms)) problems.push("docs/TERMS.md does not name the Apache 2.0 licence");
  if (/under the MIT licen[cs]e\.\*\*|narrowing the MIT/i.test(terms)) problems.push("docs/TERMS.md still grants the MIT licence");
  if (/is proprietary/i.test(notices)) problems.push("THIRD-PARTY-NOTICES preamble calls AuralFM proprietary");
  if (!/open source/i.test(notices)) {
    problems.push("THIRD-PARTY-NOTICES preamble does not say AuralFM is open source");
  }
  if (!/Apache License 2\.0/.test(notices)) problems.push("THIRD-PARTY-NOTICES preamble does not say Apache 2.0 (npm run notices)");
  const pkgLicence = JSON.parse(fs.readFileSync(R("package.json"), "utf8")).license || "";
  if (pkgLicence !== "Apache-2.0") problems.push(`package.json license is "${pkgLicence}", not Apache-2.0`);
  if (!/Apache 2\.0 licensed/.test(fs.readFileSync(R("README.md"), "utf8"))) problems.push("the README does not say Apache 2.0");
  // "Give any other recipients of the Work a copy of this License" (4a), and
  // the NOTICE with it (4d): they have to be inside the app that is handed out.
  const shipped = JSON.parse(fs.readFileSync(R("package.json"), "utf8")).build?.files || [];
  for (const f of ["LICENSE", "NOTICE"]) if (!shipped.includes(f)) problems.push(`${f} is not packed into the app`);

  problems.length
    ? fail("licence", problems.join("; "))
    : pass("LICENSE (the published text, unedited), NOTICE, TERMS, the notices preamble, package.json and the README all say Apache 2.0");
}

// ── every licence that ships is one we can ship ───────────────────────────────
// AuralFM is proprietary. Bundling a copyleft dependency would either force the
// source open or make distribution unlawful, and until now nothing checked:
// GPL-3.0 was refused once (Meshtastic, #28) on somebody remembering to look.
// That is not a control, it is a habit — and habits do not survive a late night
// and an `npm install` that fixes the bug.
//
// An allowlist rather than a denylist, deliberately. A new licence nobody has
// considered should stop the build and get a decision, not sail through because
// it was not on a list of known-bad ones.
{
  console.log("\nevery licence that ships is on the allowlist");

  // Permissive and proprietary-compatible. Anything else needs an exception with
  // a reason, below.
  const ALLOW = new Set([
    "MIT", "MIT-0", "ISC", "BSD-2-Clause", "BSD-3-Clause", "Apache-2.0",
    "0BSD", "CC0-1.0", "Unlicense", "BlueOak-1.0.0", "Python-2.0",
  ]);

  /**
   * Deliberate acceptances, each with the reason it is safe here.
   *
   * Empty today, and that is the point: it should stay short, and every entry
   * should be a decision somebody made on purpose rather than a hole.
   */
  const EXCEPTIONS = {
    // "some-package": "MPL-2.0 — file-level copyleft, and we do not modify it",
  };

  /** SPDX expressions: OR needs one allowed operand, AND needs all of them. */
  const allowed = (expr) => {
    if (!expr || typeof expr !== "string") return false;
    const e = expr.trim().replace(/^\((.*)\)$/, "$1").trim();
    if (ALLOW.has(e)) return true;
    if (/\sOR\s/i.test(e)) return e.split(/\s+OR\s+/i).some((x) => allowed(x));
    if (/\sAND\s/i.test(e)) return e.split(/\s+AND\s+/i).every((x) => allowed(x));
    return false;
  };

  /** Node's own resolution: nearest node_modules first, then upward. */
  const findPkg = (name, fromDir) => {
    let dir = fromDir;
    for (let hops = 0; hops < 20; hops++) {
      const p = path.join(dir, "node_modules", ...name.split("/"), "package.json");
      if (fs.existsSync(p)) return p;
      const up = path.dirname(dir);
      if (up === dir || !dir.startsWith(ROOT)) break;
      dir = up;
    }
    return null;
  };

  const shipped = new Map();      // "name@version" -> record
  const problems = [];

  const walk = (name, fromDir, why, deep = true) => {
    const p = findPkg(name, fromDir);
    if (!p) { problems.push(`${name} (${why}) is not installed, so its licence cannot be read`); return; }
    let j;
    try { j = JSON.parse(fs.readFileSync(p, "utf8")); }
    catch { problems.push(`${name}: package.json unreadable`); return; }
    const key = `${name}@${j.version}`;
    if (shipped.has(key)) return;
    shipped.set(key, { name, version: j.version, licence: j.license, why });
    if (!deep) return;
    // Transitive dependencies are packaged too, so they count.
    for (const dep of Object.keys(j.dependencies || {})) {
      walk(dep, path.dirname(p), `via ${name}`);
    }
  };

  const pkg = JSON.parse(fs.readFileSync(R("package.json"), "utf8"));
  // 1. the production tree — electron-builder packages all of it into the asar
  for (const dep of Object.keys(pkg.dependencies || {})) walk(dep, ROOT, "runtime dependency");
  // 2. the vendored libraries. globe.gl ships as a UMD bundle with its
  //    dependencies inlined, so the whole subtree is in the app whether or not it
  //    appears in the production tree.
  for (const dep of ["globe.gl", "three", "three-globe"]) walk(dep, ROOT, "vendored");
  // 3. Electron itself, whose runtime *is* the app.
  //
  //    Not recursed: @electron/get, sumchecker and the rest are download helpers
  //    that run at install time and are never packaged. Walking into them would
  //    let the pass message claim they ship, which is the kind of small
  //    overstatement this file exists to prevent.
  walk("electron", ROOT, "the runtime is bundled into the app", false);

  for (const rec of shipped.values()) {
    if (EXCEPTIONS[rec.name]) continue;
    if (!rec.licence) {
      problems.push(`${rec.name}@${rec.version} declares no licence (${rec.why})`);
    } else if (!allowed(rec.licence)) {
      problems.push(`${rec.name}@${rec.version} is ${rec.licence} — not on the allowlist (${rec.why})`);
    }
  }

  problems.length
    ? fail("dependency licences", problems.join("; "))
    : pass(`all ${shipped.size} shipped packages are permissively licensed`);
}

// ── the Chromium notice matches the Electron that ships ──────────────────────
// Chromium's BSD-3-Clause notice is shipped verbatim with a version and a link to
// the full third-party set, because that set is 19 MB. Both go stale the moment
// Electron is upgraded — a new Electron means a new Chromium, and a notice naming
// the old one is worse than no notice, because it looks done.
//
// Checkable offline: the recorded Electron version must match the installed one.
{
  console.log("\nthe Chromium notice matches the Electron that ships");
  const problems = [];
  let meta = null;
  try { meta = JSON.parse(fs.readFileSync(R("assets/licenses/chromium-notice.json"), "utf8")); }
  catch { problems.push("assets/licenses/chromium-notice.json is missing or unreadable"); }

  let text = null;
  try { text = fs.readFileSync(R("assets/licenses/chromium-LICENSE.txt"), "utf8"); }
  catch { problems.push("assets/licenses/chromium-LICENSE.txt is missing"); }

  if (meta && text) {
    const installed = (() => {
      try { return JSON.parse(fs.readFileSync(R("node_modules/electron/package.json"), "utf8")).version; }
      catch { return null; }
    })();
    if (!installed) skip("chromium notice", "electron is not installed");
    else if (meta.electron !== installed) {
      problems.push(`notice records Electron ${meta.electron}, but ${installed} is installed `
        + `— refresh the Chromium notice (see the _comment in chromium-notice.json)`);
    }
    // The text must actually be the notice, not a placeholder somebody pasted.
    for (const need of ["Redistributions in binary form", "Neither the name of Google LLC",
                        "THE COPYRIGHT HOLDERS AND CONTRIBUTORS"]) {
      if (!text.includes(need)) problems.push(`chromium-LICENSE.txt is missing "${need}"`);
    }
    // And it must reach the shipped file verbatim.
    const notices = fs.readFileSync(R("THIRD-PARTY-NOTICES.md"), "utf8");
    if (!notices.includes(text.trim())) {
      problems.push("THIRD-PARTY-NOTICES.md does not contain the Chromium notice verbatim");
    }
    if (!notices.includes(String(meta.chromium))) {
      problems.push(`THIRD-PARTY-NOTICES.md does not name Chromium ${meta.chromium}`);
    }
  }

  problems.length
    ? fail("chromium notice", problems.join("; "))
    : pass(`Chromium ${meta?.chromium} notice ships verbatim and matches Electron ${meta?.electron}`);
}

// ── every chat-ish record carries what the renderer labels it with ───────────
// repaintLog() writes `m.nick || m.from` as the sender on every line. Chat
// records set both; the private-message records set neither, so a real inbound
// DM rendered its sender as the literal string "undefined". Invisible in every
// self-addressed test, because those arrive with `mine: true` and render "you".
// Only a message from a second party shows it.
{
  console.log("\nevery message record carries a sender label");
  const src = fs.readFileSync(R("src/presence-nostr.js"), "utf8");
  const problems = [];
  // Each push into a list the renderer paints must set `from`.
  for (const m of src.matchAll(/(dms|messages|notes)\.push\(\{([\s\S]{0,400}?)\}\);/g)) {
    const [, list, body] = m;
    if (!/\bfrom:/.test(body)) problems.push(`${list}.push has no \`from\` — the renderer would show "undefined"`);
  }
  const renderer = exploreSrc;
  if (!/m\.nick \|\| m\.from/.test(renderer)) {
    problems.push("Explore no longer labels with `m.nick || m.from` — this check needs updating");
  }
  problems.length
    ? fail("sender labels", problems.join("; "))
    : pass("every record the chat log paints carries a `from`");
}

// ── windows, links and the news resolver ────────────────────────────────────
// Three holes found in one audit, all in main.js and all silent until used.
// Only the popover had a window-open handler, so `target="_blank"` in Settings
// (the in-app docs render links that way) would have opened a remote page in a
// bare Electron window. That one handler passed any URL to shell.openExternal,
// including file: and smb: from crawled station data. And the hidden window that
// resolves Google News links ran Google's JavaScript in the default session, so
// its cookies persisted across launches — where PRIVACY.md says Google gets an
// IP address.
{
  console.log("\nevery window is locked down");
  const problems = [];
  for (const m of main.matchAll(/(?:let |const )?(\w+) = new BrowserWindow\(\{([\s\S]*?)\n\s*\}\);/g)) {
    const [, name, opts] = m;
    if (/partition:/.test(opts)) continue;   // the resolver, checked below
    if (!new RegExp(`lockDown\\(${name}\\)`).test(main)) problems.push(`${name} is never passed to lockDown()`);
  }
  const lock = main.match(/function lockDown\(w\) \{([\s\S]*?)\n\}/);
  if (!lock) problems.push("lockDown() is gone");
  else {
    if (!/setWindowOpenHandler/.test(lock[1])) problems.push("lockDown() sets no window-open handler");
    if (!/will-navigate[\s\S]*preventDefault/.test(lock[1])) problems.push("lockDown() does not stop navigation");
  }
  problems.length ? fail("window lockdown", problems.join("; "))
                  : pass("every window denies new windows and navigation");

  console.log("\nlinks leave only as http(s)");
  const bad = [];
  const outside = main.match(/function openOutside\(url\) \{([\s\S]*?)\n\}/);
  if (!outside || !/\^https\?:/.test(outside[1])) bad.push("openOutside() no longer checks for http(s)");
  for (const c of main.matchAll(/shell\.openExternal\(/g)) {
    const line = main.slice(0, c.index).split("\n").length;
    const before = main.slice(Math.max(0, c.index - 600), c.index);
    const inOutside = outside && c.index > outside.index && c.index < outside.index + outside[0].length;
    // mailto: drafts are built in main from a literal address; nothing else is.
    const mailto = /["'`]mailto:/.test(main.slice(c.index, c.index + 120)) || /const url = "mailto:/.test(before);
    // macOS's own Microphone settings page, a fixed literal (Your show): no input reaches it.
    const settings = /\(\s*["']x-apple\.systempreferences:com\.apple\.preference\.security\?Privacy_Microphone["']\s*\)/.test(main.slice(c.index, c.index + 120));
    if (!inOutside && !mailto && !settings) bad.push(`main.js:${line} opens a URL without openOutside()`);
  }
  bad.length ? fail("external links", bad.join("; "))
             : pass("every shell.openExternal is http(s)-checked, a mailto: we built, or macOS's Microphone settings");

  console.log("\nthe resolver keeps no cookies");
  const res = main.match(/new BrowserWindow\(\{[\s\S]*?partition:\s*(\w+)[\s\S]*?\n\s*\}\);([\s\S]{0,200})/);
  const val = res && main.match(new RegExp(`const ${res[1]} = "([^"]*)"`));
  !res ? fail("resolver session", "the news resolver has no partition, so it shares the default session")
  : !val ? fail("resolver session", `${res[1]} is not a string constant this check can read`)
  : val[1].startsWith("persist:") ? fail("resolver session", `partition "${val[1]}" is written to disk`)
  : !/setWindowOpenHandler/.test(res[2]) ? fail("resolver session", "the resolver window can open windows")
  : pass(`the resolver runs in "${val[1]}", in memory only, and opens no windows`);
}

// ── prefs:set ────────────────────────────────────────────────────────────────
// normalize() guarded reads; nothing guarded writes. prefs:set stored any key of
// any type, and setPrefs branches on `"x" in patch` — a string durableIdentity
// could mint or destroy the key.
{
  console.log("\nprefs:set takes only real preferences");
  const { createRequire } = await import("node:module");
  const prefs = createRequire(import.meta.url)(R("src/prefs.js"));
  const problems = [];
  if (typeof prefs.pick !== "function") problems.push("prefs.pick is gone");
  else {
    const got = prefs.pick({ theme: "light", bogus: 1, durableIdentity: "yes", relays: { a: 1 } });
    if (JSON.stringify(got) !== '{"theme":"light"}') problems.push(`pick let through ${JSON.stringify(got)}`);
    if (JSON.stringify(prefs.pick({ relays: ["wss://a"] })) !== '{"relays":["wss://a"]}') problems.push("pick drops a valid relays array");
    if (Object.keys(prefs.pick(null)).length || Object.keys(prefs.pick([1])).length) problems.push("pick accepts a non-object");
  }
  const body = main.match(/function setPrefs\((\w+)\) \{([\s\S]*?)\n\}/);
  if (!body || !/^\s*(?:\/\/[^\n]*\n\s*)*const patch = prefs\.pick\(/.test(body[2])) {
    problems.push("setPrefs no longer filters through prefs.pick before anything else");
  }
  problems.length ? fail("prefs:set", problems.join("; "))
                  : pass("unknown keys and wrong types never reach the store");
}

// ── keyboard and names in Explore ────────────────────────────────────────────
// Found by a Rams review and confirmed in the running app's accessibility tree:
// station, place, search, headline and receiver rows were divs with an onclick,
// so a keyboard could not pick anything to play. The row star was a nameless SVG
// that stayed invisible when focused, and the headline Close and the dial's
// arrows were named by their glyphs.
{
  console.log("\nevery clickable row works by keyboard");
  const bad = [];
  // The popover's favourites were the same divs with an onclick.
  for (const f of [...EXPLORE_FILES, "src/renderer/popover.js"]) {
    const src = fs.readFileSync(R(f), "utf8");
    for (const m of src.matchAll(/const (\w+) = document\.createElement\("(?:div|span)"\)/g)) {
      const v = m[1];
      // Up to the next element built under the same name, which is the next row.
      const rest = src.slice(m.index + m[0].length);
      const next = rest.search(new RegExp(`const ${v} = document\\.createElement\\(`));
      const body = rest.slice(0, next < 0 ? 2500 : Math.min(next, 2500));
      const clickable = new RegExp(`\\b${v}\\.(onclick\\s*=|addEventListener\\("click")`).test(body);
      if (!clickable) continue;
      const helped = new RegExp(`activatable\\(\\s*${v}\\b`).test(body);
      const byHand = new RegExp(`\\b${v}\\.tabIndex = 0`).test(body)
        && new RegExp(`\\b${v}\\.(onkeydown\\s*=|addEventListener\\("keydown")`).test(body);
      if (!helped && !byHand) bad.push(`${path.basename(f)}:${src.slice(0, m.index).split("\n").length} ${v}`);
    }
  }
  // A key the row used must stop there: a Space on a popover row also reached
  // the panel's Space shortcut and toggled play right after the row tuned.
  const helper = fs.readFileSync(R("src/renderer/activatable.js"), "utf8");
  if (!/addEventListener\("keydown"[\s\S]*?stopPropagation\(\)[\s\S]*?go\(e\)/.test(helper)) {
    bad.push("activatable.js lets a handled key reach the window's own shortcuts");
  }
  bad.length ? fail("keyboard rows", `clickable but not focusable or keyable: ${bad.join(", ")} — use activatable()`)
             : pass("every clickable row in Explore and the popover can be reached and pressed from the keyboard");

  console.log("\nno button is named by a glyph");
  const nameless = [];
  const PAGES = ["explore", "popover", "settings"];
  const pageScripts = (page) => (page === "explore" ? exploreSrc
    : fs.readFileSync(R(`src/renderer/${page}.js`), "utf8"));
  const html = fs.readFileSync(R("src/renderer/explore.html"), "utf8");
  for (const page of PAGES) {
  const doc = fs.readFileSync(R(`src/renderer/${page}.html`), "utf8");
  for (const m of doc.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
    const [, attrs, inner] = m;
    // An entity is a glyph (&laquo; is «), not nothing — deleting it made the
    // dial's arrows look like empty icon buttons and pass unnamed.
    const text = inner.replace(/<[^>]+>/g, "").replace(/&#?\w+;/g, "\u2022").trim();
    if (/\p{L}/u.test(text)) continue;                              // has words
    // Empty buttons get an icon at runtime, so the name has to be an attribute.
    // Privacy, Terms and Licences in Settings were empty with none.
    if (/aria-label=|aria-labelledby=|data-i18n-title=/.test(attrs)) continue;
    // Empty in the markup because script writes words into it (the chat's
    // "3 private"), which is a name, not an icon.
    const id = (attrs.match(/id="([^"]+)"/) || [])[1];
    if (!text && id && new RegExp(`\\$\\("${id}"\\)[\\s\\S]{0,400}?\\.textContent\\s*=`).test(pageScripts(page))) continue;
    nameless.push(`${page}.html ${(attrs.match(/id="([^"]+)"/) || attrs.match(/class="([^"]+)"/) || [,"?"])[1]} "${text || "(empty)"}"`);
  }
  }
  const src = [exploreSrc, ...["popover", "settings"].map((p) => fs.readFileSync(R(`src/renderer/${p}.js`), "utf8"))].join("\n");
  // Buttons built in script, whose whole text is a glyph: the remove button on
  // your own stations was a bare "−" and announced as "minus".
  for (const m of src.matchAll(/const (\w+) = document\.createElement\("button"\);[\s\S]{0,300}?\1\.textContent = "([^"]{1,3})";/g)) {
    const [, v, glyph] = m;
    if (/\p{L}/u.test(glyph)) continue;
    const after = src.slice(m.index, m.index + m[0].length + 400);
    if (!new RegExp(`${v}\\.setAttribute\\("aria-label"`).test(after)) nameless.push(`script-built button "${glyph}" (${v})`);
  }
  if (!/\.star"\)[\s\S]{0,300}?setAttribute\("aria-label"/.test(src)) nameless.push("the station row star has no aria-label");
  if (!/\.st:focus-within \.star/.test(html)) nameless.push("the station row star is not shown on focus");
  nameless.length ? fail("button names", nameless.join("; "))
                  : pass("every glyph-only button is named in words, and the row star shows on focus");
}

// ── Explore's styles live in the stylesheet ─────────────────────────────────
// Flagged by a Rams review: the same empty state carried padding:32px 16px in
// two scripts, 30px 16px in a third and 22px 12px in a fourth, shortwave set
// five more by hand, and the chat wrote its own for "tuned in". All of them live
// in explore.html now, so no script writes a block of style: no style="" in a
// template and no cssText. Single properties that change at runtime (a signal's
// pulse, a menu's position, a dimmed row) are still set one at a time.
{
  console.log("\nExplore's styles live in the stylesheet");
  const bad = [];
  for (const f of EXPLORE_FILES) {
    const src = fs.readFileSync(R(f), "utf8");
    const at = (i) => `${path.basename(f)}:${src.slice(0, i).split("\n").length}`;
    for (const m of src.matchAll(/<\w+[^>`]*\sstyle="/g)) bad.push(at(m.index));
    for (const m of src.matchAll(/\.style\.cssText\s*=/g)) bad.push(at(m.index));
  }
  bad.length ? fail("inline styles", `a block of inline style at ${bad.join(", ")} — put it in explore.html`)
             : pass("no Explore script writes a block of inline style");
}

// ── inputs, tokens and help tags across the three windows ────────────────────
// From a Rams review of the popover and Settings, confirmed in the running app.
// The nickname field announced as "Anonymous" (its placeholder), the popover's
// output menu used var(--pane) and that page never defined it, and turning help
// tags on stripped `title` — the only name the popover's row star had.
{
  const PAGES = ["explore", "popover", "settings"];
  const read = (f) => fs.readFileSync(R(f), "utf8");

  console.log("\nevery input has a name");
  const unnamed = [];
  for (const page of PAGES) {
    const doc = read(`src/renderer/${page}.html`);
    for (const m of doc.matchAll(/<input\b([^>]*)>/g)) {
      const a = m[1];
      if (/type="hidden"/.test(a)) continue;
      const id = (a.match(/id="([^"]+)"/) || [])[1];
      // A placeholder is not a name: it disappears on the first keystroke and
      // says what to type, not what the field is.
      const named = /aria-label=|aria-labelledby=|data-i18n-title=/.test(a)
        || (id && new RegExp(`<label[^>]*for="${id}"`).test(doc));
      if (!named) unnamed.push(`${page}.html ${id || "(no id)"}`);
    }
  }
  unnamed.length ? fail("input names", `named only by a placeholder: ${unnamed.join(", ")}`)
                 : pass("every input in the three windows has a label, not just a placeholder");

  console.log("\nevery var() a page uses is defined");
  const undef = [];
  for (const page of PAGES) {
    const doc = read(`src/renderer/${page}.html`);
    const scripts = [...doc.matchAll(/<script src="([\w./-]+)"/g)]
      .map((m) => R(`src/renderer/${m[1]}`)).filter((f) => fs.existsSync(f))
      .map((f) => fs.readFileSync(f, "utf8")).join("\n");
    const defined = new Set([
      ...[...doc.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]),
      ...[...scripts.matchAll(/setProperty\(\s*["'](--[\w-]+)["']/g)].map((m) => m[1]),
    ]);
    // Only uses with no fallback: var(--x, y) is written to survive an absence.
    for (const m of doc.matchAll(/var\((--[\w-]+)\)/g)) {
      if (!defined.has(m[1])) undef.push(`${page}.html ${m[1]}`);
    }
  }
  const uniq = [...new Set(undef)];
  uniq.length ? fail("undefined tokens", `used with no fallback and never defined: ${uniq.join(", ")}`)
              : pass("every var() used without a fallback is defined in its own page");

  console.log("\nhelp tags keep a control's name");
  // Both routes a title takes must go through take(), which keeps the name:
  // adopt() for what is there at load, and the observer for titles set later.
  // The observer had its own copy of the strip, without the name, which is how
  // a fix to adopt() alone left every title set from script still nameless.
  const tips = read("src/renderer/tips.js");
  const take = tips.match(/function take\(node\) \{[\s\S]*?\n  \}/);
  const adopt = tips.match(/function adopt\([\s\S]*?\n  \}/);
  const observer = tips.match(/new MutationObserver\([\s\S]*?\}\)\.observe/);
  const problems = [];
  if (!take || !/setAttribute\("aria-label"/.test(take[0])) problems.push("take() does not keep the name");
  if (!adopt || !/\btake\(node\)/.test(adopt[0])) problems.push("adopt() does not go through take()");
  if (!observer || !/\btake\(rec\.target\)/.test(observer[0])) problems.push("the title observer does not go through take()");
  if (/removeAttribute\("title"\)/.test(tips.replace(take?.[0] || "", ""))) problems.push("a title is removed somewhere other than take()");
  problems.length ? fail("help tags", problems.join("; "))
    : pass("every title help tags take over, at load or later, keeps a nameless control named");

  console.log("\nthe Settings reader holds focus");
  // aria-modal only tells a screen reader. Tab walked out of the reader into the
  // settings underneath, and closing it left focus on nothing.
  const set = read("src/renderer/settings.js");
  const open = set.match(/function openDocView\([\s\S]*?\n\}/);
  const close = set.match(/function closeDocView\([\s\S]*?\n\}/);
  const gaps = [];
  if (!open || !/\$\("main"\)\.inert = true/.test(open[0])) gaps.push("opening does not make the list inert");
  if (!open || !/docOpener = document\.activeElement/.test(open[0])) gaps.push("opening does not remember the opener");
  if (!close || !/\$\("main"\)\.inert = false/.test(close[0])) gaps.push("closing leaves the list inert");
  if (!close || !/docOpener\?\.focus\(\)/.test(close[0])) gaps.push("closing does not return focus");
  gaps.length ? fail("settings reader", gaps.join("; "))
    : pass("the reader keeps Tab inside and hands focus back when it closes");

  console.log("\na refused relay keeps what was typed and says why");
  // An invalid address used to be erased, with the reason moved into the
  // placeholder: the text was lost and a screen reader heard only "invalid".
  const relayBtn = set.match(/\$\("#relay-btn"\)\.addEventListener\("click", async \(\) => \{([\s\S]*?)\n\}\);/);
  const setHtml = read("src/renderer/settings.html");
  const relayGaps = [];
  if (!relayBtn) relayGaps.push("could not find the relay Add handler");
  else {
    const refused = relayBtn[1].split(/\n  showRelayError\(null\);/)[0];
    if (/input\.value = ""/.test(refused)) relayGaps.push("an invalid address is still erased");
    if (/input\.placeholder =/.test(refused)) relayGaps.push("the reason still goes in the placeholder");
    if (!/showRelayError\(/.test(refused)) relayGaps.push("the reason is not shown next to the field");
  }
  if (!/id="relay-add"[^>]*aria-describedby="relay-err"/.test(setHtml)) relayGaps.push("#relay-add is not described by #relay-err");
  if (!/id="relay-err"[^>]*role="alert"/.test(setHtml)) relayGaps.push("#relay-err is not announced");
  relayGaps.length ? fail("relay error", relayGaps.join("; "))
    : pass("the address stays and the reason is next to it, read out");

  console.log("\nthe share sheet holds focus");
  // Same defect as the reader, in Explore: Tab walked out of the card into the
  // toolbar behind it.
  const play = read("src/renderer/explore-playback.js");
  const openSheet = play.match(/async function openShareSheet\([\s\S]*?\n\}/);
  const closeSheet = play.match(/function closeShareSheet\([\s\S]*?\n\}/);
  const holes = [];
  if (!/const behindSheet = \(\) => \[[^\]]*\.toolbar[^\]]*\.cols[^\]]*\$\("now"\)\]/.test(play)) holes.push("behindSheet() does not cover the toolbar, the columns and the transport");
  if (!openSheet || !/el\.inert = true/.test(openSheet[0])) holes.push("opening does not make the page inert");
  if (!closeSheet || !/el\.inert = false/.test(closeSheet[0])) holes.push("closing leaves the page inert");
  holes.length ? fail("share sheet", holes.join("; "))
    : pass("the share sheet keeps Tab inside while it is open");

  console.log("\nan output's check mark is not part of its name");
  // The ✓ is drawn for the chosen output, and without aria-hidden it was read
  // as part of every option's name: "✓ System output".
  const loud = [];
  for (const f of ["src/renderer/popover.js", "src/renderer/explore-playback.js"]) {
    const src = read(f);
    const ticks = (src.match(/tick\.textContent = "\\u2713";/g) || []).length;
    const hushed = (src.match(/tick\.setAttribute\("aria-hidden", "true"\)/g) || []).length;
    if (!ticks) loud.push(`${f}: no tick found to check`);
    else if (hushed < ticks) loud.push(`${f}: ${ticks - hushed} tick(s) not aria-hidden`);
  }
  loud.length ? fail("output ticks", loud.join("; "))
    : pass("every output menu hides its tick from the accessible name");

  console.log("\nthe popover's keys yield to the output menu");
  // The panel's keydown handler is registered first, so it saw Escape before
  // the menu did and hid the whole popover; Space toggled playback instead of
  // choosing the focused device.
  const pop = read("src/renderer/popover.js");
  const panelKeys = pop.match(/\/\/ ── keys ─+\ndocument\.addEventListener\("keydown", e => \{\n([\s\S]*?)\n\}\);/);
  !panelKeys ? fail("popover keys", "could not find the panel's keydown handler")
    : !/^\s*(\/\/.*\n\s*)*if \(!\$\("outmenu"\)\.hidden\) return;/.test(panelKeys[1])
      ? fail("popover keys", "the panel's keydown handler does not step aside while the output menu is open")
      : pass("Escape and Space reach the output menu while it is open");
}

// ── a network blip holds the station, it does not spend the list ────────────
// A phone changes network mid-song — wifi to cellular, a tunnel, a lift — and
// the browser fails the stream exactly as it would for a station that has gone
// off the air. The answer used to be the same either way: walk this station's
// other URLs, then walk the place's other stations, then settle on "Stream
// unavailable here" about a station that was never at fault, over a network
// that came back ten seconds later. Nothing resumed when it did.
//
// Desktop-only code would not have shown this. It is a phone bug, and it is the
// most likely way a walk out of wifi ends a listening session.
//
// So the failure path must ask whether there is a network before it spends the
// list, and something must listen for the network coming back.
{
  console.log("\na network blip holds the station");
  const src = readSrc("web/bridge.js")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const gaps = [];

  // tryNext is the one choke point every stream failure passes through.
  const tn = src.match(/function tryNext\s*\([^)]*\)\s*\{([\s\S]*?)\n  \}/);
  if (!tn) gaps.push("tryNext is gone — the stream-failure path has moved and this check is blind");
  else if (!/navigator\.onLine/.test(tn[1]))
    gaps.push("tryNext advances to the next URL without asking whether there is a network");

  // And a way back, or a held station is just a stuck one.
  if (!/addEventListener\(\s*["']online["']/.test(src))
    gaps.push("nothing listens for 'online', so a held station never resumes");

  gaps.length ? fail("a network blip holds the station", gaps.join("; "))
    : pass("a stream that fails with no network holds the station and resumes when it returns");
}


// ── the worker does not seize a page that is playing ────────────────────────
// install called skipWaiting() and activate called clients.claim(), so the
// moment a new build was deployed its worker took over pages already open —
// and then deleted every cache but its own. The running page's scripts are
// stamped with the *old* build's URLs, which had just been thrown away, so
// every one of them missed and went to the network. On a good connection that
// is invisible. On a phone with a weak signal it is a dead page: ERR_FAILED on
// every script, the app's own HTML still on screen with nothing behind it.
//
// Measured here on 2026-09-20: cache auralfm-mu9egcka still serving while the
// build was mua7tjon, and a plain fetch() from the page throwing "Failed to
// fetch" until the worker was unregistered by hand.
//
// The lifecycle's default is correct for a radio: a new worker waits until
// every page using the old one has closed. Nothing is swapped underneath
// somebody who is listening, and the cache is only dropped once nothing needs
// it. The update lands on the next launch, which is the price and it is right.
{
  console.log("\nthe worker does not seize a page that is playing");
  const sw = readSrc("web/sw.js").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const seizes = [];
  if (/skipWaiting\s*\(/.test(sw)) seizes.push("install calls skipWaiting()");
  if (/clients\.claim\s*\(/.test(sw)) seizes.push("activate calls clients.claim()");
  // A miss that cannot reach the network must not reject: respondWith on a
  // rejected promise is ERR_FAILED, which is the dead page above.
  // The `.catch` on cache.put does not count; it is the fetch that has to be
  // guarded, because respondWith on a rejected promise is the dead page.
  const firstPath = sw.slice(sw.indexOf("caches.match(request)"));
  if (firstPath && !/try\s*\{/.test(firstPath))
    seizes.push("the cache-first path lets a failed fetch reject respondWith");
  seizes.length ? fail("the worker does not seize a page that is playing", seizes.join("; "))
    : pass("a new build waits for the old page to close, and a miss with no network fails soft");
}


// ── the catalogue does not index what nobody has searched for ───────────────
// load() folded all 38,337 titles and all 12,579 place names into two search
// haystacks before the app could paint. Measured on this machine: 3.2s for the
// channel haystack and 0.4s for the places, inside a single blocked main
// thread, on top of 2.2s of JSON.parse. In a browser that was one 8.4-second
// long task with DOMContentLoaded at 15s — a phone would be worse, and a
// session that only spins the globe never touches either array.
//
// They are built on first use now. bands[] stays eager on purpose: hydrate()
// reads it for every station shown, so it is wanted immediately and costs 0.4s.
{
  console.log("\nthe catalogue does not index what nobody has searched for");
  const src = readSrc("src/catalog.js").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const body = src.match(/function load\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/);
  const eager = [];
  if (!body) eager.push("load() is gone — this check is blind");
  // Clearing them (`haystack = placeHay = null`) is how load() hands them back
  // to the lazy builders; anything else assigned in here is the build itself.
  else for (const m of body[1].matchAll(/\b(haystack|placeHay)\s*=\s*([^;]+);/g)) {
    // Strike out the words a reset is allowed to be made of. Anything left is
    // a build: `haystack = placeHay = null` clears, `= channels.map(...)` does not.
    if (m[2].replace(/null|haystack|placeHay|[\s=]/g, ""))
      eager.push(`load() builds ${m[1]} before anything has searched`);
  }
  eager.length ? fail("the catalogue does not index what nobody has searched for", eager.join("; "))
    : pass("the search haystacks are built on first use, not at startup");
}


// ── no screen tells a listener to run a shell command ───────────────────────
// Explore appended "catalog N days old — run npm run crawl" to the place
// heading once the bundle passed 120 days. That is a note to whoever is
// building the app, and it was being shown to whoever was listening to it: a
// packaged Mac app cannot run npm, and on the web and the iOS PWA the reader
// has no terminal at all. Rams flagged it, and the web version is what made it
// matter — the same string had been fine while this was only a dev build.
//
// The signal itself is worth keeping, so the rule is not "never say this", it
// is "only where it can be acted on": version() already answers that with
// `dev: !app.isPackaged`, which settings.js has used for the build badge all
// along, and which the web bridge does not set at all.
//
// A proximity check, deliberately. It asks that a `dev` test appear within a
// dozen lines above the string, which is cheap and would have caught this one.
// It cannot prove the test actually guards the write.
{
  console.log("\nno screen tells a listener to run a shell command");
  const shouting = [];
  for (const f of fs.readdirSync(R("src/renderer")).filter((n) => n.endsWith(".js"))) {
    const lines = fs.readFileSync(R(`src/renderer/${f}`), "utf8").split("\n");
    lines.forEach((line, i) => {
      // The comment above a guarded write may name the command; the write is
      // what ships, so only look at lines that are code.
      if (/^\s*(\/\/|\*)/.test(line)) return;
      // The console is a developer's surface, not a screen. Saying it there is
      // the fix, not the bug.
      if (/console\.(error|warn|log|info|debug)\s*\(/.test(line)) return;
      if (!/npm run |yarn |pnpm /.test(line)) return;
      const above = lines.slice(Math.max(0, i - 12), i + 1).join("\n");
      if (!/\bdev\b/.test(above)) shouting.push(`${f}:${i + 1} tells the reader to run a command with no dev-build check above it`);
    });
  }
  shouting.length ? fail("no screen tells a listener to run a shell command", shouting.join("; "))
    : pass("a build instruction on screen is gated on this being a build you can run");
}


// ── a failed globe load can be tried again ──────────────────────────────────
// loadGlobeLib() memoises its promise in `globeLoading` so concurrent callers
// share one <script> load. Nothing ever cleared it on failure, so a rejected
// promise was cached for the life of the page: every later call got the same
// rejection back, and the globe could not be retried without a reload. The
// usual reason it failed is 1.8 MB of globe.gl over a weak phone connection —
// the exact case where trying again a moment later would have worked.
//
// Found by a Rams review of the surrounding lines, then confirmed by reading:
// globeLoading was assigned once and never reset.
{
  console.log("\na failed globe load can be tried again");
  const src = readSrc("src/renderer/explore-globe.js");
  const onerror = src.match(/onerror\s*=\s*(\([^)]*\)\s*=>\s*\{[\s\S]*?\n    \}|[^;]+);/);
  !onerror ? fail("a failed globe load can be tried again", "no onerror on the globe.gl script — this check is blind")
    : !/globeLoading\s*=\s*null/.test(onerror[1])
      ? fail("a failed globe load can be tried again",
             "the onerror path leaves the rejected promise in globeLoading, so every retry re-reads the same failure")
      : pass("a failed globe load clears the memo, so the next call actually tries again");
}


// ── the web build defines everything the web build calls ────────────────────
// Dropping explore-shortwave.js from the web build took goToPlace() with it —
// a function about places, not receivers, that had simply been written in the
// shortwave file. It is what every place row, every search hit, the journey
// buttons and the globe's own click handler call, so the web app loaded,
// painted, and then did nothing at all when touched. Six call sites across
// five files, and the boot check meant to cover that removal saw none of them:
// goToPlace is only reached on interaction, and the page boots fine without it.
//
// These renderer scripts share one global scope, so dropping a file drops a
// file's worth of globals. Every name a still-shipped script calls has to be
// declared by another still-shipped script — unless that script also says
// `typeof name`, which is how a page states out loud that a feature may be
// absent.
//
// Scoped to the page that actually loses the globals: explore.html is the one
// whose scripts share a scope with the dropped files. popover.js and splash.js
// are their own pages, so their `tune` and `render` are somebody else's.
{
  console.log("\nthe web build defines everything the web build calls");
  const build = fs.readFileSync(R("scripts/build-web.mjs"), "utf8");
  const listed = build.match(/const DESKTOP_ONLY = \[([^\]]*)\]/);
  const dropped = listed ? [...listed[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]) : [];
  const page = fs.readFileSync(R("src/renderer/explore.html"), "utf8");
  const loaded = [...page.matchAll(/src="([^"]+\.js)"/g)].map((m) => m[1]).filter((f) => !f.includes("/"));
  const gone = loaded.filter((f) => dropped.includes(f));
  const shipped = loaded.filter((f) => !dropped.includes(f));

  const read = (f) => fs.readFileSync(R(`src/renderer/${f}`), "utf8");
  const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const names = (src) => new Set([
    ...[...src.matchAll(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]),
    ...[...src.matchAll(/^(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]),
  ]);
  const declared = new Set();
  for (const f of shipped) for (const n of names(read(f))) declared.add(n);

  const orphans = [];
  for (const f of gone) {
    for (const n of names(read(f))) {
      if (declared.has(n)) continue;                    // a shipped file defines it too
      for (const g of shipped) {
        const src = strip(read(g));
        if (new RegExp(`typeof\\s+${n}\\b`).test(src)) continue;   // declared optional
        // A bare call, not a method: `auralfm.tune(` is not this file's `tune`.
        if (new RegExp(`(?<![.\\w$])${n}\\s*\\(`).test(src)) orphans.push(`${g} calls ${n}(), which only ${f} defines`);
      }
    }
  }
  orphans.length ? fail("the web build defines everything the web build calls", orphans.join("; "))
    : pass(`nothing in the web build calls a name only ${gone.join(", ") || "a dropped file"} defines`);
}


// ── on a phone, a panel sits behind the chrome, not over it ─────────────────
// Headlines, layers and chat were z-index 6 against the tab bar's 5, and threw
// a downward shadow (0 18px 48px) across it. They read as cards hovering over
// the app instead of content the bar sits on top of. On a phone they must sit
// behind the tab bar, with no shadow across it.
//
// Favourites was already right, and is the reference: the rail sheet is
// z-index 4, under the chrome's 5, and its shadow points *up* onto the globe
// (0 -10px 40px) rather than down onto the bar it must not touch.
//
// So: nothing in the phone layout may stack above the chrome except things
// meant to cover the screen, and a panel's shadow may not fall downward.
{
  console.log("\non a phone, a panel sits behind the chrome, not over it");
  const css = fs.readFileSync(R("web/web.css"), "utf8");
  const rule = (sel) => {
    const i = css.indexOf(sel + " {");
    return i < 0 ? null : css.slice(i, css.indexOf("}", i));
  };
  const zOf = (sel) => { const b = rule(sel); const m = b && b.match(/z-index:\s*(\d+)/); return m ? Number(m[1]) : null; };
  const chrome = zOf(".tabbar");
  const panels = ".newspanel, #layers, .chatpanel";
  const panelZ = zOf(panels);
  const wrong = [];
  if (chrome === null) wrong.push("no z-index on .tabbar — this check is blind");
  else if (panelZ === null) wrong.push(`no z-index on ${panels}`);
  else if (panelZ >= chrome) wrong.push(`${panels} is z-index ${panelZ}, at or above the tab bar's ${chrome}`);
  // A downward blur on a panel is the shadow that lands on the bar.
  const body = rule(panels) || "";
  const down = body.match(/box-shadow:[^;]*?(?:^|[\s,])0\s+(\d+)px\s+\d+px/);
  if (down) wrong.push(`${panels} casts a shadow ${down[1]}px downward, onto the chrome`);
  wrong.length ? fail("a phone panel sits behind the chrome", wrong.join("; "))
    : pass(`the phone's panels are z-index ${panelZ} under the chrome's ${chrome}, and cast nothing downward`);
}

// ── the three globe buttons rest alike ──────────────────────────────────────
// #lock is an id and .globeside button is a class, so the desktop rule
// `#lock{background:none}` outranked the tile every button in that column
// wears. Measured in the phone layout: layers and shuffle rested on
// `rgb(.047 .043 .043 / .62)`, the lock on `rgba(0,0,0,0)` — no tile at all.
// Unchecked, the lock read as too transparent beside the unchecked layers and
// the shuffle.
{
  console.log("\nthe three globe buttons rest alike");
  const css = fs.readFileSync(R("web/web.css"), "utf8");
  // Something in the phone block has to beat the id with its own id.
  const beats = /\.globeside\s+#lock(?![\[:])[^{]*\{[^}]*background:/.test(css);
  beats ? pass("the lock rests on the same tile as layers and shuffle")
    : fail("the three globe buttons rest alike",
           "nothing in web.css gives .globeside #lock a resting background, so the desktop id rule wins and the lock has no tile");
}


// ── the ticker measures its room against the bar, not itself ────────────────
// The crypto strip was invisible on every fresh open, on the web and in the
// app, until you dragged the window wider — then it appeared and stayed.
// Measured at 1024px: three rows of real prices in the DOM, every one carrying
// `hidden`, the strip itself 10px wide. Resized to 1180 and back to 1024: all
// three visible, 210px, at the same width that had just failed.
//
// Two faults, and it needed both. fitMarkets() asked `el.clientWidth` how much
// room it had, but the strip is `flex: 0 1 auto` with `min-width: 0`, so its
// width IS its content and its content is what fitMarkets decides — measured
// while the strip was still empty it read ~0 and hid everything "to fit".
// And renderMarkets' 1 Hz refresh takes a fast path when the symbols have not
// changed, which returns before fitMarkets, so nothing ever measured again.
// Only the resize listener broke the loop.
{
  console.log("\nthe ticker measures its room against the bar, not itself");
  const src = readSrc("src/renderer/explore-panels.js");
  const fit = src.match(/function fitMarkets\s*\(\)\s*\{([\s\S]*?)\n\}/);
  const bad = [];
  if (!fit) bad.push("fitMarkets is gone — this check is blind");
  else if (/\broom\s*=\s*\(\)\s*=>[^;]*\bel\.clientWidth/.test(fit[1]))
    bad.push("fitMarkets sizes the strip by its own clientWidth, which is the content it is deciding");
  // And it has to be able to measure a second time.
  const render = src.match(/async function renderMarkets\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/);
  if (render && /if \(sameShape\)/.test(render[1])) {
    const fast = render[1].slice(render[1].indexOf("if (sameShape)"));
    const upTo = fast.slice(0, fast.indexOf("\n  }"));
    if (!/fitMarkets\s*\(/.test(upTo))
      bad.push("the 1 Hz fast path returns without re-fitting, so one bad measurement is permanent");
  }
  // The reading that actually caused it: during boot nothing is laid out, so
  // the bar offers 0 room and all three coins measure 0 wide. A zero is not a
  // narrow bar, it is no answer, and acting on it is what made this permanent.
  if (fit && !/if \(room\(\)\s*<=\s*0\)\s*return/.test(fit[1]))
    bad.push("fitMarkets acts on a zero measurement instead of waiting for a real one");
  // And something has to ask again once the bar is real, because the 1 Hz tick
  // does not run while the window is hidden.
  if (!/new ResizeObserver\([^)]*\)[\s\S]{0,80}observe\(el\.parentElement\)/.test(src))
    bad.push("nothing re-fits when the bar gets its width");
  bad.length ? fail("the ticker measures its room against the bar", bad.join("; "))
    : pass("the strip asks the bar for its room, ignores a zero, and re-fits when the bar is real");
}


// ── on a phone, Settings does not switch off the tab bar ────────────────────
// The sheet inerts everything behind it, which is right for a desktop modal
// and wrong for a phone, where Settings IS one of the five tabs and sits under
// the bar on purpose. `inert` takes the whole subtree out of hit-testing, so
// the bar was there, lit, showing Settings as the current tab — and dead. Done
// really was the only way out.
//
// Measured: with the sheet shut, a hit test over the bar returns
// `button.tab, nav.tabbar, …`. With it open, `body, html` — no bar at all.
{
  console.log("\non a phone, Settings does not switch off the tab bar");
  const src = readSrc("web/sheet.js").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const behind = src.match(/const behind = \(\) =>([\s\S]*?);/);
  const gaps = [];
  if (!behind) gaps.push("behind() is gone — this check is blind");
  else if (!/phone\(\)/.test(behind[1]) || !/tabbar/.test(src))
    gaps.push("behind() inerts the phone's chrome, so the tab bar goes dead while Settings is open");
  // And the clearing has to cover every child, not just what behind() names
  // today — the viewport can cross the breakpoint while the sheet is open.
  if (!/for \(const el of document\.body\.children\) el\.inert = false/.test(src))
    gaps.push("inert is cleared through behind(), so a viewport change mid-sheet leaves a control dead");
  gaps.length ? fail("Settings does not switch off the tab bar", gaps.join("; "))
    : pass("the phone's chrome stays live while Settings is open, so any tab closes it");
}


// ── the search field counts against the globe's centre ──────────────────────
// centreGlobe centres the planet above the rail sheet's resting height, which
// is right and deliberate — it is what stops the Earth sliding around as
// panels come and go. But the search field drops in over the *top* of the
// globe on a phone, and nothing counted it: the planet stayed centred for the
// sheet alone, so opening Explore covered the sky and left the Earth sitting
// high in what was left of the view. "If you hit Explore, the search bar will
// stay open, which will kind of block the globe."
//
// box() above cannot see it either way: the field is `position: fixed`, and
// offsetParent is null for fixed elements, so it never entered the maths.
{
  console.log("\nthe search field counts against the globe's centre");
  const src = readSrc("src/renderer/explore-trackers.js");
  const fn = src.match(/function centreGlobe\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/);
  const gaps = [];
  if (!fn) gaps.push("centreGlobe is gone — this check is blind");
  else if (!/searchbar/.test(fn[1]))
    gaps.push("centreGlobe ignores the search field, which covers the top of the globe on a phone");
  // And it has to be asked again when the field appears, since showing it does
  // not resize the globe and so trips no observer.
  const bar = readSrc("web/phone-bar.js");
  if (!/sizeGlobe/.test(bar))
    gaps.push("nothing re-centres the globe when the search field opens or closes");
  gaps.length ? fail("the search field counts against the globe's centre", gaps.join("; "))
    : pass("the globe centres in what is left of the view once the search field is over it");
}


// ── the web version can show Privacy, Terms and the licences ───────────────
// src/docs.js exists to put those three in front of somebody before they
// decide whether to trust the app, and the Settings sheet already has the
// reader that renders them. The web build simply never carried them: the
// module was not wrapped, the files were not shipped, and web/bridge.js
// answered docsList with an empty list — so on the web and the iOS PWA there
// was no Privacy, no Terms and no licences at all, on an app that is public.
//
// The list in src/docs.js is an allowlist for good reasons (BUSINESS.md and
// DECK.md sit in the same folder), so this checks those three and no more.
{
  console.log("\nthe web version can show Privacy, Terms and the licences");
  const build = fs.readFileSync(R("scripts/build-web.mjs"), "utf8");
  const bridge = readSrc("web/bridge.js");
  const docs = fs.readFileSync(R("src/docs.js"), "utf8");
  const wanted = [...docs.matchAll(/file:\s*"([^"]+)"/g)].map((m) => m[1]);
  const gaps = [];
  if (!wanted.length) gaps.push("no documents found in src/docs.js — this check is blind");
  if (!/MODULES = \[[^\]]*"docs"/s.test(build)) gaps.push("build-web.mjs does not wrap src/docs.js");
  if (!/EXPOSE = \[[^\]]*"docs"/s.test(build)) gaps.push("build-web.mjs does not expose docs on AuralMods");
  // Derived from src/docs.js, not listed again — a second copy of an allowlist
  // is a second place to get it wrong — so what is checked is that it reads
  // that file, and then what actually came out of the build.
  if (!/src\/docs\.js/.test(build))
    gaps.push("build-web.mjs does not take its document list from src/docs.js");
  const mods = R("dist-web/web/modules.js");
  if (fs.existsSync(mods)) {
    const out = fs.readFileSync(mods, "utf8");
    for (const f of wanted) {
      const key = f.split("/").pop();
      if (!out.includes(JSON.stringify(key))) gaps.push(`the built bundle carries no ${key}`);
    }
  }
  if (/docsList:\s*empty/.test(bridge)) gaps.push("web/bridge.js still answers docsList with nothing");
  if (!/docsRead:/.test(bridge)) gaps.push("web/bridge.js has no docsRead");
  gaps.length ? fail("the web version can show Privacy, Terms and the licences", gaps.join("; "))
    : pass(`the web build carries all ${wanted.length} documents and can read them`);
}

// ── the splash's mark ships ─────────────────────────────────────────────────
// splash.js fetches its artwork and, by design, shrugs if the fetch fails —
// nothing may stop the app starting. That is also why deleting the old line
// globe (assets/icon-line.svg) went unnoticed: the splash quietly became onyx
// and a wordmark, with no error anywhere. So the file it asks for must exist,
// be committed rather than generated, and be inside build.files, or the
// packaged app would be the one place it is missing.
{
  console.log("\nthe splash's mark ships");
  const src = readSrc("src/renderer/splash.js");
  const wants = [...src.matchAll(/fetch\(\s*["']\.\.\/\.\.\/(assets\/[^"']+)["']/g)].map((m) => m[1]);
  const globRe = (g) => new RegExp("^" + g.replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "\u0000").replace(/\*/g, "[^/]*").replace(/\u0000/g, ".*") + "$");
  const shipped = (f) => pkg.build.files.some((g) => !g.startsWith("!") && globRe(g).test(f)) &&
                         !pkg.build.files.some((g) => g.startsWith("!") && globRe(g.slice(1)).test(f));
  const gaps = [];
  if (!wants.length) gaps.push("splash.js fetches no asset — this check is blind");
  for (const f of wants) {
    if (!fs.existsSync(R(f))) { gaps.push(`${f} does not exist`); continue; }
    try { execFileSync("git", ["ls-files", "--error-unmatch", f], { cwd: R("."), stdio: "ignore" }); }
    catch { gaps.push(`${f} is not committed`); }
    if (!shipped(f)) gaps.push(`${f} is outside build.files, so the packaged app has no mark`);
  }
  gaps.length ? fail("the splash's mark ships", gaps.join("; "))
    : pass(`the splash's ${wants.join(", ")} exists, is committed and is packaged`);
}

// ── chat speaks in short lines ──────────────────────────────────────────────
// The rule: about 30 characters a line. The chat's opening notice was 381 characters of italic in a
// panel people glance at, and the command replies ran to two sentences each.
// Everything the chat says: its strings in every language, and the literal
// text the slash commands answer with (the fixed part — a name is extra).
{
  console.log("\nchat speaks in short lines");
  const { strings, LANGUAGES } = await import(pathToFileURL(R("src/i18n.js")).href).then((m) => m.default || m);
  const KEYS = /^(chat\.|notes\.ask$|ctl\.trip|ctl\.somewhere)/;
  const long = [];
  for (const { code } of LANGUAGES) {
    const cap = code === "en" ? 32 : 36;
    for (const [k, v] of Object.entries(strings(code, "en"))) {
      if (KEYS.test(k) && String(v).replace("{who}", "").replace("{place}", "").length > cap) long.push(`${code} ${k} (${v.length})`);
    }
  }
  const cmds = readSrc("src/renderer/explore-commands.js");
  const said = [...cmds.matchAll(/systemLine\(\s*(["`])([\s\S]*?)\1\s*\)/g), ...cmds.matchAll(/hint:\s*(["'`])([\s\S]*?)\1/g)]
    .map((m) => m[2].replace(/\$\{[^}]*\}/g, "").trim());
  for (const line of said) if (line.length > 32) long.push(`command: "${line.slice(0, 40)}…" (${line.length})`);
  long.length ? fail("chat speaks in short lines", long.slice(0, 8).join("; ") + (long.length > 8 ? `; +${long.length - 8} more` : ""))
    : pass(`every chat string and command reply is 32 characters or fewer in English, 36 in translation`);
}

// ── world headlines do not hang on one gatekeeper ───────────────────────────
// World headlines were Google News' World topic, and on the web that request
// leaves from here.now's servers. Google answered it, on 2026-09-23, with its
// 503 "Sorry…" page for automated traffic — while a country edition through the
// same proxy returned 34 stories. World is where the panel opens, so the panel
// opened on nothing ("headlines are missing"). World now comes from several
// newsrooms' own feeds, and each needs a proxy route or it is a silent 404.
{
  console.log("\nworld headlines do not hang on one gatekeeper");
  const news = readSrc("src/news.js").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const build = readSrc("scripts/build-web.mjs");
  const bridge = readSrc("web/bridge.js");
  const gaps = [];
  const feeds = [...(news.match(/const WORLD_FEEDS = \[([\s\S]*?)\];/)?.[1] || "").matchAll(/url:\s*"([^"]+)"/g)].map((m) => m[1]);
  const hosts = new Set(feeds.map((u) => { try { return new URL(u).hostname; } catch { return u; } }));
  if (feeds.length < 2) gaps.push("src/news.js has no list of world feeds, so world headlines hang on one source");
  if ([...hosts].some((h) => /news\.google\./.test(h))) gaps.push("a world feed is Google News again");
  if (/\/topics\//.test(news)) gaps.push("news.js still asks for a Google News topic");
  if (!/WORLD_FEEDS/.test(build)) gaps.push("scripts/build-web.mjs does not write the feeds' proxy routes from WORLD_FEEDS");
  if (!/setFeedBase\(/.test(bridge)) gaps.push("web/bridge.js never points world headlines at the proxy routes");
  gaps.length ? fail("world headlines do not hang on one gatekeeper", gaps.join("; "))
    : pass(`world headlines come from ${hosts.size} newsrooms' own feeds, each with a route`);
}

// ── a country's headlines come from its own newsrooms ───────────────────────
// A country's headlines were Google News' edition for it. On the web that
// request leaves from the site's relay, and on 9 Oct 2026 Google refused the
// relay for every country tried (Indonesia six times out of six): "This place"
// and "Now playing" showed "Could not reach the headlines" on the web and the
// iPhone. Each country now has newsrooms of its own (src/news-feeds.js), each
// with a route, and the web asks nobody else. This runs the real module
// against a stubbed network.
{
  console.log("\na country's headlines come from its own newsrooms");
  const { createRequire } = await import("node:module");
  const req = createRequire(import.meta.url);
  const file = req.resolve(R("src/news.js"));
  const fresh = () => { delete req.cache[file]; const m = req(file); delete req.cache[file]; return m; };
  const gaps = [];
  const src = readSrc("src/news.js"), build = readSrc("scripts/build-web.mjs");
  let news = fresh();
  const feeds = news.COUNTRY_FEEDS || {}, all = Object.values(feeds).flat();
  const locales = [...src.matchAll(/"([^"]+)": \["[A-Z]{2}", "/g)].map((m) => m[1]);
  const bare = locales.filter((c) => !feeds[c]?.length);
  if (!all.length) gaps.push("src/news.js exports no COUNTRY_FEEDS");
  if (bare.length) gaps.push(`${bare.slice(0, 5).join(", ")}: a Google edition and no newsroom, so no headlines on the web`);
  const bad = all.filter((f) => !/^https:\/\/[^/]+\//.test(f.url || "") || /google\./.test(f.url) || !f.name || !/^[a-z]{2}-[a-z0-9]+$/.test(f.route || ""));
  if (bad.length) gaps.push(`${bad.slice(0, 3).map((f) => f.name || f.url).join(", ")}: not an https feed with a name and a route`);
  const routes = [...(news.WORLD_FEEDS || []), ...all].map((f) => f.route);
  if (new Set(routes).size !== routes.length) gaps.push("two feeds share a route, so one of them is never asked");
  if (!/COUNTRY_FEEDS/.test(build) || !/"news-feeds"/.test(build)) gaps.push("scripts/build-web.mjs does not carry the newsrooms or write their routes");
  if (all.length && !gaps.length) {
    const realFetch = globalThis.fetch, realLog = console.log, realWarn = console.warn;
    const rss = `<rss><channel><item><title>A headline long enough to be one</title><link>https://example.org/a</link><pubDate>Fri, 09 Oct 2026 10:00:00 GMT</pubDate></item></channel></rss>`;
    let asked = [], answer = () => new Response(rss, { status: 200 });
    globalThis.fetch = async (u) => { asked.push(String(u)); return answer(String(u)); };
    console.log = console.warn = () => {};
    try {
      const [country, list] = Object.entries(feeds).find(([c]) => locales.includes(c));
      // the web: its own routes, and nothing else
      news.setBase("/api/news"); news.setFeedBase("/api/feeds");
      const got = await news.get(country);
      if (!got.length || got[0].source !== list[0].name) gaps.push(`${country} on the web did not come back from its newsrooms`);
      if (!asked.length || asked.some((u) => !u.startsWith("/api/feeds/"))) gaps.push(`${country} on the web asked ${asked.find((u) => !u.startsWith("/api/feeds/")) || "nothing"}`);
      // the web, every newsroom down: no Google, and World still answers after
      news = fresh(); news.setBase("/api/news"); news.setFeedBase("/api/feeds");
      asked = []; answer = (u) => (list.some((f) => u.endsWith("/" + f.route)) ? new Response("no", { status: 503 }) : new Response(rss, { status: 200 }));
      let threw = false; try { await news.get(country); } catch { threw = true; }
      if (!threw) gaps.push("with every newsroom down, the web still returned something for the country");
      if (asked.some((u) => u.startsWith("/api/news"))) gaps.push("with every newsroom down, the web asked Google through the relay that Google refuses");
      let world = null; try { world = await news.get(null); } catch { /* reported below */ }
      if (!world?.length) gaps.push("a country's newsrooms failing stopped World headlines too");
      // the desktop, every newsroom down: Google's edition, as before
      news = fresh(); asked = []; answer = (u) => (/news\.google\.com/.test(u) ? new Response(rss, { status: 200 }) : new Response("no", { status: 503 }));
      let fell = null; try { fell = await news.get(country); } catch { /* reported below */ }
      if (!fell?.length || !asked.some((u) => /news\.google\.com/.test(u))) gaps.push("with every newsroom down, the desktop did not fall back to Google's edition");
    } catch (e) { gaps.push(`the check itself failed: ${e.message}`); }
    finally { globalThis.fetch = realFetch; console.log = realLog; console.warn = realWarn; }
  }
  gaps.length ? fail("a country's headlines come from its own newsrooms", gaps.join("; "))
    : pass(`${Object.keys(feeds).length} countries have ${all.length} newsrooms of their own, each with a route; the web asks nobody else`);
}

// ── world headlines read in the web app, and nothing pretends to ────────────
// The web version opened every headline in a new tab, because a page cannot
// fetch another site's article. The world feeds' stories now read in the app
// through a route per newsroom. Two ways that breaks quietly: a newsroom with
// no route (its stories fail as "does not open in AuralFM"), and a Google News
// link sent to the reader (it leads to Google, never the publisher, so it could
// only fail). This runs the real reader against a stubbed network.
{
  console.log("\nworld headlines read in the web app, and nothing pretends to");
  const { createRequire } = await import("node:module");
  const req = createRequire(import.meta.url);
  const file = req.resolve(R("src/news.js"));
  delete req.cache[file];
  const news = req(file);
  delete req.cache[file];
  const gaps = [];
  const build = readSrc("scripts/build-web.mjs");
  const after = readSrc("web/after.js").replace(/\/\*[\s\S]*?\*\//g, "");
  const feeds = news.WORLD_FEEDS || [];
  const noSite = feeds.filter((f) => !/^https:\/\/[^/]+$/.test(f.site || "")).map((f) => f.name);
  if (noSite.length) gaps.push(`no site for ${noSite.join(", ")}, so its stories cannot be read on the web`);
  if (!/\/api\/read\/\$\{f\.route\}\/\*/.test(build)) gaps.push("scripts/build-web.mjs writes no /api/read/<route>/* routes");
  if (!/setReadBase\(/.test(readSrc("web/bridge.js"))) gaps.push("web/bridge.js never points the reader at its routes");
  if (!/canReadArticle\(/.test(after)) gaps.push("web/after.js opens the reader without asking whether it can read the story");
  if (typeof news.setReadBase !== "function" || typeof news.canRead !== "function") gaps.push("news.js has no setReadBase/canRead");
  else {
    const realFetch = globalThis.fetch;
    const asked = [];
    const para = "<p>" + "A paragraph long enough to count as prose rather than a caption. ".repeat(2) + "</p>";
    globalThis.fetch = async (u) => { asked.push(String(u)); return new Response(`<title>T</title><article>${para.repeat(3)}</article>`, { status: 200 }); };
    try {
      news.setReadBase("/api/read");
      for (const f of feeds.filter((x) => x.site)) {
        const doc = await news.read(`${f.site}/news/story-1?x=1`);
        const want = `/api/read/${f.route}/news/story-1?x=1`;
        if (!doc?.paragraphs?.length) gaps.push(`a ${f.name} story did not read`);
        if (asked.at(-1) !== want) gaps.push(`a ${f.name} story was fetched from ${asked.at(-1)}, not ${want}`);
      }
      const google = "https://news.google.com/rss/articles/CBMiabc?oc=5";
      if (news.canRead(google)) gaps.push("the web reader says it can read a Google News link");
      const n = asked.length;
      if (await news.read(google)) gaps.push("the web reader read a Google News link");
      if (asked.length !== n) gaps.push("the web reader fetched a link no route serves");
    } finally { globalThis.fetch = realFetch; }
  }
  gaps.length ? fail("world headlines read in the web app, and nothing pretends to", gaps.join("; "))
    : pass(`${feeds.length} newsrooms' stories read through their own routes; Google links open out`);
}

// ── the taxonomy reads a station the way a listener would ──────────────────
// src/taxonomy.js sorts stations into genres, scenes, formats and moods from
// their tags, names and countries. Each case below is a way it went wrong while
// it was being written, or would: "classic hits" read as chart pop, "metallica"
// as metal, a Bangkok news station as Thai music, a hundred tags as everything.
{
  console.log("\nthe taxonomy reads a station the way a listener would");
  const { createRequire } = await import("node:module");
  const T = createRequire(import.meta.url)(R("src/taxonomy.js"));
  const soup = Array.from({ length: T.TAG_SOUP + 1 }, (_, i) => ["techno", "yoga", "christmas", "jazz"][i % 4] + (i > 3 ? i : ""));
  const cases = [
    [{ tags: ["hits"] }, "genres", "pop", true, "\"hits\" is chart pop"],
    [{ tags: ["classic hits"] }, "genres", "pop", false, "\"classic hits\" is oldies, not chart pop"],
    [{ tags: ["classic hits"] }, "moods", "feel-good", true, "\"classic hits\" feels good"],
    [{ tags: ["Hip-Hop"] }, "genres", "hip-hop", true, "\"Hip-Hop\" and \"hip hop\" are one"],
    [{ tags: ["metallica"] }, "genres", "metal", false, "\"metallica\" is a band, not the genre"],
    [{ tags: ["christian contemporary"] }, "genres", "christian", true, "a term inside a longer tag counts"],
    [{ tags: [], title: "Jazz FM 102" }, "genres", "jazz", true, "a station with no tags is found by an unmistakable name"],
    [{ tags: [], title: "Love FM" }, "moods", "love", false, "\"Love FM\" is a name, not a love-songs station"],
    [{ tags: ["pop"], country: "Japan" }, "genres", "j-pop", true, "pop from Japan is J-pop"],
    [{ tags: ["news"], country: "Thailand" }, "scenes", "thai", false, "a news station is not a music scene"],
    [{ tags: ["pop"], country: "Thailand" }, "scenes", "thai", true, "music from Thailand is the Thai scene"],
    [{ tags: soup }, "formats", "variety", true, "a station tagged with everything is Variety"],
    [{ tags: soup }, "genres", "techno", false, "…and is not every genre in its list"],
  ];
  const wrong = cases.filter(([st, axis, id, want]) =>
    T.classify({ title: "", country: "", ...st })[axis].includes(id) !== want);
  wrong.length
    ? fail("the taxonomy reads a station the way a listener would", wrong.map((c) => c[4]).join("; "))
    : pass(`${cases.length} readings hold: hits, classic hits, names, places, tag soup`);
}

// ── every require of package.json finds one ────────────────────────────────
// src/main/ipc-app.js read the build channel with require("../package.json"),
// written when it lived in src/main.js. After the split into src/main/ that
// named src/package.json, which does not exist; the try/catch around it made
// the failure silent, so every build reported no channel — no "beta" in About,
// and the studio (shown in beta builds) never appeared in an installed app.
{
  console.log("\nevery require of package.json finds one");
  const bad = [];
  const walk = (dir) => fs.readdirSync(R(dir), { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? (d.name === "vendor" ? [] : walk(`${dir}/${d.name}`)) : d.name.endsWith(".js") ? [`${dir}/${d.name}`] : []);
  for (const f of walk("src")) {
    for (const m of fs.readFileSync(R(f), "utf8").matchAll(/require\(\s*["'](\.{1,2}\/[^"']*package\.json)["']\s*\)/g)) {
      if (!fs.existsSync(path.resolve(path.dirname(R(f)), m[1]))) bad.push(`${f} requires ${m[1]}, which is not there`);
    }
  }
  bad.length ? fail("every require of package.json finds one", bad.join("; "))
    : pass("each relative require of package.json names a file that exists");
}

// ── the web launch screen lifts when the globe has painted ─────────────────
// The web and iPhone app carry their own launch screen (web/launch.js), because
// a page has no splash window: without it a slow phone showed seconds of blank
// page, then the interface with an empty hole where the globe would be. It is
// lifted by the same explore:ready moment that shows the desktop window, which
// the web bridge used to answer with a no-op. If that goes back to a no-op the
// screen only lifts on its 45-second floor; if reveal.js stops standing aside,
// the body fades in under the veil and the tour opens behind it.
{
  const name = "the web launch screen lifts when the globe has painted";
  console.log(`\n${name}`);
  const bad = [];
  const bridge = fs.readFileSync(R("web/bridge.js"), "utf8");
  if (!/exploreReady:\s*\(\)\s*=>\s*window\.AuralLaunch\?\.done\(\)/.test(bridge)) bad.push("web/bridge.js: exploreReady does not lift the launch screen");
  // Run launch.js against a small stand-in page and lift it.
  const cls = () => { const set = new Set(); return { add: (c) => set.add(c), remove: (c) => set.delete(c), contains: (c) => set.has(c) }; };
  const attrs = {};
  const veil = { classList: cls(), removeAttribute: (a) => delete attrs[a], setAttribute: (a, v) => (attrs[a] = v), remove() { veil.removed = true; },
    querySelector: (q) => (q === ".launch-say" ? say : q === ".launch-slow" ? slow : null) };
  const say = { dataset: {}, textContent: "" };
  const slow = { classList: cls(), removeAttribute() {} };
  const body = { classList: cls() };
  const timers = [];
  const ctx = { document: { body, getElementById: (id) => (id === "launch" ? veil : null) }, requestAnimationFrame: (f) => f(),
    setTimeout: (f, ms) => { timers.push([f, ms]); return timers.length; }, clearTimeout() {} };
  ctx.window = ctx;
  vm.runInNewContext(fs.readFileSync(R("web/launch.js"), "utf8"), ctx);
  if (!ctx.AuralLaunch) bad.push("web/launch.js does not define AuralLaunch");
  else {
    ctx.AuralLaunch.step("launch.globe", "Drawing the globe");
    if (say.textContent !== "Drawing the globe" || say.dataset.i18n !== "launch.globe") bad.push("step() does not say the step");
    ctx.AuralLaunch.done();
    for (const [f, ms] of timers) if (ms <= 1000) f();
    if (!body.classList.contains("revealed")) bad.push("done() does not reveal the page");
    if (!veil.classList.contains("gone") || !veil.removed) bad.push("done() does not take the launch screen away");
  }
  // reveal.js must stand aside while the launch screen is up.
  const rctx = { document: { getElementById: (id) => (id === "launch" ? {} : null), visibilityState: "visible", body: { classList: cls() }, addEventListener() {} },
    requestAnimationFrame: (f) => f(), setTimeout: (f) => f() };
  vm.runInNewContext(fs.readFileSync(R("src/renderer/reveal.js"), "utf8"), rctx);
  if (rctx.document.body.classList.contains("revealed")) bad.push("reveal.js reveals the page under the launch screen");
  bad.length ? fail(name, bad.join("; ")) : pass("the bridge lifts it on explore:ready, launch.js reveals and removes it, and reveal.js waits");
}

// ── a donation link is the station's own page, and never for a sanctioned country
// Stations that can't take a Lightning address (a 501(c)(3) like 8-Ball Radio)
// get a Donate link to their own page. It must be https, the
// station's own page before any platform, not a paid membership, and absent
// wherever tips are absent: Cuba, Iran, North Korea and Syria.
{
  const name = "a donation link is the station's own page, and never for a sanctioned country";
  console.log(`\n${name}`);
  const bad = [];
  if (!HAS_CAT) skip(name, NO_CAT); else {
  const src = fs.readFileSync(C("scripts/enrich.mjs"), "utf8");
  const a = src.indexOf("const GIVING"), b = src.indexOf("/**\n * What a homepage says");
  const donationPage = a < 0 || b < 0 ? null : new Function(src.slice(a, b) + "; return donationPage;")();
  if (!donationPage) bad.push("scripts/enrich.mjs has no donationPage()");
  else {
    const cases = [
      [["https://donorbox.org/x", "/donate"], "https://www.kexp.example/donate", "the station's own page before a platform"],
      [["https://www.paypal.com/donate?hosted_button_id=1"], "https://www.paypal.com/donate?hosted_button_id=1", "a PayPal donation"],
      [["http://kexp.example/donate"], undefined, "http is refused"],
      [["/supporters", "/membership", "/support"], undefined, "a membership or help page is not a donation"],
      [["https://pledge.kexp.example/give"], "https://pledge.kexp.example/give", "a giving page on its own subdomain"],
    ];
    for (const [hrefs, want, what] of cases) {
      const got = donationPage(hrefs, "https://www.kexp.example/");
      if (got !== want) bad.push(`${what}: got ${got}`);
    }
  }
  const prof = fs.readFileSync(C("scripts/profiles.mjs"), "utf8");
  if (!/donate:\s*NO_TIPS\.has\(c\.country\)\s*\?\s*undefined/.test(prof)) bad.push("scripts/profiles.mjs writes a donation page for a sanctioned country");
  const ui = fs.readFileSync(R("src/renderer/explore-profile.js"), "utf8");
  if (!/const donate = !p\.noTips && \/\^https:/.test(ui)) bad.push("the station card shows Donate without checking noTips and https");
  bad.length ? fail(name, bad.join("; ")) : pass("own page first, https only, no memberships, none where tips are barred");
  }
}

// ── the web app's offline cache asks only for files that exist ─────────────
// here.now's analytics showed 41 hits each on /data/profiles/profiles/00.json …
// ff.json: the service worker's precache list doubled the folder of anything in
// a subfolder, so every install asked for 256 files that do not exist. And had
// the paths been right, it would have put all 32 MB of station profiles on every
// phone, when they are meant to load one at a time as a station is opened. With
// a build present, every entry must be a real file and the whole must stay small.
{
  const name = "the web app's offline cache asks only for files that exist";
  console.log(`\n${name}`);
  const swFile = R("dist-web/sw.js");
  if (!fs.existsSync(swFile)) pass("no web build to check (run npm run web)");
  else {
    const m = fs.readFileSync(swFile, "utf8").match(/const SHELL = (\[[\s\S]*?\]);/);
    const list = m ? JSON.parse(m[1]) : null;
    const bad = [];
    let bytes = 0;
    if (!list) bad.push("dist-web/sw.js has no SHELL list");
    else for (const u of list) {
      const f = R(`dist-web/${u.split("?")[0].replace(/^\.\/?$/, "index.html") || "index.html"}`);
      if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { if (u !== "./") bad.push(u); continue; }
      bytes += fs.statSync(f).size;
    }
    const mb = bytes / 1e6;
    if (bad.length) fail(name, `${bad.length} missing, e.g. ${bad.slice(0, 3).join(", ")}`);
    else if (mb > 25) fail(name, `the precache is ${mb.toFixed(1)} MB; station profiles belong on demand`);
    else pass(`${list.length} files, ${mb.toFixed(1)} MB, every one present`);
  }
}

// ── nothing secret is ever in a published folder ───────────────────────────
// Scanners ask every site for /.env, /.env.production, /.git/config (here.now's
// analytics, 27 Sept: dozens a day). here.now refuses hidden files, but the only
// sure defence is that no such file is ever in dist-web/ (the sites hold the
// same check in AuralFM/site). Keys live in ~/.herenow and ~/.resend, outside
// the repo.
{
  const name = "nothing secret is ever in a published folder";
  console.log(`\n${name}`);
  const SECRET = /^(\.env(\..*)?|\.git|\.npmrc|id_rsa.*|.*\.pem|.*\.key|credentials(\..*)?|\.netrc)$/i;
  const bad = [];
  const walk = (dir) => { for (const e of fs.readdirSync(R(dir), { withFileTypes: true })) {
    if (SECRET.test(e.name)) bad.push(`${dir}/${e.name}`);
    else if (e.isDirectory() && e.name !== "node_modules") walk(`${dir}/${e.name}`);
  } };
  if (fs.existsSync(R("dist-web"))) walk("dist-web");
  bad.length ? fail(name, bad.join(", ")) : pass("no .env, .git, keys or credentials in the published folder");
}

// ── a station plays from its own server, and no other directory is asked ──
// The catalogue began as radio.garden's, and the desktop resolved every one of
// those stations through radio.garden's listen endpoint — which answers only
// requests that look like its own website, so the app sent a borrowed Chrome
// User-Agent and radio.garden's Referer. The web app used the same endpoint as
// a fallback. Both are gone. This fails
// if any code the apps run names radio.garden or sends a Referer, and, with the
// network faked, if resolving a station asks anything but radio-browser: by id
// when the station has one, else not at all (its own stream, from its profile).
{
  const name = "a station plays from its own server, and no other directory is asked";
  console.log("\na station plays from its own server, and no other directory is asked");
  const bad = [];
  const code = (f) => fs.readFileSync(R(f), "utf8").split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
  const runtime = [...fs.readdirSync(R("src")).filter((f) => f.endsWith(".js")).map((f) => `src/${f}`),
    ...fs.readdirSync(R("src/main")).filter((f) => f.endsWith(".js")).map((f) => `src/main/${f}`),
    ...fs.readdirSync(R("src/renderer")).filter((f) => f.endsWith(".js")).map((f) => `src/renderer/${f}`),
    ...fs.readdirSync(R("web")).filter((f) => f.endsWith(".js")).map((f) => `web/${f}`)];
  for (const f of runtime) {
    const c = code(f);
    if (/radio\.garden/i.test(c)) bad.push(`${f} names radio.garden`);
    if (/["']Referer["']\s*:/i.test(c)) bad.push(`${f} sends a Referer header`);
  }
  const { createRequire } = await import("node:module");
  const resolver = createRequire(import.meta.url)(R("src/resolver.js"));
  const profiles = createRequire(import.meta.url)(R("src/profiles.js"));
  const real = globalThis.fetch, asked = [];
  globalThis.fetch = async (u) => {
    asked.push(String(u));
    return new Response(JSON.stringify([{ url_resolved: "https://stream.example/live", lastcheckok: 1 }]),
      { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const got = await resolver.resolve({ id: "af-test0000", title: "Test", country: "", rbuuid: "0000" });
    if (got?.url !== "https://stream.example/live" || !asked.some((u) => u.includes("/json/stations/byuuid/0000")))
      bad.push(`with a radio-browser id: asked ${asked.join(", ") || "nothing"}, got ${got?.url || "no stream"}`);
    // A station with a stream of its own and no radio-browser id: nothing asked.
    const shard = fs.existsSync(R("data/profiles")) ? fs.readdirSync(R("data/profiles")).find((f) => f.endsWith(".json")) : null;
    const withStream = shard && Object.values(JSON.parse(fs.readFileSync(R(`data/profiles/${shard}`), "utf8"))).find((p) => p.stream);
    if (withStream) {
      asked.length = 0;
      const own = await resolver.resolve({ id: withStream.id, title: withStream.title, country: withStream.country });
      if (own?.url !== profiles.profile(withStream.id)?.stream || asked.length)
        bad.push(`with its own stream: asked ${asked.join(", ") || "nothing"}, got ${own?.url || "no stream"}`);
    }
  } finally { globalThis.fetch = real; }
  if (asked.some((u) => /radio\.garden/.test(u))) bad.push("radio.garden was asked");
  bad.length ? fail(name, bad.join("; ")) : pass("radio-browser by id, else the station's own stream; radio.garden named nowhere the apps run");
}

// ── a station's profile is found where it was filed ───────────────────────
// scripts/profiles.mjs files each profile under a hash of the station id; the
// desktop (src/profiles.js) and the web (web/bridge.js) look it up by the same
// hash. Three copies of one function: if one drifts, every profile opens empty
// on that side and nothing says why. Compared by running all three.
{
  console.log("\na station's profile is found where it was filed");
  const { createRequire } = await import("node:module");
  const { pathToFileURL } = await import("node:url");
  const desktop = createRequire(import.meta.url)(R("src/profiles.js")).shardOf;
  const build = HAS_CAT ? (await import(pathToFileURL(C("scripts/lib/shard.mjs")).href).catch(() => null))?.shardOf : desktop;
  const bridgeSrc = fs.readFileSync(R("web/bridge.js"), "utf8");
  const body = /const shardOf = \(id\) => \{([\s\S]*?)\n\s*\};/.exec(bridgeSrc)?.[1];
  const web = body ? new Function("id", body) : null;
  const ids = ["af-3k9m2qx7", "af-0000zzzz", "k3hL3UUv", "x", "af-t4pd8w1n"];
  const bad = !build ? "scripts/lib/shard.mjs exports no shardOf" : !web ? "web/bridge.js has no shardOf" :
    ids.filter((id) => !(desktop(id) === build(id) && build(id) === web(id))).map((id) => `${id}: ${desktop(id)}/${build(id)}/${web(id)}`).join(", ");
  bad ? fail("a station's profile is found where it was filed", bad)
      : pass("the build, the desktop and the web file a profile under the same hash");
}

// ── "Hide explicit stations" hides them ───────────────────────────────────
// Explicit stations are listed and labelled; the setting
// leaves them out of lists, search and shuffle. Checked on the real catalogue:
// an explicit station is found by its name with the setting off, not with it on.
{
  console.log("\n\"Hide explicit stations\" hides them");
  const { createRequire } = await import("node:module");
  const cat = createRequire(import.meta.url)(R("src/catalog.js"));
  if (!fs.existsSync(R("data/stations.min.json"))) skip("\"Hide explicit stations\" hides them", "no catalogue — runs locally");
  else {
    const log = console.log; console.log = () => {}; cat.load(); console.log = log;
    const min = JSON.parse(fs.readFileSync(R("data/stations.min.json"), "utf8"));
    const x = min.c.find((c) => c[7] === 1);
    if (!x) skip("\"Hide explicit stations\" hides them", "the catalogue has no explicit station to try");
    else {
      cat.setHideExplicit(false);
      const shown = cat.search(x[1], 200).some((s) => s.id === x[0] && s.explicit);
      cat.setHideExplicit(true);
      const hidden = !cat.search(x[1], 200).some((s) => s.id === x[0]);
      cat.setHideExplicit(false);
      shown && hidden ? pass(`"${x[1]}" is listed and marked, and gone with the setting on`)
        : fail("\"Hide explicit stations\" hides them", `${shown ? "" : "not listed and marked with the setting off; "}${hidden ? "" : "still found with it on"}`);
    }
  }
}

// ── foreign music stations are held back in the UK and the EU ──────────────
// Option 3 of docs/LEGAL-AND-SECURITY.md §9: on London time a
// US music station is listed but held, a UK one and a speech station elsewhere
// are not, the shuffle lands only on what can play, and the two places that
// start a stream (the desktop's resolve, the web bridge's tune) ask first. On
// Los Angeles time nothing at all is held.
{
  const name = "foreign music stations are held back in the UK and the EU, and nowhere else";
  console.log("\nforeign music stations are held back in the UK and the EU");
  const { createRequire } = await import("node:module");
  const cat = createRequire(import.meta.url)(R("src/catalog.js"));
  if (!fs.existsSync(R("data/stations.min.json"))) skip(name, "no catalogue — runs locally");
  else {
    const log = console.log; console.log = () => {}; cat.load(); console.log = log;
    const min = JSON.parse(fs.readFileSync(R("data/stations.min.json"), "utf8"));
    const country = (c) => min.p[c[2]][1];
    const us = min.c.find((c) => country(c) === "United States" && c[8] !== 1 && c[4]);
    const uk = min.c.find((c) => country(c) === "United Kingdom");
    const talk = min.c.find((c) => country(c) === "United States" && c[8] === 1);
    const bad = [];
    if (!us || !uk || !talk) bad.push("the catalogue has no speech slot (run scripts/profiles.mjs)");
    else {
      cat.setRegion("Europe/London");
      if (!cat.held({ id: us[0] }) || !cat.byId(us[0])?.held) bad.push(`"${us[1]}" (US music) plays in London`);
      if (cat.held({ id: uk[0] })) bad.push(`"${uk[1]}" (UK) is held in London`);
      if (cat.held({ id: talk[0] })) bad.push(`"${talk[1]}" (US talk) is held in London`);
      if (cat.held({ id: "my:abc" })) bad.push("a station of your own is held");
      for (let k = 0; k < 40; k++) { const r = cat.randomChannel(); if (!r || r.held) { bad.push("the shuffle landed on a held station, or nothing"); break; } }
      cat.setRegion("America/Los_Angeles");
      if (cat.held({ id: us[0] }) || cat.held({ id: uk[0] })) bad.push("something is held in Los Angeles");
      cat.setRegion();
    }
    const ipc = fs.readFileSync(R("src/main/ipc-catalog.js"), "utf8");
    const bridge = fs.readFileSync(R("web/bridge.js"), "utf8");
    if (!/catalog\.held\(ch\)\)\s*return \{ held: true \}/.test(ipc)) bad.push("the desktop resolves a stream without asking catalog.held");
    if (!/M\.catalog\.held\(ch\)\) return setStatus/.test(bridge)) bad.push("the web bridge tunes without asking catalog.held");
    bad.length ? fail(name, bad.join("; ")) : pass(`"${us[1]}" is held in London and plays in Los Angeles; "${uk[1]}" and "${talk[1]}" play in both`);
  }
}

// ── headphones: a pause from outside is heard, and headphones off is sound off ─
// Two faults found on 2026-09-24. On an iPhone, iOS pauses the page itself when
// AirPods come out or disconnect, and for calls and Siri; the web player kept
// saying it was live, so play did nothing. On the Mac, AirPods disconnecting
// moved macOS to the built-in speakers and the radio followed — out loud.
// Plus the way to AirPods on iPhone, Safari's own route picker, which the
// output button had no way to reach.
{
  console.log("\nheadphones: a pause from outside is heard, and headphones off is sound off");
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const bridge = strip(readSrc("web/bridge.js"));
  const after = strip(readSrc("web/after.js"));
  const pop = strip(readSrc("src/renderer/popover.js"));
  const gaps = [];
  const pauseHandler = bridge.match(/audio\.addEventListener\("pause",[\s\S]*?\}\);/)?.[0] || "";
  if (!/if \(!live[^)]*\) return;[\s\S]*stop\(/.test(pauseHandler)) gaps.push("web: a pause iOS makes (AirPods out, a call) leaves the player saying it is live");
  // stop takes the status to show; handed to the media session bare, the
  // browser's action details become that status.
  if (/setActionHandler\("(pause|stop)", stop\)/.test(bridge)) gaps.push("web: the lock screen's pause passes its event object to stop()");
  if (!/setActionHandler\("previoustrack"/.test(bridge)) gaps.push("web: previous (triple-press, lock screen) does nothing");
  if (!/webkitShowPlaybackTargetPicker/.test(bridge) || !/pickOutput\(\)/.test(after)) gaps.push("web: the output button cannot open iOS's route picker");
  if (!/audioSession\.type = "playback"/.test(bridge)) gaps.push("web: the page never tells iOS it is a player");
  if (!/"devicechange",[^\n]*pauseIfOutputGone\(\)/.test(pop)) gaps.push("desktop: headphones disconnecting moves the radio to the speakers");
  if (!/if \(outs\.some\(\(d\) => d\.groupId === was\)\) return;\s*stop\(\)/.test(pop)) gaps.push("desktop: the disconnect check no longer stops playback");
  gaps.length ? fail("headphones: a pause from outside is heard, and headphones off is sound off", gaps.join("; "))
    : pass("iOS pauses are followed, previous and the route picker work, and the Mac pauses when its headphones go");
}

// ── a phone is shown how to install, not a tour of a desktop ────────────────
// Reported from an iPhone on 2026-09-24: the introduction's Headlines and
// Favorites tips pointed at the top left corner, because they anchor to the
// toolbar a phone does not have. And the thing a new phone user needed first —
// how to put the app on the home screen — was nowhere. This runs web/install.js
// against a stubbed page as an iPhone in Safari, the installed app, a phone
// that is not an iPhone, and a laptop.
{
  console.log("\na phone is shown how to install, not a tour of a desktop");
  const src = readSrc("web/install.js");
  const build = readSrc("scripts/build-web.mjs");
  const PHONE = "(max-width: 700px), (pointer: coarse) and (max-height: 500px)";
  const run = ({ ua, phone = false, standalone = false, search = "" }) => {
    let tourCalls = 0, shown = 0;
    const timers = [];     // run by hand below: the guide's own steps re-arm forever
    const el = () => ({ classList: { toggle() {}, contains: () => true }, dataset: {}, style: {},
      setAttribute() {}, addEventListener() {}, querySelectorAll: () => [], querySelector: () => el(),
      append() {}, remove() {}, innerHTML: "" });
    const body = { ...el(), append: () => { shown++; } };
    const ctx = {
      navigator: { userAgent: ua, platform: /iPhone/.test(ua) ? "iPhone" : "MacIntel", maxTouchPoints: /iPhone/.test(ua) ? 5 : 0, standalone },
      matchMedia: (q) => ({ matches: q === PHONE ? phone : q === "(display-mode: standalone)" ? standalone : false }),
      location: { search }, localStorage: { getItem: () => null, setItem() {} },
      document: { body, createElement: el }, setTimeout: (f) => timers.push(f), clearTimeout() {},
      addEventListener() {}, removeEventListener() {}, MutationObserver: class { observe() {} disconnect() {} },
      URLSearchParams,
    };
    ctx.window = ctx;
    ctx.Tour = { maybeStart: () => { tourCalls++; } };
    vm.runInNewContext(src, ctx);
    ctx.Tour.maybeStart({ tourSeen: false });
    for (let i = 0; i < 3 && i < timers.length; i++) timers[i]();   // show, then a step or two
    return { tourCalls, shown };
  };
  const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1";
  const ANDROID = "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36";
  const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/26.0 Safari/605.1.15";
  const gaps = [];
  try {
    const safari = run({ ua: IPHONE, phone: true });
    if (!safari.shown) gaps.push("an iPhone in Safari is not shown how to add the app");
    if (safari.tourCalls) gaps.push("an iPhone gets the tour");
    const home = run({ ua: IPHONE, phone: true, standalone: true });
    if (home.shown) gaps.push("the home-screen app is told to add itself to the home screen");
    if (home.tourCalls) gaps.push("the home-screen app on a phone gets the tour");
    if (run({ ua: ANDROID, phone: true }).tourCalls) gaps.push("a phone that is not an iPhone gets the tour");
    const laptop = run({ ua: MAC });
    if (laptop.shown) gaps.push("a laptop is shown the iPhone install steps");
    if (laptop.tourCalls !== 1) gaps.push("a laptop no longer gets the tour");
    if (!run({ ua: MAC, search: "?go=install" }).shown) gaps.push("?go=install does not show the guide");
  } catch (err) { gaps.push(`web/install.js did not run: ${err.message}`); }
  if (!/"web\/after\.js", "web\/install\.js"/.test(build)) gaps.push("scripts/build-web.mjs does not load web/install.js before explore.js");
  gaps.length ? fail("a phone is shown how to install, not a tour of a desktop", gaps.join("; "))
    : pass("iPhone in Safari: install steps, no tour; home-screen app: neither; laptop: the tour");
}

// ── the phone layout is one question, asked the same way everywhere ────────
// A landscape iPhone is 844pt wide or more, and "phone" was `max-width: 700px`,
// so a phone on its side got the desktop layout — toolbar, side rail, volume
// slider and ticker in 390pt of height. The fix is a second clause (a touch
// screen under 500pt tall), and it has to be in every place that asks: the
// stylesheet's phone block, the three scripts that move and drag things, and
// the one that keeps the tour off a phone. One that still asks the old question
// lays out a phone while another treats it as a desktop, which is a broken
// screen, not a style difference.
{
  console.log("\nthe phone layout is one question");
  const css = readSrc("web/web.css");
  const block = css.match(/\/\* ── phones[\s\S]*?\*\/\s*@media ([^{]+)\{/);
  const asked = { "web/web.css": block ? block[1].trim() : null };
  for (const f of ["web/phone-bar.js", "web/rail-sheet.js", "web/sheet.js", "web/install.js"]) {
    const m = readSrc(f).match(/matchMedia\("([^"]+)"\)/);
    asked[f] = m ? m[1] : null;
  }
  const values = new Set(Object.values(asked));
  const gaps = [];
  if (Object.values(asked).includes(null))
    gaps.push(`no phone query found in ${Object.keys(asked).filter((k) => !asked[k]).join(", ")} — this check is blind`);
  else if (values.size > 1)
    gaps.push(Object.entries(asked).map(([f, q]) => `${f}: "${q}"`).join("; "));
  else if (!/max-height/.test([...values][0]))
    gaps.push("the phone query is width alone, so a phone on its side gets the desktop layout");
  gaps.length ? fail("the phone layout is one question", gaps.join("; "))
    : pass(`all ${Object.keys(asked).length} ask "${[...values][0]}"`);
}

// ── the phone block does not reach into Settings on a laptop ────────────────
// web.css is linked into every page, Settings included, and Settings is an
// iframe about 560px wide. A width query asked inside it is true on a 1440px
// laptop, so the anti-zoom rule set the language menu in 16px beside 12px
// controls. Only a touch screen zooms into a field, so the rule has to ask
// for a coarse pointer as well as a narrow viewport.
{
  console.log("\nthe phone block does not reach into Settings on a laptop");
  const css = readSrc("web/web.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const rule = css.match(/(@media[^{]*\{\s*)?input,\s*select,\s*textarea\s*\{\s*font-size:\s*16px/);
  !rule ? fail("the phone block does not reach into Settings on a laptop", "no 16px field rule found — this check is blind")
    : /pointer:\s*coarse/.test(rule[1] || "") ? pass("the 16px field rule asks for a touch screen")
    : fail("the phone block does not reach into Settings on a laptop", "the 16px field rule answers to width alone, so the Settings iframe on a laptop gets it");
}

// ── headlines say when they failed, and the newest answer wins ──────────────
// Reported from the iOS PWA on 2026-09-23 as "sometimes it works, sometimes it
// doesn't". Four faults, each enough on its own:
//  - news.get() answered a failure with [], so the panel's "Could not reach the
//    headlines · Try again" state was unreachable: a dropped request on a phone
//    read as "unavailable right now", with a cooldown behind it of up to 30
//    minutes across every country;
//  - Try again called loadNews(), which does nothing for World or This place;
//  - renders overlapped with no token, so the slowest answer painted last —
//    a panel headed "France" could fill with the world edition;
//  - every player status message repainted the panel, flashing it back to
//    placeholders and fetching again while a station buffered.
{
  console.log("\nheadlines say when they failed, and the newest answer wins");
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const news = strip(readSrc("src/news.js"));
  const panels = strip(readSrc("src/renderer/explore-panels.js"));
  const playback = strip(readSrc("src/renderer/explore-playback.js"));
  const gaps = [];
  const get = news.match(/async function get\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/);
  if (!get) gaps.push("news.get is gone — this check is blind");
  else {
    if (/return\s*\[\s*\]/.test(get[1])) gaps.push("news.get answers a failure with [], which the panel reads as 'no headlines'");
    if (!/throw\b/.test(get[1])) gaps.push("news.get never throws, so the panel cannot tell a failure from an empty feed");
  }
  const render = panels.match(/async function renderNewsPanel\s*\(\)\s*\{([\s\S]*?)\n\}/);
  if (!render) gaps.push("renderNewsPanel is gone — this check is blind");
  else {
    const body = render[1];
    const token = body.match(/const (\w+) = \+\+(\w+);/);
    if (!token || !new RegExp(`${token[1]}\\s*!==\\s*${token[2]}`).test(body))
      gaps.push("renderNewsPanel has no token, so an older answer can paint over a newer one");
    const retry = body.match(/again\.onclick\s*=\s*([^;]+);/);
    if (retry && /loadNews/.test(retry[1])) gaps.push("Try again calls loadNews, which does nothing for World or This place");
  }
  if (/renderNewsPanel\s*\(/.test(playback))
    gaps.push("the player's status handler repaints the headlines on every message");
  gaps.length ? fail("headlines say when they failed", gaps.join("; "))
    : pass("a failed fetch offers Try again, which retries, and only the newest render paints");
}


// ── a phone does not keep a hover ───────────────────────────────────────────
// A touch browser leaves :hover on the last thing tapped. On the iPhone app the
// star stayed lit after it was switched off, a row looked selected when nothing
// was, and a tap on the ticker paused it until the next tap somewhere else
// (4 Oct 2026, the mobile-native pass). Every :hover rule in the app's pages
// and in web.css sits inside `@media (hover:hover)`, on its own line.
{
  console.log("\na phone does not keep a hover");
  const bare = [];
  for (const f of ["src/renderer/explore.html", "src/renderer/settings.html", "web/web.css"]) {
    const src = fs.readFileSync(R(f), "utf8").replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
    src.split("\n").forEach((line, i) => {
      if (/:hover/.test(line) && /\{/.test(line) && !/@media \(hover: ?hover\)/.test(line)) bare.push(`${f}:${i + 1}`);
    });
  }
  bare.length ? fail("a phone does not keep a hover", `:hover outside @media (hover:hover) at ${bare.slice(0, 6).join(", ")}`)
    : pass("every :hover rule is inside @media (hover:hover)");
}

// ── the player row stays over a moving panel ────────────────────────────────
// On the iPhone app, with a station cued, dragging Headlines or Chat blanked
// the player row: name, star, play and share gone, only the wave left (8 Oct
// 2026). Those panels run on underneath the row and become a layer while they
// move; WebKit then painted the row's contents beneath them. The row is a
// layer of its own on a phone, which keeps it above.
{
  console.log("\nthe player row stays over a moving panel");
  const css = fs.readFileSync(R("web/web.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const row = css.match(/body\.phonebar \.now \{([^}]*)\}/)?.[1] ?? "";
  const under = /\.newspanel, #layers, \.chatpanel \{[^}]*z-index: 4/.test(css) && /z-index: 5/.test(row);
  !under ? fail("the player row stays over a moving panel", "the panels no longer pass under the row at z-index 4 and 5: re-read this check")
    : /will-change:\s*transform/.test(row) ? pass("the phone's player row is its own layer, above the panels that pass under it")
    : fail("the player row stays over a moving panel", "body.phonebar .now has no will-change: transform, so WebKit can paint it under a dragged panel");
}

// ── a phone gets the half-size globe ────────────────────────────────────────
// Four 4096-pixel textures are about 180 MB of graphics memory with their
// mipmaps: what makes iOS discard a web app and reload it. The web build makes
// 2048-pixel copies (vendor/lite/) and every picture the globe loads goes
// through texUrl(), which picks them on a phone.
{
  console.log("\na phone gets the half-size globe");
  const gaps = [];
  const direct = [];
  for (const f of EXPLORE_FILES) {
    const code = fs.readFileSync(R(f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    if (/["'`]vendor\/(earth-|night-sky)/.test(code)) direct.push(f);
  }
  if (direct.length) gaps.push(`${direct.join(", ")} names a globe picture without texUrl()`);
  if (!/const texUrl\s*=/.test(readSrc("src/renderer/explore-core.js"))) gaps.push("texUrl() is gone from explore-core.js");
  if (!/window\.AuralLite\s*=\s*matchMedia/.test(readSrc("web/bridge.js"))) gaps.push("web/bridge.js no longer sets AuralLite");
  const lite = R("dist-web/vendor/lite");
  if (!fs.existsSync(R("dist-web"))) skip("a phone gets the half-size globe: the build", "dist-web/ is not built");
  else {
    // [the phone's copy, the full one it is made from]
    for (const [f, from = f] of [["earth-blue-marble.jpg"], ["earth-night.jpg"], ["earth-lights.jpg"], ["night-sky.jpg", "night-sky.png"], ["earth-topology.png"]]) {
      const file = path.join(lite, f);
      if (!fs.existsSync(file)) { gaps.push(`dist-web/vendor/lite/${f} is missing`); continue; }
      const full = path.join(R("dist-web/vendor"), from);
      // The night sky was a 1.2 MB PNG on every phone's first visit.
      if (f === "night-sky.jpg" && fs.statSync(file).size > 600 * 1024) gaps.push(`the phone's night sky is ${Math.round(fs.statSync(file).size / 1024)} KB`);
      // A JPEG's or PNG's width, read from its header.
      const width = (p) => {
        const b = fs.readFileSync(p);
        if (b[0] === 0x89) return b.readUInt32BE(16);
        for (let i = 2; i < b.length - 9;) { if (b[i] !== 0xFF) break; const m = b[i + 1]; if (m >= 0xC0 && m <= 0xC3) return b.readUInt16BE(i + 7); i += 2 + b.readUInt16BE(i + 2); }
        return 0;
      };
      if (width(file) > 2048 || (fs.existsSync(full) && width(file) >= width(full))) gaps.push(`vendor/lite/${f} is ${width(file)}px wide, no smaller than the full one`);
    }
  }
  gaps.length ? fail("a phone gets the half-size globe", gaps.join("; "))
    : pass("every globe picture goes through texUrl(), and the build carries 2048px copies");
}

// ── a description is words, and a name is a name ────────────────────────────
// 2,190 stations showed their description as "&#x62F;&#x627;…": pages in
// Arabic, Russian and Thai write letters as hexadecimal references and the
// decoder knew only decimal ones. Twenty more were "named" by a stream URL
// pasted into the name field, which no list or card can wrap. Both were found
// by throwing the catalogue's own worst cases at the phone layout (break-ui).
{
  console.log("\na description is words, and a name is a name");
  const gaps = [];
  if (!HAS_CAT) skip("a description is words, and a name is a name", NO_CAT); else {
  const { pathToFileURL } = await import("node:url");
  const { decodeEntities } = await import(pathToFileURL(C("scripts/lib/entities.mjs")).href);
  const { urlTitle } = await import(pathToFileURL(C("scripts/lib/match.mjs")).href);
  const cases = [["&#x62F;&#x627;&#x631;", "دار"], ["Caf&eacute; &amp; bar", "Café & bar"], ["&amp;#1056;&#1072;&#1076;&#1080;&#1086;", "Радио"], ["R&B", "R&B"]];
  for (const [inp, want] of cases) if (decodeEntities(inp) !== want) gaps.push(`decodeEntities(${inp}) gives ${decodeEntities(inp)}, not ${want}`);
  if (!urlTitle("https://stream.example.com/live.mp3") || urlTitle("Radio https://example.com") || urlTitle("KEXP 90.3")) gaps.push("urlTitle no longer tells a web address from a name");
  const min = R("data/stations.min.json"), prof = R("data/profiles");
  if (!fs.existsSync(min) || !fs.existsSync(prof)) skip("a description is words: the catalogue", "data/ is not built");
  else {
    const named = JSON.parse(fs.readFileSync(min, "utf8")).c.filter((c) => urlTitle(c[1])).length;
    if (named) gaps.push(`${named} station(s) in the bundle are named by a web address`);
    let coded = 0;
    for (const f of fs.readdirSync(prof)) if (/&#x?[0-9a-f]{2,6};/i.test(fs.readFileSync(path.join(prof, f), "utf8"))) coded++;
    if (coded) gaps.push(`${coded} profile file(s) still carry character references`);
  }
  gaps.length ? fail("a description is words, and a name is a name", gaps.join("; "))
    : pass("character references are decoded (decimal, hex, named, twice-escaped) and no station is named by a URL");
  }
}

// ── the broadcast desk ───────────────────────────────────────────────────────
// With the studio open the stations fold away and the town's messages take the
// rail (5 Oct 2026). Two things it rests on. The globe is centred between the
// panels by measuring them, and the studio was not one of the panels measured:
// opened, it sat on top of half the planet. And a host stands in the town they
// chose with no label until the show is live: a name goes out as "what is
// playing", and a show that is not on air must not be announced as one.
{
  console.log("\nthe broadcast desk");
  const gaps = [];
  if (!/getElementById\("studiopanel"\)\]/.test(readSrc("src/renderer/explore-trackers.js"))) gaps.push("centreGlobe does not measure the studio panel");
  for (const f of ["src/main.js", "web/messaging.js"]) {
    const src = readSrc(f);
    if (!/const ch = hosting \|\| \(/.test(src)) gaps.push(`${f}: a host's town does not stand in for a station's`);
    // Off air (the studio open, or listening to someone else's show) the town is
    // joined with no label; only a show that is live goes out with its name.
    if (!/nostr\.join\(ch\.lat, ch\.lon, hosting \? \(hosting\.live \? hosting\.title : ""\) : ch\.title \|\| "", !!hosting\?\.live\)/.test(src)) gaps.push(`${f}: a show's town is joined with a label when the show is not live`);
  }
  if (!/body\.studio-open \.stations\{display:none\}/.test(readSrc("src/renderer/explore.html"))) gaps.push("the stations card does not fold away with the studio open");
  gaps.length ? fail("the broadcast desk", gaps.join("; "))
    : pass("the studio open: the globe sits between the panels, and the host's town carries the show's name only while live");
}

// ── the installed phone app reaches the bottom of the screen ────────────────
// With the sky behind the status bar, iOS lays the page out short by the status
// bar's height and leaves a blank strip under the tab bar. Adding the strip to
// "100dvh" overshot by as much again on an iPhone (the tab bar's labels went off the screen): that height is not a
// steady number there. So the page is given the screen's own height. Ways to
// bring either bug back: lean on dvh again; do it under the opaque bar (there
// the page starts lower and the tab bar would leave the screen); hold the
// height while the keyboard is up; drop the containment, so the bars reach
// the bottom and every sheet stops short of it; pin the page with position:
// fixed (iOS clips that at the short window: the tab labels vanished); or
// leave the taller page free to scroll, which let a change of focus slide the
// whole app up.
{
  console.log("\nthe installed phone app reaches the bottom of the screen");
  const css = readSrc("web/web.css"), bridge = readSrc("web/bridge.js");
  const gaps = [];
  if (!/html\.tail body \{ height: var\(--tall\); contain: layout; overflow: clip; \}/.test(css)) gaps.push("the body is not the screen's height, clipped, with fixed panels measured from it");
  // Pinned with position: fixed, iOS cuts the page off at the short window it
  // believes in, and the tab bar's labels vanish into the strip.
  if (/html\.tail body \{[^}]*position: fixed/.test(css)) gaps.push("the page is pinned with position: fixed, which iOS clips at the short window");
  // Taller and free to scroll, a change of focus slides the whole app up.
  if (!/const unscroll = \(\) => \{[\s\S]{0,400}?window\.scrollTo\(0, 0\)/.test(bridge) || !/addEventListener\("scroll", unscroll/.test(bridge)) gaps.push("nothing puts the stretched page back when it is scrolled");
  if (!/focus\(\{ preventScroll: true \}\)/.test(readSrc("web/sheet.js"))) gaps.push("the Settings sheet takes the focus with a scroll");
  if (!/const installed = !framed && /.test(bridge)) gaps.push("the Settings frame is treated as the screen");
  if (/html\.tail[^}]*\{[^}]*dvh/.test(css)) gaps.push("the stretched page leans on dvh again");
  if (!/if \(installed && upright && window\.AuralLite && inset > 0 && !typing\(\)\) tall = full;/.test(bridge)) gaps.push("the height is set outside an installed, upright phone under the see-through bar, or while typing");
  gaps.length ? fail("the installed phone app reaches the bottom of the screen", gaps.join("; "))
    : pass("under the see-through status bar the page is the screen's height, its panels with it, and the keyboard still gets its room");
}

// ── the carry-over code holds no key ────────────────────────────────────────
// The web app can write what it holds as a line of text, for moving to a new
// install (6 Oct 2026). It goes through a clipboard and often a notes app or a
// message, so it must never hold anything that is a secret: only the named
// files of the messaging modules, never an identity. And a pasted file is
// taken only where this install has none of its own.
{
  console.log("\nthe carry-over code holds no key");
  const bridge = readSrc("web/bridge.js");
  const files = (bridge.match(/const BACKUP_FILES = \[([^\]]*)\];/) || [])[1] || "";
  const names = [...files.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  const body = bridge.slice(bridge.indexOf("backupCode: async"), bridge.indexOf("panicWipe: async"));
  const gaps = [];
  if (!names.length) gaps.push("no list of files to carry was found");
  for (const n of names) if (!["muted.json", "contacts.json", "filter.json"].includes(n)) gaps.push(`${n} is carried`);
  if (/identity\.json|\.sk\b|nsec|secret/i.test(body.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, ""))) gaps.push("the code's builder reads something named like a key");
  if (!/if \(!localStorage\.getItem\(FS \+ f\)\) localStorage\.setItem\(FS \+ f, v\)/.test(body)) gaps.push("a pasted file can replace one this install already has");
  gaps.length ? fail("the carry-over code holds no key", gaps.join("; "))
    : pass("the code carries favourites, settings and three named lists, no identity, and never overwrites a list already here");
}

// ── a show is heard directly, and found honestly ────────────────────────────
// Live, a show goes from the host's device to each listener's (6 Oct 2026).
// What that rests on:
//   - the handshake carries each device's network addresses, so it travels in
//     the sealed private envelope and never reaches the conversation or a
//     relay in the clear;
//   - a handshake a relay kept and handed back later is not a live one;
//   - the host answers only while live, and only so many (a home connection
//     carries about a dozen copies of the sound);
//   - going off air tells the listeners and lets them go;
//   - the listener's side is on only where the studio is, or in a browser that
//     opened the private ?ears link, and it says, before anyone presses
//     Listen, that each side can see the other's address.
{
  console.log("\na show is heard directly, and found honestly");
  const nostrSrc = readSrc("src/presence-nostr.js"), shows = readSrc("src/renderer/explore-shows.js"), studio = readSrc("src/renderer/explore-studio.js");
  const gaps = [];
  if (!/return dm\(to, "", \[\["rtc", body\]\]\)/.test(nostrSrc)) gaps.push("the handshake is not sent in the private envelope");
  if (!/if \(typeof rtc === "string"\) \{[\s\S]{0,700}?return;\s*\}\s*const fav/.test(nostrSrc)) gaps.push("a handshake can fall through into the conversation");
  if (!/Math\.abs\(Date\.now\(\) - Number\(at\)\) > MAX_AGE_MS\) return;/.test(shows)) gaps.push("a stale handshake is acted on");
  if (!/if \(phase !== "live" \|\| !mixDest\) return;/.test(studio)) gaps.push("the host answers when not live");
  if (!/if \(heard\.size >= MAX_LISTENERS\)/.test(studio) || !/const MAX_LISTENERS = (\d+);/.test(studio) || +studio.match(/const MAX_LISTENERS = (\d+);/)[1] > 25) gaps.push("nothing limits how many listeners one computer carries");
  if (!/if \(phase === "live" && to !== "live"\) \{ closeListeners\(\);/.test(studio)) gaps.push("going off air leaves the listeners connected");
  // Listening is on where the studio is, or where the private ?ears link has
  // been opened; and that link must never be a way into the studio itself
  // (the check after this one holds the studio's own door).
  if (!shows.includes("const on = () => true;") || !shows.includes("const shown = () => on() && ") || !shows.includes("card.hidden = !(shown() && (rows.length || said || unseen));") || !shows.includes("const unseen = shown() && ")) gaps.push("listening to shows is not on everywhere, or the prompt to see them is not gated by shown()");
  if (/shows\.ears|has\("ears"\)/.test(studio)) gaps.push("the private listening link reaches into the studio");
  if (!/"shows\.note"/.test(shows) || !/network address/.test(shows)) gaps.push("a listener is not told the host can see their address");
  // Looking for shows with nothing playing reads and never announces, and only
  // with "Show other listeners" on: presence that goes out unasked is the one
  // promise this app could not take back.
  if (!/function watch\(\) \{\s*if \(here\) return;\s*connect\(\);/.test(nostrSrc)) gaps.push("watching for shows is no longer a connection with no place joined");
  for (const f of ["src/main.js", "web/messaging.js"]) {
    if (!/if \((on|p\.presence === true) && watching\) nostr\.watch\(\);/.test(readSrc(f))) gaps.push(`${f}: shows are looked for with presence switched off`);
  }
  // A report hides the host first (the part that takes effect) and then drafts the email.
  const rep = shows.slice(shows.indexOf("async function report(peer)"), shows.indexOf("async function listen(peer)"));
  if (!(rep.indexOf("gone.add(peer.pubkey)") >= 0 && rep.indexOf("gone.add(peer.pubkey)") < rep.indexOf("chatReport"))) gaps.push("reporting a show does not hide its host before anything else");
  gaps.length ? fail("a show is heard directly, and found honestly", gaps.join("; "))
    : pass("the handshake is sealed and fresh, the host answers only live and to a dozen, and a listener is told what a direct connection shows");
}

// ── the queue hands over on its own clock ───────────────────────────────────
// The studio plays several tracks in order, each fading into the next (5 Oct
// 2026). Three things it rests on, each a way it broke or would have:
//   - the hand-over is driven by the track's own timeupdate. Animation frames
//     stop when the window is behind another, and a show goes on there;
//   - a fade asked for while another is under way holds that one where it is
//     (cancelAndHoldAtTime). A curve scheduled over a running curve throws,
//     and the queue's "switching" flag is cleared in a finally, because a throw
//     that left it set refused every press afterwards;
//   - the deck does not loop a track by itself, or the queue never moves on.
{
  console.log("\nthe queue hands over on its own clock");
  const studio = readSrc("src/renderer/explore-studio.js");
  const q = studio.slice(studio.indexOf("// ── the queue ──"), studio.indexOf("* A track from a link (desktop"));
  const deckSrc = readSrc("src/renderer/studio-deck.js").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const gaps = [];
  if (!/ontimeupdate = \(\) => \{[\s\S]*?playAt\(n, fade\)/.test(q)) gaps.push("the next track is not started from the playing track's timeupdate");
  if (/requestAnimationFrame/.test(q)) gaps.push("the queue leans on animation frames");
  if (!/cancelAndHoldAtTime\(at\)/.test(q)) gaps.push("a fade does not hold the one already under way");
  if (!/\} finally \{\s*switching = false;/.test(q)) gaps.push("a failed hand-over can leave the queue locked");
  if (/\.loop\s*=\s*true/.test(deckSrc)) gaps.push("the deck loops a track by itself");
  gaps.length ? fail("the queue hands over on its own clock", gaps.join("; "))
    : pass("tracks hand over from timeupdate, fades hold and never lock the queue, and no track loops by itself");
}

// ── the studio is not on the public web ─────────────────────────────────────
// listen.auralfm.xyz/?studio opened the studio for anyone with the link, and a
// flag kept in the browser kept it open afterwards. It is too
// unfinished to hand out: the desktop beta only until it is settled. A query string
// or a stored flag that switches it on is that link coming back.
{
  console.log("\nthe studio is not on the public web");
  const src = readSrc("src/renderer/explore-studio.js");
  const fn = src.slice(src.indexOf("async function allowed()"), src.indexOf("// ── what the show is"));
  const gaps = [];
  if (/URLSearchParams|location\.search/.test(fn)) gaps.push("a query string can switch the studio on");
  if (/localStorage\.(setItem|getItem)/.test(fn)) gaps.push("a flag kept in the browser can switch the studio on");
  if (!/location\.protocol === "file:"/.test(fn) || !/v\?\.dev \|\| v\?\.channel/.test(fn)) gaps.push("the desktop's development and beta builds are no longer the way in");
  // Your show is the paid desktop app's: the web build does not carry it at all.
  if (/location\.hostname/.test(fn)) gaps.push("a page on some host can switch the studio on");
  const only = /const DESKTOP_ONLY = \[([^\]]*)\]/.exec(readSrc("scripts/build-web.mjs"))?.[1] || "";
  if (!only.includes('"explore-studio.js"') || !only.includes('"studio-deck.js"')) gaps.push("the web build carries the studio");
  gaps.length ? fail("the studio is not on the web", gaps.join("; "))
    : pass("the studio is in the desktop app only, in its development and beta builds; the web build does not carry it");
}

// ── a tag says something ────────────────────────────────────────────────────
// A place's commonest tags are its chips in the app, and they were "music",
// "other", "tbd", "(null)" and "moi merino": a contributor's own name, on 923
// stations. scripts/lib/match.mjs leaves those out of the bundle (junkTag), by
// exact word, so a real tag that contains one keeps it.
{
  console.log("\na tag says something");
  const gaps = [];
  if (!HAS_CAT) skip("a tag says something", NO_CAT); else {
  const { pathToFileURL } = await import("node:url");
  const { junkTag } = await import(pathToFileURL(C("scripts/lib/match.mjs")).href);
  for (const t of ["(null)", "TBD", "music", "Música", "moi merino", "#", "@fm te conecta", "--", ""]) if (!junkTag(t)) gaps.push(`"${t}" is kept`);
  for (const t of ["world music", "radio drama", "jazz", "r&b", "80s", "fm", "música regional"]) if (junkTag(t)) gaps.push(`"${t}" is dropped`);
  const min = R("data/stations.min.json");
  if (!fs.existsSync(min)) skip("a tag says something: the catalogue", "data/ is not built");
  else {
    let junk = 0;
    for (const c of JSON.parse(fs.readFileSync(min, "utf8")).c) if (c[4] && c[4].split(",").some(junkTag)) junk++;
    if (junk) gaps.push(`${junk.toLocaleString("en-US")} station(s) in the bundle carry a tag that says nothing`);
  }
  gaps.length ? fail("a tag says something", gaps.join("; "))
    : pass("no station in the bundle carries a placeholder, a filler word or a contributor's name as a tag");
  }
}

// ── favorites sync keeps its promises ───────────────────────────────────────
// Favorites can be the same on a phone and a desktop (6 Oct 2026): a secret
// made on one device and carried to the other, and one sealed note on public
// relays (src/favsync.js). It is the first thing in this app that can take a
// star away on a device nobody is holding, so what it may not do is run here
// rather than read:
//   - an empty list never un-stars a full one (a lost file is not an instruction);
//   - a device joining with stars of its own keeps them;
//   - an un-star reaches the other device, and a later star wins it back;
//   - what goes to a relay cannot be read without the secret, and the key that
//     signs it is not the chat's or the lasting identity;
//   - a list that could not be read is not a list, on either platform;
//   - "Erase everything" turns it off first, or the erased list comes back.
{
  console.log("\nfavorites sync keeps its promises");
  const { createRequire } = await import("node:module");
  const sync = createRequire(import.meta.url)(R("src/favsync.js"));
  const src = readSrc("src/favsync.js"), bridge = readSrc("web/bridge.js"), mainSrc = readSrc("src/main.js");
  const F = (id) => ({ id, title: "Radio " + id, place: "Town", country: "Land", lat: 1, lon: 2, secure: true });
  const now = 1.7e12, gaps = [];
  const ids = (m) => m.favorites.map((f) => f.id).join(",");

  const first = sync.merge([F("a"), F("b"), F("c"), F("d")], {}, null, now);
  const lost = sync.merge([], first, first.items, now + 1000);
  if (ids(lost) !== "a,b,c,d" || Object.values(lost.items).some((a) => a.length === 1)) gaps.push("an emptied list un-stars the stations on every other device");
  const joined = sync.merge([F("z")], {}, first.items, now + 2000);
  if (!joined.favorites.some((f) => f.id === "z") || joined.favorites.length !== 5 || joined.removed) gaps.push("a device that joins loses the stars it had");
  const unstar = sync.merge([F("a"), F("b"), F("c")], first, first.items, now + 3000);
  const heard = sync.merge([F("a"), F("b"), F("c"), F("d")], first, unstar.items, now + 4000);
  if (ids(heard) !== "a,b,c" || heard.removed !== 1) gaps.push("an un-star does not reach the other device");
  const again = sync.merge([F("a"), F("b"), F("c"), F("d")], { seen: unstar.seen, gone: unstar.gone }, unstar.items, now + 5000);
  if (!again.favorites.some((f) => f.id === "d")) gaps.push("a station starred again after an un-star does not stay");
  const same = sync.merge([F("a"), F("b"), F("c"), F("d")], first, first.items, now + 6000);
  if (same.changedRemote || same.added || same.removed) gaps.push("a round with nothing new still writes to the relays");
  const junk = sync.merge([F("a")], {}, { x: "no", y: [NaN, "t"], ok: [now, "Good", "", "", null, null, 0] }, now);
  if (ids(junk) !== "a,ok") gaps.push("a malformed entry from a relay gets into the list");

  const k = sync.keys("11".repeat(32)), other = sync.keys("22".repeat(32));
  const sealed = await sync.seal({ v: 1, items: first.items }, k.key);
  if (JSON.stringify(await sync.open(sealed, k.key)) !== JSON.stringify(first.items)) gaps.push("a sealed list does not open with its own secret");
  if (await sync.open(sealed, other.key)) gaps.push("a sealed list opens with another secret");
  if (/Radio|Town/.test(sealed) || /Radio|Town/.test(Buffer.from(sealed, "base64").toString("latin1"))) gaps.push("station names are readable in what goes to the relay");
  if (/require\("\.\/(identity|presence-nostr|nostr-private)/.test(src)) gaps.push("the sync reaches for the chat's keys");
  if (!/openSync\(FILE, "w", 0o600\)/.test(src)) gaps.push("the secret's file is not private before it is written");
  if (/secret|code/.test((src.match(/const status = \(\) => \{[\s\S]*?\n\};/) || [""])[0].replace(/j\?\.|read\(\)/g, ""))) gaps.push("the status hands out the secret");
  if (!/if \(!Array\.isArray\(local\)\) return status\(\);/.test(src)) gaps.push("a round goes ahead with no list");
  if (!/favsync\.init\([\s\S]{0,700}?existsSync\([\s\S]{0,80}?"state\.json"\)\) \? \[\] : null/.test(mainSrc)) gaps.push("the desktop takes an unreadable state file for an empty list");
  if (!/if \(e\.newValue === null\) favsync\?\.stop\(\)/.test(bridge)) gaps.push("turning sync off in Settings does not reach the web app's main page");
  if (!/favsync\.stop\(\);[\s\S]{0,900}?save\(\{ prefs:/.test(readSrc("src/main/ipc-chat.js"))) gaps.push("the desktop's Erase leaves sync on");
  if (!/favsync\?\.stop\(\);[\s\S]{0,200}?write\("state", \{\}\)/.test(bridge)) gaps.push("the web app's Erase leaves sync on");
  if (!/onStateChanged\?\.\(\(s\) => \{[\s\S]{0,400}?favorites = next;/.test(readSrc("src/renderer/explore.js"))) gaps.push("the globe window does not take a list changed from elsewhere");
  gaps.length ? fail("favorites sync keeps its promises", gaps.join("; "))
    : pass("an empty list fills and never erases, a joining device keeps its stars, an un-star travels, the relay's copy is unreadable, and Erase turns it off");
}


// ── the reds and the small print can be read, and Settings pressed ──────────
// The design review of 6 Oct 2026, measured in the running app. White on the
// dark theme's red was 3.7:1 on a show's beacon, its Stop button and the
// studio's On air. The light theme's secondary text was still 3.7:1 on the
// globe page and the menu-bar panel after Settings had been raised. On a phone
// Settings' buttons were 18px tall ("Join" was 26 by 18) beside text at 10px,
// and turning sync on or off dropped the keyboard's place to the top of the page.
{
  console.log("\nthe reds and the small print can be read, and Settings pressed");
  const lum = (h) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
  const css = (f) => readSrc(f).replace(/\/\*[\s\S]*?\*\//g, "");
  const gaps = [];
  for (const f of ["src/renderer/explore.html", "src/renderer/settings.html"]) {
    const pairs = [...css(f).matchAll(/--err:(#[0-9A-Fa-f]{6});\s*--on-err:(#[0-9A-Fa-f]{6})/g)];
    if (!pairs.length || pairs.length !== (css(f).match(/--err:#/g) || []).length) gaps.push(`${f}: an --err with no --on-err beside it`);
    for (const [, err, on] of pairs) if (ratio(err, on) < 4.5) gaps.push(`${f}: ${on} on ${err} is ${ratio(err, on).toFixed(2)}:1`);
    if (/background:var\(--err\);\s*color:(?!var\(--on-err\))/.test(css(f))) gaps.push(`${f}: something is written on --err in a colour of its own`);
  }
  for (const f of ["src/renderer/explore.html", "src/renderer/popover.html", "src/renderer/settings.html"]) {
    const seen = [...css(f).matchAll(/--label2:rgba\(23,21,20,(\.\d+)\)/g)];
    if (!seen.length) gaps.push(`${f}: no light-theme --label2 found, so this check is blind`);
    for (const [, a] of seen) {
      const on = "#" + [23, 21, 20].map((n) => Math.round(255 - (255 - n) * a).toString(16).padStart(2, "0")).join("");
      if (ratio(on, "#FFFFFF") < 4.5) gaps.push(`${f}: light secondary text at ${a} is ${ratio(on, "#FFFFFF").toFixed(2)}:1 on white`);
    }
  }
  const set = css("src/renderer/settings.html");
  const under = set.match(/font-size:(?:\d|1[01])(?:\.\d+)?px/g);
  if (under) gaps.push(`Settings has text under 12px (${[...new Set(under)].join(", ")})`);
  const hit = (set.match(/:is\(([^)]*)\)::before\{[^}]*width:max\(100%,var\(--hit\)\);height:max\(100%,var\(--hit\)\)/) || [])[1] || "";
  if (![".link", ".sw", ".seg button"].every((c) => hit.split(",").includes(c))) gaps.push("Settings' links, switches and segments have no larger area to press");
  if (!/@media \(pointer:coarse\)\{\s*:root\{--hit:44px\}\s*\.row\{min-height:44px\}/.test(set)) gaps.push("under a finger Settings' controls are not 44px, or its rows are shorter than that");
  if (/color:var\(--label3\)/.test(set)) gaps.push("Settings writes words in --label3, which is 2.5:1");
  const js = readSrc("src/renderer/settings.js");
  if (!/if \(pressed\) \(on \? \$\("#synccopy"\) : \$\("#syncon"\)\)\.focus\(\)/.test(js)) gaps.push("turning sync on or off drops focus");
  if (!/if \(!st\?\.on\) failed\(\)/.test(js)) gaps.push("a sync that did not turn on says nothing");
  gaps.length ? fail("the reds and the small print can be read, and Settings pressed", gaps.join("; "))
    : pass("what is written on --err clears 4.5:1 in both themes, light secondary text does on all three pages, and Settings is 12px and 44px under a finger");
}


// ── the player can be found ──────────────────────────────────────────────────
// No site had a sitemap: crawlers asked the player for /sitemap.xml 225 times
// in a month and got a 404 (7 Oct 2026). The front page's half of this check
// went with the sites to AuralFM/site.
{
  console.log("\nthe player can be found");
  const gaps = [];
  const rules = readSrc("web/robots.txt").replace(/^#.*$/gm, "");
  if (/User-agent: \*\s*\n\s*Disallow: \/\s*(\n|$)/.test(rules)) gaps.push("web/robots.txt turns every crawler away");
  if (!rules.includes("Sitemap: https://listen.auralfm.xyz/sitemap.xml")) gaps.push("web/robots.txt does not say where the sitemap is");
  if (!/User-agent: GPTBot[\s\S]*?Disallow: \/\s*\n/.test(rules)) gaps.push("web/robots.txt no longer turns the training crawlers away");
  if (!/copyFileSync\(R\("web", "sitemap\.xml"\)/.test(readSrc("scripts/build-web.mjs"))) gaps.push("the player's sitemap is not in its build");
  if (!/google-site-verification/.test(readSrc("scripts/build-web.mjs"))) gaps.push("the player lost its Search Console tag, and the property goes unverified");
  gaps.length ? fail("the player can be found", gaps.join("; "))
    : pass("the player lets search engines in, keeps training crawlers out, and says where its sitemap is");
}

// ── the Mac app carries the catalogue once, packed ───────────────────────────
// 38 MB of the app was the catalogue as plain JSON. `npm run dist` gzips it
// into data/packed/ (scripts/pack-data.mjs) and src/packed.js reads either
// form. Three ways that goes wrong: a release built before packing opens to
// an empty globe (as on 18 September, when the list was missing); both forms
// ship and nothing is saved; or a stale data/packed/ shadows a rebuilt
// catalogue on the machine that built it.
{
  console.log("\nthe Mac app carries the catalogue once, packed");
  const gaps = [];
  const files = pkg.build.files;
  if (!files.includes("data/packed/**/*")) gaps.push("the build does not carry data/packed/");
  if (files.some((f) => /^data\/(stations\.min\.json|profiles\/)/.test(f))) gaps.push("the build still carries the plain catalogue beside the packed one");
  if (!/pack-data\.mjs && node scripts\/audit\.mjs --release/.test(pkg.scripts.dist)) gaps.push("npm run dist does not pack the catalogue before its checks");
  const reader = readSrc("src/packed.js");
  if (!(reader.indexOf("fs.existsSync(plain)") > 0 && reader.indexOf("fs.existsSync(plain)") < reader.indexOf("fs.existsSync(gz)"))) gaps.push("src/packed.js does not read the plain file first");
  if (!/readPacked\("stations\.min\.json"\)/.test(readSrc("src/catalog.js")) || !/catalog\.usePacked\(require\("\.\/packed"\)\.read\)/.test(readSrc("src/main.js"))) gaps.push("the catalogue is not read through src/packed.js");
  // The web build wraps catalog.js and has no zlib (it stopped the build on 8 Oct).
  if (/require\("\.\/packed"\)|node:zlib/.test(readSrc("src/catalog.js"))) gaps.push("src/catalog.js reaches for zlib itself, which the web build cannot wrap");
  if (!/packed\.read\(`profiles\/\$\{s\}\.json`\)/.test(readSrc("src/profiles.js"))) gaps.push("profiles are not read through src/packed.js");
  if (RELEASE || fs.existsSync(R("data/packed"))) {
    const r = spawnSync(process.execPath, [R("scripts/pack-data.mjs"), "--check"], { encoding: "utf8" });
    if (r.status !== 0 && RELEASE) gaps.push((r.stderr || "data/packed/ is behind").trim());
  }
  gaps.length ? fail("the Mac app carries the catalogue once, packed", gaps.join("; "))
    : pass("packed in the build, plain in a checkout, and a release is checked against the catalogue it was built from");
}


// ── AuralFM can take a show off its list ─────────────────────────────────────
// The Terms say AuralFM "can hide a show from the apps" and removes what a
// valid copyright notice identifies. Until 8 Oct 2026 nothing in the app could:
// the promise was words. data/hidden-shows.json is the list, src/unlisted.js
// reads it, and explore-shows.js keeps a listed host off the globe and out of
// On air. A takedown that is cached, shipped only with the next release, or
// undone by one malformed line is not a takedown.
{
  console.log("\nAuralFM can take a show off its list");
  const gaps = [];
  const { createRequire } = await import("node:module");
  const { read } = createRequire(import.meta.url)(R("src/unlisted.js"));
  const A = "ab".repeat(32), B = "cd".repeat(32), C = "ef".repeat(32), now = Date.parse("2026-10-09T12:00:00Z");
  const got = read({ v: 1, hosts: [{ key: A }, { key: B.toUpperCase(), until: "2026-10-09" }, { key: C, until: "2026-10-08" }, { key: "not a key" }, null] }, now) || [];
  if (!got.includes(A)) gaps.push("a listed host is not hidden");
  if (!got.includes(B)) gaps.push("a key in capitals, or a hiding on its last day, is let through");
  if (got.includes(C)) gaps.push("a hiding that has ended still hides");
  if (got.length !== 2) gaps.push("a malformed entry was taken for a host");
  if (read({ v: 2, hosts: [] }) !== null || read("x") !== null || read(null) !== null) gaps.push("a file that is not ours is read as an empty list, which would unhide everyone");
  if (!Array.isArray(read(JSON.parse(readSrc("data/hidden-shows.json"))))) gaps.push("data/hidden-shows.json is not a list the apps can read");
  const shows = readSrc("src/renderer/explore-shows.js");
  if (!/live = unlistedKnown \? announced\.filter\(listed\) : \[\];/.test(shows)) gaps.push("shows are listed before the hidden list has answered, or without it");
  if (!/if \(!listed\(peer\)\) return;/.test(shows)) gaps.push("a hidden show can still be tuned to");
  // Measured 17 Oct 2026 with a stand-in host: a show taken down while it was
  // being listened to stopped, then stayed in On air, Listen button and all,
  // because the list kept the last show tuned to whatever its state.
  if (!/if \(show && !listed\(show\.peer\)\) \{\s*end\(\);/.test(shows)) gaps.push("a show taken down while it is listened to is not stopped and let go");
  const held = /const held = \(\) => ([^;]+);/.exec(shows)?.[1] || "";
  if (!/listed\(show\.peer\)/.test(held) || /^!!show &&\s*\(/.test(held) || !/told\(show\)/.test(held)) gaps.push("the show tuned to is kept on the list after it ends or is taken down");
  if ((shows.match(/held\(\) && !rows\.some/g) || []).length < 2 || /if \(show && !rows\.some/.test(shows)) gaps.push("On air or the globe keeps the show tuned to by a rule of its own");
  if (!/if \(Array\.isArray\(keys\)\) unlisted = new Set\(keys\);/.test(shows)) gaps.push("no answer empties the list instead of leaving it");
  if (!/hidden-shows\.json"\)\) return;/.test(readSrc("web/sw.js"))) gaps.push("the web app reads the hidden list from its cache");
  const web = readSrc("scripts/build-web.mjs");
  if (!/copy\("data\/hidden-shows\.json"/.test(web) || !/rel === "data\/hidden-shows\.json"\) continue;/.test(web)) gaps.push("the web build does not carry the list, or precaches it");
  if (!/listen\.auralfm\.xyz\/data\/hidden-shows\.json/.test(readSrc("src/hidden-shows.js"))) gaps.push("the desktop reads only the copy it shipped with");
  if (!pkg.build.files.includes("data/hidden-shows.json")) gaps.push("the Mac build ships without the list");
  if (!/list of shows AuralFM no longer lists/.test(readSrc("docs/PRIVACY.md"))) gaps.push("the privacy policy does not name the request");
  // The web asked once a minute and the desktop every half hour, while the
  // policy said half an hour for both. One interval, and the policy says it.
  const every = /const EVERY_MS = ([\d\s*_]+);/.exec(readSrc("src/hidden-shows.js"))?.[1];
  const ms = every ? Function(`return ${every.replace(/_/g, "")}`)() : NaN;
  if (!(ms <= 60_000)) gaps.push(`the desktop reads the hidden list every ${Math.round(ms / 60000)} minutes, so a takedown waits that long there`);
  if (!/asking = null; \}, 60_000\)/.test(shows)) gaps.push("the page re-reads the hidden list on an interval other than a minute");
  if (!/no longer lists\. Asked for only while a show is on air to be listed, at most once a minute/.test(readSrc("docs/PRIVACY.md"))) gaps.push("the privacy policy does not say how often the hidden list is read");
  gaps.length ? fail("AuralFM can take a show off its list", gaps.join("; "))
    : pass("a listed host is off the globe and On air in both apps, read fresh, and a damaged file hides and unhides nobody");
}


// ── a receiver that asked to be left out stays out ───────────────────────────
// The public promise to the people who run shortwave receivers: ask, and you
// are out, and the app never learns you existed. The crawl leaves them out of
// the shipped list. But the app also refreshed that list from the public one
// twice a day and took every receiver on it, so the first operator to opt out
// would have been back within hours (found 8 Oct 2026, before anyone had).
// Run for real, with the network and the cache faked.
{
  console.log("\na receiver that asked to be left out stays out");
  const gaps = [];
  if (!fs.existsSync(R("data/sdr.min.json"))) skip("a receiver that asked to be left out stays out", "no receiver list here");
  else {
    const { createRequire } = await import("node:module");
    const os = await import("node:os");
    const req = createRequire(import.meta.url);
    const shipped = JSON.parse(readSrc("data/sdr.min.json"));
    const mine = shipped.r.slice(0, 400).map((row) => row[0]);
    const OUT = "left-out.example:8073";
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "auralfm-sdr-"));
    // A cache from an older build, newer than the shipped list, naming the host.
    fs.writeFileSync(path.join(tmp, "sdr.json"), JSON.stringify({ g: "2099-01-01T00:00:00.000Z", src: null, r: [...shipped.r.slice(0, 400), [OUT, "x", "y", 10, 10, 4, 0]] }));
    delete req.cache[req.resolve(R("src/sdr.js"))];
    const sdr = req(R("src/sdr.js"));
    const log = console.log, warn = console.warn; console.log = console.warn = () => {};
    const realFetch = globalThis.fetch;
    try {
      sdr.init(tmp);
      const has = () => sdr.points().some((p) => p.host === OUT);
      if (has()) gaps.push("a cached list brings a host this build does not list back at launch");
      const page = "var kiwisdr_com = " + JSON.stringify([...mine, OUT].map((h) => ({ status: "active", offline: "no", gps: "(10.5, 20.5)", url: `http://${h}`, name: "n", loc: "l", users_max: "4", asl: "0" }))) + ";";
      globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => page });
      await sdr.refresh();
      if (has()) gaps.push("a refresh from the public list adds a host this build does not list");
      // The refresh stamps the list with the time it was taken.
      if (sdr.stats().generated === "2099-01-01T00:00:00.000Z") gaps.push("the refresh was not taken at all, so this check proved nothing");
    } catch (e) { gaps.push(`could not run the receiver list: ${e.message}`); }
    finally { globalThis.fetch = realFetch; console.log = log; console.warn = warn; fs.rmSync(tmp, { recursive: true, force: true }); delete req.cache[req.resolve(R("src/sdr.js"))]; }
    gaps.length ? fail("a receiver that asked to be left out stays out", gaps.join("; "))
      : pass("neither a refresh nor an old cache can add a receiver this build was not shipped with");
  }
}


// ── the Mac app does not grow by itself ──────────────────────────────────────
// electron-builder 26.17 began shipping LICENSES.chromium.html (19 MB) and 24
// gendered language folders (7 MB) that earlier versions left out. It arrived
// with a routine dependency update, and the first build after it was no
// smaller for having had 28 MB of catalogue packed. scripts/after-pack.cjs
// takes both back out; this runs it on a made-up app.
{
  console.log("\nthe Mac app does not grow by itself");
  const gaps = [];
  if (pkg.build.afterPack !== "scripts/after-pack.cjs") gaps.push("the build does not run scripts/after-pack.cjs");
  const { createRequire } = await import("node:module");
  const os = await import("node:os");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "auralfm-pack-"));
  try {
    const app = path.join(tmp, "AuralFM.app");
    const res = path.join(app, "Contents", "Frameworks", "Electron Framework.framework", "Versions", "A", "Resources");
    for (const d of ["en.lproj", "en_GB.lproj", "es_419.lproj", "en_FEMININE.lproj", "es_419_NEUTER.lproj", "de_MASCULINE.lproj"]) fs.mkdirSync(path.join(res, d), { recursive: true });
    fs.mkdirSync(path.join(app, "Contents", "Resources"), { recursive: true });
    fs.writeFileSync(path.join(app, "Contents", "Resources", "LICENSES.chromium.html"), "x");
    fs.writeFileSync(path.join(app, "Contents", "Resources", "app.asar"), "x");
    createRequire(import.meta.url)(R("scripts/after-pack.cjs")).trim(app);
    const left = fs.readdirSync(res).sort().join(",");
    if (left !== "en.lproj,en_GB.lproj,es_419.lproj") gaps.push(`the language folders left are ${left}`);
    if (fs.existsSync(path.join(app, "Contents", "Resources", "LICENSES.chromium.html"))) gaps.push("the 19 MB Chromium licence page is still in the app");
    if (!fs.existsSync(path.join(app, "Contents", "Resources", "app.asar"))) gaps.push("it removed the app itself");
  } catch (e) { gaps.push(`could not run scripts/after-pack.cjs: ${e.message}`); }
  finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  if (!/LICENSES\.chromium\.html/.test(readSrc("THIRD-PARTY-NOTICES.md"))) gaps.push("the notices no longer say where Chromium's full licences are");
  gaps.length ? fail("the Mac app does not grow by itself", gaps.join("; "))
    : pass("the Chromium licence page and the gendered language folders are taken out after packing, and the notices say where the licences are");
}


// ── a show goes into a calendar as the station wrote it ─────────────────────
// 9 Oct 2026. A station lists its shows on the claim form; a listener adds one
// to their own calendar from the station's page. Nothing is kept and nothing is
// sent, so the one place it can go wrong is the file: the wrong hour across a
// clock change, a first date that is not one of the show's days, a line guessed
// at instead of refused. And the form, the review sheet, the profile and the
// page must all carry the field, or a station's shows stop on the way.
{
  const name = "a show goes into a calendar as the station wrote it";
  console.log(`\n${name}`);
  const gaps = [];
  const { createRequire } = await import("node:module");
  let S; try { S = createRequire(import.meta.url)(R("src/renderer/schedule-ics.js")); } catch (e) { gaps.push(`src/renderer/schedule-ics.js does not load: ${e.message}`); }
  if (S) {
    const r = S.parse("Morning Glory | Mon-Fri | 07:00-09:00 | Europe/London\nLate | Sat & Sun | 23:00 – 01:00 | America/Sao_Paulo\nno bars here\nNowhere | Mon | 10:00-11:00 | Mars/Base\nToo late | Mon | 25:00-26:00 | UTC");
    if (r.slots.length !== 2 || r.bad.length !== 3) gaps.push(`of five lines, two good and three bad, it read ${r.slots.length} and refused ${r.bad.length}`);
    const [glory, late] = r.slots;
    if (glory && glory.days.join() !== "MO,TU,WE,TH,FR") gaps.push(`"Mon-Fri" became ${glory.days}`);
    if (glory) {
      // London is an hour ahead of UTC in July and level with it in December.
      const summer = S.next(glory, Date.UTC(2026, 6, 1, 12)), winter = S.next(glory, Date.UTC(2026, 11, 1, 12));
      if (new Date(summer.at).toISOString() !== "2026-07-02T06:00:00.000Z") gaps.push(`07:00 in London in July comes out as ${new Date(summer.at).toISOString()}`);
      if (new Date(winter.at).toISOString() !== "2026-12-02T07:00:00.000Z") gaps.push(`07:00 in London in December comes out as ${new Date(winter.at).toISOString()}`);
      // Asked on a Saturday: the first date is the Monday, not the day it was asked.
      const sat = S.next(glory, Date.UTC(2026, 9, 10, 12));
      if (`${sat.y}-${sat.m}-${sat.d}` !== "2026-10-12") gaps.push(`a weekday show asked for on a Saturday starts ${sat.y}-${sat.m}-${sat.d}`);
    }
    if (late) {
      const file = S.ics(late, { id: "af-test", title: "Rádio; Teste, FM" }, Date.UTC(2026, 9, 9, 22));
      const lines = file.split("\r\n");
      for (const w of ["DTSTART;TZID=America/Sao_Paulo:20261010T230000", "DTEND;TZID=America/Sao_Paulo:20261011T010000",
        "RRULE:FREQ=WEEKLY;BYDAY=SA,SU", "TRIGGER:-PT10M", "URL:https://listen.auralfm.xyz/?station=af-test"])
        if (!lines.includes(w)) gaps.push(`the file has no line "${w}"`);
      if (/[^\r]\n/.test(file)) gaps.push("the file's lines do not end as a calendar file's must (CRLF)");
      if (!file.includes("SUMMARY:Late · Rádio\\; Teste\\, FM")) gaps.push("a station's name with a comma or a semicolon in it is not escaped");
      if (lines.some((l) => l.length > 75)) gaps.push("a line is longer than a calendar file allows");
    }
    if (S.valid({ name: "x", days: ["XX"], start: "07:00", end: "08:00", tz: "UTC" })) gaps.push("a slot on a day that does not exist is called valid");
  }
  const html = readSrc("src/renderer/explore.html"), ui = readSrc("src/renderer/explore-profile.js");
  const at = html.indexOf('src="schedule-ics.js"');
  if (at < 0 || at > html.indexOf('src="explore-profile.js"')) gaps.push("explore.html does not load schedule-ics.js before the station's page");
  if (!/AuralSchedule/.test(ui) || !/\.filter\(S\.valid\)/.test(ui)) gaps.push("the station's page does not show its schedule, or shows slots it has not checked");
  if (!/add\.type = "button"/.test(ui)) gaps.push("Add to calendar is not a button");
  if (!/said\.setAttribute\("role", "status"\)/.test(ui)) gaps.push("nothing says the file was saved");
  for (const k of ["profile.schedule", "profile.nextShow", "profile.addCal", "profile.addCalDone"]) if (!new RegExp(`"${k}"`).test(readSrc("src/i18n.js"))) gaps.push(`i18n.js has no ${k}`);
  if (HAS_CAT) {
    const claims = fs.readFileSync(C("scripts/claims.mjs"), "utf8");
    if (!/schedule-ics\.js/.test(claims) || !/schedule: shows\.slots/.test(claims)) gaps.push("the catalogue's scripts/claims.mjs does not read the form's shows");
    if (!/schedule: form\?\.schedule/.test(fs.readFileSync(C("scripts/profiles.mjs"), "utf8"))) gaps.push("the catalogue's scripts/profiles.mjs does not publish an approved claim's schedule");
  }
  gaps.length ? fail(name, gaps.join("; "))
    : pass("the form's lines are read or refused, the hour holds across a clock change, the file starts on one of the show's days, and the field reaches the station's page");
}


// ── the newsletter goes to the people who asked for it ──────────────────────
// 9 Oct 2026. The newsletter list holds two kinds of asking (the newsletter, and
// "tell me when the shop opens"), and it sits beside the beta and sponsor lists.
// The Privacy Policy promises that joining one list does not put you on another,
// and that nobody gets the same email twice. An issue is written as a note, so
// what a note may put into an email has to stay narrow: links to https, bold,
// and nothing else as markup. scripts/mail.mjs is run here on made-up lists,
// with no network, and never with --send.
{
  const name = "the newsletter goes to the people who asked for it";
  console.log(`\n${name}`);
  const gaps = [];
  const tmp = fs.mkdtempSync(path.join((await import("node:os")).tmpdir(), "auralfm-mail-"));
  try {
    const row = (id, topic) => ({ id, name: `${id} Person`, email: `${id}@example.com`, topic });
    fs.writeFileSync(path.join(tmp, "lists.json"), JSON.stringify({
      newsletter: [row("ann", "letter"), row("bo", "letter"), row("cy", "shop")],
      beta: [{ id: "dee", name: "Dee", email: "dee@example.com", platform: "mac" }], members: [], claims: [],
    }));
    fs.writeFileSync(path.join(tmp, "sent.json"), JSON.stringify({ "issue:issue-9": { bo: "2026-10-09T00:00:00Z" }, letter: { ann: "x" }, beta: { dee: "x" } }));
    fs.writeFileSync(path.join(tmp, "Issue 9.md"), "---\nkind: letter\n---\n# Seven stations\n\nHi {name},\n\n1. [One FM](https://listen.auralfm.xyz/?station=af-1) · Here\n2. [Bad](javascript:alert(1)) <script>x</script>\n\n**Picked** by people.\n\n[All seven](https://auralfm.xyz/links/)\n");
    const env = { ...process.env, MAIL_RECORDS: path.join(tmp, "lists.json"), MAIL_SENT: path.join(tmp, "sent.json"), MAIL_PREVIEWS: path.join(tmp, "previews"), MAIL_POSTAL_ADDRESS: "1 Test Street, Testville" };
    const run = (...args) => { const r = spawnSync(process.execPath, [R("scripts/mail.mjs"), ...args], { env, encoding: "utf8" }); return (r.stdout || "") + (r.stderr || ""); };
    // An issue: ann asked for the newsletter and has not had it. bo has had it. cy only asked about the shop. dee is on another list.
    const issue = run("--issue", path.join(tmp, "Issue 9.md"));
    if (!/mail: 1 to send: 1 issue:issue-9;/.test(issue)) gaps.push(`an issue for one reader out of four people is queued as: ${issue.split("\n")[0]}`);
    if (!/nothing sent/.test(issue)) gaps.push("it does not say nothing was sent");
    const page = fs.existsSync(path.join(tmp, "previews", "issue-issue-9.html")) ? fs.readFileSync(path.join(tmp, "previews", "issue-issue-9.html"), "utf8") : "";
    if (!page) gaps.push("an issue writes no preview");
    else {
      if (!page.includes('<a href="https://listen.auralfm.xyz/?station=af-1"')) gaps.push("a link in an issue is not a link in the email");
      if (/<script>x|href="javascript:/i.test(page)) gaps.push("an issue can put a script or a javascript: link into the email");
      if (!page.includes("<strong>Picked</strong>")) gaps.push("bold is lost");
      if (!/>All seven<\/a><\/p>/.test(page) || /\[All seven\]/.test(page)) gaps.push("the last link standing alone is not the button");
      if (!page.includes("1 Test Street, Testville") || !/Unsubscribe/.test(page)) gaps.push("an issue has no postal address or no way off the list");
      if (/kind: letter/.test(page)) gaps.push("the note's front matter is in the email");
      if (/\{name\}/.test(page)) gaps.push("{name} is not filled in");
    }
    // The everyday run: bo and cy have not had their welcome; ann and dee have had theirs.
    const daily = run();
    if (!/mail: 2 to send: 1 letter, 1 shop;/.test(daily)) gaps.push(`the welcomes are queued as: ${daily.split("\n")[0]}`);
  } catch (e) { gaps.push(`could not run scripts/mail.mjs: ${e.message}`); }
  finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  gaps.length ? fail(name, gaps.join("; "))
    : pass("an issue reaches only newsletter readers who have not had it, a note cannot put a script in an email, and each email carries the address and the way off");
}

// ── the FM and AM chips are a dial ──────────────────────────────────────────
// 10 Oct 2026. For somebody holding a radio, a town's FM stations are only
// useful in the order the radio finds them, with the number said. The number
// comes from the station's name, so the danger is believing one that is not a
// frequency: "Hits 80s FM", "24/7 FM", the 100 in "K100 FM 100.5", a year on
// an AM station. A wrong number sends somebody to dead air.
{
  const name = "the FM and AM chips are a dial";
  console.log(`\n${name}`);
  const gaps = [];
  const { createRequire } = await import("node:module");
  const { dial } = createRequire(import.meta.url)(R("src/catalog.js"));
  if (typeof dial !== "function") gaps.push("src/catalog.js exports no dial()");
  else {
    const want = [["Radio Ony FM 93.1", "fm", 93.1], ["Radio 2000 FM 104,9", "fm", 104.9], ["K100 FM 100.5", "fm", 100.5],
      ["FM 100 Lahore", "fm", 100], ["98 Rock FM", "fm", 98], ["Radio 76.5 FM Tokyo", "fm", 76.5],
      ["Hits 80s FM", "fm", null], ["24/7 FM", "fm", null], ["FM Extra", "fm", null],
      ["Romántica 1380 AM", "am", 1380], ["AM 950 KJR", "am", 950], ["News 1990 AM", "am", null], ["Radio 1 AM", "am", null],
      ["Radio Ony FM 93.1", null, null]];
    for (const [title, band, f] of want) if (dial(title, band) !== f) gaps.push(`"${title}" on ${band} reads ${dial(title, band)}, not ${f}`);
  }
  const cat = readSrc("src/catalog.js"), rows = readSrc("src/renderer/explore-stations.js");
  if (!/if \(filter\.band\) \{[\s\S]{0,200}kept\.sort/.test(cat)) gaps.push("a place's FM or AM list is not put in the order of the dial");
  if (!/filter\.band && ch\.freq/.test(rows)) gaps.push("the row does not say the frequency");
  if (/\(\?<[=!]/.test(cat)) gaps.push("src/catalog.js uses a lookbehind, which stops the whole catalogue loading on an older iPhone");
  gaps.length ? fail(name, gaps.join("; "))
    : pass("a frequency is read from a station's name only when it can be one, and a place's FM or AM list is in the order of the dial");
}

// ── a playlist stream plays in Chrome too ───────────────────────────────────
// 10 Oct 2026. About 1,800 stations are HLS: a playlist of short files. Safari
// plays that; Chrome and Firefox do not, so on a computer those stations said
// "Stream unavailable here". hls.js plays them. What can go wrong: the library
// is not shipped, is not credited, is loaded for everyone (386 KB a phone never
// needs), is used where the browser already plays HLS, is left running after
// the station changes, or cannot fetch because the page's own rules forbid it.
{
  const name = "a playlist stream plays in Chrome too";
  console.log(`\n${name}`);
  const gaps = [];
  const bridge = readSrc("web/bridge.js"), build = readSrc("scripts/build-web.mjs");
  if (!fs.existsSync(R("src/renderer/vendor/hls.light.min.js"))) gaps.push("src/renderer/vendor/hls.light.min.js is not there (npm run vendor)");
  if (!/hls\.js/.test(readSrc("THIRD-PARTY-NOTICES.md"))) gaps.push("THIRD-PARTY-NOTICES.md does not credit hls.js");
  if (!/isHls\(url\) && !nativeHls\) return viaHls/.test(bridge)) gaps.push("the library is not used only where the browser cannot play HLS itself");
  if (!/createElement\("script"\)[\s\S]{0,120}vendor\/hls\.light\.min\.js/.test(bridge)) gaps.push("the library is not fetched only when a station needs it");
  if (/<script[^>]+hls/i.test(readSrc("src/renderer/explore.html"))) gaps.push("explore.html loads the library for everyone");
  const next = bridge.slice(bridge.indexOf("function tryNext"), bridge.indexOf("function tryNext") + 200);
  if (!/dropHls\(\)/.test(next)) gaps.push("moving to the next stream leaves the library attached to the last one");
  const stop = bridge.slice(bridge.indexOf("function stop("), bridge.indexOf("function stop(") + 300);
  if (!/dropHls\(\)/.test(stop)) gaps.push("stopping leaves the library fetching");
  if (!/Hls\.Events\.ERROR[\s\S]{0,120}data\.fatal[\s\S]{0,60}tryNext/.test(bridge)) gaps.push("a stream the library cannot play does not move on to the next");
  const csp = (build.match(/const CSP = \[[\s\S]*?\]\.join/) || [""])[0];
  if (!/"https:"/.test(csp.slice(csp.indexOf("connect-src")))) gaps.push("the page may not fetch from a station's own server, so no playlist can load");
  if (!/"script-src 'self'"/.test(csp)) gaps.push("the page's script rule is no longer its own files only");
  gaps.length ? fail(name, gaps.join("; "))
    : pass("hls.js is shipped and credited, fetched only when needed and only where the browser cannot, dropped on every change, and allowed to reach the station");
}

// ── nothing is written under 12px ───────────────────────────────────────────
// 10 Oct 2026. The profile is WCAG 2.2 AA with A11Y.md's floor on top: no text
// under 12px (docs/a11y/A11Y.md §4). A count found 52 sizes under it: 43 in
// Explore, 6 in the popover, 3 in web.css, from 9px to 11.5px. Settings had its
// own check and was clean; nothing held the other pages.
//
// Read from every page and every stylesheet and script beside them, so a size
// set from a script is seen too. Three sizes are not words and stay: each is
// named below with its reason, and the check fails when one of them stops
// matching, so the list cannot outlive what it excuses.
{
  const name = "nothing is written under 12px";
  console.log(`\n${name}`);
  const MIN = 12;
  const NOT_WORDS = {
    "src/renderer/popover.html": { "#toggle": "the play icon, an SVG drawn at 1em" },
    "web/web.css": {
      ".ticker li::before": "the dot between two ticker items",
      "body.phonebar .now #play": "the play icon, an SVG drawn at 1em",
    },
  };
  const files = [
    ...fs.readdirSync(R("src/renderer")).filter((f) => /\.(html|js)$/.test(f)).map((f) => `src/renderer/${f}`),
    ...fs.readdirSync(R("web")).filter((f) => /\.(css|js)$/.test(f)).map((f) => `web/${f}`),
  ];
  const SIZE = /font-size\s*:\s*([\d.]+)px|\bfont\s*:[^;}"'`]*?\b([\d.]+)px|fontSize\s*=\s*["'`]([\d.]+)px/g;
  const small = [], used = new Set();
  let seen = 0;
  for (const f of files) {
    // Comments are blanked, not cut, so a line number is still the file's.
    const src = fs.readFileSync(R(f), "utf8").replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "));
    for (const m of src.matchAll(SIZE)) {
      seen++;
      const px = Number(m[1] ?? m[2] ?? m[3]);
      if (!(px < MIN)) continue;
      const open = src.lastIndexOf("{", m.index);
      const from = Math.max(src.lastIndexOf("}", open), src.lastIndexOf("{", open - 1), src.lastIndexOf(";", open)) + 1;
      const sel = src.slice(from, open).replace(/\s+/g, " ").trim();
      if (NOT_WORDS[f]?.[sel]) { used.add(`${f} ${sel}`); continue; }
      small.push(`${f}:${src.slice(0, m.index).split("\n").length} ${px}px`);
    }
  }
  const stale = Object.entries(NOT_WORDS).flatMap(([f, sels]) => Object.keys(sels).map((s) => `${f} ${s}`)).filter((k) => !used.has(k));
  const gaps = [];
  if (seen < 100) gaps.push(`only ${seen} sizes found in ${files.length} files — this check is blind`);
  if (small.length) gaps.push(`${small.length} under ${MIN}px: ${small.slice(0, 12).join(", ")}${small.length > 12 ? `, and ${small.length - 12} more` : ""}`);
  if (stale.length) gaps.push(`excused as not words, and no longer under ${MIN}px or no longer there: ${stale.join("; ")}`);
  gaps.length ? fail(name, gaps.join("; "))
    : pass(`${seen} sizes in ${files.length} files, none under ${MIN}px but ${used.size} that are not words (two icons and a dot)`);
}

// ── on a phone the station's name keeps its room ────────────────────────────
// Seen on an iPhone: playing a station in Austin, the player
// row read "KU…  Austin TX · United St…". The status (the town and country,
// once playing) was rigid up to two fifths of the row, and the name was the
// only thing that gave way. The status gives way first now, down to a floor
// that still holds "Press play" (once squeezed to "P…"), and then the name.
{
  const name = "on a phone the station's name keeps its room";
  console.log(`\n${name}`);
  const css = readSrc("web/web.css").replace(/\/\*[\s\S]*?\*\//g, "");
  // Every rule for a selector, joined: the status has a second one for its margin.
  const rules = (sel) => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((m) => m[1].trim() === sel).map((m) => m[2]).join(";");
  const st = rules("body.phonebar .now #nowStatus"), nm = rules("body.phonebar .now b");
  const shrink = (r) => Number((r.match(/flex:\s*[\d.]+\s+([\d.]+)/) || [])[1]);
  const gaps = [];
  if (!st || !nm) gaps.push("the phone's rules for the name and the status were not found — this check is blind");
  else {
    if (!(shrink(nm) > 0)) gaps.push("the name can no longer shorten at all, so a long one pushes the buttons off the row");
    if (!(shrink(st) >= shrink(nm) * 100)) gaps.push(`the status does not give way before the name (it shrinks ${shrink(st)} to the name's ${shrink(nm)})`);
    if (/max-width:\s*[\d.]+%/.test(st)) gaps.push("the status is held to a share of the row whatever the name needs");
    if (shrink(st) > 0 && !/min-width:\s*(?:[5-9]|\d\d)(?:\.\d+)?em/.test(st)) gaps.push('the status has no floor of 5em, so "Press play" can be squeezed to "P…"');
  }
  gaps.length ? fail(name, gaps.join("; "))
    : pass("the status gives way first, down to the width of \"Press play\", and only then the name");
}

// ── a station starting does not rebuild the globe ───────────────────────────
// Timed on an Intel MacBook with the app's own profiler:
// the first press on a station froze the window for over a second. The play
// bar comes in under the globe, the globe's pane loses the bar's 44px, the
// pane's observer calls sizeGlobe(), and one WebGLRenderer.setSize() for that
// took 1,402 ms in a single task. Nothing else in the press cost a tenth of it.
//
// The canvas keeps its height now when the pane only loses a strip at the
// bottom: the mount clips what hangs below, and the camera is centred in the
// pane rather than in the canvas, the same way it already allows for a panel.
{
  const name = "a station starting does not rebuild the globe";
  console.log(`\n${name}`);
  const src = readSrc("src/renderer/explore-trackers.js");
  const body = (fn) => (src.match(new RegExp(`function ${fn}\\s*\\([^)]*\\)\\s*\\{([\\s\\S]*?)\\n\\}`)) || [])[1];
  const size = body("sizeGlobe"), centre = body("centreGlobe");
  const css = readSrc("src/renderer/explore.html").replace(/\/\*[\s\S]*?\*\//g, "");
  const mount = (css.match(/#globe\{([^}]*)\}/) || [])[1];
  const gaps = [];
  if (!size || !centre || mount === undefined) gaps.push("sizeGlobe, centreGlobe or the #globe rule is gone — this check is blind");
  else {
    const calls = size.match(/globe\.width\([^)]+\)\.height\([^)]+\)/g) || [];
    const guarded = /if\s*\([^{]*SPARE_HEIGHT[^{]*\)\s*\{[^}]*globe\.width\(/.test(size.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, ""));
    if (!calls.length) gaps.push("sizeGlobe no longer sizes the globe at all");
    else if (!guarded) gaps.push("the canvas is rebuilt for any change in the pane's height, the play bar's 44px included (1.4 s on an Intel Mac)");
    if (/const css\s*=\s*w\.clientWidth\s*\*\s*w\.clientHeight/.test(size)) gaps.push("the pixel ratio is worked out from the pane, so on a large window the bar's 44px still changes it and rebuilds the canvas");
    if (!/globe\.height\(\)/.test(centre)) gaps.push("the planet is centred in the pane's height, not allowing for a canvas left taller than it");
    if (!/overflow:\s*hidden/.test(mount)) gaps.push("the canvas is not clipped to its pane, so what hangs below would show under the play bar");
  }
  gaps.length ? fail(name, gaps.join("; "))
    : pass("the canvas keeps its size when the play bar takes a strip from the pane, and the planet is centred in what shows");
}

// ── a changed setting does not make the popover forget the station ──────────
// 10 Oct 2026, seen in a photograph of the menu-bar popover taken while a
// station played: the pause button, the on-air lamp, and "Nothing playing /
// Search for a station". The name and the status carry data-i18n for the words
// they start with, and applyStrings() rewrites every data-i18n element. It runs
// again on every change of any preference, the theme, the palette and "Show
// other listeners" included, so the first setting touched while listening put
// the starting words back over the station's name, and had the status
// (role="status") announce "Search for a station" to a screen reader.
{
  const name = "a changed setting does not make the popover forget the station";
  console.log(`\n${name}`);
  const src = readSrc("src/renderer/popover.js");
  const html = readSrc("src/renderer/popover.html");
  const fn = (src.match(/async function applyStrings\s*\(\)\s*\{([\s\S]*?)\n\}/) || [])[1];
  const live = ["nowName", "status"].filter((id) => new RegExp(`id="${id}"[^>]*data-i18n=`).test(html));
  const gaps = [];
  if (!fn) gaps.push("applyStrings is gone — this check is blind");
  else if (live.length) {
    const loop = (fn.match(/for \(const el of document\.querySelectorAll\("\[data-i18n\]"\)\) \{([\s\S]*?)\n  \}/) || [])[1] || "";
    if (!/nowName/.test(loop) || !/statusEl/.test(loop) || !/continue/.test(loop))
      gaps.push(`#${live.join(" and #")} start as translated words and are rewritten with them on every preference change, while a station is playing`);
  }
  gaps.length ? fail(name, gaps.join("; "))
    : pass("the name and the status are translated only while nothing has been tuned");
}

// ── gaps and lone paddings sit on even steps ────────────────────────────────
// 10 Oct 2026, counted for the design system file: the space between things
// was written as plain px in twelve different steps, 3, 5, 7, 9 and 11 among
// them, and nobody could say why a row of chips was 5 apart and a row of
// buttons 7. The steps are even now: 2, 4, 6, 8, 10, 12, 14, 16, 20.
//
// Only where a number stands alone: a gap, or a padding or margin of one value.
// A padding of several values is usually arithmetic (the play bar's right edge
// is a 7px gutter plus a row's 10px inset, and says so), and evening those out
// one by one would move edges that were lined up on purpose. Negative margins
// are nudges, not spacing. A padding that only gives back a negative margin of
// the same size, in the same rule, is the same arithmetic and is left alone.
{
  const name = "gaps and lone paddings sit on even steps";
  console.log(`\n${name}`);
  const sheets = [["src/renderer/explore.html", true], ["src/renderer/settings.html", true], ["src/renderer/popover.html", true],
                  ["src/renderer/splash.html", true], ["web/web.css", false]];
  const PROP = /(?<![-\w])(gap|row-gap|column-gap|padding|margin|(?:padding|margin)-(?:top|right|bottom|left|inline|block))\s*:\s*([^;}{]+)/g;
  const odd = [];
  let seen = 0;
  for (const [file, html] of sheets) {
    const raw = readSrc(file);
    const css = (html ? (raw.match(/<style[^>]*>[\s\S]*?<\/style>/g) || []).join("\n") : raw).replace(/\/\*[\s\S]*?\*\//g, "");
    for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const sel = rule[1].trim().replace(/\s+/g, " ").slice(-48), body = rule[2];
      for (const d of body.matchAll(PROP)) {
        const prop = d[1], val = d[2].trim();
        const lone = /gap/.test(prop) || val.split(/\s+/).length === 1;
        if (!lone) continue;
        seen++;
        for (const n of val.matchAll(/(?<![\w.-])(\d+(?:\.\d+)?)px/g)) {
          const px = Number(n[1]);
          if (px < 3 || px % 2 !== 1) continue;
          const side = (prop.match(/^padding-(\w+)$/) || [])[1];
          if (side && new RegExp(`margin-${side}\\s*:\\s*-${n[1]}px`).test(body)) continue;   // gives back its own negative margin
          odd.push(`${file.split("/").pop()}: ${sel} { ${prop}:${val} }`);
        }
      }
    }
  }
  const gaps = [];
  if (seen < 100) gaps.push(`only ${seen} gaps and lone paddings were found — this check is blind`);
  if (odd.length) gaps.push(`${odd.length} off the even steps: ${odd.slice(0, 6).join("; ")}${odd.length > 6 ? "; …" : ""}`);
  gaps.length ? fail(name, gaps.join("; "))
    : pass(`${seen} gaps and lone paddings, every one on an even step`);
}

// ── every distance follows the listener's units ─────────────────────────────
// A listener in the US was shown kilometres.
// The hop line under a place already asked src/geo.js, which asks the system
// (miles in the US and the UK, kilometres elsewhere) and honours the units
// preference. Six other lines wrote " km" straight into the page: how far the
// place is from what is playing, the towns within reach, the shortwave
// receivers nearby (twice), a propagation spot, the space station's height.
// The wind was km/h beside a temperature in Fahrenheit.
{
  const name = "every distance follows the listener's units";
  console.log(`\n${name}`);
  const dir = path.join(ROOT, "src", "renderer");
  const gaps = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".js"))) {
    const src = fs.readFileSync(path.join(dir, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    src.split("\n").forEach((line, i) => {
      // An interpolated number followed by a written unit: `${x} km`, `${x} km/h`.
      if (/\$\{[^}]*\}\s*km(?:\/h)?\b/.test(line) && !/function fmtKm|const fmtKph/.test(line)) gaps.push(`${f}:${i + 1} writes km whatever the listener uses`);
    });
  }
  const core = readSrc("src/renderer/explore-core.js");
  if (!/function fmtKm\s*\(/.test(core)) gaps.push("there is no fmtKm() for the page to write a distance with");
  else {
    const fn = (core.match(/function fmtKm\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/) || [])[1] || "";
    const geoFn = (readSrc("src/geo.js").match(/function format\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/) || [])[1] || "";
    const steps = (s) => (s.match(/Math\.round\(v(?: \/ \d+)?\)(?: \* \d+)?/g) || []).join("|");
    if (!steps(geoFn) || steps(fn) !== steps(geoFn)) gaps.push("fmtKm() rounds differently from src/geo.js, so two lines on one screen would disagree");
  }
  if (!/unit:\s*\(/.test(readSrc("src/preload.js"))) gaps.push("the page cannot ask which unit the listener uses (no unit() on the bridge)");
  if (!/unit:\s*async/.test(readSrc("web/bridge.js"))) gaps.push("the web build cannot ask which unit the listener uses");
  gaps.length ? fail(name, gaps.slice(0, 8).join("; "))
    : pass("no line writes km on its own; all of them ask the system, or the units preference");
}

// ── a link that asks to play is played ──────────────────────────────────────
// Pressing "Play on the globe" on a station's page on the site only opened
// the globe; it must go to that station, start buffering and play. ?station= opened the station cued and paused, on purpose: a shared
// card's link should not make sound for whoever scans it. A press on our own
// Play button is the listener asking, so that link says so (&play=1) and the
// app starts the station. A browser may still refuse sound nobody has touched
// the page for; then the station waits, and the first press anywhere starts it.
{
  const name = "a link that asks to play is played";
  console.log(`\n${name}`);
  const src = readSrc("web/bridge.js");
  const fn = (src.match(/async function cueAsked\s*\([^)]*\)\s*\{([\s\S]*?)\n  \}/) || [])[1];
  const gaps = [];
  if (!fn) gaps.push("cueAsked is gone — this check is blind");
  else {
    if (!/wantsPlay|["']play["']/.test(src.slice(src.indexOf("DOMContentLoaded")))) gaps.push("?play is never read, so every link opens its station paused");
    if (!/tune\(ch\)/.test(fn)) gaps.push("a station asked for with ?play is cued and never started");
    if (!/once:\s*true/.test(fn)) gaps.push("when the browser refuses the sound, nothing starts it on the listener's first press");
  }
  gaps.length ? fail(name, gaps.join("; "))
    : pass("?station=…&play=1 starts the station, or waits for the first press if the browser will not");
}

// ── an Android phone is offered the home screen too ─────────────────────────
// 12 Oct 2026. The guide to the home screen was written for the iPhone, where
// Safari hides the way three screens deep. Chrome on Android can install the
// app itself and says when it is ready to (beforeinstallprompt), but nothing
// listened, so an Android listener was never offered it and had to know to
// look in Chrome's menu. The manifest and the worker were already enough.
{
  const name = "an Android phone is offered the home screen too";
  console.log(`\n${name}`);
  const src = readSrc("web/install.js"), css = readSrc("web/web.css");
  const gaps = [];
  if (!/beforeinstallprompt/.test(src)) gaps.push("nothing listens for the browser saying the app can be installed");
  else {
    if (!/preventDefault\(\)/.test(src)) gaps.push("the browser's own bar is not held back, so it and the app's card would both show");
    if (!/\.prompt\(\)/.test(src)) gaps.push("the offer is kept and never made");
    if (!/later\(\)/.test(src.slice(src.indexOf("beforeinstallprompt")))) gaps.push('"Not now" is not remembered for Android');
    if (!/appinstalled/.test(src)) gaps.push("the card stays up after the app has been installed");
  }
  if (!/\.installgo\b/.test(css)) gaps.push("the Install button has no style");
  else if (!/\.installgo\s*\{[^}]*min-height:\s*4[4-9]px/.test(css)) gaps.push("the Install button is under 44px tall");
  gaps.length ? fail(name, gaps.join("; "))
    : pass("the browser's offer is held, shown as the app's own card, and made on a press; Not now is remembered");
}

// ── the manifest says what a phone is about to install ──────────────────────
// 12 Oct 2026, from PWABuilder's report card on listen.auralfm.xyz: nothing
// required was missing, but the manifest named no language, no category and no
// screenshots, so Android's install sheet showed an icon and a name and nothing
// of the app; and nothing said what a link into an installed app should do, so
// a station's link opened a second window beside the one already playing.
//
// Its other suggestions are not faults and are left out on purpose. Push
// notifications, background sync and periodic sync each need a server that
// remembers a device. An age rating and related store apps would be claims
// about a certificate and apps that do not exist.
{
  const name = "the manifest says what a phone is about to install";
  console.log(`\n${name}`);
  const src = readSrc("scripts/build-web.mjs");
  const m = src.slice(src.indexOf('"manifest.webmanifest"), JSON.stringify('));
  const gaps = [];
  if (m.length < 50) gaps.push("the manifest is no longer written where this check looks — it is blind");
  else {
    for (const [key, why] of [["lang", "no language"], ["dir", "no text direction"], ["categories", "no category for a store or a launcher to file it under"],
                              ["display_override", "no order of display modes to fall back through"], ["launch_handler", "a link into the installed app opens a second window"]])
      if (!new RegExp(`\\b${key}:`).test(m)) gaps.push(why);
    for (const no of ["iarc_rating_id", "gcm_sender_id"]) if (new RegExp(`\\b${no}:`).test(m)) gaps.push(`${no} claims something AuralFM does not have`);
    const shots = [...m.matchAll(/src:\s*"assets\/screens\/([\w-]+\.jpg)",\s*sizes:\s*"(\d+)x(\d+)",\s*type:\s*"image\/jpeg",\s*form_factor:\s*"(narrow|wide)"/g)];
    if (!shots.some((x) => x[4] === "narrow") || !shots.some((x) => x[4] === "wide")) gaps.push("no screenshots for a phone and for a wide screen");
    // A JPEG's real size, from its frame header: the manifest must not say otherwise.
    const sizeOf = (buf) => { let i = 2; while (i < buf.length) { if (buf[i] !== 0xFF) return null; const k = buf[i + 1]; if (k >= 0xC0 && k <= 0xCF && k !== 0xC4 && k !== 0xC8 && k !== 0xCC) return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)]; i += 2 + buf.readUInt16BE(i + 2); } return null; };
    for (const [, file, w, h] of shots) {
      const f = path.join(ROOT, "assets", "brand", "screens", file);
      if (!fs.existsSync(f)) { gaps.push(`${file} is named and is not in assets/brand/screens`); continue; }
      const real = sizeOf(fs.readFileSync(f));
      if (!real || real[0] !== Number(w) || real[1] !== Number(h)) gaps.push(`${file} is ${real ? real.join("x") : "unreadable"}, and the manifest says ${w}x${h}`);
      if (fs.statSync(f).size > 400 * 1024) gaps.push(`${file} is over 400 KB`);
    }
    if (shots.length && !/assets\/brand\/screens|"screens"/.test(src.slice(0, src.indexOf('"manifest.webmanifest"), JSON.stringify(')))) gaps.push("the screenshots are named and never copied into the build");
  }
  gaps.length ? fail(name, gaps.join("; "))
    : pass("language, category, screenshots for a phone and a wide screen, and one window for a link into the app");
}

// ── the catalogue's code here is the catalogue's ────────────────────────────
// 12 Oct 2026. The station list, the taxonomy and their build moved to their
// own repository, AuralFM/catalogue. The app keeps copies of the three files
// it runs (src/catalog.js, src/taxonomy.js, src/region.js) so that a checkout,
// a worktree and a packaged app still work alone. A copy edited here would be
// overwritten by the next `npm run catalogue`, and a fix made there and never
// brought over would never ship. Compared byte for byte.
{
  const name = "the catalogue's code here is the catalogue's";
  console.log(`\n${name}`);
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync(process.execPath, [R("scripts/catalogue.mjs"), "--check"], { encoding: "utf8" });
  if (r.status === 2) skip(name, NO_CAT);
  else if (r.status !== 0) fail(name, (r.stdout + r.stderr).trim());
  else pass("src/catalog.js, src/taxonomy.js and src/region.js match the catalogue's, byte for byte");
}

// ── the reader's two buttons wear the palette ───────────────────────────────
// 13 Oct 2026. In the headline reader on a phone, "‹ Headlines" and "Open in
// browser" were the grey of a caption while every other thing to press wore the
// palette's colour, and each was 30pt tall in a sheet worked by a thumb.
{
  const name = "the reader's two buttons wear the palette";
  console.log(`\n${name}`);
  const css = readSrc("src/renderer/explore.html"), web = readSrc("web/web.css");
  const rule = (sel) => css.match(new RegExp(`\\n\\s*\\.${sel}\\{([^}]*)\\}`))?.[1] || "";
  const gaps = [];
  for (const sel of ["readback", "readopen"]) {
    const r = rule(sel);
    if (!r) gaps.push(`.${sel} has no rule — this check is blind`);
    else if (!/color:var\(--accent\)/.test(r)) gaps.push(`.${sel} is not the palette's colour`);
  }
  if (!/\.readback:focus-visible,\.readopen:focus-visible\{[^}]*outline/.test(css)) gaps.push("neither shows where the keyboard is");
  if (!/\.readback,\s*\.readopen\s*\{[^}]*min-height:\s*4[4-9]px/.test(web)) gaps.push("on a touch screen they are under 44px tall");
  gaps.length ? fail(name, gaps.join("; ")) : pass("the way back and the way out are the accent, focusable, and 44px to a thumb");
}

// ── the chat counts who is here, not who is listening ───────────────────────
// 13 Oct 2026. The rail read "3 listening". The number is everyone the public
// relays show in that cell, and a relay carries other apps: the count never
// knew what anyone was doing. "Here" is the part that is true.
{
  const name = "the chat counts who is here, not who is listening";
  console.log(`\n${name}`);
  const chat = readSrc("src/renderer/explore-chat.js"), i18n = readSrc("src/i18n.js");
  const gaps = [];
  if (!/t\("chat\.count",\s*"here"\)/.test(chat)) gaps.push("the heading does not say \"here\"");
  if (/chat\.listeners?"/.test(chat + i18n)) gaps.push("\"listening\" is still a string for the count");
  const langs = (i18n.match(/"chat\.count":/g) || []).length;
  if (langs !== 5) gaps.push(`${langs} of 5 languages have the word`);
  gaps.length ? fail(name, gaps.join("; ")) : pass("\"3 here\", in five languages");
}

// ── the list of places follows a hand on the globe ──────────────────────────
// 13 Oct 2026. On a phone Explore opens on the list of places, and it stood
// still while the globe turned: Paris and London on top with Lagos in the
// middle of the screen. It re-sorts to "Near here" now, and only for a hand:
// the idle drift or a flight must not reshuffle a list somebody is about to
// press. Drawing 400 rows took 120ms, so a moving globe gets a short list and a
// resting one gets the whole of it.
{
  const name = "the list of places follows a hand on the globe";
  console.log(`\n${name}`);
  const view = readSrc("src/renderer/explore-view.js"), core = readSrc("src/renderer/explore-core.js");
  const fn = view.slice(view.indexOf("function followBrowse("), view.indexOf("function followBrowse(") + 1400);
  const gaps = [];
  if (fn.length < 200) gaps.push("followBrowse is gone — this check is blind");
  else {
    if (!/!browsingPlaces/.test(fn)) gaps.push("it does not stop when the list is not the browse list");
    if (!/handOn/.test(fn) || !/handUntil/.test(fn)) gaps.push("anything that moves the camera re-sorts the list, not only a hand");
    if (!/flying/.test(fn) || !/locked/.test(fn)) gaps.push("a flight or a locked station still re-sorts it");
    if (!/qEl\.value/.test(fn)) gaps.push("a search's results are replaced by it");
    if (!/povApart\(pov,\s*handFrom\)/.test(fn)) gaps.push("a tap that turned nothing re-sorts it");
    if (!/placeOrder\s*=\s*"near"/.test(fn)) gaps.push("it does not sort by nearness");
    if (!/atRest\s*\?\s*400\s*:\s*MOVING_ROWS/.test(fn)) gaps.push("it draws the whole list on every move, or never draws it whole");
  }
  if (!/addEventListener\("start",[^\n]*handOn = true/.test(view)) gaps.push("nothing marks a hand going on the globe");
  if (!/addEventListener\("end",[^\n]*handOn = false/.test(view)) gaps.push("nothing marks the hand coming off");
  if (!/!globe\.controls\(\)\.autoRotate/.test(view.slice(view.indexOf("function onCameraChange"), view.indexOf("function restSoon")))) gaps.push("the idle drift keeps the hand's window open");
  if (!/async function loadPlaces\(query = "", limit = 400\)/.test(core)) gaps.push("loadPlaces cannot be asked for a short list");
  gaps.length ? fail(name, gaps.join("; ")) : pass("nearest first while a hand turns it: forty rows moving, the whole list at rest; not for drift, a flight, a lock, a search or a tap");
}

// ── the globe's read-out rides the sheet ────────────────────────────────────
// 13 Oct 2026. On a phone the read-out was anchored to where the station sheet
// rests, so Explore, Headlines, Chat and Settings each rose straight over it.
// It sits on the top edge of whichever sheet is up, and when the station sheet
// settles it makes the same move in the same time. That last part is two CSS
// transitions that have to agree, which is exactly what drifts.
{
  const name = "the globe's read-out rides the sheet";
  console.log(`\n${name}`);
  const css = readSrc("web/web.css"), sheet = readSrc("web/sheet.js"), rail = readSrc("web/rail-sheet.js");
  const gaps = [];
  if (!/@property --ride\s*\{[^}]*syntax:\s*"<length>"/.test(css)) gaps.push("--ride is not a length the browser can animate");
  const bar = css.match(/\.globebar\s*\{[^}]*\}/g)?.find((r) => /--ride/.test(r)) || "";
  if (!bar) gaps.push("the read-out does not use --ride");
  else if (/--peek\)\s*\+/.test(bar)) gaps.push("the read-out is anchored to the sheet's rest again");
  const timing = (sel) => css.match(new RegExp(`\\.${sel}\\.settling\\s*\\{\\s*transition:\\s*[\\w-]+\\s+([\\d.]+s\\s+cubic-bezier\\([^)]*\\))`))?.[1];
  const a = timing("railcol"), b = timing("globebar");
  if (!a || !b) gaps.push("the sheet or the read-out has no settling transition to compare");
  else if (a !== b) gaps.push(`the sheet settles in ${a} and the read-out in ${b}`);
  if (!/\.globebar\.tucked/.test(css)) gaps.push("it is never put away when the sheet reaches the top");
  if (!/AuralSheet\?\.ride\?\.\(rail,\s*rail\.offsetHeight - v,\s*rail\.classList\.contains\("settling"\)\)/.test(rail)) gaps.push("the station sheet does not say where it is going");
  if (!/const moveTo = [^\n]*ride\(/.test(sheet)) gaps.push("a panel on a spring does not move it");
  if (!/const place = [^\n]*ride\(/.test(sheet)) gaps.push("Settings does not move it");
  if (!/if \(settling !== undefined\)/.test(sheet)) gaps.push("a re-check cuts a running transition short");
  if (!/MutationObserver\(\(\) => ride\(\)\)/.test(sheet)) gaps.push("a panel hidden without a spring leaves it where it was");
  gaps.length ? fail(name, gaps.join("; ")) : pass("on the edge of whichever sheet is up, in step with the station sheet, away when there is no globe left");
}

// ── the sleep timer goes by the clock ───────────────────────────────────────
// 13 Oct 2026. New: stop the station after 15 to 90 minutes, fading the last
// twenty seconds. Run here with a clock that can be moved, because the two
// things worth getting wrong are both about time: counting ticks (a background
// tab's are slowed, a sleeping laptop's do not happen) and leaving the volume
// where the fade ended.
{
  const name = "the sleep timer goes by the clock";
  console.log(`\n${name}`);
  const gaps = [];
  let now = 1_000_000, level = 0.8, playing = true, stops = 0, changes = 0;
  const box = { window: {}, Date: { now: () => now }, setInterval: () => 1, clearInterval: () => {}, Number, Math };
  try {
    vm.runInNewContext(readSrc("src/renderer/sleep.js"), box);
    const S = box.window.AuralSleep;
    S.init({ level: () => level, setLevel: (v) => { level = v; }, playing: () => playing,
             stop: () => { stops++; playing = false; }, changed: () => { changes++; } });
    S.set(7);
    if (S.endsAt()) gaps.push("7 minutes is not a choice and started a timer");
    S.set(30);
    if (S.endsAt() !== now + 30 * 60000) gaps.push("30 minutes does not end 30 minutes from now");
    now += 29 * 60000; S.check();
    if (level !== 0.8 || stops) gaps.push("it touched the sound with a minute still to go");
    now += 50000; S.check();                    // ten seconds left
    if (!(level > 0.35 && level < 0.45)) gaps.push(`ten seconds from the end the level is ${level.toFixed(2)}, not half`);
    now += 3 * 3600000; S.check();              // a laptop that slept through it
    if (stops !== 1) gaps.push(`the station was stopped ${stops} times`);
    if (level !== 0.8) gaps.push(`the level was left at ${level.toFixed(2)} after the fade`);
    if (S.endsAt()) gaps.push("it is still running after it ended");
    S.check();
    if (stops !== 1) gaps.push("it stops again on the next look");
    S.set(15); now += 14 * 60000 + 50000; S.check(); S.set(0);
    if (level !== 0.8 || S.endsAt()) gaps.push("turned off during the fade, it left the level faded or kept running");
    if (!changes) gaps.push("nobody is told when it starts or ends");
  } catch (e) { gaps.push(`sleep.js did not run: ${e.message}`); }
  const pop = readSrc("src/renderer/popover.js"), bridge = readSrc("web/bridge.js");
  for (const [who, src] of [["the Mac's player", pop], ["the web's player", bridge]]) {
    const init = src.slice(src.indexOf("AuralSleep?.init("), src.indexOf("AuralSleep?.init(") + 420);
    if (init.length < 100) { gaps.push(`${who} never starts it`); continue; }
    if (/setLevel:[^\n]*(applyVolume|setState|persist)/.test(init)) gaps.push(`${who} saves the faded level`);
    if (!/action === "sleep"/.test(src)) gaps.push(`${who} does not take the request`);
    if (!/sleepEndsAt:/.test(src)) gaps.push(`${who} does not say when it ends`);
    if (!/addEventListener\("timeupdate",[^\n]*AuralSleep/.test(src)) gaps.push(`${who} looks only on a timer, which a phone with its screen off may not run`);
  }
  // On an iPhone the timer worked and the row read "Sleep ti…".
  if (!/stop: \(\) => stop\("Sleep timer ended", true\)/.test(bridge) || !/setStatus\(said, false, notice\)/.test(bridge)) gaps.push("on a phone the line that says why the sound stopped is cut short");
  if (!/<script src="sleep\.js"><\/script>\s*<script src="popover\.js">/.test(readSrc("src/renderer/popover.html"))) gaps.push("the menu bar panel does not load it before its player");
  if (!/"sleep\.js",\s*"web\/bridge\.js"/.test(readSrc("scripts/build-web.mjs"))) gaps.push("the web build does not load it before its player");
  if (!/id="sleep"/.test(readSrc("src/renderer/settings.html"))) gaps.push("Settings has no way to set it");
  gaps.length ? fail(name, gaps.join("; ")) : pass("ends on time whatever the timers did, fades the last 20s, puts the level back, and both players use the one file");
}

// ── a private message can notify, and nothing else does ─────────────────────
// 13 Oct 2026. New, and off unless asked for: a notification when a private
// message arrives and the app is not in front. The rules that matter are the
// ones that keep it from becoming something else: never the public room, never
// history replayed by a relay, never past the mute list or the word filter,
// never the text when previews are hidden, and never through a push service.
{
  const name = "a private message can notify, and nothing else does";
  console.log(`\n${name}`);
  const { createRequire } = await import("node:module");
  const req = createRequire(import.meta.url);
  const gaps = [];
  try {
    const N = req(R("src/notify.js"));
    let now = 10_000_000;
    const fresh = N.tracker([{ id: "old", unread: true, at: now }], () => now);
    const got = fresh([
      { id: "old", unread: true, at: now },                 // there before
      { id: "mine", mine: true, unread: false, at: now },   // sent by the listener
      { id: "read", unread: false, at: now },               // already read
      { id: "stale", unread: true, at: now - N.RECENT_MS - 1 },
      { id: "new", unread: true, at: now, from: "a1b2c3d4", text: "hello\n there" },
    ]).map((m) => m.id);
    if (got.join() !== "new") gaps.push(`of five messages it would notify for: ${got.join(", ") || "none"}`);
    if (fresh([{ id: "new", unread: true, at: now }]).length) gaps.push("the same message notifies twice");
    const open = N.words({ from: "a1b2c3d4", text: "hello\n there" });
    if (!/hello there/.test(open.body)) gaps.push("the message is not in the notification");
    const shut = N.words({ from: "a1b2c3d4", text: "the secret" }, { hidePreviews: true });
    if (/secret|a1b2c3d4/.test(shut.title + shut.body)) gaps.push("with previews hidden it still shows the text or the sender");
    if (req(R("src/prefs.js")).DEFAULTS.notify !== false) gaps.push("it is not off by default");
  } catch (e) { gaps.push(`src/notify.js did not run: ${e.message}`); }
  const main = readSrc("src/main.js"), web = readSrc("web/messaging.js"), sw = readSrc("web/sw.js");
  for (const [who, src] of [["the Mac", main], ["the web", web]]) {
    const hook = src.slice(src.indexOf("const freshDms = notify.tracker("), src.indexOf("const freshDms = notify.tracker(") + 1500);
    if (hook.length < 100) { gaps.push(`${who} never looks for a new private message`); continue; }
    if (!/freshDms\(clean\)/.test(hook) || !/const clean = visible\(list\)/.test(hook)) gaps.push(`on ${who} a muted person or a filtered word can still notify`);
    if (!/\.notify !== true/.test(hook)) gaps.push(`on ${who} it notifies without being asked to`);
    if (!/hidePreviews/.test(hook)) gaps.push(`on ${who} it ignores "Hide message text until opened"`);
  }
  if (!/explore\?\.isFocused\(\)/.test(main)) gaps.push("the Mac notifies with Explore in front");
  if (!/!document\.hidden/.test(web)) gaps.push("the web notifies with the page in sight");
  if (/addEventListener\(\s*["']push["']/.test(sw)) gaps.push("the service worker listens for a push, which needs a server that knows this device");
  if (!/notificationclick/.test(sw)) gaps.push("pressing the notification does nothing");
  if (/new Notification|showNotification/.test(readSrc("src/renderer/explore-chat.js"))) gaps.push("the public room raises notifications");
  const set = readSrc("src/renderer/settings.js");
  if (!/Notification\.requestPermission\(\)/.test(set) || !/Notification\.permission === "denied"/.test(set)) gaps.push("the switch never asks the browser, or does not say when it is blocked");
  gaps.length ? fail(name, gaps.join("; ")) : pass("off by default; new, unread, recent, inbound, past the mute list; no text when previews are hidden; no push service");
}

// ── a vibe counts what this copy shows ──────────────────────────────────────
// 13 Oct 2026. "Some stations in Vibes do not show on the web app." A vibe
// counted every station carrying its tags; the web shows only what a page
// served over https can play. So a vibe said 969 and showed 743, 1,318 of its
// rows across the vibes opened a place with nothing of that vibe in it, and a
// link to one of the missing stations opened the app on some other station
// without a word. Run against the catalogue as the web loads it.
{
  const name = "a vibe counts what this copy shows";
  console.log(`\n${name}`);
  const gaps = [];
  if (!fs.existsSync(R("data/stations.min.json"))) skip(name, "no built catalogue here (npm run catalogue)");
  else {
    const { createRequire } = await import("node:module");
    const req = createRequire(import.meta.url);
    const file = req.resolve(R("src/catalog.js"));
    delete req.cache[file];
    const log = console.log; console.log = () => {};
    const cat = req(file); cat.load(); cat.setPlayableOnly(true);
    console.log = log;
    let said = 0, shown = 0, empty = 0;
    for (const v of cat.VIBES) {
      const want = new Set(v.tags);
      for (const p of cat.vibePlaces(v.id)) {
        const n = cat.placeChannels(p.i).channels.filter((c) => c.tags.some((t) => want.has(t.toLowerCase()))).length;
        said += p.n; shown += n; if (!n) empty++;
      }
    }
    delete req.cache[file];
    if (shown < 10000) gaps.push(`only ${shown} stations found in the vibes — this check is blind`);
    if (said !== shown) gaps.push(`the vibes say ${said.toLocaleString()} stations and show ${shown.toLocaleString()}`);
    if (empty) gaps.push(`${empty.toLocaleString()} rows open a place with nothing of that vibe to play`);
    const bridge = readSrc("web/bridge.js");
    const cue = bridge.slice(bridge.indexOf("async function cueAsked("), bridge.indexOf("async function cueAsked(") + 1400);
    if (!/Not playable here/.test(cue) || !/No longer listed/.test(cue) || !/setStatus\(why, false, true\)/.test(cue)) gaps.push("a link to a station the web cannot show opens another one and says nothing");
    if (!/\.now\.notice #nowStatus/.test(readSrc("web/web.css")) || !/classList\.toggle\("notice"/.test(readSrc(EXPLORE))) gaps.push("on a phone that line is cut to its first few letters");
    gaps.length ? fail(name, gaps.join("; ")) : pass(`${shown.toLocaleString()} stations across ${cat.VIBES.length} vibes, each one counted is one shown; a link to a missing one says why`);
  }
}

// ── the repository's own paperwork holds together ───────────────────────────
// 13 Oct 2026. Four things that fail silently on GitHub. The issue chooser had
// a link with no address, which GitHub answers by ignoring the whole file. A
// branch rule names the check that must pass, and a job renamed later is a
// rule nothing can ever satisfy. Code scanning on a private repository fails
// at its last step on every push. And a page of links is only as good as the
// files it points at.
{
  const name = "the repository's own paperwork holds together";
  console.log(`\n${name}`);
  const { createRequire } = await import("node:module");
  let yaml = null;
  try { yaml = createRequire(import.meta.url)("js-yaml"); } catch { /* not installed here */ }
  if (!yaml) skip(name, "js-yaml is not installed (npm ci)");
  else {
    const gaps = [];
    const y = (f) => yaml.load(fs.readFileSync(R(f), "utf8"));
    for (const l of y(".github/ISSUE_TEMPLATE/config.yml").contact_links || []) {
      if (!l.name || !l.about || !/^https:\/\//.test(l.url || "")) gaps.push(`the issue chooser's "${l.name || "?"}" has no address or no description, so GitHub ignores the whole file`);
      const local = (l.url || "").match(/\/blob\/main\/(.+)$/)?.[1];
      if (local && !fs.existsSync(R(local))) gaps.push(`the issue chooser links to ${local}, which is not here`);
    }
    const flows = fs.readdirSync(R(".github/workflows")).filter((f) => f.endsWith(".yml"));
    const jobs = new Set();
    for (const f of flows) {
      const w = y(`.github/workflows/${f}`);
      if (!w.permissions) gaps.push(`${f} does not say what its token may do`);
      const on = w.on || w[true] || {};          // YAML reads a bare `on` as true
      if ("pull_request_target" in on) gaps.push(`${f} runs with secrets on a stranger's pull request`);
      for (const j of Object.keys(w.jobs || {})) jobs.add(j);
    }
    const rule = JSON.parse(fs.readFileSync(R(".github/rulesets/main.json"), "utf8"));
    const need = rule.rules.find((r) => r.type === "required_status_checks")?.parameters.required_status_checks.map((c) => c.context) || [];
    if (!need.length) gaps.push("the rule for main requires no check");
    for (const c of need) if (!jobs.has(c)) gaps.push(`the rule for main waits for a check called "${c}", and no workflow has that job`);
    const scan = y(".github/workflows/codeql.yml").jobs.analyze;
    if (!/repository\.private/.test(scan.if || "")) gaps.push("code scanning is not held back on a private repository, where it fails on every push");
    for (const page of ["README.md", "docs/README.md"]) {
      const dir = path.dirname(R(page));
      for (const [, to] of fs.readFileSync(R(page), "utf8").matchAll(/\]\((?!https?:|#|mailto:)([^)#]+)(?:#[^)]*)?\)/g))
        if (!fs.existsSync(path.resolve(dir, to))) gaps.push(`${page} links to ${to}, which is not here`);
    }
    gaps.length ? fail(name, gaps.join("; "))
      : pass(`the issue chooser's links have addresses, ${flows.length} workflows say what their token may do, the rule for main waits for a job that exists, and every link in the two READMEs lands`);
  }
}

// ── a place is named after a town ───────────────────────────────────────────
// Seen in the app: "Truro area area", a hundred miles from
// Truro, holding one station called Jack FM Halifax. A station too far from
// any town to join it gets a place of its own, "<nearest town> area", and the
// nearest place was sometimes another "… area" or a country's stand-in. Eight
// places shipped that way ("Seoul area area", "Across Germany area").
{
  const name = "a place is named after a town";
  console.log(`\n${name}`);
  if (!fs.existsSync(R("data/stations.min.json"))) skip(name, "no built catalogue here (npm run catalogue)");
  else {
    const places = JSON.parse(fs.readFileSync(R("data/stations.min.json"), "utf8")).p.map((p) => p[0]);
    const bad = places.filter((t) => / area area$/.test(t) || /^(Across |Somewhere in |Online).* area$/.test(t));
    const gaps = [];
    if (places.filter((t) => / area$/.test(t)).length < 50) gaps.push("almost no \"… area\" places found — this check is blind");
    if (bad.length) gaps.push(`${bad.length} places are named after a stand-in: ${bad.slice(0, 4).join(", ")}`);
    if (HAS_CAT) {
      const build = fs.readFileSync(C("scripts/expand.mjs"), "utf8");
      if (!/nearestTown\(s\.lat, s\.lon\)\[1\] <= 150/.test(build) || !/if \(standIn\(full\.places\[i\]\)\) continue;/.test(build)) gaps.push("the build still names a place after whatever place is nearest");
    }
    gaps.length ? fail(name, gaps.join("; ")) : pass(`${places.filter((t) => / area$/.test(t)).length} "… area" places, each named after a real town`);
  }
}

// ── a link the page hands in is not a door to this network ──────────────────
// The studio's "track from a link" is fetched by the main process and served
// back to the page as auralfm-track://, readable by it. Neither fetch checked
// the host: a link to a router's admin page over https, or a redirect to one,
// came back to the renderer whole. Both now pass validUrl (src/safehost.js),
// on the link and on where it lands.
{
  const name = "a link the page hands in is not a door to this network";
  console.log(`\n${name}`);
  const ipc = readSrc("src/main/ipc-app.js");
  const open = ipc.slice(ipc.indexOf('"studio:openTrack"'), ipc.indexOf('protocol.handle("auralfm-track"'));
  const serve = ipc.slice(ipc.indexOf('protocol.handle("auralfm-track"'));
  const gaps = [];
  if (!/require\("\.\.\/safehost"\)/.test(ipc)) gaps.push("src/main/ipc-app.js does not use src/safehost.js");
  if (!/validUrl\(url\b/.test(open)) gaps.push("studio:openTrack fetches a link without checking its host");
  if (!/validUrl\(res\.url\b/.test(open)) gaps.push("studio:openTrack does not check where a redirect landed");
  if (!/validUrl\(res\.url\b/.test(serve)) gaps.push("auralfm-track:// serves wherever a later redirect lands");
  gaps.length ? fail(name, gaps.join("; ")) : pass("a track link, and where it redirects, must be a public https host");
}

// ── pressing play on the web does not wait forever ──────────────────────────
// On the web and the iPhone, play asks radio-browser for the stream. Both
// lookups had no timeout and went to one mirror, de1: a server that accepts the
// connection and never answers left play spinning with no end. The desktop
// (src/resolver.js) already picks a mirror from the pool and times out.
{
  const name = "pressing play on the web does not wait forever";
  console.log(`\n${name}`);
  const bridge = readSrc("web/bridge.js");
  const body = bridge.slice(bridge.indexOf("async function candidates("), bridge.indexOf("return out;", bridge.indexOf("async function candidates(")));
  const gaps = [];
  const calls = body.split("\n").filter((l) => /fetch\(`\$\{RB\}/.test(l)).map((l) => [l.trim()]);
  if (calls.length < 2) gaps.push("the radio-browser lookups in candidates() were not found — this check is blind");
  for (const [c] of calls) if (!/signal:/.test(c)) gaps.push(`a radio-browser lookup has no timeout: ${c.slice(0, 60)}`);
  if (!/json\/servers/.test(bridge)) gaps.push("web/bridge.js always uses one radio-browser mirror");
  // One after another, a slow radio-browser cost two timeouts before play tried anything.
  if (!/Promise\.allSettled\(/.test(body)) gaps.push("the lookups run one after another, so a slow directory costs the sum of their timeouts");
  gaps.length ? fail(name, gaps.join("; ")) : pass(`${calls.length} radio-browser lookups each time out, run side by side, on a mirror chosen from the pool`);
}

// ── a relay that drops is dialled again ─────────────────────────────────────
// A relay socket that closed left the list and nothing dialled it again: after
// the Wi-Fi blinked, a laptop slept or iOS put the page in the background,
// chat and presence were silent until the place changed. The beat now re-dials
// what is missing (heal() in src/presence-nostr.js), and a relay that stays
// down is tried less often each time. Fake relays, and the beat fired by hand.
{
  const name = "a relay that drops is dialled again";
  console.log(`\n${name}`);
  let made = 0, down = false;
  const live = [];
  class FakeRelay {
    constructor(url) {
      made++; this.url = url; this.readyState = 0; live.push(this);
      setTimeout(() => { if (down) this.close(); else { this.readyState = 1; this.onopen?.(); } }, 0);
    }
    send() {}
    close() { if (this.readyState === 3) return; this.readyState = 3; this.onclose?.(); }
  }
  const realWs = globalThis.WebSocket, realSet = globalThis.setInterval;
  const beats = [];
  globalThis.WebSocket = FakeRelay;
  // Record each interval instead of running it: the beat is fired by hand.
  globalThis.setInterval = (fn) => { beats.push(fn); return realSet(() => {}, 2 ** 30); };
  const tick = () => new Promise((r) => setTimeout(r, 30));
  let nostr = null;
  try {
    nostr = await import(pathToFileURL(R("src/presence-nostr.js")).href).then((m) => m.default ?? m);
    nostr.leave();
    nostr.join(38.72, -9.14, "test");
    await tick();
    const first = made, beat = beats.at(-1);
    const gaps = [];
    if (!first || !beat) gaps.push("joining dialled no relay, or set no beat — this check is blind");
    else {
      for (const w of [...live]) w.close();            // the network went away
      beat();
      await tick();
      const redialled = made - first;
      if (redialled < first) gaps.push(`after every relay dropped, the next beat dialled ${redialled} of ${first}`);
      down = true;                                      // and stays away
      for (const w of [...live]) w.close();
      beat(); await tick();
      const tried = made;
      beat(); await tick();
      if (made > tried) gaps.push(`a relay that stays down is dialled again on the very next beat (${made - tried} times)`);
    }
    gaps.length ? fail(name, gaps.join("; ")) : pass(`all ${first} relays are dialled again after they drop, and one that stays down waits longer each time`);
  } catch (e) {
    fail(name, `the module threw: ${e.message}`);
  } finally {
    try { nostr?.leave(); } catch {}
    globalThis.WebSocket = realWs; globalThis.setInterval = realSet;
  }
}

// ── a phone reads the busiest relays, not one per region ────────────────────
// Joining a place on the web opened 68 sockets: 8 near relays and 60 read-only
// ones, two per first-level cell. Fewer than half carried anyone. The web now
// reads the 12 busiest instead (setSpread; scripts/relays.mjs ranks them
// monthly): 20 sockets, and in a measured listen more people heard than the 68.
// Fake relays count what a join dials.
{
  const name = "a phone reads the busiest relays, not one per region";
  console.log(`\n${name}`);
  const gaps = [];
  const web = readSrc("web/messaging.js");
  const n = +(/nostr\.setSpread\((\d+)\)/.exec(web)?.[1] || 0);
  if (!n) gaps.push("web/messaging.js sets no spread, so the web dials the desktop's 60 read-only relays");
  else if (n > 16) gaps.push(`the web reads ${n} busy relays; more than 16 is the battery cost #72 removed`);
  const dir = JSON.parse(fs.readFileSync(R("data/relays.json"), "utf8"));
  const urls = new Set(dir.relays.map(([u]) => u));
  if (!(dir.busiest?.length >= 12)) gaps.push("data/relays.json ranks no busy relays (npm run relays -- --nip66)");
  else if (dir.busiest.some((u) => !urls.has(u))) gaps.push("a relay ranked busy is not in the directory");
  const dialled = [];
  class FakeRelay { constructor(url) { dialled.push(url); this.readyState = 0; } send() {} close() { this.readyState = 3; } }
  const realWs = globalThis.WebSocket;
  globalThis.WebSocket = FakeRelay;
  let nostr = null;
  try {
    nostr = await import(pathToFileURL(R("src/presence-nostr.js")).href).then((m) => m.default ?? m);
    const count = (sp) => { nostr.leave(); dialled.length = 0; nostr.setSpread(sp); nostr.join(38.72, -9.14, "test"); return dialled.slice(); };
    const desk = count(0), phone = n ? count(n) : [];
    if (n && phone.length > 8 + n) gaps.push(`a join on the web dials ${phone.length} relays`);
    if (n && dir.busiest && !dir.busiest.slice(0, n).every((u) => phone.includes(u))) gaps.push("the web does not read the busiest relays");
    if (desk.length <= phone.length) gaps.push(`the web dials as many relays as the desktop (${desk.length})`);
    gaps.length ? fail(name, gaps.join("; ")) : pass(`a join dials ${phone.length} relays on the web, the ${n} busiest among them, and ${desk.length} on the desktop`);
  } catch (e) {
    fail(name, `the module threw: ${e.message}`);
  } finally {
    try { nostr?.leave(); nostr?.setSpread(0); } catch {}
    globalThis.WebSocket = realWs;
  }
}

// ── a host never needs a licence ───────────────────────────────────────────
// Hosts are people who love music, not broadcasters with licences. So the
// studio's music opens on music whose licence already lets anyone play it on
// the air (src/main/ipc-cleared.js), the host's own files come second, and
// every show keeps a tracklist that credits what it played and tells listeners
// what is on (presence-nostr.js, setNowPlaying).
{
  const name = "a host never needs a licence: cleared music first, and a tracklist";
  console.log(`\n${name}`);
  const gaps = [];
  const { createRequire } = await import("node:module");
  const req = createRequire(import.meta.url);
  let allowed = null;
  try {
    const Module = req("node:module");
    const load = Module._load;
    Module._load = function (r, ...a) { return r === "electron" ? { ipcMain: { handle() {} }, net: { fetch } } : load.call(this, r, ...a); };
    try { allowed = req(R("src/main/ipc-cleared.js")).allowed; } finally { Module._load = load; }
  } catch (e) { gaps.push(`ipc-cleared.js did not load: ${e.message}`); }
  if (allowed) {
    const yes = ["https://creativecommons.org/licenses/by/4.0/", "http://creativecommons.org/licenses/by-sa/3.0/", "https://creativecommons.org/licenses/by/3.0/us/", "https://creativecommons.org/publicdomain/zero/1.0/", "http://creativecommons.org/publicdomain/mark/1.0/"];
    const no = ["https://creativecommons.org/licenses/by-nc/4.0/", "https://creativecommons.org/licenses/by-nd/4.0/", "https://creativecommons.org/licenses/by-nc-sa/3.0/", "https://creativecommons.org/licenses/by-nc-nd/2.5/", "https://example.com/licenses/by/4.0/", ""];
    const missed = yes.filter((u) => !allowed(u)), let_in = no.filter((u) => allowed(u));
    if (missed.length) gaps.push(`a licence that may go on air is refused: ${missed[0]}`);
    if (let_in.length) gaps.push(`a licence that may not go on air is let in: ${let_in[0] || "(none)"}`);
  }
  const st = readSrc("src/renderer/explore-studio.js");
  if (!/if \(!queue\.length\) \{\s*music\.append\([^;]*clearedPicker\(pick\)\);/.test(st)) gaps.push("the studio's music does not open on cleared music");
  if (!/if \(phase !== "off"\) logTrack\(next\.item\);/.test(st)) gaps.push("a track that starts during a show is not on its tracklist");
  if (!/if \(phase === "live"\) window\.auralfm\.studioNowPlaying\?\.\(/.test(st)) gaps.push("listeners are not told what the show is playing");
  // The heartbeat carries it: a live show's label event says what is on.
  const sent = [];
  class FakeRelay { constructor() { this.readyState = 0; setTimeout(() => { this.readyState = 1; this.onopen?.(); }, 0); } send(m) { sent.push(m); } close() { this.readyState = 3; } }
  const realWs = globalThis.WebSocket;
  globalThis.WebSocket = FakeRelay;
  let nostr = null;
  try {
    nostr = await import(pathToFileURL(R("src/presence-nostr.js")).href).then((m) => m.default ?? m);
    nostr.leave(); nostr.setNowPlaying("");
    nostr.join(-12.05, -77.04, "Test show", true);
    await new Promise((r) => setTimeout(r, 40));
    sent.length = 0;
    nostr.setNowPlaying("Artist — A record (CC BY 4.0)");
    await new Promise((r) => setTimeout(r, 40));
    const labels = sent.map((m) => { try { return JSON.parse(m); } catch { return null; } }).filter((m) => m?.[0] === "EVENT" && m[1]?.kind === 20808).map((m) => { try { return JSON.parse(m[1].content); } catch { return {}; } });
    if (!labels.some((c) => c.s === 1 && c.n === "Artist — A record (CC BY 4.0)")) gaps.push("a live show's heartbeat does not carry what it is playing");
  } catch (e) { gaps.push(`presence threw: ${e.message}`); }
  finally { try { nostr?.setNowPlaying(""); nostr?.leave(); } catch {} globalThis.WebSocket = realWs; }
  gaps.length ? fail(name, gaps.join("; "))
    : pass("the studio's music opens on CC BY, BY-SA and public-domain tracks only; each track joins the tracklist and goes to listeners with the show");
}

// ── the studio's levels move by transform ───────────────────────────────────
// Five meters and a progress bar change every frame. Drawn as widths and
// heights they recalculated the layout sixty times a second; a scale is
// composited and touches nothing else (Emil Kowalski, animation-performance).
{
  const name = "the studio's levels move by transform, not by size";
  console.log(`\n${name}`);
  const gaps = [];
  const st = readSrc("src/renderer/explore-studio.js"), html = readSrc("src/renderer/explore.html");
  if (/style\[[^\]]*"(height|width)"[^\]]*\]\s*=/.test(st) || /\.style\.(width|height)\s*=/.test(st)) gaps.push("explore-studio.js sets a width or a height on a meter or the progress bar");
  if (/\.studio \.(meter[^{]*|npbar) b\{[^}]*transition:(width|height)/.test(html)) gaps.push("a meter or the progress bar animates its size");
  if (!/\.studio \.meter b\{[^}]*transform:scaleX\(0\)/.test(html)) gaps.push("the meters are not drawn as a scale");
  gaps.length ? fail(name, gaps.join("; ")) : pass("the meters and the progress bar are scaled, so a frame of them recalculates no layout");
}

// ── the day/night switch and the globe agree ────────────────────────────────
// The web opens with day/night off. The shader was compiled with it on, and
// the setting, arriving before the globe existed, never reached it: the switch
// read off over a globe shading night, and pressing it changed nothing.
{
  const name = "the day and night switch and the globe agree from the first frame";
  console.log(`\n${name}`);
  const g = readSrc("src/renderer/explore-globe.js");
  /shader\.uniforms\.dayNightOn = \{ value: [^}]*layers\.dayNight/.test(g)
    ? pass("the shader starts from the layer's own setting")
    : fail(name, "explore-globe.js compiles day/night on whatever the layer says");
}

// ── your favourites survive a crash mid-save ────────────────────────────────
// state.json (favourites, history, preferences) and stations.user.json (the
// stations someone added) were written over in place. A crash or a dead battery
// mid-write left a torn file, load() fell back to empty, and the next save made
// the loss permanent. Both now go through src/atomic.js: a temporary file
// beside it, renamed into place.
{
  const name = "your favourites survive a crash mid-save";
  console.log(`\n${name}`);
  const gaps = [];
  const files = { "src/main/store.js": /writeFileSync\(STORE/, "src/mystations.js": /writeFileSync\(file/ };
  for (const [f, raw] of Object.entries(files)) {
    const src = readSrc(f);
    if (raw.test(src)) gaps.push(`${f} writes its file in place`);
    if (!/writeAtomic\(/.test(src)) gaps.push(`${f} does not use src/atomic.js`);
  }
  // And the helper does what it says: a failed rename leaves the old file whole.
  try {
    const { createRequire } = await import("node:module");
    const req = createRequire(import.meta.url);
    const fsm = req("node:fs"), os = req("node:os");
    const { writeAtomic } = req(R("src/atomic.js"));
    const f = path.join(fsm.mkdtempSync(path.join(os.tmpdir(), "auralfm-atomic-")), "state.json");
    writeAtomic(f, '{"favourites":[1,2,3]}');
    const rename = fsm.renameSync;
    fsm.renameSync = () => { throw new Error("power cut"); };
    try { writeAtomic(f, '{"favour'); } catch { /* expected */ } finally { fsm.renameSync = rename; }
    if (fsm.readFileSync(f, "utf8") !== '{"favourites":[1,2,3]}') gaps.push("a failed save damaged the file it was replacing");
    if (fsm.readdirSync(path.dirname(f)).some((x) => x.endsWith(".tmp"))) gaps.push("a failed save left its temporary file behind");
  } catch (e) { gaps.push(`src/atomic.js could not be run: ${e.message}`); }
  gaps.length ? fail(name, gaps.join("; ")) : pass("state.json and stations.user.json are replaced whole, never written over");
}

// ── the mailing list is read to its last page ───────────────────────────────
// here.now hands Site Data back a page at a time, with nextCursor. mail.mjs
// read only the first page: past it, everyone who signed up would have been
// left off every newsletter without a word. records() is lifted out of the
// script (which must not run here: it sends mail) and fed two fake pages.
{
  const name = "the mailing list is read to its last page";
  console.log(`\n${name}`);
  const src = readSrc("scripts/mail.mjs");
  const at = src.indexOf("async function records(");
  const fn = at < 0 ? "" : src.slice(at, src.indexOf("\n}\n", at) + 2);
  const gaps = [];
  if (!fn) gaps.push("scripts/mail.mjs has no records() — this check is blind");
  else {
    const pages = { "": { records: [{ id: "1", data: { email: "a@x" } }, { id: "2", data: { email: "b@x" } }], nextCursor: "p2" },
                    "p2": { records: [{ id: "3", data: { email: "c@x" } }], nextCursor: null } };
    const fakeFetch = async (url) => {
      const c = new URL(url).searchParams.get("cursor") || "";
      return { ok: true, json: async () => pages[c] || { records: [], nextCursor: null } };
    };
    try {
      const records = new Function("fetch", "fixture", "key", `${fn}; return records;`)(fakeFetch, null, "k");
      const got = await records("site", "newsletter");
      if (got.length !== 3) gaps.push(`two pages of three sign-ups came back as ${got.length}`);
    } catch (e) { gaps.push(`records() could not be run: ${e.message}`); }
  }
  gaps.length ? fail(name, gaps.join("; ")) : pass("records() follows nextCursor to the end of a list");
}

// ── an error report leaves a phone only when asked, and says nothing about anyone ──
// The web version can send its errors (there is no local file to keep them in)
// only with "Send error reports" on, which is off by default. What goes is
// scrubbed: no outside address (a stream's address names the station), no key,
// nothing a caller adds. This lifts redactReport() out of web/bridge.js and runs it.
{
  const name = "an error report leaves a phone only when asked, and says nothing about anyone";
  console.log(`\n${name}`);
  const { createRequire } = await import("node:module");
  const req = createRequire(import.meta.url);
  const gaps = [];
  if (req(R("src/prefs.js")).DEFAULTS.errorReports !== false) gaps.push("error reports are not off by default");
  const bridge = readSrc("web/bridge.js");
  const send = bridge.slice(bridge.indexOf("function sendReport("), bridge.indexOf("function sendReport(") + 400);
  if (!/getPrefs\(\)\.errorReports !== true\) return|getPrefs\(\)\.errorReports !== true \|\|/.test(send)) gaps.push("sendReport() does not stop when the switch is off");
  const at = bridge.indexOf("function redactReport(");
  const fn = at < 0 ? "" : bridge.slice(at, bridge.indexOf("\n  }\n", at) + 4);
  if (!fn) gaps.push("web/bridge.js has no redactReport() — this check is blind");
  else {
    const redact = new Function(`${fn}; return redactReport;`)();
    const key = "ab".repeat(32);
    const out = redact({ where: "uncaught", message: `failed to load https://stream.example.com/live.mp3?id=9 for ${key}`,
      stack: "Error\n at play (https://listen.auralfm.xyz/explore-playback.js?v=abc:12:3)\n at wss://relay.example/:1",
      page: "index.html", repeat: 2, station: "Secret FM", lat: 51.5 }, "0.1.0", "ios");
    const all = JSON.stringify(out);
    if (/stream\.example|relay\.example/.test(all)) gaps.push("an outside address went out in a report");
    if (all.includes(key)) gaps.push("a key went out in a report");
    if ("station" in out || "lat" in out) gaps.push("a field the caller added went out in a report");
    if (!/explore-playback\.js:12:3/.test(out.stack || "")) gaps.push("the app's own line numbers were lost, so a report says nothing useful");
  }
  const build = readSrc("scripts/build-web.mjs");
  const block = build.slice(build.indexOf('"data.json"'), build.indexOf("}, null, 2)", build.indexOf('"data.json"')));
  if (!/errors:\s*\{/.test(block)) gaps.push("scripts/build-web.mjs does not declare the errors collection");
  else if (!/read:\s*"owner"/.test(block)) gaps.push("the error reports can be read by someone other than AuralFM");
  if (!/id="errorReportsCard" hidden/.test(readSrc("src/renderer/settings.html"))) gaps.push("the switch shows on the desktop, which never sends");
  if (!/\*\*Error reports\*\*/.test(readSrc("docs/PRIVACY.md"))) gaps.push("docs/PRIVACY.md does not say what an error report carries");
  gaps.length ? fail(name, gaps.join("; ")) : pass("off by default; on, a report carries no outside address, no key and nothing a caller adds, and only AuralFM can read it");
}

// ── a script run from a folder with a space or a "#" still runs ─────────────
// crawl-sdr.mjs decided whether it had been run (rather than imported) with
// import.meta.url compared with "file://" + process.argv[1]. In a folder like
// "HARD DRIVE #2" the left side is escaped and the right is not: the two never
// matched, `npm run crawl:sdr` exited 0 having done nothing, and the receiver
// list went two months without a refresh. Compare as URLs (pathToFileURL).
{
  const name = "a script run from a folder with a space or a \"#\" still runs";
  console.log(`\n${name}`);
  const bad = fs.readdirSync(R("scripts")).filter((f) => /\.m?js$/.test(f))
    .filter((f) => /import\.meta\.url\s*===\s*`file:\/\/\$\{process\.argv\[1\]\}`/.test(fs.readFileSync(R(`scripts/${f}`), "utf8")));
  bad.length ? fail(name, `${bad.join(", ")} compare import.meta.url with a plain "file://" + argv; use pathToFileURL(process.argv[1]).href`)
    : pass("every script that checks whether it was run compares URLs, not strings");
}

// ── every country in the catalogue is one the gazetteer knows ───────────────
// The catalogue writes "Türkiye", "Côte d'Ivoire", "Cape Verde"; GeoNames
// writes "Turkey", "Ivory Coast", "Cabo Verde". ccOf() returned null for
// eleven such names, so no station in them could be placed, by its name or by
// hand: 830 in Türkiye alone, and the first hand-placing sheet's Istanbul rows
// came back "not found". Read from the catalogue's checkout.
{
  const name = "every country in the catalogue is one the gazetteer knows";
  console.log(`\n${name}`);
  if (!HAS_CAT || !fs.existsSync(C("data/geonames/countryInfo.txt")) || !fs.existsSync(C("data/stations.json")))
    skip(name, "no catalogue checkout with its gazetteer and a built list here");
  else {
    const { loadGazetteer } = await import(pathToFileURL(C("scripts/lib/gazetteer.mjs")).href);
    const G = loadGazetteer(C("data/geonames"));
    const counts = new Map();
    for (const c of JSON.parse(fs.readFileSync(C("data/stations.json"), "utf8")).channels)
      if (c.country && c.country !== "Null Island") counts.set(c.country, (counts.get(c.country) || 0) + 1);
    const lost = [...counts].filter(([c]) => !G.ccOf(c)).sort((a, b) => b[1] - a[1]);
    lost.length ? fail(name, `no country code for ${lost.map(([c, n]) => `${c} (${n})`).join(", ")}: their stations cannot be placed`)
      : pass(`all ${counts.size} countries resolve to a code`);
  }
}

// ── every place is on the globe ─────────────────────────────────────────────
// radio-browser gave Bangkok Community Radio its position with latitude and
// longitude swapped (100.5, 13.76). The build made a place "Bangkok" there,
// at a latitude no globe has, and the station sat off the map. A position is
// a latitude within ±90° and a longitude within ±180°, or it is no position.
// Read from the catalogue's built list, and from the copy here when there is one.
{
  const name = "every place is on the globe";
  console.log(`\n${name}`);
  const lists = [];
  if (HAS_CAT && fs.existsSync(C("data/stations.json")))
    lists.push(["the catalogue's list", JSON.parse(fs.readFileSync(C("data/stations.json"), "utf8")).places.map((p) => [p.title, p.country, p.geo[0], p.geo[1]])]);
  if (fs.existsSync(R("data/stations.min.json")))
    lists.push(["the list here", JSON.parse(fs.readFileSync(R("data/stations.min.json"), "utf8")).p]);
  if (!lists.length) skip(name, "no built list here or in the catalogue's checkout");
  else {
    const gaps = [];
    for (const [where, places] of lists) {
      if (places.length < 5000) gaps.push(`${where} has only ${places.length} places — this check is blind`);
      const off = places.filter(([, , lng, lat]) => !Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lat) > 90 || Math.abs(lng) > 180);
      if (off.length) gaps.push(`${where}: ${off.length} off the globe: ${off.slice(0, 4).map(([t, c, lng, lat]) => `"${t}", ${c} (lat ${lat}, lng ${lng})`).join("; ")}`);
    }
    if (HAS_CAT && !/function onGlobe\(/.test(fs.readFileSync(C("scripts/expand.mjs"), "utf8"))) gaps.push("the catalogue's build takes radio-browser's position without asking whether it is one");
    gaps.length ? fail(name, gaps.join("; ")) : pass(`${lists.map(([w, p]) => `${p.length.toLocaleString("en-US")} places in ${w}`).join(", ")}, each within ±90° and ±180°`);
  }
}

// ── a place lies in the country it names ────────────────────────────────────
// radio-browser listed GD Dubai in Honduras, with the region "Just Dubai" and
// a position in San Francisco. The build made a place "Just Dubai", Honduras,
// in San Francisco, and then put KQED, RetroStrange and seven TuneIn channels
// in it, because a station joined the nearest place the build had made within
// 10 km whatever country either said. Sixty-two places in all lay in another
// country than their own: "Roma", Italy, in Brooklyn; "Seoul", South Korea, in
// Québec; "Somewhere in Guinea" off Papua New Guinea. A place is in its
// country when a town of that country (GeoNames, 1,000 people or more) is
// within 100 km; it is in another when only towns of other countries are.
{
  const name = "a place lies in the country it names";
  console.log(`\n${name}`);
  if (!HAS_CAT || !fs.existsSync(C("data/geonames/cities1000.txt")) || !fs.existsSync(C("data/stations.json")))
    skip(name, "no catalogue checkout with its gazetteer and a built list here");
  else {
    const { loadGazetteer } = await import(pathToFileURL(C("scripts/lib/gazetteer.mjs")).href);
    const G = loadGazetteer(C("data/geonames"));
    const { places, channels } = JSON.parse(fs.readFileSync(C("data/stations.json"), "utf8"));
    const held = new Map();
    for (const c of channels) held.set(c.p, (held.get(c.p) || 0) + 1);
    const gaps = [], away = [];
    let looked = 0;
    places.forEach((p, i) => {
      if (p.country === "Null Island") return;               // "Online only", where maps put what has no place
      const cc = G.ccOf(p.country), [lng, lat] = p.geo;
      if (!cc || Math.abs(lat) > 90 || Math.abs(lng) > 180) return;   // the two checks above say so
      looked++;
      const other = G.nearest(lat, lng, null, 100);
      if (other && other.cc !== cc && !G.nearest(lat, lng, cc, 100))
        away.push([held.get(i) || 0, `"${p.title}", ${p.country}, by ${other.name} (${other.cc}) with ${held.get(i) || 0} station${held.get(i) === 1 ? "" : "s"}`]);
    });
    away.sort((a, b) => b[0] - a[0]);
    if (looked < 5000) gaps.push(`only ${looked} places looked at — this check is blind`);
    if (away.length) gaps.push(`${away.length} places lie in another country: ${away.slice(0, 5).map(([, t]) => t).join("; ")}`);
    gaps.length ? fail(name, gaps.join("; ")) : pass(`${looked.toLocaleString("en-US")} places, each within 100 km of a town of its own country`);
  }
}

// ── the state file says which version it is ─────────────────────────────────
// Every change to state.json so far added a field. The first one that renames
// or reshapes one needs to know what it is reading (#77): the file carries a
// version, and an older file is brought up to today's shape on load, step by
// step (src/state-schema.js). A file from a newer build is never stamped down.
{
  const name = "the state file says which version it is";
  console.log(`\n${name}`);
  const gaps = [];
  if (!fs.existsSync(R("src/state-schema.js"))) gaps.push("src/state-schema.js is not here: the state file has no version");
  else {
    const { createRequire } = await import("node:module");
    const S = createRequire(import.meta.url)(R("src/state-schema.js"));
    const old = S.migrate({ favorites: ["af-12345678"] });
    if (old.v !== S.STATE_VERSION) gaps.push(`a file with no version comes out as version ${old.v}, not ${S.STATE_VERSION}`);
    if (old.favorites?.[0] !== "af-12345678") gaps.push("bringing a file up to date loses what was in it");
    const ahead = S.STATE_VERSION + 3;
    if (S.migrate({ v: ahead }).v !== ahead || S.stamp({ v: ahead }) !== ahead) gaps.push("a file from a newer build is stamped down");
    for (let k = 2; k <= S.STATE_VERSION; k++) if (typeof S.MIGRATIONS[k] !== "function") gaps.push(`there is no step up to version ${k}`);
  }
  const store = fs.readFileSync(R("src/main/store.js"), "utf8");
  if (!/migrate\(s\)/.test(store)) gaps.push("src/main/store.js loads the file without bringing it up to date");
  if (!/v: stamp\(state\)/.test(store)) gaps.push("src/main/store.js saves the file without its version");
  gaps.length ? fail(name, gaps.join("; ")) : pass("state.json is saved with its version; an older one is brought up to date on load, a newer one is left as it is");
}

// ── the line is written one way ─────────────────────────────────────────────
// "Less algorithms. More humans." is two sentences on the cards, the decks and
// the site's band. The web app's splash and its ticker said "Less algorithms,
// more humans." (#59): one line, two spellings, and the splash is the first
// thing a listener reads.
{
  const name = "the line is written one way";
  console.log(`\n${name}`);
  const files = ["scripts/build-web.mjs", ...fs.readdirSync(R("web")).filter((f) => f.endsWith(".js")).map((f) => `web/${f}`),
    ...fs.readdirSync(R("src/renderer")).filter((f) => /\.(js|html)$/.test(f)).map((f) => `src/renderer/${f}`)];
  const off = files.filter((f) => /less algorithms,\s*more humans/i.test(fs.readFileSync(R(f), "utf8")));
  off.length ? fail(name, `"Less algorithms, more humans" in ${off.join(", ")}; it is "Less algorithms. More humans."`)
    : pass(`${files.length} files say "Less algorithms. More humans." or nothing`);
}

const tail = skipped ? ` (${skipped} not checkable here)` : "";
console.log(failures ? `\n${failures} check(s) failed${tail}\n`
                     : `\nall checks passed${tail}\n`);
process.exit(failures ? 1 : 0);
