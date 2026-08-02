#!/usr/bin/env node
/**
 * Pre-flight checks for the traps this codebase has actually fallen into.
 *
 * Every rule below exists because the bug it catches shipped at least once, and
 * three of them shipped more than once. They are cheap, they run offline in
 * about a second, and they are the difference between finding a mistake now and
 * finding it in a screenshot from someone who was just trying to listen to the
 * radio.
 *
 *   npm run audit
 */

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const R = (p) => path.join(ROOT, p);
const rel = (p) => path.relative(ROOT, p);

let failures = 0;
const fail = (rule, detail) => { failures++; console.log(`  FAIL  ${rule}\n        ${detail}`); };
const pass = (rule) => console.log(`  ok    ${rule}`);

const renderers = fs.readdirSync(R("src/renderer"))
  .filter((f) => f.endsWith(".html"))
  .map((f) => ({ file: R(`src/renderer/${f}`), html: fs.readFileSync(R(`src/renderer/${f}`), "utf8") }));

const mainFiles = fs.readdirSync(R("src"))
  .filter((f) => f.endsWith(".js"))
  .map((f) => ({ file: R(`src/${f}`), src: fs.readFileSync(R(`src/${f}`), "utf8") }));

// ─────────────────────────────────────────────────────────────────────────────
console.log("\nrenderer scripts parse");
// A syntax error in an inline <script> fails silently: the whole block is
// skipped, every global is undefined, and the window renders as a dead shell.
// This shipped once and cost an evening.
for (const { file, html } of renderers) {
  const blocks = html.match(/<script>[\s\S]*?<\/script>/g) || [];
  if (!blocks.length) { fail("has a script block", rel(file)); continue; }
  try {
    for (const b of blocks) new vm.Script(b.replace(/^<script>/, "").replace(/<\/script>$/, ""));
    pass(rel(file));
  } catch (err) {
    fail(rel(file), err.message);
  }
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
// in HTML, and the attribute silently lost. Any stylesheet that sets an explicit
// display must also declare [hidden]{display:none}.
for (const { file, html } of renderers) {
  const css = (html.match(/<style>([\s\S]*?)<\/style>/) || [, ""])[1];
  const setsDisplay = /(?:^|[;{])\s*display\s*:\s*(?!none)[\w-]+/m.test(css);
  const guards = /\[hidden\][^{]*\{[^}]*display\s*:\s*none/.test(css);
  if (setsDisplay && !guards) {
    fail(rel(file), "sets an explicit display but never declares [hidden]{display:none}");
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

// Anything the renderers ask for must exist.
const used = new Set();
for (const { html } of renderers) {
  for (const m of html.matchAll(/data-i18n(?:-title|-ph)?="([^"]+)"/g)) used.add(m[1]);
  for (const m of html.matchAll(/\bt\(\s*"([^"]+)"/g)) used.add(m[1]);
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
const literals = pkg.build.files.filter((f) => !f.includes("*"));
for (const f of literals) {
  fs.existsSync(R(f)) ? pass(f) : fail("build.files", `${f} is listed but missing`);
}

console.log(failures ? `\n${failures} check(s) failed\n` : "\nall checks passed\n");
process.exit(failures ? 1 : 0);
