# The Buzz forum — a library, not a feed

Paste-ready long-form posts for the forum tab at `auralfm.communities.buzz.xyz`.

**What these are for, stated plainly, because it changes how they should be
written.** Channels are for conversation and they scroll away. The forum is the
part that is still there in a year when somebody who is angry looks this project
up. That person will not have read an announcement or a forum post on
kiwisdr.com. They will search the name, land on whatever ranks, and decide in
about forty seconds whether this is somebody who loves radio or somebody
harvesting them.

That decision is not won by a privacy policy. It is won by a body of work that
obviously took real interest to write, because interest is the one thing a
data-harvesting operation never bothers to fake.

So: write about radio, not about the app. The app should be the least
interesting thing on the page.

**Two rules for everything below.**

1. **Never encourage transmitting without a licence.** Listening is unregulated
   almost everywhere. Operating a transmitter is not, and the pirate history in
   post 4 is history and listening, not a how-to. Getting this wrong would hand
   a hostile reader exactly the ammunition they came for.
2. **No place is described as a sound.** "Hear what Lagos is listening to", never
   "hear what Lagos sounds like." See `docs/LISTENING.md`.

---

## Post 1 — Why a radio signal crosses an ocean

*Category: How radio works. The one to write first — everything else refers back
to it.*

> Most radio does not go very far. FM stops at the horizon, roughly, because
> those waves travel in straight lines and the Earth curves out from under them.
> Sixty or seventy miles and you are done.
>
> Shortwave does something else. It leaves the antenna, goes up, hits a layer of
> the atmosphere that has been stripped of electrons by sunlight, and **comes
> back down** — hundreds or thousands of miles away. Then it can bounce off the
> ground and do it again. A signal from a transmitter in Romania can arrive in
> Texas having touched nothing but air, ionosphere, and ocean.
>
> That layer is the **ionosphere**, and it starts around 50 miles up. It is not
> one thing. It is several layers with different characters, and they change
> completely between day and night, which is why shortwave listening is a
> different hobby at 3pm than at 3am.
>
> **The D layer** is the lowest and it is the troublemaker. It only exists in
> daylight, and rather than reflecting signals it *absorbs* them — and it absorbs
> low frequencies far more than high ones. This one fact explains most of what
> confuses newcomers. A frequency that is full of stations at midnight is dead
> silence at noon, and nothing is broken: the D layer is sitting on it.
>
> **The F layer** is the one doing the useful work, 125 to 250 miles up. It is
> what actually bends signals back to Earth. At night it thins and rises, which
> is why the low bands open up after dark — the absorption is gone and the
> reflecting layer is higher, so each hop reaches further.
>
> Two numbers describe the window you are working in. The **MUF**, or maximum
> usable frequency, is the highest frequency that will still be bent back rather
> than escaping into space. The **LUF**, the lowest usable frequency, is where
> absorption swallows the signal before it gets anywhere. Between them is what
> you can hear. Both move all day.
>
> This is the whole reason the app draws the day/night line and the solar
> weather. It is not decoration. Those are the two things deciding what is
> reachable, and they change while you are listening.

---

## Post 2 — The bands, and when each one is alive

*Category: How radio works. The practical companion to post 1.*

> The shortwave broadcast bands are grouped by wavelength, and people still call
> them by metres rather than megahertz — the 49 metre band, the 31 metre band.
> The conversion is not something to memorise. What matters is which behave like
> night and which behave like day.
>
> | Band | Roughly | Character |
> |---|---|---|
> | **120, 90, 75, 60 m** | 2.3–5.1 MHz | Tropical bands. Night only, and mostly regional. Absorbed to nothing by day. |
> | **49 m** | 5.9–6.2 MHz | The classic night band. Loud, crowded, reliable after dark. |
> | **41 m** | 7.2–7.6 MHz | Night, with some late-afternoon reach. |
> | **31 m** | 9.4–9.9 MHz | The most consistently useful band there is. Something is nearly always on it. |
> | **25 m** | 11.6–12.1 MHz | Day and evening. |
> | **19, 16, 13 m** | 15–21.9 MHz | Daylight bands. Long haul when the sun is high and the sun is active. |
> | **11 m** | 25.6–26.1 MHz | Almost empty. Opens spectacularly at solar maximum and is silent otherwise. |
>
> **The rule underneath the table:** high frequencies need daylight, low
> frequencies need darkness. If you remember nothing else, remember that a dead
> band is usually a band you are visiting at the wrong hour.
>
> **The grey line is the good part.** The terminator — the band of twilight
> moving across the Earth — is where the D layer has collapsed but the F layer
> has not yet reformed. For roughly forty minutes along that line, paths open
> that are not available at any other time, sometimes right around the planet.
> Sunrise and sunset are the two appointments in a shortwave listener's day.
>
> This is why the app draws the terminator on the globe. Follow it.

---

## Post 3 — What is actually out there

*Category: How radio works. The one that hooks people, because most have no idea
this is still going on.*

> **International broadcasters.** The BBC, Radio Romania, Radio Havana, China
> Radio International, All India Radio, dozens of others. Fewer than there were,
> and that decline is real — but the ones that remain are broadcasting to people
> who have no other way to receive them, which makes them worth more, not less.
>
> **Religious broadcasters**, who bought most of the transmitters everyone else
> gave up. Whatever you think of the content, they are a large part of why the
> infrastructure still stands.
>
> **Utility stations**, which are not broadcasting to an audience at all. Weather
> fax. Aircraft over oceans, on HFDL and on plain voice. Ships. Time signals like
> WWV, which just reads the time out, forever, and is genuinely soothing.
>
> **Numbers stations.** A voice reading digits, often a child's voice, often for
> years on a fixed schedule. Almost certainly one-way intelligence traffic to
> agents who decode them with a one-time pad. Nobody has ever needed to explain
> them for them to be unsettling.
>
> **Jamming**, which is the most political thing on the dial and the easiest to
> hear once you know what it is. China's **Firedrake** plays looping orchestral
> music on top of stations it wants drowned — most often Sound of Hope, which
> broadcasts into mainland China. If you tune around 9540 and 9535 kHz you can
> often find the target and the jammer sitting five kilohertz apart. Two
> governments arguing, in public, at the speed of light. You are allowed to
> listen to both.
>
> **And pirates**, which get their own post.

---

## Post 4 — Underground radio, and why it keeps coming back

*Category: History. **Listening only.** Operating an unlicensed transmitter is
illegal nearly everywhere, and this post must never read as encouragement.*

> Every era of broadcasting has had people transmitting without permission, and
> the reason is always the same: the licensed spectrum was full, or it was
> expensive, or it belonged to somebody with opinions about what should be on it.
>
> **The offshore stations.** In 1964 Radio Caroline began broadcasting to Britain
> from a ship anchored outside territorial waters, because the BBC had a monopoly
> and would not play pop records. Radio Veronica had been doing it to the
> Netherlands since 1960. They were enormously popular and eventually legislated
> out of existence — and then the BBC launched Radio 1, staffed substantially by
> the pirates' own DJs. The establishment did not defeat them so much as hire
> them.
>
> **Free radio in Europe** carried on through the seventies and eighties, mostly
> on 48 metres, mostly at weekends, mostly people with home-built transmitters
> and a genuine belief that the airwaves were not the state's to ration.
>
> **North American pirates** are still active now, and this is the part people do
> not believe. Activity clusters around **6925 kHz USB**, at weekends and after
> dark. One-off broadcasts, no schedule, station names invented for a single
> evening. Some of it is music nobody would programme. Some of it is a person
> talking. It is genuinely underground in the sense that has almost disappeared
> from the internet: nobody is monetising it and nobody can find you unless they
> tune at the right moment.
>
> **The point, and it is not nostalgia.** Every one of these existed because
> receiving was free and unmonitored. Nobody needed an account to hear Radio
> Caroline. Nobody's listening was logged, sold, or used to decide what they were
> shown next. That property was not a design achievement — it was physics, and
> we have been steadily building it out of everything since.
>
> **To be unambiguous, because this matters:** listening to any of this is legal
> almost everywhere and always has been. *Transmitting* without a licence is not,
> and the people who do it accept a real risk of losing equipment and paying
> fines. This is history and a listening guide. It is not a how-to.

---

## Post 5 — Borrowing somebody's antenna

*Category: Etiquette. **The one that matters most for this project.** Pin it.*

> The shortwave in this app is not a stream from a server. It is somebody's
> actual antenna, in somebody's actual garden, connected to a small computer they
> paid for, on an internet connection they pay for, left open for strangers.
>
> There are around 800 of them. Nobody is paid. Nobody is thanked, mostly.
>
> **How the sharing works.** A KiwiSDR has a small number of listener slots —
> often four, sometimes eight. Each listener tunes independently, which is the
> clever part: you are not sharing a frequency with the other listeners, you are
> sharing the radio. Most operators also set a session limit, commonly thirty
> minutes, with a daily cap. When you see "receiver full", that is not an error.
> That is the machine doing its job.
>
> **What courtesy looks like:**
>
> - **If it is full, go somewhere else.** There are hundreds. The one you wanted
>   is not special enough to sit and retry.
> - **Do not leave a slot open you are not using.** A receiver you walked away
>   from is a receiver somebody else was told was full. This app closes the
>   connection ninety seconds after you pause, for that reason.
> - **Do not automate anything against them.** Whatever you are building, ask the
>   operator first. Repeated automated connections are how receivers get taken
>   offline, and it is not hypothetical — this project did it to three of them
>   while it was being built.
> - **Nothing you do there is private to you, and nothing you hear there is
>   yours to publish.** You are a guest on somebody's machine.
>
> **Why an operator would put a radio on the internet at all**, since it is a
> fair question: mostly so that the antenna they built gets used, and so somebody
> in a flat with no aerial can hear what they can hear. It is the same instinct
> that built the amateur radio service. The right response is to use it and not
> abuse it.
>
> If you get deep enough into this to want your own, a receive-only setup needs
> **no licence at all**, anywhere. A wire and a cheap SDR dongle will get you
> started for the price of a meal.

---

## Post 6 — What this app does with all of that, and what it refuses to

*Category: About. Deliberately last. It is the least interesting post here and
should read that way.*

> Everything above is why this exists. The app is a way in, not the subject.
>
> **What it does.** Draws the Earth with the day/night line where it actually is,
> the solar weather that decides what is reachable, and the receivers and stations
> on top. Click a place, hear it. On the shortwave tab it shows what is
> transmitting *this minute*, filtered to the bands that are actually open.
>
> **What it refuses.**
>
> - **No account.** There is nothing to sign into, so there is nothing to profile.
> - **No server of ours.** It talks to NASA, NOAA, the station directory and some
>   public relays. None of them are ours, and none can link what you played to
>   you.
> - **No recommendations.** Nobody is deciding what you should hear. The station
>   is broadcasting to its own local audience for its own reasons and you are
>   overhearing it. That is a different relationship than being served something.
> - **No advertising, ever, and nothing to buy.** There is no paid tier, because
>   a paid tier requires knowing who paid.
>
> **What it takes from the operators**, stated plainly, because they are the ones
> giving something up: one connection at a time, only on an explicit click, never
> retried, released when you stop listening, identified by name. If you run a
> receiver and you would rather not be in it, one email and you are out — no
> argument. The commitments are at github.com/auralfm.

---

## Sequencing

Do not post all six at once — six long posts in one day reads as content
marketing, which is the exact thing this is meant not to be.

1. **Post 5 (etiquette) first**, and pin it. If only one thing is up when
   somebody investigates, it should be the one showing the project takes the
   operators' side.
2. **Post 1**, a few days later. It is the most useful thing here and the most
   linkable.
3. **Posts 2 and 3** as people start asking the questions they answer.
4. **Post 4** once there is a little activity — it is the most fun and the most
   shareable, and it lands better where a couple of people will reply.
5. **Post 6 last**, and never bump it.
