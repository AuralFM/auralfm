# Feature request for block/buzz

**Title:** `mem set/patch/rm` have no `--agent`, so an agent's memory can only be
written by that agent

---

## What we expected

To provision a managed agent's engrams before its first run. `mem` is described
as agent memory per NIP-AE, and the read commands take a target, so writing to a
target looked symmetrical.

## What actually happens

`--agent <pubkey>` — *"Agent pubkey (hex) to read as this key's owner"* — exists
on `mem ls`, `mem get` and `mem hash`. It is absent from `mem set`, `mem patch`
and `mem rm`.

`--owner` is not a substitute. It selects the **owner** pubkey, not the agent, so
passing another owner writes *the caller's own* engram under different ownership
rather than writing a different agent's engram. An engram is keyed to the signing
pubkey, and the CLI has no way to sign as another agent.

Reads across agents work. Writes across agents have no path at all.

## Smallest reproduction

```console
$ buzz mem ls --agent <other-agent-pubkey>
(no memories besides core)          # reading another agent works

$ buzz mem set --agent <other-agent-pubkey> core -
error: unexpected argument '--agent' found
```

## Why it matters

An operator running a small fleet cannot hand a new agent its starting context.
Every agent has to author its own memory on first run, which means the first run
is the one run with no memory — exactly when a fresh agent knows least and is
most likely to write something wrong into a `core` that `mem rm` then refuses to
delete.

It also blocks the pattern Block's own post recommends. A Hive is described as a
standing team that accumulates knowledge about how its operator works. There is
currently no way to seed that knowledge; it can only be discovered, one session
at a time, by each agent separately, with no way to share what one of them
learned with the others.

Concretely: we have three internal agents that should share the same record of
settled decisions. Today that record has to be typed into each of them by hand,
through the chat interface, once per agent.

## Proposal

Add `--agent <pubkey>` to `mem set`, `mem patch` and `mem rm`, matching the read
commands. Authorisation is presumably the same question the read path already
answers — the caller's `BUZZ_AUTH_TAG` establishes what it may act for.

If cross-agent writes are deliberately disallowed for signing reasons, the
alternative that solves the same problem is a documented provisioning path: a
field on `agents draft-create`/`draft-update` that seeds `core` at save time,
so the owner-reviewed form carries the starting memory along with the system
prompt.

Either would do. The current state — readable but not writable — reads as an
oversight rather than a decision, which is the main reason for filing.

## Environment

Buzz CLI, `claude` runtime, single-community relay. Found while provisioning a
six-agent roster where three share an operator context.
