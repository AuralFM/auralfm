# AuralFM — legal exposure and security posture

Written 4 August 2026, before any public release. Two questions that had never
been asked together: what could stop this being distributed, and what is the
attack surface of an app that has no backend.

**This is engineering analysis, not legal advice.** Everything below is either
read out of the code or cited to a source. Three items at the end genuinely need
a lawyer, and they are marked.

---

## The short version

| | Risk | Status |
|---|---|---|
| Transmitting without a licence | **None** | The app receives. It has no transmitter and never will without hardware. |
| Divulging intercepted communications (47 U.S.C. §605) | **Low** | Broadcast, amateur and distress traffic are explicitly exempt, and the app never publishes what it hears. |
| Station data licensing | **None** | Radio Browser data is public domain. |
| Streaming other people's audio | **Low** | The app is a client. The station holds the licence, as with any browser. |
| Open-source notice compliance | **Fixed, with one judgement call** | `THIRD-PARTY-NOTICES.md` credits nine components including Electron and Chromium, ships in the app, and is audit-checked. Chromium's 19 MB third-party set is linked rather than embedded — a deliberate choice, see below. |
| Copyleft creeping in | **Fixed** | `npm run audit` walks the production tree, the vendored bundle and Electron, and fails on any licence outside a permissive allowlist. 51 packages, all MIT/ISC/Apache-2.0/BSD/0BSD/Unlicense. |
| **What licence AuralFM itself is under** | **Fixed** | `LICENSE` granted MIT while `docs/TERMS.md` — shipped — forbade redistribution. Settled 8 August 2026 in favour of the licence: **MIT, open source.** The terms were the document that had to change. Audit-checked across all four statements, in both directions. Not lawyer-reviewed. |
| **Cleartext receiver list over HTTP** | **Real, unfixed** | The KiwiSDR list is fetched over `http://` and cannot be fetched over HTTPS. |
| Unmoderated public chat | **Medium** | No hosting liability, but an App Store age rating problem. |
| Privacy | **Strong** | Fresh key each launch, nothing persisted, no account, no backend. |
| Unsigned binaries | **Blocking** | #4. Users cannot verify what they run. |

---

## 1. Radio, and the FCC

**The app has no transmitter.** Everything it does is receive-only, and most of
what it receives arrives over the internet rather than over the air. There is no
Part 15 device, no equipment authorisation, no station licence, nothing the FCC
issues.

The one statute that actually bears on this is **47 U.S.C. §605** (Communications
Act §705), which prohibits *divulging or publishing* the contents of intercepted
radio communications. Listening is not the offence — divulging is. And §605
carves out, in terms, any communication

> transmitted by any station for the use of the general public, which relates to
> ships, aircraft, vehicles, or persons in distress, or which is transmitted by
> an amateur radio station operator or by a citizens band radio operator.

That covers essentially everything AuralFM touches: shortwave *broadcasting* is
by definition for the general public, WSPR and the digital modes are amateur,
and ADS-B relates to aircraft. ([DOJ Criminal Resource Manual
1066](https://www.justice.gov/archives/jm/criminal-resource-manual-1066-interception-radio-communications-47-usc-605),
[47 U.S.C. §605](https://uscode.house.gov/view.xhtml?req=granuleid%3AUSC-prelim-title47-section605&num=0&edition=prelim))

**Where to stay careful.** The schedule includes utility and aeronautical
stations, which are *not* "for the use of the general public". Receiving them is
still fine; the exposure would be in publishing their content. The app never
does — audio is played to one listener and nothing is recorded, uploaded or
shared. The one feature that could change that is captions: a transcript is a
written record. It stays on the machine and is never transmitted, which is the
right design, and it should stay that way for legal reasons as well as the
privacy ones already documented.

**If the RTL-SDR happens** (roadmap §3), none of this changes. A receiver is
still a receiver. The only new question would be whether a 3D-printed cyberdeck
containing a dongle is a "device" requiring authorisation — it is receive-only,
so almost certainly not, but that is a question for whenever it stops being
hypothetical.

---

## 2. Content and rights

**Streams.** The app plays stream URLs from a public directory. It does not
re-encode, re-transmit, proxy or record. Legally it occupies the same position as
a web browser pointed at the same URL: the station holds whatever performance
licences its jurisdiction requires. radio.garden has operated on this model for
years. Risk is low and would land on the station, not on us — **provided** the
app never introduces a proxy or a recorder. Both would change the analysis
materially.

**Station data.** Radio Browser publishes the catalogue as **public domain**, and
explicitly permits use "in free and non-free software". The *server* software is
AGPL-3.0, but the app does not run it — only the data is used, and the data is
not under the AGPL. ([Radio Browser API](https://api.radio-browser.info/),
[docs](https://docs.radio-browser.info/))

**Everything else in the data layer**, and why each is clear: the EiBi schedule
is distributed for free use; NASA Black Marble and NOAA space weather are US
government works and public domain; WSPR is community-published; the ITU band
plan is a published allocation table.

**The icons** are licensed and documented at `assets/ATTRIBUTION.md` — both
bought 4 Aug 2026, with certificates in `assets/licenses/`. The live constraints
there are the 1,000-unit resale cap and the non-exclusive licence, neither of
which bites while the app is free.

**Borrowed receivers.** The KiwiSDRs belong to volunteers who left them open.
There is no contract and no terms of service to breach, which is precisely why
the etiquette matters more than the law: this project has already knocked three
of them offline by over-probing. That is not a legal exposure. It is a
reputational one, in a small community that will notice.

---

## 3. Licensing — what was out of compliance, and what still is

### AuralFM's own licence: was contradictory, now MIT

`LICENSE` carried an **MIT License** — which grants any recipient the right to
copy, modify, publish, distribute, sublicense and sell — while `docs/TERMS.md`,
which **ships inside the app**, said:

> The software itself is **not open source**. You may not redistribute it, sell
> it, rent it, sublicence it, publish it, decompile or reverse-engineer it, or
> make derivative works from it.

Two documents granting and withholding the same rights, both reaching users, with
`THIRD-PARTY-NOTICES.md` — also shipped — siding with the MIT one. Ambiguity in a
licence grant tends to be construed against the drafter.

Settled 8 August 2026 in favour of the licence: **AuralFM is open source under
MIT.** `docs/TERMS.md` was the document that had to change — its licence-grant
section now states the MIT rights plainly and says that where anything in the
terms could be read as narrowing the licence, the licence wins. The rest of that
document is descriptions and disclaimers, not conditions on the right to the code.

The reason is the project's own thesis rather than an obligation to anyone. Nothing
in the dependency tree requires it: BitChat, whose conventions AuralFM adopted, is
under **The Unlicense** — a public-domain dedication with no reciprocity clause at
all — and all 51 shipped packages are permissive. AuralFM claims to have no backend
of its own and to collect nothing. In a closed binary those are promises; open,
they are checkable, and an unverifiable privacy claim is marketing.

Two things MIT does **not** cover, and both matter:

- **The name.** A fork is free and welcome; a fork presented as AuralFM is not.
  The trademark, not the licence, is what protects that — which moves the filing
  from optional to load-bearing.
- **One-way.** A version released under MIT stays MIT for that version. This is
  not a decision to revisit casually.

`npm run audit` asserts all four statements agree — `LICENSE`, `docs/TERMS.md`,
the notices preamble and `package.json` — and is written to fail just as loudly if
a proprietary notice reappears. Verified in both directions.

### Third-party notice compliance: the npm tree is covered

The app bundles **@noble/curves, @noble/ciphers, @noble/hashes and satellite.js**
and vendors **globe.gl, three.js and three-globe**. Every one is MIT, which is
about as permissive as licences get — and MIT still says:

> The above copyright notice and this permission notice shall be included in all
> copies or substantial portions of the Software.

`THIRD-PARTY-NOTICES.md` is generated by `scripts/notices.mjs`, reproduces each
licence in full from the package's own LICENSE file rather than paraphrasing the
`license` field, ships in the bundle, and is reachable in the app under
**Settings → About → Open source licences**.

Two audit checks guard it: the notices file must not be stale, and every runtime
dependency must be credited. The second exists because `@noble/ciphers` shipped
uncredited and `@noble/hashes` was required directly while undeclared.

### Dependency licences: now checked

`npm run audit` walks what actually ships — the production dependency tree, the
vendored `globe.gl` bundle (a UMD file with its subtree inlined) and Electron —
and fails on any licence outside a permissive allowlist: MIT, MIT-0, ISC,
BSD-2-Clause, BSD-3-Clause, Apache-2.0, 0BSD, CC0-1.0, Unlicense, BlueOak-1.0.0,
Python-2.0. SPDX expressions are evaluated properly: `(MIT OR GPL-3.0)` passes
because MIT can be chosen, `(MIT AND GPL-3.0)` fails because both apply. A
package with no `license` field fails.

An allowlist rather than a denylist, so a licence nobody has considered stops the
build and gets a decision instead of sailing through. Deliberate acceptances go in
an `EXCEPTIONS` map with the reason; it is empty today.

51 packages, all permissive. GPL-3.0 was refused once — Meshtastic, #28 — on
somebody remembering to look. That is now a control rather than a habit.

### Chromium: notice shipped, third-party set linked

Electron bundles Chromium, whose BSD-3-Clause requires the copyright notice, the
conditions and the disclaimer to be reproduced in binary redistributions. As of
8 August 2026 this was shipping in no build at all — the app bundle and both DMGs
contained zero licence files.

Now shipped:

- **Chromium's own notice, verbatim**, in `THIRD-PARTY-NOTICES.md`, reachable in
  the app under **Settings → About → Open source licences**. Kept exactly as
  Chromium publishes it, comment markers and all — it is distributed as a C++
  header block, and "reproduce" argues against reformatting a legal notice.
- **The exact version it belongs to**, Chromium 150.0.7871.212 for Electron 43.3.0.
- **Links to the full third-party set** for this precise build: the Electron
  release that contains `LICENSES.chromium.html`, and the Chromium source at the
  matching tag.

Provenance is recorded in `assets/licenses/chromium-notice.json` — source URL at
the tag, fetch date, sha256, and the command to refresh it.

**The judgement call.** The full third-party credits are 19 MB, about 6% of the
installed app. This build links them rather than embedding them. Whether a link
satisfies "provided with the distribution" is unsettled; embedding the file would
remove the question at that cost. The decision is recorded here rather than
buried, and it is on the list for legal review.

**Two audit checks guard it.** The recorded Electron version must match the
installed one — an Electron upgrade changes the Chromium version, and a notice
naming the old one is worse than none because it looks finished. And the notice
text must reach `THIRD-PARTY-NOTICES.md` verbatim, so a placeholder cannot ship.

## 4. Privacy — what actually leaves the machine

The position is *"Offline-first. No backend of our own. Collects nothing."* That
is true, and stronger than most apps could claim. Verified in the code:

- **The chat identity is a fresh key every launch.** `src/presence-nostr.js`:
  `randomSecretKey()` on first use, never written to disk, never requested from
  the user. Two sessions cannot be linked to each other.
- **Location is deliberately coarse.** Geohash precision 4 — roughly a 20 km
  cell, a province rather than an address — and the constant is commented as a
  privacy dial.
- **Nothing is collected** because there is nowhere to collect it to.

**What is nevertheless true and should be said plainly:** an app with no backend
still makes outbound requests, and every host on the other end sees an IP
address. There are about twenty across the whole app —
NOAA, Open-Meteo, CoinGecko, wspr.live, Celestrak, SatNOGS, NASA GIBS,
Google News, the BBC, Al Jazeera, France 24 and DW world feeds, Hugging Face, jsDelivr, the Nostr relays, and whichever KiwiSDR is
tuned. Most are tied to a feature and only fire when it runs.

The honest framing, which `docs/PRIVACY.md` mostly already makes: *we* collect
nothing, and that is a much stronger claim than *nothing is observable*. Nobody
can build a profile from these requests without correlating across a dozen
unrelated operators — but "no backend" should never be allowed to slide into
"no network".

**The one worth watching** is presence. Publishing a geohash to public relays
is, by design, a public act: the cell and a pubkey are visible to anyone reading
those relays. The ephemeral key is what keeps this from being a tracking
mechanism, and it should never become persistent as a convenience — a durable
pubkey plus a geohash history is a location trail, published, forever.

---

## 5. Security

Never previously reviewed, so this is a first pass, ordered by severity.

### The receiver list is fetched over cleartext HTTP — *unfixed*

`src/sdr.js` fetches `http://rx.linkfanel.net/kiwisdr_com.js`. Anyone able to
modify traffic — hostile Wi-Fi, a compromised router — can rewrite that response
and choose which hosts the app connects to.

**Impact is bounded but real.** The app opens a WebSocket and parses IMA-ADPCM
audio and waterfall bytes; it does not execute anything from that host. So the
worst case is a receiver you did not choose, and your IP disclosed to whoever
substituted it. Not code execution.

**Why it is not a one-line fix:** the host does not serve HTTPS at all — measured,
the connection fails outright. So the options are to validate the parsed entries
much harder (hostname shape, port range, plausible coordinates), pin a snapshot
and treat the live list as an optional refresh, or find another source. The
snapshot already exists as `data/sdr.min.json`, which makes the third option
mostly free.

`src/iss.js` has the same cleartext problem against `api.open-notify.org`, with
far less impact — it is a fallback for a pair of coordinates.

### Unsigned binaries — *blocking, tracked as #4*

Without code signing there is no way for anyone to verify that a downloaded
AuralFM is the one that was built. That is a bigger deal for this app than for
most, because the whole pitch is *trust us, there is nothing to steal* — and an
unsigned binary asks for exactly the trust the design was meant to make
unnecessary.

### What is already right

Verified rather than assumed:

- **Every window is `contextIsolation: true`, `nodeIntegration: false`**, with the
  preload as the entire API surface.
- **The article resolver is properly caged.** It is the one place the app loads
  a third-party web page, and it runs offscreen with `sandbox: true`, images
  disabled, the hostname restricted to `news.google.com`, an eight-second budget,
  and the window destroyed either way.
- **Chat cannot inject anything.** Messages from strangers go through
  `textContent` and `createTextNode`; no message content ever reaches `innerHTML`.
  Every `innerHTML` in the renderers writes a static skeleton that is filled with
  `textContent` afterwards — a deliberate pattern, and consistently applied.
- **Icons are set from a fixed table**, so a station name cannot become markup.
- **The captions runtime is hash-pinned** before anything is written or executed,
  with the download performed in the main process so the renderer's CSP never has
  to open up to a CDN.
- **Panic wipe** clears storage, cache and the whole of userData.

### Worth doing, not urgent

- No `will-navigate` / `setWindowOpenHandler` guard. Nothing currently navigates
  the main windows, but a guard is cheap insurance against a future feature.
- No dependency vulnerability check in CI. `npm audit` in `npm run audit` would
  cost nothing.
- The `auralfm://` URL scheme is registered; its handler should be reviewed as an
  untrusted input path before release.

---

## 6. What actually needs a lawyer

Four things:

1. **The MIT licence and the terms sitting beside it.** `LICENSE` is MIT and
   `docs/TERMS.md` was rewritten to stop contradicting it, both by an engineer and
   not a lawyer. The specific thing worth a read is whether the terms still narrow
   the grant anywhere by implication — the intent is that they do not, and the
   document says the licence wins, but intent is not the same as drafting.
   Releasing under MIT is also irreversible for that version.
2. **The 1,000-unit Noun Project resale cap**, if the app is ever sold. §3.A is
   ambiguous about what "an item for resale" means for software, and getting it
   wrong is cheap to avoid and expensive to discover.
3. **Unmoderated public chat and unfiltered radio, in an app store.** There is no
   hosting liability — the messages ride other people's relays and are never
   stored by us — but Apple's age-rating and objectionable-content rules are a
   different question from the law, and they gate distribution.
4. **The privacy policy as a published promise.** `docs/PRIVACY.md` is accurate
   today. Once it ships as the app's public policy it becomes a representation,
   and representations are enforceable in a way that documentation is not.

---

## 7. Before release

In order:

1. ~~`THIRD-PARTY-NOTICES.md`, shipped and linked from About.~~ **Done** —
   generated, seven packages with full licence texts, in the bundle, and
   audit-checked. AuralFM's own licence was contradictory and is now MIT; that one
   still wants a lawyer.
2. Decide the KiwiSDR list question — hard validation, or lean on the bundled
   snapshot.
3. Code signing and notarisation (#4).
4. Add `npm audit` and a licence check to `npm run audit`.
5. Read the privacy policy once more as a lawyer would, not as an engineer.

---

> **Removed 7 Aug 2026.** Captions are no longer in the app. Enabling them
> once downloaded about 1.3 GB of model weights that nothing ever cleaned up,
> on a project whose whole argument is that it runs on hardware people already
> own. The design, the measurements and what would have to change are in
> [`CAPTIONS.md`](CAPTIONS.md).
