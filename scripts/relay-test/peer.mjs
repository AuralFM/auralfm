// One participant in the two-party test. Two of these run as separate OS
// processes, so they have genuinely independent module state and independent
// per-area keys, and they meet only over real public relays.
//
// Speaks JSON lines on stdout so the parent can score it.
import { createRequire } from "node:module";
import path from "node:path";
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const n = require(path.join(ROOT, "src", "presence-nostr.js"));

const ROLE = process.argv[2];                  // "A" | "B"
const LAT = Number(process.argv[3]);
const LON = Number(process.argv[4]);
const say = (o) => process.stdout.write(JSON.stringify({ role: ROLE, ...o }) + "\n");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const chat = [];
const notes = [];
const dms = [];
const favs = [];

const peers = [];
// The peer list is the only place to prove we saw a *specific* other client.
// stats().peers is a network-wide count, so it cannot tell B apart from the
// forty-odd strangers who are also announcing right now.
n.onPeers((l) => { peers.length = 0; peers.push(...l); });
n.onMessages((l) => { chat.length = 0; chat.push(...l); });
n.onNotes((l) => { notes.length = 0; notes.push(...l); });
n.onDms((l) => { dms.length = 0; dms.push(...l); });
n.onFavorited((pk, on) => favs.push({ pk, on }));

// Commands arrive on stdin so the parent can sequence the two sides.
let buf = "";
process.stdin.on("data", async (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (line) await handle(JSON.parse(line));
  }
});

async function handle(cmd) {
  switch (cmd.do) {
    case "join": {
      n.join(LAT, LON, cmd.label || `${ROLE} listening`);
      await wait(cmd.settle ?? 8000);
      const s = n.stats();
      say({ ok: "joined", cell: s.cell, relays: s.relays, connected: s.connected, pubkey: s.pubkey });
      break;
    }
    case "stats": {
      const s = n.stats();
      say({ ok: "stats", cell: s.cell, connected: s.connected, peers: s.peers,
            peerIds: peers.map((x) => x.id),
            inMyCell: peers.filter((x) => x.geohash && s.cell && n.sameCell(x.geohash, s.cell)).map((x) => x.id),
            messages: s.messages, notes: s.notes, dms: s.dms, unread: s.unread,
            pubkey: s.pubkey, fingerprint: s.fingerprint });
      break;
    }
    case "say":   say({ ok: "said",    sent: n.say(cmd.text, cmd.nick) }); break;
    case "drop":  say({ ok: "dropped", sent: n.drop(cmd.text, cmd.nick) }); break;
    case "dm":    say({ ok: "dmSent",  sent: n.dm(cmd.to, cmd.text) }); break;
    case "fav":   say({ ok: "favSent", sent: n.dm(cmd.to, "", [["fav", cmd.on ? "1" : "0"]]) }); break;
    case "inbox":
      say({
        ok: "inbox",
        // What arrived from somebody else, with the full key so the other side's
        // identity can be checked rather than assumed.
        chat:  chat.filter((m) => !m.mine).map((m) => ({ text: m.text, pubkey: m.pubkey, nick: m.nick, teleport: m.teleport })),
        notes: notes.filter((m) => !m.mine).map((m) => ({ text: m.text, nick: m.nick, expiresInH: m.expiresAt ? +((m.expiresAt - Date.now()) / 3.6e6).toFixed(1) : null })),
        dms:   dms.filter((m) => !m.mine).map((m) => ({ text: m.text, from: m.pubkey, unread: m.unread })),
        favs,
      });
      break;
    case "bye": n.leave(); say({ ok: "left" }); await wait(300); process.exit(0);
  }
}

say({ ok: "ready" });
