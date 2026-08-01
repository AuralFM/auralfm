# globe-radio

A macOS menu bar radio player with a spinnable world globe for discovery.
Working name — change it before the GitHub push if you want something better.

**Status:** planning. No code written yet.
**Last updated:** 2026-08-01

---

## 1. What this is

Two surfaces, one app:

| Surface | Purpose | Used |
|---|---|---|
| **Menu bar popover** (~380×520) | Now playing, play/pause, volume, favorites, recents | ~95% of the time |
| **Globe window** (900×600, resizable) | Spin the world, click a city, pick a station | Discovery sessions |

The popover is the product. The globe is the reason you'll open it in the first place.

### Explicit non-goals
- Not a Radio Garden clone. No accounts, no history sync, no their-branding.
- Not an iOS app. Not a PWA. Not App Store distributed.
- No Apple Shortcuts / Siri integration in v1 (confirmed: inspiration only, not a requirement).
- No podcasts, no on-demand, no recording.

---

## 2. Research findings (verified 2026-08-01, not assumed)

### radio.garden API — usable, but only as a build-time source
- Cloudflare-gated. Plain `curl` → **403**. Requires a browser `User-Agent` + `Referer: https://radio.garden/`.
- Undocumented, unversioned. Every unofficial client is one WAF rule from breaking.
- **Verified working chain:**
  ```
  GET /api/ara/content/places                     → 12,296 places, 1.8 MB
  GET /api/ara/content/page/{placeId}/channels    → channels for that place
  GET /api/ara/content/listen/{channelId}/channel.mp3
      → HTTP 302 → https://enacast.com/esplugafm/streams/HD
  ```
- Places data: **12,296 places, 100% with coordinates, 38,342 total channels.**

### radio-browser.info — open, reliable, but geographically blind
- No auth, no header games. **61,510 stations**, 241 countries, 11,777 tags.
- Returns direct stream URLs (no redirect). Verified: KEXP → `HTTP 200, audio/aacp`.
- **Only 22% of the top 1,000 stations have coordinates.** Cannot power a globe.

### The finding that drove the platform choice
Sample of the 1,000 most-clicked stations:

| | count | share |
|---|---|---|
| HTTPS streams | 534 | 53% |
| **HTTP-only streams** | **466** | **47%** |
| HLS | 102 | 10% |
| Codecs | MP3 700 · AAC 129 · AAC+ 104 · unknown 52 | |

A PWA served over HTTPS cannot play `http://` audio — mixed-content blocking silently
kills nearly half the world's popular radio. A native shell has no such restriction.
**This is why this is a desktop app and not a web page.**

---

## 3. Architecture

### Data strategy: crawl once, ship static

```
BUILD TIME (run manually, ~once a quarter)
  scripts/crawl.mjs
    → radio.garden places        (1 request)
    → per-place channels         (12,296 requests, throttled ~4/sec, ~50 min)
    → data/stations.json         (~38k channels + coords, expected 8–15 MB)
    → data/stations.min.json     (trimmed fields, target < 5 MB, shipped in app)

RUN TIME
  Globe reads data/stations.min.json from disk. Zero network.
  Press play → resolve stream URL:
    1. radio.garden listen redirect  (1 request, only on play)
    2. fallback: radio-browser name+country match
    3. fallback: last-known-good URL cached in user data
```

Runtime never depends on radio.garden being up or unblocked. That is the whole point.

### Process layout (Electron)

```
main process
  ├─ Tray + popover BrowserWindow  (frameless, always-on-top, hide-on-blur)
  ├─ Globe BrowserWindow           (standard, opened on demand)
  ├─ Stream resolver               (net requests live here, not the renderer)
  └─ Store: favorites, recents, volume, last station  (JSON in userData)

renderer/popover   plain HTML/CSS/JS — no framework
renderer/globe     globe.gl (three.js) — 12,296 points, click → channel list
```

UI stays framework-free plain web code so the whole thing can be re-shelled in
Tauri later without a rewrite if the ~150 MB Electron bundle becomes annoying.

### Why Electron over Tauri (for now)
`node v24.18.0` and `npm 11.16.0` are already installed. `cargo` and `rustc` are not.
Electron ships today with zero new toolchain. Tauri is the better end state
(~10 MB vs ~150 MB) — it's a Phase 5 swap, not a Phase 1 blocker.

---

## 4. Phases

Each phase ends with something runnable. Do not start the next one until you've
actually used the previous one.

### Phase 0 — Prove you'll use it (~30 min)
- Single HTML file. 5 hardcoded stations you genuinely listen to. `<audio>` + 5 buttons.
- **Gate: use it for one week.** If you don't reach for it, stop here. Nothing lost.

### Phase 1 — Menu bar shell
- Electron tray icon + popover window, hide-on-blur, launch at login.
- Play/pause, volume, now-playing label. Still hardcoded stations.
- **Done when:** it lives in your menu bar and you stop opening the HTML file.

### Phase 2 — Real station data
- `scripts/crawl.mjs` — throttled, resumable, writes `data/stations.json`.
- Stream resolver with the 3-tier fallback chain.
- Search by station/city/country in the popover. Favorites + recents, persisted.
- **Done when:** you can find and play any of the 38k channels without the globe.

### Phase 3 — The globe
- Second window, `globe.gl`, 12,296 points from the static bundle.
- Click a point → channel list for that city → click → plays, popover updates.
- Point size by `size` (station count). Country labels on zoom.
- **Done when:** it feels like radio.garden and you've lost an hour to it.

### Phase 4 — Polish
- Dead-stream detection + auto-skip. Buffering/reconnect states. Sleep timer.
- Media key support (F7/F8/F9) and macOS Now Playing integration.
- Signed + notarized `.app` so it opens without a Gatekeeper fight.

### Phase 5 — Optional
- Tauri re-shell for bundle size.
- Apple Shortcuts / Siri via URL scheme (deferred from v1).

---

## 5. Open risks

| Risk | Severity | Mitigation |
|---|---|---|
| radio.garden blocks the crawler mid-run | Medium | Resumable crawl, throttled, cached output. A block delays a refresh, never breaks the app. |
| Stream URLs rot | High (certain) | 3-tier resolver + last-known-good cache. Expect ~5% dead at any time. |
| ToS ambiguity around the crawl | Medium | Personal use, one-time, rate-limited, no redistribution of their data. Not shipping their DB as a product. Revisit before making the repo public. |
| 38k channels in one JSON is slow to load | Low | Trim fields, lazy-load channel lists per place, keep only places+coords hot. |
| Electron bundle size | Low | Accepted for v1. Tauri path is pre-planned. |
| Unsigned app blocked by Gatekeeper | Medium | Phase 4. Needs an Apple Developer account ($99/yr) — decide if it's worth it for a personal app. |

---

## 6. Setup still needed

- [ ] `git config --global user.name` / `user.email` — currently unset
- [ ] Install `gh` (`brew install gh`) or push via HTTPS/SSH manually
- [ ] Decide repo name (currently `globe-radio`) and public vs private
- [ ] Decide on Apple Developer account for Phase 4 signing
