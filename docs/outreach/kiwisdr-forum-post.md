# Draft: post to forum.kiwisdr.com

Not an announcement. A courtesy notice and a request for review, posted before
anyone can install the app rather than after — so the answer to "should this
exist" can still change the software.

Tone notes for whoever edits this: no marketing, no adjectives about the app, no
screenshots. State what it does to their machines, admit the damage already done,
ask them to check the rules. The three receivers are the credibility. Leave them in.

---

**Subject:** A macOS app that uses public Kiwis — how it behaves, and please tell me if any of it is wrong

---

I have built a macOS app called AuralFM. It shows the Earth, and you click a
place to hear what it is listening to — internet radio mostly, and shortwave
through the public Kiwis on the standard list.

Nobody can install it yet. There is no signed build. I am posting now rather
than after release because if any of what follows is wrong, I would rather find
out while changing it is still cheap.

**What it does to your receiver**

- Connects only when a person clicks it. No scanning, no probing, no background
  availability checks, no warming up connections.
- One receiver at a time, anywhere in the app. There is no way to open two.
- Never retries one that refused. If you are full or you said no, it offers a
  different receiver rather than asking you again.
- Never enumerates. It has never sent a request to anyone's Kiwi to discover it.
  The list comes from `rx.linkfanel.net/kiwisdr_com.js`, read once on a crawl
  schedule and shipped inside the app — one request to one aggregator for the
  whole list.
- Honours your timeouts. If you drop it, it stays dropped.
- Releases the slot after ninety seconds if the listener pauses and walks away,
  rather than holding it for the full thirty minutes.
- Identifies itself: `User-Agent: AuralFM/0.1.0`

**Where I have already got this wrong**

Three receivers stopped answering this project during development, after I
over-probed them while building the receiver list. That is the reason the rules
above are written down and checked by the build rather than merely intended, and
it is the reason connections now carry the app's name instead of arriving as an
anonymous browser — an operator seeing traffic they cannot identify has one
practical response, and it is a firewall rule.

**If you would rather not be included**

Say so and you are out. No argument and no justification needed. One line to me
with the host, and it is dropped when the list is next built, so it is not in
the shipped file at all.

You should not have to firewall an app to make it stop. That costs you work and
costs every other listener your receiver.

**What I am actually asking**

You know more about this than I do. If any of the above is insufficient, or if
there is an expectation I have not accounted for, I would like to hear it now.
In particular:

1. Is ninety seconds the right grace period before releasing a paused slot, or
   should it be shorter?
2. Is there an existing convention for a listening client identifying itself
   that I should be following instead of inventing one?
3. Is the aggregator list the right source, or is there a preferred one?

Full write-up of the commitments, for anyone who wants the detail:
github.com/auralfm

Melton Bell III
melton.bell13@gmail.com
