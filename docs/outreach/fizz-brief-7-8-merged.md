# Task brief — one draft per agent, carrying both changes

**This replaces briefs 7 and 8. Do not run those separately.** Both changed the
same six agents with `draft-update`, which would mean two pending drafts each,
into a mechanism that already drops drafts silently, and twelve review forms for
Melton instead of six.

Three parts, in order. Part 1 gates part 3.

---

## Part 1 — find out what the model flags accept

Before changing anything: **report what `--provider` and `--model` actually take
on this harness.** I do not know the valid values, and a guessed model string
either fails loudly or sets something wrong quietly. The second is worse.

If there is no way to discover the valid set from the CLI, look at what Desktop
shows on an existing agent and report that instead. If neither works, say so and
skip part 3 entirely rather than guessing. The prompts in part 3 still land.

## Part 2 — memory, which does not touch drafts at all

Safe to do first and independent of everything else. Five slugs, contents at
`/Users/mb3/Projects/globefm/docs/outreach/mem/`:

| Owner | Slug | File |
|---|---|---|
| Logbook (you, whatever you are called when you read this) | `core` | `logbook-core.md` |
| Logbook | `decisions` | `logbook-decisions.md` |
| Logbook | `stale-facts` | `logbook-stale-facts.md` |
| Waterfall | `core` | `waterfall-core.md` |
| Preamp | `core` | `preamp-core.md` |

```
cat .../mem/logbook-core.md | buzz mem set core -
```

**Your own three are simple** — no `--owner` needed, they are yours. A rename
does not change a pubkey, so writing them before or after Melton renames you
makes no difference.

**Waterfall's and Preamp's are the question.** Every `mem` subcommand defaults to
the caller's own pubkey, so writing theirs without `--owner` puts the slug
somewhere they will never read it. Check whether cross-owner writes are
permitted. If the relay refuses, **say so and stop on those two** — do not write
them under your own key as a fallback. Two slugs in the wrong place is worse than
none, because they look done.

`mem rm` cannot delete `core`. If a `core` already exists with content, read it
and merge rather than overwrite.

## Part 3 — one draft per agent: prompt and tier together

**One agent at a time.** Fire, confirm it appeared, then the next. Your own
finding, and six in a row is six chances to lose five.

The prompt files changed since anything you staged: all em dashes gone from all
seven, and two comma splices the scripted pass introduced into the shared block
have been fixed, so they were in all seven copies. Re-read them.

| Agent | Prompt | Channel | Tier | Extra |
|---|---|---|---|---|
| Beacon | `beacon.txt` | signal `4edb04f8-7089-4984-8db5-666cfc39c5fe` | **fast** | `--respond-to anyone` |
| Dial | `dial.txt` | tuning `c6e91656-e106-4c2f-af93-968e7efd9502` | mid | `--respond-to anyone` |
| Skip | `skip.txt` | shortwave `05e36878-51c5-47fa-be2b-c6c95e1d2001` | **frontier** | `--respond-to anyone` |
| QSL | `qsl.txt` | build `0d974029-313c-42ef-a63e-c6be81d904ed` | mid | `--respond-to anyone` |
| Waterfall | `waterfall.txt` | Welcome `51b28371-8681-4ffd-bd58-d656a0d8e2a2` | **frontier** | none |
| Preamp | `preamp.txt` | Welcome `51b28371-8681-4ffd-bd58-d656a0d8e2a2` | mid | none |

```
cat .../prompts/beacon.txt | buzz agents draft-update \
  --channel 4edb04f8-7089-4984-8db5-666cfc39c5fe \
  --agent-name "Beacon" --system-prompt - --respond-to anyone \
  --provider <p> --model <m>
```

**Pass `--respond-to anyone` on all four community agents even where it looks
redundant.** Skip and QSL were created with `draft-create`, which has no such
flag, so they may still be owner-only, which would make the two agents whose
whole purpose is answering people unable to be addressed. Do not pass it on
Waterfall or Preamp.

**Why these tiers**, from Block's post: fast models at high effort, frontier at
medium, because paying more stops helping and then starts hurting. If part 1
comes back empty and you can only reason about two, the two that matter are
Waterfall to frontier, because a weak auditor is worse than none, and Beacon to
fast, because it is overhead at anything else.

**Not you.** `logbook.txt` is Melton's to paste after renaming you.

---

## Boundaries

Nothing invited, deleted, or written under `Projects/globefm`. Nothing posted as
Melton. Do not modify yourself.

## Report back

Part 1: what the flags accept. Part 2: which slugs, under which pubkey, and what
the relay refused. Part 3: one row per agent in send order, with request ID, so a
gap is visible. Append to `GUIDES/AURALFM_COMMUNITY_SETUP.md`.
