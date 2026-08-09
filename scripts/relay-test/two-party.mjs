// Two independent AuralFM clients, meeting only over real public Nostr relays.
//
//   npm run test:relays
//
// **Run this by hand. Never in CI.** It publishes to relays that belong to other
// people, and this project has already knocked three KiwiSDRs offline by
// over-probing. A test that fires at every push is a test that makes us a bad
// guest. It takes about ninety seconds.
//
// Everything the decentralized layer does was previously verified by sending to
// ourselves. That proves the wire format parses and nothing more: a
// self-addressed envelope shares one process, one clock, one key store and one
// set of sockets. This is the first thing here that involves two parties.
//
// ## What it proves, and what it does not
//
// Two OS processes means genuinely independent module state, independent per-area
// keys, and separate sockets — they meet only on the public network. What is
// still untested by this:
//
//   - **Two physical machines.** Both sides share one IP and one clock here.
//     Neither matters much for relay-mediated messaging — Nostr is client-to-server,
//     so there is no NAT traversal, and the ±15 minute envelope fuzzing tolerates
//     far more skew than two processes can produce — but it is not proven.
//   - **The app's own rendering** of real inbound traffic. This exercises
//     src/presence-nostr.js and src/nostr-private.js, not the Electron renderer.
//   - **Interoperating with bitchat itself.** The ECDH detail in nostr-private.js
//     was inferred from libsecp256k1's documented default, not read from their
//     source. If that inference is wrong, both sides here would be wrong in the
//     same way and every assertion below would still pass.
//
// One reading to expect: the in-cell peer list often contains keys from earlier
// runs. Ephemeral kinds are a SHOULD, not a MUST, and at least one relay in the
// list retains them for a while. That is documented in presence-nostr.js and is
// the reason the presence assertions look for a specific key rather than a count.
import { spawn } from "node:child_process";
import path from "node:path";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const PEER = path.join(HERE, "peer.mjs");

// Somewhere real, and somewhere unlikely to have strangers in it — a quiet cell
// keeps the assertions about "did B see exactly A's message" meaningful.
const LAT = 64.146, LON = -21.94;          // Reykjavík
const STAMP = Math.random().toString(36).slice(2, 8);

const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? "ok  " : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
};

function makePeer(role) {
  const p = spawn(process.execPath, [PEER, role, String(LAT), String(LON)], { stdio: ["pipe", "pipe", "pipe"] });
  const q = [];
  let buf = "";
  p.stdout.on("data", (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (line) { try { q.push(JSON.parse(line)); } catch {} }
    }
  });
  p.stderr.on("data", (d) => { const s = String(d).trim(); if (s && !/ExperimentalWarning/.test(s)) console.error(`  [${role} stderr] ${s.slice(0, 160)}`); });
  return {
    role, proc: p,
    send: (o) => p.stdin.write(JSON.stringify(o) + "\n"),
    async next(ok, ms = 30000) {
      const t0 = Date.now();
      for (;;) {
        const i = q.findIndex((x) => x.ok === ok);
        if (i >= 0) return q.splice(i, 1)[0];
        if (Date.now() - t0 > ms) throw new Error(`${role}: timed out waiting for "${ok}"`);
        await new Promise((r) => setTimeout(r, 200));
      }
    },
  };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  console.log(`\nTwo-party test over live relays — cell around ${LAT}, ${LON}, run ${STAMP}\n`);
  const A = makePeer("A"), B = makePeer("B");
  await A.next("ready"); await B.next("ready");

  // ── 1. both join the same cell ─────────────────────────────────────────────
  console.log("1. joining the same cell");
  A.send({ do: "join", label: "Rás 1" });
  B.send({ do: "join", label: "Rás 2" });
  const aj = await A.next("joined"), bj = await B.next("joined");
  check("both reached relays", aj.connected > 0 && bj.connected > 0, `A ${aj.connected}/${aj.relays}, B ${bj.connected}/${bj.relays}`);
  check("same geohash cell", aj.cell === bj.cell, aj.cell);
  check("independent identities", aj.pubkey !== bj.pubkey, `A ${aj.pubkey.slice(0, 8)}… B ${bj.pubkey.slice(0, 8)}…`);

  // ── 2. presence: does each see the other? ──────────────────────────────────
  console.log("\n2. presence");
  await wait(9000);
  A.send({ do: "stats" }); B.send({ do: "stats" });
  const as = await A.next("stats"), bs = await B.next("stats");
  // The claim that matters is not "saw somebody" — 40-odd strangers are
  // announcing at any moment — it is "saw *this* other client".
  const bStub = bj.pubkey.slice(0, 8), aStub = aj.pubkey.slice(0, 8);
  check("A saw B specifically", as.peerIds.includes(bStub), `${bStub} among ${as.peerIds.length}`);
  check("B saw A specifically", bs.peerIds.includes(aStub), `${aStub} among ${bs.peerIds.length}`);
  check("A places B in the same cell", as.inMyCell.includes(bStub), `in-cell: ${as.inMyCell.join(", ") || "none"}`);
  check("B places A in the same cell", bs.inMyCell.includes(aStub), `in-cell: ${bs.inMyCell.join(", ") || "none"}`);
  console.log(`     (network-wide presence right now: A ${as.peers}, B ${bs.peers} — not all in this cell)`);

  // ── 3. public chat, both directions ────────────────────────────────────────
  console.log("\n3. public chat");
  const aMsg = `A here, aurora is out ${STAMP}`;
  A.send({ do: "say", text: aMsg, nick: "alice" });
  check("A's say was accepted", (await A.next("said")).sent === true);
  await wait(8000);
  B.send({ do: "inbox" });
  let bIn = await B.next("inbox");
  const gotA = bIn.chat.find((m) => m.text === aMsg);
  check("B received A's message", !!gotA);
  check("carries A's full public key", gotA?.pubkey === aj.pubkey, gotA ? `${gotA.pubkey.slice(0, 12)}…` : "n/a");
  check("nickname survived", gotA?.nick === "alice", gotA?.nick || "none");
  check("marked teleport", gotA?.teleport === true, "AuralFM is always tuned in, never standing there");

  const bMsg = `B here too ${STAMP}`;
  B.send({ do: "say", text: bMsg, nick: "bob" });
  await B.next("said");
  await wait(8000);
  A.send({ do: "inbox" });
  let aIn = await A.next("inbox");
  check("A received B's reply", !!aIn.chat.find((m) => m.text === bMsg));

  // ── 4. location notes ─────────────────────────────────────────────────────
  console.log("\n4. location notes");
  const note = `40m busy after dark ${STAMP}`;
  A.send({ do: "drop", text: note, nick: "alice" });
  check("A's drop was accepted", (await A.next("dropped")).sent === true);
  await wait(9000);
  B.send({ do: "inbox" });
  bIn = await B.next("inbox");
  const gotNote = bIn.notes.find((x) => x.text === note);
  check("B sees A's note", !!gotNote);
  check("note expires in about a day", gotNote ? gotNote.expiresInH > 23 && gotNote.expiresInH <= 24.1 : false, gotNote ? `${gotNote.expiresInH}h` : "n/a");

  // ── 5. the one that has never been tested: a real private message ─────────
  console.log("\n5. private message A -> B");
  // A learns B's key the way the app does: from a chat line, not from presence,
  // because presence only carries eight characters.
  const bKeyFromChat = aIn.chat.find((m) => m.text === bMsg)?.pubkey;
  check("A learned B's key from chat", bKeyFromChat === bj.pubkey, bKeyFromChat ? `${bKeyFromChat.slice(0, 12)}…` : "not found");
  const secret = `meet on 7205 at 0300 ${STAMP}`;
  A.send({ do: "dm", to: bKeyFromChat, text: secret });
  check("A's dm was accepted", (await A.next("dmSent")).sent === true);
  await wait(10000);
  B.send({ do: "inbox" });
  bIn = await B.next("inbox");
  const gotDm = bIn.dms.find((m) => m.text === secret);
  check("B DECRYPTED A's private message", !!gotDm);
  check("sender authenticated as A", gotDm?.from === aj.pubkey, gotDm ? `${gotDm.from.slice(0, 12)}…` : "n/a");
  check("arrived unread", gotDm?.unread === true);
  check("A's own copy is not in B's inbox twice", bIn.dms.filter((m) => m.text === secret).length === 1);

  // ── 6. the mutual-favorite handshake ──────────────────────────────────────
  console.log("\n6. mutual favorite B -> A");
  B.send({ do: "fav", to: aj.pubkey, on: true });
  check("B's fav signal was accepted", (await B.next("favSent")).sent === true);
  await wait(10000);
  A.send({ do: "inbox" });
  aIn = await A.next("inbox");
  const fav = aIn.favs.find((f) => f.pk === bj.pubkey && f.on === true);
  check("A recorded B as mutual", !!fav);
  check("bodiless signal did not appear as a message", !aIn.dms.some((m) => m.text === ""), "a fav is a fact, not a line of chat");

  A.send({ do: "bye" }); B.send({ do: "bye" });
  await wait(1200);
  try { A.proc.kill(); B.proc.kill(); } catch {}

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) { console.log("\nfailed:"); failed.forEach((f) => console.log(`  - ${f.name} ${f.detail}`)); }
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error("\nharness error:", e.message); process.exit(2); });
