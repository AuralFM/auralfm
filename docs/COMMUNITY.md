# The Buzz community

Paste-ready copy for `auralfm.communities.buzz.xyz`. Written to be short where it
is read often and longer only where someone actually needs the detail.

The tone throughout: plain, specific, no community-manager voice. Nobody has ever
been made to feel welcome by the word "welcome."

---

## Channel descriptions

One line each. These sit in the channel header, so they have to work at a glance.

**#signal**
> New builds and anything that needs saying once. Replies off — use #tuning or #build.

**#tuning**
> What you found. A station, a frequency, a receiver, a moment. Screenshots welcome.

**#build**
> What's being worked on and what broke. Bug reports here — include your macOS version and Intel or Apple Silicon.

**#shortwave**
> Propagation, band openings, the schedule, and what the borrowed receivers are hearing.

---

## Pinned: start here

Goes in **#signal**, pinned. The only thing a new arrival is guaranteed to read.

> **AuralFM is a globe you listen to.**
>
> Spin it, click a place, hear what that city is actually listening to right now.
> About 38,000 internet radio stations, plus 837 shortwave receivers that
> strangers leave open for anyone to borrow — somebody's real antenna, in
> somebody's real garden.
>
> **There's no backend.** No account, no server of mine, nothing logging what you
> played. The chat you're in right now runs on Nostr, same as the app's own
> presence layer — which is why this community is here and not on Discord.
>
> **Where things are:** macOS only for now, Windows and Linux later, iOS
> eventually. The app is free on all of them and always will be.
>
> Four channels:
> - **#tuning** — what you found. This is the point.
> - **#build** — progress, and what broke.
> - **#shortwave** — the deep end.
> - **#signal** — me, occasionally.
>
> One rule that matters: **the receivers belong to volunteers.** They're one
> person's hardware on one person's bandwidth, given away for free. Don't hammer
> them, don't leave a slot open you aren't using, and if a receiver is full, move
> on. This project has already knocked three of them offline by being careless.
> That's the only thing I'll ever be strict about.
>
> Everything else: be interesting or be quiet. — Melton

---

## Pinned: reporting something broken

Goes in **#build**.

> **Before you post**
>
> Four things, and the first two are almost always the answer:
>
> 1. **macOS version**, and **Intel or Apple Silicon** (Apple menu → About This Mac).
> 2. **App version** (AuralFM → About AuralFM).
> 3. **What you did**, in the order you did it.
> 4. **What happened instead**, and a screenshot if there's anything to see.
>
> "It doesn't work" is not a bug report and I can't do anything with it. "It quits
> when I click a shortwave receiver in Norway, Intel Mac, 14.6" is one I can fix
> tonight.
>
> **Not bugs, and known:**
> - A shortwave receiver that won't connect is usually **full**. Eight listener
>   slots, shared with the whole internet. Try another.
> - Nothing audible on a frequency the schedule lists — the band may be closed.
>   Check the line above the list; it says whether the higher bands are carrying.
> - Captions are off and staying off. They work and they're too slow to be useful
>   on current hardware. Measured, not guessed.

---

## Pinned: shortwave, if you're new to it

Goes in **#shortwave**. The one place worth spending words, because it converts
curious people into the ones who stay.

> **You don't need to know anything to start.**
>
> Switch to the Shortwave tab on any place. The list isn't frequencies in the
> abstract — it's what's actually transmitting this minute, filtered to the bands
> that are open right now, with who it's aimed at.
>
> Three things that will make it make sense:
>
> **The bands open and close with the sun.** Higher frequencies carry in daylight,
> lower ones at night. That's why the same frequency is empty at noon and full at
> midnight, and why the line above the list changes through the day.
>
> **You're borrowing someone's antenna.** When you tune a receiver in Wellington,
> you're hearing what Wellington hears — not what you'd hear. Distance from the
> transmitter to *that antenna* is what matters.
>
> **Grey line is the good stuff.** The band of twilight moving across the Earth is
> where the strangest long-distance paths open up, for maybe forty minutes. The
> terminator on the globe is that line. Follow it.
>
> Post what you catch. Frequency, time, and where you were listening from is
> enough.

---

## The agent

Buzz puts AI agents in channels as members. This is its instruction set.

The discipline that makes it useful rather than noise: **it answers questions
about radio and about the app, it never speaks for Melton, and it says "I don't
know" out loud.** An agent that confidently invents a feature is worse than no
agent, because the first person it misleads will post the screenshot.

```
You are an assistant in the AuralFM community on Buzz. AuralFM is a macOS app: a
photoreal globe you listen to, combining about 38,000 internet radio stations
with 837 borrowed KiwiSDR shortwave receivers. It is free, has no backend, no
account, and collects nothing. Melton Bell III builds it.

WHAT YOU ARE FOR

Two things, and nothing else:

1. Radio questions. Propagation, band openings, why a frequency is dead at noon
   and busy at midnight, what grey-line is, what a KiwiSDR is, how shortwave
   broadcasting works. Be genuinely useful here — most people arrive curious and
   leave if the first question goes unanswered.

2. Triage. When someone reports a problem, get the four things that make it
   fixable before Melton reads it: macOS version, Intel or Apple Silicon, app
   version, and the exact steps. Ask for what is missing, once, without lecturing.

HOW YOU BEHAVE

Answer briefly. Most questions need two sentences, not six.

Say "I don't know" when you do not know. You do not have access to the source
code, the roadmap, or Melton's plans. If someone asks whether a feature exists or
is coming, and you are not certain from what has been said in the community, say
you are not sure and that Melton would have to answer. Never guess at a feature,
a date, or a price.

Never speak for Melton. You are not his voice and you do not announce things. If
something reads like it needs a decision or an answer only he can give, say so
and leave it.

Do not moderate. You are not a moderator and you have no authority here.

Do not post unprompted. Answer when addressed or when a question is clearly
open. Do not greet people, do not summarise the channel, do not follow up on your
own messages.

THINGS TO GET RIGHT

The receivers belong to volunteers — one person's hardware on one person's
bandwidth. If someone is planning anything that would poll them repeatedly, say
plainly that it is not okay. This project has already knocked three offline.

A receiver that will not connect is usually full. Eight slots, shared with
everyone. Suggest another before suggesting anything is broken.

Captions exist in the code, are off, and are staying off — they work and are too
slow to be usable on current hardware. That was measured, not assumed. Do not
promise them.

The app is macOS only right now. Windows and Linux are intended, iOS eventually.
Do not give timelines.

Never ask anyone for personal information, location, email, or a wallet address.
The whole product is built on collecting nothing and you are part of that.
```

---

## Where the agent actually runs, and what that costs

Researched before setting one up, because it changes what the agent can be.

**Agents run on your machine, not on the relay.** The relay is a shared event
log; an agent connects to it as a client over a WebSocket, the same way a person
does. With Claude Code as the harness, Claude Code is running on your Mac, using
your tokens.

**So the agent is only awake when your Mac is.** Close the laptop and it stops
answering. Somebody asking a question at 3am gets silence, and to them that reads
as broken rather than asleep.

Two honest options. Either **say so in the agent's own description** — "answers
when Melton's machine is on" — so nobody is surprised, or **do not run an agent
at all until there is a reason to**. A community of four does not need one.

**Workflows are the opposite, and this is the useful part.** They are YAML,
triggered by a message, a reaction, a schedule or a webhook, and **the relay
executes them independently**. They work whether or not you are online. Anything
that has to be reliable belongs in a workflow, not an agent.

### The security setting that actually matters

A Claude Code agent sitting in a public channel is **an agent taking instructions
from strangers.** That is prompt injection with the front door open — someone
posts a message crafted to make it do something, and if the harness has
filesystem or shell access on your Mac, "something" can be a great deal.

**Give it no tools.** Read the channel, write a reply, nothing else. No file
access, no shell, no network fetches, no ability to act. It answers questions
about radio; it has no business touching anything.

If Buzz's agent configuration does not let you restrict tools that tightly, do
not run it in a public channel until it does.

### MeshLLM, if it ever comes up

Buzz can pool inference across machines. Worth knowing before enabling it:
Block's own write-up says **"prompts and any data sent to another machine are
visible to its owner, and you are trusting the results that come back."**

For this project that is a hard no on sharing compute with anyone outside your
own devices. It is not a flaw in MeshLLM — it is honest documentation — but a
product built on collecting nothing should not be routing prompts through
strangers' hardware.

---

## What to set up now, and what to leave alone

Buzz has forums, canvases, workflows, an inbox, DMs, search and an audit log. For
a community with no members yet, almost all of it is furniture.

**Worth doing now:**

- **One workflow: GitHub → #build.** A webhook that posts when an issue opens or
  closes, or when a release ships. Always-on, zero maintenance, and it makes the
  channel look alive between announcements. This is the single highest-value
  thing on the list.
- **The agent, with no tools**, if the always-on caveat is stated in its
  description. Otherwise wait.

**Leave alone until people arrive:**

- **Forums.** Four channels for zero people is already generous. A forum is where
  conversation goes to be organised, and there is no conversation yet.
- **Canvases.** The shortwave primer is a pinned post. That is enough.
- **Inbox and DMs.** Nothing to configure — they exist.
- **Scheduled workflows.** Nothing recurring needs saying yet, and a bot posting
  into an empty room is worse than an empty room.

The rule here is the same one as everywhere else in this document: an empty
feature is louder than a missing one.

---

## What not to build

**No `#general`.** It absorbs everything and then nothing has a home.

**No welcome bot.** A greeting from software is the clearest possible signal that
nobody is actually there.

**No rules document beyond the line in the pinned post.** Four channels and one
real rule. Anything more is governance for a population that does not exist yet.
