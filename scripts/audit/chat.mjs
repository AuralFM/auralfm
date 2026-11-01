/** The audit: Presence, chat, notes, private messages, hubs, relays and favourites sync. */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { R, fail, pass, skip, HAS_CAT, C, NO_CAT, main, exploreSrc, readSrc, strings, LANGUAGES, en } from "./lib.mjs";

// ── the favorite handshake can actually be sent ───────────────────────────────
// wrap() refused an empty body, which is right for a chat message and wrong for
// the favorite signal — that one is a `fav` tag and nothing else, deliberately.
// So every favorite recorded its local half and silently never told the other
// person, mutual status was unreachable for anybody, and nothing logged a thing.
// Unit-testing wrap() in isolation would not have caught it; it returns null
// entirely correctly for the arguments it was handed. It took a real envelope
// through a real relay.
{
  console.log("\na bodiless private envelope still sends when it carries tags");
  const priv = await import(pathToFileURL(R("src/nostr-private.js")).href)
    .then((m) => m.default ?? m);
  const { schnorr } = await import("@noble/curves/secp256k1.js");
  const sk = schnorr.utils.randomSecretKey();
  const to = Buffer.from(schnorr.getPublicKey(schnorr.utils.randomSecretKey())).toString("hex");
  const problems = [];
  if (!priv.wrap("", to, sk, [["fav", "1"]])) problems.push("a fav signal cannot be wrapped");
  if (priv.wrap("", to, sk, [])) problems.push("an empty message with no tags is being sent");
  problems.length
    ? fail("favorite handshake", problems.join("; "))
    : pass("a fav tag with no words sends; an empty message with nothing in it does not");
}

// ── every chat channel goes through one funnel ────────────────────────────────
// Muted, filtered and only-people-you-keep are three separate rules, and they
// were briefly applied by hand at each send site — one `muted.filter()` per
// channel, with nothing making a fourth channel remember to do the same. That is
// how a safety rule ships covering two of three surfaces. `visible()` is the
// funnel; nothing outside it may filter a chat list.
{
  console.log("\nevery chat channel is filtered in one place");
  const src = main;
  const problems = [];
  if (!/function visible\(list\)/.test(src)) problems.push("visible() is gone");
  // Anything sending a chat payload has to hand it to visible() on the way.
  for (const ch of ["presence:messages", "presence:notes", "presence:dms"]) {
    const sends = [...src.matchAll(new RegExp(`"${ch}"\\s*,\\s*([^)\\n]*)`, "g"))].map((m) => m[1]);
    for (const arg of sends) {
      if (/\bvisible\(|\bclean\b/.test(arg)) continue;
      problems.push(`${ch} is sent unfiltered: ${arg.trim().slice(0, 40)}`);
    }
  }
  // The funnel itself is the only legitimate caller of muted.filter. Counted
  // with comments stripped, because the paragraph above visible() explains the
  // bug by naming the call and would otherwise fail its own check.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const raw = [...code.matchAll(/muted\.filter\(/g)].length;
  if (raw !== 1) problems.push(`muted.filter called ${raw}× outside comments — only visible() should`);
  problems.length
    ? fail("chat funnel", problems.join("; "))
    : pass("messages, notes and private messages all pass through visible()");
}

// ── the composer does not throw away what somebody typed ─────────────────────
// `input.value = ""` used to run *before* the command did, so every command that
// failed on a name it could not resolve deleted the message with it. Typing
// `/msg gal <a paragraph>` with the name slightly wrong lost the paragraph.
//
// Checked structurally rather than by running the renderer: inside the submit
// handler, the clear must not appear before `cmd.run`. A comment cannot enforce
// an ordering, and this ordering is the whole bug.
{
  console.log("\nthe composer keeps your words when a command fails");
  const src = exploreSrc;
  const start = src.indexOf('$("chatform").onsubmit');
  const problems = [];
  if (start < 0) problems.push("the submit handler is gone");
  else {
    const body = src.slice(start, start + 3000);
    // The invariant, stated exactly: between looking a command up and running
    // it, nothing may clear the input. Anything looser measures the private
    // branch above — which clears correctly, after a successful send — and this
    // check's own first two attempts both failed that way.
    const look = body.indexOf("COMMANDS[");
    const run = body.indexOf("cmd.run(", look < 0 ? 0 : look);
    if (look < 0 || run < 0) problems.push("nothing dispatches a command");
    else if (/input\.value\s*=\s*""/.test(body.slice(look, run))) {
      problems.push("input is cleared before the command runs — a failed command loses the message");
    }
    // And the private path has to exist, or every DM is a public message.
    if (!/dmWith\s*&&\s*!text\.startsWith\("\/"\)/.test(body)) {
      problems.push("nothing routes a private conversation to dmSend");
    }
  }
  problems.length
    ? fail("composer", problems.join("; "))
    : pass("a command runs before the input is cleared, and a private thread sends privately");
}

// ── a profile lookup asks about one person, never a room ─────────────────────
// Every subscription in this app asks relays for everything and filters locally,
// so no relay learns which cell anybody cares about. A profile fetch is the one
// place that is easy to undo by accident: `{kinds:[0], authors:[…]}` is efficient
// and correct-looking, and the author list *is* the set of people in your cell.
// One author per request, and only when somebody asks.
{
  console.log("\na profile lookup names one person, not a room");
  const src = fs.readFileSync(R("src/presence-nostr.js"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const problems = [];
  const i = src.indexOf("function lookupProfile(");
  if (i < 0) problems.push("lookupProfile is gone");
  else {
    const body = src.slice(i, src.indexOf("\n}", i));
    if (!/authors: \[pubkey\]/.test(body)) {
      problems.push("the request does not name exactly one author");
    }
    if (/authors: \[\.\.\.|authors: \[…\]|\.map\(|Object\.keys|peers/.test(body)) {
      problems.push("the request builds its author list from a collection");
    }
  }
  // And nothing anywhere else may subscribe to kind 0 in bulk.
  for (const m of src.matchAll(/kinds: \[0\][^}]*/g)) {
    if (!/authors: \[pubkey\]/.test(m[0])) problems.push(`a kind-0 subscription does not name one author: ${m[0].slice(0, 50)}`);
  }
  problems.length
    ? fail("profile lookup", problems.join("; "))
    : pass("profiles are fetched one person at a time, only when asked");
}

// ── a hub is the pair, and only the pair ─────────────────────────────────────
// Two people who type the same name and password must land in the same room, and
// anything less than the same pair must land somewhere else. Every one of these
// is a way the feature could look like it works while being either broken or a
// lie about privacy: a name that decides the room on its own, a password that is
// ignored, a ciphertext that opens in the wrong room.
{
  console.log("\na hub is its name and its password together");
  const problems = [];
  try {
    const hub = await import(pathToFileURL(R("src/hub.js")).href).then((m) => m.default ?? m);
    const a = hub.derive("Radio Club", "shortwave-2026");

    if (!a) problems.push("a valid pair produced no room");
    else {
      // Written differently, same room. People type untidily and must still meet.
      const messy = hub.derive("  radio   CLUB ", "shortwave-2026");
      if (messy?.tag !== a.tag) problems.push("the same pair typed untidily lands in a different room");

      // Change either half and it is a different room.
      const otherPw = hub.derive("Radio Club", "shortwave-2025");
      const otherNm = hub.derive("Radio Clubb", "shortwave-2026");
      if (otherPw?.tag === a.tag) problems.push("the password does not decide the room");
      if (otherNm?.tag === a.tag) problems.push("the name does not decide the room");

      // The published half must not be the secret half.
      if (a.tag.includes(Buffer.from(a.key).toString("hex").slice(0, 16))) {
        problems.push("the public tag leaks the key");
      }

      const sealed = hub.seal("meet on 7.200", a);
      if (hub.open(sealed, a) !== "meet on 7.200") problems.push("a hub cannot read its own message");
      if (hub.open(sealed, otherPw) !== null) problems.push("the wrong password can read it");
      if (hub.open(sealed, otherNm) !== null) problems.push("a ciphertext opens in another room");
      if (hub.open(sealed.slice(0, -4) + "AAAA", a) !== null) problems.push("a tampered message still opens");
    }
    // A hub with only half a pair is a public channel wearing a disguise.
    if (hub.derive("named", "")) problems.push("a hub with no password was allowed");
    if (hub.derive("", "worded")) problems.push("a hub with no name was allowed");
  } catch (err) {
    problems.push(`hub.js would not run: ${err.message}`);
  }
  problems.length
    ? fail("hubs", problems.join("; "))
    : pass("the same pair meets, anything else does not, and no ciphertext travels between rooms");
}

// ── what we publish says who we are and paid to be heard ─────────────────────
// A five-minute census of live geohash traffic found 104 people present and
// every self-identifying event saying `glub.chat`. AuralFM had a client tag, but
// only on kind 20808 — an event nobody else parses — so it announced itself to
// no one. And clients on this network offer a proof-of-work filter, so an
// unmined message is one they may simply never render.
//
// Signs a real event through the real module and checks the result the way a
// relay would, because the failure that matters is not a missing tag: it is
// mining that changes the tags after the id is computed, which produces an event
// every relay rejects and nothing local would notice.
{
  console.log("\nevery event we publish is identified and mined");
  const problems = [];
  const slow = [];
  // 20,000 hashes take about 40 ms here on a quiet day. Ten times that, and the
  // processor is somebody else's for now.
  const starved = () => { const t = performance.now(); for (let i = 0; i < 20000; i++) createHash("sha256").update(`audit ${i} ${"x".repeat(180)}`).digest(); return performance.now() - t > 400; };
  try {
    const nostr = await import(pathToFileURL(R("src/presence-nostr.js")).href)
      .then((m) => m.default ?? m);
    const { schnorr } = await import("@noble/curves/secp256k1.js");
    const crypto = await import("node:crypto");
    const B = (h) => Uint8Array.from(Buffer.from(h, "hex"));

    const sent = [];
    class Capture {
      constructor() { this.readyState = 1; setTimeout(() => this.onopen?.(), 0); }
      send(d) { const f = JSON.parse(d); if (f[0] === "EVENT") sent.push(f[1]); }
      close() { this.readyState = 3; }
    }
    const realWs = globalThis.WebSocket;
    globalThis.WebSocket = Capture;
    try {
      nostr.join(19.4326, -99.1332, "audit");
      await new Promise((r) => setTimeout(r, 400));
      nostr.say("audit");
      nostr.drop("audit");
      await new Promise((r) => setTimeout(r, 200));
      nostr.leave();
    } finally { globalThis.WebSocket = realWs; }

    const kinds = new Map();
    for (const e of sent) kinds.set(e.kind, e);
    if (!kinds.size) problems.push("nothing was published at all");
    for (const [kind, e] of kinds) {
      const client = (e.tags.find((t) => t[0] === "client") || [])[1];
      if (client !== "auralfm") problems.push(`kind ${kind} does not say who sent it`);
      // Mining is capped at 1.5 s; past it the event goes out with no nonce tag.
      // That is the design, and on a starved machine it is what happens (this
      // check failed three times in three days at a load average over 200,
      // with nothing wrong). So an unmined event is a fault only if it claims
      // a difficulty it does not have, or if this machine is quick enough
      // that the cap should never have been reached.
      const bits = nostr.powBits(e.id), claims = e.tags.some((t) => t[0] === "nonce");
      if (bits < 12 && (claims || !starved())) problems.push(`kind ${kind} mined to only ${bits} bits${claims ? ", and says otherwise" : ""}`);
      else if (bits < 12) slow.push(kind);
      // The id must match the tags actually sent. Mining rewrites tags, and an
      // id computed before that rewrite is an event every relay drops.
      const serial = JSON.stringify([0, e.pubkey, e.created_at, e.kind, e.tags, e.content]);
      if (crypto.createHash("sha256").update(serial).digest("hex") !== e.id) {
        problems.push(`kind ${kind} has an id that does not match its own tags`);
      }
      let ok = false;
      try { ok = schnorr.verify(B(e.sig), B(e.id), B(e.pubkey)); } catch { ok = false; }
      if (!ok) problems.push(`kind ${kind} carries an invalid signature`);
    }
  } catch (err) {
    problems.push(`could not exercise the signer: ${err.message}`);
  }
  problems.length ? fail("client tag and proof of work", problems.join("; "))
    : slow.length ? skip("proof of work", `this machine is too busy to mine inside the 1.5 s cap (kind ${slow.join(", ")} went out unmined and untagged, as designed)`)
    : pass("every published kind names auralfm, mines to 12 bits, and still verifies");
}

// ── the renderer is told once per burst, not once per packet ─────────────────
// Every inbound event used to hand the renderer a freshly built copy of the whole
// list it belonged to. Measured against live relays for fifteen seconds: 2,939
// onPeers calls carrying 1,245,312 objects. In Electron each one is a structured
// clone across a process boundary, and they queue *ahead of* whatever the
// renderer asked for next — which is why presenceStats() took twelve seconds
// right after tuning and the chat looked dead exactly when somebody opened it.
//
// The rule that keeps it fixed: nothing calls a renderer callback directly.
// Inbound paths mark a list dirty and one flush sends it.
{
  console.log("\nthe renderer is updated per burst, not per event");
  const src = fs.readFileSync(R("src/presence-nostr.js"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const problems = [];
  const i = src.indexOf("function flush()");
  if (i < 0) problems.push("flush() is gone — updates are no longer coalesced");
  else {
    const body = src.slice(i, src.indexOf("\n}", i));
    const inside = (body.match(/\bon(?:Peers|Messages|Notes|Dms)\(/g) || []).length;
    const total = (src.match(/\bon(?:Peers|Messages|Notes|Dms)\(/g) || []).length;
    if (inside !== 4) problems.push(`flush() sends ${inside} of the 4 lists`);
    if (total > inside) {
      problems.push(`${total - inside} renderer callback(s) invoked outside flush() — a burst will flood IPC`);
    }
    if (!/setTimeout\(flush,/.test(src)) problems.push("nothing schedules a flush");
  }
  problems.length
    ? fail("update coalescing", problems.join("; "))
    : pass("every renderer update goes through one flush, so a burst costs one message");
}

// ── a room never carries a conversation ──────────────────────────────────────
// Rooms are scoped to a place and stop meaning anything when you tune away.
// Private messages are scoped to a person and follow you everywhere. Merged into
// one column, a message meant for one person appeared in every room's log and
// travelled from city to city: a PRIVATE line was seen
// sitting in a city it had nothing to do with. The two scopes stay apart.
{
  console.log("\nthe room log carries the room, not private conversations");
  const src = exploreSrc;
  const problems = [];
  const i = src.indexOf("const merged = (");
  if (i < 0) problems.push("the log's merge is gone or renamed");
  else {
    const block = src.slice(i, i + 1400);
    // The room is the last branch — whatever follows the final `: [`.
    const room = block.slice(block.lastIndexOf(": ["));
    for (const [name, why] of [
      ["dmCache", "private messages will show in every room"],
      ["hubCache", "a private hub's messages will show in every room"],
    ]) {
      if (new RegExp(name).test(room)) problems.push(`the room branch merges ${name} — ${why}`);
    }
    if (!/dmCache\.filter\(/.test(block)) {
      problems.push("the conversation branch does not filter dmCache to one person");
    }
  }
  // And the drawer has to exist to reach them, or they are unreachable.
  for (const fn of ["function conversations(", "function paintDmButton(", "function openConvos("]) {
    if (!src.includes(fn)) problems.push(`${fn}) is gone`);
  }
  problems.length
    ? fail("room vs conversation", problems.join("; "))
    : pass("the room shows the room; conversations live behind their own count");
}

// ── what the app says survives the next message ──────────────────────────────
// systemLine() appended straight into #chatlog, and repaintLog() empties that
// element and rebuilds it from the caches. So every explanation the chat gave
// lasted until the next inbound message: "Nobody here called gal" could vanish a
// second after it appeared, which made the app least articulate exactly when it
// had most to say. It has to live in a cache and be merged like any other kind.
{
  console.log("\nwhat the app says outlives the next repaint");
  const src = exploreSrc;
  const problems = [];
  const fn = src.slice(src.indexOf("function systemLine("), src.indexOf("function systemLine(") + 500);
  if (!src.includes("function systemLine(")) problems.push("systemLine is gone");
  else {
    if (/\.append\(|createElement\(/.test(fn)) {
      problems.push("systemLine writes to the DOM — repaintLog will erase it");
    }
    if (!/systemCache\.push\(/.test(fn)) problems.push("systemLine does not record what it said");
  }
  // And the repaint has to put them back, in both views.
  const rp = src.slice(src.indexOf("function repaintLog("), src.indexOf("function repaintLog(") + 2600);
  if (!/systemCache\.map\(/.test(rp)) problems.push("repaintLog does not merge systemCache");
  // Clearing the log without clearing the cache is a Clear that clears nothing.
  for (const site of ['"/clear"', "async function panicWipe("]) {
    const i = src.indexOf(site);
    if (i < 0) { problems.push(`${site} is gone`); continue; }
    if (!/clearSystemLines\(\)/.test(src.slice(i, i + 700))) {
      problems.push(`${site} empties the log but not systemCache`);
    }
  }
  problems.length
    ? fail("system lines", problems.join("; "))
    : pass("system lines are cached, repainted in both views, and cleared with the log");
}

// ── a note is not duplicated by sweeping the globe ───────────────────────────
// The three inbound lists — chat, notes, private messages — shared one seen-set,
// and they do not share a lifetime. `view()` empties the chat whenever the
// selection moves, so it cleared that set; the notes list survives a view change
// and was still holding its notes. The next subscription replayed them, the set
// no longer recognised them, and each one was appended again.
//
// Seen as seven identical notes from a stranger who had said "hola"
// once. Six selection changes, six extra copies. Nothing static would have found
// this: every function here is correct on its own, and the defect only exists in
// the order they run in.
//
// So this drives the real module against a relay that does the one thing that
// matters — serves what it has stored to every REQ it receives. No network: the
// fake is installed as `globalThis.WebSocket`, which is what `connect()` dials.
{
  console.log("\nsweeping the globe does not duplicate a note");
  const LAT = 38.72, LON = -9.14;
  let NOTE = null;

  class FakeRelay {
    constructor() { this.readyState = 1; setTimeout(() => this.onopen?.(), 0); }
    send(data) {
      let f;
      try { f = JSON.parse(data); } catch { return; }
      if (f[0] !== "REQ" || !NOTE) return;
      const [, subId, filter] = f;
      if (!(filter.kinds || []).includes(1)) return;      // not the notes subscription
      setTimeout(() => this.onmessage?.({ data: JSON.stringify(["EVENT", subId, NOTE]) }), 0);
    }
    close() { this.readyState = 3; this.onclose?.(); }
  }

  const realWs = globalThis.WebSocket;
  globalThis.WebSocket = FakeRelay;
  /**
   * Wait for the condition, never for the clock.
   *
   * This check has now been wrong twice for the same reason. First it slept
   * 140ms for a note that arrives after a coalescing flush; widening it to a
   * fixed 400ms then made it *flaky* — passing or failing depending on how long
   * eight sockets and a 599-relay distance sort happened to take. A check that
   * goes green on a re-run is worse than one that fails, because it teaches
   * everyone to re-run instead of to look.
   *
   * So: poll for what is being asserted, with a deadline long enough that only a
   * real failure reaches it. The duplicate this exists to catch is a *count*,
   * and a count is still wrong however long you wait for it.
   *
   * Third time: polling was right, four seconds was not. This went red three
   * times in one day and passed on every re-run, which is precisely the pattern
   * the paragraph above says is worse than failing. It reproduced immediately
   * with all eight cores pinned — nothing here touches the network, so what it
   * was measuring was how much CPU this process could get, not whether the note
   * arrived.
   *
   * A deadline is a statement about the machine, not about the code. Since a
   * generous one costs nothing on a green run — the poll returns the moment the
   * condition holds — the only thing a short deadline buys is a faster answer on
   * a genuine failure, which is not worth a check that cries wolf.
   */
  const settle = async (want, deadlineMs = 20000) => {
    const until = Date.now() + deadlineMs;
    while (Date.now() < until) {
      if (want()) return true;
      await new Promise((r) => setTimeout(r, 25));
    }
    return false;
  };
  const tick = (ms = 260) => new Promise((r) => setTimeout(r, ms));
  let seen = [];
  let counted = null;
  try {
    const nostr = await import(pathToFileURL(R("src/presence-nostr.js")).href)
      .then((m) => m.default ?? m);
    nostr.onNotes((list) => { seen = list; });
    NOTE = {
      id: "a".repeat(64),
      // A stranger's key, or it is discarded as our own echoed back.
      pubkey: "b".repeat(64),
      kind: 1,
      created_at: Math.floor(Date.now() / 1000),
      tags: [["g", nostr.geohash(LAT, LON)], ["n", "yuls"]],
      content: "hola",
    };
    nostr.join(LAT, LON, "test");
    await settle(() => seen.length >= 1);
    const afterJoin = seen.length;
    // Six selection changes, which is a few seconds of spinning the globe with
    // the listening lock off.
    for (const [la, lo] of [[35.68, 139.69], [-22.9, -43.2], [51.5, -0.12],
                            [40.7, -74.0], [-33.86, 151.2], [19.43, -99.13]]) {
      nostr.view(la, lo);
      // Each view re-subscribes, so wait for the replay to have been offered
      // and flushed before moving the view again — otherwise the sweep races
      // ahead of the very duplication it is trying to provoke.
      await tick();
    }
    // Give any duplicate every chance to appear before declaring there is none.
    // This one always waits the whole window when the code is correct, so it is
    // the only part of this check that costs time on a green run. 2.5s buys the
    // same immunity to load that the delivery wait gets for free.
    await settle(() => seen.length !== 1, 2500);
    counted = { afterJoin, afterSweep: seen.length };
    nostr.leave();
  } finally {
    globalThis.WebSocket = realWs;
  }

  if (!counted || counted.afterJoin !== 1) {
    // Nothing arriving and the wrong number arriving are different failures with
    // different causes, and saying "arrived as 0" for a timeout sent me looking
    // at the relay fake when the answer was the clock.
    fail("note delivery", counted && counted.afterJoin === 0
      ? "no note arrived within 20s — delivery is broken, or this machine is too busy to be measured on"
      : `one note from eight relays arrived as ${counted?.afterJoin ?? "nothing"}`);
  } else if (counted.afterSweep !== 1) {
    fail("note duplication",
         `one note became ${counted.afterSweep} after six view changes — a seen-set is being cleared without its list`);
  } else {
    pass("one note stays one note across eight relays and six view changes");
  }
}

// ── every chat-ish record carries what the renderer labels it with ───────────
// repaintLog() writes `m.nick || m.from` as the sender on every line. Chat
// records set both; the private-message records set neither, so a real inbound
// DM rendered its sender as the literal string "undefined". Invisible in every
// self-addressed test, because those arrive with `mine: true` and render "you".
// Only a message from a second party shows it.
{
  console.log("\nevery message record carries a sender label");
  const src = fs.readFileSync(R("src/presence-nostr.js"), "utf8");
  const problems = [];
  // Each push into a list the renderer paints must set `from`.
  for (const m of src.matchAll(/(dms|messages|notes)\.push\(\{([\s\S]{0,400}?)\}\);/g)) {
    const [, list, body] = m;
    if (!/\bfrom:/.test(body)) problems.push(`${list}.push has no \`from\` — the renderer would show "undefined"`);
  }
  const renderer = exploreSrc;
  if (!/m\.nick \|\| m\.from/.test(renderer)) {
    problems.push("Explore no longer labels with `m.nick || m.from` — this check needs updating");
  }
  problems.length
    ? fail("sender labels", problems.join("; "))
    : pass("every record the chat log paints carries a `from`");
}

// ── chat speaks in short lines ──────────────────────────────────────────────
// The rule: about 30 characters a line. The chat's opening notice was 381 characters of italic in a
// panel people glance at, and the command replies ran to two sentences each.
// Everything the chat says: its strings in every language, and the literal
// text the slash commands answer with (the fixed part — a name is extra).
{
  console.log("\nchat speaks in short lines");
  const { strings, LANGUAGES } = await import(pathToFileURL(R("src/i18n.js")).href).then((m) => m.default || m);
  const KEYS = /^(chat\.|notes\.ask$|ctl\.trip|ctl\.somewhere)/;
  const long = [];
  for (const { code } of LANGUAGES) {
    const cap = code === "en" ? 32 : 36;
    for (const [k, v] of Object.entries(strings(code, "en"))) {
      if (KEYS.test(k) && String(v).replace("{who}", "").replace("{place}", "").length > cap) long.push(`${code} ${k} (${v.length})`);
    }
  }
  const cmds = readSrc("src/renderer/explore-commands.js");
  const said = [...cmds.matchAll(/systemLine\(\s*(["`])([\s\S]*?)\1\s*\)/g), ...cmds.matchAll(/hint:\s*(["'`])([\s\S]*?)\1/g)]
    .map((m) => m[2].replace(/\$\{[^}]*\}/g, "").trim());
  for (const line of said) if (line.length > 32) long.push(`command: "${line.slice(0, 40)}…" (${line.length})`);
  long.length ? fail("chat speaks in short lines", long.slice(0, 8).join("; ") + (long.length > 8 ? `; +${long.length - 8} more` : ""))
    : pass(`every chat string and command reply is 32 characters or fewer in English, 36 in translation`);
}

// ── the carry-over code holds no key ────────────────────────────────────────
// The web app can write what it holds as a line of text, for moving to a new
// install (6 Oct 2026). It goes through a clipboard and often a notes app or a
// message, so it must never hold anything that is a secret: only the named
// files of the messaging modules, never an identity. And a pasted file is
// taken only where this install has none of its own.
{
  console.log("\nthe carry-over code holds no key");
  const bridge = readSrc("web/bridge.js");
  const files = (bridge.match(/const BACKUP_FILES = \[([^\]]*)\];/) || [])[1] || "";
  const names = [...files.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  const body = bridge.slice(bridge.indexOf("backupCode: async"), bridge.indexOf("panicWipe: async"));
  const gaps = [];
  if (!names.length) gaps.push("no list of files to carry was found");
  for (const n of names) if (!["muted.json", "contacts.json", "filter.json"].includes(n)) gaps.push(`${n} is carried`);
  if (/identity\.json|\.sk\b|nsec|secret/i.test(body.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, ""))) gaps.push("the code's builder reads something named like a key");
  if (!/if \(!localStorage\.getItem\(FS \+ f\)\) localStorage\.setItem\(FS \+ f, v\)/.test(body)) gaps.push("a pasted file can replace one this install already has");
  gaps.length ? fail("the carry-over code holds no key", gaps.join("; "))
    : pass("the code carries favourites, settings and three named lists, no identity, and never overwrites a list already here");
}

// ── a tag says something ────────────────────────────────────────────────────
// A place's commonest tags are its chips in the app, and they were "music",
// "other", "tbd", "(null)" and "moi merino": a contributor's own name, on 923
// stations. scripts/lib/match.mjs leaves those out of the bundle (junkTag), by
// exact word, so a real tag that contains one keeps it.
{
  console.log("\na tag says something");
  const gaps = [];
  if (!HAS_CAT) skip("a tag says something", NO_CAT); else {
  const { pathToFileURL } = await import("node:url");
  const { junkTag } = await import(pathToFileURL(C("scripts/lib/match.mjs")).href);
  for (const t of ["(null)", "TBD", "music", "Música", "moi merino", "#", "@fm te conecta", "--", ""]) if (!junkTag(t)) gaps.push(`"${t}" is kept`);
  for (const t of ["world music", "radio drama", "jazz", "r&b", "80s", "fm", "música regional"]) if (junkTag(t)) gaps.push(`"${t}" is dropped`);
  const min = R("data/stations.min.json");
  if (!fs.existsSync(min)) skip("a tag says something: the catalogue", "data/ is not built");
  else {
    let junk = 0;
    for (const c of JSON.parse(fs.readFileSync(min, "utf8")).c) if (c[4] && c[4].split(",").some(junkTag)) junk++;
    if (junk) gaps.push(`${junk.toLocaleString("en-US")} station(s) in the bundle carry a tag that says nothing`);
  }
  gaps.length ? fail("a tag says something", gaps.join("; "))
    : pass("no station in the bundle carries a placeholder, a filler word or a contributor's name as a tag");
  }
}

// ── favorites sync keeps its promises ───────────────────────────────────────
// Favorites can be the same on a phone and a desktop (6 Oct 2026): a secret
// made on one device and carried to the other, and one sealed note on public
// relays (src/favsync.js). It is the first thing in this app that can take a
// star away on a device nobody is holding, so what it may not do is run here
// rather than read:
//   - an empty list never un-stars a full one (a lost file is not an instruction);
//   - a device joining with stars of its own keeps them;
//   - an un-star reaches the other device, and a later star wins it back;
//   - what goes to a relay cannot be read without the secret, and the key that
//     signs it is not the chat's or the lasting identity;
//   - a list that could not be read is not a list, on either platform;
//   - "Erase everything" turns it off first, or the erased list comes back.
{
  console.log("\nfavorites sync keeps its promises");
  const { createRequire } = await import("node:module");
  const sync = createRequire(import.meta.url)(R("src/favsync.js"));
  const src = readSrc("src/favsync.js"), bridge = readSrc("web/bridge.js"), mainSrc = readSrc("src/main.js");
  const F = (id) => ({ id, title: "Radio " + id, place: "Town", country: "Land", lat: 1, lon: 2, secure: true });
  const now = 1.7e12, gaps = [];
  const ids = (m) => m.favorites.map((f) => f.id).join(",");

  const first = sync.merge([F("a"), F("b"), F("c"), F("d")], {}, null, now);
  const lost = sync.merge([], first, first.items, now + 1000);
  if (ids(lost) !== "a,b,c,d" || Object.values(lost.items).some((a) => a.length === 1)) gaps.push("an emptied list un-stars the stations on every other device");
  const joined = sync.merge([F("z")], {}, first.items, now + 2000);
  if (!joined.favorites.some((f) => f.id === "z") || joined.favorites.length !== 5 || joined.removed) gaps.push("a device that joins loses the stars it had");
  const unstar = sync.merge([F("a"), F("b"), F("c")], first, first.items, now + 3000);
  const heard = sync.merge([F("a"), F("b"), F("c"), F("d")], first, unstar.items, now + 4000);
  if (ids(heard) !== "a,b,c" || heard.removed !== 1) gaps.push("an un-star does not reach the other device");
  const again = sync.merge([F("a"), F("b"), F("c"), F("d")], { seen: unstar.seen, gone: unstar.gone }, unstar.items, now + 5000);
  if (!again.favorites.some((f) => f.id === "d")) gaps.push("a station starred again after an un-star does not stay");
  const same = sync.merge([F("a"), F("b"), F("c"), F("d")], first, first.items, now + 6000);
  if (same.changedRemote || same.added || same.removed) gaps.push("a round with nothing new still writes to the relays");
  const junk = sync.merge([F("a")], {}, { x: "no", y: [NaN, "t"], ok: [now, "Good", "", "", null, null, 0] }, now);
  if (ids(junk) !== "a,ok") gaps.push("a malformed entry from a relay gets into the list");

  const k = sync.keys("11".repeat(32)), other = sync.keys("22".repeat(32));
  const sealed = await sync.seal({ v: 1, items: first.items }, k.key);
  if (JSON.stringify(await sync.open(sealed, k.key)) !== JSON.stringify(first.items)) gaps.push("a sealed list does not open with its own secret");
  if (await sync.open(sealed, other.key)) gaps.push("a sealed list opens with another secret");
  if (/Radio|Town/.test(sealed) || /Radio|Town/.test(Buffer.from(sealed, "base64").toString("latin1"))) gaps.push("station names are readable in what goes to the relay");
  if (/require\("\.\/(identity|presence-nostr|nostr-private)/.test(src)) gaps.push("the sync reaches for the chat's keys");
  if (!/openSync\(FILE, "w", 0o600\)/.test(src)) gaps.push("the secret's file is not private before it is written");
  if (/secret|code/.test((src.match(/const status = \(\) => \{[\s\S]*?\n\};/) || [""])[0].replace(/j\?\.|read\(\)/g, ""))) gaps.push("the status hands out the secret");
  if (!/if \(!Array\.isArray\(local\)\) return status\(\);/.test(src)) gaps.push("a round goes ahead with no list");
  if (!/favsync\.init\([\s\S]{0,700}?existsSync\([\s\S]{0,80}?"state\.json"\)\) \? \[\] : null/.test(mainSrc)) gaps.push("the desktop takes an unreadable state file for an empty list");
  if (!/if \(e\.newValue === null\) favsync\?\.stop\(\)/.test(bridge)) gaps.push("turning sync off in Settings does not reach the web app's main page");
  if (!/favsync\.stop\(\);[\s\S]{0,900}?save\(\{ prefs:/.test(readSrc("src/main/ipc-chat.js"))) gaps.push("the desktop's Erase leaves sync on");
  if (!/favsync\?\.stop\(\);[\s\S]{0,200}?write\("state", \{\}\)/.test(bridge)) gaps.push("the web app's Erase leaves sync on");
  if (!/onStateChanged\?\.\(\(s\) => \{[\s\S]{0,400}?favorites = next;/.test(readSrc("src/renderer/explore.js"))) gaps.push("the globe window does not take a list changed from elsewhere");
  gaps.length ? fail("favorites sync keeps its promises", gaps.join("; "))
    : pass("an empty list fills and never erases, a joining device keeps its stars, an un-star travels, the relay's copy is unreadable, and Erase turns it off");
}

// ── the chat counts who is here, not who is listening ───────────────────────
// 13 Oct 2026. The rail read "3 listening". The number is everyone the public
// relays show in that cell, and a relay carries other apps: the count never
// knew what anyone was doing. "Here" is the part that is true.
{
  const name = "the chat counts who is here, not who is listening";
  console.log(`\n${name}`);
  const chat = readSrc("src/renderer/explore-chat.js"), i18n = readSrc("src/i18n.js");
  const gaps = [];
  if (!/t\("chat\.count",\s*"here"\)/.test(chat)) gaps.push("the heading does not say \"here\"");
  if (/chat\.listeners?"/.test(chat + i18n)) gaps.push("\"listening\" is still a string for the count");
  const langs = (i18n.match(/"chat\.count":/g) || []).length;
  if (langs !== 5) gaps.push(`${langs} of 5 languages have the word`);
  gaps.length ? fail(name, gaps.join("; ")) : pass("\"3 here\", in five languages");
}

// ── a private message can notify, and nothing else does ─────────────────────
// 13 Oct 2026. New, and off unless asked for: a notification when a private
// message arrives and the app is not in front. The rules that matter are the
// ones that keep it from becoming something else: never the public room, never
// history replayed by a relay, never past the mute list or the word filter,
// never the text when previews are hidden, and never through a push service.
{
  const name = "a private message can notify, and nothing else does";
  console.log(`\n${name}`);
  const { createRequire } = await import("node:module");
  const req = createRequire(import.meta.url);
  const gaps = [];
  try {
    const N = req(R("src/notify.js"));
    let now = 10_000_000;
    const fresh = N.tracker([{ id: "old", unread: true, at: now }], () => now);
    const got = fresh([
      { id: "old", unread: true, at: now },                 // there before
      { id: "mine", mine: true, unread: false, at: now },   // sent by the listener
      { id: "read", unread: false, at: now },               // already read
      { id: "stale", unread: true, at: now - N.RECENT_MS - 1 },
      { id: "new", unread: true, at: now, from: "a1b2c3d4", text: "hello\n there" },
    ]).map((m) => m.id);
    if (got.join() !== "new") gaps.push(`of five messages it would notify for: ${got.join(", ") || "none"}`);
    if (fresh([{ id: "new", unread: true, at: now }]).length) gaps.push("the same message notifies twice");
    const open = N.words({ from: "a1b2c3d4", text: "hello\n there" });
    if (!/hello there/.test(open.body)) gaps.push("the message is not in the notification");
    const shut = N.words({ from: "a1b2c3d4", text: "the secret" }, { hidePreviews: true });
    if (/secret|a1b2c3d4/.test(shut.title + shut.body)) gaps.push("with previews hidden it still shows the text or the sender");
    if (req(R("src/prefs.js")).DEFAULTS.notify !== false) gaps.push("it is not off by default");
  } catch (e) { gaps.push(`src/notify.js did not run: ${e.message}`); }
  const main = readSrc("src/main.js"), web = readSrc("web/messaging.js"), sw = readSrc("web/sw.js");
  for (const [who, src] of [["the Mac", main], ["the web", web]]) {
    const hook = src.slice(src.indexOf("const freshDms = notify.tracker("), src.indexOf("const freshDms = notify.tracker(") + 1500);
    if (hook.length < 100) { gaps.push(`${who} never looks for a new private message`); continue; }
    if (!/freshDms\(clean\)/.test(hook) || !/const clean = visible\(list\)/.test(hook)) gaps.push(`on ${who} a muted person or a filtered word can still notify`);
    if (!/\.notify !== true/.test(hook)) gaps.push(`on ${who} it notifies without being asked to`);
    if (!/hidePreviews/.test(hook)) gaps.push(`on ${who} it ignores "Hide message text until opened"`);
  }
  if (!/explore\?\.isFocused\(\)/.test(main)) gaps.push("the Mac notifies with Explore in front");
  if (!/!document\.hidden/.test(web)) gaps.push("the web notifies with the page in sight");
  if (/addEventListener\(\s*["']push["']/.test(sw)) gaps.push("the service worker listens for a push, which needs a server that knows this device");
  if (!/notificationclick/.test(sw)) gaps.push("pressing the notification does nothing");
  if (/new Notification|showNotification/.test(readSrc("src/renderer/explore-chat.js"))) gaps.push("the public room raises notifications");
  const set = readSrc("src/renderer/settings.js");
  if (!/Notification\.requestPermission\(\)/.test(set) || !/Notification\.permission === "denied"/.test(set)) gaps.push("the switch never asks the browser, or does not say when it is blocked");
  gaps.length ? fail(name, gaps.join("; ")) : pass("off by default; new, unread, recent, inbound, past the mute list; no text when previews are hidden; no push service");
}

// ── a relay that drops is dialled again ─────────────────────────────────────
// A relay socket that closed left the list and nothing dialled it again: after
// the Wi-Fi blinked, a laptop slept or iOS put the page in the background,
// chat and presence were silent until the place changed. The beat now re-dials
// what is missing (heal() in src/presence-nostr.js), and a relay that stays
// down is tried less often each time. Fake relays, and the beat fired by hand.
{
  const name = "a relay that drops is dialled again";
  console.log(`\n${name}`);
  let made = 0, down = false;
  const live = [];
  class FakeRelay {
    constructor(url) {
      made++; this.url = url; this.readyState = 0; live.push(this);
      setTimeout(() => { if (down) this.close(); else { this.readyState = 1; this.onopen?.(); } }, 0);
    }
    send() {}
    close() { if (this.readyState === 3) return; this.readyState = 3; this.onclose?.(); }
  }
  const realWs = globalThis.WebSocket, realSet = globalThis.setInterval;
  const beats = [];
  globalThis.WebSocket = FakeRelay;
  // Record each interval instead of running it: the beat is fired by hand.
  globalThis.setInterval = (fn) => { beats.push(fn); return realSet(() => {}, 2 ** 30); };
  const tick = () => new Promise((r) => setTimeout(r, 30));
  let nostr = null;
  try {
    nostr = await import(pathToFileURL(R("src/presence-nostr.js")).href).then((m) => m.default ?? m);
    nostr.leave();
    nostr.join(38.72, -9.14, "test");
    await tick();
    const first = made, beat = beats.at(-1);
    const gaps = [];
    if (!first || !beat) gaps.push("joining dialled no relay, or set no beat — this check is blind");
    else {
      for (const w of [...live]) w.close();            // the network went away
      beat();
      await tick();
      const redialled = made - first;
      if (redialled < first) gaps.push(`after every relay dropped, the next beat dialled ${redialled} of ${first}`);
      down = true;                                      // and stays away
      for (const w of [...live]) w.close();
      beat(); await tick();
      const tried = made;
      beat(); await tick();
      if (made > tried) gaps.push(`a relay that stays down is dialled again on the very next beat (${made - tried} times)`);
    }
    gaps.length ? fail(name, gaps.join("; ")) : pass(`all ${first} relays are dialled again after they drop, and one that stays down waits longer each time`);
  } catch (e) {
    fail(name, `the module threw: ${e.message}`);
  } finally {
    try { nostr?.leave(); } catch {}
    globalThis.WebSocket = realWs; globalThis.setInterval = realSet;
  }
}

// ── a phone reads the busiest relays, not one per region ────────────────────
// Joining a place on the web opened 68 sockets: 8 near relays and 60 read-only
// ones, two per first-level cell. Fewer than half carried anyone. The web now
// reads the 12 busiest instead (setSpread; scripts/relays.mjs ranks them
// monthly): 20 sockets, and in a measured listen more people heard than the 68.
// Fake relays count what a join dials.
{
  const name = "a phone reads the busiest relays, not one per region";
  console.log(`\n${name}`);
  const gaps = [];
  const web = readSrc("web/messaging.js");
  const n = +(/nostr\.setSpread\((\d+)\)/.exec(web)?.[1] || 0);
  if (!n) gaps.push("web/messaging.js sets no spread, so the web dials the desktop's 60 read-only relays");
  else if (n > 16) gaps.push(`the web reads ${n} busy relays; more than 16 is the battery cost #72 removed`);
  const dir = JSON.parse(fs.readFileSync(R("data/relays.json"), "utf8"));
  const urls = new Set(dir.relays.map(([u]) => u));
  if (!(dir.busiest?.length >= 12)) gaps.push("data/relays.json ranks no busy relays (npm run relays -- --nip66)");
  else if (dir.busiest.some((u) => !urls.has(u))) gaps.push("a relay ranked busy is not in the directory");
  const dialled = [];
  class FakeRelay { constructor(url) { dialled.push(url); this.readyState = 0; } send() {} close() { this.readyState = 3; } }
  const realWs = globalThis.WebSocket;
  globalThis.WebSocket = FakeRelay;
  let nostr = null;
  try {
    nostr = await import(pathToFileURL(R("src/presence-nostr.js")).href).then((m) => m.default ?? m);
    const count = (sp) => { nostr.leave(); dialled.length = 0; nostr.setSpread(sp); nostr.join(38.72, -9.14, "test"); return dialled.slice(); };
    const desk = count(0), phone = n ? count(n) : [];
    if (n && phone.length > 8 + n) gaps.push(`a join on the web dials ${phone.length} relays`);
    if (n && dir.busiest && !dir.busiest.slice(0, n).every((u) => phone.includes(u))) gaps.push("the web does not read the busiest relays");
    if (desk.length <= phone.length) gaps.push(`the web dials as many relays as the desktop (${desk.length})`);
    gaps.length ? fail(name, gaps.join("; ")) : pass(`a join dials ${phone.length} relays on the web, the ${n} busiest among them, and ${desk.length} on the desktop`);
  } catch (e) {
    fail(name, `the module threw: ${e.message}`);
  } finally {
    try { nostr?.leave(); nostr?.setSpread(0); } catch {}
    globalThis.WebSocket = realWs;
  }
}

// ── a host never needs a licence ───────────────────────────────────────────
// Hosts are people who love music, not broadcasters with licences. So the
// studio's music opens on music whose licence already lets anyone play it on
// the air (src/main/ipc-cleared.js), the host's own files come second, and
// every show keeps a tracklist that credits what it played and tells listeners
// what is on (presence-nostr.js, setNowPlaying).
{
  const name = "a host never needs a licence: cleared music first, and a tracklist";
  console.log(`\n${name}`);
  const gaps = [];
  const { createRequire } = await import("node:module");
  const req = createRequire(import.meta.url);
  let allowed = null;
  try {
    const Module = req("node:module");
    const load = Module._load;
    Module._load = function (r, ...a) { return r === "electron" ? { ipcMain: { handle() {} }, net: { fetch } } : load.call(this, r, ...a); };
    try { allowed = req(R("src/main/ipc-cleared.js")).allowed; } finally { Module._load = load; }
  } catch (e) { gaps.push(`ipc-cleared.js did not load: ${e.message}`); }
  if (allowed) {
    const yes = ["https://creativecommons.org/licenses/by/4.0/", "http://creativecommons.org/licenses/by-sa/3.0/", "https://creativecommons.org/licenses/by/3.0/us/", "https://creativecommons.org/publicdomain/zero/1.0/", "http://creativecommons.org/publicdomain/mark/1.0/"];
    const no = ["https://creativecommons.org/licenses/by-nc/4.0/", "https://creativecommons.org/licenses/by-nd/4.0/", "https://creativecommons.org/licenses/by-nc-sa/3.0/", "https://creativecommons.org/licenses/by-nc-nd/2.5/", "https://example.com/licenses/by/4.0/", ""];
    const missed = yes.filter((u) => !allowed(u)), let_in = no.filter((u) => allowed(u));
    if (missed.length) gaps.push(`a licence that may go on air is refused: ${missed[0]}`);
    if (let_in.length) gaps.push(`a licence that may not go on air is let in: ${let_in[0] || "(none)"}`);
  }
  const st = readSrc("src/renderer/explore-studio.js");
  if (!/if \(!queue\.length\) \{\s*music\.append\([^;]*clearedPicker\(pick\)\);/.test(st)) gaps.push("the studio's music does not open on cleared music");
  if (!/if \(phase !== "off"\) logTrack\(next\.item\);/.test(st)) gaps.push("a track that starts during a show is not on its tracklist");
  if (!/if \(phase === "live"\) window\.auralfm\.studioNowPlaying\?\.\(/.test(st)) gaps.push("listeners are not told what the show is playing");
  // The heartbeat carries it: a live show's label event says what is on.
  const sent = [];
  class FakeRelay { constructor() { this.readyState = 0; setTimeout(() => { this.readyState = 1; this.onopen?.(); }, 0); } send(m) { sent.push(m); } close() { this.readyState = 3; } }
  const realWs = globalThis.WebSocket;
  globalThis.WebSocket = FakeRelay;
  let nostr = null;
  try {
    nostr = await import(pathToFileURL(R("src/presence-nostr.js")).href).then((m) => m.default ?? m);
    nostr.leave(); nostr.setNowPlaying("");
    nostr.join(-12.05, -77.04, "Test show", true);
    await new Promise((r) => setTimeout(r, 40));
    sent.length = 0;
    nostr.setNowPlaying("Artist — A record (CC BY 4.0)");
    await new Promise((r) => setTimeout(r, 40));
    const labels = sent.map((m) => { try { return JSON.parse(m); } catch { return null; } }).filter((m) => m?.[0] === "EVENT" && m[1]?.kind === 20808).map((m) => { try { return JSON.parse(m[1].content); } catch { return {}; } });
    if (!labels.some((c) => c.s === 1 && c.n === "Artist — A record (CC BY 4.0)")) gaps.push("a live show's heartbeat does not carry what it is playing");
  } catch (e) { gaps.push(`presence threw: ${e.message}`); }
  finally { try { nostr?.setNowPlaying(""); nostr?.leave(); } catch {} globalThis.WebSocket = realWs; }
  gaps.length ? fail(name, gaps.join("; "))
    : pass("the studio's music opens on CC BY, BY-SA and public-domain tracks only; each track joins the tracklist and goes to listeners with the show");
}

// ── a heartbeat heard again changes nothing ─────────────────────────────────
// The same heartbeat arrives once per relay, and every copy marked the list
// dirty, so "Show other listeners" flushed the whole world every 90 ms for as
// long as a relay was talking. Fake relays deliver the copies; the heartbeat
// still has to keep the peer alive, because the prune reads `at`.
{
  const name = "a heartbeat heard again changes nothing";
  console.log(`\n${name}`);
  const gaps = [];
  const made = [], beats = [];
  class FakeRelay {
    constructor(url) { this.url = url; this.readyState = 1; made.push(this); queueMicrotask(() => this.onopen?.()); }
    send() {} close() { this.readyState = 3; }
  }
  const realWs = globalThis.WebSocket, realSet = globalThis.setInterval, realNow = Date.now;
  globalThis.WebSocket = FakeRelay;
  globalThis.setInterval = (fn) => { beats.push(fn); return realSet(() => {}, 2 ** 30); };
  const settle = () => new Promise((r) => setTimeout(r, 130));
  let nostr = null;
  try {
    nostr = await import(pathToFileURL(R("src/presence-nostr.js")).href).then((m) => m.default ?? m);
    nostr.leave();
    let calls = 0, last = [];
    nostr.onPeers((list) => { calls++; last = list; });
    nostr.join(38.72, -9.14, "test");
    await settle();
    const pubkey = "ab".repeat(32);
    const hear = (e, relays = made) => { for (const w of relays) w.onmessage?.({ data: JSON.stringify(["EVENT", "s", { pubkey, ...e }]) }); };
    const beat = { kind: 20001, tags: [["g", "eyckr"]], content: "" };
    if (!made.length) gaps.push("joining dialled no relay, so this check is blind");
    hear(beat);
    await settle();
    if (last.length !== 1) gaps.push(`a stranger's heartbeat gave a list of ${last.length}`);
    const before = calls;
    hear(beat); hear(beat);
    await settle();
    if (calls !== before) gaps.push(`the same heartbeat again redrew the listeners ${calls - before} more time(s)`);
    hear({ ...beat, tags: [["g", "gcpvj"]] }, made.slice(0, 1));
    await settle();
    if (calls === before || last[0]?.geohash !== "gcpvj") gaps.push("a listener who moved cell was not redrawn");
    const moved = calls;
    hear({ kind: 20808, tags: [["g", "gcpvj"]], content: JSON.stringify({ l: "Night show", s: 1, n: "A record" }) }, made.slice(0, 1));
    await settle();
    if (calls === moved || !last[0]?.live) gaps.push("a listener going live was not redrawn");
    // Three minutes apart, twice: the second is the only thing keeping them here.
    const t0 = realNow();
    Date.now = () => t0 + 3 * 60_000;
    hear({ ...beat, tags: [["g", "gcpvj"]] });
    Date.now = () => t0 + 6 * 60_000;
    beats.at(-1)?.();
    await settle();
    if (last.length !== 1) gaps.push("a listener still sending heartbeats was dropped as stale");
    gaps.length ? fail(name, gaps.join("; ")) : pass("copies of a heartbeat are silent; a move or a show going live is not, and a heartbeat still keeps a listener here");
  } catch (e) {
    fail(name, `the module threw: ${e.message}`);
  } finally {
    try { nostr?.leave(); nostr?.onPeers(() => {}); } catch {}
    globalThis.WebSocket = realWs; globalThis.setInterval = realSet; Date.now = realNow;
  }
}
