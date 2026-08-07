# AuralFM

**A window onto the world you can listen to.**

*Aural* — of or relating to the ear, and the sense of hearing.

![The globe, with Tokyo selected and a station playing](docs/media/01-hero.png)

Open it and the Earth is there — real weather moving across it, the day/night line
where it truly is, the ISS overhead, the actual planets behind. Click anywhere and
hear what that place is listening to right now.

**38,342 radio stations across 12,296 places in 227 countries, around 800
shortwave receivers you can borrow, and the ionosphere drawn over the top of it.**

The stations are streams. The shortwave receivers are somebody's actual antenna,
in somebody's actual garden, and the signal reaches it off the ionosphere with no
company anywhere in the middle. That is the one part of this that is not a CDN.

**Offline-first. No backend of our own. Collects nothing.** The station catalogue
lives on your machine; search, browse and the globe all work with the network
unplugged. There is nothing to sign into, nothing that reports back, and nobody
keeping a list of what you played.

*Said precisely, because the precise version is the stronger one:* the stations
themselves are stream servers — you need a connection to hear audio, and that is
true of every radio app there is. What is unusual here is that everything **around**
the audio is yours already. See [docs/DECENTRALIZATION.md](docs/DECENTRALIZATION.md).

Inspired by [radio.garden](https://radio.garden) — Jonathan Puckey's, and the
thing that kept pulling me back to Tokyo, Kenya, Iceland, South Africa. Started
because Apple is winding down radio support in Shortcuts and Apple Music, and
grown well past it.

**The reason it has no backend is not thrift.** Everyone building with AI coding
tools right now runs into the same wall: the fast part is the front end and the
dangerous part is the back — secrets, breaches, data you did not mean to keep, a
server you now have to defend. So this was built to answer that directly. The
station catalogue is a public dataset. NASA gives away the Earth, NOAA the space
weather, volunteers the receivers, and the chat rides other people's relays.
**Nothing to breach, because nothing is held.** See
[`docs/VISION.md`](docs/VISION.md).

```
┌────────────────────────────────┐
│  AuralFM                       │
│  ┌──────────────────────────┐  │
│  │  Search 38,342 stations  │  │
│  └──────────────────────────┘  │
│  Favorites                     │
│  1   KEXP 90.3 FM              │
│      Seattle WA · United St…   │
│  2   WWOZ FM 90.7              │
│      New Orleans LA · jazz…    │
│  ────────────────────────────  │
│  ⏸   WWOZ FM 90.7    ──●────   │
│      New Orleans LA            │
└────────────────────────────────┘
```

---

## Requirements

- macOS
- [Node.js](https://nodejs.org) 18+ (developed on 24)

## Getting started

```bash
git clone https://github.com/meltonbell3/auralfm.git
cd auralfm
npm install
```

The station catalog is **not** in the repo — it's generated, ~2.7 MB, and
reproducible. Build it once (~50 minutes, one time):

```bash
npm run crawl     # radio.garden -> data/stations.json + stations.min.json
npm run tags      # fold in radio-browser genre tags
npm run crawl:sdr # kiwisdr -> data/sdr.min.json, the receiver list
npm run icons     # rasterize assets/*.svg, and build build/icon.icns
npm start         # run it
```

`crawl:sdr` takes seconds — it is one request to an aggregate list, never to the
receivers themselves. `crawl` is the slow one.

The globe opens on launch. Close it and AuralFM keeps playing from the menu bar —
right-click the tray icon for **Open the Globe**, **About**, **Open at Login** and
**Quit**.

### Just trying it out?

`npm run crawl -- --limit 300` builds a usable catalog in about two minutes. The
receiver bundle is committed, so shortwave works immediately either way.

## What it does

![The shortwave view: what is transmitting this minute, ranked by whether the band is open](docs/media/02-shortwave.png)

*Adachi, Tokyo — 628 of 1,191 scheduled broadcasts, on the bands that are open
right now. Note Sound of Hope on 9540 kHz and CNR1 Firedrake on 9535: a jammer
and its target, five kilohertz apart, both on the same list.*

### Listening

- **Any station in the world** — 38,342 channels across 12,296 places in 227 countries.
- **Around 800 shortwave receivers.** The count moves every week, because people
  plug a receiver in and take it down again. Click an amber dot and you are listening to a real
  antenna in Trondheim, or Christoval, or a Cold War coastal fortress in Sweden.
  Bands are ordered by whether that path is likely open right now, because
  shortwave propagation depends on whether the path is in daylight — and the globe
  already knows where the terminator is.
- **Real tuning, not band centres.** The shortwave list is the EiBi schedule —
  9,289 broadcasts a season, resolved to whatever is transmitting *this minute*
  in UTC, with the language and where it is beamed. Tuning "New Zealand" gets you
  RNZ Pacific on the frequency it is actually using this hour, not the middle of
  the 31 m band and a hiss. Ranked by whether the signal is pointed at that
  receiver, then by whether the band is open.
- **A waterfall.** The spectrum around what you are tuned to, so you can see the
  carrier, the neighbour 5 kHz away, and the fifteen-second stripes of FT8. It
  is what makes the filter width mean something.
- **Bandwidth and fine tuning.** AM at ±2000, ±3500 or ±4900 Hz; 100 Hz steps,
  10 Hz on sideband. The default clears the adjacent carrier — on a band where
  channels sit 5 kHz apart, a wider filter lets both neighbours in and their
  carriers beat into a whistle, which is the sound of a station that is *nearly*
  tuned.
- **31 bands**, including seven amateur bands, morse, and the digital modes —
  FT8, FT4, PSK31 and the WSPR beacons the propagation arcs are drawn from. We
  do not decode them; the point is that you can hear them, and a good evening on
  14.074 MHz is one of the strangest sounds on shortwave.
- **Aviation on HF.** Out over an ocean an aircraft is beyond VHF range and talks
  to the ground on shortwave. Tune *Shannon VOLMET* from Iceland and you hear the
  weather being read for transatlantic flights.
- **It tells you why a band is dead.** Bands are ordered by daylight, solar flux
  and geomagnetic activity — the operator's actual rule of thumb — and a closed
  band says which one it failed. *"solar flux 127 is too low for 28.4 MHz"* is a
  different thing from a greyed-out row that could just be broken.
- **Add a station AuralFM doesn't have.** The catalogue is a snapshot; your local
  station might not be in it. Add it, and it lives on your machine.
- **Search** by station, city, country, or genre. "jazz new orleans" works.
- **Favorites** with `1`–`9` hotkeys, and **Lock** to browse the world without
  changing what you're hearing.

### The globe

- **A real Earth in real space** — actual satellite imagery and a day/night
  terminator computed from the sun's true position.
- **City lights**, from NASA's Black Marble at 8192x4096. The night side is not
  a dark texture; it is where people are, down to individual towns along a
  motorway.
- **A named sky.** 5,044 catalogued stars and 89 constellations, labelled in
  whatever language the app is running — so it says *that is Orion* rather than
  drawing a shape and leaving you to guess.
- **The zodiac as the fact it is.** The ecliptic — the plane of the solar system
  seen edge-on from inside it — is drawn across the sky, and the twelve figures
  the Sun passes through are brightened against it. The planets sit visibly on
  that line, which is the explanation for both the zodiac and the word *planet*.
  Ophiuchus is drawn like any other figure and is not in the twelve, because the
  zodiac is twelve for Babylonian reasons rather than astronomical ones.
- **The five naked-eye planets**, where they actually are tonight.
- **Live cloud cover** — GOES geostationary imagery refreshed every 10 minutes over
  a daily global pass, so the weather on the globe is the weather that is up there.
- **The ISS and the Chinese space station**, live, named, with their ground tracks.
- **The ionosphere, drawn.** WSPR is a worldwide network of amateurs
  transmitting tiny beacons and reporting everything they hear, so every report
  is a statement that a signal left one grid square and arrived in another, just
  now. Drawn as arcs bowing off the surface — because that is what the signal
  did — with brightness following signal-to-noise. Rome to New Zealand is 18,512
  km and it is on the globe right now.
- **Aircraft near where you are looking** — optional, capped, and off by default.
- **Other listeners and their messages**, if you switch it on — see below.
- **Live local conditions** — pick a place and see its weather and local time, so
  you know it is 53°F and overcast at 12:45 AM where the station is.
- **Somewhere it is the middle of the night.** Before you pick anything, the rail
  offers the places currently in the small hours — the overnight shows, the hours
  radio keeps to itself. Pick a town with one station and it offers the
  neighbours instead of a blank panel.

### The app

- **The globe is the app** — a standalone window, with a menu bar companion that
  keeps playing when the window is closed. It hides, it doesn't stop.
- **Seven colour schemes** — onyx and bone by default — five interface
  languages, an appearance override, an increased-contrast mode and adjustable
  dot sizes. A palette colours the things *around* the planet; the Earth is real
  satellite imagery and is never recoloured.
- **Now playing in the menu bar**, with media key support.

### Other listeners, and talking to them

Off by default, because it is the only thing in AuralFM that sends anything.

Switched on, and only while something is playing, it announces the **station's**
location — rounded to a four-character geohash, about 20 km — over public
[Nostr](https://nostr.com) relays, and offers a chat scoped to that cell. Other
listeners appear as slow pulsing rings on the globe.

- **Never your location.** The coordinates are the station's, the same rule the
  weather already follows.
- **No account.** The keypair is generated when the app opens and thrown away
  when it closes. A stable key would make you the same person across sessions.
- **No server of ours.** Relays are other people's and interchangeable.
- **Said precisely:** it uses an *ephemeral* event kind, which relays are asked
  not to retain. That is a SHOULD in the spec, not a MUST — testing found an
  announcement replayed after the fact — so the payload is built to be worthless
  if kept rather than relying on the promise.

- **Somebody else's convention, on purpose.** The first version used an event
  kind picked because nothing else used it, which is exactly why it was empty —
  a private room, correctly built, with nobody in it. It now speaks
  [bitchat](https://github.com/permissionlesstech/bitchat)'s geohash format,
  which is public domain and already has people using it. Every message we send
  carries their `teleport` tag, because the cell is always the *station's* and
  never the listener's: somebody in Houston listening to Rio appears in Rio's
  channel, and without that tag it would read as a claim to be standing there.
- **Relays are chosen by distance.** A conversation in Rio lives on the relays
  near Rio; three hardcoded servers saw 16 people where a geo-aware list saw 328.
  The directory is [georelays](https://github.com/permissionlesstech/georelays),
  MIT, 411 relays with coordinates.

Honest expectation: **inhabited, but quiet.** Hundreds announce presence; actual
conversation is thin. It is a room with people in it rather than an empty one,
which is a different and better problem.

## Keyboard

| Key | Action |
|---|---|
| `space` | Play / pause |
| `1`–`9` | Play that favorite |
| `esc` | Clear the search, or close the popover |
| `return` | Play the first search result |

## How it works

Two directories, joined at build time, so the app depends on neither at runtime.

```
BUILD TIME
  radio.garden ──── geography ────┐
   12,296 places, all with coords │
                                  ├──> data/stations.min.json  (2.7 MB)
  radio-browser ──── genres ──────┘
   61,520 stations, 11,777 tags

  rx.kiwisdr.com ── receivers ────────> data/sdr.min.json      (98 KB)
   every listed shortwave site, all with GPS

RUN TIME
  Search + Explore read the local bundles.       (no network)

  Press play on a station -> resolve the stream URL:
    1. radio.garden listen endpoint (302 -> real stream)
    2. radio-browser, matched on name + country
    3. last-known-good URL cached on disk
    0. a station you added yourself skips all of it — you gave us the URL

  Press play on a shortwave band -> connect straight to that receiver:
    ws://host/kiwi/<ts>/SND, IMA-ADPCM, decoded in the browser
```

Neither directory is queried while you browse, and playback survives both being
unreachable once a station has played at least once.

**Why two sources?** radio.garden has coordinates for every place but no genre
data at all. radio-browser has 11,777 genre tags but coordinates for only 22% of
its stations. Neither is sufficient alone.

**Being a good API citizen.** radio-browser's docs ask clients to report each
play so their popularity ranking stays meaningful, so AuralFM calls
`/json/url/{uuid}` whenever a station starts (fire-and-forget — it can never
affect playback). It sends a descriptive `User-Agent`, and discovers mirrors via
`/json/servers` rather than pinning one host.

**Weather** comes from [Open-Meteo](https://open-meteo.com) — chosen because it
needs no API key, so a fresh clone has working weather with nothing to sign up
for. It is the one live thing in an otherwise offline-first app, so it is
strictly best-effort: cached for 10 minutes, and silent on failure. Only the
selected city's coordinates are sent, never the user's location.

**The live layers, and what each one costs somebody.**

```
  wspr.live        propagation arcs      one aggregated query / 3 min
  NOAA SWPC        solar flux, Kp        every 20 min
  adsb.lol         aircraft near view    every 12s, only while the layer is on
  Coinbase         crypto ticker         one WebSocket
  a KiwiSDR        shortwave audio       only when you click that receiver
  Nostr relays     other listeners       only if you switch presence on
```

Every one is free, most are run by volunteers, and none of them is load-bearing:
the globe, the catalogue and search work with all of it unreachable.

**Being a good guest.** Every live service here is free and most are run by
volunteers. Each one gets a contactable `User-Agent`, a cache, and an exponential
backoff on failure. That discipline is not decorative — AuralFM once retried a
failed Celestrak fetch every 30 seconds and got its IP blocked for a day, which
is why `src/backoff.js` exists and why `npm run audit` checks that every polled
service has a cooldown. The shortwave receivers get stricter rules again:
never auto-connect, one session at a time, never retry a refusal, never enumerate
them.

**Why a native app instead of a web page?** 47% of the most-played radio streams
are served over plain `http://`. A page served over HTTPS cannot play them —
mixed-content blocking kills them silently. A native shell has no such limit.

![The layer inspector](docs/media/03-layers.png)

*Everything the globe draws, and what it costs. Aircraft and WSPR are dimmed
because they are off by default — both poll a volunteer service, so they are
something you ask for rather than something you have to notice and switch off.*

## Project layout

```
src/
  main.js              tray, popover, Explore window, IPC
  preload.js           the entire renderer API surface (context-isolated)
  catalog.js           bundle loading + ranked search        (main process)
  resolver.js          3-tier stream URL resolution          (main process)
  weather.js           current conditions via Open-Meteo      (main process)
  sdr.js               shortwave receiver list                (main process)
  wspr.js              propagation reports -> arcs            (main process)
  space.js             solar flux and geomagnetic activity    (main process)
  flights.js           aircraft near the view, capped         (main process)
  presence-nostr.js    optional presence over Nostr, no server(main process)
  mystations.js        stations you added yourself            (main process)
  docs.js              in-app documentation, allowlisted     (main process)
  palettes.js          colour schemes
  i18n.js              interface strings, 5 languages
  backoff.js           shared failure cooldown
  renderer/
    popover.html       menu bar player — the only thing that makes sound
    explore.html       the globe
    settings.html      appearance, colour, language, your stations, help
    kiwi.js            KiwiSDR protocol + IMA-ADPCM decoder
    astro.js           planetary positions (JPL elements)
scripts/
  crawl.mjs            radio.garden -> station bundle (resumable)
  crawl-sdr.mjs        kiwisdr -> receiver bundle
  tags.mjs             radio-browser genre tags -> bundle
  audit.mjs            pre-flight checks (npm run audit)
  make-icons.js        SVG -> PNG via Electron (keeps alpha)
assets/                source icons + attribution
data/                  generated bundle (gitignored)
phase0/index.html      the original single-file prototype
```

### Documents

Eight documents are readable **inside the app**, under Settings → Help, with
full-text search across all of them — the three marked ● below, plus
[`docs/RECEIVERS.md`](docs/RECEIVERS.md),
[`docs/CAPTIONS.md`](docs/CAPTIONS.md),
[`CONTRIBUTING.md`](CONTRIBUTING.md),
[`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) and
[`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md).

That list is an allowlist in `src/docs.js` rather than a directory scan, because
the strategy documents in this table live in the same folder and a glob cannot
tell the difference between `RECEIVERS.md` and `BUSINESS.md`.

| | |
|---|---|
| [`PLAN.md`](PLAN.md) | The full design record — what was measured, what was decided, why |
| ● [`docs/DECENTRALIZATION.md`](docs/DECENTRALIZATION.md) | What "offline-first, no backend, collects nothing" can honestly carry, and what it cannot |
| [`docs/PRODUCT.md`](docs/PRODUCT.md) | Positioning as a standalone app; what remains |
| ● [`docs/PRIVACY.md`](docs/PRIVACY.md) | Everything stored locally, everything any third party sees |
| ● [`docs/TERMS.md`](docs/TERMS.md) | Plain-language terms |
| [`docs/SPONSORSHIP.md`](docs/SPONSORSHIP.md) | The sequence for funding this, and what it is and isn't worth |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | What is next, what is refused, and why |
| [`docs/DECK.md`](docs/DECK.md) | The pitch narrative, on SCQA |
| [`docs/INTERFACE.md`](docs/INTERFACE.md) | Where the interface outgrew its plan, and what to do about it |
| [`docs/VISION.md`](docs/VISION.md) | Why this exists, in the maintainer's own account |
| [`docs/DIRECTION.md`](docs/DIRECTION.md) | Where this is going, and the two proposals that were refused |
| [`docs/LISTENING.md`](docs/LISTENING.md) | The critique this product has to answer, and the three ways it does |
| [`docs/IDENTITY.md`](docs/IDENTITY.md) | The mark, the colour, and the icon measured against the system |
| [`docs/BUSINESS.md`](docs/BUSINESS.md) | Free forever, and how support works without collecting anything |
| [`docs/LEGAL-AND-SECURITY.md`](docs/LEGAL-AND-SECURITY.md) | Regulatory exposure, licence obligations, and the security posture |
| [`docs/COMMUNITY.md`](docs/COMMUNITY.md) | The Buzz community — channels, pinned posts, and the agent |
| [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md) | Full licence texts for everything shipped, vendored or fetched |

## Scripts

| Command | What it does |
|---|---|
| `npm start` | Run the app |
| `npm run crawl` | Build the station catalog (resumable, safe to Ctrl-C) |
| `npm run crawl -- --build` | Rebuild bundles from existing progress, no network |
| `npm run tags` | Join radio-browser genre tags onto the catalog |
| `npm run icons` | Regenerate PNGs from `assets/*.svg` |
| `npm run crawl:sdr` | Refresh the shortwave receiver list |
| `npm run schedule` | Rebuild the EiBi shortwave broadcast schedule (seasonal) |
| `npm run relays` | Rebuild the geo-located Nostr relay directory |
| `npm run sky` | Rebuild the star, constellation and name bundle |
| `npm run lights` | Fetch NASA Black Marble and build the city-lights texture |
| `npm run audit` | Pre-flight checks for the traps this codebase has fallen into |
| `npm run check` | Report how stale the station catalogue is |

## Status

| | State |
|---|---|
| Player, menu bar shell, catalogue, search, favourites | ✅ |
| Explore — list and globe | ✅ |
| Day/night, live clouds, real sky, planets, ISS | ✅ |
| Shortwave receivers, aviation HF, 31 bands | ✅ |
| Real shortwave tuning from the EiBi schedule | ✅ |
| Waterfall, bandwidth and fine tuning | ✅ |
| City lights, named constellations, ecliptic and zodiac | ✅ |
| WSPR propagation arcs, space weather | ✅ |
| Presence and geohash chat over Nostr, off by default | ✅ |
| First-run walkthrough | ✅ |
| Drawn icon set — no emoji, no font dependency | ✅ |
| Waterfall spectrum, dial in the main window | ✅ |
| Live captions | Runs, but too slow to be live on 2019 Intel — see below |
| Settings — appearance, contrast, dot size, language, palettes | ✅ |
| User-added stations | ✅ |
| Aircraft layer | ✅ |
| Third-party licence notices, generated and shipped | ✅ |
| Receiver list hardened against substitution | ✅ |
| Code signing and notarisation | Needs an Apple Developer account |
| Downloadable release | Blocked on signing |

### What it costs, and what it will never cost

**The app is free on every platform, forever. No limits, no sign-up, no paid
tier, and no advertising — not in the app, not on the site.**

There is nothing to buy because there is nothing that could be sold without
breaking the promise. To put a feature behind a paywall the app would have to
know whether *you* paid, and every way of knowing that means an account, a
licence key tied to a purchase, or a server to ask. That is why the palette
paywall that used to sit dormant in the source was deleted rather than switched
on.

Support, if it happens, is a donation that the application never learns about —
handled entirely outside it, unlocking nothing. What it buys is the thing
Obsidian describes better than we could: staying user-supported and **free from
investor influence**. See [`docs/BUSINESS.md`](docs/BUSINESS.md).

Distribution is direct download, never an app store, on desktop.

### Where to find other people

The community runs on **Buzz** at `auralfm.communities.buzz.xyz` — which is built
on Nostr, the same protocol the app's own presence and chat already use. That is
why it is there and not on Discord: the community and the product sit on the same
rails. Four channels, described in [`docs/COMMUNITY.md`](docs/COMMUNITY.md).

**The honest headline: nobody but the author can install this yet.** There is no
signing and no release, so every feature above has an audience of one until those
land — and both need an Apple Developer account rather than any more code. A
quieter app ten people can install would be worth more than a richer one nobody
can. See [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Known limits

- **Moonlight isn't modelled.** The terminator follows the real sun. The moon's
  position and phase are computed and shown, but the Earth is not lit by it —
  real moonlight is ~400,000× dimmer than sunlight and would be invisible next to
  the night-lights texture.
- **66% of stations have no genre tags.** A genre query only finds a station if
  radio-browser knew it *and* the two directories could be matched confidently.
  Aggressive matching would raise coverage by putting wrong genres on real
  stations, which isn't a trade worth making.
- **Some stations block browser playback.** SomaFM, for one, serves curl happily
  but returns 403 to anything sending a browser `Origin`. Expect roughly 5% of
  streams to be dead or blocked at any given time.
- **The catalog is a snapshot, not a subscription.** Stations come and go; re-run
  `npm run crawl` every few months.
- **Unsigned.** Gatekeeper will complain until the app is signed and notarised.
- **The interface is mid-rework.** This began as a menu-bar player and became a
  standalone app with a globe, a receiver, a spectrum display and a chat. Each
  addition was reasonable; the accumulation was not. The dial has moved out of
  the popover and the ticker and prices out of the transport bar — see
  [#29](https://github.com/meltonbell3/auralfm/issues/29) and
  [`docs/INTERFACE.md`](docs/INTERFACE.md) for what is left: rail structure, and
  a layer inspector before the next map layer lands rather than after.
- **No spam defence in chat.** We share a public channel with anyone. bitchat
  uses optional proof-of-work; we implement none. Fine at this traffic,
  embarrassing at ten times it.
- **Live captions do not keep up on older hardware.** Whisper runs entirely on
  your machine — there is no cloud speech API, because sending the audio
  somewhere would mean the app transmits what you are listening to. The cost is
  speed. Measured on an Intel i5-8257U, single-threaded WebAssembly: `whisper-base`
  takes **39.6 seconds** to transcribe six seconds of audio (RTF 6.61), and
  `whisper-tiny` **15.5 seconds** (RTF 2.59). Anything above 1.0 cannot keep up.
  WASM threads would help and are unavailable — `SharedArrayBuffer` needs
  cross-origin isolation, which a `file://` page cannot have. The feature is off
  by default and the plumbing is complete; it wants Apple Silicon, a custom
  protocol with COOP/COEP headers, or native whisper.cpp. See
  [#30](https://github.com/meltonbell3/auralfm/issues/30).
- **Shortwave receivers are volunteers' machines.** AuralFM connects only when you
  click one, one at a time, never retries a refusal, and never scans them. If a
  receiver is busy, that is a person's hardware being used by somebody else.
- **Presence is an empty room.** It works — verified between two instances across
  three relays — but nobody else is running AuralFM yet, and geotagged Nostr
  traffic generally is thin. It seeds a convention rather than joining one.
- **Propagation arcs are the loudest paths, not all of them.** Around 30,000 WSPR
  spots arrive every ten minutes; the globe draws the 260 longest, because the
  short domestic hops would be specks and the long paths are the ones saying
  something about the ionosphere.
- **The band outlook is a rule of thumb, not a propagation model.** It answers
  "is this worth tuning", not "will this specific path open".
- **Stocks are dormant.** There is no keyless real-time equity source — Yahoo,
  Stooq and CNBC were all re-probed and all refuse. Crypto is genuinely live over
  Coinbase's keyless feed; equities light up only if you set `AURALFM_STOCK_KEY`.

## Siri and Shortcuts

AuralFM registers an `auralfm://` URL scheme, so any Shortcut that opens a URL can
drive it — which is how you get "Hey Siri, play KEXP" back.

| URL | Does |
|---|---|
| `auralfm://play?station=KEXP` | Play the best match for a station name |
| `auralfm://play?place=Reykjavik` | Play the top station in a place |
| `auralfm://pause` | Pause / resume |
| `auralfm://next` | Next favorite |
| `auralfm://open` | Open the popover |

**Making a Shortcut:** Shortcuts → new shortcut → *Open URLs* → paste one of the
above → name it "Play KEXP". Saying that name to Siri now runs it.

Station and place names are matched with the same ranking the in-app search uses,
so "kexp", "wwoz" and "new orleans" all work without being exact.
## Why this exists

I have been fascinated by radio communication for as long as I can remember —
shortwave, CB, all of it. I have a vivid memory of my great-grandmother and
grandfather listening to police scanners. For years my alarm for school was not
an alarm at all; it was the radio coming on, and what came out of it was the Tom
Joyner Show. That is the first thing I heard most mornings of my childhood.

Somewhere along the way radio stopped being the thing everyone shared and became
something closer to underground. Meanwhile the platforms that replaced it got
worse at the one job they took over: discovery. And the feeds got louder, more
political, more exhausting — a wall of propaganda and tension with no obvious way
through it.

Radio is a strange refuge from that. It is harder to fake. A station is a real
transmitter in a real place, playing for people who are actually there, and you
can hear the difference. The curation is human. The energy is honest. You can
tell what a place sounds like at 3am.

[radio.garden](https://radio.garden) showed me what that could feel like. From
Texas I could listen to what was on in Tokyo, or Iraq, or India. The connection
only ran one way — nobody on the other end knew I was there — and it still meant
something to me.

At the same time I was watching what Block and Jack Dorsey have been building
toward for years, and what is happening around Nostr and decentralized systems
generally. I think where society is heading, applications like these are going to
matter more, not less.

So this is the simple thing nobody thinks about, because it has always been
there. Radio is overlooked precisely because it never left. AuralFM is an attempt
to make it visible again: see the globe, see how enormous society is, see the
thousands of stations and hundreds of shortwave receivers scattered across it —
and then just listen. Connection by audio, with nothing in the middle that has to
know who you are.

### The name

**Aural** — *of or relating to the ear, or the sense of hearing.* From the Latin
*auris*, ear.

I have been circling this idea for years under that word. An earlier version was
going to be a live conversation app, built around the same frustration: the audio
platforms that got big were shaped by what kept people on them, not by what was
worth hearing, and the people making the thing got the least out of it.

That app isn't this one. This one has no hosts, no rooms, no feed and nobody to
monetise. But the thesis survived the change of form intact — **audio as
connection, with no algorithm deciding what reaches you and no platform standing
between you and the person transmitting.** Radio already worked that way before
anyone built a platform. It still does.

*— Melton Bell*

---

## Credits

- Station geography: [radio.garden](https://radio.garden)
- Shortwave receivers: the [KiwiSDR](http://kiwisdr.com) community, and the
  operators who pay for the bandwidth
- Orbital elements: [CelesTrak](https://celestrak.org) and [SatNOGS](https://db.satnogs.org)
- Aircraft positions: [adsb.lol](https://adsb.lol)
- Propagation reports: [wspr.live](https://wspr.live), and the amateurs whose
  beacons and receivers make the data exist at all
- Space weather: [NOAA SWPC](https://www.swpc.noaa.gov)
- Crypto prices: [Coinbase](https://www.coinbase.com)
- Satellite imagery: [NASA GIBS](https://nasa-gibs.github.io/gibs-api-docs/) (VIIRS true colour)
- Station genres and fallback streams: [radio-browser.info](https://www.radio-browser.info)
- Globe icons by **emilegraphics** via [the Noun Project](https://thenounproject.com) —
  two royalty-free licences purchased 4 August 2026, certificates in
  `assets/licenses/`; see [`assets/ATTRIBUTION.md`](assets/ATTRIBUTION.md)

Full licence texts for every library this app ships, vendors or downloads are in
[`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md), regenerated on every build.

Personal project, not affiliated with or endorsed by any of the above.

