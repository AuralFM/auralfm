# AuralFM: handoff for the next agent

*Written 26 September 2026, at the end of a long working session with the owner, Melton. Read this
first, then `CLAUDE.md`, then the docs it points to. It records what exists, how it is built and shipped,
the rules the owner has set, and what is still open.*

---

## 1. What AuralFM is

A radio globe: 60,096 live stations in 12,253 places, placed where they broadcast, played from each
station's own server. No account, no algorithm, no promoted slots. Tagline "Listen in."; the name is
written AURAL.FM on the sites. The owner's framing is the "decolonization of ears": hearing the world
outside the big US radio groups and the feed algorithms. The audience is underground, community, college
and Global South radio listeners and stations.

It ships on **three platforms that must stay in step**:

| Platform | What it is | Where |
|---|---|---|
| Desktop | Electron app, macOS (the owner's Mac is **Intel**, so builds land in `dist/mac`, not `mac-arm64`) | `src/` |
| Web app | Static build of the same renderer, with a bridge instead of Electron IPC | `web/` → built to `dist-web/`, live at **listen.auralfm.xyz** |
| iPhone app | The web app installed as a PWA | same build as the web app |

Plus three websites (static, hand-written HTML/CSS, a shared stylesheet):

| Site | Folder | Live at | here.now slug |
|---|---|---|---|
| Homepage | `home/` | auralfm.xyz (password-protected) | `mantra-portal-hsqy` |
| Journal (blog) | `site/` | blog.auralfm.xyz (password-protected) | `brave-thistle-7jqb` |
| Docs | `docs-site/` | docs.auralfm.xyz (public; carries Privacy and Terms) | `rapid-ember-55ng` |
| Web app | `dist-web/` | listen.auralfm.xyz (public) | `gleaming-ravine-79cz` |

Repo: `/Volumes/HARD DRIVE #2/auralfm` (an **external drive that sometimes drops out**, see §8), branch
`main`, GitHub `meltonbell3/auralfm`. Latest commit at handoff: `8572e4a`. Working tree clean apart from
two untracked folders (`.claude/`, `AuralFM_Logo_kit/`) that have deliberately been left out: ask before
adding them.

---

## 2. Rules the owner has set (do not break these)

- **The app's fonts never change.** Desktop, web and iPhone keep their type (Inter/system). Brand fonts
  (Science Gothic for display, Space Mono labels, Space Grotesk body) are for the three websites only.
- **The globe is the heart.** Every feature is built around it, never replaces it.
- **New features go web-first**; desktop after the owner approves (the studio and the loading work were
  approved for all three).
- **"Commit, push and publish"** is the normal finish: commit to `main`, push, publish the affected
  here.now sites, and for desktop changes rebuild and reinstall the app (§6).
- **Show an example before pushing a design change** when the owner asks for one (lab pages, local
  preview, screenshots).
- **Never enter passwords**; the owner sets site passwords in the here.now dashboard himself.
- **Ask before downloading files.** Reading a public web page is fine.
- **Never delete user data.** An old installed app goes to the **Trash** (Finder), never `rm`.
- **Contact address is hello@auralfm.xyz.** Never reproduce the owner's personal email anywhere.
- **Never send messages or outreach on the owner's behalf.** The mail script only sends with `--send`,
  which he runs himself. Do not ask him to paste API keys in chat (Resend key lives in
  `~/.resend/credentials`, here.now key in `~/.herenow/credentials`).
- **Never reintroduce radio.garden** in any form (data, endpoints, Referer spoofing). The catalogue is
  AuralFM's own.
- **The split-flap letter turn-over goes on anything new whose text changes in place** (§5.6). The owner
  loves it and asked for it everywhere from now on.
- **Money never buys placement.** Tips, donations or sponsorship never change where a station appears;
  anything paid is labelled where it appears; never build "tip to request a song" (§5.8).
- `CLAUDE.md`: run the Rams design review (`quick_review`) after UI edits and verify its findings
  before acting (it is a static reader and is often wrong about this app, e.g. names that come from
  `data-i18n-title` at runtime). `npm run audit` is the test suite; **every new audit check must be seen
  failing** (break the code it guards, watch it go red, restore).

---

## 3. Repository map

```
src/                 desktop app
  main.js            Electron main: windows, splash, layers (LAYERS list, startQuiet), menus, deep links
  main/              IPC split by area (ipc-app, ipc-catalog, ipc-globe, ipc-chat, store.js …)
  preload.js         the window.auralfm API the renderer calls
  catalog.js         station catalogue, region hold (UK/EU), relink of saved ids
  resolver.js        station → playable URL (radio-browser by uuid → profile stream → cache → by name)
  region.js          time zone → home country (the UK/EU hold)
  i18n.js            UI strings (English complete; other languages fall back)
  renderer/          the UI shared by desktop and web
    explore.html     markup + the whole stylesheet (CSP, [hidden] rule, motion tokens)
    explore-*.js     Explore in parts: core, stations, profile, studio, playback, panels, globe,
                     view, prefs, dial, layers, sky, chat, rooms, commands, trackers, search, brand
    explore.js       boot sequence
    splash.html/js   the desktop splash window
    reveal.js        fades the page in once the window is visible
    vendor/          globe.gl, textures (gitignored, built by `npm run vendor`)
web/                 web/PWA-only code: bridge.js (the window.auralfm stand-in), launch.js,
                     phone-bar.js, rail-sheet.js, after.js, install.js, ticker.js, sw.js, web.css
home/ site/ docs-site/   the three sites; home/ is the source of the shared aural.css/aural.js,
                     copied to the others by scripts/sync-sites.mjs
scripts/             build, catalogue and ops scripts (see §4); audit.mjs is the test suite
data/                catalogue.json, ids.json, donate.json (tracked); stations*.json, profiles/,
                     _enrich.jsonl, claims.json (gitignored, rebuilt)
docs/                LEGAL-AND-SECURITY.md, PRIVACY.md, TERMS.md, STATIONS.md, RECEIVERS.md,
                     CODE-OF-CONDUCT.md (scripts/build-legal.mjs renders some into the sites)
```

Owner's planning notes live in his Obsidian vault:
`~/Library/Mobile Documents/iCloud~md~obsidian/Documents/MB3Vault/04 Projects/AuralFM/`, notably
`BRAND.md`, `ROADMAP.md`, `VISION.md`, `YOUR-OWN-SHOW.md`, `DONATIONS-AND-PAYOLA.md`,
`PPL-PRS-ENQUIRY.md`, `STATION-OUTREACH.md`, `SPONSORSHIP.md`, `BROADCAST.md`, `Journal/`, `Email previews/`.

---

## 4. Commands

Node lives at `/Users/mb3/.local/node/bin` (put it on `PATH`).

| Task | Command |
|---|---|
| Test suite | `npm run audit` (must end "all checks passed") |
| Build the web app | `npm run web` → `dist-web/` |
| Copy shared site files, stamp versions | `node scripts/sync-sites.mjs` (the audit fails if the sites have drifted) |
| Desktop beta build | `npm run dist:beta` (runs the audit, vendor, notices, icons, electron-builder) |
| Rebuild the catalogue end to end | `npm run catalogue` (hours: crawls every station's stream and homepage) |
| Rebuild station profiles only | `node scripts/profiles.mjs` (fast; reads `data/_enrich.jsonl`) |
| Render legal/stations docs into sites | `node scripts/build-legal.mjs` |
| City-lights texture | `node scripts/lights.mjs` (4096×2048 now; see §5.3) |
| Emails (preview; `--send` only by the owner) | `npm run mail`, `npm run mail -- --test <address>` |
| Station claims review | `node scripts/claims.mjs` (writes a sheet), `--import` to apply approvals |
| Local previews | `.claude/launch.json`: `auralfm-web` :8765 (dist-web), `auralfm-home` :8766, `auralfm-blog` :8767, `auralfm-docs` :8768 |

---

## 5. What was built (most recent first)

### 5.1 The two "i" buttons are one switch (commit 8572e4a)
The station row's "i" and the player bar's "i" now open and close the same description; both show it
lit while open (`syncInfo()` in `src/renderer/explore-profile.js`). On a phone the player is pulled up
instead (the drawer). Tested in the web build.

### 5.2 Faster globe, quiet desktop start (6a73f88, 214148b, 98e5af4)
Measured on a cold launch, the waits were the device preparing the globe, not the downloads:
- **City lights at 4096×2048 everywhere** (`scripts/lights.mjs` WIDTH). The 8192 mask cost a single
  6.5-second freeze in the first frame and ~128 MB of GPU memory. The old 8192 file is kept only in a
  scratch folder.
- **The globe starts with no dots.** It shows a budget of ~700 dots (`applyLod` in
  `explore-view.js`) but used to build all 12,253 into one mesh first and throw it away. Longest
  main-thread task went from 5.3–7.9 s to ~2.8 s. (Reducing dot sides 12→6 made no measurable difference
  and was not changed.)
- **Desktop starts quiet:** every launch from fully closed resets layers so only `stations` and
  `shortwave` are on (`startQuiet()` / `ON_AT_LAUNCH` in `src/main.js`). The web does **not** do this
  (the owner asked for desktop; offer it for web if speed matters there).
- **Satellite cloud imagery loads only when Clouds is on** (`startLiveImagery()` in `explore-globe.js`).

### 5.3 Loading screens and the wave (merge 9d5c80e and the loading-wave commits)
- **The wave:** five bars rising and falling, the one "working on it" sign everywhere. CSS in
  `explore.html` (`.wave`), `splash.html`, `home/aural.css`; `waveSpan()` in `explore-core.js`. Used on
  the desktop splash, the player bar while a station connects (`#now.pending #nowWave`), "Looking…" /
  "Fetching the article…", and the website's "Loading the globe" button. Reduced motion shows a still
  wave (`animation:none`, deliberately not a near-zero duration: a loop would flicker).
- **Web/iPhone launch screen:** written into `index.html` by `scripts/build-web.mjs`
  (`launchScreen()`), driven by `web/launch.js` (`window.AuralLaunch.step/done`). Onyx from the first
  byte (no white flash), mark + name + wave + a line that changes only when a real step finishes;
  after 6 s it explains the first visit is slow. Lifted by the bridge's `exploreReady` (the same
  moment that shows the desktop window); 45 s floor. `reveal.js` stands aside while it is up. Audit
  check "the web launch screen lifts when the globe has painted".
- **Preloads** from the top of the page: stylesheet, stations list, globe.gl and globe textures (with
  `crossorigin` matching how each is really requested so nothing downloads twice).

### 5.4 Stations' own donation pages (6a73f88)
- Card shows **Donate to this station** opening the station's own page (or its fiscal sponsor's), beside
  or instead of a Lightning tip; note under it: AuralFM takes no part and no cut, and giving changes
  nothing about where the station appears. None for Cuba, Iran, North Korea, Syria.
- Sources, most trusted first: the station's claim (claim form field `donate`, or `donate` in its
  `/.well-known/auralfm.json`) → `data/donate.json` (hand-checked; **8 Ball Radio** is the first entry,
  via Fractured Atlas) → homepage crawl (`donationPage()` in `scripts/enrich.mjs`: own-site
  /donate|/give|/pledge|/support-us first, then known platforms; https only; memberships excluded).
- **Only 8 Ball has one so far**: the rest fill in on the next `npm run catalogue` crawl. Sites built in
  JavaScript (8ballradio.nyc is Vue) show no links to the crawl: use `data/donate.json` or the claim.
- Audit check "a donation link is the station's own page, and never for a sanctioned country".
- Legal evaluation: `docs/LEGAL-AND-SECURITY.md` §11 and the vault's `DONATIONS-AND-PAYOLA.md`.

### 5.5 Website "signal pass" (2a8e0de)
From a constructivist-brutalist brief the owner pasted: numbered sections ("01/ VIBES"), a mast-red
rule under the top bar, a 24-hour tuning dial with a red needle under each clock on the "Where it is
tonight" board. Fixes: safe-area insets for a sideways iPhone, no iOS tap flash, reduced-motion gaps,
layout containment on the live bar. The brief's fonts, cream palette, "no motion" rule, and fake
copy/numbers were rejected as conflicting with decided brand rules.

### 5.6 Split-flap (existing; extended this session)
The letter turn-over the owner loves. `flap()` in `src/renderer/explore-brand.js`, exposed as
`window.AuralFlap.flap(el, text)` and `.onChange(el)`; sites use `flapTo()` in `home/aural.js`. On: the
station name, the place heading, the player status line, the launch screen's steps, and on the website
the departures board, the live bar and the globe's picked place. Use it for any new text that changes in
place.

### 5.7 Earlier in the session (see `git log` for detail)
- **Desktop studio fix (3db11d5):** `ipc-app.js` read `../package.json` (wrong path after a refactor), so
  every installed build reported no channel, hiding the studio and the "beta" label. Audit check added.
- **Emails via Resend (b830e89):** `scripts/mail.mjs`, templates beta / sponsor / claim / approved,
  previews in the vault; sends only with `--send`, run by the owner. DNS is verified; keep open/click
  tracking off in Resend (the Privacy Policy promises no tracking).
- **"Your show" studio prototype (13a9dc7, 4b9fd49):** `src/renderer/explore-studio.js`. Web Audio mix
  (mic + a track, ducking, monitor, meters), states off/rehearse/live, a red ring on the host's town.
  **Nothing is transmitted yet.** Shown only in dev/beta builds, on localhost, or with `?studio`.
- **Sponsors, not members; no tips to sanctioned countries (a502b50).**
- **A catalogue of our own (f5588c1):** radio.garden removed entirely; AuralFM ids `af-` + 8 Crockford
  chars; GeoNames places; `npm run catalogue` pipeline; 36,266 of the old 38,337 stations kept.
- **UK/EU hold (ba0ccc7):** by time zone, foreign music stations are listed but held back for listeners
  in the UK/EU/EEA (legal notes §9, option 3). Speech stations and home-country stations play.
- **Player-bar station card (c9814eb):** wide windows open the station in the rail; phones pull the
  player up into a drawer.

---

## 6. Shipping routine

1. `npm run audit`, then `node scripts/sync-sites.mjs` if any site file or `home/aural.*` changed.
2. `npm run web` if anything under `src/renderer`, `web/` or the build script changed.
3. Commit to `main` (end messages with the co-author line the harness asks for), `git push`.
4. Publish (one command per site; **do not loop in zsh with `set -- $pair`**, it does not split):
   ```bash
   /Users/mb3/.agents/skills/here-now/scripts/publish.sh dist-web --slug gleaming-ravine-79cz --client claude-code
   /Users/mb3/.agents/skills/here-now/scripts/publish.sh home --slug mantra-portal-hsqy --client claude-code
   /Users/mb3/.agents/skills/here-now/scripts/publish.sh site --slug brave-thistle-7jqb --client claude-code
   /Users/mb3/.agents/skills/here-now/scripts/publish.sh docs-site --slug rapid-ember-55ng --client claude-code
   ```
   A "version_conflict" means here.now's record moved: compare the live files
   (`GET https://here.now/api/v1/publish/<slug>/files`, hashes) with the last commit before using
   `--overwrite`. It has so far always been bookkeeping only.
5. Desktop: `npm run dist:beta` (takes several minutes; run it in the background), then
   `osascript -e 'tell application "AuralFM" to quit'`, move `/Applications/AuralFM.app` to the Trash
   with Finder (`osascript -e 'tell application "Finder" to delete POSIX file "/Applications/AuralFM.app"'`),
   `ditto dist/mac/AuralFM.app /Applications/AuralFM.app`, `open -a /Applications/AuralFM.app`.
   Unsigned build (no Developer ID yet).
6. Verify live: `curl` the live page for the new version stamp / markup. The homepage and blog are
   password-protected (401), so only the upload can be confirmed there.

---

## 7. Open decisions and tasks

**Waiting on the owner:**
- `YOUR-OWN-SHOW.md` in the vault: five decisions (direct road first? sponsors-only at launch? 18+?
  the name? planned shows?), plus the listen-link shape. Recommended: `listen.auralfm.xyz/live/<id>`,
  which opens the app on the globe at the host's town.
- **Studio phase 1** is not started: WebRTC over Nostr, NIP-53 (kind 30311) announce/end, live rings,
  "Live now", report/hide, 18+ confirmation, the iPhone "keep the app open" warning. Phase 2: desktop
  pushes to an Icecast/Shoutcast server (a normal stream URL, any audience).
- Legal: DMCA agent registration; send the PPL/PRS enquiry (`PPL-PRS-ENQUIRY.md`); lawyer questions in
  `docs/LEGAL-AND-SECURITY.md` §6, §9, §11 (incl. whether a Donate link makes AuralFM a "charitable
  fundraising platform" under California AB 488).
- Resend: the owner authenticates the MCP himself (`/mcp` in an interactive terminal), keeps tracking
  off, tests with `npm run mail -- --test <address>`.
- Whether the **web app should also start quiet** (dots only) like the desktop.
- Whether to add `AuralFM_Logo_kit/` to the repo.

**Worth doing next:**
- Run `npm run catalogue` (long) to fill donation pages and refresh profiles for all stations.
- Globe setup is still slow on the owner's Intel Mac (~15–25 s cold, heavily affected by machine load):
  the remaining cost is decoding/uploading the 4096 day/night/sky textures and shader compile. Ideas not
  yet tried: 2048 sky texture on the web, deferring the night/topology textures while Day/Night is off
  (the desktop now starts with it off), `ImageBitmap` decoding off the main thread.
- The owner reserved time for testing, brand strategy, a marketing plan and white papers.

---

## 8. Gotchas learned the hard way

- **The external drive drops out** ("Device not configured"). Retry; if git lost a ref, check the
  working tree matches `origin/main` before doing anything, then rebase.
- **The browser pane can be hidden**, so screenshots time out and `requestAnimationFrame` never fires
  there (the launch screen never lifts in a hidden tab). For proof, drive a hidden Electron window from
  a script (`npx electron some-script.js`) with `disable-backgrounding-occluded-windows` and
  `backgroundThrottling: false`, and `capturePage()`. Clear the service worker and caches before
  reloading the web preview.
- **The Mac is often very busy** (load averages of 40–90 from other apps): absolute timings are
  unreliable. Compare within one session, alternate cases, and trust long-task measurements
  (PerformanceObserver `longtask`) over total launch time.
- **Never test in a tab the owner is using** (an earlier test cleared a site's caches in his tab).
- `sleep` chains are blocked in this harness; wait with `run_in_background` and an `until` loop.
- `dist-web/` is a build output: instrumenting it for timing is fine, but rebuild before publishing.
- Rams: the free reviews are used up; there is a purchased pack (quick checks cost half a credit;
  `verify_fixes` is free). Send excerpts, not the 106 KB `explore.html`.

---

## 9. Memory the owner's agents keep

`/Users/mb3/.claude/projects/-Volumes-HARD-DRIVE--2-auralfm/memory/` (index in `MEMORY.md`): platform
direction, web preview on here.now, web/mobile parity, brand narrative, Figma design system, app fonts
fixed, the globe is the heart, journal workflow, app↔site cohesion, halftone tool, catalogue & network
direction, **split-flap everywhere**, **donations and payola**. Read the index; verify anything a memory
names still exists before relying on it.
