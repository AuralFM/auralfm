# GlobeFM — Privacy Policy

**Last updated: 2 August 2026**

GlobeFM is a desktop application that plays internet radio. This policy explains
what it does and does not do with your information.

Short version: **GlobeFM has no servers, no accounts, and no analytics. Nothing
about what you listen to is sent to us, because there is no "us" to send it to.**

## What GlobeFM stores

Everything GlobeFM saves is stored **only on your own computer**, in your macOS
Application Support folder:

| File | Contains |
|---|---|
| `state.json` | Favourites, volume, last station, layer preferences |
| `streams.json` | Last known working stream URL per station |
| `failures.json` | Stations that recently failed, so they sort lower |
| `sky-*.jpg` / `.png` | Cached satellite imagery |

You can delete any of it at any time. Removing the app removes it all.

## What GlobeFM does not do

- No user accounts, sign-in, or profiles
- No analytics, telemetry, crash reporting, or usage tracking
- No advertising, and no advertising or tracking SDKs of any kind
- No collection of your name, email, location, contacts, or device identifiers
- No selling or sharing of data, because none is collected

## Third-party services GlobeFM contacts

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

Two points worth stating plainly:

1. **Weather requests contain the coordinates of the city you clicked**, chosen
   from a fixed public list — never your own location. GlobeFM never requests or
   uses your device location.
2. **Play counts are reported to radio-browser.** Their documentation asks
   clients to do this so station popularity rankings stay meaningful. The report
   contains the station's identifier and nothing about you.

Each of these services has its own privacy policy, which governs what they do
with a request once it reaches them.

## Optional features that are off by default

**Listener presence** is disabled unless you deliberately configure a server
address. If you enable it, GlobeFM sends a randomly generated per-session
identifier and the station you are listening to, so listeners can be counted. The
identifier is not tied to you and changes every time the app launches.

## Children

GlobeFM is not directed at children and collects no information from anyone.

## Changes

If this policy changes, the date at the top changes with it. Because the app is
open to inspection, you can verify these claims in the source rather than take
them on trust.

## Contact

**meltonbell@icloud.com**
