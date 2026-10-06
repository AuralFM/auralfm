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
Google News, the BBC, Al Jazeera, France 24 and DW world feeds, the Nostr relays, and whichever KiwiSDR is
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

## 8. Before people speak, tip or broadcast (26 Sept 2026)

The catalogue is becoming ours (tens of thousands of stations, with their websites,
socials and logos), people talk in the chat, and tips and broadcasting are on the
roadmap. That moves AuralFM from "a player" towards "a service", and a service has
duties. None of this is legal advice; items marked **lawyer** want one.

**Done in this pass**

- **Code of Conduct** (`docs/CODE-OF-CONDUCT.md`), published at /conduct/ on both
  sites and linked from the Terms: what is not welcome, mute, word list, how to
  report, and what we honestly cannot do (delete from Nostr relays).
- **Terms**: child safety (zero tolerance, NCMEC), stations' corrections and
  removal, a copyright notice procedure with the six elements § 512(c)(3) asks
  for, 13+ for the waitlists too, station names and logos shown only to identify.
- **Privacy**: the Children section no longer says "collects no information from
  anyone" while the waitlists collect names and emails; under-13 sign-ups are
  deleted.

**Only Melton can do (needs his name, address or payment)**

- [x] **Registered 4 Oct 2026: DMCA-1081921** (service provider Melton Bell;
      agent "Copyright Agent, AuralFM"; hello@auralfm.xyz). The agent is in the
      Terms' Copyright section. **Renew by 4 Oct 2029** (it lapses after three
      years), and amend ($6) if the address, phone or names change. The bare
      domain auralfm.xyz was not among the alternate names; add it at the next
      amendment. Original note: Register a DMCA designated agent at the Copyright Office's
      [DMCA Designated Agent Directory](https://www.copyright.gov/dmca-directory/).
      $6, renewed every three years. It matters now, not later: the safe harbour
      covers "directories and other information location tools", which is what
      AuralFM is (§ 512(d)). The agent may use a P.O. box; the service provider
      must give a street address unless a safety waiver is granted. Use
      hello@auralfm.xyz as the email so it matches the Terms. When registered, add
      the agent's name and address to the Copyright section of the Terms.
- [ ] **Register with NCMEC as an electronic service provider** (CyberTipline
      ESP registration), so a report can be filed the day one is needed. The duty
      in 18 U.S.C. § 2258A applies to providers with actual knowledge; AuralFM
      hosts no chat messages today, but profiles and broadcasts will change that.
      **Applied 5 Oct 2026** (contact hello@auralfm.xyz); waiting on NCMEC to
      approve the account. Tick this when the approval arrives.

**Before station profiles and tips ship** — **lawyer**
- Tips go wallet to wallet (Lightning), to an address the station published
  itself, verified by the station's own domain. AuralFM never holds, pools or
  forwards money: holding it for others is money transmission.
- Terms section for tips: irreversible, between you and the station, not a
  donation to AuralFM, not tax-deductible.

**Before anyone broadcasts** (the AzuraCast plan, BROADCAST.md) — **lawyer**
- Music rights: a show that plays recorded music needs performance licences
  (in the US: ASCAP, BMI, SESAC, GMR for the compositions; SoundExchange for the
  recordings). Decide whether AuralFM carries them or each broadcaster must.
- AGPL-3.0 obligations for the AzuraCast fork (publish changes, keep notices).
- Takedown for live content, repeat-infringer policy (§ 512(i)), and a real
  moderation team before strangers can go live.

**Before an AuralFM social network** (SOCIAL.md, on the roadmap, not started)
- Moderation (a labeler), 13+ age gate at sign-up, NCMEC registration done,
  Terms and Privacy rewritten for accounts, emails and public posts.

---

## 9. The big broadcasters' streams (26 Sept 2026)

Melton asked whether AuralFM is in bounds playing the big groups' stations
(iHeartMedia, SiriusXM, Sinclair and the like), which will never claim a page
because they want listeners in their own apps. Not legal advice; **lawyer**.

**What is in the catalogue**, counted by the server each stream comes from:
NRJ 553, iHeartMedia 529, Bauer 268, Global 165, Radio France 61, BBC 7 — about
1,600 of 62,036 stations. **No SiriusXM**: it is a paid subscription, and a
subscription stream must never be added (anything that shows up is a restream
someone had no right to make).

**What AuralFM does with them.** It lists the station and, when you press play,
your device connects to the broadcaster's own public stream. AuralFM does not
host, record, re-stream or proxy the audio (the web version proxies headlines
only), puts no ads around it, and credits the play to radio-browser.

**iHeart's Terms of Use** forbid linking beyond the homepage of an iHeart *site*
and framing it, and scraping for AI. No clause was found that forbids a
third-party player from playing its public streams. But the streams are served
for iHeart's own players, and iHeart can object at any time; if it does, the
station comes off the same day (below).

**The real exposure is the UK and the EU, not a terms page.** In *Warner Music v
TuneIn* [2021] EWCA Civ 441 the Court of Appeal held that TuneIn, by linking UK
listeners to foreign stations **not licensed for the UK**, communicated the
recordings to a new public and infringed copyright. Stations licensed in the UK
were not the problem. AuralFM links UK and EU listeners to music stations from
everywhere, which is the same shape. The US has no equivalent ruling; linking is
generally treated there as not itself a copy.

**What is already in place**
- Stations are removed on request, the same day: `data/corrections.json` with
  `"remove": true` (scripts/review.mjs), applied on every build.
- A copyright notice procedure in the Terms; a DMCA agent to register (§8).
- No recording, no re-streaming, no subscription streams, no ads.

**What happened to TuneIn afterwards.** The High Court ruled in 2019, the Court of
Appeal upheld it in March 2021. From autumn 2020 TuneIn blocked most non-UK
stations for UK listeners, marked "not supported"; a VPN brought them back. The
court's point: a station licensed in its own country is not thereby licensed for
the UK, so an index that makes it easy for UK listeners to reach it needs a UK
licence for that. In the EU the test is the CJEU's (the Court of Appeal applied
it): linking to freely available, authorised content is fine (*Svensson*, 2014);
linking to unauthorised content infringes when you know or should know, and
knowledge is presumed when you link **for financial gain** (*GS Media*, 2016).

**How AuralFM is funded matters here, and being open source does not settle it.**
AuralFM is not selling memberships: it is an open source project funded like one
(Open Collective, Liberapay, GitHub Sponsors), and supporters may get discounts or
features. What that changes and what it does not:
  - Infringement does not need profit. Making a work available to a "new public"
    is the act, whoever does it and whatever the code's licence. TuneIn lost on
    what its service did, not on its business model. An MIT licence covers our
    code, not the music in other people's streams.
  - It does change *GS Media*'s presumption. Plain gifts (Liberapay, sponsorships
    with nothing in return) are the weakest case for "financial gain". Perks for
    paying supporters (features, discounts) look more like a sale, and the closer
    they get to "pay for more listening", the more they look like one.
  - It changes who would be sued and what it would cost: the damages a court
    would award against a free, volunteer-funded project are smaller, and
    collecting societies rarely start with one. That lowers the odds; it does
    not make the use lawful.
  - It changes the licence price (below): PPL and PRS price by revenue and
    listening, and PPL's standard licence excludes services funded by
    subscription or by a single sponsor or donor.
  - A fiscal host (such as Open Source Collective) holds the money, and it can
    ask about legal risk before or after it takes a project on.
  - Wording: say "supporters" or "sponsors", never "subscribers" or "members"
    who "unlock" listening. Keep every station free to hear; put the perks on
    things that are ours (profiles, themes, badges, early features).

**The options, in detail**

*1. Carry on, and honour every removal request at once (today).*
Everything stays listed and playable everywhere. The protection is speed: a
station, a label or a collecting society asks, and the station comes off the
same day (`data/corrections.json`, `"remove": true`, applied on every build and
then published). Add: a register of requests and actions (date, who, which
stations, when removed), which is what a court would ask to see; the DMCA agent
(§8); and a line in the Terms that rights holders can reach us at hello@. Cost:
none. Risk left: a UK or EU claim like TuneIn's is about the index as a whole,
not one station, so takedowns answer individual complaints but not that claim.
Reasonable while AuralFM is small and funded by gifts; less so once supporter
perks are live (GS Media's "financial gain").

*2. Open the big groups' own players instead of playing them in-app.*
For the ~1,600 streams of NRJ, iHeartMedia, Bauer, Global, Radio France and the
BBC, "play" opens the station's own website or app (we have their websites)
instead of the stream. AuralFM stays the map; the listening happens on their
turf, which is what they want, and it removes their reason to object. Cost: a
change to the play button for a list of stream hosts, kept in one file; those
~2.6% of stations stop playing inside AuralFM. Does not answer the UK/EU
problem, which is about labels' recordings on any foreign music station, big or
small.

*3. Leave foreign music stations out for UK and EU listeners.* **Chosen, 26 Sept
2026, and live** (src/region.js; the UK, the EU and the EEA; held stations stay
listed and say "Not available where you are yet"). A UK listener keeps 5,846:
2,346 UK stations and 3,500 talk, news, sport and faith stations with no music.
What TuneIn did, and what Radio Garden does: UK listeners there hear UK stations
only. For an EU listener it is their own country (with its overseas parts)
plus the same speech stations. The hard part is knowing where the listener is without a server:
  - desktop: the time zone (Europe/London) is a guess, not a location; it is
    wrong for travellers and anyone who sets their clock otherwise;
  - web: the same guess, or an IP lookup through a third party (a privacy cost
    the Privacy Policy would have to name), or asking the listener;
  - a VPN defeats all of it, as it did for TuneIn, and courts accepted that.
This is the most protective and the most against what AuralFM is for: the pitch
is hearing a place as it sounds to itself, from anywhere.

*4. Licences.*
In the UK two bodies license music: PPL (the recordings, for labels and
performers) and PRS for Music (the songs, for writers and publishers). Both are
needed; one does not cover the other.

PPL's 2026 Linear Webcast Licence does publish prices, in its fee summary rather
than on the web page: **per channel, per year**, £207 up to 150,000 streams
(Band 1, UK only), £345 up to 270,000 (Band 2), and £691 recouped against
£0.00138 a stream above that or for any service reaching more than the UK
(Band 3, plus an admin fee for international royalties). A "stream" is one
track to one listener. PRS for Music's small online licence (the LOML, for
services under £12,500 a year in revenue) starts at a few hundred pounds a year.

None of it fits AuralFM as written:
  - it licenses **your own channel**: a station that transmits. AuralFM has no
    channel; it points at 62,036 of other people's. Per channel, that would be
    62,036 × £207 = about £12.8 million a year, which is not what anyone means;
  - it excludes services funded by subscription, or by a single sponsor or
    donor, and anything with pause or rewind;
  - it covers PPL's recordings for the territories you pay for, not the world.

So this is a conversation, not a form: PPL's own document says to email
linearwebcast@ppluk.com (or its Broadcast Licensing team) when a service does not
fit. A draft of that question is in the vault (`PPL-PRS-ENQUIRY.md`). In the EU
the same, per country or through societies that license several territories.
Cost: money every year and listening reports. It is the one path that lets UK
and EU listeners hear everything.

*5. Close AuralFM to the UK and the EU until one of the above is settled.*
Stricter than TuneIn, which kept UK stations and speech. Everything else about
option 3 applies (how to tell where the listener is, VPNs). It is the one option
that removes the UK/EU exposure outright, at the cost of every listener there,
including those listening to their own country's stations, which carry no
TuneIn-style risk at all. Option 3 gets nearly all of the protection for much
less.

**What to take to a lawyer** (a UK media and IP solicitor for 3 and 4; a US
one for the DMCA side):
- Does *Warner v TuneIn* reach an index that is free, non-commercial today, and
  plays streams directly from the stations' own servers? Does that change the day
  supporter perks start, or with gifts only (Open Collective, Liberapay, GitHub
  Sponsors)?
- Is honouring removals (1) enough while AuralFM is in private beta, and until
  when?
- For (2): does opening the station's own site instead of playing its stream
  remove the "communication" on our side?
- For (3): is a time-zone guess a reasonable measure, or would a court expect IP
  location?
- For (4): what would PPL and PRS ask of a service that transmits nothing, and
  what does that cost at our size?
- Bring: this section, §8, the Terms, the Privacy Policy, the catalogue counts,
  and how play works (the station's own stream, straight to the listener).

Sources: [Tunein v Warner Music [2021] EWCA Civ 441](https://www.bailii.org/ew/cases/EWCA/Civ/2021/441.html) ·
[iHeart Terms of Use](https://www.iheart.com/content/terms-of-use/) ·
[PPL 2026 Linear Webcast Licence fees](https://www.ppluk.com/wp-content/uploads/2025/11/PPL-Linear-Webcast-Licence-Fees-and-Reporting-Summary-2026.pdf) ·
[PRS Limited Online Music Licence](https://www.prsformusic.com/licences/using-music-online/limited-online-music-licence)

## 10. A catalogue of our own (26 Sept 2026)

**What it was.** The catalogue began as a crawl of radio.garden's directory:
38,337 stations with their names, towns and coordinates, filed under
radio.garden's own ids. The desktop resolved every one of them through
radio.garden's listen endpoint, which answers only requests that look like its
own website, so the app sent a borrowed Chrome User-Agent and radio.garden's
Referer to get through; the web app used the same endpoint as a fallback.

**Why it mattered.** Two things, apart from the plain courtesy of it:
  - Getting past a block that a site put there on purpose is the part a
    complaint would lead with, and in some places it is more than a terms-of-use
    matter.
  - radio.garden is Dutch, and the EU gives a *database right* (Directive
    96/9/EC) to whoever invested in obtaining, checking or presenting a
    database, against the extraction of a substantial part of it — even where
    each fact in it (a station's name, its town, its stream) is free. The US has
    no such right: facts are free there (*Feist*, 1991).

**What was done** (scripts/own.mjs; Melton: "completely separate"):
  - Neither app contacts radio.garden at all. A station plays from radio-browser
    by its id there, else from the stream we recorded by contacting the station,
    else from the last address that worked; nothing sends a borrowed header. An
    audit check fails if any code the apps run names radio.garden.
  - A station stays only where something other than radio.garden confirms it:
    radio-browser.info lists it (public domain; the same stream or the same
    name), or the station answered us itself: its own stream and its own website,
    or a stream that names the station. Of 38,337, 36,266 stayed (16,857
    confirmed by radio-browser, 19,409 by the station); 2,071 went, listed in
    the vault's own-dropped.csv. With radio-browser's other stations the
    catalogue is 60,096.
  - Every station has an AuralFM id; radio.garden's are gone from everything
    shipped. Old favourites find their station again by name.
  - Every town comes from GeoNames (CC BY 4.0), found by name within the
    station's country; radio.garden's coordinates are never read. 11,315
    places; 959 of our stations went to "Somewhere in <country>" where GeoNames
    had no town of that name (the review sheet can move them).
  - Our own stations are now tracked in the repository (data/catalogue.json),
    because that list exists nowhere else; builds start from it.

**What is left for the lawyer.** The names and towns of the stations radio.garden
listed first were a starting point, re-confirmed one by one from other sources.
Whether a list rebuilt that way still counts as extraction from the original is
the question to ask (a Dutch or EU IP lawyer, with §9's UK one): bring this
section, scripts/own.mjs and the counts. Radio.garden remains credited as the
inspiration it was.

---

> **Removed 7 Aug 2026.** Captions are no longer in the app. Enabling them
> once downloaded about 1.3 GB of model weights that nothing ever cleaned up,
> on a project whose whole argument is that it runs on hardware people already
> own. The design, the measurements and what would have to change are in
> [`CAPTIONS.md`](CAPTIONS.md).

## 11. Donations and payola (26 Sept 2026)

Stations now get a **Donate** link to their own donation page (a 501(c)(3)
like 8-Ball Radio, or a college or community station's own page), beside or
instead of a Lightning tip. Melton asked that this be checked against payola.
Not legal advice; the questions at the end are for the lawyer.

**What payola is.** Two sections of the Communications Act. §508 (47 U.S.C.
508) requires anyone who pays, or promises to pay, to get something *put on
the air* to disclose it before broadcast, ultimately to the station; §317
requires the station to announce on air that the matter was paid for. Failing
to is "payola": up to $10,000 and a year. Both are written for broadcast
stations and the people paying them. By their terms they do not reach internet
radio carried only online, and they do not reach AuralFM at all, which
broadcasts nothing (FCC: Payola and Sponsorship Identification; Cornell LII).
A station on AuralFM that is also on air remains bound by them for what it
airs, as it always was.

**Where the real risks for AuralFM sit instead:**

1. **Paid placement without a label (FTC).** The FTC treats advertising that
   is not clearly distinguished from ordinary results as potentially deceptive
   (its 2013 letters to search engines, and the 2023 Endorsement Guides on
   "material connections"). For AuralFM that would be a station paying, tipping
   or donating to move up the globe, the lists, search or the shuffle. **The
   rule, written into docs/STATIONS.md:** nothing a station gives changes where
   it appears, and anything ever sold (a sponsored feature) is labelled as paid
   where it appears. Sponsors (§9) fund AuralFM; they buy no placement either.
2. **"Pay to request a song."** A feature where a listener's tip gets a record
   played would put the *station* in §317 territory if it is on air, and would
   make AuralFM the one arranging paid airplay. Do not build it. Tips and
   donations are gifts to a station, not payment for what it plays.
3. **Noncommercial stations.** College and community FM stations are usually
   noncommercial educational licensees (47 CFR 73.503): listener donations are
   exactly how they are meant to be funded, but they may not air promotional
   announcements for for-profit businesses in return for money. AuralFM adds
   nothing to their streams, so this stays theirs.
4. **Charitable solicitation.** About 40 states regulate soliciting charitable
   gifts. California's law on online "charitable fundraising platforms" (AB 488,
   in force since 2023) covers sites that "perform, permit, or enable" online
   solicitation for charities, and the sources seen do not say whether a plain
   link to the charity's own page counts. AuralFM's design keeps it as far from
   this as it can: no money, no donor data, no fee, no cut, just a link, said
   so on the card. Whether a Donate button is still "enabling" is question 1
   below.
5. **Sanctions.** As with tips, no Donate link for stations in Cuba, Iran,
   North Korea or Syria (the audit checks it).

**What was built to stay on the right side:** the link opens the station's own
page (or its fiscal sponsor's page for it), https only; the note under it says
AuralFM takes no part and no cut and that giving changes nothing about where
the station appears; a station's own claim wins over anything crawled; a list
checked by hand (data/donate.json) covers sites the crawl cannot read; paid
memberships ("supporters", "membership") are not treated as donations.

**For the lawyer:**

1. Does showing a Donate link to a charity's own page make AuralFM a
   "charitable fundraising platform" under California AB 488, or a solicitor
   under any other state's act, when it handles no money and no donor data?
2. Same question for the Lightning tip button (§8), where the recipient is
   usually not a charity.
3. When sponsorship (§9) starts: the wording and placement of a "sponsored"
   label that meets the FTC's clear-and-conspicuous standard in the app.

Sources: FCC, Payola and Sponsorship Identification
(https://www.fcc.gov/general/payola-and-sponsorship-identification); Cornell LII,
sponsorship disclosure (https://www.law.cornell.edu/wex/sponsorship_disclosure);
FTC, 2013 search-engine advertising guidance
(https://www.ftc.gov/news-events/news/press-releases/2013/06/ftc-consumer-protection-staff-updates-agencys-guidance-search-engine-industry-need-distinguish);
FTC Endorsement Guides, 2023
(https://www.ftc.gov/news-events/news/press-releases/2023/06/federal-trade-commission-announces-updated-advertising-guides-combat-deceptive-reviews-endorsements);
FCC, noncommercial nature of educational broadcasting
(https://www.fcc.gov/media/radio/nature-of-educational-broadcasting);
Ironwood Registrations on California's platform law
(https://www.ironwoodregistrations.com/californias-law-online-platforms/);
Fractured Atlas, 8 Ball Community Inc.
(https://fundraising.fracturedatlas.org/8-ball-community-inc).
