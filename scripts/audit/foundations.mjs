/** The audit: Pages parse, the CSP holds, keys resolve, files ship, tokens are not bypassed. */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { ROOT, R, rel, fail, pass, RELEASE, skip, renderers, mainFiles, preload, main, channels, strings, LANGUAGES, en, pkg } from "./lib.mjs";

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
