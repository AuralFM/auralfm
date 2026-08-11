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
 *   state:set accepts only an allowlist ..... renderers clobbering main's own state
 *   every chat channel goes through visible() a safety rule covering 2 surfaces of 3
 *
 * **Correctness and content**
 *   every polled service has a cooldown ..... Celestrak IP-blocked this project
 *   i18n keys resolve ....................... a missing key rendering as its own name
 *   no duplicated blocks .................... a scripted edit pasted a boot sequence 3x
 *   the English strings speak one English ... "favourites" slipped in
 *   search finds 104.9 and 104,9 ............ decimal-comma locales found nothing
 *   a bodiless envelope sends with tags ..... every favorite silently never sent
 *   sweeping the globe duplicates no note ... one "hola" was drawn seven times
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
const main = fs.readFileSync(R("src/main.js"), "utf8");
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
const { strings, LANGUAGES } = await import(`file://${R("src/i18n.js")}`).then((m) => m.default || m);
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
    const b = all(/:root\[data-theme="light"\]\{([\s\S]*?)\n\s*\}/g);
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
  const src = fs.readFileSync(R("src/main.js"), "utf8");
  const list = src.match(/const RENDERER_KEYS = \[([^\]]*)\]/);
  const handler = src.match(/ipcMain\.handle\("state:set"[\s\S]{0,400}?\n\}\);/);
  const problems = [];
  if (!list) problems.push("RENDERER_KEYS is gone");
  else {
    for (const owned of ["prefs", "layers"]) {
      if (list[1].includes(`"${owned}"`)) problems.push(`${owned} is in RENDERER_KEYS but main owns it`);
    }
  }
  if (!handler) problems.push("state:set handler not found");
  else if (!/RENDERER_KEYS/.test(handler[0])) problems.push("state:set does not use the allowlist");
  problems.length
    ? fail("state:set", problems.join("; "))
    : pass("state:set merges an allowlist, and prefs and layers are not in it");
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
  const src = fs.readFileSync(R("src/main.js"), "utf8");
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
  const src = fs.readFileSync(R("src/renderer/explore.js"), "utf8");
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

// ── what the app says survives the next message ──────────────────────────────
// systemLine() appended straight into #chatlog, and repaintLog() empties that
// element and rebuilds it from the caches. So every explanation the chat gave
// lasted until the next inbound message: "Nobody here called gal" could vanish a
// second after it appeared, which made the app least articulate exactly when it
// had most to say. It has to live in a cache and be merged like any other kind.
{
  console.log("\nwhat the app says outlives the next repaint");
  const src = fs.readFileSync(R("src/renderer/explore.js"), "utf8");
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
  const rp = src.slice(src.indexOf("function repaintLog("), src.indexOf("function repaintLog(") + 1400);
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
  const tick = (ms = 80) => new Promise((r) => setTimeout(r, ms));
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
    await tick(140);
    const afterJoin = seen.length;
    // Six selection changes, which is a few seconds of spinning the globe with
    // the listening lock off.
    for (const [la, lo] of [[35.68, 139.69], [-22.9, -43.2], [51.5, -0.12],
                            [40.7, -74.0], [-33.86, 151.2], [19.43, -99.13]]) {
      nostr.view(la, lo);
      await tick();
    }
    counted = { afterJoin, afterSweep: seen.length };
    nostr.leave();
  } finally {
    globalThis.WebSocket = realWs;
  }

  if (!counted || counted.afterJoin !== 1) {
    fail("note delivery", `one note from eight relays arrived as ${counted?.afterJoin ?? "nothing"}`);
  } else if (counted.afterSweep !== 1) {
    fail("note duplication",
         `one note became ${counted.afterSweep} after six view changes — a seen-set is being cleared without its list`);
  } else {
    pass("one note stays one note across eight relays and six view changes");
  }
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
  const renderer = fs.readFileSync(R("src/renderer/explore.js"), "utf8");
  if (!/m\.nick \|\| m\.from/.test(renderer)) {
    problems.push("explore.js no longer labels with `m.nick || m.from` — this check needs updating");
  }
  problems.length
    ? fail("sender labels", problems.join("; "))
    : pass("every record the chat log paints carries a `from`");
}

const tail = skipped ? ` (${skipped} not checkable here)` : "";
console.log(failures ? `\n${failures} check(s) failed${tail}\n`
                     : `\nall checks passed${tail}\n`);
process.exit(failures ? 1 : 0);
