# Brief for Logbook

First one under the new name. You were Fizz. The rename does not change your
pubkey, so `core`, `decisions` and `stale-facts` are still yours and still
correct.

Read `core` before starting. It is not a formality: it holds how Melton works,
and the two rules that govern everything you write for him are in there.

---

## Task 1 — reconcile, before anything else

Eight briefs have run today and the record in
`GUIDES/AURALFM_COMMUNITY_SETUP.md` is a log of what was *attempted*. Nobody has
established what is actually true. That is your job before you add anything new.

Produce a state table covering:

**Agents.** All six. For each: current display name, `respond_to`, `model`, and
which channels they are in with what role. `~/Library/Application Support/
xyz.block.buzz.app/agents/managed-agents.json` is the saved record; the relay is
the other half. **Where they disagree, say so** — that discrepancy is more
interesting than either value alone.

**The four community agents are the ones that matter.** Beacon, Dial, Skip and
QSL are useless at `respond_to=owner-only`. You reported them as owner-only after
passing `--respond-to anyone` and correctly said you could not tell why. Melton
has now been through the review forms. **Find out whether it took.**

**Workflows.** Three were rejected for missing `id` fields and the YAML was
fixed. Are they created and enabled? `workflows list` per channel.

**Forums.** `#library` should hold eight posts, `#signal-path` five or six. The
essay and reading notes were republished from edited sources — confirm the
published versions have no em dashes and no third-person references to Melton
outside the bibliography.

**Report what is wrong, not what is right.** A list of everything that worked is
noise. What is missing, what disagrees, what silently did not take.

## Task 2 — finish what is outstanding

Whatever the reconciliation shows was never completed. Likely candidates: the
essay republish, the workflows, channel descriptions if you were made admin.

## Task 3 — the fourth feature request

Written and ready at
`/Users/mb3/Projects/globefm/docs/outreach/issues/buzz-mem-agent-flag.md`.

Add it to `OUTBOX/BUZZ_FEATURE_REQUESTS.md` alongside the three you drafted. It
is your finding, written up — check it says what you actually established and fix
it if not. In particular: confirm the exact error text from
`mem set --agent`, since I wrote that reproduction from your description rather
than from a terminal.

**Do not file any of them.** Melton files.

## Task 4 — Waterfall and Preamp cannot be given their memory, so tell them how to take it

You established that an engram is keyed to the signing pubkey and there is no
cross-agent write. Their slugs are written and correct at
`/Users/mb3/Projects/globefm/docs/outreach/mem/waterfall-core.md` and
`preamp-core.md`, and can only be installed from their own sessions.

Leave a note in `OUTBOX/AGENT_MEMORY_HANDOFF.md`: which file goes to which agent,
the exact command, and the warning that `mem rm` cannot delete `core`, so a bad
first write is permanent. Melton pastes it into each of them once.

---

## Standing

Nothing invited, deleted or archived. Nothing under `Projects/globefm`. Nothing
posted as Melton. You do not publish to the community, and you do not decide
anything — you assemble what a decision needs and hand it over.

Append the reconciliation to `GUIDES/AURALFM_COMMUNITY_SETUP.md` under a dated
heading. Do not rewrite what is there.
