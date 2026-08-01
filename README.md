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
- **Explore** — browse by place in a separate window; a globe view is coming.
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
| 3b — Explore: globe view | Next |
| 4 — Dead-stream auto-skip, media keys, signing | Planned |

## Known limits

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
- Station genres and fallback streams: [radio-browser.info](https://www.radio-browser.info)
- Globe icon by **emilegraphics** via [the Noun Project](https://thenounproject.com) —
  see [`assets/ATTRIBUTION.md`](assets/ATTRIBUTION.md)

Personal project, not affiliated with or endorsed by any of the above.
