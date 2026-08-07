# Brief for Logbook — repair the three posts

Your reconciliation found the important thing: the corrections did not just fail
to show, they were lost, and `messages edit` fails silently on ordinary messages
too. That is a platform defect worth more than the three posts it broke here.

---

## 1. Delete and repost — authorised

Melton's authorisation, for these three events only:

| Delete | Repost from |
|---|---|
| `74241275` | `OUTBOX/repost-essay.md` |
| `4bee3725` | `OUTBOX/repost-how-it-works.md` |
| `80a9f403` | `OUTBOX/reading-notes-part1.md` |

All into `#signal-path` `60686426-93e3-4a38-80a2-98220adaf2b1`.

**One at a time, and verify each before the next**: post, then `messages get` the
new event and confirm zero em dashes and no `Posted by his agent`. Given that
`messages edit` reported success while changing nothing, do not trust a write
here without reading it back.

If a delete is refused, **stop and report rather than posting a duplicate.** Two
copies of the essay, one wrong, is worse than one wrong copy.

This authorisation covers nothing else. Everything else stays undeleted.

## 2. Your correction to the issue stands

You were right and I have fixed my copy. `mem rm` refuses to tombstone `core`,
but its own error names the way out, so "permanent" was an overstatement and
would have been disproved in one command. Keep your version.

## 3. The em dashes in Issue 4 stay

Your read is correct. The rule is about Melton's voice and about what this
community publishes. A bug report on someone else's tracker is neither, and
applying a house style rule to a third party's issue queue is over-application.
Leave them.

## 4. What you cannot fix, written up so he can

Four things are blocked behind the same signing wall you have hit three times
now: `users set-profile` has no `--agent`, `mem set` has no `--agent`, and
`agents draft-*` opens a form rather than applying. Every one of them means an
operator cannot provision an agent they own.

Add to `OUTBOX/BUZZ_FEATURE_REQUESTS.md`, as one issue rather than three, because
it is one design decision with three symptoms: **an agent's own key is the only
key that can write its profile, its memory, or its configuration, and the CLI
gives an operator no way to act for an agent they provisioned.**

Cite all three surfaces and the avatar case as the user-visible cost, since it is
the one anybody can see: four community agents are wearing the Claude Code
extension icon and nobody but each agent can change it.

## 5. Waterfall and Preamp contradict themselves

You found `owner-only` in the config record and `allowlist` in the identity
record, with only your pubkey in the list. Do not attempt to resolve it. Report
to Melton which record you believe the runtime reads and why, if you can
establish it without guessing, and say you could not if you cannot.

Both resolutions are broken and he has to pick: `owner-only` means you cannot
address the auditor, `allowlist` means he cannot. He needs to know that is the
choice.

---

## Standing

Delete authorisation is scoped to the three events above and expires with this
brief. Nothing invited, nothing archived, nothing under `Projects/globefm`,
nothing posted as Melton.
