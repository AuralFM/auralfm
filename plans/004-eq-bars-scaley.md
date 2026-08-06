# 004 — Drive the equaliser bars with transform, not height

- **Status**: TODO
- **Commit**: b6d5aea
- **Severity**: MEDIUM
- **Category**: 5 — Performance
- **Estimated scope**: 2 files, 6 lines

## Problem

The playing-station equaliser animates `height`, on an infinite loop, for the
entire time audio is playing. AUDIT.md section 5 states the rule plainly:
animate `transform` and `opacity` only, because `width`/`height` trigger layout,
then paint, then composite.

```css
/* src/renderer/explore.html:550-553 — current */
  .bars i{width:2px;background:var(--accent);border-radius:1px;height:3px}
  body.playing .st[aria-current="true"] .bars i{animation:eq .9s ease-in-out infinite}
  .bars i:nth-child(2){animation-delay:.15s}.bars i:nth-child(3){animation-delay:.3s}
  @keyframes eq{0%,100%{height:3px}50%{height:12px}}
```
```css
/* src/renderer/popover.html:207-210 — current */
  .bars i{width:2px;background:var(--accent);border-radius:1px;height:3px}
  body.playing .row[aria-current="true"] .bars i{animation:eq .9s ease-in-out infinite}
  .bars i:nth-child(2){animation-delay:.15s}.bars i:nth-child(3){animation-delay:.3s}
  @keyframes eq{0%,100%{height:3px}50%{height:11px}}
```

**Honest scoping, so the executor does not over-claim the win.** The parent
`.bars` is `position:absolute` in `explore.html` with a fixed `height:12px` and
`width:8px` (`src/renderer/explore.html:542-544`), and a fixed-size flex item in
`popover.html` (`src/renderer/popover.html:205`). The reflow is therefore
*contained* to that 8x12px box and does not invalidate the surrounding station
list. This is a correctness fix and a rule violation, not a measured frame drop.
Do not describe it in a commit message as a performance win that was measured,
because it was not.

It is still worth doing: it is three elements running a layout-triggering
animation continuously for as long as the app is doing its primary job, it
costs six lines to fix, and `scaleY` is what this effect is supposed to be.

## Target

Fixed-height bars scaled from their base. `transform-origin: bottom` is required
— without it the bars grow from the middle in both directions and the effect
inverts.

```css
/* target — src/renderer/explore.html */
  .bars i{width:2px;background:var(--accent);border-radius:1px;height:12px;transform-origin:bottom;transform:scaleY(.25)}
  body.playing .st[aria-current="true"] .bars i{animation:eq .9s ease-in-out infinite}
  .bars i:nth-child(2){animation-delay:.15s}.bars i:nth-child(3){animation-delay:.3s}
  @keyframes eq{0%,100%{transform:scaleY(.25)}50%{transform:scaleY(1)}}
```
```css
/* target — src/renderer/popover.html */
  .bars i{width:2px;background:var(--accent);border-radius:1px;height:11px;transform-origin:bottom;transform:scaleY(.27)}
  body.playing .row[aria-current="true"] .bars i{animation:eq .9s ease-in-out infinite}
  .bars i:nth-child(2){animation-delay:.15s}.bars i:nth-child(3){animation-delay:.3s}
  @keyframes eq{0%,100%{transform:scaleY(.27)}50%{transform:scaleY(1)}}
```

How the scale values were derived — the visual result must be identical to
today, so the ratios are taken from the current pixel values:

- `explore.html`: was `3px` to `12px`. New height is `12px`, so the rest state
  is `3/12 = .25` and the peak is `1`.
- `popover.html`: was `3px` to `11px`. New height is `11px`, so the rest state
  is `3/11 = .2727`, rounded to `.27`, and the peak is `1`.

The two files intentionally keep different values because their `.bars`
containers are different heights (12px and 11px). Do not unify them.

`ease-in-out` on the keyframe is correct and stays — AUDIT.md section 2 assigns
`ease-in-out` to constant on-screen movement, which an oscillating meter is.
The `.9s` duration and the `.15s`/`.3s` stagger delays also stay.

## Repo conventions to follow

- Both files declare `.bars i` on one compact line. Keep that shape.
- `border-radius:1px` on a `2px`-wide bar is unaffected by `scaleY` in a way
  that matters visually, because scaling only the Y axis leaves the horizontal
  radius intact. No change needed there.

## Steps

1. `src/renderer/explore.html:550` — change `height:3px` to
   `height:12px;transform-origin:bottom;transform:scaleY(.25)`.
2. `src/renderer/explore.html:553` — replace the keyframe body with
   `0%,100%{transform:scaleY(.25)}50%{transform:scaleY(1)}`.
3. `src/renderer/popover.html:207` — change `height:3px` to
   `height:11px;transform-origin:bottom;transform:scaleY(.27)`.
4. `src/renderer/popover.html:210` — replace the keyframe body with
   `0%,100%{transform:scaleY(.27)}50%{transform:scaleY(1)}`.

## Boundaries

- Do NOT change `.bars` itself in either file. Its `height`, `width`,
  `align-items:flex-end` and `position` are all still correct and are what makes
  `transform-origin:bottom` land in the right place.
- Do NOT change the `.9s` duration or the two `animation-delay` values.
- Do NOT change `ease-in-out` to something else.
- Do NOT add a `prefers-reduced-motion` block for this. Neither file currently
  gates the equaliser, and adding that is a separate decision that is not in
  scope for this plan — note it in your report instead.
- Do NOT unify the explore and popover values.

## Verification

- **Mechanical**: `npm run audit`, expected `all checks passed`. Then
  `grep -n 'keyframes eq' -A1 src/renderer/explore.html src/renderer/popover.html`
  and confirm neither keyframe body contains the word `height`.
- **Feel check**: launch with `npm start` and play a station:
  - The three bars beside the playing row still rise and fall, staggered, and
    look the same as before. Any visible difference means a ratio is wrong.
  - **The bars must grow upward from their base**, not outward from the middle.
    Growing from the middle means `transform-origin:bottom` is missing.
  - Open the menu-bar popover with a station playing and confirm the same there.
  - In DevTools, open the Performance panel, record five seconds with audio
    playing, and confirm the equaliser no longer produces "Layout" entries on
    every frame. Before this change it did.
- **Done when**: neither `@keyframes eq` mentions `height`, the effect is
  visually unchanged, the bars grow upward, and no Layout work appears in a
  Performance recording attributable to the equaliser.
