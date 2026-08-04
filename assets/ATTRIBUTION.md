# Asset attribution

## Globe icons

Globe by **emilegraphics** via [the Noun Project](https://thenounproject.com)
(Creator ID 468375).

| File | Source | Bands | Use | Licence |
|---|---|---|---|---|
| `icon.svg` | `noun-globe-1654366.svg` | filled | Menu bar, favicon, and the .icns entries ≤64px | **Not yet purchased** — see below |
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

## Licence status — read before shipping

### `icon-line.svg` (#1654367) — licensed

Royalty-free licence purchased 4 August 2026. Perpetual, **non-exclusive**,
worldwide, unlimited use; no attribution required.

| | |
|---|---|
| Licensee | Melton Bell (Noun Project UserID 12647524) |
| Licensor | The Noun Project, Inc., on behalf of emilegraphics (Creator ID 468375) |
| Item | A-la-carte purchase of icon "Globe" #1654367 |
| Paid | $4.99 USD, 4 August 2026 |
| Charge | `ch_2U0n5ZOlQUEvnWfJ1rqC2k1s` |

Certificate: [`licenses/noun-project-1654367-license.pdf`](licenses/noun-project-1654367-license.pdf).
The unmodified 700×700 download is kept beside it as
[`licenses/noun-1654367-original.svg`](licenses/noun-1654367-original.svg), so the
adapted file can always be diffed against what was actually paid for.

**The invoice is deliberately not in this repo.** It carries an email address and
the last four digits of a card, and this repository is expected to go public when
#14 ships — git history is not something you can take back. It lives in the
Knowledge-Base vault at `04 Projects/AURALFM/licenses/`.

### `icon.svg` (#1654366) — NOT licensed

**This is a separate icon and it has not been bought.** Noun Project sells
a-la-carte licences per icon: the receipt above reads *"A-la-carte purchase of
icon 'Globe' #1654367"* and covers that file only. The filled glyph is a
different work, and the app currently ships it in the menu bar, the favicon and
every `.icns` entry at 64px and below — which is to say, in the most visible
place there is.

Either buy #1654366 (another $4.99) or drop it and render every size from
#1654367, accepting that the bands merge below about 32px. Until one of those
happens the app is distributing unlicensed artwork.

*This file previously said the licence "has been bought for these icons", plural.
That was not true. It is the kind of claim that only ever gets checked by
someone with standing to sue.*

### Two constraints in the Noun Project terms

Verified against
[thenounproject.com/legal/terms-of-use](https://thenounproject.com/legal/terms-of-use/)
on 4 August 2026:

- **A 1,000-unit resale cap.** Section 3.A: *"If you purchase a license to use an
  Icon on an item for resale, you may only sell up to 1,000 units of such item
  for each license purchased."* A free app is not resale and is unaffected. A
  paid app, or a paid tier, plausibly is — and 1,000 is not a large number for
  something meant to succeed. Worth asking Noun Project before money changes
  hands rather than after. See #15.
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
