# AuralFM — why this exists

Recorded from Melton's own account, 4 August 2026, because the reasoning behind
this project is better than the feature list and had been living only in a chat
log.

---

## The name came first

*AuralFM* is years old. The first attempt at it was a Clubhouse-shaped app,
built during the COVID shutdown when Clubhouse was the hottest thing going —
and specifically **Clubhouse before it was overrun by the masses**, which is the
part worth holding onto. Stationhead was the other one: still niche, still
interesting, still small.

What that first version wanted was simple: *listen in*. Not perform, not
broadcast, not build an audience. Listen to people.

## What it is a reaction to

**SiriusXM, and what it became.** **iHeart, and the monopoly it holds.** Those
are the incumbents, and neither is the thing.

**And the algorithm, which is the real one.** Playlists today are sterilised to
the point where they do not sound normal any more. There is no connection in
them. The tell, in Melton's own words:

> Most of my playlists on Tidal, Spotify, any of the DSPs are pretty much music
> from 2010 and older, going back to the 1960s. As a person in my 30s, why am I
> listening to Red Hot Chili Peppers in 2026, consistently?

Podcasts are heading the same way.

## What it is a reaction *toward*

**radio.garden**, by Jonathan Puckey — one of his favourite designers — and the
thing he kept going back to. Tokyo. Hawaii. Kenya. South Africa. Iceland. Sounds,
music and conversations you would never be served, from a perspective you would
never otherwise get.

**The Tom Joyner Morning Show**, which was his alarm clock for years, and the
specific feeling of waking up to a human voice rather than a tone.

**The radio stations in Grand Theft Auto**, which are — precisely — low-key
perfection. Somebody underground, talking about god knows what, from somewhere
strange. That is the register.

## The insight that made it a *technical* project

This is the part that deserves to lead the pitch, because it is not a feature
and it is not sentiment.

Melton has been building with AI coding tools and running into the thing
everyone building that way runs into: **the backend is where it goes wrong.**
Security, secrets, data you did not mean to keep, a server you now have to
defend. The whole discourse around "vibe coding" is that the fast part is the
front and the dangerous part is the back.

So the question became: *what is the alternative?*

> Lo and behold, listening to radio.garden, it hit me: a radio station. All these
> things are just open to use.

**A product where there is no backend to get wrong.** Not as an aesthetic
preference and not as a cost saving — as a direct answer to a real and current
engineering problem. The station catalogue is a public dataset. NASA gives away
the Earth. NOAA gives away the space weather. The receivers belong to
volunteers. The chat rides other people's relays.

Nothing to breach, because nothing is held.

That is why "offline-first, no backend of our own, collects nothing" is the
positioning rather than a footnote — and why the Nostr and bitchat work matters
beyond being clever. It is the same instinct that drew him to Block and to Jack
Dorsey's arguments about decentralisation and statelessness: **build the thing
so that there is no centre to capture.**

## Where it goes

> Completely decentralised, no server, no backend, just vibes, just AuralFM.

Two ambitions beyond the app:

- **Something people can build on.** Not a product with an API, a thing with an
  open shape.
- **Hardware, eventually.** LoRa, or something like it. The instinct that keeps
  pulling toward Meshtastic is this one, and it is right even though the licence
  answer was no — see #28, and the RTL-SDR note in the roadmap, which is the
  nearer version of the same idea.

## The person

Melton Bell III — multidisciplinary designer, Houston, working since 2015.
Brand strategy, visual identity, package design. His own capabilities deck reads
**"Strategic Design Partner · Diagnostic-led Brand & UX Strategy"**, set in white
on near-black.

Two things from his own writing about his practice that this project should be
held to, because they are already true of it:

> I deeply desire to create demonstrably **non-derivative** products.

> The company's size is less important to me than adequately grasping the scale
> of the needs of those who connect to me.

The first is why AuralFM is not another radio.garden. The second is why the
shortwave receivers — 837 volunteers' machines, treated with etiquette rules
written down and enforced in code — are handled the way they are.

## A note on the brand, since it is now settled

The capabilities deck already answered the palette question that #21 was
circling: **onyx and bone**. Near-black, white type, wide neutral sans, a great
deal of air, nothing shouting. The app's default palette is the deck's palette.
They should stay the same thing.

---

## For the deck

The SCQA in `docs/DECK.md` should open on the insight, not the nostalgia. The
nostalgia is the *why he built it*; the insight is the *why it is defensible*:

**Every consumer app is now a liability surface. This one has nothing to steal.**

The Tom Joyner story is the closing slide, not the opening one.
