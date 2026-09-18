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
 *   the share sheet holds focus .............. Tab walked out of the card into the toolbar
 *   an output's tick is not its name ......... every option announced as "✓ System output"
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
 *
 * **Design system**
 *   design tokens are not bypassed .......... radii invented outside the scale
 *   light theme agrees with itself .......... four token blocks drifting apart
 *   the favourite star survives light theme . 1.01:1 contrast in all nine palettes
 *
 * **What ships**
 *   shipped files exist ..................... build.files naming a missing path
 *   every data file src/ reads is shipped ... the word filter read a file not packaged
 *   third-party notices are current ......... five MIT libraries with no notice
 *   every import is declared and credited ... @noble/hashes required but undeclared
 *   every shipped licence is permissive ..... nothing stopped a copyleft dependency
 *   the project states one licence .......... see below
 *   shortwave schedule is current ........... a season's schedule going stale
 *
 * ### The licence check, in more detail
 *
 * `LICENSE` carried the MIT grant while `docs/TERMS.md` — which ships inside the
 * app — said the software is not open source and may not be redistributed. Two
 * shipped documents granting and withholding the same rights, with
 * `THIRD-PARTY-NOTICES.md` (also shipped) siding with the MIT one.
 *
 * Settled 8 August 2026: **AuralFM is open source under MIT**, and the terms were
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
const skip = (rule, why) => { skipped++; console.log(`  --    ${rule}\n        not checkable here: ${why}`); };

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
  if (fs.existsSync(R(f))) pass(f);
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
   * This is the rule that cost Melton his favorites. Two windows write state,
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
      if (nostr.powBits(e.id) < 12) problems.push(`kind ${kind} mined to only ${nostr.powBits(e.id)} bits`);
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
  problems.length
    ? fail("client tag and proof of work", problems.join("; "))
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
// travelled from city to city — Melton sent a screenshot of a PRIVATE line
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
// Melton hit it as seven identical notes from a stranger who had said "hola"
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
// Melton found it as "a lot of stations with no sound, very random". It is not
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

// ── the output button does not come and go ──────────────────────────────────
// It hid whenever fewer than two outputs were enumerated. macOS reports
// `default` plus the built-in speakers and nothing else once a bluetooth speaker
// disconnects, so after the `default` duplicate is filtered out the count is
// one — and the button vanished at exactly the moment somebody had lost the
// device they were listening on, reflowing the transport bar as it went.
//
// Melton reported it as the speaker disappearing. Both windows had the rule.
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
// The system icons are stroked 1.6 on a 24 grid. Melton's marks arrive as filled
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
// which is exactly what Melton reported. It passed review because the *data*
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
// with the MIT one. Resolved in favour of the terms; this stops it drifting back.
{
  console.log("\nthe project states one licence for itself");
  const problems = [];
  const licence = fs.readFileSync(R("LICENSE"), "utf8");
  const terms = fs.readFileSync(R("docs/TERMS.md"), "utf8");
  // Only the preamble: the rest of the notices file is third-party licence text.
  const notices = fs.readFileSync(R("THIRD-PARTY-NOTICES.md"), "utf8").split("\n---")[0];

  // The grant itself has to be present and unambiguous. A LICENSE that says MIT
  // in the heading and nothing else is not a licence.
  if (!/^MIT License/m.test(licence)) problems.push("LICENSE is not titled MIT License");
  if (!/permission is hereby granted, free of charge/i.test(licence)) {
    problems.push("LICENSE does not contain the MIT grant");
  }
  if (/\bproprietary\b/i.test(licence.split("--------")[0])) {
    problems.push("LICENSE still calls the project proprietary in its opening section");
  }
  // The two documents that ship must not contradict the grant. This is the exact
  // failure that ran for months in the other direction: LICENSE granted MIT while
  // docs/TERMS.md forbade redistribution, and both reached every user.
  if (/not open source/i.test(terms)) {
    problems.push("docs/TERMS.md still says the software is not open source");
  }
  if (/you may not redistribute/i.test(terms)) {
    problems.push("docs/TERMS.md still forbids redistribution");
  }
  if (!/MIT licence|MIT license/i.test(terms)) problems.push("docs/TERMS.md does not name the MIT licence");
  if (/is proprietary/i.test(notices)) problems.push("THIRD-PARTY-NOTICES preamble calls AuralFM proprietary");
  if (!/open source/i.test(notices)) {
    problems.push("THIRD-PARTY-NOTICES preamble does not say AuralFM is open source");
  }
  const pkgLicence = JSON.parse(fs.readFileSync(R("package.json"), "utf8")).license || "";
  if (pkgLicence !== "MIT") problems.push(`package.json license is "${pkgLicence}", not MIT`);

  problems.length
    ? fail("licence", problems.join("; "))
    : pass("LICENSE, TERMS, the notices preamble and package.json all say MIT");
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
    if (!inOutside && !mailto) bad.push(`main.js:${line} opens a URL without openOutside()`);
  }
  bad.length ? fail("external links", bad.join("; "))
             : pass("every shell.openExternal is http(s)-checked or a mailto: we built");

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
}

const tail = skipped ? ` (${skipped} not checkable here)` : "";
console.log(failures ? `\n${failures} check(s) failed${tail}\n`
                     : `\nall checks passed${tail}\n`);
process.exit(failures ? 1 : 0);
