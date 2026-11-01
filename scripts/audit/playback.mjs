/** The audit: The radio, shortwave, the studio, shows and everything that starts or stops sound. */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { R, fail, pass, HAS_CAT, C, main, EXPLORE, exploreSrc, readSrc } from "./lib.mjs";

// ── the radio comes out of one place, whichever kind it is ───────────────────
// Two things make sound here: an <audio> element for streams and an AudioContext
// for shortwave. Routing only the first is the failure that looks like a working
// feature — the music moves to the kitchen speaker and the shortwave keeps
// playing out of the laptop, and the person reasonably concludes the app is
// broken rather than that half of it was wired.
{
  console.log("\nchoosing an output moves both kinds of audio");
  const src = fs.readFileSync(R("src/renderer/popover.js"), "utf8");
  const problems = [];
  const i = src.indexOf("async function applyOutput(");
  if (i < 0) problems.push("applyOutput is gone");
  else {
    const body = src.slice(i, src.indexOf("\n}", i));
    if (!/audio\.setSinkId/.test(body)) problems.push("streams do not follow the choice");
    if (!/audioCtx.*setSinkId/.test(body)) problems.push("shortwave does not follow the choice");
  }
  // A context made later has to be told too, or shortwave started after the
  // choice comes out of the wrong speaker.
  if (!/audioCtx = audioCtx \|\| new AudioContext\(\)[\s\S]{0,300}?setSinkId/.test(src)) {
    problems.push("a shortwave session started after the choice ignores it");
  }
  problems.length
    ? fail("audio output", problems.join("; "))
    : pass("both the stream element and the shortwave context follow the chosen output");
}

// ── typing a frequency is not a scanner ──────────────────────────────────────
// A frequency box is exactly the feature that invites automated sweeping, and
// this project has already knocked three receivers offline. The answer is built
// from data already on the machine — the schedule, the space weather, the
// receiver list — and exactly one connection is made, when a person picks a
// receiver. Also checks the parser, because "forgiving input" is where a tuner
// quietly sends somebody to the wrong end of the spectrum.
{
  console.log("\ntyping a frequency answers from local data and dials once");
  const src = exploreSrc;
  const problems = [];

  const i = src.indexOf("async function showFrequency(");
  if (i < 0) problems.push("showFrequency is gone");
  else {
    const body = src.slice(i, src.indexOf("\n}\n", i));
    for (const call of ["tunerStart", "tuneSdr"]) {
      const n = (body.match(new RegExp(call + "\\(", "g")) || []).length;
      if (n > 1) problems.push(`${call}() appears ${n}x — a frequency must dial at most one receiver`);
    }
    // The lookup itself must not reach for a radio at all.
    const clickAt = body.indexOf("const go = ()");
    const beforeClick = clickAt < 0 ? body : body.slice(0, clickAt);
    if (/tunerStart\(|tuneSdr\(/.test(beforeClick)) {
      problems.push("the lookup connects to a receiver before anybody chose one");
    }
  }

  // The parser, against what people actually type.
  const start = src.indexOf("function parseKHz(");
  if (start < 0) problems.push("parseKHz is gone");
  else {
    const fn = new Function(`${src.slice(start, src.indexOf("\n}", start) + 2)}; return parseKHz;`)();
    const cases = [["7850", 7850], ["7.850", 7850], ["7,850", 7850], ["7850 kHz", 7850],
                   ["7.850 MHz", 7850], ["7", 7000], ["4625", 4625],
                   ["0", null], ["abc", null], ["30001", null], ["-500", null]];
    for (const [input, want] of cases) {
      const got = fn(input);
      if (got !== want) problems.push(`parseKHz(${JSON.stringify(input)}) = ${got}, expected ${want}`);
    }
  }
  problems.length
    ? fail("tune by frequency", problems.join("; "))
    : pass("a frequency is answered from local data, parsed forgivingly, and dials one receiver");
}

// ── nothing routes the radio through Web Audio ──────────────────────────────
// `createMediaElementSource` permanently redirects an element's audio into the
// Web Audio graph, and for cross-origin media the browser passes silence through
// that graph. An AnalyserNode was attached on the `playing` event to draw a
// waveform on the share card, and about one station in six went quiet while
// still reporting that it was playing — the stream arriving, the clock
// advancing, the station named on screen, and no sound.
//
// Reported as "a lot of stations with no sound, very random". It is not
// random: it is whether the station's server answers a cross-origin request.
//
// The measurement that originally justified the analyser was true and
// misleading — it worked on KEXP, which sends the headers. One station is not a
// sample. Nothing may put this back without a way to sample levels that cannot
// mute the radio.
{
  console.log("\nnothing routes the radio through Web Audio");
  const guilty = [];
  for (const f of ["src/renderer/popover.js", EXPLORE]) {
    const src = readSrc(f);
    // In a comment explaining why it is absent: fine. In code: not fine.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    if (/createMediaElementSource\s*\(/.test(code)) guilty.push(f);
  }
  guilty.length
    ? fail("the radio is routed through Web Audio",
           `${guilty.join(", ")} calls createMediaElementSource — cross-origin streams will play silence`)
    : pass("no renderer routes the playing element through an AudioContext");
}

// ── the card's levels come from a copy, never from the radio ────────────────
// The waveform came back by measuring a second, private copy of the stream
// (levels.js) through a gain of zero. That is only safe while the element it
// routes through Web Audio is one it created itself: handed the popover's
// `audio`, it would be the one-in-six silence above with a new file name. So
// every createMediaElementSource there must name an element built with
// `new Audio(` in the same file, and the popover must hand it a URL.
{
  console.log("\nthe card's levels come from a copy, never from the radio");
  const code = readSrc("src/renderer/levels.js")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const made = new Set([...code.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*new Audio\(/g)].map((m) => m[1]));
  const routed = [...code.matchAll(/createMediaElementSource\s*\(\s*([^)]*?)\s*\)/g)].map((m) => m[1]);
  const foreign = routed.filter((arg) => !made.has(arg));
  const pop = readSrc("src/renderer/popover.js").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const handed = [...pop.matchAll(/AuralLevels\??\.sample\s*\(\s*([^,)]+)/g)].map((m) => m[1].trim());
  if (!routed.length) fail("the card's levels are measured", "levels.js routes nothing — the sampler is gone");
  else if (foreign.length) fail("the card's levels come from a copy", `levels.js routes ${foreign.join(", ")}, which it did not create`);
  else if (handed.some((h) => h === "audio" || /\baudio\b/.test(h) && !/Url/.test(h)))
    fail("the card's levels come from a copy", `popover.js hands the sampler ${handed.join(", ")} rather than a URL`);
  else pass("the waveform is measured from a private copy of the stream, never the playing element");
}

// ── the studio's music bed plays only what its mixer can hear ──────────────
// Tracks were decoded whole into memory, and an hour-long mix did not fit.
// studio-deck.js streams them through an <audio> element
// instead, which is the one other place an element may be routed through Web
// Audio: it must be an element that file made itself with `new Audio(`, and it
// may play two things only. A `blob:` URL of a file already on this device; or
// (5 Oct, when a link took "hours" because it was downloaded whole first) the
// desktop's own auralfm-track:// address, which passes a linked file through as
// it arrives. Never a station's stream, which would play silence (the rule
// above) — and the linked track would too unless all three hold: the deck
// refuses any other address, asks with crossOrigin "anonymous", and the main
// process answers that the file may be read.
{
  console.log("\nthe studio's music bed plays only what its mixer can hear");
  const code = readSrc("src/renderer/studio-deck.js")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const made = new Set([...code.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*new Audio\(/g)].map((m) => m[1]));
  const routed = [...code.matchAll(/createMediaElementSource\s*\(\s*([^)]*?)\s*\)/g)].map((m) => m[1]);
  const srcs = [...code.matchAll(/(\w+)\.src\s*=\s*([^;]+);/g)];
  // A source is a blob made here, or `linked ? source : URL.createObjectURL(…)`.
  const sourced = new Set([...code.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*(?:linked \? source : )?URL\.createObjectURL\(/g)].map((m) => m[1]));
  const foreign = routed.filter((arg) => !made.has(arg));
  const badSrc = srcs.filter(([, el, v]) => made.has(el) && !sourced.has(v.trim()));
  const studio = readSrc(EXPLORE);
  const main = readSrc("src/main/ipc-app.js");
  const takesLinks = /linked \? source/.test(code);
  const guarded = /if \(linked && !OWN\.test\(source\)\) return Promise\.reject/.test(code) && /const OWN = \/\^auralfm-track:/.test(code);
  const asked = /if \(linked\) (\w+)\.crossOrigin = "anonymous";/.test(code);
  const answered = /protocol\.handle\("auralfm-track"/.test(main) && /headers\.set\("Access-Control-Allow-Origin", "\*"\)/.test(main);
  const whole = /arrayBuffer\(\)/.test(main.slice(main.indexOf("studio:openTrack")));
  if (!routed.length) fail("the studio's music bed", "studio-deck.js routes nothing — tracks are not playing through it");
  else if (foreign.length) fail("the studio's music bed plays its own element", `studio-deck.js routes ${foreign.join(", ")}, which it did not create`);
  else if (badSrc.length || !srcs.length) fail("the studio's music bed plays a file or its own link", `an element is fed ${badSrc.map((m) => m[2]).join(", ") || "nothing"}, not a blob: URL or the deck's own source`);
  else if (takesLinks && !(guarded && asked && answered)) fail("a linked track can be heard by the mixer",
    [!guarded && "the deck takes an address that is not auralfm-track://", !asked && "the element is not asked for with crossOrigin \"anonymous\"", !answered && "ipc-app.js does not answer that the track may be read"].filter(Boolean).join("; "));
  else if (whole) fail("a linked track plays as it arrives", "ipc-app.js reads the whole file into memory before the studio gets any of it");
  else if (/decodeAudioData\s*\(/.test(studio)) fail("the studio streams its tracks", "explore-studio.js decodes a whole track into memory again");
  else pass("tracks stream through an element the deck made: a file on this device, or a link passed through as it arrives");
  // The host hears the music they play without switching anything on.
  /musicGain\.connect\(ctx\.destination\)/.test(studio) && !/mix\.connect\(ctx\.destination\)/.test(studio)
    ? pass("the host's music reaches their speakers always; their own voice only with \"Hear yourself\"")
    : fail("the host hears the music they play", "explore-studio.js sends music to the speakers only through the monitor switch");
}

// ── the output button does not come and go ──────────────────────────────────
// It hid whenever fewer than two outputs were enumerated. macOS reports
// `default` plus the built-in speakers and nothing else once a bluetooth speaker
// disconnects, so after the `default` duplicate is filtered out the count is
// one — and the button vanished at exactly the moment somebody had lost the
// device they were listening on, reflowing the transport bar as it went.
//
// It looked like the speaker disappearing. Both windows had the rule.
{
  console.log("\nthe output button does not come and go");
  const bad = [];
  for (const f of [EXPLORE, "src/renderer/popover.js"]) {
    const src = readSrc(f);
    const m = src.match(/wrap\.hidden\s*=\s*([^;]+);/);
    if (!m) { bad.push(`${f}: nothing sets wrap.hidden`); continue; }
    // Any threshold above "there is nothing at all" is a control that flickers
    // as devices come and go.
    if (!/outDevices\.length\s*===\s*0/.test(m[1])) {
      bad.push(`${f}: hides on \`${m[1].trim()}\``);
    }
  }
  bad.length
    ? fail("output button hides on a device count", bad.join("; "))
    : pass("both windows hide the output button only when there are no outputs at all");
}

// ── a network blip holds the station, it does not spend the list ────────────
// A phone changes network mid-song — wifi to cellular, a tunnel, a lift — and
// the browser fails the stream exactly as it would for a station that has gone
// off the air. The answer used to be the same either way: walk this station's
// other URLs, then walk the place's other stations, then settle on "Stream
// unavailable here" about a station that was never at fault, over a network
// that came back ten seconds later. Nothing resumed when it did.
//
// Desktop-only code would not have shown this. It is a phone bug, and it is the
// most likely way a walk out of wifi ends a listening session.
//
// So the failure path must ask whether there is a network before it spends the
// list, and something must listen for the network coming back.
{
  console.log("\na network blip holds the station");
  const src = readSrc("web/bridge.js")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const gaps = [];

  // tryNext is the one choke point every stream failure passes through.
  const tn = src.match(/function tryNext\s*\([^)]*\)\s*\{([\s\S]*?)\n  \}/);
  if (!tn) gaps.push("tryNext is gone — the stream-failure path has moved and this check is blind");
  else if (!/navigator\.onLine/.test(tn[1]))
    gaps.push("tryNext advances to the next URL without asking whether there is a network");

  // And a way back, or a held station is just a stuck one.
  if (!/addEventListener\(\s*["']online["']/.test(src))
    gaps.push("nothing listens for 'online', so a held station never resumes");

  gaps.length ? fail("a network blip holds the station", gaps.join("; "))
    : pass("a stream that fails with no network holds the station and resumes when it returns");
}

// ── the worker does not seize a page that is playing ────────────────────────
// install called skipWaiting() and activate called clients.claim(), so the
// moment a new build was deployed its worker took over pages already open —
// and then deleted every cache but its own. The running page's scripts are
// stamped with the *old* build's URLs, which had just been thrown away, so
// every one of them missed and went to the network. On a good connection that
// is invisible. On a phone with a weak signal it is a dead page: ERR_FAILED on
// every script, the app's own HTML still on screen with nothing behind it.
//
// Measured here on 2026-09-20: cache auralfm-mu9egcka still serving while the
// build was mua7tjon, and a plain fetch() from the page throwing "Failed to
// fetch" until the worker was unregistered by hand.
//
// The lifecycle's default is correct for a radio: a new worker waits until
// every page using the old one has closed. Nothing is swapped underneath
// somebody who is listening, and the cache is only dropped once nothing needs
// it. The update lands on the next launch, which is the price and it is right.
{
  console.log("\nthe worker does not seize a page that is playing");
  const sw = readSrc("web/sw.js").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const seizes = [];
  if (/skipWaiting\s*\(/.test(sw)) seizes.push("install calls skipWaiting()");
  if (/clients\.claim\s*\(/.test(sw)) seizes.push("activate calls clients.claim()");
  // A miss that cannot reach the network must not reject: respondWith on a
  // rejected promise is ERR_FAILED, which is the dead page above.
  // The `.catch` on cache.put does not count; it is the fetch that has to be
  // guarded, because respondWith on a rejected promise is the dead page.
  const firstPath = sw.slice(sw.indexOf("caches.match(request)"));
  if (firstPath && !/try\s*\{/.test(firstPath))
    seizes.push("the cache-first path lets a failed fetch reject respondWith");
  seizes.length ? fail("the worker does not seize a page that is playing", seizes.join("; "))
    : pass("a new build waits for the old page to close, and a miss with no network fails soft");
}

// ── a station plays from its own server, and no other directory is asked ──
// The catalogue began as radio.garden's, and the desktop resolved every one of
// those stations through radio.garden's listen endpoint — which answers only
// requests that look like its own website, so the app sent a borrowed Chrome
// User-Agent and radio.garden's Referer. The web app used the same endpoint as
// a fallback. Both are gone. This fails
// if any code the apps run names radio.garden or sends a Referer, and, with the
// network faked, if resolving a station asks anything but radio-browser: by id
// when the station has one, else not at all (its own stream, from its profile).
{
  const name = "a station plays from its own server, and no other directory is asked";
  console.log("\na station plays from its own server, and no other directory is asked");
  const bad = [];
  const code = (f) => fs.readFileSync(R(f), "utf8").split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
  const runtime = [...fs.readdirSync(R("src")).filter((f) => f.endsWith(".js")).map((f) => `src/${f}`),
    ...fs.readdirSync(R("src/main")).filter((f) => f.endsWith(".js")).map((f) => `src/main/${f}`),
    ...fs.readdirSync(R("src/renderer")).filter((f) => f.endsWith(".js")).map((f) => `src/renderer/${f}`),
    ...fs.readdirSync(R("web")).filter((f) => f.endsWith(".js")).map((f) => `web/${f}`)];
  for (const f of runtime) {
    const c = code(f);
    if (/radio\.garden/i.test(c)) bad.push(`${f} names radio.garden`);
    if (/["']Referer["']\s*:/i.test(c)) bad.push(`${f} sends a Referer header`);
  }
  const { createRequire } = await import("node:module");
  const resolver = createRequire(import.meta.url)(R("src/resolver.js"));
  const profiles = createRequire(import.meta.url)(R("src/profiles.js"));
  const real = globalThis.fetch, asked = [];
  globalThis.fetch = async (u) => {
    asked.push(String(u));
    return new Response(JSON.stringify([{ url_resolved: "https://stream.example/live", lastcheckok: 1 }]),
      { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const got = await resolver.resolve({ id: "af-test0000", title: "Test", country: "", rbuuid: "0000" });
    if (got?.url !== "https://stream.example/live" || !asked.some((u) => u.includes("/json/stations/byuuid/0000")))
      bad.push(`with a radio-browser id: asked ${asked.join(", ") || "nothing"}, got ${got?.url || "no stream"}`);
    // A station with a stream of its own and no radio-browser id: nothing asked.
    const shard = fs.existsSync(R("data/profiles")) ? fs.readdirSync(R("data/profiles")).find((f) => f.endsWith(".json")) : null;
    const withStream = shard && Object.values(JSON.parse(fs.readFileSync(R(`data/profiles/${shard}`), "utf8"))).find((p) => p.stream);
    if (withStream) {
      asked.length = 0;
      const own = await resolver.resolve({ id: withStream.id, title: withStream.title, country: withStream.country });
      if (own?.url !== profiles.profile(withStream.id)?.stream || asked.length)
        bad.push(`with its own stream: asked ${asked.join(", ") || "nothing"}, got ${own?.url || "no stream"}`);
    }
  } finally { globalThis.fetch = real; }
  if (asked.some((u) => /radio\.garden/.test(u))) bad.push("radio.garden was asked");
  bad.length ? fail(name, bad.join("; ")) : pass("radio-browser by id, else the station's own stream; radio.garden named nowhere the apps run");
}

// ── headphones: a pause from outside is heard, and headphones off is sound off ─
// Two faults found on 2026-09-24. On an iPhone, iOS pauses the page itself when
// AirPods come out or disconnect, and for calls and Siri; the web player kept
// saying it was live, so play did nothing. On the Mac, AirPods disconnecting
// moved macOS to the built-in speakers and the radio followed — out loud.
// Plus the way to AirPods on iPhone, Safari's own route picker, which the
// output button had no way to reach.
{
  console.log("\nheadphones: a pause from outside is heard, and headphones off is sound off");
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const bridge = strip(readSrc("web/bridge.js"));
  const after = strip(readSrc("web/after.js"));
  const pop = strip(readSrc("src/renderer/popover.js"));
  const gaps = [];
  const pauseHandler = bridge.match(/audio\.addEventListener\("pause",[\s\S]*?\}\);/)?.[0] || "";
  if (!/if \(!live[^)]*\) return;[\s\S]*stop\(/.test(pauseHandler)) gaps.push("web: a pause iOS makes (AirPods out, a call) leaves the player saying it is live");
  // stop takes the status to show; handed to the media session bare, the
  // browser's action details become that status.
  if (/setActionHandler\("(pause|stop)", stop\)/.test(bridge)) gaps.push("web: the lock screen's pause passes its event object to stop()");
  if (!/setActionHandler\("previoustrack"/.test(bridge)) gaps.push("web: previous (triple-press, lock screen) does nothing");
  if (!/webkitShowPlaybackTargetPicker/.test(bridge) || !/pickOutput\(\)/.test(after)) gaps.push("web: the output button cannot open iOS's route picker");
  if (!/audioSession\.type = "playback"/.test(bridge)) gaps.push("web: the page never tells iOS it is a player");
  if (!/"devicechange",[^\n]*pauseIfOutputGone\(\)/.test(pop)) gaps.push("desktop: headphones disconnecting moves the radio to the speakers");
  if (!/if \(outs\.some\(\(d\) => d\.groupId === was\)\) return;\s*stop\(\)/.test(pop)) gaps.push("desktop: the disconnect check no longer stops playback");
  gaps.length ? fail("headphones: a pause from outside is heard, and headphones off is sound off", gaps.join("; "))
    : pass("iOS pauses are followed, previous and the route picker work, and the Mac pauses when its headphones go");
}

// ── the broadcast desk ───────────────────────────────────────────────────────
// With the studio open the stations fold away and the town's messages take the
// rail (5 Oct 2026). Two things it rests on. The globe is centred between the
// panels by measuring them, and the studio was not one of the panels measured:
// opened, it sat on top of half the planet. And a host stands in the town they
// chose with no label until the show is live: a name goes out as "what is
// playing", and a show that is not on air must not be announced as one.
{
  console.log("\nthe broadcast desk");
  const gaps = [];
  if (!/getElementById\("studiopanel"\)\]/.test(readSrc("src/renderer/explore-trackers.js"))) gaps.push("centreGlobe does not measure the studio panel");
  for (const f of ["src/main.js", "web/messaging.js"]) {
    const src = readSrc(f);
    if (!/const ch = hosting \|\| \(/.test(src)) gaps.push(`${f}: a host's town does not stand in for a station's`);
    // Off air (the studio open, or listening to someone else's show) the town is
    // joined with no label; only a show that is live goes out with its name.
    if (!/nostr\.join\(ch\.lat, ch\.lon, hosting \? \(hosting\.live \? hosting\.title : ""\) : ch\.title \|\| "", !!hosting\?\.live\)/.test(src)) gaps.push(`${f}: a show's town is joined with a label when the show is not live`);
  }
  if (!/body\.studio-open \.stations\{display:none\}/.test(readSrc("src/renderer/explore.html"))) gaps.push("the stations card does not fold away with the studio open");
  gaps.length ? fail("the broadcast desk", gaps.join("; "))
    : pass("the studio open: the globe sits between the panels, and the host's town carries the show's name only while live");
}

// ── a show is heard directly, and found honestly ────────────────────────────
// Live, a show goes from the host's device to each listener's (6 Oct 2026).
// What that rests on:
//   - the handshake carries each device's network addresses, so it travels in
//     the sealed private envelope and never reaches the conversation or a
//     relay in the clear;
//   - a handshake a relay kept and handed back later is not a live one;
//   - the host answers only while live, and only so many (a home connection
//     carries about a dozen copies of the sound);
//   - going off air tells the listeners and lets them go;
//   - the listener's side is on only where the studio is, or in a browser that
//     opened the private ?ears link, and it says, before anyone presses
//     Listen, that each side can see the other's address.
{
  console.log("\na show is heard directly, and found honestly");
  const nostrSrc = readSrc("src/presence-nostr.js"), shows = readSrc("src/renderer/explore-shows.js"), studio = readSrc("src/renderer/explore-studio.js");
  const gaps = [];
  if (!/return dm\(to, "", \[\["rtc", body\]\]\)/.test(nostrSrc)) gaps.push("the handshake is not sent in the private envelope");
  if (!/if \(typeof rtc === "string"\) \{[\s\S]{0,700}?return;\s*\}\s*const fav/.test(nostrSrc)) gaps.push("a handshake can fall through into the conversation");
  if (!/Math\.abs\(Date\.now\(\) - Number\(at\)\) > MAX_AGE_MS\) return;/.test(shows)) gaps.push("a stale handshake is acted on");
  if (!/if \(phase !== "live" \|\| !mixDest\) return;/.test(studio)) gaps.push("the host answers when not live");
  if (!/if \(heard\.size >= MAX_LISTENERS\)/.test(studio) || !/const MAX_LISTENERS = (\d+);/.test(studio) || +studio.match(/const MAX_LISTENERS = (\d+);/)[1] > 25) gaps.push("nothing limits how many listeners one computer carries");
  if (!/if \(phase === "live" && to !== "live"\) \{ closeListeners\(\);/.test(studio)) gaps.push("going off air leaves the listeners connected");
  // Listening is on where the studio is, or where the private ?ears link has
  // been opened; and that link must never be a way into the studio itself
  // (the check after this one holds the studio's own door).
  if (!shows.includes("const on = () => true;") || !shows.includes("const shown = () => on() && ") || !shows.includes("card.hidden = !(shown() && (rows.length || said || unseen));") || !shows.includes("const unseen = shown() && ")) gaps.push("listening to shows is not on everywhere, or the prompt to see them is not gated by shown()");
  if (/shows\.ears|has\("ears"\)/.test(studio)) gaps.push("the private listening link reaches into the studio");
  if (!/"shows\.note"/.test(shows) || !/network address/.test(shows)) gaps.push("a listener is not told the host can see their address");
  // Looking for shows with nothing playing reads and never announces, and only
  // with "Show other listeners" on: presence that goes out unasked is the one
  // promise this app could not take back.
  if (!/function watch\(\) \{\s*if \(here\) return;\s*connect\(\);/.test(nostrSrc)) gaps.push("watching for shows is no longer a connection with no place joined");
  for (const f of ["src/main.js", "web/messaging.js"]) {
    if (!/if \((on|p\.presence === true) && watching\) nostr\.watch\(\);/.test(readSrc(f))) gaps.push(`${f}: shows are looked for with presence switched off`);
  }
  // A report hides the host first (the part that takes effect) and then drafts the email.
  const rep = shows.slice(shows.indexOf("async function report(peer)"), shows.indexOf("async function listen(peer)"));
  if (!(rep.indexOf("gone.add(peer.pubkey)") >= 0 && rep.indexOf("gone.add(peer.pubkey)") < rep.indexOf("chatReport"))) gaps.push("reporting a show does not hide its host before anything else");
  gaps.length ? fail("a show is heard directly, and found honestly", gaps.join("; "))
    : pass("the handshake is sealed and fresh, the host answers only live and to a dozen, and a listener is told what a direct connection shows");
}

// ── the queue hands over on its own clock ───────────────────────────────────
// The studio plays several tracks in order, each fading into the next (5 Oct
// 2026). Three things it rests on, each a way it broke or would have:
//   - the hand-over is driven by the track's own timeupdate. Animation frames
//     stop when the window is behind another, and a show goes on there;
//   - a fade asked for while another is under way holds that one where it is
//     (cancelAndHoldAtTime). A curve scheduled over a running curve throws,
//     and the queue's "switching" flag is cleared in a finally, because a throw
//     that left it set refused every press afterwards;
//   - the deck does not loop a track by itself, or the queue never moves on.
{
  console.log("\nthe queue hands over on its own clock");
  const studio = readSrc("src/renderer/explore-studio.js");
  const q = studio.slice(studio.indexOf("// ── the queue ──"), studio.indexOf("* A track from a link (desktop"));
  const deckSrc = readSrc("src/renderer/studio-deck.js").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const gaps = [];
  if (!/ontimeupdate = \(\) => \{[\s\S]*?playAt\(n, fade\)/.test(q)) gaps.push("the next track is not started from the playing track's timeupdate");
  if (/requestAnimationFrame/.test(q)) gaps.push("the queue leans on animation frames");
  if (!/cancelAndHoldAtTime\(at\)/.test(q)) gaps.push("a fade does not hold the one already under way");
  if (!/\} finally \{\s*switching = false;/.test(q)) gaps.push("a failed hand-over can leave the queue locked");
  if (/\.loop\s*=\s*true/.test(deckSrc)) gaps.push("the deck loops a track by itself");
  gaps.length ? fail("the queue hands over on its own clock", gaps.join("; "))
    : pass("tracks hand over from timeupdate, fades hold and never lock the queue, and no track loops by itself");
}

// ── the studio is not on the public web ─────────────────────────────────────
// listen.auralfm.xyz/?studio opened the studio for anyone with the link, and a
// flag kept in the browser kept it open afterwards. It is too
// unfinished to hand out: the desktop beta only until it is settled. A query string
// or a stored flag that switches it on is that link coming back.
{
  console.log("\nthe studio is not on the public web");
  const src = readSrc("src/renderer/explore-studio.js");
  const fn = src.slice(src.indexOf("async function allowed()"), src.indexOf("// ── what the show is"));
  const gaps = [];
  if (/URLSearchParams|location\.search/.test(fn)) gaps.push("a query string can switch the studio on");
  if (/localStorage\.(setItem|getItem)/.test(fn)) gaps.push("a flag kept in the browser can switch the studio on");
  if (!/location\.protocol === "file:"/.test(fn) || !/v\?\.dev \|\| v\?\.channel/.test(fn)) gaps.push("the desktop's development and beta builds are no longer the way in");
  // Your show is the paid desktop app's: the web build does not carry it at all.
  if (/location\.hostname/.test(fn)) gaps.push("a page on some host can switch the studio on");
  const only = /const DESKTOP_ONLY = \[([^\]]*)\]/.exec(readSrc("scripts/build-web.mjs"))?.[1] || "";
  if (!only.includes('"explore-studio.js"') || !only.includes('"studio-deck.js"')) gaps.push("the web build carries the studio");
  gaps.length ? fail("the studio is not on the web", gaps.join("; "))
    : pass("the studio is in the desktop app only, in its development and beta builds; the web build does not carry it");
}

// ── a show goes into a calendar as the station wrote it ─────────────────────
// 9 Oct 2026. A station lists its shows on the claim form; a listener adds one
// to their own calendar from the station's page. Nothing is kept and nothing is
// sent, so the one place it can go wrong is the file: the wrong hour across a
// clock change, a first date that is not one of the show's days, a line guessed
// at instead of refused. And the form, the review sheet, the profile and the
// page must all carry the field, or a station's shows stop on the way.
{
  const name = "a show goes into a calendar as the station wrote it";
  console.log(`\n${name}`);
  const gaps = [];
  const { createRequire } = await import("node:module");
  let S; try { S = createRequire(import.meta.url)(R("src/renderer/schedule-ics.js")); } catch (e) { gaps.push(`src/renderer/schedule-ics.js does not load: ${e.message}`); }
  if (S) {
    const r = S.parse("Morning Glory | Mon-Fri | 07:00-09:00 | Europe/London\nLate | Sat & Sun | 23:00 – 01:00 | America/Sao_Paulo\nno bars here\nNowhere | Mon | 10:00-11:00 | Mars/Base\nToo late | Mon | 25:00-26:00 | UTC");
    if (r.slots.length !== 2 || r.bad.length !== 3) gaps.push(`of five lines, two good and three bad, it read ${r.slots.length} and refused ${r.bad.length}`);
    const [glory, late] = r.slots;
    if (glory && glory.days.join() !== "MO,TU,WE,TH,FR") gaps.push(`"Mon-Fri" became ${glory.days}`);
    if (glory) {
      // London is an hour ahead of UTC in July and level with it in December.
      const summer = S.next(glory, Date.UTC(2026, 6, 1, 12)), winter = S.next(glory, Date.UTC(2026, 11, 1, 12));
      if (new Date(summer.at).toISOString() !== "2026-07-02T06:00:00.000Z") gaps.push(`07:00 in London in July comes out as ${new Date(summer.at).toISOString()}`);
      if (new Date(winter.at).toISOString() !== "2026-12-02T07:00:00.000Z") gaps.push(`07:00 in London in December comes out as ${new Date(winter.at).toISOString()}`);
      // Asked on a Saturday: the first date is the Monday, not the day it was asked.
      const sat = S.next(glory, Date.UTC(2026, 9, 10, 12));
      if (`${sat.y}-${sat.m}-${sat.d}` !== "2026-10-12") gaps.push(`a weekday show asked for on a Saturday starts ${sat.y}-${sat.m}-${sat.d}`);
    }
    if (late) {
      const file = S.ics(late, { id: "af-test", title: "Rádio; Teste, FM" }, Date.UTC(2026, 9, 9, 22));
      const lines = file.split("\r\n");
      for (const w of ["DTSTART;TZID=America/Sao_Paulo:20261010T230000", "DTEND;TZID=America/Sao_Paulo:20261011T010000",
        "RRULE:FREQ=WEEKLY;BYDAY=SA,SU", "TRIGGER:-PT10M", "URL:https://listen.auralfm.xyz/?station=af-test"])
        if (!lines.includes(w)) gaps.push(`the file has no line "${w}"`);
      if (/[^\r]\n/.test(file)) gaps.push("the file's lines do not end as a calendar file's must (CRLF)");
      if (!file.includes("SUMMARY:Late · Rádio\\; Teste\\, FM")) gaps.push("a station's name with a comma or a semicolon in it is not escaped");
      if (lines.some((l) => l.length > 75)) gaps.push("a line is longer than a calendar file allows");
    }
    if (S.valid({ name: "x", days: ["XX"], start: "07:00", end: "08:00", tz: "UTC" })) gaps.push("a slot on a day that does not exist is called valid");
  }
  const html = readSrc("src/renderer/explore.html"), ui = readSrc("src/renderer/explore-profile.js");
  const at = html.indexOf('src="schedule-ics.js"');
  if (at < 0 || at > html.indexOf('src="explore-profile.js"')) gaps.push("explore.html does not load schedule-ics.js before the station's page");
  if (!/AuralSchedule/.test(ui) || !/\.filter\(S\.valid\)/.test(ui)) gaps.push("the station's page does not show its schedule, or shows slots it has not checked");
  if (!/add\.type = "button"/.test(ui)) gaps.push("Add to calendar is not a button");
  if (!/said\.setAttribute\("role", "status"\)/.test(ui)) gaps.push("nothing says the file was saved");
  for (const k of ["profile.schedule", "profile.nextShow", "profile.addCal", "profile.addCalDone"]) if (!new RegExp(`"${k}"`).test(readSrc("src/i18n.js"))) gaps.push(`i18n.js has no ${k}`);
  if (HAS_CAT) {
    const claims = fs.readFileSync(C("scripts/claims.mjs"), "utf8");
    if (!/schedule-ics\.js/.test(claims) || !/schedule: shows\.slots/.test(claims)) gaps.push("the catalogue's scripts/claims.mjs does not read the form's shows");
    if (!/schedule: form\?\.schedule/.test(fs.readFileSync(C("scripts/profiles.mjs"), "utf8"))) gaps.push("the catalogue's scripts/profiles.mjs does not publish an approved claim's schedule");
  }
  gaps.length ? fail(name, gaps.join("; "))
    : pass("the form's lines are read or refused, the hour holds across a clock change, the file starts on one of the show's days, and the field reaches the station's page");
}

// ── a playlist stream plays in Chrome too ───────────────────────────────────
// 10 Oct 2026. About 1,800 stations are HLS: a playlist of short files. Safari
// plays that; Chrome and Firefox do not, so on a computer those stations said
// "Stream unavailable here". hls.js plays them. What can go wrong: the library
// is not shipped, is not credited, is loaded for everyone (386 KB a phone never
// needs), is used where the browser already plays HLS, is left running after
// the station changes, or cannot fetch because the page's own rules forbid it.
{
  const name = "a playlist stream plays in Chrome too";
  console.log(`\n${name}`);
  const gaps = [];
  const bridge = readSrc("web/bridge.js"), build = readSrc("scripts/build-web.mjs");
  if (!fs.existsSync(R("src/renderer/vendor/hls.light.min.js"))) gaps.push("src/renderer/vendor/hls.light.min.js is not there (npm run vendor)");
  if (!/hls\.js/.test(readSrc("THIRD-PARTY-NOTICES.md"))) gaps.push("THIRD-PARTY-NOTICES.md does not credit hls.js");
  if (!/isHls\(url\) && !nativeHls\) return viaHls/.test(bridge)) gaps.push("the library is not used only where the browser cannot play HLS itself");
  if (!/createElement\("script"\)[\s\S]{0,120}vendor\/hls\.light\.min\.js/.test(bridge)) gaps.push("the library is not fetched only when a station needs it");
  if (/<script[^>]+hls/i.test(readSrc("src/renderer/explore.html"))) gaps.push("explore.html loads the library for everyone");
  const next = bridge.slice(bridge.indexOf("function tryNext"), bridge.indexOf("function tryNext") + 200);
  if (!/dropHls\(\)/.test(next)) gaps.push("moving to the next stream leaves the library attached to the last one");
  const stop = bridge.slice(bridge.indexOf("function stop("), bridge.indexOf("function stop(") + 300);
  if (!/dropHls\(\)/.test(stop)) gaps.push("stopping leaves the library fetching");
  if (!/Hls\.Events\.ERROR[\s\S]{0,120}data\.fatal[\s\S]{0,60}tryNext/.test(bridge)) gaps.push("a stream the library cannot play does not move on to the next");
  const csp = (build.match(/const CSP = \[[\s\S]*?\]\.join/) || [""])[0];
  if (!/"https:"/.test(csp.slice(csp.indexOf("connect-src")))) gaps.push("the page may not fetch from a station's own server, so no playlist can load");
  if (!/"script-src 'self'"/.test(csp)) gaps.push("the page's script rule is no longer its own files only");
  gaps.length ? fail(name, gaps.join("; "))
    : pass("hls.js is shipped and credited, fetched only when needed and only where the browser cannot, dropped on every change, and allowed to reach the station");
}

{
  const name = "a web station plays from its stored address, and silence always ends";
  console.log(`\n${name}`);
  const gaps = [];
  const bridge = readSrc("web/bridge.js");
  const body = (fn) => { const i = bridge.indexOf(fn); return i < 0 ? "" : bridge.slice(i, bridge.indexOf("\n  }\n", i)); };
  const tune = body("async function tune(");
  if (!/profileOf\(ch\.id\)/.test(tune)) gaps.push("a play does not start from the stored address");
  if (/await candidates\(/.test(tune)) gaps.push("a play still waits on the directory before trying anything");
  const look = body("async function candidates(");
  if (/list\.filter\(\(x\) => !same\(x\)\)/.test(look)) gaps.push("a station of the same name elsewhere can play in place of the one chosen");
  const ms = +(bridge.match(/\bTRY_MS = (\d+)/) || [])[1];
  if (!(ms > 0 && ms <= 8000)) gaps.push("a dead address may hold the listener for more than 8 seconds");
  if (!/MAX_TRIES/.test(body("function tryNext("))) gaps.push("the addresses tried for one station are not capped");
  if (!/Promise\.race\(\[candidates\(current\)/.test(bridge)) gaps.push("a directory lookup that never ends can hold play open");
  if (!/addEventListener\("waiting"[\s\S]{0,200}STALL_MS/.test(bridge)) gaps.push("a stream that stalls while live is never reconnected");
  if (!/addEventListener\("ended"/.test(bridge)) gaps.push("a stream the server closes leaves the player saying it is live");
  gaps.length ? fail(name, gaps.join("; "))
    : pass("the recorded address plays first, the directory is a fallback with a limit, no other station stands in by name, and a dead or stalled stream moves on");
}

// ── a changed setting does not make the popover forget the station ──────────
// 10 Oct 2026, seen in a photograph of the menu-bar popover taken while a
// station played: the pause button, the on-air lamp, and "Nothing playing /
// Search for a station". The name and the status carry data-i18n for the words
// they start with, and applyStrings() rewrites every data-i18n element. It runs
// again on every change of any preference, the theme, the palette and "Show
// other listeners" included, so the first setting touched while listening put
// the starting words back over the station's name, and had the status
// (role="status") announce "Search for a station" to a screen reader.
{
  const name = "a changed setting does not make the popover forget the station";
  console.log(`\n${name}`);
  const src = readSrc("src/renderer/popover.js");
  const html = readSrc("src/renderer/popover.html");
  const fn = (src.match(/async function applyStrings\s*\(\)\s*\{([\s\S]*?)\n\}/) || [])[1];
  const live = ["nowName", "status"].filter((id) => new RegExp(`id="${id}"[^>]*data-i18n=`).test(html));
  const gaps = [];
  if (!fn) gaps.push("applyStrings is gone — this check is blind");
  else if (live.length) {
    const loop = (fn.match(/for \(const el of document\.querySelectorAll\("\[data-i18n\]"\)\) \{([\s\S]*?)\n  \}/) || [])[1] || "";
    if (!/nowName/.test(loop) || !/statusEl/.test(loop) || !/continue/.test(loop))
      gaps.push(`#${live.join(" and #")} start as translated words and are rewritten with them on every preference change, while a station is playing`);
  }
  gaps.length ? fail(name, gaps.join("; "))
    : pass("the name and the status are translated only while nothing has been tuned");
}

// ── a link that asks to play is played ──────────────────────────────────────
// Pressing "Play on the globe" on a station's page on the site only opened
// the globe; it must go to that station, start buffering and play. ?station= opened the station cued and paused, on purpose: a shared
// card's link should not make sound for whoever scans it. A press on our own
// Play button is the listener asking, so that link says so (&play=1) and the
// app starts the station. A browser may still refuse sound nobody has touched
// the page for; then the station waits, and the first press anywhere starts it.
{
  const name = "a link that asks to play is played";
  console.log(`\n${name}`);
  const src = readSrc("web/bridge.js");
  const fn = (src.match(/async function cueAsked\s*\([^)]*\)\s*\{([\s\S]*?)\n  \}/) || [])[1];
  const gaps = [];
  if (!fn) gaps.push("cueAsked is gone — this check is blind");
  else {
    if (!/wantsPlay|["']play["']/.test(src.slice(src.indexOf("DOMContentLoaded")))) gaps.push("?play is never read, so every link opens its station paused");
    if (!/tune\(ch\)/.test(fn)) gaps.push("a station asked for with ?play is cued and never started");
    if (!/once:\s*true/.test(fn)) gaps.push("when the browser refuses the sound, nothing starts it on the listener's first press");
  }
  gaps.length ? fail(name, gaps.join("; "))
    : pass("?station=…&play=1 starts the station, or waits for the first press if the browser will not");
}

// ── the sleep timer goes by the clock ───────────────────────────────────────
// 13 Oct 2026. New: stop the station after 15 to 90 minutes, fading the last
// twenty seconds. Run here with a clock that can be moved, because the two
// things worth getting wrong are both about time: counting ticks (a background
// tab's are slowed, a sleeping laptop's do not happen) and leaving the volume
// where the fade ended.
{
  const name = "the sleep timer goes by the clock";
  console.log(`\n${name}`);
  const gaps = [];
  let now = 1_000_000, level = 0.8, playing = true, stops = 0, changes = 0;
  const box = { window: {}, Date: { now: () => now }, setInterval: () => 1, clearInterval: () => {}, Number, Math };
  try {
    vm.runInNewContext(readSrc("src/renderer/sleep.js"), box);
    const S = box.window.AuralSleep;
    S.init({ level: () => level, setLevel: (v) => { level = v; }, playing: () => playing,
             stop: () => { stops++; playing = false; }, changed: () => { changes++; } });
    S.set(7);
    if (S.endsAt()) gaps.push("7 minutes is not a choice and started a timer");
    S.set(30);
    if (S.endsAt() !== now + 30 * 60000) gaps.push("30 minutes does not end 30 minutes from now");
    now += 29 * 60000; S.check();
    if (level !== 0.8 || stops) gaps.push("it touched the sound with a minute still to go");
    now += 50000; S.check();                    // ten seconds left
    if (!(level > 0.35 && level < 0.45)) gaps.push(`ten seconds from the end the level is ${level.toFixed(2)}, not half`);
    now += 3 * 3600000; S.check();              // a laptop that slept through it
    if (stops !== 1) gaps.push(`the station was stopped ${stops} times`);
    if (level !== 0.8) gaps.push(`the level was left at ${level.toFixed(2)} after the fade`);
    if (S.endsAt()) gaps.push("it is still running after it ended");
    S.check();
    if (stops !== 1) gaps.push("it stops again on the next look");
    S.set(15); now += 14 * 60000 + 50000; S.check(); S.set(0);
    if (level !== 0.8 || S.endsAt()) gaps.push("turned off during the fade, it left the level faded or kept running");
    if (!changes) gaps.push("nobody is told when it starts or ends");
  } catch (e) { gaps.push(`sleep.js did not run: ${e.message}`); }
  const pop = readSrc("src/renderer/popover.js"), bridge = readSrc("web/bridge.js");
  for (const [who, src] of [["the Mac's player", pop], ["the web's player", bridge]]) {
    const init = src.slice(src.indexOf("AuralSleep?.init("), src.indexOf("AuralSleep?.init(") + 420);
    if (init.length < 100) { gaps.push(`${who} never starts it`); continue; }
    if (/setLevel:[^\n]*(applyVolume|setState|persist)/.test(init)) gaps.push(`${who} saves the faded level`);
    if (!/action === "sleep"/.test(src)) gaps.push(`${who} does not take the request`);
    if (!/sleepEndsAt:/.test(src)) gaps.push(`${who} does not say when it ends`);
    if (!/addEventListener\("timeupdate",[^\n]*AuralSleep/.test(src)) gaps.push(`${who} looks only on a timer, which a phone with its screen off may not run`);
  }
  // On an iPhone the timer worked and the row read "Sleep ti…".
  if (!/stop: \(\) => stop\("Sleep timer ended", true\)/.test(bridge) || !/setStatus\(said, false, notice\)/.test(bridge)) gaps.push("on a phone the line that says why the sound stopped is cut short");
  if (!/<script src="sleep\.js"><\/script>\s*<script src="popover\.js">/.test(readSrc("src/renderer/popover.html"))) gaps.push("the menu bar panel does not load it before its player");
  if (!/"sleep\.js",\s*"web\/bridge\.js"/.test(readSrc("scripts/build-web.mjs"))) gaps.push("the web build does not load it before its player");
  if (!/id="sleep"/.test(readSrc("src/renderer/settings.html"))) gaps.push("Settings has no way to set it");
  gaps.length ? fail(name, gaps.join("; ")) : pass("ends on time whatever the timers did, fades the last 20s, puts the level back, and both players use the one file");
}

// ── pressing play on the web does not wait forever ──────────────────────────
// On the web and the iPhone, play asks radio-browser for the stream. Both
// lookups had no timeout and went to one mirror, de1: a server that accepts the
// connection and never answers left play spinning with no end. The desktop
// (src/resolver.js) already picks a mirror from the pool and times out.
{
  const name = "pressing play on the web does not wait forever";
  console.log(`\n${name}`);
  const bridge = readSrc("web/bridge.js");
  const body = bridge.slice(bridge.indexOf("async function candidates("), bridge.indexOf("return out;", bridge.indexOf("async function candidates(")));
  const gaps = [];
  const calls = body.split("\n").filter((l) => /fetch\(`\$\{RB\}/.test(l)).map((l) => [l.trim()]);
  if (calls.length < 2) gaps.push("the radio-browser lookups in candidates() were not found — this check is blind");
  for (const [c] of calls) if (!/signal:/.test(c)) gaps.push(`a radio-browser lookup has no timeout: ${c.slice(0, 60)}`);
  if (!/json\/servers/.test(bridge)) gaps.push("web/bridge.js always uses one radio-browser mirror");
  // One after another, a slow radio-browser cost two timeouts before play tried anything.
  if (!/Promise\.allSettled\(/.test(body)) gaps.push("the lookups run one after another, so a slow directory costs the sum of their timeouts");
  gaps.length ? fail(name, gaps.join("; ")) : pass(`${calls.length} radio-browser lookups each time out, run side by side, on a mirror chosen from the pool`);
}

// ── the studio's levels move by transform ───────────────────────────────────
// Five meters and a progress bar change every frame. Drawn as widths and
// heights they recalculated the layout sixty times a second; a scale is
// composited and touches nothing else (Emil Kowalski, animation-performance).
{
  const name = "the studio's levels move by transform, not by size";
  console.log(`\n${name}`);
  const gaps = [];
  const st = readSrc("src/renderer/explore-studio.js"), html = readSrc("src/renderer/explore.html");
  if (/style\[[^\]]*"(height|width)"[^\]]*\]\s*=/.test(st) || /\.style\.(width|height)\s*=/.test(st)) gaps.push("explore-studio.js sets a width or a height on a meter or the progress bar");
  if (/\.studio \.(meter[^{]*|npbar) b\{[^}]*transition:(width|height)/.test(html)) gaps.push("a meter or the progress bar animates its size");
  if (!/\.studio \.meter b\{[^}]*transform:scaleX\(0\)/.test(html)) gaps.push("the meters are not drawn as a scale");
  gaps.length ? fail(name, gaps.join("; ")) : pass("the meters and the progress bar are scaled, so a frame of them recalculates no layout");
}
