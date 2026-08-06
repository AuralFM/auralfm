# Animation plans

Produced by the `improve-animations` skill against commit `b6d5aea`, using the
craft bar from Emil Kowalski's design engineering philosophy.

**Read this first.** The audit found no HIGH-severity issues. This is a
well-disciplined motion codebase: there is no `transition: all` anywhere, every
UI transition uses `ease-out`, `prefers-reduced-motion` is handled in 13 blocks
across four files, and the entrance curve already hand-typed in three places —
`cubic-bezier(.32,.72,0,1)` — is exactly the curve the playbook recommends for
drawers. These plans name and tidy what is already right, and add the one moment
that is genuinely missing.

## Plans

| # | Title | Severity | Category | Files | Status |
| --- | --- | --- | --- | --- | --- |
| [001](001-splash-handoff-fade.md) | Fade the globe in when the splash hands off | MEDIUM | Missed opportunity | 1 | DONE |
| [002](002-motion-tokens.md) | Consolidate easing and duration into tokens | MEDIUM | Cohesion & tokens | 3 | DONE |
| [003](003-press-feedback-scale.md) | One press-feedback scale for list rows | MEDIUM | Physicality | 2 | DONE |
| [004](004-eq-bars-scaley.md) | Drive the equaliser bars with transform, not height | MEDIUM | Performance | 2 | DONE |

All four are applied. Kept for the record of what was changed and why.

## Recommended order

**001 → 002 → 003 → 004**, which is highest emotional return first, then the
structural change, then two small correctness fixes.

001 is first because it is the only plan that adds something rather than
correcting something. It is the first thing every user sees, it happens once per
launch — which is the only frequency band the playbook allows a delight budget —
and it currently spends none of it.

## Dependencies

- **002 should land before 003 and 004 if all three are being done**, because it
  rewrites the `transition:` shorthand at two of the three sites 003 edits. Both
  orders work — 003 and 004 change only `scale()` and keyframe bodies, which 002
  does not touch — but doing 002 first avoids a needless second pass over the
  same lines.
- **001 is independent.** It can be done at any point, before or after the others.
- **003 and 004 are independent of each other.**

## Deliberately out of scope

Two findings from the audit were not turned into plans:

- **`#q` transitions `width` on focus** (`src/renderer/explore.html:176`),
  relaying out the toolbar that also holds the live markets ticker. The honest
  fix is to delete the width transition rather than engineer around it, since an
  `<input>` cannot be scaled without distorting its text. Low frequency —
  focusing search — so it was ranked below the four above.
- **`tickUp` / `tickDn` hardcode `#30D158` and `#FF453A`**
  (`src/renderer/explore.html:102-103`), which are Apple's systemGreen and
  systemRed. The effect is that the market ticker's up/down colours never follow
  the user's chosen palette. This belongs with the palette work rather than with
  motion, and should be picked up there.

## Not re-litigated

`animation-timing-function:linear` on `.dot.sig` (`src/renderer/explore.html:604`)
is a documented deliberate choice — the comment explains that a sine wave reads
as a heartbeat and a fading shortwave signal does not have one. Left alone.
