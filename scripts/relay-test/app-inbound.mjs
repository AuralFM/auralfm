// Does the running app RENDER traffic that arrived from somebody else?
//
//   npm run test:app-inbound      (with the app already running, see below)
//
// **Manual only, never CI** — same reason as two-party.mjs: it publishes to relays
// other people run.
//
// Needs the app running with remote debugging and driven into a cell first:
//
//   npx electron . --user-data-dir=/tmp/inbound --remote-debugging-port=9300
//
// then, in the popover's console or over CDP, the same call the popover makes when
// audio starts — the audio pipeline is not what is under test:
//
//   window.auralfm.setPrefs({ presence: true, nickname: "melton" })
//   window.auralfm.publishState({ playing: true, status: "playing", channel:
//     { id: "t", title: "Rás 1", lat: 64.146, lon: -21.94 } })
//
// ## What this catches that the protocol test cannot
//
// It found one immediately. Private messages rendered their sender as the literal
// string "undefined", because `takeDm` never set `from` and the renderer labels
// every line with `m.nick || m.from`. Invisible to every self-addressed test —
// those arrive with `mine: true` and render "you" — and invisible to the protocol
// test, which never touches the DOM. There is an audit check for it now.
//
// The relay test proves the protocol works between two parties. This proves the
// last mile: a real inbound message crossing the IPC bridge, surviving the mute
// and filter funnel in main, and appearing in the DOM with the right styling.
//
// The Electron app is already running on port 9300 in the Reykjavik cell. A peer
// process joins the same cell and speaks; assertions read the app's own DOM.
import { spawn } from "node:child_process";
import path from "node:path";

import { fileURLToPath } from "node:url";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PEER = path.join(REPO, "scripts", "relay-test", "peer.mjs");
const LAT = 64.146, LON = -21.94;
const STAMP = Math.random().toString(36).slice(2, 7);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const check = (n, p, d = "") => { results.push({ n, p }); console.log(`  ${p ? "ok  " : "FAIL"}  ${n}${d ? `  — ${d}` : ""}`); };

async function conn(name) {
  const l = await fetch("http://127.0.0.1:9300/json/list").then((r) => r.json());
  const t = l.find((x) => x.url.endsWith(name));
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  return { ws, ev: (e) => new Promise((res) => { const my = ++id;
    const h = (m) => { const d = JSON.parse(m.data); if (d.id === my) { ws.removeEventListener("message", h); res(d.result?.result?.value); } };
    ws.addEventListener("message", h);
    ws.send(JSON.stringify({ id: my, method: "Runtime.evaluate", params: { expression: e, returnByValue: true } })); }) };
}

function makePeer() {
  const p = spawn(process.execPath, [PEER, "P", String(LAT), String(LON)], { stdio: ["pipe", "pipe", "ignore"] });
  const q = []; let buf = "";
  p.stdout.on("data", (d) => { buf += d; let i;
    while ((i = buf.indexOf("\n")) >= 0) { const s = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (s) { try { q.push(JSON.parse(s)); } catch {} } } });
  return { proc: p, send: (o) => p.stdin.write(JSON.stringify(o) + "\n"),
    async next(ok, ms = 30000) { const t0 = Date.now();
      for (;;) { const i = q.findIndex((x) => x.ok === ok); if (i >= 0) return q.splice(i, 1)[0];
        if (Date.now() - t0 > ms) throw new Error(`timed out on ${ok}`); await wait(200); } } };
}

(async () => {
  console.log(`\nApp rendering of real inbound traffic — run ${STAMP}\n`);
  const exp = await conn("explore.html");

  // The nickname is set so mention highlighting can be tested against a real
  // inbound message rather than a synthetic one.
  await exp.ev(`(()=>{window.auralfm.setPrefs({nickname:"melton"});return 1})()`);
  await wait(1500);
  await exp.ev("(()=>{window.auralfm.presenceStats().then(s=>window.__s=s);return 1})()");
  await wait(1000);
  const appKey = await exp.ev("window.__s.pubkey");
  const appCell = await exp.ev("window.__s.cell");
  check("app is announcing in a cell", !!appKey && !!appCell, `${appCell}, ${String(appKey).slice(0, 8)}…`);

  const P = makePeer();
  await P.next("ready");
  P.send({ do: "join", label: "peer radio" });
  const pj = await P.next("joined");
  check("peer joined the same cell", pj.cell === appCell, `${pj.cell} vs ${appCell}`);

  const row = (t) => `(()=>{const r=[...document.querySelectorAll('#chatlog .msg')].find(x=>x.textContent.includes(${JSON.stringify(t)}));
     return r? JSON.stringify({cls:r.className, text:r.textContent.slice(0,90)}) : null})()`;

  // ── 1. a public message ──────────────────────────────────────────────────
  console.log("\n1. public message");
  const msg = `hello from the peer ${STAMP}`;
  P.send({ do: "say", text: msg, nick: "stranger" });
  await P.next("said");
  await wait(9000);
  let r = JSON.parse(await exp.ev(row(msg)) || "null");
  check("appears in the app's chat log", !!r, r ? r.text.slice(0, 46) : "not rendered");
  check("shows the sender's nickname", !!r && r.text.includes("stranger"));
  check("not styled as mine", !!r && !/\bmine\b/.test(r.cls), r?.cls || "");
  check("name is clickable to mute or report", await exp.ev(
    `(()=>{const r=[...document.querySelectorAll('#chatlog .msg')].find(x=>x.textContent.includes(${JSON.stringify(msg)}));
      return !!r && !!r.querySelector('.who.mutable')})()`));

  // ── 2. a mention ─────────────────────────────────────────────────────────
  console.log("\n2. mention");
  const men = `@melton are you hearing this ${STAMP}`;
  P.send({ do: "say", text: men, nick: "stranger" });
  await P.next("said");
  await wait(9000);
  r = JSON.parse(await exp.ev(row(men)) || "null");
  check("mention rendered", !!r);
  check("marked with the mention class", !!r && /\bmention\b/.test(r.cls), r?.cls || "");

  // ── 3. a location note ───────────────────────────────────────────────────
  console.log("\n3. location note");
  const note = `note from the peer ${STAMP}`;
  P.send({ do: "drop", text: note, nick: "stranger" });
  await P.next("dropped");
  await wait(10000);
  r = JSON.parse(await exp.ev(row(note)) || "null");
  check("note rendered in the same timeline", !!r);
  check("carries the note class", !!r && /\bnote\b/.test(r.cls), r?.cls || "");
  check("labelled with the word NOTE, not a glyph", !!r && /NOTE/i.test(r.text), r ? r.text.slice(0, 30) : "");

  // ── 4. a private message ─────────────────────────────────────────────────
  console.log("\n4. private message");
  const dm = `private to the app ${STAMP}`;
  P.send({ do: "dm", to: appKey, text: dm });
  check("peer accepted the dm", (await P.next("dmSent")).sent === true);
  await wait(11000);
  r = JSON.parse(await exp.ev(row(dm)) || "null");
  check("PRIVATE MESSAGE RENDERED IN THE APP", !!r, r ? r.text.slice(0, 46) : "not rendered");
  check("carries the dm class", !!r && /\bdm\b/.test(r.cls), r?.cls || "");
  check("labelled with the word PRIVATE", !!r && /PRIVATE/i.test(r.text));

  // ── 5. the merged timeline ───────────────────────────────────────────────
  console.log("\n5. one merged timeline");
  const kinds = JSON.parse(await exp.ev(
    `JSON.stringify([...document.querySelectorAll('#chatlog .msg')].map(x=>x.className))`) || "[]");
  check("all three kinds coexist in one log", kinds.some((c) => /\bnote\b/.test(c)) && kinds.some((c) => /\bdm\b/.test(c)) && kinds.some((c) => c === "msg" || /^msg\s*$/.test(c)),
    `${kinds.length} rows`);
  check("no renderer errors", (await exp.ev("(window.__errors&&window.__errors.length)||0")) === 0);

  // ── 6. the safety funnel on real traffic ─────────────────────────────────
  console.log("\n6. the word filter, on a real inbound message");
  const nasty = `kys ${STAMP}`;
  P.send({ do: "say", text: nasty, nick: "stranger" });
  await P.next("said");
  await wait(9000);
  check("filtered message never reached the DOM", (await exp.ev(row(nasty))) === null,
    "dropped in main, so there is nothing to hide");

  P.send({ do: "bye" });
  await wait(1000);
  try { P.proc.kill(); } catch {}
  exp.ws.close();

  const bad = results.filter((x) => !x.p);
  console.log(`\n${results.length - bad.length}/${results.length} passed`);
  if (bad.length) { console.log("\nfailed:"); bad.forEach((f) => console.log(`  - ${f.n}`)); }
  process.exit(bad.length ? 1 : 0);
})().catch((e) => { console.error("\nharness error:", e.message); process.exit(2); });
