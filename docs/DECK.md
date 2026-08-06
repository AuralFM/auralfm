# AuralFM — pitch narrative

> A window onto the world you can listen to.

Content for the deck, in the section order you specified, built on SCQA
(Situation → Complication → Question → Answer). **This is the argument, not the
design.** Every number here is measured and traceable to a commit; where
something is unknown it says so rather than filling the box.

---

## Cover

**AuralFM** · A window onto the world you can listen to.

*A note on the tagline, because it is load-bearing and slightly wrong.* A window
is one-way — you look out, nothing looks back. The app now has a chat in which
someone in Tehran can answer you. If the essence is the window, the chat is
decoration. If the essence is contact, the tagline undersells the product. Worth
resolving before it is printed on anything.

---

## 1. Summary (SCQA)

**Situation.** Radio never went away. 38,342 stations broadcast right now, plus
around 800 shortwave receivers whose owners leave them open to strangers. It is the
most widely distributed live medium on Earth and the least visited.

**The one-line version, and it should open the room:** *every consumer app is now
a liability surface — this one has nothing to steal.*

**Complication.** Discovery collapsed. The feed replaced the dial, and the feed
is optimised for engagement, which means for tension. Meanwhile the thing that
actually connects places — a signal you can hear from somewhere you have never
been — has no front door.

**Question.** What would it look like to make the whole planet audible, without
becoming another platform that watches you to do it?

**Answer.** A photoreal globe you listen to. Spin it, hear a place, see the
terminator move over the cities, and — if you want — say something to whoever
else is there. Offline-first. No backend of our own. Collects nothing.

---

## 2. Problem

- **Discovery died with the dial.** Streaming put every station online and no
  way to wander between them. Search assumes you already know the name.
- **The feed is adversarial.** Algorithmic timelines optimise for reaction. Radio
  is the opposite technology: it runs whether or not you engage, and it has no
  incentive to upset you.
- **Locality is the missing axis.** A station in Marfa and a station in Lagos are
  equidistant in a search box and very far apart in reality. Place is the
  information that got thrown away.
- **Social layers cost you.** Every app offering "who else is here" wants an
  account, and an account is a durable record of what you listened to.

---

## 3. Solution

A globe as the interface, because place is the axis that was missing.

The design constraint that makes it defensible: **no backend of our own.** The
station directory is a public dataset. Presence and chat ride other people's
Nostr relays. Space weather comes from NOAA, propagation from the WSPR network,
the schedule from EiBi. If AuralFM disappears tomorrow, none of the
infrastructure it used goes with it.

That is not asceticism. It is the reason the privacy claim is true rather than
promised: there is no server to log you, so there is no policy to trust.

---

## 4. Product

Shipped and measurable today:

| | |
|---|---|
| **Stations** | 38,342 across 12,296 places |
| **Shortwave** | Around 800 borrowed KiwiSDR receivers, real tuning against 9,289 scheduled broadcasts, bandwidth and fine-tune controls |
| **The sky** | 5,044 stars, 89 named constellations, the ecliptic and zodiac, naked-eye planets computed live |
| **The Earth** | Correct day/night terminator, live cloud cover, NASA city lights at 8192×4096 |
| **Propagation** | WSPR arcs, solar flux, K-index — the ionosphere made visible |
| **Presence** | Geohash rooms over Nostr; 328 peers seen in one measurement |
| **Reach** | Five languages, seven palettes, offline-first |

**Demo beat for the deck:** spin from Houston to Rio, hear it, watch the night
line cross the city lights, then notice someone in that cell said something.

---

## 5. Business Model

**Undecided, and the deck should say so.** What is true:

- There are **no server costs**. Nothing forces a model. That is a luxury and
  should be spent deliberately, not panicked away.
- Palettes are already split free/premium in code — the cheapest possible test.
- Sponsorship fits the position best; the playbook is in `docs/SPONSORSHIP.md`.
- **What would contradict the product:** anything requiring an account, anything
  phoning home to count you, anything putting shortwave or chat behind a wall.
  Those are the parts that make the argument, not the parts that make money.

The moment money is involved, three licences need re-checking: the Noun Project
icon, TeleGeography (unanswered), and any CC-BY-NC source.

---

## 6. Market Opportunity

**Do not invent a TAM.** Numbers that can actually be defended:

- Radio's audience is measured in billions and is not the market; the market is
  people who would use a *better front door* to it.
- The nearest comparable — radio.garden — demonstrated appetite at scale with a
  far thinner product and no privacy position.
- Podcast market sizing is a *different* market and citing it would be a tell.

Honest framing: this is a category-of-one product in a category that has not
been contested since radio.garden. The opportunity is definitional, not
extractive — and an investor who wants a TAM slide may be the wrong investor.

---

## 7. Competition

| | What they do | What they don't |
|---|---|---|
| **radio.garden** | The globe metaphor, beautifully | No shortwave, no propagation, no presence, no offline, web-only |
| **Streaming platforms** | Catalogue and recommendation | Not live, not local, not place-shaped |
| **SDR web clients** | Real shortwave receivers | Hobbyist UI, no discovery, no map |
| **Social audio (Spaces, Stationhead)** | Live talk | Requires accounts and identity; not radio |

The unoccupied intersection: **live + local + private + offline.** Nothing else
sits there, and the reason is that everyone else needs a server.

---

## 8. Growth Strategy

**The blocker first:** there is no code signing and no release, so the app has
exactly one user. Everything below is theoretical until #4 and #14 land.

Then, in order:
1. **The shortwave and ham communities.** They already know what a KiwiSDR is,
   they are underserved by beautiful software, and they talk to each other.
2. **The Nostr and bitchat overlap.** We are already in their rooms, using their
   convention. That is a distribution channel that costs nothing.
3. **The design press.** The globe is the demo. It shows well in a screenshot
   and better in ten seconds of video.
4. **Station operators.** A small station discovering it is on a globe is a
   story it will tell its own audience.

---

## 9. Traction

**Be scrupulous here — inflating it is the fastest way to lose the room.**

- Working product, verified end to end, not a prototype.
- Zero users beyond the maintainer, because it cannot yet be installed.
- The measurable technical traction is real and unusual: interoperating with an
  existing 34k-star network's convention, and going from 16 to 328 observable
  peers by fixing relay selection.

---

## 10. Financials

Nothing to project yet. What can be said:

- **Marginal cost per user: effectively zero.** No servers, no bandwidth, no
  per-seat licences.
- Known costs to date: a $3 icon licence and an Apple Developer account.
- This is the rare product where the interesting financial fact is how little
  the cost curve moves with growth.

---

## 11. Team

Melton Bell III — founder, design and direction.

The narrative that belongs here, because it is the strongest slide in the deck:
great-grandmother's police scanners; the Tom Joyner Show as a childhood alarm
clock; radio as the technology that was always there while everyone looked past
it. That is why this product exists and why it is shaped the way it is.

---

## 12. Funding

To be defined. Frame against what money would actually buy, given costs are near
zero: **time, design, and licensing** — not infrastructure. Be ready for "why do
you need money if it costs nothing to run", because it is the obvious question
and the honest answer is a good one.

---

## 13. Summary

Radio is the last live medium that is everywhere and unowned. AuralFM makes it
navigable by place, keeps it private by having nothing to keep, and adds the one
thing radio never had: the ability to answer back.

---

## 14. Appendix

- `docs/PRIVACY.md`, `docs/DECENTRALIZATION.md` — the position, in detail
- `docs/ROADMAP.md` — what is next and what is refused
- `docs/SPONSORSHIP.md` — the funding playbook
- Issues #4, #14 — the release blockers
- Licence positions on Meshtastic, Matrix, WSJT-X, bitchat — #28
