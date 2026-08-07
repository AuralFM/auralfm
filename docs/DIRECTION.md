# Direction

A systems and architecture plan arrived on 5 August 2026 covering UI fixes,
theming, a broadcasting knowledge base, hardware equivalences and decentralised
compute. Recorded here as **direction, not backlog** — most of it should shape
what gets built rather than be built now.

Sorted by what it actually is, because the document mixes four different kinds
of thing and they need different answers.

---

## Already true

Worth knowing before anything is scheduled.

- **Manual bandwidth control exists.** The tuner has it (`id="bw"`), along with
  fine tuning. That is one of the two Choyong LC90 equivalences already shipped.
- **The peers question is already answered in code.** `paintChatHead` distinguishes
  everyone the relays can see from the people in *this* cell, because an early
  version read "Near Lisbon · 11 listening" while the eleven were in Toronto and
  Tehran. The number is right; it is just not explained anywhere a user can see.
  Surfacing it in Settings is presentation, not plumbing.
- **News already localises** — 58 countries have a local edition. The gap is
  sub-national drill-down, not localisation itself.
- **Dot scaling exists** as an accessibility preference (`DOT_SCALE`, normal and
  large). The receiver-size problem is separate and real; see below.

---

## Confirmed bugs, with the specifics

Measured rather than assumed, so these can be fixed without re-diagnosing.

**Receiver dots are roughly 2.5× the size of station dots.** Not a perception
issue. Receivers are a flat `0.28`; stations are `0.09 + √count × 0.013`, so a
place with three stations renders at about `0.11`. The receiver has to be
findable, but 0.28 in dense Europe is why clicks land on the wrong thing.
Somewhere near `0.14` matches a typical station dot while staying distinct by
colour. One line.

**The favourites/shortwave tab transition.** Described precisely enough to
reproduce: switching to Shortwave while in Favourites keeps the favourites list
and its counts until an unrelated click forces a repaint. That is stale state
surviving a tab change, and it is the same class of bug as the dial that showed
on places — a view that does not clear what it no longer owns.

**Dead space while the waterfall prepares.** Layout reserving room for something
that has not arrived. The `[hidden]` discipline already in the codebase is the
right tool.

**Favourites capped at six.** Six is a menu-bar-app number. A globe with 12,296
places is not a six-favourite product.

---

## The best idea in the document

**Tie the on-air indicator to signal quality** — erratic and jumpy on a weak
shortwave path, steady on a clear FM stream.

This is the strongest thing here because it makes the interface *tell the truth
about physics*. Everything else in the app already does that: the terminator is
where it really is, the bands really are open or closed, the receiver really is
someone's antenna. A pulse that reflects what the signal is actually doing
belongs in that set.

**It is achievable for shortwave and not for internet streams**, and the
asymmetry is worth designing around rather than hiding. We decode the shortwave
audio ourselves — the PCM is right there, so a signal-quality estimate is
arithmetic. An internet stream either arrives or does not; there is no analogue
signal to measure and a fake jitter would be a lie in an app that does not tell
them.

So: **steady for streams, live for shortwave.** The difference between the two
becomes information rather than an inconsistency.

**The related idea is just as good:** with the lock off, scrolling the globe
should move the location, the station list and the chat cell together, like
sweeping a dial. That is the product's whole metaphor made literal, and the
pieces already exist independently.

---

## Where this conflicts with decisions already made

Two items, and both need a deliberate answer rather than quiet accommodation.

### Discord-style theming versus the interface discipline

The document asks for a theming engine "inspired by Discord's profile and
interface customization (e.g., Nitro's gradient chrome)" while also preserving
"the Apple-like structure and foundational translucent/tinted design
principles."

**Those two things fight.** The direction set in July was explicit: no Apple
emoji, system-grade icons, "very professional and serious," and an interface
measured against Apple's HIG. Gradient chrome is the opposite aesthetic — it is
expressive, personal and loud, and it is why Discord looks like Discord.

There is also a structural reason to be careful. Seven palettes already exist,
all free as of today, and they were built on a rule: **a palette touches the
things around the planet, never the planet.** The dominant surface is real
satellite imagery and tinting it destroys the property the app is built on.
Gradient chrome pushes directly against that boundary.

**Recommendation:** deepen what exists rather than import another product's
visual language. Custom accent colour, and letting someone build a palette from
the same five surfaces the built-in ones use, gets most of the expressive range
without the app starting to look like something else. If the real goal is
*personality*, the honest place for that is the community, not the chrome.

### MeshLLM, and the rule set last night

This is the important one.

The document proposes pooling community compute to power in-app features —
transcription, voice search — "ensuring no data is ever sent to a centralized
corporate server."

**The premise is inverted.** Block's own write-up is explicit: *"prompts and any
data sent to another machine are visible to its owner, and you are trusting the
results that come back."*

So routing a listener's audio through a community member's GPU means **that
community member can read it**. Compared with Hugging Face — which receives
weights requests and never the audio — this is not more private. It is a named
individual seeing what a stranger is listening to, with no policy, no
accountability, and no way to withdraw it.

Set against the instruction given last night — *"for no reason should we gather
any information from a user, let's be very militant"* — this is the one proposal
in the document that fails on its own terms.

There is a second, smaller problem: it would put a live network dependency in
the app's critical path, which breaks the line written into `docs/BUSINESS.md`
today — *the app must never depend on it.*

**Where MeshLLM is genuinely fine:** across the maintainer's own machines. A
laptop borrowing a desktop's GPU is one person's hardware, and that is a real
answer to the captions performance problem without anyone else seeing anything.

**Recommendation:** keep it as personal infrastructure, refuse it as user-facing
architecture, and record why — because the pitch for it is attractive and will
come round again.

The **iroh / QUIC / ALPN transport** underneath it is worth reading regardless.
That is a serverless transport design and this project will eventually need
opinions about one.

---

## The knowledge base — do not hardcode it

The document lists operational facts: which regions the BBC World Service
targets, that Deutsche Welle shortwave reaches only Ethiopia and Sudan, that All
India Radio has ceased most international shortwave.

**Every one of those is already in the schedule**, and more accurately. EiBi
carries target areas, languages, times, seasons and transmitter sites for 9,289
broadcasts, and it is rebuilt each season. Hardcoding "DW broadcasts only to
Ethiopia and Sudan" means being confidently wrong the first time that changes —
and it will, because international shortwave is contracting every year.

**The right move is presentation, not data.** The facts are held; what is missing
is the app explaining what it already knows:

- *Why* a broadcast is in this list — aimed at your region, on an open band.
- **The relay-site point, which is the genuinely under-served idea here.** A
  signal from Ascension or Madagascar is not coming from the country whose name
  is on it. The schedule has transmitter sites. Showing "Voice of Korea, via
  Ascension" is both true and the kind of detail that turns a listener into a
  DXer.
- The time-of-day guidance — Asia in the morning, Europe in the evening — is
  already implicit in the band-openness ranking. Saying it out loud costs a
  sentence.

---

## Narrative, not features

Three items belong in the writing rather than the software, and are stronger
there.

**SS7.** The signalling system that has routed the world's phone calls since the
1970s, designed when every participant was a trusted national carrier — and
therefore with essentially no authentication, which is why it became a
surveillance tool. It is the perfect foil for this project: a global network
that works beautifully and trusts everyone, versus one that assumes nothing and
holds nothing. That is a chapter in the white paper, not a feature.

**Free-to-air satellite audio.** Unencrypted KU-band feeds, receivable by anyone
with a dish, carrying radio that never touches a CDN. Thematically perfect —
another way sound crosses the world without a company in the middle. It needs
hardware, so it is a story now and possibly a feature after an SDR.

**The Choyong LC90 comparison.** Useful as a design reference for what a hybrid
tuner should feel like. Two of the three UX elements are already built;
**voice search is the third, and it carries a real cost** — a microphone
permission and speech recognition in an app whose entire promise is that it
listens to the world and never to you. That trade needs stating before anyone
starts, not after.

---

## What this changes about the plan

Nothing this week. The two blockers are unchanged and everything here waits
behind them.

What it changes is the ordering afterwards:

1. **The confirmed bugs are cheap and visible** — receiver dot size, the
   favourites tab transition, the dead space, the favourites cap. Good
   first-week-after-launch work, and the kind of thing new users hit immediately.
2. **The signal-quality indicator and the scanning lock are the two features
   worth building next**, because they deepen what the app already is rather than
   adding a surface. Both are ideas nothing else in the category has.
3. **Relay transparency and user-added relays** are the highest-value settings
   addition, because they make the decentralisation claim inspectable instead of
   asserted.
4. **The knowledge base is a presentation project**, not a data one, and the
   relay-site detail is the piece to start with.

---

> **Removed 7 Aug 2026.** Captions are no longer in the app. Enabling them
> once downloaded about 1.3 GB of model weights that nothing ever cleaned up,
> on a project whose whole argument is that it runs on hardware people already
> own. The design, the measurements and what would have to change are in
> [`CAPTIONS.md`](CAPTIONS.md).
