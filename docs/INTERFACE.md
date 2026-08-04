# AuralFM — interface

Written because the interface had outgrown its plan. Most of it is now done; the
diagnosis is kept because the reasoning is worth more than the checklist.

---

## What happened

AuralFM started as a menu-bar player. It became a standalone app with a globe, a
borrowed shortwave receiver, a spectrum display, a schedule, a sky, and a chat.

**Every addition was reasonable. The accumulation is not.** Nothing was done
carelessly — each feature was measured, verified and defensible on its own — and
the result is still a transport bar with nine things in it and a popover that
clips its own title.

That is the ordinary way software gets crowded, and naming it is most of the
fix.

---

## The rule this is missing

Apple's Human Interface Guidelines are usually quoted for spacing and controls.
The part that matters here is earlier than that: **a window should be able to
finish the sentence "this window is for…"** in a few words.

Right now:

| Window | What it says it is for | What it actually holds |
|---|---|---|
| **Popover** | Playing | ~~spectrum, tuning, filters~~ *(moved)*, search, favourites, transport |
| **Explore** | The globe | globe, station list, receiver bands, dial, chat, headlines, markets, sky read-out |
| **Settings** | Settings | settings — this one is fine |

Explore is now doing four jobs. That is the actual problem; the popover was the
symptom that showed first because it is small.

---

## Done — the pass is complete

- **The dial moved to Explore**, and is scoped to the receiver view rather than
  hanging above the station list.
- **Icons are drawn, not borrowed** — no Apple emoji, no font dependency.
- **The transport bar is down from nine elements to five.** The headline ticker
  was deleted; the pop-out card already did that job better, and running both
  was two answers to one question.
- **The read-outs moved onto the globe**, small and tinted, leading with where
  you are looking rather than the subsolar point.
- **The rail stopped flinching** — zero pixels of movement across eight places,
  measured.
- **A first-run walkthrough**, four cards.

---

## The three problems, and where each landed

The original diagnosis, kept because the reasoning is worth more than the
checklist.

### 1. The transport bar carried too much — done

Nine elements: play, lock, dot, favourite, name, frequency, volume, news ticker,
three prices. Neither the ticker nor the prices belonged in a bar that is about
sound; they were there because it was the app's only horizontal space, and both
had already been given their own row to stop them starving each other, which was
the layout admitting it.

The ticker was **deleted** rather than moved — the pop-out headlines card already
did that job better, and running both was two answers to one question. The prices
came back once nothing competed with them, and the bar no longer wraps. Five
elements.

### 2. The rail needed sections, not a stack — done

The dial is scoped to the receiver view, so a spectrum panel no longer sits above
a station list describing a radio that view has nothing to do with. The header
stopped changing height as the globe turns: tags are one scrolled row rather than
wrapping, long names clamp, and the tabs keep their space instead of appearing
and disappearing. **Zero pixels of movement across eight places, measured** —
where before the list jumped every time the selection changed.

### 3. Layers still need a home that is not a menu

Day/night, clouds, satellites, aircraft, WSPR, presence, constellations, with
cables and sound maps still to come — a real control surface kept in a menu
because it arrived one item at a time.

*Proposal, unchanged:* an inspector, one button, closed by default. Worth doing
**before** the next layer lands rather than after, which is the only reason it is
still on this list.

---

## What not to do

**Do not add a mode switch.** "Radio mode / astronomy mode" is the obvious answer
and it is wrong: the whole idea is that the sky, the terminator and the
propagation are all *the same fact* about where you are listening. Splitting them
would make the app easier to describe and worse to use.

**Do not hide shortwave behind an "advanced" toggle.** It is the most distinctive
thing here.

**Do not redesign the globe.** It works, it is the product, and it is the one
surface nobody has complained about.

---

## Where this stands

The crowding this document was opened for is gone. What remains is the layer
inspector, and it is not urgent until another layer is added.

The sequencing note it originally carried — that interface work for an audience
of one is premature, and ten users would teach us more in a week — still holds,
and the maintainer has taken the point: the Apple Developer account is being
sorted, which unblocks #4 and #14.

---

## The honest note

This document exists because the maintainer noticed the app was getting clunky
before it got much worse. That is the right time to notice. The features are
sound, the measurements behind them are real, and none of this is wasted work —
it is a layout problem, which is the cheap kind.
