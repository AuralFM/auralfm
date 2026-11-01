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
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { failures, skipped, ROOT, R, rel, fail, pass, RELEASE, skip, renderers, preload, main, EXPLORE_FILES, exploreSrc, readSrc, strings, en, pkg } from "./audit/lib.mjs";

// One at a time, and not as `import` statements: sibling imports that await run
// at the same time, and several checks replace WebSocket, Date.now or console.log.
for (const area of ["foundations", "app-core", "chat", "playback", "catalogue", "web-and-phone", "globe"]) await import(`./audit/${area}.mjs`);

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

// ── what a tool or a screen reader finds is what is on screen ───────────────
// A Rams review of the web player (22 Oct 2026) read the launch screen's name
// as grey on white, 2.2:1: the screen is a gradient, which has no colour of its
// own, so anything that asks what is behind the text found the white body
// under the veil. The gradient now sits on a solid onyx. The same review found
// --ride registered twice in web/web.css (the second copy does nothing until
// someone edits only one), and the ticker's dots were read aloud as "black
// circle" between items.
{
  const name = "what a tool or a screen reader finds is what is on screen";
  console.log(`\n${name}`);
  const gaps = [];
  const css = fs.readFileSync(R("web/web.css"), "utf8");
  for (const [, p] of css.matchAll(/@property\s+(--[\w-]+)/g)) if ((css.match(new RegExp(`@property\\s+${p}\\b`, "g")) || []).length > 1) gaps.push(`web/web.css registers ${p} more than once`);
  const dot = css.match(/\.ticker li::before\s*\{[^}]*\}/)?.[0] || "";
  if (!/content:\s*""\s*;/.test(dot) && !/content:\s*"[^"]*"\s*\/\s*""/.test(dot)) gaps.push("the ticker's dots are characters with something to read aloud");
  const launch = fs.readFileSync(R("scripts/build-web.mjs"), "utf8").match(/#launch\{[^}]*\}/)?.[0] || "";
  if (!/background:#[0-9A-Fa-f]{6}\s+radial-gradient/.test(launch)) gaps.push("the launch screen's gradient has no solid colour under it");
  gaps.length ? fail(name, [...new Set(gaps)].join("; ")) : pass("the launch screen has a solid ground, each @property is registered once, the ticker's dots are silent");
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
