# AuralFM — Privacy Policy

**Last updated: 2 August 2026**

AuralFM is a desktop application that plays internet radio. This policy explains
what it does and does not do with your information.

Short version: **AuralFM has no servers, no accounts, and no analytics. Nothing
about what you listen to is sent to us, because there is no "us" to send it to.**

## What AuralFM stores

Everything AuralFM saves is stored **only on your own computer**, in your macOS
Application Support folder:

| File | Contains |
|---|---|
| `state.json` | Favourites, volume, last station, layer preferences |
| `streams.json` | Last known working stream URL per station |
| `failures.json` | Stations that recently failed, so they sort lower |
| `sky-*.jpg` / `.png` | Cached satellite imagery |

You can delete any of it at any time. Removing the app removes it all.

## What AuralFM does not do

- No user accounts, sign-in, or profiles
- No analytics, telemetry, crash reporting, or usage tracking
- No advertising, and no advertising or tracking SDKs of any kind
- No collection of your name, email, location, contacts, or device identifiers
- No selling or sharing of data, because none is collected

## Third-party services AuralFM contacts

Playing live radio and showing live conditions requires network requests. These
go **directly from your computer to the service** — they do not pass through any
server we operate, and we never see them.

| Service | Purpose | What it necessarily sees |
|---|---|---|
| The radio station's own server | Playing audio | Your IP address, as with any stream |
| radio.garden | Resolving a stream URL when you press play | Your IP address |
| radio-browser.info | Fallback stream lookup; play counts | Your IP address, the station played |
| NASA GIBS | Satellite cloud imagery | Your IP address |
| Open-Meteo | Weather for a selected place | Your IP address, the **selected city's** coordinates |
| Google News RSS | Local headlines | Your IP address |
| CoinGecko | Crypto prices | Your IP address |
| wheretheiss.at / Celestrak | ISS and satellite positions | Your IP address |
| rx.linkfanel.net | The list of shortwave receivers, refreshed at most twice a day | Your IP address |
| A shortwave receiver you click | Listening to that antenna | Your IP address, and which frequency you tuned |

Two points worth stating plainly:

1. **Weather requests contain the coordinates of the city you clicked**, chosen
   from a fixed public list — never your own location. AuralFM never requests or
   uses your device location.
2. **Play counts are reported to radio-browser.** Their documentation asks
   clients to do this so station popularity rankings stay meaningful. The report
   contains the station's identifier and nothing about you.

Each of these services has its own privacy policy, which governs what they do
with a request once it reaches them.

## Shortwave receivers

The shortwave receivers on the globe are private machines — someone's radio and
antenna, in someone's garden, connected at their own expense. Two things follow
from that, and both are worth saying plainly.

**A receiver you click sees your IP address and the frequency you tuned**, in the
same way a radio station's server sees your IP when you press play on a station.
AuralFM connects only when you click a specific receiver, only to that one, and
only one at a time. It never contacts a receiver in the background, never scans
them to see who is free, and never retries one that refused — the list of who
exists comes from a single aggregate file, not from asking 837 machines.

**The operator can see they have a listener.** That is inherent to borrowing
someone's antenna, and it is the same bargain the receiver's own web page offers.

## Optional features that are off by default

**Listener presence** is disabled unless you deliberately configure a server
address. If you enable it, AuralFM sends a randomly generated per-session
identifier and the station you are listening to, so listeners can be counted. The
identifier is not tied to you and changes every time the app launches.

## Children

AuralFM is not directed at children and collects no information from anyone.

## Changes

If this policy changes, the date at the top changes with it. Because the app is
open to inspection, you can verify these claims in the source rather than take
them on trust.

## Contact

**meltonbell@icloud.com**

## Live captions (off by default)

Switching captions on changes two things, and both are worth stating plainly.

**A one-time download from Hugging Face.** The speech model's weights are fetched
the first time captions are enabled — roughly 120 MB — and cached after that.
This is the only request AuralFM makes to Hugging Face, it carries no
information about you beyond the fact that a model was downloaded, and **no audio
ever leaves the machine.** Whisper runs entirely in the app. There is no cloud
speech API, because sending the audio somewhere would mean transmitting what you
are listening to.

**Streams load with `crossOrigin`.** Web Audio cannot read a cross-origin stream
— it returns silence — so captions require the station's server to permit it.
This flag is applied *only* when captions are on; with the feature off, playback
is byte-for-byte what it has always been. Where a station's server refuses, the
app falls back to normal playback and says captions are unavailable there.
