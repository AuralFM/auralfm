<!-- Paste into github.com/auralfm → repo named `.github` → file `profile/README.md`
     That renders publicly at github.com/auralfm even while every repo is private. -->

# AuralFM

**A globe you listen to.** Spin the Earth, click a place, hear what it is
listening to right now — about 38,000 internet radio stations, and shortwave
through public receivers that people leave open for anyone to borrow.

macOS, free, no advertising. Windows and Linux later.

**Offline-first. No backend of our own. Collects nothing.** There is no account,
no server of ours, and nothing that records what you played.

---

## If you run a KiwiSDR and found this in your logs

You are the reason this page is public. Connections from the app identify
themselves:

```
User-Agent: AuralFM/0.1.0
```

**A connection only ever happens because a person clicked your receiver.** The
app does not scan, does not probe, and does not connect to anything on its own.

What it will never do:

- **Connect on its own.** No background checks, no availability polls.
- **Hold more than one receiver at a time**, anywhere in the app.
- **Retry a receiver that refused it.** If you are full, it offers a different one.
- **Enumerate receivers.** It has never sent a request to your machine to find
  out whether you exist.
- **Fight your timeouts.** If you drop it, it stays dropped.
- **Squat a slot.** If somebody pauses and walks away, the connection closes
  after ninety seconds rather than holding your slot for the full thirty minutes
  your Kiwi would allow.

**Where the list comes from:** the same public list everyone else reads,
`rx.linkfanel.net/kiwisdr_com.js`, fetched once on a crawl schedule and shipped
inside the app. One request, to one aggregator, for the whole list. Never to your
machine.

### If you would rather not be included

**Ask, and you are out. No argument, no justification needed.** Open an issue
here, or email the address below, and say which host.

The removal happens when the list is built, so an excluded receiver is not in the
shipped file at all — the app never learns you existed, and there is no list of
who opted out sitting inside anybody's software.

**You should not have to firewall us to make it stop.** That costs you work and
costs every other listener your receiver, which is a worse outcome for everyone
than a one-line change on our side.

### If something is wrong

If the app has misbehaved — connected when it should not have, held a slot,
hammered you — that is a bug, and the logs you already have are the evidence.

This project took three receivers offline in the past through careless probing
during development. That is why the rules above are written down and checked by
the build rather than just intended, and why the app now says its own name
instead of arriving anonymously as a browser.

---

## Contact

**melton.bell13@gmail.com** — Melton Bell III, who builds this.

The application source is not public yet. These commitments are, and they are
the ones that affect you.
