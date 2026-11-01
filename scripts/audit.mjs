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
import { failures, skipped } from "./audit/lib.mjs";

// One at a time, and not as `import` statements: sibling imports that await run
// at the same time, and several checks replace WebSocket, Date.now or console.log.
for (const area of ["foundations", "app-core", "chat", "playback", "catalogue", "web-and-phone", "globe", "design", "build-and-release"]) await import(`./audit/${area}.mjs`);

const tail = skipped ? ` (${skipped} not checkable here)` : "";
console.log(failures ? `\n${failures} check(s) failed${tail}\n`
                     : `\nall checks passed${tail}\n`);
process.exit(failures ? 1 : 0);
