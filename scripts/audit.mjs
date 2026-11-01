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
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { failures, skipped, ROOT, R, rel, fail, pass, RELEASE, skip, HAS_CAT, C, NO_CAT, renderers, preload, main, EXPLORE, EXPLORE_FILES, exploreSrc, readSrc, channels, strings, en, pkg } from "./audit/lib.mjs";

// One at a time, and not as `import` statements: sibling imports that await run
// at the same time, and several checks replace WebSocket, Date.now or console.log.
for (const area of ["foundations", "app-core", "chat", "playback"]) await import(`./audit/${area}.mjs`);

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
      news = fresh(); asked = []; answer = (u) => (/^https:\/\/news\.google\.com\//.test(u) ? new Response(rss, { status: 200 }) : new Response("no", { status: 503 }));
      let fell = null; try { fell = await news.get(country); } catch { /* reported below */ }
      if (!fell?.length || !asked.some((u) => /^https:\/\/news\.google\.com\//.test(u))) gaps.push("with every newsroom down, the desktop did not fall back to Google's edition");
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

// ── the reader decodes an entity once ──────────────────────────────────────
// news.js decoded &amp; before &lt;, so an article that wrote "&amp;lt;" (a
// story about HTML, say) showed "<" where its author wrote "&lt;". Found by
// CodeQL (js/double-escaping, alert 6).
{
  const { createRequire } = await import("node:module");
  const req = createRequire(import.meta.url);
  const file = req.resolve(R("src/news.js"));
  delete req.cache[file];
  const news = req(file);
  delete req.cache[file];
  const site = (news.WORLD_FEEDS || []).find((x) => x.site);
  const realFetch = globalThis.fetch;
  const prose = "Write &amp;lt;b&amp;gt; to make a word bold, said the station's web editor, Tom &amp; Jerry's producer.";
  globalThis.fetch = async () => new Response(`<title>T</title><article><p>${prose}</p><p>${prose}</p></article>`, { status: 200 });
  let got = "";
  try { news.setReadBase("/api/read"); got = (await news.read(`${site.site}/news/story-2`))?.paragraphs?.[0] || ""; }
  finally { globalThis.fetch = realFetch; }
  got.includes("&lt;b&gt;") && got.includes("Tom & Jerry")
    ? pass("the reader decodes \"&amp;lt;\" to \"&lt;\" and \"&amp;\" to \"&\", once each")
    : fail("the reader decodes an entity once", `read "${got.slice(0, 80)}"`);
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

// ── a ring stays the same ring ──────────────────────────────────────────────
// three-globe keys a ring by its object, gives a new object a ring at once and
// keeps a dropped one in the scene for 30 s. Fresh objects on each flush held
// the scene above 90,000 objects with about 1,200 listeners on live relays.
{
  const name = "a ring stays the same ring";
  console.log(`\n${name}`);
  const gaps = [];
  try {
    const drawn = [];
    const globe = new Proxy({}, { get: (_, k) => (k === "pointOfView" ? () => ({ lat: 0, lng: 0, altitude: 2.5 })
      : k === "ringsData" ? (d) => { drawn.push(d); return globe; } : () => globe) });
    const box = { globe, layers: { listeners: true }, peers: [], window: {}, palette: null, document: {}, hexA: () => "", matchMedia: () => ({ matches: false }) };
    vm.runInNewContext(readSrc("src/renderer/explore-trackers.js"), box);
    const paint = (list) => { box.peers = list; vm.runInNewContext("paintRings()", box); return drawn.at(-1); };
    const peer = (i, geohash, lat, lon) => ({ pubkey: String(i), lat, lon, geohash, live: false, label: "" });
    const three = () => [peer(1, "eyck", 10, 10), peer(2, "gcpv", 20, 20), peer(3, "9q8y", 30, 30)];
    const a = paint(three()), b = paint(three());
    if (a.length !== 3 || b.some((r) => !a.includes(r))) gaps.push("the same listeners were handed to the globe as new objects");
    const town = paint([1, 2, 3, 4, 5].map((i) => peer(i, "eyck", 10, 10)));
    if (town.length !== 1) gaps.push(`five listeners in one town drew ${town.length} rings`);
    const base32 = "0123456789bcdefghjkmnpqrstuvwxyz";
    const world = Array.from({ length: 1000 }, (_, i) => peer(i, `${base32[i % 32]}${base32[(i >> 5) & 31]}zz`, 80 - i * 0.16, 160 - i * 0.32));
    world[900] = peer(900, "s000", 0, 0);
    const cut = paint(world);
    if (cut.length > 200) gaps.push(`a thousand towns drew ${cut.length} rings`);
    if (!cut.some((r) => r.lat === 0 && r.lng === 0)) gaps.push("the town under the camera lost its ring to the budget");
    gaps.length ? fail(name, gaps.join("; ")) : pass("a listener keeps their ring between flushes, a town draws one, the world draws 200 at most");
  } catch (e) {
    fail(name, `could not run paintRings: ${e.message}`);
  }
}

// ── a still ring stands still ───────────────────────────────────────────────
// Nothing in the globe code read prefers-reduced-motion, so the rings pulsed for
// everybody. The rings layer has no still mode: in three-globe 2.45.2 a speed of
// 0 adds a line of radius 0 every period and never removes one, and a period of
// 0 fires a single ring that spreads and is gone. So the same places are drawn
// on the particles layer, which the vibes also use, and neither may wipe the other.
{
  const name = "with reduced motion on, the rings stand still";
  console.log(`\n${name}`);
  const gaps = [];
  try {
    let still = true, ringed = [], marked = [];
    const changed = [], groups = [{ __globeObjType: "ring", visible: true }, { __globeObjType: "path", visible: true }];
    const globe = new Proxy({}, { get: (_, k) => (k === "pointOfView" ? () => ({ lat: 0, lng: 0, altitude: 2.5 })
      : k === "globeMaterial" ? () => ({ map: new (class Tex {})() })
      : k === "scene" ? () => ({ traverse: (fn) => groups.forEach(fn) })
      : k === "ringsData" ? (d) => { ringed = d; return globe; }
      : k === "particlesData" ? (d) => { marked = d; return globe; } : () => globe) });
    const pen = new Proxy({}, { get: () => () => {}, set: () => true });
    const box = {
      globe, peers: [], palette: null, hexA: () => "", css: () => "#E5484D", mayDrift: () => false,
      layers: { listeners: true, iss: true, onAir: true },
      window: { AuralShows: { on: true }, AuralStudio: { live: { lat: 5, lon: 6 } }, addEventListener() {} },
      document: { addEventListener() {}, createElement: () => ({ getContext: () => pen }) },
      matchMedia: (q) => ({
        matches: q.includes("reduced-motion") && still,
        addEventListener: (_, fn) => { if (q.includes("reduced-motion")) changed.push(fn); },
      }),
    };
    vm.runInNewContext(readSrc("src/renderer/explore-trackers.js"), box);
    vm.runInNewContext("issAt = { lat: 40, lng: 50 }", box);
    const peer = (i, geohash, lat, lon, live = false) => ({ pubkey: String(i), lat, lon, geohash, live, label: "" });
    box.peers = [peer(1, "eyck", 10, 20), peer(2, "gcpv", 30, 40), peer(3, "9q8y", -30, -40, true)];
    const paint = () => vm.runInNewContext("paintRings()", box);
    const held = () => marked.flat().filter((p) => p.kind);
    const kinds = () => held().map((p) => p.kind).sort().join();

    paint();
    if (ringed.length) gaps.push(`${ringed.length} rings still pulse with reduced motion on`);
    if (kinds() !== "iss,live,live,peer,peer") gaps.push(`the still marks are [${kinds()}], not the listeners, the shows and the ISS`);
    if (marked.some((set) => !(set.size > 0) || !set.tex)) gaps.push("a set of still marks has no size or no picture");
    const first = [...marked];
    paint();
    if (marked.some((set, i) => set !== first[i])) gaps.push("a flush handed the globe new sets of marks, which builds new objects");

    box.layers.listeners = false;
    paint();
    if (kinds() !== "iss,live,live") gaps.push("the Listeners layer turned off left its marks up");
    box.layers.listeners = true;

    vm.runInNewContext("vibeMarks = [{ lat: 1, lng: 2 }]", box);
    paint();
    if (!marked.some((set) => set[0]?.lat === 1 && !set[0].kind)) gaps.push("the still marks wiped a vibe off the globe");
    if (held().length !== 5) gaps.push("a vibe wiped the still marks off the globe");
    if (/globe\s*\.\s*particlesData/.test(readSrc("src/renderer/explore-brand.js"))) gaps.push("explore-brand.js writes the shared particles layer itself");

    still = false;
    vm.runInNewContext("wireTrackers()", box);
    if (!changed.length) throw new Error("nothing listens for the setting changing");
    changed[0]({ matches: false });
    if (ringed.length !== 5) gaps.push("turning reduced motion off did not bring the rings back");
    if (held().length) gaps.push("turning reduced motion off left the still marks up");
    if (!marked.some((set) => set[0]?.lat === 1)) gaps.push("the rings coming back wiped a vibe off the globe");

    still = true;
    changed[0]({ matches: true });
    if (ringed.length || held().length !== 5) gaps.push("turning reduced motion on while running did not stand the rings still");
    if (groups[0].visible || !groups[1].visible) gaps.push("rings already spreading were left to finish");
    gaps.length ? fail(name, gaps.join("; "))
      : pass("reduced motion draws every listener, show and the ISS as marks that stay, on the same objects, beside a vibe, and follows the setting live");
  } catch (e) {
    fail(name, `could not run paintRings: ${e.message}`);
  }
}

// ── a still camera stays where it is put ────────────────────────────────────
// The rings stood still and the camera did not: every pick flew for 800ms, the
// layers panel swung the planet for 420ms, and the drift came back by itself
// after a touch. Slow Rotation is switched by hand and starts off at every
// launch, so reduced motion holds it only until somebody turns it on after that.
{
  const name = "with reduced motion on, the camera does not travel";
  console.log(`\n${name}`);
  const gaps = [];
  try {
    let still = true, durations = [], timers = [];
    const changed = [];
    const controls = { autoRotate: false };
    const globe = new Proxy({}, { get: (_, k) => (k === "controls" ? () => controls
      : k === "pointOfView" ? (at, ms) => { if (at) durations.push(ms); return { lat: 0, lng: 0, altitude: 2.5 }; }
      : k === "scene" ? () => ({ traverse() {} }) : () => globe) });
    const box = {
      globe, peers: [], palette: null, hexA: () => "", css: () => "", console,
      $: () => null, t: (k) => k, globePts: null, syncWsprTimer() {}, withShader() {}, drawSky() {},
      startLiveImagery() {}, paintOrbits() {}, fitMarkets() {}, sizeGlobe() {},
      setTimeout: (fn) => { timers.push(fn); return timers.length; }, clearTimeout() {},
      window: { addEventListener() {}, auralfm: {} },
      document: { addEventListener() {}, createElement: () => ({ getContext: () => new Proxy({}, { get: () => () => {}, set: () => true }) }) },
      matchMedia: (q) => ({
        matches: q.includes("reduced-motion") && still,
        addEventListener: (_, fn) => { if (q.includes("reduced-motion")) changed.push(fn); },
      }),
    };
    for (const f of ["explore-layers", "explore-trackers", "explore-view"]) vm.runInNewContext(readSrc(`src/renderer/${f}.js`), box);
    vm.runInNewContext("wireTrackers(); applyLod = () => {}", box);
    const run = (code) => vm.runInNewContext(code, box);
    const settle = () => { const due = timers; timers = []; due.forEach((fn) => fn()); };

    run("flyTo(10, 20)");
    if (durations.join() !== "0") gaps.push(`a fly-to took ${durations.join()}ms, not 0`);
    if (!run("flying")) gaps.push("a jump dropped the flying guard, so the list would follow the camera mid-move");
    settle();
    if (run("flying")) gaps.push("the flying guard never came down after a jump");

    durations = [];
    run("shiftForPanel(true)");
    if (durations.join() !== "0") gaps.push(`opening the layers panel swung the planet for ${durations.join()}ms`);

    // Slow Rotation already on when the window opened: the read at start-up, not a hand.
    run("layers = { ...layers, drift: true }");
    run("pauseDrift()");
    settle();
    if (controls.autoRotate) gaps.push("a touch started a drift nobody asked for after reduced motion was on");
    run("applyLayers({ clouds: false })");
    if (controls.autoRotate) gaps.push("changing another layer started the drift");

    run("applyLayers({ drift: false })");
    run("applyLayers({ drift: true })");
    if (!controls.autoRotate) gaps.push("switching Slow Rotation on by hand was ignored");
    controls.autoRotate = false;
    run("pauseDrift()");
    settle();
    if (!controls.autoRotate) gaps.push("a drift switched on by hand did not resume after a touch");

    changed[0]?.({ matches: true });
    if (!changed.length) gaps.push("nothing listens for the setting changing");
    if (controls.autoRotate) gaps.push("turning reduced motion on left the globe drifting");
    still = false;
    changed[0]?.({ matches: false });
    if (!controls.autoRotate) gaps.push("turning reduced motion off did not give the drift back");

    durations = []; settle();
    run("flyTo(10, 20)");
    if (durations.join() !== "800") gaps.push(`without reduced motion a fly-to took ${durations.join()}ms, not 800`);
    durations = []; settle();
    run("shiftForPanel(false)");
    if (durations.join() !== "420") gaps.push(`without reduced motion the panel shift took ${durations.join()}ms, not 420`);

    const view = readSrc("src/renderer/explore-view.js");
    const rogue = view.match(/autoRotate\s*=(?!\s*(?:false\b|mayDrift\(\)))[^;]*/g) || [];
    if (rogue.length) gaps.push(`the drift is started without mayDrift(): ${rogue.join(" | ")}`);
    if (!/layers = \(await window\.auralfm\.layers\(\)\) \|\| layers;\s*driftChosen = false;/.test(view)) {
      gaps.push("the layers read at start-up can pass for a hand on the switch");
    }
    gaps.length ? fail(name, gaps.join("; "))
      : pass("reduced motion makes a fly-to and the panel shift a jump, keeps the flying guard, and holds the drift until it is switched on by hand");
  } catch (e) {
    fail(name, `could not run the camera: ${e.message}`);
  }
}

const tail = skipped ? ` (${skipped} not checkable here)` : "";
console.log(failures ? `\n${failures} check(s) failed${tail}\n`
                     : `\nall checks passed${tail}\n`);
process.exit(failures ? 1 : 0);
