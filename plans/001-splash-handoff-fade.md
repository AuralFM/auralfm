# 001 — Fade the globe in when the splash hands off

- **Status**: DONE — b6d5aea..HEAD. Deviated from step 3: the window's own
  `backgroundColor` was `#1c1c1e` (Apple's secondarySystemBackground), so fading
  the page revealed grey rather than onyx. `src/main.js:192` moved to `#0C0B0B`.
  The trigger also moved: `explore:ready` fires *before* main calls `show()`, so
  revealing there would run the fade while the window was still hidden. It now
  fires on `visibilitychange`, measured at 1798ms with the safety net disabled.
- **Commit**: b6d5aea
- **Severity**: MEDIUM (missed opportunity)
- **Category**: 8 — Missed opportunities
- **Estimated scope**: 2 files, ~15 lines

## Problem

The launch sequence ends in a hard cut. `revealExplore()` calls `explore.show()`
and the window appears fully drawn in one frame, replacing a 260x260 onyx splash
card with a full-size window containing a rendered Earth.

```js
/* src/main.js:222 — current */
/** Swap the splash for the finished window. Safe to call more than once. */
function revealExplore() {
  clearTimeout(revealTimer);
  closeSplash();
  if (explore && !explore.isDestroyed() && !explore.isVisible()) {
    explore.show();
    explore.focus();
  }
}
```

There is no first-paint transition anywhere in the renderer either. Confirmed by
searching `src/renderer/explore.html` for a body-level opacity or a `.ready`
class: neither exists. The only opacity transition in that file is on `.wx`
(the weather line, `src/renderer/explore.html:473`), which is unrelated.

Why it matters: by the frequency table in AUDIT.md section 1, a once-per-launch
first-run moment sits in the "rare" row, which is the only row allowed a delight
budget. This is the single highest-emotion moment in the product — the app
finishes loading and the Earth arrives — and it currently spends none of that
budget. It also reads as a jarring state change (AUDIT.md section 8), because
nothing connects the small card to the large window.

## Target

The window still appears instantly (do not animate the native window — that is
slow and janky on Intel integrated graphics). Instead the *page content* fades
and settles up from the same onyx the splash card uses, so the two surfaces read
as one object continuing rather than two objects swapping.

```css
/* target — src/renderer/explore.html, inside the existing <style> */
body {
  opacity: 0;
  transform: scale(0.994);
  transition: opacity 420ms cubic-bezier(0.32, 0.72, 0, 1),
              transform 420ms cubic-bezier(0.32, 0.72, 0, 1);
}
body.revealed {
  opacity: 1;
  transform: none;
}
@media (prefers-reduced-motion: reduce) {
  body { transition: opacity 200ms ease-out; transform: none; }
  body.revealed { transform: none; }
}
```

Values and their justification, all from AUDIT.md:

- `cubic-bezier(0.32, 0.72, 0, 1)` is the `--ease-drawer` curve in AUDIT.md
  section 2, and this repo already uses that exact curve in three places
  (see "Repo conventions" below). Do not substitute a different curve.
- `420ms` sits inside the "Modals, drawers: 200-500ms" budget in AUDIT.md
  section 2. This is a full-window reveal, so it belongs at the slower end.
- `scale(0.994)` rather than `scale(0)`: AUDIT.md section 3 states nothing in
  the real world appears from nothing. The value is deliberately tiny because
  the element is the entire viewport — a 0.97 scale on a full window reads as a
  zoom, not a settle.
- Reduced motion keeps the opacity fade and drops the scale, per AUDIT.md
  section 6: reduced motion means gentler, not zero.

## Repo conventions to follow

- This repo writes plain CSS inside a `<style>` block in each renderer HTML
  file. There is no CSS build step, no Tailwind, and no motion library. Do not
  add one.
- The drawer curve is already hand-typed in three places; imitate the value
  exactly: `src/renderer/explore.html:401`, `src/renderer/popover.html:106`,
  `src/renderer/settings.html:177`.
- Every animated rule in this repo is paired with a `prefers-reduced-motion`
  block. Exemplar to imitate: `src/renderer/explore.html:408`.
- The onyx the splash uses is
  `radial-gradient(125% 125% at 26% 20%, #2A2622 0%, #171514 45%, #0C0B0B 100%)`
  at `src/renderer/splash.html:39`. Do not change the splash.

## Steps

1. In `src/renderer/explore.html`, inside the existing `<style>` block, add the
   `body` / `body.revealed` rules and the `prefers-reduced-motion` block exactly
   as written in the Target section above. Place them immediately after the
   `:root{--rail:...}` rule at line 77 so they sit with the other top-level
   layout rules.

2. In `src/renderer/explore.html`, find the code that sends the
   `explore:ready` IPC message to the main process (search for
   `explore:ready`). Immediately before that send, add:

   ```js
   requestAnimationFrame(() => document.body.classList.add("revealed"));
   ```

   The `requestAnimationFrame` matters: adding the class in the same frame the
   styles are first applied can skip the transition entirely, because the
   browser may never observe the `opacity: 0` starting state.

3. Do not change `src/main.js`. `revealExplore()` already shows the window at
   the right moment; the fade now happens inside the page.

## Boundaries

- Do NOT touch `src/renderer/splash.html`. The splash is already correct.
- Do NOT animate the Electron `BrowserWindow` itself (no `setOpacity` loop, no
  `show()` timing changes). Native window opacity animation is expensive on the
  Intel integrated GPU this app targets, and issue #35 in this repo was a
  motion-performance regression on exactly that hardware.
- Do NOT change the 6-second fallback timer at `src/main.js:215`.
- Do NOT add dependencies.
- If step 2 cannot find an `explore:ready` send site, STOP and report rather
  than inventing one.

## Verification

- **Mechanical**: run `npm run audit` from the repo root. Expected output:
  `all checks passed`.
- **Feel check**: quit any running instance, then `npm start`, and watch the
  launch:
  - The splash card appears, breathes, and closes; the window content then
    fades and settles up rather than snapping in.
  - The fade starts from onyx, not from white or grey. A white flash means the
    body background is being painted before the rule applies — fix by
    confirming `background` on `body` is set before the transition.
  - There is no visible "jump" in size at the end; the scale settle should be
    almost subliminal.
  - In DevTools (open with the app's own menu), set the Animations panel
    playback to 10% and confirm opacity and transform run together on one curve,
    not staggered.
  - In DevTools Rendering, enable "Emulate prefers-reduced-motion: reduce",
    relaunch, and confirm the content still fades but does not scale.
- **Done when**: launching the app shows a continuous fade-up from onyx with no
  hard cut and no white flash, `npm run audit` passes, and reduced motion
  degrades to a plain opacity fade.
