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

console.log(failures ? `\n${failures} check(s) failed\n` : "\nall checks passed\n");
process.exit(failures ? 1 : 0);
