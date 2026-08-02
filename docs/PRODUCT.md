# GlobeFM — repositioning to a standalone app

**Status:** the window model in §3 is **built**. Identity and assets (§5, §6) are not.
**Written:** 2026-08-02 · **Revised:** 2026-08-02

---

## 1. What changed

GlobeFM was scoped as a menu bar radio player. `PLAN.md` still says it plainly:

> The popover is the product. Explore is the reason you'll open it in the first place.

That is no longer true, and pretending otherwise is now costing us. What actually
got built:

| | |
|---|---|
| Stations | 38,342 across 12,296 places, searchable by name, city, country, genre |
| The Earth | Real textures, day/night terminator from the true sub-solar point |
| Weather | Live GOES cloud cover (10 min) over a daily global pass |
| Sky | 5,044 catalogued stars, 89 constellation figures |
| Orbit | Live ISS position, altitude, sunlit state, ground track |
| Per place | Current conditions, local time, local headlines |

**Nobody builds that to fill a 392px popover.** The globe is the product. The
popover is now the companion — the thing that keeps it playing once the window
is closed.

## 2. What the app actually is

> **A window onto the world you can listen to.**
>
> Open it and the Earth is there — real weather moving across it, the day/night
> line where it truly is, the ISS overhead, stars behind. Click anywhere and hear
> what that place is listening to right now.

Three properties worth protecting, because they are unusual and they are the
whole character of the thing:

- **Offline-first.** The 38k-station catalogue is on disk. Search, browse and the
  globe work with the network unplugged.
- **Serverless.** No backend, no account, no sign-in. Presence exists but is off
  unless self-hosted.
- **Collects nothing.** No telemetry, no profile, no history leaving the machine.

That trio is a genuine position, not a limitation to apologise for. Almost
nothing in this category can claim it.

## 3. The decision that gates everything

Today the app is `LSUIElement: true` — menu-bar-only, no Dock icon, no window at
launch. That was right for a radio utility. It is wrong for this.

| | Menu bar app (today) | Standalone app (proposed) |
|---|---|---|
| Launch | Tray icon only | Globe window opens |
| Dock | Hidden | Present |
| Cmd-Tab | Absent | Present |
| Menu bar | The product | Companion — keeps playing, quick tune |
| Close window | n/a | Keeps playing in the menu bar |

**Recommendation: become a standalone app with a menu bar companion.** Keep every
menu bar behaviour that exists — it is genuinely good — but stop hiding the thing
people came for behind an unlabelled icon.

**Done.** `LSUIElement` was never set in the build config, the Dock icon is
present, `openExplore()` runs at launch — the comment in `main.js` reads *"the
globe is the app"* — `activate` reopens it, and `window-all-closed` deliberately
keeps the process alive so the menu bar companion goes on playing. The table
above now describes the app as it ships.

What remains from this section is nothing. What remains from §5 and §6 is
everything.

## 4. Name

**Keep GlobeFM.** It survives the repositioning better than most names would: the
globe is now literally the centre of the app, and FM still says what you hear.
Short, memorable, spellable, and the domain-style compound reads as a product
rather than a project.

No rename. Spend the effort on the identity instead.

## 5. Identity

Existing: the Noun Project globe by emilegraphics, filled variant for small sizes,
outlined for large (see `assets/ATTRIBUTION.md`).

That icon is doing real work and should stay — but a standalone app needs more
than one mark.

- [ ] **App icon**, macOS-correct: rounded-rect, correct margins, layered depth.
      Current `.icns` is the bare glyph on transparency, which reads as an
      unfinished port next to native apps.
- [ ] **Consider commissioning or buying out the icon.** Noun Project free tier is
      CC BY; a paid licence removes the attribution requirement. If GlobeFM is
      distributed, do this properly rather than leaning on an About-panel credit.
- [ ] **Colour.** Currently systemGreen, inherited from "on air". Worth asking
      whether the identity should be the deep blue of the night Earth instead —
      the app is mostly a dark globe in space, and green now reads as an accent
      rather than a brand.
- [ ] **About panel** — required anyway for the CC BY credit, and it is where the
      offline/serverless/collects-nothing promise should be stated plainly.

## 6. Assets to produce

**Ship-blocking**
- [ ] App icon at all macOS sizes, in the platform's visual language
- [ ] DMG background with drag-to-Applications affordance
- [ ] About panel: version, credits, the privacy promise

**Distribution**
- [ ] 3–5 screenshots: the globe at night, a city selected, search, the menu bar companion
- [ ] A short screen recording — the globe drifting, weather moving, a station starting
- [ ] One-line description and a longer paragraph
- [ ] README rewritten to lead with the globe rather than the menu bar

**Deferred until there is an audience**
- Landing page, social art, press kit

## 7. Sequence

1. ~~**Decide the window model** (§3).~~ Done — see above.
2. ~~Flip `LSUIElement`, add a proper main-window lifecycle, keep the menu bar as companion.~~ Done.
3. ~~About panel — smallest piece, unblocks the licence question.~~ Done: it carries
   the version, the full attribution list including the Noun Project CC BY
   credit, and the offline/no-account/no-telemetry promise. Settings repeats the
   promise and links the privacy policy and terms.
4. **Icon work, including the Noun Project licence decision.** ← next, and it is
   the only thing genuinely blocking a public release that isn't code signing.
5. Screenshots and copy.
6. Sign and notarise (#4), then ship the DMG (#14). Both need a paid Apple
   Developer account; nothing in the repo can move them forward without one.

## 8. What this does not change

The engineering positions already taken hold up and should not be reopened:

- No chat (#11) — moderation is a permanent operational commitment
- Presence off unless self-hosted (#10)
- No podcasts (#20) — they do not live on a globe
- No scanners (#13) — thin, ungeocoded, legally awkward data
- Free by default (#15) — revisit only on real usage

A standalone app is a bigger surface. It is not a licence to reverse decisions
that were made for good reasons.
