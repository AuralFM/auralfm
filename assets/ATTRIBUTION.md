# Asset attribution

## The marks are ours

Every icon in the app — the globe, the three dots, the speakers, the gear, both
bluetooth marks, and the globe-with-a-plane — is drawn by **Melton Bell III** and
owned outright. No licence, no cap, no attribution owed to anyone, and nobody
else can buy the same artwork.

They ship as filled paths on their own viewBoxes rather than redrawn onto the
24×24 stroke grid the rest of the set uses. That is deliberate: refitting
somebody's artwork to a convention is how it stops being theirs. The one change
made is that `fill="black"` is stripped so `currentColor` decides the colour — a
hard black mark disappears against onyx.

| File | Use |
|---|---|
| `icon.svg` | The globe. Menu bar, favicon, tray menu, Dock, and every `.icns` entry from 16 to 1024. |

**One glyph, at every size.** There used to be two, because the licensed
outlined globe collapsed into a solid disc at 32px — its latitude lines merged
once they were under a pixel apart — while the filled one held. Melton's mark has
the continents knocked out of a filled disc, so the shapes carrying it are chunky
enough to survive 16px and clean enough at 1024. Two glyphs was a workaround for
artwork that could not do both.

**No separate light/dark files.** `currentColor` makes the mark inherit the
surrounding colour, so one file renders correctly on a light or a dark menu bar.

---

## The Noun Project globes: paid for, shipped, and now replaced

Royalty-free licences for two globes by **emilegraphics** (Creator ID 468375)
were purchased on 4 August 2026 at $4.99 each — perpetual, non-exclusive,
worldwide. They were the app's icon until Melton's globe replaced them.

| Icon | Charge | Certificate |
|---|---|---|
| #1654366 (filled) | `ch_2U0nO0OlQUEvnWfJ0qe7c0jl` | [`licenses/noun-project-1654366-license.pdf`](licenses/noun-project-1654366-license.pdf) |
| #1654367 (outlined) | `ch_2U0n5ZOlQUEvnWfJ1rqC2k1s` | [`licenses/noun-project-1654367-license.pdf`](licenses/noun-project-1654367-license.pdf) |

The certificates and the unmodified originals stay in `licenses/`. The licences
are perpetual and were exercised while the icons shipped, so keeping the proof is
not optional — every released build up to this point contains that artwork, and
those builds do not stop existing.

**Two constraints went away with the artwork**, and both were real:

- **The 1,000-unit resale cap** (their terms, section 3.A) would have bound any
  paid app or paid tier at 1,000 units. Owning two licences did not buy 2,000:
  they covered two *different* icons and the app shipped both, so each
  independently capped the same item at 1,000. That ceiling is gone. See #15.
- **The licence was explicitly non-exclusive** — the same globe was available to
  anyone else for $4.99. It could be the app's icon; it could never be a mark
  anyone could own or register. A defensible brand mark needs original artwork,
  and now there is one. See #21.

**The invoices are deliberately not in this repo.** They carry an email address
and a card's last four digits, and this repository is expected to go public when
#14 ships — git history is not something you can take back. Both live in the
Knowledge-Base vault at `04 Projects/AURALFM/licenses/`.

The credit to emilegraphics stood in the About panel for as long as the artwork
shipped, which was the right default. It has been replaced now that the artwork
has.

## Typefaces

**Inter** — SIL Open Font License 1.1. Vendored at `assets/fonts/InterVariable.woff2`,
licence at `assets/fonts/Inter-LICENSE.txt`. The OFL explicitly permits bundling
and redistribution, including inside a shipped application, so this one is free
of conditions we have to track.

**TBJ Monodrip Inktrap** — Taboja Studio, licensed to Melton Bell III through
Envato Elements on 6 August 2026, item licence `WBJ67S4UYL`.

> **Not in this repository, and not in the app.** Envato Elements' licence says
> plainly: *"You cannot incorporate or distribute the Font within an End
> Product."* It permits *"incorporating text or a design created using a Font
> into an End Product"* — so the typeface may be used to draw the wordmark,
> headers and marketing artwork, and those **outlined or rasterised** results
> may ship. The font file itself may not, and it must never be committed here:
> the repository is Apache 2.0 licensed, and that would purport to grant recipients
> rights over a file we have no power to sublicense.
>
> The licence is also revocable and tied to an active subscription at the time
> the end product is completed. Keep the certificate.

---

## Towns and regions: GeoNames

Where a station gave only its town or region, AuralFM places it using
[GeoNames](https://www.geonames.org) (`cities1000`, `admin1CodesASCII`,
`countryInfo`), licensed under
[Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/).
The data is read at build time by `scripts/lib/gazetteer.mjs` (in the catalogue repository, AuralFM/catalogue) and is not shipped
as a file; the places it produced are in the station catalogue.
