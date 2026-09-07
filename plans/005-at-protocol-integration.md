# Plan 005 — AT Protocol integration & size-reduction rewrite

> Updated 30 August 2026 after the maintainer's decisions.
> Tauri + React: approved. AT Protocol: research continues, cost ceiling
> is the Apple Developer Program ($99/yr) and nothing else. Nostr work
> is preserved and expanded. Migration work is mostly vibe-coded.
>
> **Cost clarification:** the $99/year is the Apple Developer Program
> fee, which is required to sign and notarize a macOS app for
> distribution. This cost exists **whether the shell is Electron or
> Tauri** — both must be signed and notarized for any user other than
> the developer to launch them. Tauri, React, Rust, and all the build
> tools are open-source and free. The $99/year is the only ongoing
> spend in the entire plan.
>
> **Revision 2 (same evening):** revised social-media strategy in
> response to "I don't know that Bluesky the social media will exist
> long term." Cross-posting to corporate platforms is removed from
> the plan. The principle is "no backend, no server, untraceable, no
> dependencies on corporate APIs." A share-URL pattern replaces
> direct integrations. AT Protocol is treated as an open protocol,
> not as Bluesky-the-company's product.

This plan replaces the "what if" framing of the previous draft with the
"what was decided" framing. Open questions are now mostly gone; what
remains is the order of operations and the acceptance criteria for each
phase.

---

## Part 0 — Decisions locked in

| | Decision | Reason |
|---|---|---|
| Shell | **Tauri** | Smaller binary (~10–20 MB vs. ~200 MB), system WKWebView, Rust toolchain acceptable. **Free and open source.** |
| Renderer | **React** | Ecosystem, hiring, future maintainers. Bundle size is a rounding error against the shell. **Free and open source.** |
| React stack | **Vite + React 19 + TanStack Router + Zustand + Radix UI primitives** | Smallest reasonable bundle, no SSR machinery you do not need. **All free.** |
| AT Protocol | **Defer real decisions until research completes.** Start with the **zero-cost surface only**: OAuth + one-way "now playing" cross-post + verified handles. No new servers. **The protocol is not the company.** |
| Cost ceiling | **$99/yr Apple Developer Program, and that is the entire budget for ongoing spend.** This pays for code signing and notarisation so the app can run on any Mac. It is required regardless of shell choice. Tauri, React, and Rust are all free. No feed generator, no labelers, no PDS. Each AT Protocol feature is graded against "does this require us to run a server?" — if yes, it waits. |
| Cross-post to corporate social media | **No.** A share-URL pattern replaces direct integrations. The audit enforces "no outbound requests to corporate platform APIs from a built version." | Every corporate API integration is, in practice, a server of ours that the company can shut down. Incompatible with the project's principles. |
| Migration approach | **Vibe-coded where possible, hand-coded where the existing audit discipline demands.** Acceptance criteria are written into each phase so the work can be delegated and verified. |
| Nostr | **Preserved and expanded.** The 1,420-line `presence-nostr.js` stays as-is. AT Protocol cross-posting is additive. New Nostr features are explicitly greenlit. |

---

## Part 0.5 — The principle restated

From the maintainer, repeated in the project's own voice:

> **This application needs to be completely decentralized, no backend,
> no server, untraceable.**

Every decision below is graded against that principle. If a feature
requires a server of ours — even a small one, even a $4/month VPS, even
a "free" tier with rate limits — it is parked until either the cost
ceiling moves or a sponsor is found. If a feature depends on a
corporate API that can be revoked at any time — Twitter, Facebook,
YouTube, Reddit, Discord, TikTok, etc. — it is out. The user pastes a
share URL where they want; AuralFM has no idea where they pasted it.

---

## Part 1 — The Tauri + React rewrite

### 1.1 The size budget, restated

| Component | Today (Electron) | Target (Tauri) |
|---|---|---|
| Shell binary | ~150 MB Electron + Chromium | ~5–10 MB Tauri |
| WKWebView | Bundled (~80 MB) | System (0 MB) |
| Node.js runtime | Bundled | Sidecar only where needed |
| Renderer bundle | ~3 MB (vanilla JS) | ~4 MB (React + tree-shaken primitives) |
| Assets | 3 MB | 3 MB |
| Catalog | 760 KB bundled | 760 KB bundled |
| **Total shipped** | **~200–230 MB** | **~15–20 MB** |

The 150 MB target is **comfortably met**. The hard part is not the size —
it is making sure the rewrite does not regress functionality.

### 1.2 Phased migration plan

Every phase ends in something shippable. Each phase has explicit
acceptance criteria so the work can be delegated.

#### Phase R0 — Spike (one week, hand-coded)

**Goal:** prove that the existing renderer works inside WKWebView.

**Acceptance criteria:**
- [ ] `npx create-tauri-app` scaffolded with vanilla JS first.
- [ ] A Tauri window loads a copy of `src/renderer/explore.html` from the
      existing repo.
- [ ] `globe.gl` renders the Earth with city lights (verifies three.js,
      WebGL, WebAssembly textures).
- [ ] `kiwi.js` connects to a KiwiSDR and plays audio (verifies WebSocket,
      WebAssembly IMA-ADPCM decoder, AudioContext).
- [ ] The menu bar tray icon shows and the popover opens (verifies Tauri
      tray plugin).
- [ ] `npm run audit` runs unmodified and passes (verifies Node sidecar
      compatibility, even though Tauri does not need it).
- [ ] Binary size measured for the spike: should be ~15 MB.
- [ ] `kiwi.js` audited for Chromium-only WebAssembly features; any
      blockers documented in `plans/005-r0-wkwebview-blockers.md`.

**Decision gate at end of R0:** if any of the above fails, the spike
**stops**. Either fix the blocker or revisit the Tauri decision. No
proceeding with broken assumptions.

**Cost:** one week of focused time. The audit suite is the safety net.

#### Phase R1 — React renderer skeleton (vibe-coded)

**Goal:** the three main views (popover, explore, settings) reimplemented
in React against the existing IPC surface.

**Acceptance criteria:**
- [ ] Vite + React 19 + TanStack Router + Zustand + Radix UI primitives
      installed.
- [ ] `npm run dev` hot-reloads inside a Tauri window (verify with one
      view).
- [ ] Popover view reimplemented. Same DOM output (verifiable via DOM
      diff), same keyboard shortcuts, same i18n.
- [ ] Explore view reimplemented. Same globe, same layer toggle, same
      radio station browser.
- [ ] Settings view reimplemented. Same prefs surface, same Nostr/Bluesky
      toggles.
- [ ] All existing `npm run audit` checks pass. The audit is the
      contract — React components that break it are reverted.
- [ ] Bundle size of the renderer measured: target ~4 MB minified,
      hard ceiling 6 MB.

**Delegation shape:** this is the phase to vibe-code. Each view is a
discrete task. The hand-written audit suite is the verifier.

**Files at risk:** the existing `src/renderer/*.html` is the source of
truth; the React rewrite lives in `src/renderer-react/` until the
cutover. Both builds produce a Tauri-compatible bundle, so they can be
diffed.

#### Phase R2 — Rust shell + IPC surface (hand-coded)

**Goal:** the Tauri shell hosts the existing main-process modules.

**Acceptance criteria:**
- [ ] Tauri commands wrap each IPC call from `src/preload.js` (the entire
      existing renderer API surface). One Rust function per IPC call,
      typed via `tauri-specta`.
- [ ] Network modules (`catalog.js`, `weather.js`, `sdr.js`, `wspr.js`,
      `space.js`, `flights.js`, `resolver.js`, `presence-nostr.js`) kept
      as Node sidecars. They communicate with the Tauri shell over
      stdin/stdout JSON-RPC or a local socket. The audit suite does not
      care what runtime hosts them.
- [ ] System modules (tray, autolaunch, geolocation, dock badge, dock
      menu, media keys) replaced with `tauri-plugin-*` equivalents.
- [ ] Crypto modules (`@noble/curves`, `@noble/hashes`, `@noble/ciphers`,
      `nostr-private.js`, `identity.js`) kept as-is. Tauri can load them
      in a Node sidecar.
- [ ] `auralfm://` URL scheme registered as a Tauri deep link.
- [ ] macOS code signing and notarisation pipeline produces a working
      `.dmg`.

**Decision:** keeping Node sidecars for network modules is deliberate.
Rewriting them in Rust is a separate, larger project. The audit suite
already verifies their behaviour; do not break that.

**Files at risk:** `src/main.js` is rewritten. `src/preload.js` becomes
typed Rust commands. All other `src/*.js` files stay.

#### Phase R3 — Cutover

**Goal:** the Electron build is replaced by the Tauri build.

**Acceptance criteria:**
- [ ] A `--target=electron|target=tauri` flag in `npm run dist` selects
      the build.
- [ ] Both builds produce a working `.dmg`.
- [ ] Two weeks of dual-ship testing: every commit produces both
      artifacts, both are tested, both are signed.
- [ ] When the Tauri build has been clean for two weeks, switch the
      default and drop the Electron build.
- [ ] `npm run audit` is the final gate. If it fails on either build,
      the release does not ship.

#### Phase R4 — Cleanup

**Goal:** Electron is gone from the dependency tree.

**Acceptance criteria:**
- [ ] Electron removed from `devDependencies`.
- [ ] `npm run vendor` targets the Tauri bundle destination.
- [ ] `npm run audit` gets a new check: "the Tauri shell does not embed
      a WebView; runtime WebKit is the user's."
- [ ] `npm run audit` gets a new check on Rust crate licences (the
      dependency tree grew a new language).
- [ ] README rewritten to describe the Tauri build.

### 1.3 The delegation strategy for vibe-coding

The phases above are deliberately structured for delegation. Each
acceptance criterion is a yes/no check. The vibe-coding loop is:

  1. Delegate phase R1 view-by-view.
  2. After each delegation, run `npm run audit`. If it fails, the
     delegation is broken and gets fixed before the next.
  3. The hand-written audit suite is the ground truth, not the vibe
     coder's tests.

This is consistent with the repo's standing rule from `CLAUDE.md`:

> `npm run audit` is the test suite. Every check was written after a
> bug, and each one is verified to fail when that bug is put back.

The audit suite must be updated as new bugs are found in the React
rewrite. New checks for the React rewrite are written the same way: a
bug is found, the bug is fixed, the bug is put back to verify the check
goes red, the bug is fixed again.

### 1.4 What you lose (and what you gain)

| | Today (Electron) | Tomorrow (Tauri + React) |
|---|---|---|
| Binary size | ~200 MB | ~15–20 MB |
| Renderer dev loop | manual reload | Vite HMR |
| Renderer ecosystem | hand-rolled | React + Radix |
| Cross-platform | macOS only | macOS only (Tauri's WebView2/webkit2gtk are out of scope) |
| Whisper captions (#30) | blocked on `SharedArrayBuffer` | unblocked: Tauri serves custom protocol with COOP/COEP |
| WebKit quirks | none (Chromium) | `kiwi.js` audit needed in R0 |
| Maintenance | one person | one person + vibe-coded phases |

---

## Part 2 — AT Protocol integration (revised)

### 2.1 AT Protocol, not Bluesky-the-company

The distinction matters because the maintainer is right to be cautious
about Bluesky's long-term future as a social-media company. AT Protocol
is a published specification with multiple implementations. The
`app.bsky.*` lexicons are Bluesky's; the protocol itself is open.
Blacksky, Flashes, Klearsky, Tokimeki, and any future client are all
AT Protocol clients.

**The integration is to the protocol, not to the company.** AuralFM's
station records are content-addressed CIDs on relays. If Bluesky-the-app
disappears tomorrow, the records are still there and any other AT
Protocol client can read them. If Blacksky becomes the dominant client,
the same records show up there. If a fork no one has heard of yet
launches next year, it can read AuralFM's catalogue.

What this means practically:

- **Station records are published to generic relays** (not to a
  Bluesky-controlled PDS).
- **Verification records are read from generic relays**, not from
  `api.bsky.app`.
- **AppView search is avoided.** If discovery requires it, AuralFM
  runs its own indexer over the relay it controls. No `$4/month VPS`
  is needed for this in the cost-ceiling-constrained version — the
  indexer can run locally at build time and ship with the binary.
- **App passwords are Bluesky-specific.** Where possible, use the
  protocol-level authentication. App password is acceptable as a
  fallback for users who do not have a generic AT Protocol OAuth
  client installed.

### 2.2 The cost ceiling, applied (stricter)

The maintainer's stated ceiling is the Apple Developer Program ($99/yr)
and nothing else. This means:

- **No feed generator service.** Dropped from earlier drafts.
- **No labeler services.** Dropped from earlier drafts.
- **No self-hosted PDS.** Dropped from earlier drafts.
- **No paid third-party PDS.** Dropped from earlier drafts.
- **No `api.bsky.app` dependency for anything load-bearing.**
- **No cross-posting to corporate social platforms** (Twitter,
  Facebook, YouTube, Reddit, Discord, TikTok, etc.). A share-URL
  pattern replaces direct integrations.

What survives the cost filter:

- **OAuth + cross-post "now playing"** — free. AuralFM publishes a post
  to the user's Bluesky account using their app password. No server of
  ours.
- **Verified handles** — free. Stations self-publish verification
  records to generic relays. AuralFM reads them from generic relays.
  No server of ours.
- **Read-side consumption** — free. AuralFM reads station records
  from relays it does not control.
- **Share URL pattern** — free. AuralFM generates a piece of text and
  a URL the user pastes anywhere. No API calls, no corporate
  dependency.

### 2.3 The zero-cost surface, phased

Each phase ships end-to-end and is independently useful.

#### Phase A0 — Lexicons (research only)

**Goal:** publish the proposed lexicons to the AT Protocol lexicon repo.

**Status:** research continues. The schemas in the previous draft of
this plan are still the proposal.

**Acceptance criteria:**
- [ ] Decision made: publish lexicons, or wait until the catalogue
      records are actually emitted? (Cost: nothing either way. Value:
      establishing the lexicon namespace before anyone else takes it.)
- [ ] If publish: lexicons submitted to the AT Protocol lexicon repo
      as a PR.

#### Phase A1 — One-way "now playing" cross-post (protocol-level, not Bluesky-specific)

**Goal:** AuralFM publishes a post when a station plays (opt-in).

**Acceptance criteria:**
- [ ] Settings panel adds "Connect to AT Protocol" with a single input:
      the user's app password (or full AT Protocol OAuth once it
      stabilises).
- [ ] On station play (with permission), AuralFM publishes a record:
  ```
  Now playing on AuralFM: WWOZ FM 90.7 — New Orleans, LA
  ```
  with a rich embed card carrying station name, city, genre, and the
  `auralfm://play?station=...` deep link.
- [ ] The post does **not** carry user coordinates. The geohash in the
  embed is the station's, never the listener's. Same rule as the
  Nostr presence layer.
- [ ] On disconnect, the stored credentials are deleted from disk.
- [ ] All writes are best-effort. Audio plays whether or not the post
  publishes. A failed POST is logged at most.
- [ ] `npm run audit` gets a new check: "the AT Protocol cross-post
      code path is unreachable in the offline build."
- [ ] `npm run audit` gets a new check: "the cross-post does not
      include listener coordinates."
- [ ] `npm run audit` gets a new check: "no outbound requests to
      corporate platform APIs from a built version."

**Cost:** zero. App passwords are free and scoped.

**Risk:** the AT Protocol write API surface can evolve. Pin the SDK
version in the audit.

#### Phase A2 — Verified handles (read from relays, not AppView)

**Goal:** AuralFM reads verification records from AT Protocol relays
and shows the verified handle next to the station name.

**Acceptance criteria:**
- [ ] Stations self-publish verification records to generic AT
      Protocol relays using the `fm.auralfm.verification` lexicon.
- [ ] AuralFM's station catalogue is augmented with a `verifiedHandle`
      field, populated by querying the relays AuralFM maintains a
      subscription to (default: a curated list of well-connected
      generic relays).
- [ ] The UI shows a small verified badge next to the station name.
- [ ] All reads are best-effort and cached for 7 days. A failed lookup
      is silent.
- [ ] `npm run audit` gets a new check: "verified-handle lookups do
      not happen on the offline build path."

**Cost:** zero. Relay subscriptions are free.

**Risk:** relay availability is the same problem Nostr has; the audit
gets a check that mirrors the existing Nostr relay-anchor pattern.

#### Phase A3 — Share URL (replaces direct corporate integrations)

**Goal:** AuralFM generates a share URL and a piece of share text the
user can paste into any platform they want.

**Acceptance criteria:**
- [ ] Every "Share" affordance on a station, waterfall, or shortwave
      receiver shows a modal with: a URL, a piece of text, and a
      copy-to-clipboard button.
- [ ] The URL is `https://auralfm.app/station/<id>` (a Universal Link
      that resolves to the app if installed, falls back to the web
      player).
- [ ] The text is one line: "Now playing on AuralFM: <station> —
      <location>".
- [ ] AuralFM has no idea where the user pasted it. No analytics, no
      tracking, no outbound requests.
- [ ] `npm run audit` gets a new check: "no outbound requests are
      made when the user clicks 'Copy share text'."

**Cost:** zero. No API calls.

**This is the answer to "cross-post to all the main social medias."**
The user pastes the text wherever they want; AuralFM does not care.
This achieves the goal — being visible on every social platform —
without violating the project's principles.

### 2.4 What AT Protocol does NOT buy you (unchanged)

1. **Geohash-scoped ephemeral chat.** Stays on Nostr.
2. **No-account / fresh-key-per-launch.** Stays on Nostr.
3. **Persistent identity without a server.** AT Protocol identity
   requires a PDS, which is out of scope.

### 2.5 How the AT Protocol and Nostr surfaces compose

The user-facing mental model:

- **Nostr is for chat with people who are listening to the same station
  you are.** Ephemeral, scoped to a geohash cell, throwaway keys.
- **AT Protocol is for telling your followers what you are listening
  to.** Persistent post, public timeline, opt-in, readable by any AT
  Protocol client (Bluesky, Blacksky, Flashes, Klearsky, Tokimeki,
  future forks).
- **Share URL is for everywhere else.** The user pastes wherever they
  want. AuralFM is not involved.

The three surfaces do not overlap. A user can use any subset.

---

## Part 3 — Nostr expansion

The existing Nostr work is preserved. The following expansions are
explicitly greenlit because they cost nothing and compound the existing
investment.

### 3.1 Stable identity (opt-in)

Today: fresh keypair per launch.

Tomorrow: a stable `npub` as a favorites anchor that survives
reinstall. **Opt-in** because the privacy cost is real and the user
should be shown what changes.

**Acceptance criteria:**
- [ ] Settings shows "Stable Nostr identity: enabled/disabled."
- [ ] When enabled, a keypair is generated once and stored in the OS
      keychain.
- [ ] All existing ephemeral event kinds continue to use throwaway
      keys. The stable key is used **only for**: favorites (kind 3
      or equivalent), hub memberships, profile (kind 0).
- [ ] `npm run audit` gets a new check: "stable key, when enabled,
      is never used for ephemeral kinds."
- [ ] `npm run audit` gets a new check: "stable key storage uses the
      OS keychain, not plaintext."

### 3.2 NIP-47 NWC (Nostr Wallet Connect)

A "tip this station" lightning flow without ever holding a wallet.

**Acceptance criteria:**
- [ ] Settings shows "Lightning wallet (NWC): connect." User pastes
      their NWC connection string.
- [ ] On station play (with permission), a "⚡ Tip" button appears
      next to the station name.
- [ ] Clicking opens a modal: amount, recipient (station's
      lightning address if known, else station owner's NIP-05
      handle).
- [ ] `npm run audit` gets a new check: "NWC connection string is
      stored in the OS keychain."

### 3.3 NIP-87 / blossom / NIP-96 media uploads

Currently if you screenshot the globe you have nowhere to put it.
Federated media hosting solves this.

**Acceptance criteria:**
- [ ] A "Share" affordance on stations, waterfalls, and shortwave
      receivers publishes a media embed to a blossom server.
- [ ] The blossom server list is configurable in settings.
- [ ] All uploads are best-effort. The share button does not block
      the UI.

### 3.4 NIP-65 relay directory metadata

A user can mark relays as read/write/read+write, and AuralFM respects
those marks when publishing.

**Acceptance criteria:**
- [ ] A settings panel lists the user's preferred relays and their
      read/write flags.
- [ ] AuralFM publishes its events only to relays marked write.
- [ ] AuralFM reads from relays marked read or write.

### 3.5 Cross-client composability

Already shipped, but worth listing for completeness:

- Receiving events from Damus, Amethyst, Iris, Yakihonne, Coracle.
- Receiving bitchat events from any bitchat client.
- Following other AuralFM users via NIP-02 contact lists.

These are free. They happen automatically because the protocol is
open.

---

## Part 4 — Deferred features (cost-blocked)

These are real features, parked until either the cost ceiling moves or
a sponsor is found.

### 4.1 Catalogue as a custom lexicon

Requires a PDS to publish into. Either self-host (server cost) or use
a third-party PDS (free for individuals, but tightly rate-limited and
subject to their ToS).

**Trigger:** the catalogue stops being a snapshot that needs a monthly
rebuild because the station additions from listeners become a
significant fraction of new stations.

**Alternative:** publish station records from a one-shot build-time
indexer that writes to a generic relay's authenticated write endpoint.
This keeps it free but limits publishing frequency. Real catalogues
that update frequently still need a PDS or paid hosting.

### 4.2 AuralFM as a labeler

Requires running a labeler service. The whole point of labelers is
trust, and trust requires uptime and identity.

**Trigger:** the long tail of dead streams becomes a real problem
(see `LEGAL-AND-SECURITY.md` known limits), and a community of
volunteer labelers wants to curate.

### 4.3 AuralFM as a feed generator

Requires running a feed service. Same trust/identity concerns.

**Trigger:** AT Protocol users ask for "trending stations" feeds and
discoverability becomes a real bottleneck.

### 4.4 Catalogue on IPFS

Replaces the snapshot-in-the-DMG pattern with content-addressed
distribution. The `georelays.json` pattern from the existing Nostr
code can be extended to host the catalogue.

**Trigger:** the snapshot-in-the-DMG staleness becomes a real
problem, OR a community-contributed station flow emerges that needs
decentralised distribution.

**Cost:** IPFS pinning is free for low-volume use; runs into a server
cost at scale. Mirrors can be hosted by volunteers.

### 4.5 Cross-post to corporate social media platforms

**Removed from scope.** The principle "no backend, no server,
untraceable, no corporate API dependencies" rules this out. The
**share-URL pattern** (Phase A3) achieves the same user-facing goal
without violating the principle.

If a future maintainer wants to add this back, they need to:

  1. Identify the corporate platform.
  2. Show that the integration requires no persistent user identity
     tied to AuralFM.
  3. Show that the corporate API cannot be used to deplatform
     AuralFM-style apps.
  4. Show that the integration can be turned off without breaking
     AuralFM.

Twitter/X fails all four today. The others fail #1, #3, or both.

---

## Part 5 — Open questions, restated (smaller list)

Five decisions moved from "open" to "decided" in this revision. The
remaining ones:

1. **OAuth vs. app password for AT Protocol.** App password is simpler
   and works today. OAuth is more secure but the spec is still settling.
   **Recommendation:** app password first, OAuth when stable.

2. **Whether to publish the lexicons at all in Phase A0.** Cost-free,
   but namespace-squatting without commitment can backfire. **Wait
   until Phase A1 has a build ready** so the lexicons ship with real
   consumers.

3. **The order of Phase R and Phase A.** Both can be done in parallel
   because they do not touch the same files. **Recommendation:**
   Phase R first (it's the bigger investment), Phase A interleaved
   during the React cutover because the settings panel is being
   rewritten anyway.

4. **Whether the existing `presence-nostr.js` rewrite stays a Node
   sidecar under Tauri, or moves to Rust.** Moving to Rust is faster
   but more code; keeping it as a sidecar preserves the audit suite
   intact. **Recommendation:** keep as a sidecar until Phase R2, then
   revisit.

5. **What the README looks like after both rewrites.** A new "How
   AuralFM is built" section. The honest paragraph about Tauri, the
   honest paragraph about AT Protocol as a protocol (not a company),
   the honest paragraph about why Nostr stays the chat layer, and
   the honest paragraph about why we do not integrate with corporate
   social platforms. Out of scope for this plan; document when each
   phase ships.

---

## Appendix A — Lexicon sketches (deferred)

Unchanged from the previous draft. Kept here so the proposal does not
get lost when this file is read in isolation.

```typescript
// fm.auralfm.station.record
{
  "lexicon": 1,
  "id": "fm.auralfm.station",
  "defs": {
    "main": {
      "type": "record",
      "key": "tid",
      "record": {
        "type": "object",
        "required": ["name", "city", "country", "latitude", "longitude", "streamUrl"],
        "properties": {
          "name":      { "type": "string", "maxLength": 200 },
          "callsign":  { "type": "string", "maxLength": 20 },
          "city":      { "type": "string", "maxLength": 200 },
          "country":   { "type": "string", "maxLength": 100 },
          "latitude":  { "type": "number", "minimum": -90, "maximum": 90 },
          "longitude": { "type": "number", "minimum": -180, "maximum": 180 },
          "frequency": { "type": "string", "maxLength": 30 },
          "genre":     { "type": "array", "items": { "type": "string", "maxLength": 50 }, "maxLength": 30 },
          "streamUrl": { "type": "string", "format": "uri" },
          "favicon":   { "type": "string", "format": "uri" },
          "verifiedBy": { "type": "array", "items": { "type": "string", "format": "at-uri" } }
        }
      }
    }
  }
}
```

```typescript
// fm.auralfm.verification.record
{
  "lexicon": 1,
  "id": "fm.auralfm.verification",
  "defs": {
    "main": {
      "type": "record",
      "key": "tid",
      "record": {
        "type": "object",
        "required": ["stationUri", "proof"],
        "properties": {
          "stationUri": { "type": "string", "format": "at-uri" },
          "proof":      { "type": "string", "maxLength": 200 }
        }
      }
    }
  }
}
```

## Appendix B — The cost table, locked

| Surface | Server of ours? | Corporate API? | Ongoing cost | Status |
|---|---|---|---|---|
| Tauri shell | No | No | $0 (open source) | approved |
| React views | No | No | $0 (open source) | approved |
| Apple Developer Program | n/a | n/a | **$99/yr (required for any signed macOS app)** | approved |
| Nostr chat/presence | No | No | $0 | preserved, expanding |
| Nostr NWC tips | No | No | $0 (lightning is peer-to-peer) | greenlit |
| Nostr blossom uploads | No | No | $0 (user picks server) | greenlit |
| AT Protocol cross-post | No | No | $0 (uses user's app password) | greenlit |
| AT Protocol verified handles | No | No | $0 (reads relays) | greenlit |
| Share URL pattern | No | No | $0 | greenlit |
| Cross-post to corporate social media | No | **Yes** | varies | **removed** |
| Feed generator | Yes | No | VPS + domain | parked |
| Labelers | Yes | No | VPS + domain × 3 | parked |
| PDS publishing | Yes | No | VPS or rate-limited free tier | parked |
| Catalogue on IPFS | Optional | No | free for low-volume | parked |

The plan is now a **no-new-servers, no-corporate-API plan**. Every
greenlit feature uses either an open protocol that the user participates
in or peer-to-peer networks. The Apple Developer Program remains the
only ongoing spend — and that cost would exist even if the project
shipped nothing new.

## Appendix C — On the question "should we integrate with Bluesky at all"

Direct answer:

  - **The Bluesky app may not exist in five years. AT Protocol probably
    will.** Integrating with AT Protocol is betting on an open spec,
    not on a company.
  - **The same protocol lets AuralFM station records show up in
    Blacksky, Flashes, Klearsky, Tokimeki, and any future client.**
    You are not building for Bluesky's users specifically. You are
    building for any user of any AT Protocol client.
  - **The cost ceiling is preserved.** No server of ours, no
    corporate API, no dependency on Bluesky-the-company persisting.
  - **The risk is that AT Protocol as a public spec with active relays
    and clients stops being a thing.** That is a much lower
    probability than "Bluesky the company folds," and even if it
    happens, the published records are still CIDs anyone can read.

The honest framing is in the README when this ships:

  > AuralFM publishes station records to AT Protocol, the open social
  > protocol that powers Bluesky, Blacksky, and other clients. We do
  > not depend on Bluesky the company — we depend on the protocol and
  > on the network of relays that hold records. If the Bluesky app
  > disappears tomorrow, our records are still there. If a new client
  > we have never heard of launches next year, it can read them.