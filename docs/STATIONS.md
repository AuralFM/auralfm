# AuralFM — for stations

**Last updated: 26 September 2026**

If you run a radio station, it may already be on AuralFM: a dot on a globe of
tens of thousands of stations, from community and college radio to faith,
underground and online-only stations. Nobody pays to be listed, nobody pays to be
first, and there is no algorithm deciding who gets heard. A station in Kampala
gets the same dot as one in Paris.

## How your station got here

From open directories (radio.garden and radio-browser.info), with towns and
regions from [GeoNames](https://www.geonames.org) (CC BY 4.0), and from what you
publish yourself: your stream's own headers (the name, genre and website your
streaming server announces) and your homepage (its title, description, image and
the links to your social accounts).

When someone presses play, their device connects to **your** stream directly.
AuralFM does not host, copy or re-stream your audio, and it credits your play
count on radio-browser.info, as that directory asks.

## Fix it, or take it down

Email **hello@auralfm.xyz** from an address at your station's own website. We
correct your listing (name, place, website, genre) or take the station off
AuralFM altogether, whichever you ask.

## Claim your page

The quickest way: fill in the short form at
[docs.auralfm.xyz/claim](https://docs.auralfm.xyz/claim/). No account, no email
back and forth. We check the station is yours, then your description, your links
and your Lightning address go on its page.

Or, if you run your own website, put one small file on it, at this address:

`https://your-station.example/.well-known/auralfm.json`

With any of these fields, all optional:

```
{
  "name": "Radio Example 101.5",
  "description": "Community radio for the east side since 1998.",
  "genres": "reggae, dub, talk",
  "logo": "https://your-station.example/logo.png",
  "lightning": "tips@your-station.example",
  "nostr": "npub1…",
  "contact": "hello@your-station.example"
}
```

Only whoever runs your website can put a file there, so that file is your
station speaking. AuralFM reads it when it next visits your homepage, and what it
says is shown as yours.

## Tips go straight to you

Put a **Lightning address** in that file and listeners can tip your station
directly, wallet to wallet. **AuralFM never holds, pools or forwards the money**;
it only shows your address, taken from your own website, and the listener's
wallet pays yours. No fee to us, no account with us.

The same goes for the people who run the public shortwave receivers AuralFM
tunes: publish an address and listeners can thank you for the antenna.

## How we visit

As `AuralFM-directory` in the User-Agent, once in a while, one page (your
homepage, plus the claim file), one request at a time, and never where your
robots.txt says not to. Nothing about your listeners is ever involved.

## Contact

**hello@auralfm.xyz**
