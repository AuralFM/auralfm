# AuralFM

**A window onto the world you can listen to.**

*Aural* — of or relating to the ear, and the sense of hearing.

Open it and the Earth is there — real weather moving across it, the day/night line
where it truly is, the ISS overhead, the actual planets behind. Click anywhere and
hear what that place is listening to right now.

**38,342 radio stations across 12,296 places in 227 countries, 837 shortwave
receivers you can borrow, and the ionosphere drawn over the top of it.**

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

Inspired by [radio.garden](https://radio.garden), started because Apple is winding
down radio support in Shortcuts and Apple Music — and grown well past it.

```
┌──────────────────────────────┐
│  ◍  AuralFM                  │
│  ┌────────────────────────┐  │
│  │ Search 38,342 stations │  │
│  └────────────────────────┘  │
│  Favorites                   │
│  1  KEXP 90.3 FM        ★ ⦀⦀ │
│     Seattle WA · United St…  │
│  2  WWOZ FM 90.7        ★    │
│     New Orleans LA · jazz…   │
│  ─────────────────────────── │
│  ▐▌ WWOZ FM 90.7      ──●──  │
│   ● New Orleans LA           │
└──────────────────────────────┘
```

---

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

## What it does

### Listening

- **Any station in the world** — 38,342 channels across 12,296 places in 227 countries.
- **837 shortwave receivers.** Click an amber dot and you are listening to a real
  antenna in Trondheim, or Christoval, or a Cold War coastal fortress in Sweden.
  Bands are ordered by whether that path is likely open right now, because
  shortwave propagation depends on whether the path is in daylight — and the globe
  already knows where the terminator is.
- **21 bands**, including seven amateur bands and two morse frequencies — chosen
  from where the activity measurably is, not from a band plan.
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

- **A real Earth in real space** — actual satellite imagery, a day/night
  terminator computed from the sun's true position, and a starfield of 5,044
  catalogued stars with 89 constellation figures.
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
- **Other listeners**, if you switch it on — see below.
- **Live local conditions** — pick a place and see its weather and local time, so
  you know it is 53°F and overcast at 12:45 AM where the station is.

### The app

- **The globe is the app** — a standalone window, with a menu bar companion that
  keeps playing when the window is closed. It hides, it doesn't stop.
- **Seven colour schemes** — onyx and bone by default — five interface
  languages, an appearance override, an increased-contrast mode and adjustable
  dot sizes. A palette colours the things *around* the planet; the Earth is real
  satellite imagery and is never recoloured.
- **Now playing in the menu bar**, with media key support.

### Other listeners, if you want them

Off by default, because it is the only thing in AuralFM that sends anything.

Switched on, and only while something is playing, it announces the **station's**
location — rounded to a four-character geohash, about 20 km — and the station's
name, over public [Nostr](https://nostr.com) relays. Other people running AuralFM
see a slow pulsing ring there.

- **Never your location.** The coordinates are the station's, the same rule the
  weather already follows.
- **No account.** The keypair is generated when the app opens and thrown away
  when it closes. A stable key would make you the same person across sessions.
- **No server of ours.** Relays are other people's and interchangeable.
- **Said precisely:** it uses an *ephemeral* event kind, which relays are asked
  not to retain. That is a SHOULD in the spec, not a MUST — testing found an
  announcement replayed after the fact — so the payload is built to be worthless
  if kept rather than relying on the promise.

Expect an empty room for now. Nobody else is running this yet.

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
npm run crawl:sdr # kiwisdr -> data/sdr.min.json, the 837 receivers
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
   837 shortwave sites, all with GPS

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
service has a cooldown. The 837 shortwave receivers get stricter rules again:
never auto-connect, one session at a time, never retry a refusal, never enumerate
them.

**Why a native app instead of a web page?** 47% of the most-played radio streams
are served over plain `http://`. A page served over HTTPS cannot play them —
mixed-content blocking kills them silently. A native shell has no such limit.

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
  palettes.js          colour schemes
  i18n.js              interface strings, 5 languages
  backoff.js           shared failure cooldown
  renderer/
    popover.html       menu bar player — the only thing that makes sound
    explore.html       the globe
    settings.html      appearance, colour, language, your stations
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

| | |
|---|---|
| [`PLAN.md`](PLAN.md) | The full design record — what was measured, what was decided, why |
| [`docs/DECENTRALIZATION.md`](docs/DECENTRALIZATION.md) | What "offline-first, no backend, collects nothing" can honestly carry, and what it cannot |
| [`docs/PRODUCT.md`](docs/PRODUCT.md) | Positioning as a standalone app; what remains |
| [`docs/PRIVACY.md`](docs/PRIVACY.md) | Everything stored locally, everything any third party sees |
| [`docs/TERMS.md`](docs/TERMS.md) | Plain-language terms |
| [`docs/SPONSORSHIP.md`](docs/SPONSORSHIP.md) | The sequence for funding this, and what it is and isn't worth |

## Scripts

| Command | What it does |
|---|---|
| `npm start` | Run the app |
| `npm run crawl` | Build the station catalog (resumable, safe to Ctrl-C) |
| `npm run crawl -- --build` | Rebuild bundles from existing progress, no network |
| `npm run tags` | Join radio-browser genre tags onto the catalog |
| `npm run icons` | Regenerate PNGs from `assets/*.svg` |
| `npm run crawl:sdr` | Refresh the shortwave receiver list |
| `npm run audit` | Pre-flight checks for the traps this codebase has fallen into |
| `npm run check` | Report how stale the station catalogue is |

## Status

| | State |
|---|---|
| Player, menu bar shell, catalogue, search, favourites | ✅ |
| Explore — list and globe | ✅ |
| Day/night, live clouds, real sky, planets, ISS | ✅ |
| Shortwave receivers, aviation HF, 21 bands | ✅ |
| WSPR propagation arcs, space weather | ✅ |
| Presence over Nostr, off by default | ✅ |
| Settings — appearance, contrast, dot size, language, palettes | ✅ |
| User-added stations | ✅ |
| Aircraft layer | ✅ |
| Code signing and notarisation | Needs an Apple Developer account |
| Downloadable release | Blocked on signing |
| Presence between listeners | Designed, needs hosting — deliberately unbuilt |

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
- Globe icon by **emilegraphics** via [the Noun Project](https://thenounproject.com) —
  see [`assets/ATTRIBUTION.md`](assets/ATTRIBUTION.md)

Personal project, not affiliated with or endorsed by any of the above.

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
