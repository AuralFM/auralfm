# Task brief for Fizz — QSL, workflows, and the second forum

Paste into Buzz Desktop as a message to Fizz.

**Do not rename or modify yourself.** Melton applies `prompts/logbook.txt` by hand.

---

## Task A — QSL, again

The QSL draft did not arrive. Skip did. Same command, same file:

```
cat /Users/mb3/Projects/globefm/docs/outreach/prompts/qsl.txt \
  | buzz agents draft-create --channel 0d974029-313c-42ef-a63e-c6be81d904ed \
    --display-name "QSL" --system-prompt -
```

**Then immediately check the failure hypothesis.** Skip landed and QSL did not,
twice. The only difference between them is the target channel. Repeat the call
once more with `--channel` set to **#tuning** `c6e91656-e106-4c2f-af93-968e7efd9502`
— the channel Dial landed from — and report both request IDs. If the #tuning one
appears and the #build one does not, the problem is `#build`, not QSL, and that
is worth knowing before anyone tries to add a fourth agent there.

QSL can be moved to #build after it exists.

## Task B — three workflows

YAML is at `/Users/mb3/Projects/globefm/docs/outreach/workflows/`. Create each in
the channel named below:

| File | Channel | Trigger |
|---|---|---|
| `welcome.yaml` | signal `4edb04f8-7089-4984-8db5-666cfc39c5fe` | 👋 reaction |
| `bug-intake.yaml` | build `0d974029-313c-42ef-a63e-c6be81d904ed` | 🐛 reaction |
| `etiquette.yaml` | shortwave `05e36878-51c5-47fa-be2b-c6c95e1d2001` | 📻 reaction |

```
buzz workflows create --channel <uuid> --yaml "$(cat <file>)"
```

**All three are reaction-triggered on purpose, and it is worth understanding
why** — Buzz has no "member joined" trigger. The trigger set is `message_posted`,
`reaction_added`, `diff_posted`, `schedule` and `webhook`. Firing a welcome on a
newcomer's first message would greet people for saying "thanks" in the wrong
channel. A human waving has no false positives.

Also worth knowing before proposing anything more ambitious: workflows **cannot
invoke agents today**. The action set is `send_message`, `send_dm`,
`set_channel_topic`, `add_reaction`, `call_webhook`, `request_approval`, `delay`.
`invoke_agent` is proposed in block/buzz#3871 and does not exist. A workflow
cannot make Dial answer something.

If `workflows create` rejects any of the YAML, quote the error verbatim and stop
on that one — do not reshape the definition to make it validate.

## Task C — a second forum channel

`#library` is *how radio works*. The project's own thinking is a different
register and should not be interleaved with it.

Create a forum channel — suggested name **`why`**, description:

> Why this exists, what it refuses to do, and the reading behind it.

Then publish these three as forum posts (`--kind 45001`) from the vault:

| Source | Post as |
|---|---|
| `/Volumes/Storage/Knowledge-Base/04 Projects/AURALFM/AURALFM — Essay, what does it cost to receive.md` | **What does it cost to receive?** |
| `/Volumes/Storage/Knowledge-Base/04 Projects/AURALFM/AURALFM — Research, adjacent projects and funding.md` | **Adjacent projects: AREDN, ClockworkPi, AT Protocol** |
| `/Volumes/Storage/Knowledge-Base/04 Projects/AURALFM/AURALFM — Influences, reading notes.md` | **Reading notes: the aural imaginary and the Platopticon** |

**Editing rules, and these are not optional:**

- **Strip the audit sections.** The essay carries an audit of the reading notes
  at the bottom; the reading notes carry a header block of corrections. Both are
  internal working material and read as self-criticism in public. Post the
  argument, not the marking.
- **Strip anything about Melton in the third person.** The reading notes refer to
  "Bell" throughout. Rewrite to first person or cut the sentence.
- **Drop the funding section entirely** from the research post — Open Collective
  fee analysis and strategy is internal, and posting it invites a conversation
  about money that this community should not be having yet.
- **Keep the corrections.** Kheshti is Associate Professor of Ethnic Studies at
  UC San Diego. Around 800 receivers, not 849 or 837. If a source paragraph
  contradicts that, fix it rather than quoting it.
- Content limit is 65,536 bytes. The reading notes are long — if over, post the
  argument and note that the full version exists rather than truncating
  mid-sentence.

If any of that judgement feels like it is yours to make rather than Melton's,
**stop and ask.** These are the documents he cared most about keeping out of
GitHub.

---

## Boundaries

- Nothing invited, nothing shared, nothing deleted.
- Nothing written under `/Users/mb3/Projects/globefm`.
- No owner-only actions.
- Do not post anything in Melton's first person or signed as him.

## Report back

Per task: what was created, request/workflow IDs, and any error verbatim.
Append to `/Users/mb3/.buzz/GUIDES/AURALFM_COMMUNITY_SETUP.md` under a new dated
heading.
