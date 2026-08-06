# Building out Buzz before anyone arrives

Melton's correction, and it changes the shape of everything below: **the forum is
not a Q&A board.** It is the project's own database about radio, shortwave and
this community, which people then comment on. Questions live in channels. The
forum is the part that is still worth reading in a year.

The CLI backs that reading. `buzz notes` is described as *"long-form NIP-23
notes — team knowledge base"*, and forum posts are their own event kinds:
`45001` for a thread root, `45003` for a comment. Two different tools for two
different jobs.

---

## What goes where

| Buzz feature | What it holds here | Why not somewhere else |
|---|---|---|
| **Forum** (`45001`) | The radio library — propagation, bands, what is on the air, pirate history, receiver etiquette. Six posts, drafted in `buzz-forum.md`. | Threaded, votable, and comment-able. This is the material people should argue with. |
| **Notes** (`notes`) | Reference that should not drift down a feed: the nine receiver commitments, the privacy position, the glossary. | Long-form, editable in place. A commitment that scrolls away is not a commitment. |
| **Canvas** | One per channel — the channel's own standing rules and pinned context. | Canvas is the top of a channel. Better than a pinned message nobody scrolls to. |
| **Channels** | Conversation: #signal, #tuning, #build, #shortwave. | Already specced in `docs/COMMUNITY.md`. |
| **Projects / Issues** | The roadmap, in public. #4, #14, #21, #30, #36, #37. | "Build in public" means the backlog is visible, not described. |
| **Polls** | Decisions the community can genuinely affect — which platform next, which palette default. Never a decision already made. | A poll on a settled question is theatre and reads as such. |
| **Workflows** | Later. Nothing here yet needs automating, and an automation with no traffic to act on is a maintenance burden. | — |
| **Agents** | Below. | — |

**The sequencing rule that matters:** the library goes up before the invite goes
out. An empty community is worse than a delayed one — people join once, see
nothing, and do not come back.

---

## The agent roster

Currently: Beacon, plus the stock Bumble, Fizz and Honey. The stock three should
go. Their names are the platform's, not this project's, and this is a community
about radio.

Each name below is a real radio term whose meaning matches the job. That is the
whole trick — the name should teach somebody something the first time they read
it.

| Agent | Channel | What it is | What it does |
|---|---|---|---|
| **Beacon** | #signal | The IARU beacon network transmits continuously so listeners can gauge whether a path is open. It says *"I am here"* and nothing else. | Announcements and status. Never answers questions. Never speaks for Melton. |
| **Dial** | #tuning | The tuning dial. | Helps people find things. What is on, where to look, what a station is. Discovery, not recommendation. |
| **Skip** | #shortwave | Skip distance — the mechanism that carries a signal over the horizon. | The deep end. Propagation, bands, grey line, why a frequency is dead at noon. |
| **QSL** | #build | The Q-code for *"I confirm receipt."* A QSL card confirms a reception report. | Triage. Gets the four things that make a bug fixable before Melton reads it. |

Retire: **Honey, Bumble, Fizz**.

### The discipline that applies to all four

Carried from `docs/COMMUNITY.md`, and it is what stops agents becoming noise:

- **Say "I don't know" out loud.** No access to the source, the roadmap, or
  Melton's plans. Never guess at a feature, a date, or a price.
- **Never speak for Melton.** Not his voice, does not announce, does not decide.
- **Do not moderate.** No authority here.
- **Do not post unprompted.** No greetings, no summaries, no following up on
  their own messages.
- **Never ask anyone for personal information**, location, email or a wallet
  address. The whole product is built on collecting nothing.
- **The receivers belong to volunteers.** If somebody plans anything that would
  poll them repeatedly, say plainly that it is not okay.

---

## Order of operations

1. **Canvases** on the four existing channels — cheapest, and it makes an empty
   channel look intentional rather than abandoned.
2. **Forum post 5 (etiquette)** first and pinned. If one thing is up when
   somebody investigates, it should be the one that takes the operators' side.
3. **Notes**: the nine commitments, the privacy position, a glossary.
4. **Forum posts 1, 2, 3** over several days. Not all at once — six long posts in
   a day reads as content marketing.
5. **Agents**: draft the four, retire the three.
6. **Projects/issues** mirrored from GitHub.
7. **Forum post 4** (pirate history) once there is a little activity. It is the
   most shareable and lands better with a couple of replies under it.
8. **Post 6** (the app) last, and never bumped.
9. *Then* send the invite.

---

## What is needed to run any of this

The CLI is installed at `~/.local/bin/buzz` and the relay is
`wss://auralfm.communities.buzz.xyz`. Three environment variables:

| Variable | Needed for | Notes |
|---|---|---|
| `BUZZ_PRIVATE_KEY` | everything | hex or nsec. **Must be exported in the shell, never pasted into a chat.** |
| `BUZZ_RELAY_URL` | everything | `https://auralfm.communities.buzz.xyz` |
| `BUZZ_AUTH_TAG` | `agents draft-create` only | NIP-OA auth tag JSON, from Desktop |

**On agents specifically:** `agents draft-create` does not create an agent. It
sends an encrypted draft to the owner's Buzz Desktop, where Melton reviews and
saves it. So the four personas below can be drafted from here, but they are not
live until he approves each one in the app. Report them as *ready for review*,
never as created.
