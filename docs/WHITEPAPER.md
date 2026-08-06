# The listener the machine can't see

*Working title. A position paper on extraction, listening, and what it costs to
build infrastructure that refuses both.*

Status: draft, 5 August 2026. Grew out of `docs/thesis.md` — a full academic
treatment that goes deeper on the theory. This is the shorter, first-person
version, and the audit of the longer one is at the bottom.

---

## The argument, up front

Three people describe the same machine from three angles, and none of them knew
they were doing it.

**Roshanak Kheshti** shows how the world music industry teaches you what the
Other is supposed to sound like before you ever hear them. She calls the space
where that happens the *aural imaginary*, and the industry's job is to keep you
in it: don't translate the lyrics, foreground the texture, sell the pleasure of
not-quite-understanding.

**Vladan Joler** maps the machine that does this at planetary scale. His
*Platopticon* is Plato's cave crossed with Bentham's prison — you sit alone
watching a show assembled for you, and everything you do while watching is
harvested. Prison, factory, and mine at once.

**Huey Newton** named the political shape of it fifty years early. The world is
communities connected through an empire rather than to each other. Reverse the
wiring — communities connected laterally, through infrastructure they own — and
you get what he called revolutionary intercommunalism.

Put them together and you get one claim: **decentralising the wires does not
decentralise the ear.** You can replace every server with a relay and still
build the aural imaginary, still assemble the dividual, still put a gatekeeper
in the middle. The protocol is not the politics.

What decides it is whether the act of *receiving* costs the receiver anything.

---

## Why shortwave is the reference case

Shortwave has a property that nothing built since has managed to keep: **there is
no upstream channel.**

Someone in rural Mali turning a dial is not producing anything. No click, no
dwell time, no engagement metric, no profile assembling in the background. The
signal arrives off the ionosphere and the listener's attention stays their own.
Not because a policy protects it — because there is physically nowhere for it to
go.

That is the bar. Every decentralised technology since should be measured against
it and most of them fail:

| | Upstream channel? | What leaks |
|---|---|---|
| **Shortwave** | None | Nothing. |
| **Mesh networks** | Local only | Escapes corporate ISPs; a community can still surveil itself. |
| **Nostr** | Yes, to relays | Relay operators see traffic. The dividual is distributed, not prevented. |
| **Blockchain** | Permanent and public | Perfects surveillance rather than escaping it. Every transaction, forever. |

The pattern is uncomfortable: **each step toward sophistication reopens the
channel.** Shortwave can't extract from you because it can't. A chain can, and
does, and calls it transparency.

---

## What this looks like when you build it

AuralFM is where I tested the argument, so I should say plainly what it is and
what it isn't. It's a macOS app: a photoreal globe with 38,342 radio stations
across 12,296 places, plus 837 shortwave receivers that strangers leave open for
anyone to borrow. No account, no server of mine, nothing recording what I played.

I didn't start from theory. I started from a problem — every AI coding tool makes
the front end fast and the back end dangerous, and I didn't want a backend to
defend. Radio turned out to be already-open infrastructure. The politics arrived
afterwards, when I read Kheshti and recognised the thing I'd been building
against.

Three things in the app answer her critique, and only one of them was on purpose
at the time:

**There's no producer.** Kheshti's whole apparatus is mediation — liner notes,
album art, a label boss telling a radio host what to listen for. Nobody sits in
that chair here. The station is broadcasting to its own local audience, on its
own schedule, for its own reasons. You're overhearing something that isn't
addressed to you, and that's a categorically different relationship.

The rule that follows: **every editorial layer moves this toward the thing it
criticises.** Recommendations, curated collections, mood browsing — each one puts
someone back in the producer's chair.

**Captions are the inversion.** Her industry withholds translation because the
pleasure depends on not understanding. Captions insist on comprehension. The
moment a Tehran broadcast becomes a sentence you can read, it stops being texture
and becomes someone complaining about traffic.

That one doesn't work yet. Whisper takes 39.6 seconds to transcribe six seconds
of audio on my 2019 Intel Mac. The plumbing is finished; the hardware isn't.
**The feature most aligned with the argument is the one I can't ship**, which is
worth stating rather than hiding.

**They can answer back.** The aural imaginary only works in one direction — the
listener builds the Other, the Other never speaks. Geohash chat over Nostr breaks
that. Someone in the cell you're listening to can reply.

---

## The receivers are the interesting part

837 KiwiSDRs. Someone's dipole in Iceland, a dish on Chatham Island, a wire
across a Bavarian garden. Each one is a private person's antenna, connected to
the internet, left open.

**It's the only audio in the app that isn't a stream server.** Every internet
station is an Icecast or HLS endpoint on somebody's box. The shortwave signal
reaches the antenna off the ionosphere with nothing in the middle. That's the
part that isn't a CDN.

Which means the etiquette isn't politeness, it's the whole thing working:

1. Never auto-connect. Explicit click only.
2. One session at a time. Ever.
3. Respect capacity — grey out full receivers rather than trying and failing.
4. Never retry a refused receiver. Offer another.
5. Honour inactivity timeouts instead of defeating them with keepalives.
6. Refresh the list on a crawl schedule, not at runtime.
7. Send a contactable User-Agent.

I know these matter because I broke them. Three receivers stopped answering after
this project over-probed them, and Celestrak IP-blocked us before that. The rules
exist to protect volunteers from the app, which is a strange thing to have to
write and the honest reason they're in code rather than in a README.

---

## Where I'd push back on my own argument

**Newton deserves more care than a software project usually gives him.** The
survival programs fed children, ran clinics, and taught school. A radio app is
not that, and any sentence implying otherwise should be cut. What survives the
comparison is narrower and still worth something: the Panthers' insight that
*the maintenance is the organising* — that distributing the newspaper built the
network more than the newspaper's contents did. That maps onto 837 volunteers
running receivers nobody pays them for. It does not make an app a survival
program, and I'd rather claim the small true thing than the large flattering one.

**"No backend" is a claim about ownership, not about servers.** The app talks to
NASA, NOAA, radio-browser, Open-Meteo and a set of Nostr relays. Those are all
servers. What's true is that none of them are mine, and none can log what I
listened to in a way that's linked to me. "Serverless" would be a lie. "Nothing
to sign into" is accurate.

**Offline-first is true of the atlas, not the radio.** Unplug the network and the
globe, the search, the 12,296 places and the star catalogue all still work. Not
one of the 38,342 stations will play. It's a working atlas of the world's radio
and not a working radio.

**The tagline is the aural imaginary in eight words.** *A window onto the world
you can listen to.* Kheshti's fieldwork label had the credo *"everything is
closer than you think"* and she takes it apart for exactly what mine does —
collapsing distance into availability. A window is one-way. The chat makes it a
door. The tagline hasn't caught up.

---

## What I'd want someone to take from this

Not the app. The test.

Ask of anything that calls itself decentralised: **what does it cost to
receive?** Not what it costs to publish, or to run a node, or to hold a key —
what does it cost the person who is only listening?

If the answer is nothing, you've built something the machine can't see. If the
answer is a click, a dwell time, a wallet address on a public ledger, then you've
moved the extraction rather than ended it, and you should say so.

Shortwave passes. Most of what's been built since doesn't. That gap is the
whole subject.

---
---

# Audit of `docs/thesis.md`

Checked every claim it makes about AuralFM against the source, and its external
claims against primary sources. **The internal sourcing is very good** — nearly
everything traces to a real line in a real file. Three things need fixing and two
are structural.

## Factually wrong

**Kheshti's affiliation.** The thesis says *"Professor of Theater, Dance, and
Performance Studies at UC Berkeley."* She is **Associate Professor of Ethnic
Studies at UC San Diego**, with affiliate faculty status in Critical Gender
Studies. Berkeley is where she held a President's Postdoctoral Fellowship, in
Gender and Women's Studies — which is likely where the confusion came from.

Both the institution and the discipline are wrong, in the first sentence of the
first theoretical section. And the correction *helps*: her home discipline being
Ethnic Studies rather than Performance Studies strengthens the race-centred
reading the thesis is building on.

**849 receivers.** The thesis quotes `DECENTRALIZATION.md` accurately — that
document says 849. The shipped data has **837**. Our document is stale, not the
thesis. Both should say 837 and note that the list moves; receivers come and go
weekly, which is itself the point about volunteer infrastructure.

## Verified correct

Everything else I checked held up, including things I expected to be invented:

| Claim | Source |
|---|---|
| The seven receiver rules, verbatim | `docs/DECENTRALIZATION.md:144–152` |
| *"the fast part is the front end and the dangerous part is the back"* | `README.md:36`, `docs/VISION.md:57` |
| *"solar flux N is too low for X MHz"* | Real template, `src/renderer/kiwi.js:260` |
| Value4Value refused over the missing `podcast:value` equivalent | `docs/DECENTRALIZATION.md:223–232` |
| 16 → 328 peers on geo-aware relay selection | `docs/ROADMAP.md:48` |
| `whisper-base` at 39.6s for 6s of audio | `src/renderer/captions.js` |
| 38,342 stations · 12,296 places · 227 countries | Verified against the catalogue |
| MeshLLM refusal, quoted | `docs/DIRECTION.md` |
| Bitcoin-vs-Monero donor privacy reasoning | `docs/BUSINESS.md` |
| Joler: Novi Sad, 2020, Digital Earth / Vertical Atlas, 33 concepts, all five policy lines, CC BY-NC-SA | extractivism.online, verbatim |
| Newton at Boston College, 18 November 1970 | Confirmed |

## Structural problems, in order of severity

**1. It is not a thesis, and calling it one is the risk.**

The document is written about AuralFM, using AuralFM's own documentation as its
evidence base, from inside the AuralFM project. Section 8.8 then grades the
project favourably on candour: *"The project's documentation is more rigorous
about its own limits than most academic work is about its subjects."*

That is the subject marking its own paper. An academic reader notices it in the
abstract and stops. **A white paper in the first person has no such problem** —
it argues a position and uses its own work as the example, which is normal and
honest. The theory doesn't need to change. The frame does.

**2. It over-claims independent arrival.**

Section 8.2 presents Bell as having *"independently discovered the critique."*
The instinct was genuinely his — he found Kheshti, read her, and said the
argument matched what he already thought. But `LISTENING.md` and its three
structural answers came out of a working session, not solitary discovery. That
is a collaboration, and saying so is a better story than the lone-practitioner
version, which any reader who checks the commit history will disbelieve.

**3. Newton is handled too loosely, and this is the one that could damage you.**

Section 6.2 says a mesh antenna on a Brooklyn rooftop *"is the same thing"* as
the Black Panther newspaper, and §8.4 calls the receiver etiquette *"a survival
program in miniature."* The survival programs fed children and ran medical
clinics. Equating them with software — however principled the software — is the
kind of claim that will be read as appropriating Black revolutionary history to
flatter a product, and it will be read that way by exactly the audience the
project most wants.

The narrower claim survives and is still good: **the maintenance is the
organising.** That's Newton's real structural insight, it genuinely maps onto
volunteer receiver operators, and it doesn't require pretending the stakes are
equivalent. Keep that. Cut every "is the same thing as."

**4. Nothing is measured against a control.**

AuralFM scores positively on nearly every cell of all three axis tables, graded
by the person who built it. Running **radio.garden** through the same three axes
would do more for the argument than another paragraph of praise — same globe
metaphor, no shortwave, no presence layer, a backend. That's a real comparison
and the framework would earn its keep.

**5. Register.**

842 lines of *"This thesis develops a cross-disciplinary theoretical framework
bridging…"*. Phrases like *astonishingly prescient*, *theoretically precise*, and
*the most remarkable feature* are doing work the evidence should do. The white
paper above is the register I'd suggest: same argument, first person, claims
sized to what can be shown.
