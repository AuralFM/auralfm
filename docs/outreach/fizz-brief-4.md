# Task brief for Fizz — restructure the forums, then fill them

Paste into Buzz Desktop as a message to Fizz. This supersedes brief 3; anything
already done from it stands.

**Standing instruction from Melton for this brief: do everything you are capable
of doing.** Do not stop at the first owner-only wall and hand the rest back —
work around it, do the parts you can, and list what is left. Only the genuinely
impossible comes back to him.

**Do not rename or modify yourself.**

---

## The structure, corrected

`#library` was carrying both radio reference and project material. Melton wants
them separated:

- **`#library`** — a reference directory about **radio itself**. Licensing,
  history, how propagation works, what is on the bands. **Nothing about AuralFM.**
- **A second forum** — **the project**: how it works technically, why it exists,
  what it refuses to do, the reading behind it.

Suggested name for the second: **`signal-path`** — a real term for the whole
chain a signal travels from antenna to ear, which is also what that forum
documents end to end. `project` is the plainer alternative if that reads as too
clever. Description:

> How AuralFM works, why it exists, and what it will not do.

## Task A — move what is in the wrong place

Two of the four posts already in `#library` are about the project, not radio:

- **"Borrowing somebody's antenna"** — currently the `#library` canvas. The
  receiver etiquette is genuinely general radio conduct, so **leave it in
  `#library`**, but it should also exist in the new forum, because it is the
  clearest statement of what this project commits to. Post it in both.
- Post 6 (the app) was never published. It belongs in the new forum. Text is in
  `docs/outreach/buzz-forum.md`.

The three propagation and history posts stay in `#library`.

## Task B — fill `#library`

Three new posts at `/Users/mb3/Projects/globefm/docs/outreach/buzz-library-extra.md`.
Bodies only — inside the blockquote, `>` stripped, category lines and editorial
notes dropped.

1. **Getting licensed, and why you probably do not need to** — post this first.
   It is the most practically useful thing in the library and it is the answer to
   anyone who reads the pirate history and gets ideas.
2. **A short history of radio**
3. **A short history of shortwave**

Then publish **post 4, "Underground radio, and why it keeps coming back"**, from
`buzz-forum.md` — held back until now. It belongs in `#library` as history, and
it now sits behind the licensing post, which is the right order.

## Task C — fill the new forum

Per brief 3, with the same editing rules, which have not changed and are not
optional:

| Source | Post as |
|---|---|
| `AURALFM — Essay, what does it cost to receive.md` | **What does it cost to receive?** |
| `AURALFM — Research, adjacent projects and funding.md` | **Adjacent projects: AREDN, ClockworkPi, AT Protocol** |
| `AURALFM — Influences, reading notes.md` | **Reading notes: the aural imaginary and the Platopticon** |
| `buzz-forum.md` post 6 | **What this app does, and what it refuses to** |

All in `/Volumes/Storage/Knowledge-Base/04 Projects/AURALFM/` except the last.

**Strip:** the audit sections, the correction header on the reading notes, every
third-person reference to "Bell", and the entire funding section of the research
note. **Keep:** the corrections themselves — Kheshti is Associate Professor of
Ethnic Studies at UC San Diego; around 800 receivers.

Add one more, written by you from `docs/` in the repo — **"How it actually
works"**, a technical guide: offline-first catalogue, no backend, Nostr presence
with 20 km rounding and an ephemeral key, the receiver etiquette in code, why
there is no account and no paid tier. Sources are `README.md`,
`docs/DECENTRALIZATION.md` and `docs/PRIVACY.md`. This is the piece a technically
curious person will look for and there is currently nothing to point them at.

## Task D — anything from brief 3 still outstanding

QSL, the three workflows, the diagnostic on `#build`. If any are done, say so and
move on.

## Task E — what you can reach that Melton has been doing by hand

Try each; report what the relay refuses:

- Channel descriptions on `#tuning`, `#build`, `#shortwave` — the three lines are
  in `docs/COMMUNITY.md` under "Channel descriptions".
- Join Melton to `#library` and the new forum if membership can be added for
  another pubkey. He could not find `#library` because open channels are
  self-join and never appeared in his sidebar. His pubkey is in
  `GUIDES/AURALFM_COMMUNITY_SETUP.md`.

---

## Boundaries

- Nothing invited, nothing shared outside the community, nothing deleted.
- Nothing written under `/Users/mb3/Projects/globefm`.
- Nothing posted in Melton's first person or signed as him.
- If an editing judgement on the essays feels like his rather than yours, ask.

## Report back

Per task: what was created, IDs, errors verbatim, and what is left for Desktop.
Append to `GUIDES/AURALFM_COMMUNITY_SETUP.md` under a new dated heading.
