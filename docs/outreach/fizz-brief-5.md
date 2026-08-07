# Task brief for Fizz — three fixes

Short one. Answers to your questions are at the bottom.

---

## 1. Workflows — the YAML is fixed

Every step now carries an `id`. Re-read the files; they changed:

```
/Users/mb3/Projects/globefm/docs/outreach/workflows/{welcome,bug-intake,etiquette}.yaml
```

Same channels as before — welcome → signal, bug-intake → build, etiquette →
shortwave. If the relay rejects anything else, quote it verbatim and stop on that
one. Still do not reshape a definition to make it validate.

## 2. Reading notes — publish, but re-read the source first

**The file changed since you staged it.** `§6.2` has been narrowed, because you
were right that it survived the cut and it is the line the audit flagged.

Specifically: *"is the same thing"* became *"rhymes with this — not in stakes,
which are not comparable, but in structure."* And the receiver etiquette is no
longer *"a survival program in miniature"* — it now says it borrows the
structural idea at a far smaller scale, followed by: *"It is not a survival
program. Nobody is fed."*

Restage both parts from the current file, then publish. Melton's answer is **go**.

Two things to carry through while you do:

- The `(see §8.4)` cross-reference is gone from that paragraph already, but
  **sweep for any other reference into §8** — you are dropping it, and a live
  document pointing at a section that is not there reads as sloppy.
- **Leave the Abstract's "Built by Melton Bell III" and §1's "a Black designer
  from Houston" exactly as they are.** They are his self-description, not a
  third-person slip, and they are not yours or mine to edit.

## 3. Channel descriptions

Not yours. Melton is making you admin on `#tuning`, `#build` and `#shortwave` —
your finding that it is role-based rather than agent-based is what unlocked it.
Retry the three descriptions once he confirms.

---

## Your two judgement calls — both right

**The essay's first person.** Correct reading. The boundary means *do not
impersonate him*; it does not mean strip an author's voice out of their own
essay. The attribution line you added — *"Posted by his agent, not by him"* — is
exactly the right resolution and better than either alternative. Keep it, and use
the same line on the reading notes.

**Cutting the research note's tail.** Right call, and for a better reason than
the one you gave. The legal section is a risk analysis of Part 97 exposure — it
concludes we are fine, but publishing your own legal reasoning invites argument
from people who are not lawyers either. The receiver-protection section is
already public in `#signal-path` and `#library` in a form written for operators
rather than for us. Neither should go up. Do not restore them.

---

## Finally

Your batch finding — every batch surfacing exactly its first draft and dropping
the rest — is worth reporting upstream. If you have the context to write it as a
`block/buzz` issue, draft one and leave it in `OUTBOX/` for Melton to file. Do
not file it yourself.
