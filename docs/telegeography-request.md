# Data permission request — TeleGeography Submarine Cable Map

**Send to:** `cablemap@telegeography.com`
**CC (optional):** `press@telegeography.com`
**Fallback:** the contact form at <https://www2.telegeography.com/contact-us> if the address bounces.

**Subject:** Permission to use Submarine Cable Map data in an open-source desktop app

---

Hello,

I'm the developer of AuralFM, an open-source macOS app that lets people listen to
internet radio and borrowed shortwave receivers on a 3D globe. The source is at
<https://github.com/meltonbell/globefm>.

I'd like to draw the world's submarine cables as a toggleable layer on that
globe, using the GeoJSON your Submarine Cable Map publishes:

- `https://www.submarinecablemap.com/api/v3/cable/cable-geo.json`
- `https://www.submarinecablemap.com/api/v3/landing-point/landing-point-geo.json`

Before I use any of it I want to be clear about what I'd be doing and ask
whether you permit it, because I couldn't find licensing terms on the site and
the GitHub repository that used to host this data now returns 404.

**What I would do**

- Bundle a snapshot of both files inside the application, so the layer works
  offline. The app is designed to contact as few servers as possible, so I'd
  rather ship a copy and refresh it on releases than call your API at runtime.
  If you'd prefer runtime requests with a contactable User-Agent, or a specific
  refresh interval, I'll do it that way instead.
- Render the cable routes as lines and the landing points as markers, on a
  globe. No re-publishing of the raw files, and no API of my own serving them
  onward.
- Credit TeleGeography visibly in the layer itself and in the app's About
  screen, with a link back to submarinecablemap.com, in whatever wording you
  want.

**The part I want to be upfront about**

The app is free and open-source today. I do intend to add paid features later —
things like extra colour schemes — so I can't honestly describe this as a
non-commercial use, even though the cable layer itself would not be behind a
paywall. I'd rather tell you that now than ask for forgiveness later.

**What I'm asking**

1. Do you permit this use, and under what terms?
2. Is there attribution wording you want used?
3. If commercial use is the sticking point, is there a licence I can buy, or
   would you permit it if the cable layer stays free even when other features
   are not?

If the answer is no, that's a completely fine answer and I won't use the data —
I'll just leave the feature out.

Thank you for making the map. It's the reason most people know these cables
exist at all.

Best regards,
Melton Bell
meltonbell@icloud.com
https://github.com/meltonbell/globefm

---

## Why this is worth sending rather than guessing

There is no alternative source. OpenStreetMap returns **zero** submarine cables
under either `communication=line`+`location=underwater` or
`submarine=yes`+`communication:medium` — checked against Overpass. TeleGeography
is effectively the only public dataset of this kind.

Two facts make the permission question real rather than paranoid:

- The GitHub repository that used to publish this data, and that many projects
  linked to for its licence file, is gone (404).
- The FAQ page is a client-rendered app with no licence text in the HTML, and
  the JavaScript bundle contains no licence string either.

So the terms are genuinely unstated. The commercial disclosure in the email is
deliberate: a permission granted on a false premise is worth nothing the moment
the app charges for anything.
