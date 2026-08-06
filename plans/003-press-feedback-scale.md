# 003 — One press-feedback scale for list rows

- **Status**: DONE — all three rows at scale(.97).
- **Commit**: b6d5aea
- **Severity**: MEDIUM
- **Category**: 3 — Physicality & origin (with 7 — Cohesion)
- **Estimated scope**: 2 files, 3 lines

## Problem

The three list-row press states use three different scale values for what is the
same interaction — pressing a row in a list — and all three are weaker than the
guidance in AUDIT.md section 3, which specifies `0.95-0.98` for press feedback.

```css
/* src/renderer/explore.html:240 — current (place rows) */
  .place:active{background:var(--fill-hi);transform:scale(.99);transition:transform 90ms ease-out}
```
```css
/* src/renderer/explore.html:516 — current (station rows) */
  .st:active{background:var(--fill-hi);transform:scale(.994);transition:transform 90ms ease-out}
```
```css
/* src/renderer/popover.html:182 — current (popover rows) */
  .row:active{background:var(--fill-hi);transform:scale(.988);transition:transform 90ms ease-out}
```

`scale(.994)` is a 0.6% reduction. On a 44px-tall row that is a quarter of a
pixel of movement — below the threshold at which a person can perceive it. The
station list is the most-pressed surface in the app, and it is the one with the
least press feedback of the three.

The inconsistency is the second half of the finding: `.99` / `.994` / `.988` are
three hand-picked values that almost match, which is exactly the pattern
AUDIT.md section 7 calls a consolidation finding.

## Target

One value, `0.97`, on all three rules — the midpoint of the AUDIT.md section 3
range and the value that section names explicitly for press feedback.

```css
/* target — src/renderer/explore.html:240 */
  .place:active{background:var(--fill-hi);transform:scale(.97);transition:transform 90ms ease-out}
```
```css
/* target — src/renderer/explore.html:516 */
  .st:active{background:var(--fill-hi);transform:scale(.97);transition:transform 90ms ease-out}
```
```css
/* target — src/renderer/popover.html:182 */
  .row:active{background:var(--fill-hi);transform:scale(.97);transition:transform 90ms ease-out}
```

The `90ms` duration stays. AUDIT.md section 2 budgets button press feedback at
100-160ms, and 90ms is slightly under that — but AUDIT.md section 4 also
requires asymmetric timing where the press is deliberate and the system's
response snaps. These rows respond to a press, so the faster end is correct.
Do not change it.

**If plan 002 has already been applied**, `90ms ease-out` at these three sites
will read `var(--dur-press) var(--ease-out)`. Leave that as it is and change
only the scale value. The two plans do not conflict.

## Repo conventions to follow

- Press feedback in this repo is always the pattern
  `:active{background:var(--fill-hi);transform:scale(N);transition:transform 90ms ease-out}`
  on one line. Keep the line shape.
- The comment above `src/renderer/popover.html:181` reads
  `/* Feedback on press, not release. */`. Leave it in place.

## Steps

1. `src/renderer/explore.html:240` — change `scale(.99)` to `scale(.97)`.
2. `src/renderer/explore.html:516` — change `scale(.994)` to `scale(.97)`.
3. `src/renderer/popover.html:182` — change `scale(.988)` to `scale(.97)`.

## Boundaries

- Change ONLY the three `:active` rules listed above. There are 15 other
  `scale(...)` values across these files (icon presses, entrance transforms,
  the popover materialize keyframe). They are different interactions with
  different correct values — do NOT normalise them.
- Specifically do NOT touch: `src/renderer/popover.html:103` (`scale(.965)`,
  an entrance keyframe), `src/renderer/explore.html:532` and
  `src/renderer/popover.html:204` (`scale(.85)`, icon press states), or any
  `scale(.9)` / `scale(.92)` / `scale(.93)` / `scale(.94)` / `scale(.95)`.
- Do NOT change the `90ms` duration.
- Do NOT change `background`, `transition-property`, or the rules' selectors.

## Verification

- **Mechanical**: `npm run audit`, expected `all checks passed`. Then
  `grep -c 'scale(\.97)' src/renderer/explore.html src/renderer/popover.html` —
  expect explore.html to gain one (it already has one at line 820) and
  popover.html to gain one.
- **Feel check**: launch with `npm start`:
  - Press and hold a station row in the right-hand rail. The row should visibly
    shrink under the finger and return on release. Before this change it did
    not move perceptibly at all — that difference is the whole point of the plan.
  - Press a place row and a popover row. All three should now feel identical.
  - Confirm the shrink is subtle, not a "button bounce" — at 0.97 the row
    should look pressed, not animated.
  - Press and drag off the row before releasing: the row should return to full
    size when the pointer leaves, with no stuck state.
- **Done when**: all three rows use `scale(.97)`, the press is perceptible on
  the station list, and no other scale value in either file changed.
