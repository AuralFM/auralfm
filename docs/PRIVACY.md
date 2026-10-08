# AuralFM — Privacy Policy

**Last updated: 6 October 2026**

AuralFM plays internet radio. It comes as a Mac application and as a web version
you can open in a browser or add to a phone's home screen. This policy covers
both, and says clearly where the two differ — because on one point they do.

Short version: **AuralFM has no accounts, no profiles and no tracking, and the
app has no analytics. We do not collect what you listen to.** But radio is the
open internet. The station you play, and the services that draw the globe, see
your IP address, the same way any website you visit does. Every one of them is
named below, with what it sees.

## What AuralFM stores

Nothing is stored anywhere but on the device in front of you. Where exactly
depends on which version you are using.

**The Mac application** keeps these in your macOS Application Support folder:

| File | Contains |
|---|---|
| `state.json` | Favourites, volume, last station, layer preferences |
| `streams.json` | Last known working stream URL per station |
| `failures.json` | Stations that recently failed, so they sort lower |
| `sky-*.jpg` / `.png` | Cached satellite imagery |
| `favsync.json` | Only if you turn on favorites sync: its secret, and when each station was starred |

You can delete any of it at any time. Removing the app removes it all.

**The web version** has no files of its own. Favourites, settings, the last
station and your chat identity live in your browser's local storage for this
site, and nowhere else. They do not follow you to another browser or another
device, because there is no account to carry them, unless you turn on favorites
sync (below), which carries the favorites and nothing else. Clearing this site's data in
your browser is a complete reset, and removing it from your home screen takes
the same data with it.

If you add the web version to a home screen, it also keeps a copy of the app's
own files — the page, the code, the globe's textures and the station list — so
it opens without a network. That cache is the app itself, not anything about
you.

## What AuralFM does not do

- No user accounts, sign-in, or profiles
- No analytics, telemetry, crash reporting, or usage tracking
- No advertising, and no advertising or tracking SDKs of any kind
- No collection of your name, email, location, contacts, or device identifiers
  (the one exception is on the website, not in the app: the waitlists, below)
- No selling or sharing of data, because none is collected

## Third-party services AuralFM contacts

Playing live radio and showing live conditions requires network requests. In the
Mac application, every one of them goes **directly from your computer to the
service**; none passes through any server we operate, and we never see them.

**In the web version, the headlines do not.** See "What the web version routes
differently" below. The rest of this table applies to both.

| Service | Purpose | What it necessarily sees |
|---|---|---|
| The radio station's own server | Playing audio | Your IP address, as with any stream |
| The station's own website | Its logo, when you open a station's profile | Your IP address |
| radio-browser.info | Looking up a station's current stream when you press play; play counts | Your IP address, the station played |
| NASA GIBS | Satellite cloud imagery | Your IP address |
| Open-Meteo | Weather for a selected place | Your IP address, the **selected city's** coordinates |
| Google News RSS | Headlines for a country or place | Your IP address |
| BBC, Al Jazeera, France 24, DW (their own RSS feeds) | World headlines | Your IP address |
| The publisher of a headline you open | Reading it in the app | Your IP address, and which article |
| CoinGecko | Crypto prices | Your IP address |
| wheretheiss.at / Celestrak | ISS and satellite positions | Your IP address |
| rx.linkfanel.net | The list of shortwave receivers, refreshed at most twice a day | Your IP address |
| A shortwave receiver you click | Listening to that antenna | Your IP address, and which frequency you tuned |
| listen.auralfm.xyz (AuralFM's own site, hosted by here.now) | The list of shows AuralFM no longer lists. Asked for only while a show is on air to be listed, at most every half hour | Your IP address. Nothing about you or what you are hearing |

Two points worth stating plainly:

1. **Weather requests contain the coordinates of the city you clicked**, chosen
   from a fixed public list — never your own location. AuralFM never requests or
   uses your device location, and never asks for the location permission.
2. **The globe opens on a city near you, worked out from your time zone.** Your
   device's time zone is a name like `Europe/Berlin`, which the app matches
   against its own list of places so the first thing you see is somewhere
   plausible rather than the middle of the Pacific. This happens entirely on the
   device. The time zone is not sent anywhere, and it is a region, not a
   location — it cannot say which town you are in. The same time zone decides
   whether music stations from other countries play where you are (see the
   Terms): again on the device, with nothing sent.
3. **Play counts are reported to radio-browser.** Their documentation asks
   clients to do this so station popularity rankings stay meaningful. The report
   contains the station's identifier and nothing about you.

Each of these services has its own privacy policy, which governs what they do
with a request once it reaches them.

## What the web version routes differently

The web version is hosted on [here.now](https://here.now), which serves the page
and its files. Like any web host, it can see the requests that fetch them — your
IP address, and which file you asked for. That is the cost of the app being a
web page at all, and it applies from the moment you open it.

here.now also keeps **page-view counts** for the site, and we can read them:
which page was opened, when, the referring site, and the country. They are
counts of page loads, not a record of you — nothing in them says which station
you played, what you favourited or what you wrote in chat, because none of that
is ever sent. The desktop app has no equivalent: it has no analytics at all.

Headlines, and reading them, additionally pass **through** that host rather than
going straight out, because a browser is not allowed to fetch them directly:

| Route | Goes to | What the request carries |
|---|---|---|
| Headlines for a country or place | Google News RSS | Your IP address |
| World headlines | The BBC, Al Jazeera, France 24 and DW feeds | Your IP address |
| Reading a world headline in the app | That story's page on the BBC, Al Jazeera, France 24 or DW site | Your IP address, and which article |

None of it is logged by us; we run no server and keep no logs. What here.now
retains is governed by their policy, not ours.

**The Mac application does not do this.** It fetches the headlines and the articles directly,
and nothing it does passes through a host of ours.

## The waitlists (the website only)

This is the one place AuralFM asks you for anything, and it is on auralfm.xyz,
not in the app. There are two lists: one for the desktop beta, and one for
sponsorship. If you join either, we keep:

- your **name** and **email address**,
- **which computer** you use (for the desktop beta) or **which sponsorship** you
  are interested in,
- anything you chose to write in the **note**,
- that you **confirmed you are 13 or older** (a tick box; we keep the tick, not
  your age or birthday).

It is stored with the company that hosts the website, as that site's own data.
Only we can read it; it is not public. The host also sees your IP address when
you send the form, and uses it to limit how many sign-ups one connection can
send, which keeps spam out.

We use it for one thing: to email you about what you signed up for — a note that
you are on the list, then an invite and a build for the beta, or sponsorship
opening. It is never sold, shared, or added to any other list. To come off
either list, reply "remove" to any email from us, or write to
**hello@auralfm.xyz**, and we delete it.

**How the emails are sent.** Through [Resend](https://resend.com), an email
delivery service, from hello@auralfm.xyz. To send one, Resend receives your name,
your email address and the email itself; it does not get the rest of what you
sent us. We do not put tracking pixels or tracked links in our emails.

## Claiming a station (the website only)

People who run a station can claim its page with a form on docs.auralfm.xyz. It
asks for the station, your **name** and **email address**, and whatever you choose
to add: the station's website, a description, your links, a Nostr key and a
**Lightning address** for tips or a **donation page**, and that you confirmed you are
18 or older. It is stored the same way as the waitlists: with
the company that hosts the website, readable only by us, capped per connection.

We use your email to confirm the station is yours, and to write to you about
the claim — that we received it, and when it is approved — through Resend, as
above; for nothing else. The
description, links and Lightning address are published on the station's page in
the app, because that is what you sent them for; your name and email are never
published. To change or remove any of it, send the form again or email
**hello@auralfm.xyz**.

## Shortwave receivers

The shortwave receivers on the globe are private machines — someone's radio and
antenna, in someone's garden, connected at their own expense. Two things follow
from that, and both are worth saying plainly.

**A receiver you click sees your IP address and the frequency you tuned**, in the
same way a radio station's server sees your IP when you press play on a station.
AuralFM connects only when you click a specific receiver, only to that one, and
only one at a time. It never contacts a receiver in the background, never scans
them to see who is free, and never retries one that refused — the list of who
exists comes from a single aggregate file, not from asking every machine on the list.

**The operator can see they have a listener.** That is inherent to borrowing
someone's antenna, and it is the same bargain the receiver's own web page offers.

## Optional features that are off by default

**Listener presence** is off until you turn it on in Settings. It and favorites
sync (further down) are the only things in the app that send anything, which is
why both are off and why this section is the longest one here.

With it on, and only while you are playing something, AuralFM announces:

- the **station's** name, and
- the **station's** location, rounded to a grid cell of roughly 20 km.

It does not send your location. The coordinates announced are the transmitter's
or the receiver's, not yours, and they are deliberately blunted: the cell is
about 20 km across, so the announcement says "somewhere in this region" rather
than naming a place.

**There is no account, and no identifier that survives the app.** A signing key
is generated when AuralFM opens and thrown away when it closes. Nothing links one
session to the next, which means nothing can accumulate into a profile — not
here, and not at any relay.

**The messages ask not to be stored.** They are published as a type that relays
are asked to forward and discard rather than retain. Most relays honour that.
Nobody can guarantee that every relay does, which is the honest position, and it
is why nothing in these messages is worth keeping in the first place.

**Relays are chosen, not owned.** AuralFM picks public relays near the place you
are listening to, from a public directory plus a few well-known ones, and you can
add your own in Settings — yours are tried first. A relay is asked only for
messages in the cell you are listening to or looking at. No relay is told where
you are.

**Favorites sync** is off until you turn it on in Settings. It keeps your
favorites the same on each device you give its code to. There is still no
account.

- **What is sent:** your list of favorites (each station's name, town, country
  and position, and when you starred or un-starred it). Nothing else: no
  listening history, no settings, no chat.
- **Where it goes:** to three public relays (nos.lol, relay.primal.net and
  relay.damus.io), as one note that replaces itself each time. A relay keeps
  the newest copy, not a history.
- **What a relay can see:** your network address (IP address) when a device
  syncs, the time, the size of the note, and a key made only for this. It
  cannot read the list: the list is sealed on your device before it leaves,
  with a key that comes from the code. The key that signs the note is not your
  chat identity and cannot be linked to it.
- **The code is the access.** Anyone who has it can read your favorites and
  change them. It is kept on each device you add it to (on a Mac, in a file
  only your user account can read). AuralFM never sees it, and cannot recover
  it or reset it for you.
- **Turning it off** removes the code from that device. Your favorites stay on
  the device. The sealed note stays on the relays until they drop it; without
  the code nobody can read it. AuralFM cannot delete it for you, because it
  does not run those relays.
- **Erase everything** turns sync off on that device first.

## Live shows (beta)

A show goes from the host's device straight to yours. AuralFM has no server in
between, and keeps nothing about who listened.

- **Each side sees the other's network address** (IP address), as a station's
  server does when you play its stream. A host can see the addresses of the
  people connected; a listener can see the host's.
- **How the two devices find each other:** your device writes how it can be
  reached and sends it to the host in a sealed message. The relays that carry
  it can see that a sealed message went to the host's key. They cannot read it.
- **To find its own public address,** each device asks a STUN server
  (Cloudflare's or Google's). That server sees the device's address and
  nothing about the show.
- **A show is listed** while its host is live: its name and its town, on the
  same public relays the chat uses. It needs "Show other listeners" on.
- **Reporting a show** hides its host on your device and opens an email draft
  to hello@auralfm.xyz. Nothing is sent unless you send it.
- **Nothing is recorded** by AuralFM. A host may record their own show.

Shows are in testing and not yet in the public apps.

## Children

AuralFM is not directed at children, and it is for people aged 13 and over (18
and over to go live, or to claim a station). The app collects no information from
anyone. The waitlists are the one place anyone gives us a name or an email, and
each asks you to confirm you are 13 or older before it sends; if we learn that
someone under 13 has joined one anyway, we delete what they gave us.

## Changes

If this policy changes, the date at the top changes with it. Because the app is
open to inspection, you can verify these claims in the source rather than take
them on trust.

## Contact

**hello@auralfm.xyz**

## Live captions: removed

Captions were taken out of the app on 7 August 2026. It no longer downloads a
speech model or runtime from anyone, and nothing about what you hear is
transcribed. (The design and why it went are in `CAPTIONS.md`.)
