# For KiwiSDR operators

If you run a receiver and you have found this page because AuralFM turned up in
your logs, this is what it is and what it does. It is written for you, not for
developers.

## What connected to you

**AuralFM is a macOS app.** It shows the Earth, and you can click a place to hear
what it is listening to — internet radio stations mostly, and shortwave through
public receivers like yours. It is free, it has no advertising, and nobody is
being sold anything.

Connections from it identify themselves:

```
User-Agent: AuralFM/0.1.0
```

**A connection only ever happens because a person clicked your receiver.** The
app does not scan, does not probe, and does not connect to anything on its own.

## What it does not do

- **It never connects on its own.** No background checks, no availability polls,
  no warming up a connection in case somebody wants it.
- **It never connects to more than one receiver at a time**, anywhere in the app.
- **It never retries a receiver that refused it.** If you are full, or you said
  no, it offers the person a different receiver instead.
- **It never enumerates receivers.** It has never sent a request to your machine
  to find out whether you exist.
- **It does not fight your timeouts.** If you drop it, it stays dropped.
- **It gives the slot back.** If somebody pauses and walks away, the connection
  closes after ninety seconds rather than holding your slot for the full thirty
  minutes your Kiwi would allow.

## Where the list comes from

AuralFM does not discover receivers by looking for them. It reads the same public
list everyone else does — `rx.linkfanel.net/kiwisdr_com.js` — **once**, on a
crawl schedule, and ships the result inside the app. Your receiver is in that
list because it is already published there.

That means the app makes exactly one request, to one aggregator, for the whole
list. It has never made a request to your machine to build it.

## If you would rather not be included

**Ask, and you are out. No argument, no justification needed.**

Open an issue on the repository, or email the address in the app's Settings under
Contact. Say which host. It is removed from the next build.

The removal happens when the list is built, so an excluded receiver is not in the
shipped file at all — the app never learns you existed, and there is no list of
who opted out sitting inside anybody's software.

**You should not have to firewall us to make it stop.** That costs you work and
costs every other listener your receiver, which is a worse outcome for everyone
than a one-line change on our side.

## If something is wrong

If AuralFM has behaved badly — connected when it should not have, held a slot,
hammered you — that is a bug and worth telling us about, and the logs you already
have are the evidence. This project has taken three receivers offline in the past
through careless probing during development. That is the reason the rules above
are written down, and the reason the app now says its own name in the User-Agent
instead of arriving anonymously as a browser.

## The rules, in full

The eight commitments the code is held to are in
[`DECENTRALIZATION.md`](DECENTRALIZATION.md). They are checked by
`npm run audit`, not just written down.
