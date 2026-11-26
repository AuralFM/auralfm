/** The audit: Presence, chat, notes, private messages, hubs, relays and favourites sync. */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { R, fail, pass, skip, HAS_CAT, C, NO_CAT, main, exploreSrc, readSrc, strings, LANGUAGES, en, signNostr } from "./lib.mjs";

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
    // A stranger's key, or it is discarded as our own echoed back; signed, or
    // it is discarded as forged.
    NOTE = signNostr({ kind: 1, tags: [["g", nostr.geohash(LAT, LON)], ["n", "yuls"]], content: "hola" }, "note");
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
  if (!/openSync\(tmp, "w", 0o600\)/.test(src)) gaps.push("the secret's file is not private before it is written");
  // Written beside and renamed: a save cut short leaves the old code, not an
  // empty file. No relays, so no round reaches the network.
  {
    const os = await import("node:os");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "favsync-"));
    const realWrite = fs.writeFileSync;
    try {
      sync.init(dir, { get: () => [] }, { relays: [] });
      await sync.start();
      const code = sync.code();
      // The disk fills halfway through the next save of the secret's file.
      fs.writeFileSync = (f, ...a) => { if (typeof f === "number") throw new Error("disk full"); return realWrite(f, ...a); };
      await sync.join(sync.TAG + "B".repeat(43)).catch(() => {});
      fs.writeFileSync = realWrite;
      if (!code || sync.code() !== code) gaps.push("a save cut short loses the sync code");
      if ((fs.statSync(path.join(dir, "favsync.json")).mode & 0o777) !== 0o600) gaps.push("the secret's file is readable by others");
    } finally { fs.writeFileSync = realWrite; sync.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
  }
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

// ── chat can be found, and what it says is so ───────────────────────────────
// 22 Nov 2026. The desktop's chat is off until it is turned on, behind a switch
// named for something else ("Show other listeners"): with it off there was no
// sign that the app had a chat. Two more, from driving two copies of the app
// against a relay of their own: a room read "nobody else yet" over a message
// until its author's next heartbeat, and a nickname with a space could not be
// addressed ("/msg Night Owl hello" found nobody, or sent "Owl hello").
{
  const name = "chat can be found, and what it says is so";
  console.log(`\n${name}`);
  const gaps = [];
  const chat = readSrc("src/renderer/explore-chat.js"), html = readSrc("src/renderer/explore.html"), rooms = readSrc("src/renderer/explore-rooms.js");
  const req = (await import("node:module")).createRequire(import.meta.url);

  // The card: off stays the default, and only the button turns it on.
  if (req(R("src/prefs.js")).DEFAULTS.presence !== false) gaps.push("the desktop's chat is on without being asked");
  if (!/id="chatoff"[\s\S]{0,900}?id="chatoffgo"[\s\S]{0,300}?id="chatoffno"/.test(html)) gaps.push("there is no way into chat on the page while it is off");
  if (!/\.chatoff\[hidden\]/.test(html)) gaps.push("the card cannot be hidden: its display beats the attribute");
  const fn = (chat.match(/function paintChatOff\(prefs, at\) \{[\s\S]*?\n\}/) || [""])[0];
  if (!fn || !/paintChatOff\(prefs, at\);/.test(chat)) gaps.push("the card is never painted");
  else {
    const run = (prefs, at, no) => {
      const card = { hidden: null };
      new Function("$", "localStorage", "CHATOFF_KEY", `${fn}; return paintChatOff;`)(() => card, { getItem: () => (no ? "1" : null) }, "k")(prefs, at);
      return !card.hidden;
    };
    const at = { lat: 1, lon: 2 };
    if (!run({ presence: false }, at)) gaps.push("with chat off and a station playing, nothing says so");
    if (run({ presence: true }, at)) gaps.push("the card shows over a chat that is on");
    if (run({ presence: false }, null) || run({ presence: false }, { title: "x" })) gaps.push("the card shows where no room could open");
    if (run({ presence: false }, at, true)) gaps.push("“Not now” is asked again");
    if (run(null, at)) gaps.push("the card shows before the preferences are known");
  }

  // The name and the words.
  const split = (rooms.match(/function splitName\(rest\) \{[\s\S]*?\n\}/) || [""])[0];
  if (!split) gaps.push("a nickname with a space cannot be addressed");
  else {
    const f = new Function("roster", `${split}; return splitName;`)(() => [{ nick: "Night" }, { nick: "Night Owl" }, { nick: null }, { nick: "Zoë" }]);
    for (const [t, want] of [["Night Owl hello there", "Night Owl|hello there"], ["@night owl", "night owl|"], ["Night Owls", "Night|Owls"], ["Zoë hi", "Zoë|hi"], ["a1b2c3d4 hi", "a1b2c3d4|hi"], ["", "|"]]) {
      if (f(t).join("|") !== want) gaps.push(`"${t}" reads as ${f(t).join(" | ")}`);
    }
  }
  const cmds = readSrc("src/renderer/explore-commands.js");
  if ((cmds.match(/splitName\(/g) || []).length < 3 || /matchOne\(\(rest\[0\]/.test(cmds)) gaps.push("the composer still takes the first word for the name");

  // Speaking is being here.
  const realWs = globalThis.WebSocket;
  let nostr = null;
  const live = [];
  globalThis.WebSocket = class {
    constructor(url) { this.url = url; this.readyState = 0; live.push(this); setTimeout(() => { this.readyState = 1; this.onopen?.(); }, 0); }
    send() {}
    close() { if (this.readyState === 3) return; this.readyState = 3; this.onclose?.(); }
  };
  const tick = () => new Promise((r) => setTimeout(r, 30));
  try {
    nostr = await import(pathToFileURL(R("src/presence-nostr.js")).href).then((m) => m.default ?? m);
    nostr.leave(); nostr.join(38.72, -9.14, "test"); await tick();
    const cell = nostr.stats().cell, now = Math.floor(Date.now() / 1000);
    const said = (n, at) => live[0].onmessage({ data: JSON.stringify(["EVENT", "auralfm", signNostr({ kind: 20000, created_at: at, tags: [["g", cell]], content: "hello" }, n)]) });
    said("a", now);
    if (nostr.stats().peers !== 1) gaps.push("somebody who has just spoken here is not counted as here");
    said("b", now - 3600);
    if (nostr.stats().peers !== 1) gaps.push("somebody who spoke an hour ago is counted as here");
    if (nostr.stats().messages !== 2) gaps.push("a message was lost: this check is blind");
  } catch (e) { gaps.push(`the module threw: ${e.message}`); } finally { try { nostr?.leave(); } catch {} globalThis.WebSocket = realWs; }

  // A station asked for before the player is ready is not talked over by the last one.
  if (!/if \(state\.lastChannel && !current\) \{\s*current = state\.lastChannel;/.test(readSrc("src/renderer/popover.js"))) gaps.push("the player's start-up says “Press play” over a station already playing");

  // One number on each step of Your show.
  const studio = readSrc("src/renderer/explore-studio.js");
  const tab = studio.slice(studio.indexOf('class: "sttab"'), studio.indexOf("body.append(tabs)"));
  if (!tab || (tab.match(/String\(/g) || []).filter(Boolean).length !== 2 || /stleft/.test(studio)) gaps.push("a step of Your show carries a second number (“3 Go live 3”)");
  gaps.length ? fail(name, gaps.join("; "))
    : pass("off by default with a way in on the page, asked once; names with spaces work; a speaker is counted; one number a step");
}

// ── a relay cannot speak for somebody else ──────────────────────────────────
// Public chat, notes, presence and profiles were taken from relays without
// checking the id or the signature; only private messages were checked. Any
// relay could post under a kept contact's key (past "only people you keep") or
// name an id of zeros (past the work floor). Real signatures, a fake relay.
{
  const name = "a relay cannot speak for somebody else";
  console.log(`\n${name}`);
  const gaps = [];
  const realWs = globalThis.WebSocket;
  const live = [];
  globalThis.WebSocket = class {
    constructor(url) { this.url = url; this.readyState = 0; live.push(this); setTimeout(() => { this.readyState = 1; this.onopen?.(); }, 0); }
    send() {}
    close() { if (this.readyState === 3) return; this.readyState = 3; this.onclose?.(); }
  };
  let nostr = null;
  try {
    nostr = await import(pathToFileURL(R("src/presence-nostr.js")).href).then((m) => m.default ?? m);
    nostr.leave(); nostr.join(38.72, -9.14, "test");
    await new Promise((r) => setTimeout(r, 30));
    const cell = nostr.stats().cell;
    const real = signNostr({ kind: 20000, tags: [["g", cell]], content: "hello" }, "kept");
    const other = signNostr({ kind: 20000, tags: [["g", cell]], content: "x" }, "someone");
    const forged = {
      "changed words": { ...real, content: "send me your code" },
      "another key's name": { ...real, pubkey: other.pubkey },
      "an id of zeros": { ...real, id: "0".repeat(64) },
      "no signature": { ...real, sig: undefined },
    };
    for (const [what, e] of Object.entries(forged)) if (nostr.authentic(e)) gaps.push(`an event with ${what} reads as genuine`);
    if (!nostr.authentic(real)) gaps.push("a genuine event reads as forged");
    const hear = (e) => live[0].onmessage({ data: JSON.stringify(["EVENT", "s", e]) });
    const before = nostr.stats().messages;
    for (const e of Object.values(forged)) hear(e);
    if (nostr.stats().messages !== before) gaps.push(`${nostr.stats().messages - before} forged message(s) reached the room`);
    hear(real);
    if (nostr.stats().messages !== before + 1) gaps.push("the genuine message did not reach the room: this check is blind");
    // A heartbeat in this room under somebody else's key adds nobody.
    const peersBefore = nostr.stats().peers;
    const beat = signNostr({ kind: 20001, tags: [["g", cell]], content: "" }, "liar");
    hear({ ...beat, pubkey: signNostr({ kind: 1 }, "kept-elsewhere").pubkey });
    if (nostr.stats().peers !== peersBefore) gaps.push("a forged heartbeat added a listener to the room");
    hear(beat);
    if (nostr.stats().peers !== peersBefore + 1) gaps.push("a genuine heartbeat added nobody: this check is blind");
  } catch (e) { gaps.push(`the module threw: ${e.message}`); } finally { try { nostr?.leave(); } catch {} globalThis.WebSocket = realWs; }
  gaps.length ? fail(name, gaps.join("; ")) : pass("changed words, another key, a made-up id and no signature are all dropped; a genuine message arrives");
}

// ── a relay a network blocks is left alone ──────────────────────────────────
// 22 Nov 2026. AT&T's home network protection resets relay.damus.io as malware
// and warns the account holder each time. It was one of the three relays that
// hold the favorites, every round dialled it again, and a round ran on every
// station picked while Lock was on: setLocked sent the whole state back, so the
// favorites counted as changed. Fake relays, and the real rounds over them.
{
  const name = "a relay a network blocks is left alone";
  console.log(`\n${name}`);
  const { createRequire } = await import("node:module");
  const os = await import("node:os");
  const sync = createRequire(import.meta.url)(R("src/favsync.js"));
  const gaps = [], BLOCKED = "relay.damus.io";
  const hosts = sync.RELAYS.map((u) => new URL(u).host);
  if (hosts.includes(BLOCKED)) gaps.push(`favorites sync still dials ${BLOCKED}`);
  // Every relay found blocked, where the directory is made and in what ships.
  const listed = [...((readSrc("scripts/relays.mjs").match(/const BLOCKED = new Set\(\[([\s\S]*?)\]\)/) || ["", ""])[1]).matchAll(/"([a-z0-9.-]+)"/g)].map((m) => m[1]);
  const dirNow = JSON.parse(fs.readFileSync(R("data/relays.json"), "utf8"));
  const offered = new Set([...dirNow.relays.map(([u]) => u), ...(dirNow.busiest || [])].map((u) => new URL(u.replace(/^ws/, "http")).hostname));
  for (const h of [BLOCKED, "relay.bulbasaur.fun", "nostr.mom", "relay.nostr.com"]) if (!listed.includes(h)) gaps.push(`${h} is not on the directory builder's blocked list`);
  for (const h of listed) {
    if (offered.has(h)) gaps.push(`the chat's directory still offers ${h}`);
    if (hosts.includes(h) || readSrc("src/presence-nostr.js").includes(`"wss://${h}"`)) gaps.push(`${h} is dialled by name`);
  }
  if (hosts.length < 3) gaps.push(`the list is held by ${hosts.length} relays, not three`);
  const said = (readSrc("docs/PRIVACY.md").match(/to three public relays \(([\s\S]*?)\)/) || ["", ""])[1].split(/,|\band\b/).map((x) => x.trim()).filter(Boolean);
  if ([...said].sort().join() !== [...hosts].sort().join()) gaps.push(`PRIVACY.md names ${said.join(", ") || "none"}; the app dials ${hosts.join(", ")}`);
  if (!/const starred =[\s\S]{0,800}if \(ok && starred\) favsync\.touch\(\)/.test(readSrc("src/main/ipc-app.js"))) gaps.push("the desktop syncs when the favorites are sent, changed or not");
  if (!/const starred =[\s\S]{0,300}if \(starred\) favsync\?\.touch\(\)/.test(readSrc("web/bridge.js"))) gaps.push("the web app syncs when the favorites are sent, changed or not");

  const refuse = new Set(), dialled = [];
  class FakeRelay {
    constructor(url) {
      dialled.push(url); this.readyState = 0;
      setTimeout(() => { if (refuse.has(url)) { this.readyState = 3; this.onerror?.(); this.onclose?.(); } else { this.readyState = 1; this.onopen?.(); } }, 0);
    }
    send(text) {
      const m = JSON.parse(text);
      setTimeout(() => this.onmessage?.({ data: JSON.stringify(m[0] === "REQ" ? ["EOSE", m[1]] : ["OK", m[1].id, true, ""]) }), 0);
    }
    close() { if (this.readyState === 3) return; this.readyState = 3; this.onclose?.(); }
  }
  const realWs = globalThis.WebSocket, realNow = Date.now;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "auralfm-sync-"));
  let skew = 0;
  globalThis.WebSocket = FakeRelay;
  Date.now = () => realNow() + skew;
  const three = ["wss://a.test", "wss://b.test", "wss://blocked.test"];
  const pass1 = async () => { dialled.length = 0; await sync.sync(); return dialled.map((u) => new URL(u).hostname.split(".")[0]).sort().join(","); };
  try {
    sync.init(dir, { get: () => [], set: () => {}, changed: () => {} }, { relays: three });
    await sync.start();
    if (dialled.length !== 3) gaps.push(`the first round dialled ${dialled.length} of 3 relays: this check is blind`);
    refuse.add("wss://blocked.test");
    await pass1();
    const next = await pass1();
    if (next !== "a,b") gaps.push(`the round after a refusal dialled ${next}`);
    skew += 11 * 60e3;
    if (await pass1() !== "a,b,blocked") gaps.push("a relay that was refused is never tried again");
    skew += 11 * 60e3;
    if (await pass1() !== "a,b") gaps.push("a relay refused twice is not left alone for longer");
    skew += 24 * 3600e3;
    refuse.clear();
    await pass1();
    if (await pass1() !== "a,b,blocked") gaps.push("a relay that answers again is still left alone");
    refuse.add("wss://blocked.test");
    await pass1();
    skew += 11 * 60e3;
    if (await pass1() !== "a,b,blocked") gaps.push("a relay that answered again is still held to its old wait");
    // Offline: nothing answers, and no relay is to blame.
    for (const u of three) refuse.add(u);
    await pass1();
    refuse.clear();
    if (await pass1() !== "a,b,blocked") gaps.push("a device that was offline comes back to fewer relays");
  } catch (e) {
    gaps.push(`the module threw: ${e.message}`);
  } finally {
    try { sync.stop(); } catch {}
    globalThis.WebSocket = realWs; Date.now = realNow;
    fs.rmSync(dir, { recursive: true, force: true });
  }
  gaps.length ? fail(name, gaps.join("; "))
    : pass(`the list is held by ${hosts.join(", ")}, as PRIVACY.md says; a relay refused alone waits 10 minutes, then longer; being offline blames none`);
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

// ── a relay that goes quiet is dialled again ────────────────────────────────
// heal() dialled what had closed, and a socket the network lost without a word
// has not closed: it reads as open until TCP gives up, minutes later. A phone
// back from sleep, or moved off its Wi-Fi, sat in a room that read as connected
// and heard nothing. A relay silent past the idle time is now asked for an
// event nobody can have; no answer in ten seconds drops it and dials again.
// The probe is never the live subscription sent again, which a relay answers
// with six hours of the cell. Fake relays, the beat fired by hand, the clock
// moved, and the probe's own deadline run by hand.
{
  const name = "a relay that goes quiet is dialled again";
  console.log(`\n${name}`);
  let made = 0, answers = true;
  const live = [], frames = [];
  class FakeRelay {
    constructor(url) {
      made++; this.url = url; this.readyState = 0; live.push(this);
      setTimeout(() => { this.readyState = 1; this.onopen?.(); }, 0);
    }
    send(text) {
      const f = JSON.parse(text);
      frames.push({ w: this, f });
      if (answers && f[0] === "REQ" && f[2]?.ids) setTimeout(() => this.onmessage?.({ data: JSON.stringify(["EOSE", f[1]]) }), 0);
    }
    close() { if (this.readyState === 3) return; this.readyState = 3; this.onclose?.(); }
  }
  const realWs = globalThis.WebSocket, realSet = globalThis.setInterval, realNow = Date.now, realTimer = globalThis.setTimeout, realClear = globalThis.clearTimeout;
  const beats = [];
  let deadlines = [];
  let skew = 0;
  globalThis.WebSocket = FakeRelay;
  globalThis.setInterval = (fn) => { beats.push(fn); return realSet(() => {}, 2 ** 30); };
  Date.now = () => realNow() + skew;
  // The probe's ten seconds are kept to be run by hand; every other timer runs.
  // An answered probe cancels its deadline, so a kept one must be cancellable.
  globalThis.setTimeout = (fn, ms, ...a) => {
    if (ms !== 10_000) return realTimer(fn, ms, ...a);
    const d = { fn, unref() {} };
    deadlines.push(d);
    return d;
  };
  globalThis.clearTimeout = (t) => { deadlines = deadlines.filter((d) => d !== t); if (!deadlines.includes(t)) realClear(t); };
  const runDeadlines = () => { const due = deadlines; deadlines = []; for (const d of due) d.fn(); };
  const tick = () => new Promise((r) => realTimer(r, 30));
  const probes = () => frames.filter(({ f }) => f[0] === "REQ" && f[2]?.ids);
  let nostr = null;
  const gaps = [];
  try {
    nostr = await import(pathToFileURL(R("src/presence-nostr.js")).href).then((m) => m.default ?? m);
    nostr.leave();
    nostr.join(38.72, -9.14, "test");
    await tick();
    const first = made, beat = beats.at(-1);
    if (!first || !beat) gaps.push("joining dialled no relay, or set no beat — this check is blind");
    else {
      frames.length = 0;
      beat(); await tick();
      if (probes().length) gaps.push(`${probes().length} relays that spoke a moment ago were probed`);
      // A minute of silence, and relays that answer.
      skew += 60_000; frames.length = 0;
      beat(); await tick();
      const asked = probes().length;
      if (asked < first) gaps.push(`after a minute of silence ${asked} of ${first} relays were probed`);
      if (frames.some(({ f }) => f[0] === "REQ" && f[1] === "auralfm")) gaps.push("the beat sent the live subscription again, which replays the cell's history");
      if (!frames.some(({ f }) => f[0] === "CLOSE")) gaps.push("an answered probe is left open on the relay");
      runDeadlines();
      await tick();
      if (made !== first) gaps.push(`relays that answered their probe were dropped (${made - first} dialled again)`);
      // A minute more, and relays that say nothing.
      answers = false; skew += 60_000; frames.length = 0;
      beat(); await tick();
      beat(); await tick();
      const once = probes().length;
      if (once > first) gaps.push(`a probe still waiting was sent again (${once} probes to ${first} relays)`);
      const quiet = new Set(probes().map(({ w }) => w));
      runDeadlines();
      await tick();
      if (made - first < quiet.size) gaps.push(`of ${quiet.size} relays that never answered, ${made - first} were dialled again`);
      if ([...quiet].some((w) => w.readyState !== 3)) gaps.push("a relay that never answered is left open");
    }
    gaps.length ? fail(name, gaps.join("; ")) : pass(`all ${first} relays are probed after a minute of silence with an id nobody has; the answered stay, the silent are dialled again in ten seconds`);
  } catch (e) {
    fail(name, `the module threw: ${e.message}`);
  } finally {
    try { nostr?.leave(); } catch {}
    globalThis.WebSocket = realWs; globalThis.setInterval = realSet; Date.now = realNow; globalThis.setTimeout = realTimer; globalThis.clearTimeout = realClear;
  }
}

// ── favorites take the newest note, not the first one back ──────────────────
// A round reads the note from every relay and keeps the newest copy any of them
// holds. Ending on the first relay to answer would let the fastest one decide,
// and an empty or out-of-date relay answers fastest, having least to send. Two
// fake relays: the quick one holds last week's list, the slow one today's.
{
  const name = "favorites take the newest note, not the first one back";
  console.log(`\n${name}`);
  const { createRequire } = await import("node:module");
  const os = await import("node:os");
  const sync = createRequire(import.meta.url)(R("src/favsync.js"));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "auralfm-newest-"));
  const notes = new Map();          // relay → [delay ms, event]
  class FakeRelay {
    constructor(url) { this.url = url; this.readyState = 0; setTimeout(() => { this.readyState = 1; this.onopen?.(); }, 0); }
    send(text) {
      const m = JSON.parse(text);
      if (m[0] !== "REQ") return void setTimeout(() => this.onmessage?.({ data: JSON.stringify(["OK", m[1].id, true, ""]) }), 0);
      const [delay, evt] = notes.get(this.url) || [0, null];
      setTimeout(() => {
        if (evt) this.onmessage?.({ data: JSON.stringify(["EVENT", m[1], evt]) });
        this.onmessage?.({ data: JSON.stringify(["EOSE", m[1]]) });
      }, delay);
    }
    close() { if (this.readyState === 3) return; this.readyState = 3; this.onclose?.(); }
  }
  const realWs = globalThis.WebSocket;
  globalThis.WebSocket = FakeRelay;
  let got = null;
  const gaps = [];
  try {
    sync.init(dir, { get: () => [], set: (list) => { got = list; }, changed: () => {} }, { relays: ["wss://quick.test", "wss://slow.test"] });
    await sync.start();
    const { secret } = JSON.parse(fs.readFileSync(path.join(dir, "favsync.json"), "utf8"));
    const k = sync.keys(secret);
    const st = (t, title) => [t, title, "", "", null, null, 1];
    const now = Math.floor(Date.now() / 1000);
    const note = async (at, items) => ({ kind: 30078, pubkey: k.pk, created_at: at, id: createHash("sha256").update(String(at)).digest("hex"), tags: [["d", "auralfm:favorites"]], content: await sync.seal({ v: 1, items }, k.key) });
    notes.set("wss://quick.test", [0, await note(now - 7 * 86400, { a: st(1, "Old") })]);
    notes.set("wss://slow.test", [300, await note(now, { a: st(1, "Old"), b: st(2, "New") })]);
    got = null;
    await sync.sync();
    const ids = (got || []).map((f) => f.id).sort().join(",");
    if (ids !== "a,b") gaps.push(`the round kept ${ids || "nothing"}, the quick relay's old list, not the slow relay's newer one`);
  } catch (e) {
    gaps.push(`the module threw: ${e.message}`);
  } finally {
    try { sync.stop(); } catch {}
    globalThis.WebSocket = realWs;
    fs.rmSync(dir, { recursive: true, force: true });
  }
  gaps.length ? fail(name, gaps.join("; ")) : pass("a round waits for every relay and keeps the newest note, however late it arrives");
}

// ── a listener gone quiet gives the place back ──────────────────────────────
// The host ended a listener's connection on `failed` or `closed` and nothing
// else. A browser need never move on from `disconnected`, so a listener whose
// network went away (and so could not say bye) held one of the twelve places
// for the rest of the show. stall() (explore-shows.js) ends one that stays
// `disconnected` for fifteen seconds; run here on a fake connection with the
// wait shortened, then checked to be wired into the studio. The listener's own
// side asks again after five seconds (lost(), explore-shows.js).
{
  const name = "a listener gone quiet gives the place back";
  console.log(`\n${name}`);
  const gaps = [];
  const shows = readSrc("src/renderer/explore-shows.js"), studio = readSrc("src/renderer/explore-studio.js");
  const src = (shows.match(/function stall\(pc, dead, ms = DISCONNECTED_MS\) \{[\s\S]*?\n  \}/) || [])[0];
  if (!src) gaps.push("stall() is not in explore-shows.js");
  else {
    const stall = new Function("DISCONNECTED_MS", `${src}; return stall;`)(15_000);
    const fake = () => {
      const pc = new EventTarget();
      pc.connectionState = "new";
      pc.go = (s) => { pc.connectionState = s; pc.dispatchEvent(new Event("connectionstatechange")); };
      return pc;
    };
    const run = async (steps) => {
      const pc = fake();
      let ended = 0;
      stall(pc, () => ended++, 40);
      for (const s of steps) { if (s === "wait") await new Promise((r) => setTimeout(r, 30)); else if (s === "close") pc.connectionState = "closed"; else pc.go(s); }
      await new Promise((r) => setTimeout(r, 80));
      return ended;
    };
    if (await run(["connected", "disconnected"]) !== 1) gaps.push("a connection that stays disconnected is never ended");
    if (await run(["connected", "disconnected", "wait", "connected"]) !== 0) gaps.push("a connection that mended is ended anyway");
    if (await run(["connected", "disconnected", "close"]) !== 0) gaps.push("a connection closed while quiet is ended a second time");
    if (await run(["connected", "disconnected", "wait", "disconnected"]) > 1) gaps.push("one quiet connection is ended twice");
  }
  if (!/window\.AuralRtc\.stall\(pc, \(\) => \{\s*if \(heard\.get\(msg\.sid\)\?\.pc !== pc\) return;\s*window\.AuralRtc\.send\(from, \{ t: "bye"[\s\S]{0,80}dropListener\(msg\.sid\)/.test(studio)) gaps.push("the host keeps a place for a listener gone quiet");
  gaps.length ? fail(name, gaps.join("; ")) : pass("a listener quiet for fifteen seconds is told bye and its place given back; one that mends or closes is left alone");
}

// ── a report about a child goes where the law says ──────────────────────────
// 24 Nov 2026. AuralFM is registered with NCMEC's CyberTipline. The report
// drafts (desktop and web) tell the person not to attach the material and to
// report it there; the terms, the code of conduct and the privacy policy say
// that AuralFM is registered and reports what it learns. A draft that asked
// for a screenshot of everything would ask for a copy of the worst of it.
{
  const name = "a report about a child goes where the law says";
  console.log(`\n${name}`);
  const gaps = [];
  for (const f of ["src/main/ipc-chat.js", "web/messaging.js"]) {
    const src = readSrc(f);
    if (!/do not attach or forward the material/.test(src) || !src.includes("at report.cybertip.org (NCMEC)")) gaps.push(`${f}'s report draft does not send a child's case to the CyberTipline`);
  }
  for (const [f, words] of [["docs/TERMS.md", /registered with the CyberTipline/], ["docs/CODE-OF-CONDUCT.md", /CyberTipline, with which AuralFM is\s+registered/], ["docs/PRIVACY.md", /passed to NCMEC's\s+CyberTipline/]]) {
    if (!words.test(readSrc(f))) gaps.push(`${f} does not say AuralFM is registered with the CyberTipline`);
  }
  if (/CYBERTIP\d|cybertip.*(password|passwd|user(name)?)\s*[:=]/i.test(["src/main/ipc-chat.js", "web/messaging.js", "docs/TERMS.md", "docs/PRIVACY.md", "docs/CODE-OF-CONDUCT.md"].map(readSrc).join("\n"))) gaps.push("a CyberTipline credential is written in the repository");
  gaps.length ? fail(name, gaps.join("; ")) : pass("both report drafts point a child's case to the CyberTipline, and the three policies say AuralFM is registered");
}

// ── chat leaves a refused relay alone ───────────────────────────────────────
// 22 Nov 2026. A home network that blocks a relay resets it every time it is
// dialled, and AT&T's warns the account holder. Changing station dials afresh
// and took no notice of what had failed, so a blocked relay was dialled on
// every station. Fake relays; one resets at once, as a block does, and the
// clock is moved on by hand.
{
  const name = "chat leaves a refused relay alone";
  console.log(`\n${name}`);
  const realWs = globalThis.WebSocket, realNow = Date.now, realTimer = globalThis.setTimeout;
  let skew = 0, offline = false, made = [];
  const block = new Set(), hang = new Set(), live = [], beats = [], realEvery = globalThis.setInterval;
  globalThis.setInterval = (fn) => { beats.push(fn); return realEvery(() => {}, 2 ** 30); };
  // The judging wait is run at once; the fakes' own ticks are real.
  globalThis.setTimeout = (fn, ms, ...a) => realTimer(fn, ms >= 1000 ? 60 : ms, ...a);
  Date.now = () => realNow() + skew;
  globalThis.WebSocket = class {
    constructor(url) {
      made.push(url); live.push(this); this.readyState = 0;
      const bad = offline || block.has(url);
      realTimer(() => { if (this.readyState !== 0) return; if (bad) { this.readyState = 3; this.onerror?.(); this.onclose?.(); } else if (!hang.has(url)) { this.readyState = 1; this.onopen?.(); } }, bad ? 0 : 20);
    }
    send() {}
    close() { if (this.readyState === 3) return; this.readyState = 3; this.onclose?.(); }
  };
  const wait = (ms) => new Promise((r) => realTimer(r, ms));
  let nostr = null;
  try {
    nostr = await import(pathToFileURL(R("src/presence-nostr.js")).href).then((m) => m.default ?? m);
    const gaps = [];
    const visit = async (lat, lon) => { nostr.leave(); made = []; nostr.join(lat, lon, "t"); await wait(140); return made.slice(); };
    nostr.setSpread(0);
    const first = await visit(-33.87, 151.2);
    const victim = first[4];
    if (!victim) gaps.push("a join dialled too few relays: this check is blind");
    block.add(victim);
    if (!(await visit(-33.87, 151.2)).includes(victim)) gaps.push("a relay that had opened is not dialled: this check is blind");
    if ((await visit(-33.87, 151.2)).includes(victim)) gaps.push("a blocked relay is dialled again on the next station");
    if ((await visit(-33.87, 151.2)).length !== first.length - 1) gaps.push("relays other than the blocked one are left alone too");
    skew += 31 * 60e3;
    if (!(await visit(-33.87, 151.2)).includes(victim)) gaps.push("a refused relay is never tried again");
    skew += 31 * 60e3;
    if ((await visit(-33.87, 151.2)).includes(victim)) gaps.push("a relay refused twice is not left alone for longer");
    skew += 8 * 24 * 3600e3; block.clear();
    if (!(await visit(-33.87, 151.2)).includes(victim)) gaps.push("a relay is left alone for more than a week");
    if ((await visit(-33.87, 151.2)).length !== first.length) gaps.push("a relay that answers again is still left alone");
    // Offline: none open, none to blame.
    offline = true; await visit(-33.87, 151.2); offline = false;
    if ((await visit(-33.87, 151.2)).length !== first.length) gaps.push("being offline is held against the relays");
    // Leaving while they are still opening is us hanging up, not a refusal.
    hang.add(victim); await visit(-33.87, 151.2); nostr.leave(); await wait(100); hang.clear();
    if ((await visit(-33.87, 151.2)).length !== first.length) gaps.push("hanging up is held against the relays");
    // The network goes and comes back: every retry failed, and none is to blame.
    const beat = beats.at(-1);
    offline = true; for (const w of [...live]) if (w.readyState === 1) w.close();
    skew += 21e3; beat(); await wait(140);
    offline = false; skew += 11 * 60e3; made = []; beat(); await wait(140);
    if (made.length !== first.length) gaps.push(`after the network came back, ${made.length} of ${first.length} relays were dialled`);
    // A blocked one is left alone by the beat too, not only by a change of station.
    block.add(victim); await visit(-33.87, 151.2); skew += 21e3; made = []; beats.at(-1)(); await wait(140);
    if (made.includes(victim)) gaps.push("the beat dials a relay that was refused");
    // Once it has answered, a new refusal starts from the beginning.
    block.clear(); skew += 8 * 24 * 3600e3; await visit(-33.87, 151.2);
    block.add(victim); await visit(-33.87, 151.2); skew += 31 * 60e3;
    if (!(await visit(-33.87, 151.2)).includes(victim)) gaps.push("a relay that answered is still held to its old wait");
    // However many times, a week at the most.
    for (let i = 0; i < 14; i++) { skew += 8 * 24 * 3600e3; await visit(-33.87, 151.2); }
    skew += 8 * 24 * 3600e3;
    if (!(await visit(-33.87, 151.2)).includes(victim)) gaps.push("a relay refused many times is left alone for more than a week");
    block.clear(); skew += 8 * 24 * 3600e3; await visit(-33.87, 151.2);
    // Changing station again before the wait is up is how people listen.
    block.add(victim); nostr.leave(); nostr.join(-33.87, 151.2, "t"); await wait(35); nostr.leave(); await wait(100);
    if ((await visit(-33.87, 151.2)).includes(victim)) gaps.push("a quick change of station forgets that a relay was refused");
    block.clear(); skew += 8 * 24 * 3600e3; await visit(-33.87, 151.2);
    // One the listener added is theirs to decide about.
    nostr.setExtraRelays(["wss://mine.example"]); block.add("wss://mine.example");
    await visit(-33.87, 151.2);
    if (!(await visit(-33.87, 151.2)).includes("wss://mine.example")) gaps.push("a relay the listener added is dropped without asking");
    gaps.length ? fail(name, gaps.join("; ")) : pass("a relay a network blocks is dialled once, then left half an hour and longer; being offline and hanging up are not held against any");
  } catch (e) {
    fail(name, `the module threw: ${e.message}`);
  } finally {
    try { nostr?.leave(); nostr?.setExtraRelays([]); nostr?.setSpread(0); } catch {}
    globalThis.WebSocket = realWs; Date.now = realNow; globalThis.setTimeout = realTimer; globalThis.setInterval = realEvery;
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
    const d = +(/nostr\.setSpread\((\d+)\)/.exec(readSrc("src/main.js"))?.[1] || 0);
    if (!d || d > dir.busiest.length) gaps.push("the desktop dials a spread of small servers rather than the busiest (src/main.js, setSpread)");
    const desk = count(d), phone = n ? count(n) : [];
    if (desk.length > 40) gaps.push(`a join on the desktop dials ${desk.length} relays`);
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
    const hear = (e, relays = made) => { const ev = signNostr(e, "listener"); for (const w of relays) w.onmessage?.({ data: JSON.stringify(["EVENT", "s", ev]) }); };
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

// ── chat asks for 13 or older before it opens ───────────────────────────────
// 25 Nov 2026. The Terms said AuralFM is for people 13 and over, and the app
// never asked: the chat card's button, Settings, the studio and On air each
// turned chat on with one press, and the web turned it on by default. Going
// live already asked for 18 every time (explore-studio.js, show.adult).
{
  const name = "chat asks for 13 or older before it opens";
  console.log(`\n${name}`);
  const gaps = [];
  const prefs = (await import(pathToFileURL(R("src/prefs.js")).href));
  if (prefs.normalize({ presence: true }).presence !== false) gaps.push("chat on without the 13+ tick still reads as on");
  if (prefs.normalize({ presence: true, ageChat: true }).presence !== true) gaps.push("chat with the tick reads as off");
  if (!("ageChat" in prefs.pick({ ageChat: true }))) gaps.push("the tick cannot be saved");
  const html = readSrc("src/renderer/explore.html");
  const chatJs = readSrc("src/renderer/explore-chat.js");
  if (!/id="chatoffage"/.test(html) || !/if \(!\$\("chatoffage"\)\.checked\)/.test(chatJs)) gaps.push("the chat card has no 13+ tick, or Turn on chat does not wait for it");
  for (const f of ["src/renderer", "web"]) {
    for (const file of fs.readdirSync(R(f)).filter((n) => n.endsWith(".js"))) {
      const src = fs.readFileSync(R(`${f}/${file}`), "utf8");
      if (/setPrefs\??\.?\(\{\s*presence:\s*true\s*\}\)/.test(src)) gaps.push(`${f}/${file} turns chat on without asking`);
    }
  }
  if (!/presence = p\.ageChat === true/.test(readSrc("web/bridge.js"))) gaps.push("the web turns chat on by default without the tick");
  if (!/chat and private messages are for people aged 13/i.test(fs.readFileSync(R("docs/TERMS.md"), "utf8"))) gaps.push("the Terms do not say chat is for 13 and over");
  gaps.length ? fail(name, gaps.join("; ")) : pass("off until the listener says they are 13 or older, at every switch, on the desktop and the web");
}
