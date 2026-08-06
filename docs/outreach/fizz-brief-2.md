# Task brief for Fizz — agent instructions and the two missing drafts

Paste into Buzz Desktop as a message to Fizz. Everything is on this machine; nothing
needs pasting alongside it.

**Do not rename yourself.** Melton is renaming you to Logbook by hand afterwards.
Task D drafts the rename for the other two only.

---

## Before you start

The complete system prompts are already assembled at
`/Users/mb3/Projects/globefm/docs/outreach/prompts/`. One file per agent, each
already containing the shared behaviour block plus that agent's role section —
**do not stitch anything together yourself**, and do not read the prompts out of
`agent-instructions.md`, which stores them in two pieces.

Pipe each file straight in with `--system-prompt -`:

```
cat /Users/mb3/Projects/globefm/docs/outreach/prompts/dial.txt \
  | buzz agents draft-update --channel <uuid> --agent-name "Dial" --system-prompt -
```

Channel UUIDs:

| Channel | UUID |
|---|---|
| signal | `4edb04f8-7089-4984-8db5-666cfc39c5fe` |
| tuning | `c6e91656-e106-4c2f-af93-968e7efd9502` |
| build | `0d974029-313c-42ef-a63e-c6be81d904ed` |
| shortwave | `05e36878-51c5-47fa-be2b-c6c95e1d2001` |

Every command below opens an **owner-reviewed draft** in Melton's Desktop. None
of them changes anything by itself. Report every result as *ready for review*,
never as done.

---

## Task A — re-issue the two drafts that never arrived

Dial arrived on the first attempt; Skip and QSL did not. Same command, same
content, fresh request:

```
cat .../prompts/skip.txt | buzz agents draft-create \
  --channel 05e36878-51c5-47fa-be2b-c6c95e1d2001 \
  --display-name "Skip" --system-prompt -

cat .../prompts/qsl.txt | buzz agents draft-create \
  --channel 0d974029-313c-42ef-a63e-c6be81d904ed \
  --display-name "QSL" --system-prompt -
```

> **Correction, 6 Aug.** `draft-create` takes only `--channel`,
> `--display-name` and `--system-prompt`. There is no `--respond-to` on create —
> it exists on `draft-update` only. So Skip and QSL land **owner-only**, which is
> the furniture problem applied to the two agents that most need talking to.
> Fix it in Desktop when saving ("Who can send instructions" → Anyone), or with a
> follow-up `draft-update --respond-to anyone` once each agent exists.

Report the new request IDs. If either returns an error rather than a request ID,
quote the error verbatim — the first attempt returned IDs and the drafts still
did not appear, so a silent success is the thing we are trying to distinguish
from a real one.

## Task B — Dial already exists, so update it

```
cat .../prompts/dial.txt | buzz agents draft-update \
  --channel c6e91656-e106-4c2f-af93-968e7efd9502 \
  --agent-name "Dial" --system-prompt - --respond-to anyone
```

**`--respond-to anyone` matters more than the prompt does.** Agents default to
owner-only, which means only Melton can address them. A community agent nobody
in the community can talk to is furniture.

## Task C — Beacon

```
cat .../prompts/beacon.txt | buzz agents draft-update \
  --channel 4edb04f8-7089-4984-8db5-666cfc39c5fe \
  --agent-name "Beacon" --system-prompt - --respond-to anyone
```

Beacon's new instructions say it answers nothing and redirects to the right
channel. That is deliberate; `--respond-to anyone` is what lets it deliver the
redirect rather than ignoring people.

## Task D — the two internal agents

Rename and re-instruct. These stay owner-only — do **not** pass `--respond-to`:

```
cat .../prompts/waterfall.txt | buzz agents draft-update \
  --channel <any channel they are in> \
  --agent-name "Honey" --display-name "Waterfall" --system-prompt -

cat .../prompts/preamp.txt | buzz agents draft-update \
  --channel <any channel they are in> \
  --agent-name "Bumble" --display-name "Preamp" --system-prompt -
```

If either name does not resolve, list the agents you can see and stop rather than
guessing at a match.

**Leave yourself alone.** `logbook.txt` exists and is correct, but Melton is
applying it by hand after this. Do not draft-update "Fizz".

---

## What you cannot do, so do not try

- **Avatars.** `draft-create` and `draft-update` have no picture flag. The PNGs
  are at `/Users/mb3/Projects/globefm/assets/agents/` and Melton sets them in
  Desktop with the pencil control on the agent card.
- **Teams.** There is no `teams` subcommand. Desktop only.
- **Owner-only actions** — channel descriptions, role changes on active members.
  Still his.

## Report back

A table: agent, action, request ID or error, and whether `--respond-to` was set
(create cannot set it; note that rather than leaving the column blank).
Append to `/Users/mb3/.buzz/GUIDES/AURALFM_COMMUNITY_SETUP.md` under a new dated
heading. Do not rewrite what is already there.
