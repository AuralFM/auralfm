# Task brief for Fizz — populate the AuralFM community

Paste into Buzz Desktop as a message to Fizz. Everything referenced is on this
machine already; nothing needs to be pasted in with it.

---

**Context.** The AuralFM community at `wss://auralfm.communities.buzz.xyz` has
four channels with canvases and topics already set (5 Aug), and Beacon live. What
it does not have is content. It is about to be invited to, and an empty community
is worse than a delayed one — people join once, see nothing, and do not return.

All the copy already exists on disk. Read these before starting:

| File | What it is |
|---|---|
| `/Users/mb3/Projects/globefm/docs/outreach/buzz-forum.md` | Six long-form posts about radio. The library. |
| `/Users/mb3/Projects/globefm/docs/outreach/buzz-build.md` | The plan: what goes where, the agent roster, ordering. |
| `/Users/mb3/Projects/globefm/docs/COMMUNITY.md` | Channel copy and the agent behaviour rules. |
| `/Users/mb3/Projects/globefm/docs/DECENTRALIZATION.md` | The nine receiver commitments. |
| `/Users/mb3/.buzz/GUIDES/AURALFM_COMMUNITY_SETUP.md` | What was already done, and what is blocked on the owner. |

**Channel IDs**

| Channel | UUID |
|---|---|
| signal | `4edb04f8-7089-4984-8db5-666cfc39c5fe` |
| tuning | `c6e91656-e106-4c2f-af93-968e7efd9502` |
| build | `0d974029-313c-42ef-a63e-c6be81d904ed` |
| shortwave | `05e36878-51c5-47fa-be2b-c6c95e1d2001` |

---

## Task 1 — Find out where forum posts can actually go

**Do this first; it gates task 2.** Forum posts are `messages send --kind 45001`,
and per the setup guide a channel's type is `stream` or `forum` and is **fixed at
creation**. The four existing channels were probably created as streams, in which
case `45001` will be rejected and a forum channel has to exist first.

1. Check the type of the four channels (`buzz channels --help` for the read path).
2. If none is a forum, try creating one: name it `library`, description
   *"How radio works, what is on the air, and how to borrow somebody's antenna."*
3. If channel creation is owner-only at this relay, **stop and report that** —
   Melton does it in Desktop and you resume afterwards.

Report which of those three happened before going further.

## Task 2 — Publish the library

From `buzz-forum.md`. **Post the body only** — everything inside the blockquote,
with the `>` markers stripped. Do not post the italic category lines or the
editorial notes; those are instructions to you, not content.

**Order matters and is not negotiable:**

1. **Post 5, "Borrowing somebody's antenna"** — first, and pin it if the relay
   supports pinning in that channel type. If somebody hostile investigates on day
   one, the first thing they should find is the post that takes the receiver
   operators' side.
2. **Post 1, "Why a radio signal crosses an ocean"** — the most useful and the
   most linkable.
3. **Posts 2 and 3.**

**Stop there.** Post 4 (pirate history) and post 6 (the app) wait until there is
some activity — six long posts in one day reads as content marketing, which is
the exact thing this is meant not to be.

Content limit is 65,536 bytes; every post is far under it.

## Task 3 — The reference notes

`buzz notes` is the long-form knowledge base. These are the things that must not
scroll away:

1. **"The nine commitments"** — the receiver etiquette rules from
   `docs/DECENTRALIZATION.md`, with the note that they are checked by the build
   rather than merely intended, and that any operator can opt out with one email.
2. **"What AuralFM collects"** — from `docs/PRIVACY.md`. No account, no server of
   ours, presence off by default, station location rounded to about 20 km and
   never the listener's, key made at launch and discarded at quit.
3. **"A shortwave glossary"** — propagation, MUF, LUF, grey line, skip, QSL,
   QSY, QRM, utility station, numbers station, jamming, D layer, F layer. Short
   definitions. Newcomers will need it to read the library.

## Task 4 — Agent drafts

Three new agents, from the roster in `buzz-build.md`. Use
`buzz agents draft-create`. Needs `BUZZ_AUTH_TAG` — if it is missing, say so and
skip this task rather than improvising.

| Name | Channel | Purpose for the system prompt |
|---|---|---|
| **Dial** | tuning | Helps people find things — what is on, where to look, what a station is. Discovery, never recommendation. |
| **Skip** | shortwave | Propagation and the deep end: bands, grey line, why a frequency is dead at noon and busy at midnight. |
| **QSL** | build | Triage. Gets macOS version, Intel or Apple Silicon, app version, and exact steps before Melton reads a report. |

Every one of them inherits the behaviour rules in `docs/COMMUNITY.md`: say "I
don't know" out loud, never speak for Melton, do not moderate, do not post
unprompted, never ask anyone for personal information, and say plainly that it is
not okay when somebody proposes anything that would poll the volunteer receivers
repeatedly.

**These are drafts.** `draft-create` opens an owner-reviewed form in Melton's
Desktop; it does not create anything. Report them as *ready for review*, never as
created.

## Task 5 — Mirror the roadmap

Build in public means the backlog is visible rather than described. From the
GitHub repo `meltonbell3/auralfm` (private, but `gh` is authenticated on this
machine): mirror the open issues — #4, #14, #21, #30, #36, #37 — as Buzz issues
or a project, with titles and one-line summaries. **Do not copy issue bodies
verbatim**; some reference private files and internal reasoning.

---

## Boundaries

- **Do not attempt owner-only actions.** Channel descriptions, deleting
  `#general`, and role changes on active members all returned
  `actor not authorized` on 5 Aug. They are Melton's, in Desktop. If something
  returns that error, record it and move on.
- **Do not post anything signed "— Melton"** or written in his first person. The
  `#signal` pinned text is his to post from his own account.
- **Do not invite anyone or share the community link.** That is the last step and
  it is his.
- **Do not delete or archive anything.**
- **Do not edit files under `/Users/mb3/Projects/globefm`.** That repo is managed
  in a separate session; read from it freely, write nothing.

## Report back

For each task: what was done, what the relay rejected and with which error, and
anything that needs Melton in Desktop. Append the record to
`/Users/mb3/.buzz/GUIDES/AURALFM_COMMUNITY_SETUP.md` under a new dated heading
rather than rewriting what is there.
