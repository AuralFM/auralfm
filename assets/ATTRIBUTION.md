# Asset attribution

## Globe icons

Globe by **emilegraphics** via [the Noun Project](https://thenounproject.com)
(Creator ID 468375).

| File | Source | Bands | Use | Licence |
|---|---|---|---|---|
| `icon.svg` | `noun-globe-1654366.svg` | filled | Menu bar, favicon, and the .icns entries ≤64px | Royalty-free, purchased 4 Aug 2026 |
| `icon-line.svg` | `noun-globe-1654367.svg` | outlined | The .icns entries ≥128px, About panel | Royalty-free, purchased 4 Aug 2026 |

**Two glyphs, on purpose.** The outlined globe is beautiful at 128 and above and
collapses into a solid disc at 32, because its latitude lines merge once they are
under a pixel apart. The filled globe keeps its bands legible down to 16.
Carrying different artwork at different sizes is what the `.icns` format is for.

Both adapted for AuralFM: cropped from a 100×125 viewBox to 100×100, embedded
attribution text removed, and `fill` set to `currentColor`.

**No separate light/dark files are needed.** `currentColor` makes each icon
inherit the surrounding text color, so one file renders correctly on both a
light and a dark menu bar.

---

## Licence status — both glyphs are licensed

Royalty-free licences for **both** icons were purchased on 4 August 2026.
Perpetual, **non-exclusive**, worldwide, unlimited use; no attribution required.
Licensee Melton Bell (Noun Project UserID 12647524); licensor The Noun Project,
Inc. on behalf of emilegraphics (Creator ID 468375).

| Icon | File | Charge | Paid | Certificate |
|---|---|---|---|---|
| #1654366 (filled) | `icon.svg` | `ch_2U0nO0OlQUEvnWfJ0qe7c0jl` | $4.99 | [`licenses/noun-project-1654366-license.pdf`](licenses/noun-project-1654366-license.pdf) |
| #1654367 (outlined) | `icon-line.svg` | `ch_2U0n5ZOlQUEvnWfJ1rqC2k1s` | $4.99 | [`licenses/noun-project-1654367-license.pdf`](licenses/noun-project-1654367-license.pdf) |

Noun Project licenses per icon — each receipt reads *"A-la-carte purchase of
icon 'Globe' #…"* and covers exactly one work — so shipping two glyphs needed
two licences. It briefly shipped with only one.

**The shipped files were checked against what was paid for**, not assumed to
match from their filenames. Each licensed original and each shipped SVG was
rasterised to 128px and compared on alpha:

| Comparison | Ink differs |
|---|---|
| licensed #1654366 vs `icon.svg` | **0.07%** — same artwork |
| licensed #1654367 vs `icon-line.svg` | **0.01%** — same artwork |
| licensed #1654366 vs `icon-line.svg` | 41.58% — confirms these are genuinely two different works |

The unmodified 700×700 downloads are kept in `licenses/` as
`noun-1654366-original.svg` and `noun-1654367-original.svg`, so the adapted
files can be re-checked against the purchase at any time.

**The invoices are deliberately not in this repo.** They carry an email address
and a card's last four digits, and this repository is expected to go public when
#14 ships — git history is not something you can take back. Both live in the
Knowledge-Base vault at `04 Projects/AURALFM/licenses/`.

### Two constraints in the Noun Project terms

Verified against
[thenounproject.com/legal/terms-of-use](https://thenounproject.com/legal/terms-of-use/)
on 4 August 2026:

- **A 1,000-unit resale cap.** Section 3.A: *"If you purchase a license to use an
  Icon on an item for resale, you may only sell up to 1,000 units of such item
  for each license purchased."* A free app is not resale and is unaffected. A
  paid app, or a paid tier, plausibly is.

  **Owning two licences does not buy 2,000 units.** They are licences to two
  *different* icons, and the app ships both, so each independently caps the same
  item at 1,000 — the binding limit is still 1,000. Raising it means buying
  further licences of *the same* icon, not another icon. Worth confirming with
  Noun Project before money changes hands rather than after. See #15.
- **The trademark restriction does not reach Icons.** Their "Restricted
  Activities" list — which includes *"use in trademarks, trade names, service
  marks, or logos"* — sits in section 3.B and governs **Photos**. So using this
  as the app icon is not prohibited. But the licence is explicitly
  **non-exclusive**: the same globe is available to anyone else for $4.99. It can
  be the app's icon; it cannot be a mark anyone could own or register. A
  defensible brand mark needs original artwork. See #21.

---

The credit stays in the About panel regardless of what the licence compels. It
costs nothing, it is true, and crediting the person who drew the thing is the
right default.
