# AuralFM — interface proposal

Written because the interface has outgrown its plan. This is a proposal, not a
decision: the calls that follow are the maintainer's.

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

## Done

**The dial has moved to Explore.** The waterfall and the tuning controls left the
menu-bar popover, which is a player again: what is playing, a way to stop it,
volume, favourites, search. Explore owns the picture and the controls and asks
the popover to retune the audio by message.

That is one of four jobs removed from the wrong window. The remaining three are
proposals.

---

## Proposed

### 1. The transport bar carries too much

Today: play, lock, status dot, favourite, name, frequency/signal, volume, news
ticker, three market prices. Nine elements, and the ticker and the prices already
had to be given separate rows to fit.

**Neither the news ticker nor the market prices belong in a transport bar.**
Both are ambient read-outs about the world; a transport bar is about the sound.
They are there because it was the only horizontal space available.

*Proposal:* move both into the rail as a "world" panel, alongside the sky and
space-weather read-outs that are currently squeezed into the top status strip.
The transport keeps: play, lock, favourite, what is playing, volume. Five things.

*Cost:* the prices stop being glanceable while the globe is full-screen. That may
be the right trade — they are the least related thing in the app to listening.

### 2. The rail needs sections, not a stack

The rail currently switches wholesale between: places, stations, receiver bands,
the dial, favourites, and the cold open. Adding chat gave it a second permanent
region and adding the dial a third, so a shortwave session now shows dial → band
list → chat stacked in one scroll.

*Proposal:* a fixed header region (what is selected, and its controls), one
scrolling body, and one optional footer (chat). The dial belongs in the header
because it is a control for the thing selected, not an item in a list.

### 3. Layers need a home that is not a menu

Day/night, clouds, satellites, aircraft, WSPR, presence, constellations, cables
later — that is a real control surface being kept in a menu because it arrived
one item at a time.

*Proposal:* an inspector, opened from one button, closed by default. This is also
where sound maps and the NASA layers would go without adding a tenth menu item
each.

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

## Sequence

1. **Signing and a release (#4, #14).** Ahead of all of this. Interface work for
   an audience of one is the definition of premature. Ten users would tell us
   more in a week than this document can.
2. Transport bar, because it is visible in every screenshot.
3. Rail structure, because it is where the crowding compounds.
4. Layer inspector, before the next map layer lands rather than after.

---

## The honest note

This document exists because the maintainer noticed the app was getting clunky
before it got much worse. That is the right time to notice. The features are
sound, the measurements behind them are real, and none of this is wasted work —
it is a layout problem, which is the cheap kind.
