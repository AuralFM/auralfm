/** The audit: The web build, the installed phone app and phone layouts. */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { ROOT, R, fail, pass, skip, EXPLORE_FILES, readSrc, pkg } from "./lib.mjs";

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
