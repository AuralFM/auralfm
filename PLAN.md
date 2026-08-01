# GlobeFM

A macOS menu bar radio player with geographic discovery — listen to any live
station in the world from your taskbar.

**Status:** Phase 0 complete and verified. Phase 1 not started.
**Last updated:** 2026-08-01

---

## 1. What this is

Two surfaces, one app:

| Surface | Purpose | Used |
|---|---|---|
| **Menu bar popover** (~380×520) | Now playing, play/pause, volume, favorites, search | ~95% of the time |
| **Explore window** (900×600, resizable) | Browse by place, see what's on air in an area | Discovery sessions |

The popover is the product. Explore is the reason you'll open it in the first place.

### Core features (confirmed)
1. **Play any station** — the full ~38k channel catalog, live.
2. **Explore by area** — pick a place, list the stations broadcasting there (Radio Garden style).
3. **Favorites** — save stations, pin them to the popover with number-key access (`1`–`9`).
4. **Search** — one box, matches country, city, or station name.

### Explicit non-goals
- Not a Radio Garden clone. No accounts, no history sync, no their-branding.
- Not an iOS app. Not a PWA. Not App Store distributed.
- No Apple Shortcuts / Siri in v1 (confirmed: inspiration only, not a requirement).
- No podcasts, on-demand, or recording.

---

## 2. Research findings (verified by probe, not assumed)

### radio.garden API — usable, but only as a build-time source
- Cloudflare-gated. Plain `curl` → **403**. Needs a browser `User-Agent` + `Referer: https://radio.garden/`.
- Undocumented and unversioned. Any runtime dependency is one WAF rule from breaking.
- **Verified chain:**
  ```
  GET /api/ara/content/places                     → 12,296 places, 1.8 MB
  GET /api/ara/content/page/{placeId}/channels    → channels for that place
  GET /api/ara/content/listen/{channelId}/channel.mp3
      → HTTP 302 → https://enacast.com/esplugafm/streams/HD
  ```
- **12,296 places, 100% with coordinates, 38,342 total channels.**

### radio-browser.info — open and reliable, but geographically blind
- No auth, no header games. **61,510 stations**, 241 countries, 11,777 tags.
- Returns direct stream URLs. Verified: KEXP → `200 audio/aacp`.
- **Only 22% of the top 1,000 stations have coordinates** — cannot drive the explore view alone.
- Best role: search backend (name/country/tag) + fallback stream resolver.

### Why this is a native app, not a web page
Sample of the 1,000 most-clicked stations:

| | count | share |
|---|---|---|
| HTTPS streams | 534 | 53% |
| **HTTP-only streams** | **466** | **47%** |
| HLS | 102 | 10% |
| Codecs | MP3 700 · AAC 129 · AAC+ 104 · unknown 52 | |

An HTTPS-hosted page cannot play `http://` audio (mixed-content blocking), silently
killing ~47% of popular radio. A native shell has no such restriction.

### Findings from building Phase 0
- **curl verification is not sufficient.** SomaFM returns `200 audio/mpeg` to curl but
  **`403 text/html` to a browser** — hotlink protection keyed on `Origin`/`Referer`.
  Streams must be validated in a real browser engine. In Electron we control request
  headers, so some of these become playable again — another point for the native shell.
- **Streams are slow to start.** WFMU and FIP take 8–11s to deliver first audio.
  Any "is it working" timeout below ~15s produces false failures.
- **Dead stations are normal, not exceptional.** Do not hand-curate a working list —
  detect failure at play time and surface it. See Phase 4 auto-skip.

---

## 3. Architecture

### Data strategy: crawl once, ship static

```
BUILD TIME (manual, ~quarterly)
  scripts/crawl.mjs
    → radio.garden places        (1 request)
    → per-place channels         (12,296 requests, throttled ~4/sec, ~50 min)
    → data/stations.json         (~38k channels + coords)
    → data/stations.min.json     (trimmed, target < 5 MB, shipped in app)

RUN TIME
  Explore + search read the local bundle. Zero network.
  Press play → resolve stream URL:
    1. radio.garden listen redirect  (1 request, only on play)
    2. fallback: radio-browser name+country match
    3. fallback: last-known-good URL cached in user data
```

Runtime never depends on radio.garden being reachable. That is the whole point.

### Process layout (Electron)

```
main process
  ├─ Tray + popover BrowserWindow  (frameless, hide-on-blur)
  ├─ Explore BrowserWindow         (opened on demand)
  ├─ Stream resolver               (net requests live here, not the renderer)
  └─ Store: favorites, recents, volume, last station  (JSON in userData)

renderer/popover   plain HTML/CSS/JS — no framework
renderer/explore   place list + station list + search
```

UI stays framework-free so the whole thing can be re-shelled in Tauri later
without a rewrite.

### Why Electron over Tauri (for now)
`node v24.18.0` and `npm 11.16.0` are installed; `cargo`/`rustc` are not. Electron ships
today with zero new toolchain and plays `http://` streams. Tauri is the better end state
(~10 MB vs ~150 MB) — a Phase 5 swap, not a Phase 1 blocker.

---

## 4. Phases

### Phase 0 — Prove you'll use it ✅ COMPLETE
- `phase0/index.html` — single file, 7 stations, play/pause, volume, keyboard, persistence.
- All 7 verified playing in-browser. Race condition on rapid switching found and fixed.
- **Gate: use it for a week.** If you don't reach for it, stop here.

### Phase 1 — Menu bar shell
- Electron tray + popover, hide-on-blur, launch at login.
- Port the Phase 0 player as-is. Still a hardcoded list.
- **Done when:** it lives in your menu bar and you stop opening the HTML file.

### Phase 2 — Data, search, favorites
- `scripts/crawl.mjs` — throttled, resumable.
- Stream resolver with the 3-tier fallback.
- **Search:** one box matching country, city, or station name.
- **Favorites:** save/unsave, reorder, `1`–`9` hotkeys in the popover.
- **Done when:** you can find and play any of the 38k channels and keep the ones you like.

### Phase 3 — Explore by area
- Explore window: pick a place → list every station on air there.
- Entry points: search a city, browse by country, or "near me".
- **Open question — see §6.** Whether this is a 3D globe or a fast list view.
- **Done when:** you've lost an hour to it.

### Phase 4 — Polish
- Dead-stream detection + auto-skip (expect ~5% dead at any time; do not curate by hand).
- Buffering/reconnect states. Sleep timer.
- Media keys (F7/F8/F9) + macOS Now Playing integration.
- Signed + notarized `.app` so Gatekeeper doesn't fight you.

### Phase 5 — Optional
- Tauri re-shell for bundle size.
- Apple Shortcuts / Siri via URL scheme.

---

## 5. Open risks

| Risk | Severity | Mitigation |
|---|---|---|
| Stream URLs rot / stations block browsers | High (certain) | 3-tier resolver, last-known-good cache, auto-skip. Confirmed real: SomaFM 403s browsers. |
| radio.garden blocks the crawler mid-run | Medium | Resumable, throttled. A block delays a refresh, never breaks the app. |
| ToS ambiguity around crawling | Medium | Personal use, one-time, rate-limited, not redistributed. Revisit before making the repo public. |
| 38k channels in one JSON is slow | Low | Trim fields, lazy-load per place, keep only places+coords hot. |
| Unsigned app blocked by Gatekeeper | Medium | Phase 4. Needs Apple Developer account ($99/yr) — decide if it's worth it. |
| Electron bundle size | Low | Accepted for v1; Tauri path pre-planned. |

---

## 6. Open questions

1. **Is Explore a 3D globe or a list?** You originally picked "full globe/map browsing,"
   then described it as "just list the stations that are in that area." Those are very
   different builds — the globe is the single most expensive item in this plan.
   A searchable place list gets the same *function* in a fraction of the time.
2. Repo visibility — public or private?
3. Apple Developer account for Phase 4 signing?

---

## 7. Setup still needed

- [ ] `git config --global user.name` / `user.email` — currently unset
- [ ] Install `gh` (`brew install gh`) or push via HTTPS/SSH manually
- [ ] Create the GitHub repo (awaiting visibility decision)
