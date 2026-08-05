# AuralFM — roadmap

> A window onto the world you can listen to.

Status as of 3 August 2026. This is the plan of record; GitHub issues are the
detail. Kept in the repo so it survives, and mirrored into the vault so it
survives the repo.

---

## 0. The thing that is actually blocking everything

**Nobody else can install this app.**

There is no code signing (#4) and no release (#14), so AuralFM has exactly one
user. Every feature below is being built for an audience of one until those two
land, and both need an Apple Developer account — which is the maintainer's to
buy, not an engineering task.

This is stated first because it is easy to keep adding surface and hard to
notice that none of it has reached anyone. A quieter app that ten people can
install beats a richer one that nobody can.

---

## 1. Shipped

The app is real and does these things today.

**Listening**
- 38,342 internet radio stations, 837 borrowed KiwiSDR shortwave receivers
- Real shortwave tuning: the EiBi schedule, 9,289 broadcasts resolved to what is
  transmitting *this minute*, ranked by where it is aimed and whether the band
  is open
- Bandwidth and fine-tune controls; the digital modes as a band group
- Favourites, from the lists and at the transport

**The globe**
- Photoreal Earth, correct day/night terminator, live cloud cover
- City lights at 8192×4096 from NASA Black Marble
- Real sky: 5,044 stars, 89 constellations with names, the ecliptic, the zodiac,
  the naked-eye planets computed for right now
- Satellites, the ISS with a recorded track, aircraft near the focus
- WSPR propagation arcs, space weather, receiver and station dots

**Being not alone**
- Geohash presence and public chat over Nostr, on bitchat's shared convention
- Geo-aware relay selection: 328 peers seen where three hardcoded relays saw 16

**The position**
- Offline-first. No backend of our own. Collects nothing.
- Seven palettes, five languages, `npm run audit` with eleven checks

---

## 1b. Also shipped since this was written

- Waterfall spectrum display, bandwidth and fine tuning, moved out of the
  menu-bar popover into the main window
- A drawn icon set — no Apple emoji, no font dependency, no SF Symbols licence
- First-run walkthrough, four cards
- Transport bar down from nine elements to five; the headline ticker deleted
  because the pop-out card already did that job better
- Read-outs moved onto the globe and rewritten to lead with where you are looking
- The rail stopped flinching as the globe turns — measured at zero pixels of
  movement across eight places
- Live captions: complete plumbing, and a measurement saying the hardware cannot
  carry it yet (RTF 6.61 for `base` on an i5-8257U). See §3.

---

## 2. Next — small, and each one finishes something already started

| | Why now |
|---|---|
| **Gossip-style history on join** | You currently see only what arrives live, which is why a populated room still feels dead. bitchat keeps 6 hours; we keep nothing. This is the single biggest perceived-quality win in the chat. |
| **Proof-of-work on send (NIP-13)** | We share a public channel with anyone and have no spam answer. Not urgent at this traffic; embarrassing at ten times it. |
| **Panic wipe** | Trivial, and it makes the privacy claim demonstrable rather than merely true. |
| **A layer inspector** | Day/night, clouds, satellites, aircraft, WSPR, presence, constellations — and cables, sound maps and the NASA layers still to come. That is a control surface being kept in a menu because it arrived one item at a time. One button, closed by default, *before* the next layer lands. |
| **Audit the stylesheets too** | The duplicate-block check has caught copied JavaScript twice and missed the dial's CSS being pasted twice, because it only reads `<script>`. |
| **Local headlines, properly** | 58 countries have a local edition; everything else falls back to US news. A reader view for the linked article was asked for and is not built. |

---

## 3. Then — bigger, and each needs a decision first

**Undersea cables** — blocked on TeleGeography's answer, not on engineering.
The request is drafted at `docs/telegeography-request.md`. There is no
alternative source: OpenStreetMap has zero submarine cables.

**Sound maps** — ambient field recordings, weather, wildlife, keyed to place.
Fits the tagline better than anything else on this list. Researched:

| Source | Verdict |
|---|---|
| **iNaturalist** | **The one to use.** Keyless API, 1,774,860 geolocated observations with audio, and — critically — `sound_license` filters. **233,926 are CC0, CC-BY or CC-BY-SA**: commercially usable with attribution. Every record carries coordinates, species and licence. |
| Xeno-canto | v2 API retired (404), v3 requires a registered key (401). A key means shipping a secret or asking users for one, which cuts against the position. Excellent data, wrong access model for us. |
| Freesound | API requires a key (401). Same objection. |
| Radio Aporee | Field recordings, but no JSON API found — the map is the interface. Would need scraping, which is a different kind of relationship with a volunteer project. |

The shape that fits: a layer that, for the place under the globe, offers what it
*sounds* like when nobody is broadcasting — the birds that live there. It is the
same move as the shortwave schedule: replace "a place" with "what is actually
happening there right now". Attribution per recording is required and easy,
since the API returns the licence and the recordist with every result.

**More satellites and debris** — Celestrak refused our probe outright and has
IP-blocked us once. Route through the existing backoff and cache, or not at all.

**Live captions, when the hardware can carry them.** Whisper runs on-device over
WebAssembly and works — it is simply too slow here. `base` is RTF 6.61 on a 2019
Intel Mac and `tiny` is 2.59, where anything above 1.0 cannot keep up. Threads are
unavailable because a `file://` page cannot be cross-origin isolated. Three
routes: a custom protocol with COOP/COEP headers, Apple Silicon, or native
whisper.cpp. Whatever ships must **benchmark the machine before offering the
feature** rather than let someone enable captions and watch words arrive a minute
late.

**An SDR dongle** — the honest answer to "radio when the grid is down", and
the real version of the Meshtastic instinct. It is hardware, not Bluetooth.

*Is the holdup the MacBook or the software?* **The MacBook.** There is no
receiver in it to program. The Wi-Fi and Bluetooth chipsets are fixed-function
parts locked to their own bands with no raw sample access, and HF is nowhere
near them. No amount of application code invents an antenna. This is a missing
peripheral, not a missing feature.

But the obvious dongle is the wrong one:

| | Covers | Note |
|---|---|---|
| Plain RTL-SDR (~$30) | ~24 MHz – 1.7 GHz | **Does not receive shortwave.** Broadcast HF is 3–30 MHz, below its floor. |
| RTL-SDR Blog V3/V4 (~$40) | + HF via direct sampling | Works, and is mediocre at it. The cheapest real answer. |
| SDRplay RSP1B (~$110) | 1 kHz – 2 GHz, 14-bit | Proper HF coverage. |
| Airspy HF+ Discovery (~$170) | HF/VHF, purpose-built | The one that actually sounds good on shortwave. |

And the part everyone underestimates: **the antenna matters more than the
dongle.** The whip in the kit hears almost nothing at 7 MHz. A random wire
outdoors is the actual requirement, and it is what separates this from a
desk toy.

*Software side — how much is already there?* More than expected, and the
missing piece is specific. `rtl_tcp` streams IQ over a TCP socket, and this app
already speaks a socket protocol to a remote receiver, decodes a framed audio
format and draws a waterfall. Pointing that machinery at `localhost` is the
same shape as pointing it at a KiwiSDR.

The gap is that **a KiwiSDR sends demodulated audio and `rtl_tcp` sends raw
IQ.** So AM and SSB detection, filtering, AGC and decimation would have to be
written here rather than borrowed. That is a few hundred lines of known DSP,
not research — but it is the whole job, and it is not "wire up a dongle".

Two constraints that are easy to miss:

- **`librtlsdr` is GPL-2.0.** Same category of problem as Meshtastic (#28).
  Talking to the `rtl_tcp` binary over a socket keeps it at arm's length —
  separate process, no linking — but that means requiring or shipping a
  separate install, which is a real wrinkle for a signed and notarised Mac app.
- **USB access needs entitlements**, which needs the Apple Developer account.
  This stacks on #4 rather than routing around it.

*The cyberdeck.* Viable, and the canonical build — Pi 5, dongle, display,
printed case. The honest caveat is that AuralFM is Electron with a three.js
globe on an 8192×4096 texture. A Pi 5 will run it and will not run it *well*.
That is a port with real work in it, not a copy.

**The ordering objection.** All of the above is cheap — a dongle and a couple
of weekends. It is still the wrong next thing while nobody can install the app.
A radio nobody has is not more useful than a client nobody has.

---

## 4. Monetisation — decided (#15)

**Free app on every platform, forever. A $5/month supporter tier delivered
entirely outside the application — early builds, a badge and a private channel in
Buzz — plus a one-time option and an optional venue licence. Normal processor and
crypto both. Direct download, never the App Store.**

What is sold is the project's independence, not a feature. The app never learns
that anyone paid, because nothing it does depends on knowing. Full reasoning and
the arithmetic are in `docs/BUSINESS.md`.

### The older notes, kept


**The shape is now decided even though the price is not: Obsidian's model.** The
app free, local, and accountless; anything paid an optional service you can
decline without losing the product. It maps here almost without translation
because the constraint that makes it work for Obsidian is one we already have —
the app is genuinely useful with nothing switched on and nobody logged in. The
discipline that comes with it: **the free app never gets worse to make the paid
thing attractive.** Reasoning and the ranked options are in `docs/BUSINESS.md`.

What is *true*:

- The app has no server costs. There is no bill forcing a business model, which
  is a luxury and should be treated as one.
- Palettes are already split free/premium in the code. That is the cheapest
  possible test and it costs nothing to run.
- **The moment money is involved, three licences need re-checking:**
  - **The Noun Project icons — settled.** Both #1654366 and #1654367 were
    bought on 4 Aug 2026 ($4.99 each); certificates are in `assets/licenses/`
    and the invoices in the vault. Each shipped file was rasterised and compared
    against the licensed original rather than trusted by filename — 0.07% and
    0.01% ink difference respectively. The one live constraint: Noun Project caps
    resale at **1,000 units per licence purchased** (Terms §3.A), which is
    irrelevant to a free app and directly relevant to a paid one. Both licences
    are also **non-exclusive**, so neither glyph can ever be a registrable mark.
  - **TeleGeography** — still unanswered.
  - **Any CC-BY-NC source** that has quietly crept in.
- Sponsorship is the option most aligned with the position. `docs/SPONSORSHIP.md`
  has the playbook.

What would be *against* the project's own claims: anything that requires an
account, anything that phones home to count you, and anything that puts the
shortwave or the chat behind a paywall — those are the parts that make the
argument, not the parts that make money.

---

## 5. Not doing, and why

- **Meshtastic integration.** GPL-3.0 top to bottom including the protobufs, no
  dual licence offered, and it needs the listener to own LoRa hardware. #28.
- **Embedding a Matrix client.** Apache-2.0 and legally clean, but it requires a
  homeserver and a persistent registered identity — the opposite of the
  accountless design that makes the privacy claim true. #28.
- **Decoding FT8/WSPR ourselves.** wspr.live already does it, which is what a
  network of receivers is *for*.
- **Natal charts.** The astronomy is in; the astrology is a different product
  with a different truth claim.
