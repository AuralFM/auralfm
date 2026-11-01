/** The audit: The main process: state, IPC, windows, preferences and what a page may hand in. */
import fs from "node:fs";
import path from "node:path";
import { R, rel, fail, pass, skip, renderers, main, readSrc, strings } from "./lib.mjs";

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
