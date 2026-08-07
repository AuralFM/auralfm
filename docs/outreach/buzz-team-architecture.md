# What to take from Block's team post, and what to refuse

Source: [Effective teams in Buzz](https://engineering.block.xyz/blog/effective-teams-buzz),
Block engineering.

Read 7 Aug 2026. Three things in it are directly useful and one is actively
wrong for this project, which is worth saying first because it is the post's
central argument.

---

## The part to refuse

> Stop babysitting AI. Build a team that can handle more.

The post treats a human in the loop as **middleware**: a bottleneck to be
engineered around, with agents escalating to each other so the person "only sees
the genuinely new problems."

For an engineering org that is right. For **the four community-facing agents here
it is exactly backwards**, and adopting it would break the product's own
position.

AuralFM's argument is that a person is responsible and reachable. Beacon's
instructions say it never speaks for Melton. QSL's say it never fixes anything
and never promises a fix. Dial's say it finds things and does not decide what
anyone should hear. Those are not limitations to be optimised away. They are the
reason the community is worth joining.

A community where agents escalate among themselves so the maintainer only sees
what they could not resolve is a community where **the maintainer is not
present**, and in a project whose whole claim is that no algorithm stands between
you and the thing you came for, that is not a small inconsistency.

**So: no escalation chains among the community four. The human is the point, not
the bottleneck.**

Where it does apply is the internal three, where Melton genuinely is a bottleneck
and nobody is watching.

## The part to take: Hives, and the memory we have never used

> Keep Hives that learn how you work.

A **Hive** is a standing, named team that accumulates knowledge about its
operator. That is precisely what Logbook, Waterfall and Preamp are meant to be,
and right now they start every session from nothing.

Buzz has a purpose-built store for this that this project has not touched:

```
buzz mem ls | get | set | patch | rm
```

Per-agent persistent memory, addressed by slug, with `core` as a protected
default and hash-guarded patching for concurrent writes. Logbook's own
instructions say *"a conclusion that lives in one message is lost"* — and the
mechanism for fixing that has been sitting there the whole time.

**What belongs in `mem`:**

| Agent | Slug | Holds |
|---|---|---|
| Logbook | `core` | How Melton works: plain over impressive, wants pushback not agreement, no places described as sounds, no em dashes. |
| Logbook | `decisions` | Settled questions and why, so they stop being relitigated. No App Store. No paid tier. No ads. No MeshLLM. Nostr over AT Protocol and the reason. |
| Logbook | `stale-facts` | Anything with a date on it: receiver count, station count, platform terms, prices. With the date. |
| Waterfall | `core` | What it has already audited and what it found, so a second pass is a second pass rather than a repeat. |
| Preamp | `core` | Voice notes: how he writes, what he will not say, which drafts he rejected and why. |

The rejected drafts are the valuable half. An agent that knows what was turned
down is worth more than one that only knows what shipped.

## The part to take: tiers, and that more is not better

Three tiers, each with an effort level, and the counterintuitive bit is that they
run **inversely**:

| Tier | Model | Effort | For |
|---|---|---|---|
| QuickBee | fast | max / xhigh / high | documented, mechanical work |
| WorkerBee | mid | high / xhigh | subtasks |
| SmartBee | frontier | **medium** | coordination and judgement only |

> Paying more stops helping, then starts hurting.

Frontier models at maximum effort time out and burn tokens without improving the
answer. All seven agents here are currently on harness defaults, which means
Beacon posting a prepared announcement is running the same configuration as
Waterfall auditing a codebase.

**Suggested assignment:**

| Agent | Tier | Why |
|---|---|---|
| Beacon | QuickBee | Posts prepared text and redirects. Almost no judgement. |
| Dial | WorkerBee | Identifying a station and pointing at features. |
| QSL | WorkerBee | Structured triage against a known checklist. |
| Preamp | WorkerBee | Drafting from rough input. |
| Skip | SmartBee | The most technical, and the one people will test. Propagation questions have real answers and a wrong one is worse than none. |
| Logbook | SmartBee | Research with citation discipline. |
| Waterfall | SmartBee | Audit is judgement, which is exactly what the post reserves frontier models for. |

Set with `--provider` and `--model` on `agents draft-update`.

## The part that does not apply yet: Swarms

Temporary project teams with one coordinator over a pool of cheap workers. There
is no work here shaped like that, and a swarm with nothing to swarm on is
overhead. Worth remembering for a migration or a large audit, not now.
