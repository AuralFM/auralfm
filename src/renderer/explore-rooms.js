/**
 * Explore, part 12 of 17: Private messages, the roster, conversations, hubs and name completion.
 *
 * Explore is one page split across plain scripts that share a global scope, in
 * the order explore.html loads them. Declarations live here; anything that runs
 * at load — listeners, IPC subscriptions, one-off calls — is in wireRooms(),
 * which explore.js calls once every part has loaded. That keeps the original
 * single-file behaviour: no handler can fire into a part that has not loaded.
 */

/**
 * ─── Which conversation you are in, and whether Enter will do what you meant ──
 *
 * One text field had two meanings and showed neither. `/msg gal hello` and
 * `hello` go to entirely different audiences, and until this existed the only
 * way to find out which one you had typed was to send it. That is a mode error,
 * the same shape as caps lock: the machine knows, the person cannot see it.
 *
 * Three things fix it, in increasing order of how much they change:
 *
 *   **The mode line** under the input says, in words, what Enter will do. It is
 *   `aria-live="polite"` so it is spoken rather than only shown.
 *
 *   **The name picker** offers who you can actually address, because the failure
 *   this always produced was a nickname that did not resolve — and the old code
 *   threw away everything you had typed when that happened.
 *
 *   **A private conversation is a place.** `/msg somebody` walks you into it and
 *   the bar above the log says whose it is. This is what bitchat does — their
 *   `/msg` calls `startPrivateChat(with:)` and the message argument is optional —
 *   and since their users are in these same rooms, behaving the same way is
 *   worth more than any cleverness of ours.
 */
let dmWith = null;                     // { pubkey, nick } while in a private thread

/**
 * The room's own name, which is the station's place and never the listener's.
 *
 * Deliberately not `viewingCell`'s place: this names the audience for something
 * you are about to *send*, and sending only ever reaches the cell you are
 * listening to. Naming the browsed city here would promise the wrong room.
 */
const myPlaceName = () => playing?.place || null;

/** Everyone here we could name. Speakers carry a nickname; the silent do not. */
function roster() {
  const out = new Map();
  for (const m of chatCache) {
    if (m.mine || !m.pubkey) continue;
    out.set(m.pubkey, { pubkey: m.pubkey, nick: m.nick || null, from: m.from, spoke: true });
  }
  /**
   * Present but silent. Their heartbeat has no nickname in it — a bitchat
   * nickname travels on the message, not the announcement — so the short key is
   * the only handle they have, and it is a real one.
   *
   * Filtered to this cell, and that filter is not cosmetic. `peers` is everybody
   * the relays told us about anywhere on Earth: on a live network this returned
   * seventy-nine people while the header beside it said how many were *here*.
   * Offering a stranger in Tokyo under a heading that names Mexico City is the
   * same lie the header check already refuses to tell.
   */
  for (const p of peers) {
    if (!p.pubkey || out.has(p.pubkey)) continue;
    if (!myCell || !p.geohash || !sameCell(p.geohash, myCell)) continue;
    out.set(p.pubkey, { pubkey: p.pubkey, nick: null, from: p.id, spoke: false });
  }
  return [...out.values()];
}

/** Everybody a fragment could mean. Empty fragment means everybody. */
function matchPeople(want) {
  const w = String(want || "").trim().toLowerCase().replace(/^@/, "");
  const all = roster();
  if (!w) return all;
  const exact = all.filter((p) => (p.nick || "").toLowerCase() === w || p.from.toLowerCase() === w);
  if (exact.length) return exact;
  return all.filter((p) => (p.nick || "").toLowerCase().startsWith(w)
                        || p.from.toLowerCase().startsWith(w)
                        || p.pubkey.toLowerCase().startsWith(w));
}

/** Exactly one person, or nothing. Ambiguity is not a match. */
const matchOne = (want) => {
  const hits = matchPeople(want);
  return hits.length === 1 ? hits[0] : null;
};

/**
 * ─── The drawer ──────────────────────────────────────────────────────────────
 *
 * Conversations grouped by the person they are with, newest first, behind a
 * count that is not on screen at all until there is one to count. That is the
 * whole architecture: rooms are the app, conversations are a drawer.
 */
let convosOpen = false;

/** One entry per person, with enough to decide whether to open it. */
function conversations() {
  const by = new Map();
  for (const m of dmCache) {
    if (!m.with) continue;
    const g = by.get(m.with) || { pubkey: m.with, at: 0, last: "", unread: 0, nick: null };
    if ((m.at || 0) >= g.at) { g.at = m.at || 0; g.last = m.text || ""; g.mine = !!m.mine; }
    // The name has to come from them, not from us: our own sent records carry
    // our short key in `from`, so reading it off the newest message would label
    // every conversation with our own name.
    if (!m.mine) g.nick = m.nick || g.nick || m.from;
    if (m.unread && !m.mine) g.unread++;
    by.set(m.with, g);
  }
  for (const g of by.values()) {
    // A label you set yourself wins: it is the only name here you chose.
    g.name = contacts.get(g.pubkey)?.label || g.nick || g.pubkey.slice(0, 8);
  }
  return [...by.values()].sort((a, b) => b.at - a.at);
}

/** The count in the header, absent when there is nothing to say. */
function paintDmButton() {
  const b = $("chatdms");
  if (!b) return;
  const list = conversations();
  b.hidden = list.length === 0;
  if (b.hidden) return;
  const unread = list.reduce((n, c) => n + c.unread, 0);
  b.textContent = unread
    ? `${unread} ${t("chat.newPrivate", "new")}`
    : `${list.length} ${t("chat.privateCount", "private")}`;
  b.classList.toggle("unread", unread > 0);
  b.setAttribute("aria-expanded", convosOpen ? "true" : "false");
}

function paintConvos() {
  const box = $("chatconvos");
  if (!box) return;
  box.innerHTML = "";
  const list = conversations();
  if (!list.length) {
    const n = document.createElement("div");
    n.className = "none";
    n.textContent = t("chat.noPrivate", "No private conversations yet. /msg somebody to start one.");
    box.append(n);
    return;
  }
  for (const c of list) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "row";
    row.setAttribute("role", "listitem");

    const nm = document.createElement("span");
    nm.className = "nm";
    nm.textContent = c.name;

    const last = document.createElement("span");
    last.className = "last";
    // Say which way it went. Without it a conversation reads as though they
    // spoke last when the last thing said was yours.
    last.textContent = (c.mine ? `${t("chat.you", "you")}: ` : "") + c.last;

    const when = document.createElement("span");
    when.className = "when";
    when.textContent = c.at ? new Date(c.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";

    row.append(nm, last, when);
    if (c.unread) {
      const d = document.createElement("span");
      d.className = "dot";
      d.setAttribute("aria-label", `${c.unread} ${t("chat.newPrivate", "new")}`);
      row.append(d);
    }
    row.onclick = () => { closeConvos(); enterDm({ pubkey: c.pubkey, nick: c.name }); };
    box.append(row);
  }
}

function openConvos() {
  convosOpen = true;
  paintConvos();
  $("chatconvos").hidden = false;
  $("chatlog").hidden = true;
  hideNames();
  paintDmButton();
}

function closeConvos() {
  convosOpen = false;
  $("chatconvos").hidden = true;
  $("chatlog").hidden = false;
  paintDmButton();
}

const toggleConvos = () => (convosOpen ? closeConvos() : openConvos());

/** Walk into a hub. */
async function enterHub(h) {
  if (dmWith) leaveDm();
  if (convosOpen) closeConvos();
  hubIn = h;
  hubCache = await guard("hubHistory", () => window.auralfm.hubHistory(), []) || [];
  $("chatdm").hidden = false;
  $("chatdmwho").textContent = `${t("chat.hubIn", "Hub")} ${h.name}`;
  $("chatinput").classList.add("dm");
  paintComposer();
  repaintLog();
  $("chatinput").focus();
}

/** Back to the place. */
async function leaveHub() {
  if (!hubIn) return;
  hubIn = null;
  hubCache = [];
  await guard("hubLeave", () => window.auralfm.hubLeave(), null);
  $("chatdm").hidden = true;
  $("chatdmwho").textContent = "";
  $("chatinput").classList.remove("dm");
  paintComposer();
  repaintLog();
  $("chatinput").focus();
}

/** Walk into a private conversation. */
async function enterDm(who) {
  if (convosOpen) closeConvos();
  dmWith = { pubkey: who.pubkey, nick: who.nick || who.from };
  $("chatdm").hidden = false;
  $("chatdmwho").textContent = `${t("chat.dmWith", "Private with")} ${dmWith.nick}`;
  $("chatinput").classList.add("dm");
  await guard("dmRead", () => window.auralfm.dmRead(dmWith.pubkey));
  paintComposer();
  repaintLog();
  $("chatinput").focus();
}

/** Back to the room. */
function leaveDm() {
  if (!dmWith) return;
  dmWith = null;
  $("chatdm").hidden = true;
  $("chatdmwho").textContent = "";      // hidden is not the same as empty
  $("chatinput").classList.remove("dm");
  hideNames();
  paintComposer();
  repaintLog();
  $("chatinput").focus();
}

function hideNames() {
  const box = $("chatnames");
  if (box) { box.hidden = true; box.innerHTML = ""; }
}

/**
 * Offer the names, rather than let somebody guess one.
 *
 * Clicking a name completes the command instead of running it, so the person is
 * still the one who presses Enter. A picker that fired the command would be a
 * different kind of surprise from the one being fixed here.
 */
function showNames(word, fragment) {
  const box = $("chatnames");
  if (!box) return;
  const hits = matchPeople(fragment).slice(0, 8);
  if (!hits.length) return hideNames();
  box.innerHTML = "";
  for (const p of hits) {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("role", "option");
    const n = document.createElement("span");
    n.textContent = p.nick || p.from;
    b.append(n);
    if (!p.spoke) {
      const q = document.createElement("span");
      q.className = "q";
      q.textContent = t("chat.hasNotSpoken", "here, hasn't spoken");
      b.append(q);
    }
    const k = document.createElement("span");
    k.className = "k";
    k.textContent = p.from;
    b.append(k);
    b.onclick = () => {
      const input = $("chatinput");
      input.value = `${word} ${p.nick || p.from} `;
      input.focus();
      describeMode();
    };
    box.append(b);
  }
  box.hidden = false;
}
