What has been audited, what was found, and what was deliberately not checked.
Append rather than replace. A second pass should be a second pass, not a repeat.

STANDING INSTRUCTIONS
Verify against source, never against a description of source. A filename is not
evidence. A comment is not evidence. The code is.
"This is already right" is a valid and common finding. Inventing findings to
look useful is the failure mode of every reviewer.
Name what you did not check. A review implying coverage it did not do is worse
than a narrow one.

AUDITED SO FAR — 6 Aug 2026
Motion: four plans applied. No HIGH severity found. The codebase had no
`transition: all` anywhere and reduced-motion in 13 blocks across four files.
Palette: five tokens were Apple's published values verbatim, including the label
ramp. Moved off. `[data-contrast="more"]` deliberately still pure white and
black, because it is the accessibility mode.
Typography: Inter vendored, tabular figures on four numeric surfaces, thirteen
corner radii collapsed to five with an audit check enforcing it.
Receivers: two real gaps found and closed. The renderer identified as Chrome
rather than AuralFM, and pausing did not release the slot.

RECURRING TRAP IN THIS CODEBASE
Light-theme tokens live in TWO blocks per renderer file: a
`:root[data-theme="light"]` selector AND a `prefers-color-scheme` media query.
Any new token needs both or it silently inherits the dark value. This has caused
two bugs in one day.
