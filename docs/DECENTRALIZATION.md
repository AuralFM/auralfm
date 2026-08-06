# Offline-first. Serverless. Collects nothing.

What those three words can honestly carry, what they cannot, and what to build next.

**Written:** 2026-08-02. Every claim below was verified against live services on
that date; the commands are in the repo history.

---

## 1. Start by getting the words right

The trio is a real position and it is worth defending. But two of the three words
are doing more work than they can bear, and the first person to look closely will
say so. Better to fix them now than to be corrected in public.

### "Serverless" is already not true, and Nostr makes it less true

AuralFM has no backend **of its own**. That is the true claim, and it is a strong
one. But the app talks to radio.garden, radio-browser, NASA GIBS, Open-Meteo,
Google News, CoinGecko, Celestrak and wheretheiss.at — all servers. Adding Nostr
does not remove servers; **relays are servers.** Probing six well-known relays on
2026-08-02, three refused the connection outright:

| Relay | Result |
|---|---|
| nos.lol | connected, ~300 notes/hr |
| relay.primal.net | connected, ~306 notes/hr |
| nostr.wine | connected, ~89 notes/hr |
| relay.damus.io | **refused** |
| relay.nostr.band | **refused** |
| relay.snort.social | **refused** |

Decentralised means *many* servers under *many* operators, with no single one able
to shut you out. It does not mean no servers. Half of the best-known relays
declined to talk to us today — that is the actual texture of the thing.

**Recommendation: stop saying "serverless." Say "no backend of our own," or
"nothing to sign into."** Both are true, neither can be picked apart, and the
second is what people actually feel.

### "Offline-first" is true of the catalogue and the interface, not the audio

This is the important one.

All 38,342 stations are Icecast, Shoutcast or HLS endpoints sitting on somebody's
server. **You cannot hear a single one of them offline, and no amount of Nostr,
LoRa or IPFS changes that.** Streaming audio is a continuous byte flow from an
origin; decentralising it would mean re-hosting other people's copyrighted
broadcasts, which is both illegal and against everything else in the design.

What *is* genuinely offline-first: the 12,296 places, the search, the globe, the
Earth textures, the star catalogue, the favourites. Unplug the cable and the app
is still a working atlas of the world's radio. That is real and unusual, and it is
enough — as long as it is stated precisely rather than implied broadly.

**Except in one case.** See §3.

### "Collects nothing" is the one that is fully true — protect it

No servers of ours, no accounts, no analytics, no telemetry. It survives scrutiny
today. Every feature proposed below is judged first on whether it keeps this true,
because it is the only one of the three that is unqualified.

---

## 2. The find: 837 antennas that are not a CDN

> **On the number, and why this document keeps its.** 849 when this was written,
> 837 in the shipped catalogue, 744 answering on the day this note was updated.
> The list moves every week as people plug receivers in and take them down again.
> That is not an inaccuracy to correct once — it is the actual texture of
> volunteer infrastructure, and it is the more interesting fact.
>
> Everywhere else the number is now "around 800", because a precise figure that
> drifts 20% is worth less than an approximate one that stays true. **This
> document is the exception.** It is a dated record of a decision, and the
> numbers in it are what was on the screen when that decision was made. Restating
> them to match today's crawl would destroy the only thing a decision record is
> for. `data/sdr.min.json` is always the live answer.


There is exactly one form of radio in reach that is not somebody's stream server,
and it happens to be the most romantic technology in the whole space.

**Shortwave.** HF signals refract off the ionosphere and cross oceans with no
infrastructure between transmitter and listener. No fibre, no CDN, no company.
Physics and the sky.

You cannot put an HF antenna in a Mac. But several hundred people have put one in
their garden and hung it on the internet.

### Verified, 2026-08-02

`rx.kiwisdr.com`, mirrored machine-readably at `rx.linkfanel.net/kiwisdr_com.js`
(899 KB, regenerated hourly — the copy fetched was 2 minutes old):

| | |
|---|---|
| Receivers listed | **837** |
| Active and online | **837** |
| With usable GPS coordinates | **837** |
| With a free slot at that moment | **807** |
| Latitude span | −44° to +68° |
| In the southern hemisphere | 100 |
| Distinct location strings | 360 |

Concentrated in Germany (73), USA (56), UK (26), New Zealand (25), Australia (25),
Japan (20), Switzerland (20) — but genuinely global, including Chatham Island,
Iceland, and Brazil.

### And the audio actually flows

A KiwiSDR speaks a documented WebSocket protocol — `ws://host/kiwi/<ts>/SND`,
IMA-ADPCM compressed audio, the same one the reference client `jks-prv/kiwiclient`
implements. **A plain browser-native `WebSocket` reaches it.** Tuning 15000 kHz AM
and counting frames:

| Receiver | Location | Result |
|---|---|---|
| `sdr.ironstonerange.com:8073` | South Australia | audio flowing |
| `kiwisdr.dl1rf.ipv64.de:8073` | Bavaria, Germany | audio flowing |
| `kiwisdr.sk2hg.se:8073` | Siknäs Fortress, Sweden | audio flowing |
| `orlygshofn.utvarp.com:8080` | Örlygshöfn, Iceland | audio flowing |

Every one connected and delivered audio within seconds. No key, no account, no
CDN. The receiver in Sweden is a BeagleBone attached to a military wideband dipole
at a Cold War coastal fortress, run by one operator, and it will let you listen to
the North Atlantic sky right now.

### Why this is the centrepiece and not a side quest

- It is the **only** audio in the app that is not a stream server. It is the
  answer to *"but you still hit a server to hear anything."*
- It is **already geolocated.** 837 points with GPS, ready for the globe.
- It is **decentralised in the way that actually matters**: 837 private
  individuals, no company, no single point of shutdown. Nobody can turn it off.
- It is **the Marfa scenario, literally.** Marfa is high-desert West Texas — one
  of the quietest HF environments in North America, and the place people already
  drive to in order to stare at unexplained lights. Someone parked there under the
  moon, borrowing an antenna in Iceland to hear what the ionosphere is doing over
  the North Atlantic, is not a metaphor. It is a WebSocket.

### The constraint, and it is not optional

Last night AuralFM got IP-rate-limited by Celestrak for retrying a failed fetch
every 30 seconds. That was 8 objects and one free service. **KiwiSDR is 837
hobbyists paying their own bandwidth, and the same carelessness would be 837 times
worse.** The protocol tells us the limits directly — the Swedish receiver reports:

```
inactivity_timeout_mins = 30
chan_no_pwd = 3          # only 3 of its 8 channels are open without a password
status_msg = "Try other KiwiSDRs world-wide at rx.kiwisdr.com"
```

Non-negotiable design rules, to be written into the code before the feature ships:

- **Never auto-connect.** A receiver is only contacted on an explicit click.
- **One session at a time.** Ever.
- **Respect `users`/`users_max` from the list** and grey out full receivers rather
  than trying and failing.
- **Never retry a refused receiver.** Offer a different one.
- **Honour the inactivity timeout** rather than defeating it with keepalives.
- **Refresh the receiver list on the crawl schedule, not at runtime** — hourly is
  the publisher's cadence, not ours.
- Send the contactable User-Agent we now send everywhere else.
- **An operator can opt out, and it costs them one email.** Their host goes in
  `data/sdr-exclude.json` and the crawler drops it before the list is built —
  see [`RECEIVERS.md`](RECEIVERS.md), which is written for them rather than for
  us. Nobody should have to firewall this app to make it stop.
- **Give the slot back when you stop using it.** A paused receiver is released
  after ninety seconds. Holding one while playing nothing is squatting, and the
  Kiwi's own thirty-minute limit is not a licence to use all thirty.

Nine rules, but only seven of them are runtime code. The other two — the crawl
cadence and the operator opt-out — are properties of the crawler, and they are
listed here with the rest because a volunteer does not care which process
protects them.

If we cannot commit to all nine, we should not ship it. Burning 837 volunteers to
add a feature would be a worse outcome than not having the feature.

---

## 3. The rest, ranked honestly

### Nostr — good transport, empty neighbourhood

Nostr is the right shape for presence and for the "connected to others around the
world" thread: keys are generated locally, no account, no sign-up, and relays are
interchangeable.

But the geo layer people assume exists **does not.** Querying nos.lol, primal,
damus, nostr.band, snort and wine for kind-1 notes carrying a `#g` geohash tag
across 22 leading geohash characters over 7 days returned **5 notes.** Five. On the
three relays that answered at all.

There is no thriving geotagged Nostr map to plug into. Anything AuralFM does here
is **seeding that data, not consuming it.** That is a legitimate thing to do — it
is arguably the more interesting thing to do — but it changes the pitch from
"we connect you to a decentralised network" to "we are trying to start one," and
those need very different expectations.

Also worth knowing: the `g` tag is not a settled standard. It is used in NIP-52 for
calendar events, and there are at least three competing geo proposals open against
the spec (NIP-115 ISO-3166, a geospatial-types PR, a country-code PR). Picking one
means picking a side in an unresolved argument.

**Recommendation:** use Nostr for #10 presence — ephemeral, geohash-tagged, keys
local, off by default. Expect to be alone there at first. Do not build anything
that *depends* on other people's geotagged notes existing.

### Meshtastic / LoRa — real, cannot carry audio, and blocked on licensing

**Update (#28): researched properly, and the blocker is not technical.** Every
official Meshtastic JavaScript package — `@meshtastic/core`, `protobufs`,
`transport-node`, `js` — is **GPL-3.0**. AuralFM is MIT. Linking them makes the
combined work GPL-3.0, which is the licence doing its job rather than an obstacle
to route around.

It also needs hardware: MQTT does not let a client subscribe without a physical
gateway node, so the feature would be invisible to almost every user.

Worth noting that the objection which killed hosted chat (#11) does *not* apply
here — there is no server of ours, nothing to moderate, and no database. The idea
survives on merit. Revisit if Meshtastic ever ships a permissive client, or if
GPL-3.0 becomes acceptable for AuralFM.



Meshtastic is genuine off-grid mesh: LoRa radios, no carrier, no cloud, encrypted,
multi-hop, and deployments beyond 100 nodes are ordinary.

**But LoRa throughput is a few hundred bytes per message.** Radio audio at even the
worst usable bitrate is thousands of times more than that. You will never stream a
station over LoRa, and any pitch that implies otherwise is a lie that a single
engineer in the audience will catch.

What it *can* carry is exactly what Nostr would carry: presence, a station name, a
short message. So the honest Marfa story is:

> The globe, the 38,342 stations and the search work with no internet at all.
> When there is no internet *either* — no bars, no wifi, nothing — the app can
> still tell the people near you what you found, over a radio that needs no
> network.

That is still the story you want, and it has the advantage of being true.

### Value4Value / Lightning — right idea, wrong plumbing today

Podcasting 2.0's `podcast:value` tag, streaming sats and boostagrams are a real,
working, open spec, and "listener sends value directly to creator, no platform in
between" is *precisely* the favela-kid-into-bitcoin thread. It is the most
on-narrative monetisation idea available.

Two problems:

1. **Radio has no equivalent of the `podcast:value` tag.** Podcasts publish RSS
   with a value block. Stations publish an Icecast URL and nothing else. There is
   no registry of station Lightning addresses.
2. **Building that registry means building a server** — the exact thing the whole
   position rejects. This is the idea that most tempts AuralFM into becoming what
   it said it would not be.

Adoption is also thin by the movement's own account: limited awareness, uneven
support across hosts and apps.

**Recommendation:** do not build a station-payments registry. If value transfer
happens, do the small honest version — a station that *already* publishes a
Lightning address or a `lnurl` in its radio-browser metadata gets a zap button,
and the rest do not. Zero infrastructure, no registry, no server. If nobody
publishes one, the feature quietly does not appear, and that is fine.

---

## 4. What to say no to, and why

### Emergency services — no

Three independent reasons, any one of which is sufficient:

**The content is disappearing.** Encryption has reached critical mass. Las Vegas,
Minneapolis (April 2025), Los Angeles, Chicago, Philadelphia and Seattle now
encrypt routine dispatch in whole or in part. On modern P25 systems it is a
configuration change, not a hardware project. Building a feature on a source that
is actively going dark is building on sand.

**The terms forbid it outright.** Broadcastify §9 prohibits *"any redistribution,
relay, rebroadcast, re-streaming, or embedding of Broadcastify live audio to or on
behalf of any other person, application, website, device, or service"* and *"any
programmatic or automated access to Broadcastify feeds, live audio, recorded calls,
archives, or metadata."* A Premium subscription explicitly does not grant it.
Commercial licences come only through their paid developer programme.

**The harm case is real.** Live public-safety audio, geolocated on a world map,
one click from anywhere, is a tool for evading response and for finding people at
their worst moment. AuralFM is an app for wonder. That is not a squeamish
objection; it is a design one.

There is a legitimate adjacent thing: **NOAA Weather Radio and shortwave emergency
broadcasting** are public, unencrypted, and meant to be heard. Several KiwiSDRs
cover those bands already. That gets the civic-infrastructure feeling without any
of the above.

### Trucker / CB radio — not as imagined

Channel 19 is a genuine piece of American folklore and there are hobbyist streams
of it. But: they are few, ungeocoded, mostly quiet, and entirely dependent on one
person's receiver staying on. Meanwhile the truckers themselves largely moved to
**Zello**, which is centralised, proprietary, and the opposite of this project.

Chasing CB is chasing a 1970s artefact through a 2010s app. **The thing CB actually
was — strangers on an open frequency, no company in the middle, you hear whoever
the sky brings you — is shortwave, and §2 is how you get it.** That is the same
feeling with 849 sites and a live signal instead of three streams and static.

---

## 5. The narrative

Not "offline-first, serverless, collects nothing." Those are engineering claims,
two of them imprecise, and none of them a story.

> **A window onto the world you can listen to.**
>
> The Earth is there when you open it — real weather moving across it, the
> day/night line where it truly is, the station overhead. Click anywhere and hear
> what that place is listening to right now.
>
> Everything you need to find a station is already on your machine. There is
> nothing to sign into, nothing that reports back, and nobody keeping a list of
> what you played.
>
> And on the shortwave bands you are not listening to a server at all. You are
> borrowing an antenna — someone's dipole in Iceland, a dish in Chatham Island, a
> wire strung across a Bavarian garden — and hearing what the sky is doing over
> that place, this minute. That signal reached the antenna with no company in the
> middle. It just travelled.

The two images Melton described both survive this framing intact, and neither
needs a claim that would not hold up:

- **Marfa, under the moon.** The catalogue is on the machine, so the app works
  with no signal. The HF bands are quietest and longest exactly there and exactly
  then. And the presence layer can ride LoRa when there is no internet at all.
- **The kid in the favela.** No account, no card, no gatekeeper — the app is the
  same app for everyone who opens it. If value moves, it moves directly, and only
  where a station already asked for it.

---

## 6. Sequence

1. ~~**KiwiSDR receivers on the globe** (#24)~~ — **done**, 326c4a2. 837
   receivers, the seven runtime etiquette rules in the code, verified in the packaged
   build against Christoval TX, Trondheim, Siknäs, Bavaria, Örlygshöfn and
   South Australia. AuralFM now has audio that is not a stream server.
2. ~~**Fix the language**~~ — done. "No backend of our own" replaces
   "serverless" in the README, `PRODUCT.md`, the Settings promise in all five
   languages, and the About panel.
3. **Nostr presence** (#10) — build it expecting an empty room.
4. **Meshtastic presence** — only after #10 works over the internet.
5. **Zap button where a station already published an address** — no registry, ever.

Not doing: emergency services, CB streams, decentralised station audio.
