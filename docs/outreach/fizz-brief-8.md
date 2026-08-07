# Task brief — agent memory and model tiers

From Block's own post on effective teams in Buzz. Two changes: give the internal
agents a memory, and stop running all seven on the same model.

Background is in `/Users/mb3/Projects/globefm/docs/outreach/buzz-team-architecture.md`,
including the one recommendation from that post we are deliberately not taking.

---

## 1. Memory

Block calls a standing team that accumulates knowledge about its operator a
**Hive**. Logbook, Waterfall and Preamp are meant to be exactly that and
currently start every session from nothing. `buzz mem` has been sitting there
unused.

Five slugs, contents at `/Users/mb3/Projects/globefm/docs/outreach/mem/`:

| Owner | Slug | File |
|---|---|---|
| Logbook | `core` | `logbook-core.md` |
| Logbook | `decisions` | `logbook-decisions.md` |
| Logbook | `stale-facts` | `logbook-stale-facts.md` |
| Waterfall | `core` | `waterfall-core.md` |
| Preamp | `core` | `preamp-core.md` |

```
cat .../mem/logbook-core.md | buzz mem set core -
```

**The `--owner` question is the one thing to get right.** All `mem` subcommands
take `--owner <hex-pubkey>`, defaulting to the owner in your own `BUZZ_AUTH_TAG`.
Writing Waterfall's memory to your own pubkey would mean Waterfall never reads
it.

So: **check first** whether you can write to another agent's memory with
`--owner`. If you can, use each agent's pubkey. If the relay refuses, say so and
stop, and Melton will have each agent write its own on first run. Do not write
all five under your own key as a fallback. Five slugs in the wrong place is worse
than none, because they will look done.

`mem rm` cannot delete `core`. If a `core` already exists with content, read it
first and merge rather than overwriting.

## 2. Model tiers

Block's finding, which runs against intuition: fast models at high effort,
frontier models at **medium**. *"Paying more stops helping, then starts
hurting"* — frontier at max effort times out and burns tokens without a better
answer.

All seven are on harness defaults, so Beacon posting prepared text runs the same
configuration as Waterfall auditing a codebase.

| Agent | Tier | Why |
|---|---|---|
| Beacon | fast | Posts prepared text and redirects. Almost no judgement. |
| Dial | mid | Identifying a station, pointing at features. |
| QSL | mid | Structured triage against a fixed checklist. |
| Preamp | mid | Drafting from rough input. |
| Skip | frontier | The most technical, and the one people will test. A confident wrong propagation answer is worse than none. |
| Logbook | frontier | Research with citation discipline. |
| Waterfall | frontier | Audit is judgement, which is what the post reserves frontier models for. |

Set with `--provider` and `--model` on `agents draft-update`. **One at a time** —
the batch bug is still the batch bug.

**Before touching anything: report what `--provider` and `--model` actually
accept.** I do not know what values are valid on this harness, and guessing at a
model string would either fail or silently set something wrong. If the valid set
is not discoverable, list what Desktop offers on an existing agent and stop.

Then do the two that matter most and leave the rest: **Waterfall to frontier**,
because a weak auditor is worse than no auditor, and **Beacon to fast**, because
it is pure overhead at anything else.

---

## Boundaries

Same as always. Nothing invited, deleted, or written under `Projects/globefm`.
Nothing posted as Melton. Do not modify yourself.

## Report back

Which slugs written and under which pubkey; what `--provider` and `--model`
accept; which agents were retiered and their request IDs. Append to
`GUIDES/AURALFM_COMMUNITY_SETUP.md`.
