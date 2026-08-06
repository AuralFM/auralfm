# 002 — Consolidate easing and duration into tokens

- **Status**: TODO
- **Commit**: b6d5aea
- **Severity**: MEDIUM
- **Category**: 7 — Cohesion & tokens
- **Estimated scope**: 4 files, token block plus ~40 call-site substitutions

## Problem

There are no motion tokens. Every curve and duration in the app is hand-typed
at its call site: roughly 41 `transition:` and `animation:` declarations across
four renderer files, with durations clustering at `90ms`, `.12s`, `.15s`, `.18s`
and `.25s`, and the same custom cubic-bezier written out three separate times.

```css
/* src/renderer/explore.html:401 — current */
    animation:newsin .22s cubic-bezier(.32,.72,0,1);
```
```css
/* src/renderer/popover.html:106 — current */
  body.entering{animation:materialize .26s cubic-bezier(.32,.72,0,1);transform-origin:top center}
```
```css
/* src/renderer/settings.html:177 — current */
    transition:transform .18s cubic-bezier(.32,.72,0,1);
```

Three hand-typed copies of one curve is a consolidation finding under AUDIT.md
section 7. It also means the value cannot be changed once — a future adjustment
has to find all three, in three files, and any missed copy silently drifts.

Worth stating plainly for the executor: **the values in this codebase are already
correct.** `cubic-bezier(.32,.72,0,1)` is exactly the `--ease-drawer` curve
recommended in AUDIT.md section 2, and `ease-out` is used on essentially every
UI transition, which is the correct default. This plan is not a retune. It is
naming what is already there so it stops being retyped.

## Target

A motion token block added to the `:root` in each renderer file that has motion,
matching the existing colour-token pattern, plus call sites referencing the
tokens.

```css
/* target — add to the :root block */
    --ease-out:cubic-bezier(.23,1,.32,1);
    --ease-in-out:cubic-bezier(.77,0,.175,1);
    --ease-drawer:cubic-bezier(.32,.72,0,1);
    --dur-press:90ms; --dur-hover:.12s; --dur-control:.15s;
    --dur-panel:.22s; --dur-reveal:.42s;
```

Curve values are copied verbatim from AUDIT.md section 2 and must not be
approximated. `--ease-drawer` is the value already in the codebase.

Substitution rules — apply mechanically, do not exercise judgement:

| Current | Becomes |
| --- | --- |
| `cubic-bezier(.32,.72,0,1)` | `var(--ease-drawer)` |
| `90ms ease-out` on a `transform` in an `:active` rule | `var(--dur-press) var(--ease-out)` |
| `.12s ease-out` on `background` / `color` / `opacity` | `var(--dur-hover) var(--ease-out)` |
| `.13s` / `.14s` / `.15s` / `.16s` `ease-out` | `var(--dur-control) var(--ease-out)` |
| `.18s` / `.2s` / `.22s` / `.25s` `ease-out` | `var(--dur-panel) var(--ease-out)` |
| `80ms ease-out` on a `transform` | `var(--dur-press) var(--ease-out)` |

Leave alone, deliberately:

- `ease-in-out` on `@keyframes pulse`, `flutter` and `eq` — these are ambient
  oscillations, and `ease-in-out` is correct for them per AUDIT.md section 2.
- `animation-timing-function:linear` on `.dot.sig` at
  `src/renderer/explore.html:604`. The comment above it documents a deliberate
  choice; AUDIT.md hard rule 5 says do not re-litigate settled decisions.
- The `2.4s`/`2s`/`1.1s`/`.9s` infinite-animation durations. They are ambient,
  not UI transitions, and the sub-300ms UI budget does not apply.

## Repo conventions to follow

- Tokens live in a `:root{}` block at the top of each file's `<style>`.
  Exemplar: `src/renderer/explore.html:9-14`.
- **`explore.html` declares its tokens twice** — once at `:root` (line 9) and
  again at `:root[data-theme="dark"]` (line 30), with identical values. Motion
  tokens do not vary by theme, so add them ONLY to the first `:root` block at
  line 9. Do not duplicate them into the `data-theme` block.
- Declarations in this repo are written compactly, several per line, without
  spaces after colons. Match that style.

## Steps

1. `src/renderer/explore.html` — add the motion token block to the `:root` at
   line 9, after the `--accent` line.
2. `src/renderer/explore.html` — substitute all call sites per the table above.
3. `src/renderer/popover.html` — add the same token block to its `:root`, then
   substitute its call sites.
4. `src/renderer/settings.html` — same.
5. `src/renderer/splash.html` — add nothing. Its only animation is the `breathe`
   keyframe, which is ambient and out of scope. Leave the file untouched.
6. Re-run the grep `grep -c 'cubic-bezier' src/renderer/*.html`. Expected: the
   only remaining literal cubic-beziers are the three token definitions
   themselves (one per file that got a block).

## Boundaries

- Do NOT change any duration or curve to a different value. This is a rename,
  not a retune. If a call site looks wrong to you, leave it and note it.
- Do NOT touch `src/renderer/doc.html` — it has no motion at all (verified:
  zero `transition`, `animation` or `@keyframes` declarations).
- Do NOT touch `src/renderer/splash.html`.
- Do NOT add tokens to the `:root[data-theme="dark"]` block.
- Do NOT add dependencies or a CSS build step.
- If the count of `transition:`/`animation:` declarations you find differs
  materially from ~41, the file has drifted since commit b6d5aea — STOP and
  report.

## Verification

- **Mechanical**: `npm run audit` from the repo root, expected `all checks
  passed`. Then `grep -n 'cubic-bezier' src/renderer/*.html` and confirm every
  remaining hit is a token *definition*, not a use.
- **Feel check**: launch with `npm start` and confirm nothing changed
  perceptibly. This plan is correct only if it is invisible:
  - Hover a station row, a toolbar button and a layer row — same speed as before.
  - Press and hold a station row — the press scale still responds immediately.
  - Open the headlines panel — the slide-in still uses the drawer curve.
  - In DevTools, inspect any transitioned element and confirm the computed
    `transition-timing-function` resolves to a real cubic-bezier, not the
    string `var(--ease-out)` (an unresolved var means the token block landed in
    the wrong scope).
- **Done when**: no literal `cubic-bezier` remains outside the token blocks, the
  app looks and feels identical, and `npm run audit` passes.
