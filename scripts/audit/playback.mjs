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

// ── popover.js in a sandbox ─────────────────────────────────────────────────
// The desktop player run, not read: a fake <audio>, a fake clock, a switchable
// network and a fake bridge to main. The page's own start-up is left waiting
// (it draws lists, and a list drawn into the fake page never finishes emptying);
// the checks drive it through tune() and the element's events.
const absorb = () => { const store = {}; return new Proxy(function () {}, {
  get: (_t, k) => k in store ? store[k] : k === Symbol.toPrimitive ? () => "" : k === "then" ? undefined : (store[k] = absorb()),
  set: (_t, k, v) => (store[k] = v, true), apply: () => absorb(), construct: () => absorb() }); };
async function runPopover(script, { songTitle } = {}) {
  const src = fs.readFileSync(R("src/renderer/popover.js"), "utf8");
  const els = {}; const el = (id) => (els[id] ||= absorb());
  let timers = [], now = 1e6, audio = null;
  const later = (fn, ms = 0) => { timers.push({ id: timers.length + 1, at: now + ms, fn }); return timers.length; };
  const cancel = (id) => { const t = timers[id - 1]; if (t) t.fn = null; };
  const advance = async (ms) => {
    const end = now + ms;
    for (;;) {
      const due = timers.filter((t) => t.fn && t.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      now = due.at; const f = due.fn; due.fn = null; f();
      await new Promise((r) => setImmediate(r));
    }
    now = end;
  };
  class FakeAudio extends EventTarget {
    constructor() { super(); Object.assign(this, { paused: true, src: "", currentTime: 0, volume: 1, error: null, readyState: 0 }); }
    play() { this.paused = false; return Promise.resolve(); } pause() { this.paused = true; }
    load() {} removeAttribute() { this.src = ""; } setSinkId() { return Promise.resolve(); }
  }
  const win = new EventTarget(), calls = [];
  const auralfm = new Proxy({}, { get: (_t, k) =>
    k === "resolve" ? async () => ({ url: "https://radio.example/live" })
    : k === "nextStation" ? async () => { calls.push(["nextStation"]); return null; }
    : k === "songTitle" ? async (...a) => { calls.push(["songTitle", ...a]); return songTitle ? songTitle(...a) : undefined; }
    // The page's own start-up waits on these forever: it draws lists, and a
    // list drawn into the fake page would never finish emptying.
    : k === "stats" || k === "getState" ? () => new Promise(() => {})
    : (...a) => { calls.push([k, ...a]); } });
  const navigator = { onLine: true, mediaDevices: absorb(),
    mediaSession: { metadata: null, playbackState: "", setActionHandler() {} } };
  const ctx = { console: { log() {}, warn() {}, error() {} }, Promise, Event, EventTarget,
    Date: { now: () => now }, setTimeout: later, clearTimeout: cancel, setInterval: () => 0, clearInterval() {},
    Audio: function () { return (audio = new FakeAudio()); }, navigator, matchMedia: () => absorb(),
    MediaMetadata: function (o) { Object.assign(this, o); }, Icons: absorb(), requestAnimationFrame: () => 0, localStorage: absorb(),
    getComputedStyle: () => absorb(), addEventListener: (n, f) => win.addEventListener(n, f),
    document: new Proxy({}, { get: (_t, k) => k === "getElementById" ? el : k === "addEventListener" ? () => {} : absorb() }) };
  ctx.window = new Proxy(ctx, { get: (t, k) => k === "auralfm" ? auralfm : t[k], set: (t, k, v) => (t[k] = v, true) });
  vm.createContext(ctx);
  vm.runInContext(src + "\n;globalThis.__tune = tune;", ctx, { filename: "popover.js" });
  await ctx.__tune({ id: "s1", title: "Test FM" }); await advance(0);
  const status = () => String(el("status").textContent);
  const asked = () => audio.src.startsWith("https://radio.example/live");
  return script({ audio: () => audio, status, asked, advance, navigator, win, calls, ctx, el,
    playing: () => audio.dispatchEvent(new Event("playing")),
    drop: () => { audio.src = ""; audio.dispatchEvent(new Event("ended")); } });
}

// ── the desktop takes a dropped stream back ──────────────────────────────────
// An Icecast stream that closes mid-song ends the response, and the element
// fires `ended`. The desktop popover listened for `error` only, so it went on
// saying "Live" over silence until somebody pressed play; and an `error` while
// live was treated as a dead station, marked against it and skipped to the next
// in town. The web build already took the address back (web/bridge.js rescue).
//
// Run, not read: popover.js in a sandbox with a fake <audio>, a fake clock and
// a switchable network. The stream drops; it must be asked for again at the
// same address after a wait, a fourth drop inside the window must give up and
// go to the next station, and a drop with no network must wait for `online`.
{
  console.log("\nthe desktop takes a dropped stream back");
  const gaps = [];
  try {
    await runPopover(async (p) => {
      p.playing(); p.drop();
      if (!/Reconnecting/.test(p.status())) gaps.push(`a stream that ended says "${p.status()}", not that it is reconnecting`);
      await p.advance(500);
      if (p.asked()) gaps.push("the address is asked for again with no wait");
      await p.advance(1000);
      if (!p.asked()) gaps.push("a stream that ended is not asked for again at its own address");
      for (let i = 0; i < 3; i++) { p.playing(); p.drop(); await p.advance(11000); }
      if (!p.calls.some(([k]) => k === "reportFailed")) gaps.push("a fourth drop inside two minutes keeps retrying instead of moving on");
    });
    await runPopover(async (p) => {
      p.playing(); p.audio().error = { code: 2 }; p.audio().dispatchEvent(new Event("error")); await p.advance(0);
      if (p.calls.some(([k]) => k === "reportFailed")) gaps.push("an error while live marks the station failed before trying it again");
    });
    await runPopover(async (p) => {
      p.playing(); p.navigator.onLine = false; p.drop(); await p.advance(20000);
      if (p.asked()) gaps.push("with no network the stream is retried anyway");
      p.navigator.onLine = true; p.win.dispatchEvent(new Event("online")); await p.advance(0);
      if (!p.asked()) gaps.push("a station held for the network does not come back on 'online'");
    });
  } catch (e) { gaps.push(`the sandbox could not run popover.js: ${e.message}`); }
  gaps.length ? fail("the desktop takes a dropped stream back", gaps.join("; "))
    : pass("a dropped stream is asked for again after 1, 4 and 10 s, moves on after the fourth drop, and waits out a lost network");
}

// ── a station's song reads as it was written ─────────────────────────────────
// ICY text declares no encoding. Taken as UTF-8 it turns a Latin-1 "Ärzte" into
// a replacement character; taken as Shift-JIS whenever that decodes cleanly (the
// rule R/a/dio's proxy uses, for a Japanese station) the same bytes come out as
// half-width katakana. A song that is the station's own name, a placeholder or
// a web address is not a song, and the same song in other spacing is not news.
{
  console.log("\na station's song reads as it was written");
  const { createRequire } = await import("node:module");
  const st = createRequire(import.meta.url)(R("src/songtitle.js"));
  const gaps = [];
  const latin1 = [0xc4, 0x72, 0x7a, 0x74, 0x65, 0x20, 0x2d, 0x20, 0x4d, 0xe4, 0x6e, 0x6e, 0x65, 0x72];
  const sjis = [0x93, 0xfa, 0x96, 0x7b, 0x8c, 0xea, 0x20, 0x2d, 0x20, 0x83, 0x65, 0x83, 0x58, 0x83, 0x67];
  const cases = [
    [st.decode(latin1), "Ärzte - Männer", "Latin-1"],
    [st.decode(sjis), "日本語 - テスト", "Shift-JIS"],
    [st.decode(new TextEncoder().encode("Beyoncé - Halo")), "Beyoncé - Halo", "UTF-8"],
    [st.decode(new TextEncoder().encode("BeyoncÃ© - Halo")), "Beyoncé - Halo", "UTF-8 sent through Latin-1"],
    [st.fromIcy("StreamTitle='Can - Vitamin C';StreamUrl='';\0\0"), "Can - Vitamin C", "an ICY block"],
    [st.fromIcy("StreamTitle='It's - Here';\0"), "It's - Here", "an ICY title with an apostrophe"],
    [st.clean("  Daft   Punk -\u0007 One More Time "), "Daft Punk - One More Time", "spacing and control characters"],
  ];
  for (const [got, want, what] of cases) if (got !== want) gaps.push(`${what} came out as ${JSON.stringify(got)}`);
  for (const [raw, station] of [["Radio X", "radio  x"], ["-"], ["Unknown"], ["https://radio.example"], ["   "], ["StreamTitle"]])
    if (raw !== "StreamTitle" && st.clean(raw, station) !== null) gaps.push(`${JSON.stringify(raw)} was taken for a song`);
  const sp = st.split("Daft Punk - One More Time");
  if (sp.artist !== "Daft Punk" || sp.title !== "One More Time") gaps.push(`"Artist - Title" split as ${JSON.stringify(sp)}`);
  if (st.split("Talk hour").artist !== "") gaps.push("a line with no artist was given one");
  if (!st.same("Daft Punk - One More Time", "daft punk -  one more time")) gaps.push("the same song in other spacing counts as new");
  gaps.length ? fail("a station's song reads as it was written", gaps.join("; "))
    : pass("Latin-1, Shift-JIS and UTF-8 titles decode as written; names, placeholders and addresses are not songs");
}

// ── a station's server is asked gently, and only by the stream ──────────────
// The song is asked of the server the stream comes from, and of nothing else.
// Asked on a timer, so the rules every polled service here keeps: not more
// often than every thirty seconds, a cooldown behind a failure, a server with
// no ICY left alone, a read that stops at its block and never at the stream's
// end (a live stream has none), https only on the web. Run against a fake
// server that counts what it is asked and how much of it is read.
{
  console.log("\na station's server is asked gently, and only by the stream");
  const { createRequire } = await import("node:module");
  const st = createRequire(import.meta.url)(R("src/songtitle.js"));
  const gaps = [];
  const realNow = Date.now;
  let now = 1e9; Date.now = () => now;
  try {
    const log = [];
    let mode = "icy", chunksRead = 0;
    const meta = (text) => { const b = new TextEncoder().encode(`StreamTitle='${text}';`); const n = Math.ceil(b.length / 16); const out = new Uint8Array(1 + n * 16); out[0] = n; out.set(b, 1); return out; };
    const fakeFetch = async (url, opts = {}) => {
      log.push({ url, headers: opts.headers || {} });
      if (mode === "down") throw new TypeError("network");
      const every = mode === "noicy" ? null : 16;
      let i = 0; chunksRead = 0;
      return { ok: true, headers: { get: (h) => (h.toLowerCase() === "icy-metaint" ? every && String(every) : null) },
        body: { cancel: async () => {}, getReader: () => ({
          cancel: async () => { i = Infinity; },
          read: async () => {
            if (i === Infinity) return { done: true };
            chunksRead++;
            if (chunksRead > 5000) return { done: true };          // the fake's own limit
            const chunk = i === 0 ? new Uint8Array([...new Uint8Array(16), ...meta("Can - Vitamin C")]) : new Uint8Array(4096);
            i++; return { value: chunk, done: false };
          } }) } };
    };
    const asker = st.createAsker({ fetch: fakeFetch, headers: { "User-Agent": "test" } });
    const first = await asker.ask("https://radio.example/live", "Test FM");
    if (first?.text !== "Can - Vitamin C") gaps.push(`the song was read as ${JSON.stringify(first)}`);
    if (log[0]?.headers["Icy-MetaData"] !== "1") gaps.push("the stream is not asked for its titles (Icy-MetaData: 1)");
    if (log[0] && new URL(log[0].url).host !== "radio.example") gaps.push(`something other than the station's server was asked: ${log[0].url}`);
    if (chunksRead > 3) gaps.push(`the read went on for ${chunksRead} chunks after the block`);
    now += 5000; await asker.ask("https://radio.example/live", "Test FM");
    if (log.length !== 1) gaps.push("asked again five seconds later");
    now += 30000; await asker.ask("https://radio.example/live", "Test FM");
    if (log.length !== 2) gaps.push("not asked again after thirty seconds");

    mode = "down"; log.length = 0;
    const down = st.createAsker({ fetch: fakeFetch });
    const r1 = await down.ask("https://down.example/a");
    now += 31000; await down.ask("https://down.example/a");
    if (r1 !== undefined) gaps.push("a failed read is reported as 'no song' and would clear what is shown");
    if (log.length !== 1) gaps.push("a server that failed is asked again before its cooldown");

    mode = "noicy"; log.length = 0;
    const plain = st.createAsker({ fetch: fakeFetch });
    await plain.ask("https://plain.example/a"); now += 31000; await plain.ask("https://plain.example/a");
    if (log.length !== 1) gaps.push("a server with no ICY is asked again");

    mode = "icy"; log.length = 0;
    const web = st.createAsker({ fetch: fakeFetch, secureOnly: true });
    await web.ask("http://radio.example/live"); await web.ask("https://radio.example/list.m3u8");
    if (log.length) gaps.push(`the web asked ${log.map((l) => l.url).join(", ")} (an http server or a playlist)`);
  } catch (e) { gaps.push(`the fake server could not be run: ${e.message}`); }
  finally { Date.now = realNow; }

  // Main reads only what it handed out to be played: the popover cannot send it
  // to fetch an address of its choosing.
  const ipc = fs.readFileSync(R("src/main/ipc-catalog.js"), "utf8");
  const h = ipc.match(/ipcMain\.handle\("stream:song",[\s\S]*?\);/);
  if (!h) gaps.push("there is no stream:song handler to check");
  else if (!/given\.has\(url\)/.test(h[0])) gaps.push("stream:song fetches any address it is given, not only the ones main resolved");

  gaps.length ? fail("a station's server is asked gently, and only by the stream", gaps.join("; "))
    : pass("one read per thirty seconds of the stream's own server, stopped at its block; cooldowns, no-ICY and http are left alone");
}

// ── the desktop shows the song, and says it once ─────────────────────────────
// The status line is a polite live region: rewriting it with the same song every
// thirty seconds would read the song out every thirty seconds. And the lock
// screen and Now Playing should name the song and the station it is on.
{
  console.log("\nthe desktop shows the song, and says it once");
  const gaps = [];
  let answer = { text: "Can - Vitamin C", artist: "Can", title: "Vitamin C" };
  try {
    await runPopover(async (p) => {
      p.playing(); await p.advance(0);
      if (p.status() !== "Can - Vitamin C") gaps.push(`the status says "${p.status()}" with a song on`);
      const md = p.navigator.mediaSession.metadata;
      if (md?.title !== "Vitamin C" || md?.artist !== "Can" || md?.album !== "Test FM")
        gaps.push(`Now Playing reads ${JSON.stringify(md && { title: md.title, artist: md.artist, album: md.album })}`);
      p.el("status").textContent = "unchanged";
      await p.advance(30000);
      if (p.status() !== "unchanged") gaps.push("the same song rewrote the status line, so it is read out again");
      answer = null; await p.advance(30000);
      if (p.status() === "unchanged" || /Vitamin/.test(p.status())) gaps.push(`a station that stopped naming a song still shows "${p.status()}"`);
      answer = undefined; p.el("status").textContent = "kept"; await p.advance(30000);
      if (p.status() !== "kept") gaps.push("an unanswered ask changed the status line");
      if (!p.calls.some(([k, url]) => k === "songTitle" && url.startsWith("https://radio.example/live")))
        gaps.push("the song is not asked for by the address that is playing");
    }, { songTitle: () => answer });
  } catch (e) { gaps.push(`the sandbox could not run popover.js: ${e.message}`); }
  gaps.length ? fail("the desktop shows the song, and says it once", gaps.join("; "))
    : pass("the song replaces the place, Now Playing names song, artist and station, and a repeat is not announced");
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
  if (!shows.includes("const on = () => true;") || !shows.includes("const shown = () => on() && ") || !shows.includes("card.hidden = !(shown() && (rows.length || said || unseen || next));") || !shows.includes("const unseen = shown() && ")) gaps.push("listening to shows is not on everywhere, or the prompt to see them is not gated by shown()");
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
  const rep = shows.slice(shows.indexOf("async function report(peer)"), shows.indexOf("async function listen(peer"));
  if (!(rep.indexOf("gone.add(peer.pubkey)") >= 0 && rep.indexOf("gone.add(peer.pubkey)") < rep.indexOf("chatReport"))) gaps.push("reporting a show does not hide its host before anything else");
  gaps.length ? fail("a show is heard directly, and found honestly", gaps.join("; "))
    : pass("the handshake is sealed and fresh, the host answers only live and to a dozen, and a listener is told what a direct connection shows");
}

// ── a show that drops is asked for again; one that ends can name the next ───
// A listener's connection failing ended the show ("Connection lost") with the
// host still on air: a phone changing networks lost the show for good. And a
// show that ended left its listeners in silence even when its host had a show
// to send them to.
//
// Run, not read: explore-shows.js with a fake WebRTC connection, a fake relay
// path for the sealed handshake, a fake clock and a fake page. The connection
// drops: the listener must say so, tell the host the old one is gone, and ask
// again after a wait, while the host is on air, and not once it has left. The
// host ends naming the next show: it must be offered, and nothing connected to
// it until Listen is pressed.
{
  console.log("\na show that drops is asked for again; one that ends can name the next");
  const src = readSrc("src/renderer/explore-shows.js");
  class FakeEl {
    constructor(tag = "div") { Object.assign(this, { tag, children: [], textContent: "", hidden: false, className: "", attrs: {}, dataset: {}, style: {} });
      this.classList = { toggle() {}, add() {}, remove() {}, contains: () => false }; }
    append(...k) { this.children.push(...k.filter((x) => typeof x === "object")); }
    setAttribute(k, v) { this.attrs[k] = String(v); } getAttribute(k) { return this.attrs[k]; }
    set textContent(v) { this._t = v; if (v === "") this.children = []; } get textContent() { return this._t; }
  }
  async function runShows(script) {
    let now = 1e9, timers = [];
    const later = (fn, ms = 0) => { timers.push({ at: now + ms, fn }); return timers.length; };
    const cancel = (id) => { if (timers[id - 1]) timers[id - 1].fn = null; };
    const advance = async (ms) => {
      const end = now + ms;
      for (;;) {
        await new Promise((r) => setImmediate(r));
        const due = timers.filter((t) => t.fn && t.at <= end).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        now = due.at; const f = due.fn; due.fn = null; f();
      }
      now = end; await new Promise((r) => setImmediate(r));
    };
    const els = {}, $ = (id) => (els[id] ||= new FakeEl());
    const sent = [], pcs = [];
    let signal = null;
    class FakePC {
      constructor() { Object.assign(this, { connectionState: "new", signalingState: "stable", iceGatheringState: "complete", localDescription: null }); pcs.push(this); }
      addTransceiver() {} addEventListener() {} close() { this.closed = true; }
      async createOffer() { return { type: "offer", sdp: "v=0" }; }
      async setLocalDescription(d) { this.localDescription = d; this.signalingState = "have-local-offer"; }
      async setRemoteDescription() { this.signalingState = "stable"; }
      to(state) { this.connectionState = state; this.onconnectionstatechange?.(); }
    }
    const auralfm = {
      onRtcSignal: (fn) => { signal = fn; },
      rtcSignal: async (to, payload) => { sent.push({ to, ...payload }); return true; },
      presenceStats: async () => ({ cell: "u4pr", connected: 1 }),
      hiddenShows: async () => [], muteList: async () => [],
      studioHost() {}, transport() {}, showsWatch() {}, chatReport: async () => {},
    };
    const body = new FakeEl("body");
    const ctx = { console: { log() {}, warn() {}, error() {} }, Promise, Uint8Array, Map, Set, Array, JSON,
      Date: { now: () => now }, setTimeout: later, clearTimeout: cancel,
      crypto: { getRandomValues: (a) => { for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256); return a; } },
      URLSearchParams, location: { search: "" }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
      Audio: function () { return { play: () => Promise.resolve(), pause() {}, setAttribute() {}, srcObject: null }; },
      MediaStream: function () {}, RTCPeerConnection: FakePC, MutationObserver: function () { return { observe() {} }; },
      document: { getElementById: $, createElement: (t) => new FakeEl(t), body, addEventListener() {}, activeElement: null } };
    ctx.window = ctx; ctx.window.auralfm = auralfm;
    vm.createContext(ctx);
    vm.runInContext(src, ctx, { filename: "explore-shows.js" });
    const S = ctx.AuralShows;
    const peer = (k, label) => ({ pubkey: k, live: true, label, lat: 1, lon: 2, geohash: "u4pr" });
    const answer = (sid) => signal("H", { t: "answer", sid, sdp: "v=0" }, now);
    const offers = () => sent.filter((m) => m.t === "offer");
    // Tuned in and playing: the host's presence says the show is on.
    async function tuneIn(list = [peer("H", "Show A")]) {
      S.peers(list); await advance(0);
      S.listen(list[0]); await advance(1000);
      const o = offers().at(-1); answer(o.sid); await advance(0);
      pcs.at(-1).to("connected"); await advance(0);
      return o;
    }
    return script({ S, $, sent, pcs, offers, advance, signal: (from, m) => signal(from, m, now), tuneIn, peer, answer });
  }
  const gaps = [];
  const visit = (n, f) => { f(n); for (const c of n.children || []) visit(c, f); };
  try {
    await runShows(async (p) => {
      const first = await p.tuneIn();
      if (p.S.state?.state !== "on") gaps.push(`the fake show did not start (${JSON.stringify(p.S.state)})`);
      p.pcs.at(-1).to("failed"); await p.advance(0);
      if (p.S.state?.state !== "reconnecting") gaps.push(`a dropped show is "${p.S.state?.state}${p.S.state?.why ? ` (${p.S.state.why})` : ""}", not reconnecting`);
      if (!p.sent.some((m) => m.t === "bye" && m.sid === first.sid)) gaps.push("the host is not told the dropped connection is gone");
      await p.advance(1000);
      if (p.offers().length !== 1) gaps.push("asked again with no wait");
      await p.advance(2000);
      const again = p.offers().at(-1);
      if (p.offers().length !== 2 || again.sid === first.sid) gaps.push("a dropped show is not asked for again");
      // The retry gets through: playing again.
      p.answer(again.sid); await p.advance(0); p.pcs.at(-1).to("connected"); await p.advance(0);
      if (p.S.state?.state !== "on") gaps.push("the show did not come back after asking again");
      // Falling again and again ends it as lost, not a loop.
      for (let i = 0; i < 6 && p.S.state?.state !== "failed"; i++) { p.pcs.at(-1).to("failed"); await p.advance(11000); }
      if (p.S.state?.why !== "lost") gaps.push(`a show that keeps falling ends as "${p.S.state?.why || p.S.state?.state}", not lost`);
    });
    await runShows(async (p) => {
      await p.tuneIn();
      p.S.peers([]); await p.advance(0);                 // the host's presence has stopped saying the show is on
      p.pcs.at(-1).to("failed"); await p.advance(15000);
      if (p.S.state?.state !== "failed" || p.offers().length !== 1) gaps.push("a show whose host has left the air is asked for again");
    });
    await runShows(async (p) => {
      const first = await p.tuneIn([p.peer("H", "Show A"), p.peer("B", "Show B")]);
      p.signal("H", { t: "bye", sid: first.sid, next: "B" }); await p.advance(0);
      if (p.S.state) gaps.push(`a show that handed over is still "${p.S.state.state}"`);
      if (p.offers().some((o) => o.to === "B")) gaps.push("the listener was connected to the next host without pressing Listen");
      let go = null, line = "";
      // The Listen that goes with the line, not the next show's own row.
      visit(p.$("livelist"), (n) => { if (/handed over/.test(n.textContent || "")) { line = n.textContent; go = n.children.find((c) => c.tag === "button") || null; } });
      if (!/Show A/.test(line) || !/Show B/.test(line)) gaps.push(`the next show is not named (${JSON.stringify(line)})`);
      if (!go) gaps.push("the handover line has no Listen of its own");
      else { go.onclick(); await p.advance(1000); if (!p.offers().some((o) => o.to === "B")) gaps.push("Listen on the handed-over show does not tune to it"); }
    });
    await runShows(async (p) => {
      const first = await p.tuneIn([p.peer("H", "Show A")]);
      p.signal("H", { t: "bye", sid: first.sid, next: "Z" }); await p.advance(0);   // a show this device does not list
      let named = false;
      visit(p.$("livelist"), (n) => { if (/handed over/.test(n.textContent || "")) named = true; });
      if (named || p.S.state?.why !== "ended") gaps.push("a goodbye naming a show this device does not list is offered anyway");
    });
  } catch (e) { gaps.push(`the sandbox could not run explore-shows.js: ${e.message}`); }

  // The host's side: the goodbye names the chosen show only if it is still on air.
  const studio = readSrc("src/renderer/explore-studio.js");
  const cl = studio.match(/function closeListeners\(\) \{([\s\S]*?)\n  \}/);
  if (!cl) gaps.push("closeListeners is gone, so the host's goodbye cannot be checked");
  else if (!/othersOnAir\(\)\.some/.test(cl[1]) || !/next \? \{ t: "bye", sid, next \}/.test(cl[1]))
    gaps.push("the host's goodbye does not name the next show, or names one without checking it is still on air");

  gaps.length ? fail("a show that drops is asked for again; one that ends can name the next", gaps.join("; "))
    : pass("a drop is asked for again after 2, 5 and 10 s while the host is on air; a handover is offered, never followed");
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
