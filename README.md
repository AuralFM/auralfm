# GlobeFM

A macOS menu bar radio player. Listen to any of **38,342 live radio stations across
12,296 places worldwide** — from the menu bar, without opening a browser tab.

Inspired by [radio.garden](https://radio.garden), built because Apple is winding
down the radio station support in Shortcuts and Apple Music.

```
┌──────────────────────────────┐
│  ◍  GlobeFM                  │
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

## What it does

- **Plays any station in the world** — 38,342 channels, 12,296 places, 242 countries.
- **Search** by station, city, country, or genre. "jazz new orleans" works.
- **Favorites** with `1`–`9` hotkeys.
- **A globe sitting in space** — real Earth, starfield, and a day/night
  terminator computed from the sun's actual position right now.
- **Live cloud cover** — near-real-time VIIRS satellite imagery from NASA GIBS,
  so the weather on the globe is the weather that's actually up there.
- **Lock a station** and browse the world without changing what you're hearing.
- **Live local conditions** — pick a place and see its current weather and local
  time, so you know it's 53°F and overcast at 12:45 AM where the station is.
- **Now playing in the menu bar** — the station name sits next to the icon.
- **Keeps playing when the popover closes.** It hides, it doesn't stop.

## Requirements

- macOS
- [Node.js](https://nodejs.org) 18+ (developed on 24)

## Getting started

```bash
git clone git@github.com:YOUR_USERNAME/globefm.git
cd globefm
npm install
```

The station catalog is **not** in the repo — it's generated, ~2.7 MB, and
reproducible. Build it once (~50 minutes, one time):

```bash
npm run crawl     # radio.garden -> data/stations.json + stations.min.json
npm run tags      # fold in radio-browser genre tags
npm run icons     # rasterize assets/*.svg into the PNGs macOS needs
npm start         # run it
```

Look for the globe in your menu bar. Right-click it for **Open at Login** and **Quit**.

### Just trying it out?

`npm run crawl -- --limit 300` builds a usable catalog in about two minutes.

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

RUN TIME
  Search + Explore read the local bundle.        (no network)
  Press play -> resolve the stream URL:
    1. radio.garden listen endpoint (302 -> real stream)
    2. radio-browser, matched on name + country
    3. last-known-good URL cached on disk
```

Neither directory is queried while you browse, and playback survives both being
unreachable once a station has played at least once.

**Why two sources?** radio.garden has coordinates for every place but no genre
data at all. radio-browser has 11,777 genre tags but coordinates for only 22% of
its stations. Neither is sufficient alone.

**Being a good API citizen.** radio-browser's docs ask clients to report each
play so their popularity ranking stays meaningful, so GlobeFM calls
`/json/url/{uuid}` whenever a station starts (fire-and-forget — it can never
affect playback). It sends a descriptive `User-Agent`, and discovers mirrors via
`/json/servers` rather than pinning one host.

**Weather** comes from [Open-Meteo](https://open-meteo.com) — chosen because it
needs no API key, so a fresh clone has working weather with nothing to sign up
for. It is the one live thing in an otherwise offline-first app, so it is
strictly best-effort: cached for 10 minutes, and silent on failure. Only the
selected city's coordinates are sent, never the user's location.

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
  renderer/
    popover.html       menu bar player
    explore.html       browse-by-place window
scripts/
  crawl.mjs            radio.garden -> station bundle (resumable)
  tags.mjs             radio-browser genre tags -> bundle
  make-icons.js        SVG -> PNG via Electron (keeps alpha)
assets/                source icons + attribution
data/                  generated bundle (gitignored)
phase0/index.html      the original single-file prototype
```

`PLAN.md` carries the full design record: what was measured, what was decided,
and why.

## Scripts

| Command | What it does |
|---|---|
| `npm start` | Run the app |
| `npm run crawl` | Build the station catalog (resumable, safe to Ctrl-C) |
| `npm run crawl -- --build` | Rebuild bundles from existing progress, no network |
| `npm run tags` | Join radio-browser genre tags onto the catalog |
| `npm run icons` | Regenerate PNGs from `assets/*.svg` |

## Status

| Phase | State |
|---|---|
| 0 — Player prototype | ✅ |
| 1 — Menu bar shell | ✅ |
| 2 — Catalog, search, favorites | ✅ |
| 3a — Explore: list view | ✅ |
| 3b — Explore: globe view | ✅ |
| 4 — Dead-stream auto-skip, media keys, signing | Planned |

## Known limits

- **Moonlight isn't modelled.** The terminator follows the real sun; the moon is
  not yet computed (issue #9).
- **66% of stations have no genre tags.** A genre query only finds a station if
  radio-browser knew it *and* the two directories could be matched confidently.
  Aggressive matching would raise coverage by putting wrong genres on real
  stations, which isn't a trade worth making.
- **Some stations block browser playback.** SomaFM, for one, serves curl happily
  but returns 403 to anything sending a browser `Origin`. Expect roughly 5% of
  streams to be dead or blocked at any given time.
- **The catalog is a snapshot, not a subscription.** Stations come and go; re-run
  `npm run crawl` every few months.
- **Unsigned.** Gatekeeper will complain until the app is signed and notarized.

## Credits

- Station geography: [radio.garden](https://radio.garden)
- Satellite imagery: [NASA GIBS](https://nasa-gibs.github.io/gibs-api-docs/) (VIIRS true colour)
- Station genres and fallback streams: [radio-browser.info](https://www.radio-browser.info)
- Globe icon by **emilegraphics** via [the Noun Project](https://thenounproject.com) —
  see [`assets/ATTRIBUTION.md`](assets/ATTRIBUTION.md)

Personal project, not affiliated with or endorsed by any of the above.

## Siri and Shortcuts

GlobeFM registers a `globefm://` URL scheme, so any Shortcut that opens a URL can
drive it — which is how you get "Hey Siri, play KEXP" back.

| URL | Does |
|---|---|
| `globefm://play?station=KEXP` | Play the best match for a station name |
| `globefm://play?place=Reykjavik` | Play the top station in a place |
| `globefm://pause` | Pause / resume |
| `globefm://next` | Next favorite |
| `globefm://open` | Open the popover |

**Making a Shortcut:** Shortcuts → new shortcut → *Open URLs* → paste one of the
above → name it "Play KEXP". Saying that name to Siri now runs it.

Station and place names are matched with the same ranking the in-app search uses,
so "kexp", "wwoz" and "new orleans" all work without being exact.
