# Task brief for Fizz — republish, and one thing to write

---

## 1. Both vault documents changed. Re-read before publishing.

Melton's direction: **first person, no em dashes.**

- **The essay** had all 23 em dashes removed by hand, one at a time, each
  rewritten for the sentence it was in rather than swapped for a comma. One
  survives, inside the wikilink `[[AURALFM — Influences, reading notes]]`, which
  is a filename. Drop that link when you publish rather than editing the filename
  out of it.
- **The reading notes** had all 230 removed by a scripted pass, plus the tidying
  a mechanical pass always needs. Paired dashes became commas, a dash before a
  lowercase word became a comma, a dash before a capital became a sentence break.
  **Read the result before you post it.** If a sentence reads badly, fix it. That
  is a judgement I could not make 230 times without seeing each one in place, and
  you will be looking at them anyway.
- Third person is gone from both, outside §8 which you are dropping. The one
  remaining "Bell, Melton III" is the bibliography entry at the end, which is a
  citation and stays in citation format.

**Drop the attribution line.** No *"Posted by his agent, not by him."* Melton's
call: either "by me" or nothing at all. Use nothing. The forum is his community
and the byline is redundant.

## 2. Do not publish any legal reasoning

Confirmed. The Part 97 analysis stays out, along with anything else that reads as
his legal position. You already cut it. Do not restore it, and do not summarise
it either.

## 3. Channel descriptions stay with Melton

There is no admin-promotion control in Desktop yet. `buzz channels add-member`
does take `--role admin`, but only an owner can use it and Melton would need his
own key on a command line to do so, which is not worth it for three one-time
edits. He will do them in Desktop, as he already did `#signal`.

**Write the feature request instead**, and leave it in `OUTBOX/` for him to file
against `block/buzz`. Two things in one issue, or two issues if they are cleanly
separable:

1. **No UI to change a member's role.** The CLI has
   `channels add-member --role owner|admin|member|guest|bot`, and the relay
   enforces it, but Desktop exposes no way to promote an existing member. An
   owner cannot delegate channel administration without dropping to a terminal
   and handling their own private key, which is the thing Desktop exists to avoid.
2. **Batched agent drafts silently drop all but the first.** This is your finding
   and you have the evidence: three separate batches, each surfacing exactly its
   first draft. Waterfall and Preamp went to the same channel seconds apart and
   only Waterfall appeared, which rules out channel scoping. Every call returned
   `accepted: true` with an event ID, so the loss is downstream of the relay
   accepting the event. Sending one at a time works every time.

Write it the way you would want to receive it: what you expected, what happened,
what you ruled out, and the smallest reproduction. **Do not file it yourself.**

---

## Everything else

Workflows with the fixed YAML, and anything still outstanding from brief 4.

Same boundaries. Nothing invited, nothing deleted, nothing under
`Projects/globefm`, nothing posted as Melton.
