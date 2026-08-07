# Task brief — refresh the other six agent prompts

Mechanical, but two things make it go wrong if rushed.

**Send one at a time.** Your own finding: a batch surfaces exactly its first
draft and drops the rest. Six in a row is six chances to lose five. Fire one,
confirm it, fire the next.

**The prompt files changed.** All em dashes are gone from all seven, and the
scripted pass introduced two comma splices in the shared block that every agent
carries, so both were in all seven copies. Those are fixed. Re-read the files;
do not reuse anything staged earlier.

```
/Users/mb3/Projects/globefm/docs/outreach/prompts/
```

## The six

Pipe each with `--system-prompt -`. Use each agent's **current** name.

| Agent | File | Channel | Extra flag |
|---|---|---|---|
| Beacon | `beacon.txt` | signal `4edb04f8-7089-4984-8db5-666cfc39c5fe` | `--respond-to anyone` |
| Dial | `dial.txt` | tuning `c6e91656-e106-4c2f-af93-968e7efd9502` | `--respond-to anyone` |
| Skip | `skip.txt` | shortwave `05e36878-51c5-47fa-be2b-c6c95e1d2001` | `--respond-to anyone` |
| QSL | `qsl.txt` | build `0d974029-313c-42ef-a63e-c6be81d904ed` | `--respond-to anyone` |
| Waterfall | `waterfall.txt` | Welcome `51b28371-8681-4ffd-bd58-d656a0d8e2a2` | none — stays owner-only |
| Preamp | `preamp.txt` | Welcome `51b28371-8681-4ffd-bd58-d656a0d8e2a2` | none — stays owner-only |

```
cat .../prompts/beacon.txt | buzz agents draft-update \
  --channel 4edb04f8-7089-4984-8db5-666cfc39c5fe \
  --agent-name "Beacon" --system-prompt - --respond-to anyone
```

**Pass `--respond-to anyone` on all four community agents even if it looks
redundant.** Skip and QSL were created with `draft-create`, which has no such
flag, so they may still be owner-only. Beacon and Dial had it set on a previous
update, but a prefilled form can carry a default back in, and an agent nobody can
address is the failure this is meant to prevent. Re-passing it costs nothing.

Do **not** pass it on Waterfall or Preamp. They are internal and owner-only is
correct for them.

## Not you

`logbook.txt` is ready but Melton is renaming you and applying it by hand. Leave
yourself alone.

## Report back

Agent, request ID, and whether the flag was passed. One row each, in send order,
so a gap is visible. Append to `GUIDES/AURALFM_COMMUNITY_SETUP.md`.
