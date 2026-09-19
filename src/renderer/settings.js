"use strict";
const $ = (s) => document.querySelector(s);
let T = {};
let P = { theme: "system", contrast: "system", dotSize: "normal", language: "system",
          palette: "onair" };
let PALS = [];
const paletteName = (id) => (PALS.find((p) => p.id === id) || {}).name || "";

/**
 * Appearance and contrast are applied to this window immediately, before any
 * round trip. The setting only means something if you can see it take effect.
 */
function paint() {
  const r = document.documentElement;
  // Settings has help tags of its own, and it is also where they are turned off,
  // so the switch has to take effect in this window immediately.
  window.Tips?.setEnabled(P.tips !== false);
  window.Tips?.adopt();
  if (P.theme === "system") r.removeAttribute("data-theme");
  else r.setAttribute("data-theme", P.theme);
  r.setAttribute("data-contrast", P.contrast === "more" ? "more" : "normal");

  for (const b of $("#palettes").children) {
    b.setAttribute("aria-checked", String(b.querySelector(".nm").textContent === paletteName(P.palette)));
  }
  paintAppIcons();
  for (const group of ["theme", "dotSize"]) {
    for (const b of $("#" + group).children) {
      b.setAttribute("aria-checked", String(b.dataset.v === P[group]));
      b.tabIndex = b.dataset.v === P[group] ? 0 : -1;
    }
  }
  $("#contrast").setAttribute("aria-checked", String(P.contrast === "more"));
  $("#presence").setAttribute("aria-checked", String(P.presence === true));
  $("#tips").setAttribute("aria-checked", String(P.tips !== false));
  $("#hidePreviews").setAttribute("aria-checked", String(P.hidePreviews === true));
  $("#durableIdentity").setAttribute("aria-checked", String(P.durableIdentity === true));
  $("#filterChat").setAttribute("aria-checked", String(P.filterChat !== false));
  $("#powFloor").value = String(P.powFloor ?? 0);
  $("#onlyKept").setAttribute("aria-checked", String(P.onlyKept === true));
  if (document.activeElement !== $("#nickname")) $("#nickname").value = P.nickname || "";
  paintPresence();
  paintFingerprint();
  paintMuted();
  paintContacts();
  paintFilter();
  $("#language").value = P.language;
}

function translate() {
  for (const el of document.querySelectorAll("[data-i18n]")) {
    const s = T[el.dataset.i18n];
    if (s) el.textContent = s;
  }
  document.title = "AuralFM — " + (T["set.title"] || "Settings");
}

async function set(patch) {
  Object.assign(P, patch);
  paint();
  P = await guard("setPrefs", () => window.auralfm.setPrefs(patch), P);
  paint();
  if ("language" in patch) { T = await guard("strings", () => window.auralfm.strings(), T); translate(); }
}

// Preferences can also change from outside this window — a second Settings
// window, or a menu item. Follow those rather than showing a stale state.
window.auralfm.onPrefs(async (next) => {
  const langChanged = next.language !== P.language;
  P = next;
  paint();
  if (langChanged) { T = await guard("strings", () => window.auralfm.strings(), T); translate(); }
});

// Contacts change from the chat as well as from here — /fav, and an inbound
// favorite signal from somebody keeping you back. Follow those rather than
// showing a list that was true when the window opened.
window.auralfm.onSocial(() => paintContacts());

// Segmented controls: click, plus arrow keys for keyboard users, because a
// radiogroup that only responds to the mouse is a radiogroup in name only.
for (const group of ["theme", "dotSize"]) {
  const el = $("#" + group);
  el.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-v]");
    if (b) set({ [group]: b.dataset.v });
  });
  el.addEventListener("keydown", (e) => {
    const dir = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
    if (!dir) return;
    e.preventDefault();
    const opts = [...el.children].map((b) => b.dataset.v);
    const next = opts[(opts.indexOf(P[group]) + dir + opts.length) % opts.length];
    set({ [group]: next });
    el.querySelector(`[data-v="${next}"]`).focus();
  });
}

$("#contrast").addEventListener("click", () =>
  set({ contrast: P.contrast === "more" ? "system" : "more" }));

$("#tips").addEventListener("click", () => set({ tips: P.tips === false }));

$("#hidePreviews").addEventListener("click", () => set({ hidePreviews: P.hidePreviews !== true }));

// On blur rather than on every keystroke: a nickname is written to disk and
// broadcast to both windows, and doing that per character is a lot of churn for
// a field somebody types once.
$("#nickname").addEventListener("change", (e) =>
  set({ nickname: e.target.value.trim().slice(0, 32) }));

/**
 * The three managed lists — muted, contacts, word list — through one painter.
 *
 * They were three hand-written copies of the same shape: count in the header,
 * clear the box, an empty-state row, then a row per item. The copies had already
 * drifted — the word list had no empty state at all, so deleting every term left
 * a card showing nothing with no explanation. That is what a fourth copy would
 * have got wrong too.
 *
 * Row contents stay per-list, because that is the part that genuinely differs:
 * one button, two buttons, a suffix. Only the frame is shared.
 */
function mkRow(...kids) {
  const r = document.createElement("div");
  r.className = "row";
  r.append(...kids);
  return r;
}

function mkLabel(text, cls = "name sub") {
  const s = document.createElement("span");
  s.className = cls;
  s.textContent = text;
  return s;
}

function mkLink(text, onclick) {
  const b = document.createElement("button");
  b.className = "link";
  b.textContent = text;
  b.onclick = onclick;
  return b;
}

/**
 * @param {string} box    selector for the container
 * @param {string} head   selector for the heading that carries the count
 * @param {string} name   heading text without the count
 * @param {Array} items
 * @param {string} empty  what to say when there are none
 * @param {(item:any)=>HTMLElement} build  one row
 */
function paintCard(box, head, name, items, empty, build) {
  $(head).textContent = items.length ? `${name} — ${items.length}` : name;
  const b = $(box);
  b.textContent = "";
  b.append(...(items.length ? items.map(build) : [mkRow(mkLabel(empty))]));
}

/**
 * Who you have muted, and a way back.
 *
 * Shows the same eight characters the chat shows, because that is what somebody
 * would recognise — they never saw the whole key. Unmuting is one click, and the
 * list repaints from main rather than from a local copy, so it cannot drift.
 */
async function paintMuted() {
  const keys = await guard("muteList", () => window.auralfm.muteList(), []);
  paintCard("#mutedlist", "#muted-head", T["set.muted"] || "Muted", keys,
    T["set.mutedNone"] || "Nobody. Click a name in the chat to mute them.",
    (key) => mkRow(
      mkLabel(key.slice(0, 8), "name sub mono"),
      mkLink(T["set.unmute"] || "Unmute", async () => {
        await guard("muteRemove", () => window.auralfm.muteRemove(key));
        paintMuted();
      })));
}

/**
 * Favorites and verification.
 *
 * Three independent facts per person and no attempt to summarise them into one
 * status, because they mean different things: you kept them, they kept you back,
 * and you checked their fingerprint face to face. Only the last one is a claim
 * about a human being, and it is the only control here that is not a toggle of
 * something the app already knows — it is a statement by the person clicking it.
 */
async function paintContacts() {
  const list = await guard("socialList", () => window.auralfm.socialList(), []);
  paintCard("#contactlist", "#contacts-head", T["set.contacts"] || "People you keep", list,
    T["set.contactsNone"] || "Nobody yet. /fav <name> in the chat keeps somebody.",
    (c) => {
      // The label they gave, then the key stub — which is what they saw in chat.
      const who = mkLabel((c.label ? `${c.label} · ` : "") + c.pubkey.slice(0, 8)
        + (c.mutual ? " ↔" : "") + (c.verified ? " ✓" : ""), "name sub mono");
      // The two marks in the name are shorthand; this is what they actually claim.
      who.title = [
        c.mutual ? (T["set.mutualNote"] || "You keep each other.") : null,
        c.verified ? (T["set.verifiedNote"] || "Fingerprint verified by you.") : null,
      ].filter(Boolean).join(" ");

      const keep = mkLink(c.favorite ? (T["set.unfav"] || "Release") : (T["set.fav"] || "Keep"),
        async () => {
          await guard("socialFavorite", () => window.auralfm.socialFavorite(c.pubkey, !c.favorite));
          paintContacts();
        });

      const verify = mkLink(c.verified ? (T["set.unverify"] || "Unverify") : (T["set.verify"] || "Verify"),
        async () => {
          if (!c.verified) {
            const fp = await guard("fp", () => window.auralfm.socialFingerprint(c.pubkey), null);
            // The confirm carries the fingerprint, because "verify" with nothing
            // to read is a button that manufactures trust out of a click.
            if (!confirm((T["set.verifyAsk"]
              || "Mark this person verified?\n\nOnly do this if you have read this fingerprint aloud with them, in person or on a call you already trust:\n\n")
              + (fp?.readable || c.pubkey.slice(0, 16)))) return;
          }
          await guard("socialVerify", () => window.auralfm.socialVerify(c.pubkey, !c.verified));
          paintContacts();
        });

      return mkRow(who, keep, verify);
    });
}

/**
 * The word list.
 *
 * Every term is deletable, shipped ones included, and the list is shown in full
 * rather than summarised as a count. A filter you cannot read is a filter you
 * cannot trust, and this one decides what reaches you.
 */
async function paintFilter() {
  const r = await guard("filterList", () => window.auralfm.filterList(), { terms: [], shipped: [] });
  const shipped = new Set(r.shipped || []);
  paintCard("#filterlist", "#filter-head", T["set.filterList"] || "Word list", r.terms || [],
    T["set.filterNone"] || "Empty. Nothing is being hidden by word.",
    (term) => mkRow(
      // Saying which came with the app and which somebody added themselves, so
      // "Reset" is a predictable button rather than a surprise.
      mkLabel(shipped.has(term) ? term : `${term}  ·  ${T["set.filterYours"] || "yours"}`),
      mkLink(T["set.filterDel"] || "Remove", async () => {
        await guard("filterRemove", () => window.auralfm.filterRemove(term));
        paintFilter();
      })));
}

async function paintFingerprint() {
  const s2 = await guard("presenceStats", () => window.auralfm.presenceStats(), null);
  const el = $("#fingerprint");
  // The fingerprint, not the key. BitChat compares SHA-256 fingerprints rather
  // than raw public keys, and four groups of four is what a person can read
  // aloud to somebody else without losing their place.
  el.textContent = s2?.fingerprint || (T["set.fingerprintNone"] || "not listening yet");
  $("#durablefp").textContent = s2?.durableFingerprint
    || (T["set.durableOff"] || "off — no lasting key exists");
}



async function addTerm() {
  const el = $("#filterterm");
  const v = el.value.trim();
  if (!v) return;
  await guard("filterAdd", () => window.auralfm.filterAdd(v));
  el.value = "";
  paintFilter();
}
$("#filteradd").addEventListener("click", addTerm);
$("#filterterm").addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); addTerm(); }
});
$("#filterreset").addEventListener("click", async () => {
  if (!confirm(T["set.filterResetAsk"]
    || "Put the word list back to the one AuralFM ships with? Your additions and removals are lost.")) return;
  await guard("filterReset", () => window.auralfm.filterReset());
  paintFilter();
});
$("#filterChat").addEventListener("click", () => set({ filterChat: P.filterChat === false }));
$("#powFloor").addEventListener("change", (e) => set({ powFloor: Number(e.target.value) || 0 }));
$("#onlyKept").addEventListener("click", () => set({ onlyKept: P.onlyKept !== true }));

/**
 * Turning the durable identity on and off.
 *
 * Off is the destructive direction, so that is the one that asks. Creating a key
 * is reversible; destroying it is not, and anyone who wrote your fingerprint down
 * has just lost the thing it pointed at.
 */
$("#durableIdentity").addEventListener("click", async () => {
  const on = P.durableIdentity !== true;
  if (!on && !confirm(T["set.durableOffAsk"]
    || "Destroy your lasting identity?\n\nThe key is deleted from this Mac and cannot be recovered. "
     + "Anyone who verified your fingerprint will find that nothing answers to it, and people who kept you will lose the link.")) return;
  await set({ durableIdentity: on });
  paintFingerprint();
});

$("#panic").addEventListener("click", async () => {
  if (!confirm(T["set.panicAsk"] ||
    "Erase favourites, listening history, the mute list and every key this session used? This cannot be undone.")) return;
  const done = await guard("panicWipe", () => window.auralfm.panicWipe(), []);
  P = await guard("prefs", () => window.auralfm.getPrefs(), P);
  paint(); paintMine(); paintPresence(); paintFingerprint(); paintMuted(); paintContacts();
  paintFilter();
  alert((T["set.panicDone"] || "Erased.") + " " + (done || []).join(", "));
});

// Clears the "seen it" flag and reopens the globe, where the tour runs itself.
$("#replayTour").addEventListener("click", async () => {
  await guard("replayTour", () => window.auralfm.setPrefs({ tourSeen: false }));
  window.auralfm.openExplore?.();
});

$("#language").addEventListener("change", (e) => set({ language: e.target.value }));

/**
 * Everything you have added, in one place.
 *
 * Adding stays on the globe, where you are looking at the place it belongs to.
 * Managing belongs here, because until now the only way to remove one was to
 * navigate back to its place and find it — fine for one station, useless for
 * twenty. Creation is contextual; management is central.
 *
 * The section hides itself when empty rather than showing an empty state: a
 * heading for a feature you have not used yet is just clutter.
 */
async function paintMine() {
  const list = await guard("mineList", () => window.auralfm.mineList(), []);
  const sec = $("#minesec"), box = $("#minelist");
  sec.hidden = !list.length;
  box.innerHTML = "";
  for (const st of list) {
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `<span class="name"><b></b><span class="sub"></span></span>
                     <button class="rm"></button>`;
    row.querySelector("b").textContent = st.title;
    row.querySelector(".sub").textContent = st.place
      ? `${st.place}${st.country ? " · " + st.country : ""}`
      : (T["set.mineNoPlace"] || "no place");
    const rm = row.querySelector(".rm");
    rm.textContent = T["set.remove"] || "Remove";
    /* Same grace period as the station list in Explore, and for the same
       reason: this deletes a hand-typed stream URL with nothing behind it. The
       station is not touched until the window expires, so its id survives and
       any favourite keyed to it survives with it. */
    rm.onclick = () => {
      if (rm.dataset.arming) return;
      rm.dataset.arming = "1";
      row.style.opacity = ".62";
      row.querySelector("b").style.textDecoration = "line-through";
      const label = rm.textContent;
      rm.textContent = T["set.undo"] || "Undo";
      const commit = setTimeout(async () => {
        await guard("mineRemove", () => window.auralfm.mineRemove(st.id));
        paintMine();
      }, 6000);
      rm.onclick = () => { clearTimeout(commit); paintMine(); };
    };
    box.append(row);
  }
}
window.auralfm.onMineChanged(() => paintMine());

async function paintPalettes() {
  const list = await guard("palettes", () => window.auralfm.palettes(), []);
  const box = $("#palettes");
  box.innerHTML = "";
  for (const p of list) {
    const b = document.createElement("button");
    b.className = "pal";
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", String(P.palette === p.id));
    b.innerHTML = `<span class="swatch"><i></i><i></i><i></i></span>
                   <span class="nm"></span>`;
    [...b.querySelectorAll(".swatch i")].forEach((i, k) => { i.style.background = p.swatch[k]; });
    b.querySelector(".nm").textContent = p.name;
    // No tag. Three of these used to read "Supporter" against a paywall that
    // was never switched on and now never will be — see src/palettes.js. A
    // label implying a tier that does not exist is worse than no label.
    b.onclick = () => set({ palette: p.id });
    box.append(b);
  }
}

/**
 * The app icon picker.
 *
 * Deliberately its own section rather than a row inside Colour: the palette
 * recolours what is drawn over the Earth, and this changes what sits in the
 * Dock. Related, not the same thing, and neither follows light or dark.
 *
 * The swatch is the real 512px icon scaled down, not an approximation of it,
 * because the whole question somebody is answering here is "which of these do I
 * want to look at".
 */
const APP_ICONS = [
  ["onyx",  "Onyx"],
  ["bone",  "Bone"],
  ["onair", "On Air"],
  ["earth", "Earth"],
];

function paintAppIcons() {
  const box = $("#appicons");
  box.innerHTML = "";
  for (const [id, name] of APP_ICONS) {
    const b = document.createElement("button");
    b.className = "ico";
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", String((P.appIcon || "onyx") === id));
    b.innerHTML = `<img alt="" width="44" height="44" src="../../assets/generated/dock-${id}.png"><span class="nm"></span>`;
    b.querySelector(".nm").textContent = name;
    b.onclick = () => set({ appIcon: id });
    box.append(b);
  }
}

$("#presence").addEventListener("click", () => set({ presence: !P.presence }));

/**
 * Say what is actually happening, not just that the switch is on. "Announcing to
 * 3 relays, 0 listeners nearby" is the difference between a feature that looks
 * broken and one that is honestly reporting an empty room — which is what this
 * will be at first.
 */
async function paintPresence() {
  paintRelays();
  const el = $("#presence-status");
  if (!P.presence) { el.textContent = ""; return; }
  const s = await guard("presenceStats", () => window.auralfm.presenceStats(), null);
  if (!s) { el.textContent = ""; return; }
  el.textContent = s.announcing
    ? `${s.connected}/${s.relays} ${T["set.presenceRelays"] || "relays"} · ` +
      `${s.peers} ${s.peers === 1 ? (T["set.presenceOne"] || "listener") : (T["set.presenceMany"] || "listeners")}`
    : (T["set.presenceIdle"] || "Waiting for something to play.");
}
setInterval(() => { if (!document.hidden) paintPresence(); }, 4000);

/**
 * The relays, listed.
 *
 * "Decentralised" is a claim, and a claim you cannot inspect is a slogan. This
 * is the list the app is dialling right now, marked so you can tell which ones
 * you chose and which we picked for you, with the connected ones distinguished
 * from the ones that are refusing — because relays refuse constantly and a list
 * that hid that would be flattering rather than true.
 */
async function paintRelays() {
  const box = $("#relaylist"), card = $("#relaycard");
  if (!box) return;
  const s = P.presence ? await guard("presenceStats", () => window.auralfm.presenceStats(), null) : null;
  const urls = s?.relayUrls || [];
  const mine = new Set(s?.extra || []);
  card.style.display = P.presence ? "" : "none";
  if (!P.presence) return;

  // Counting to zero is worse than not counting. Before anything plays there are
  // no relays to have, because they are chosen from the place you are listening
  // to — so the heading is just "Relays" and the row underneath says why it is
  // empty. Saying it in both places is what made this section confusing.
  $("#relay-head").textContent = urls.length
    ? `${T["set.relays"] || "Relays"} — ${s?.connected ?? 0}/${urls.length} ${T["set.relayConnected"] || "connected"}`
    : (T["set.relays"] || "Relays");

  box.innerHTML = "";
  if (!urls.length) {
    const r = document.createElement("div");
    r.className = "row";
    r.innerHTML = `<span class="name sub"></span>`;
    r.querySelector(".sub").textContent = T["set.relayNone"] || "Nothing dialled yet — play something.";
    box.append(r);
    return;
  }
  // The read-only spread is dozens of hosts nobody needs to read one by one:
  // listed are the relays this place publishes to, and the rest is one line.
  const readOnly = new Set(s?.readOnly || []);
  for (const url of urls.filter((u) => !readOnly.has(u))) {
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `<span class="name sub"></span><span class="tag"></span>`;
    row.querySelector(".sub").textContent = url.replace(/^wss:\/\//, "");
    const tag = row.querySelector(".tag");
    if (mine.has(url)) {
      tag.textContent = T["set.relayYours"] || "yours";
      const x = document.createElement("button");
      x.textContent = "×";
      x.title = T["set.relayRemove"] || "Remove";
      // The glyph is the content, so without this the name is "times".
      x.setAttribute("aria-label", `${x.title} ${url.replace(/^wss:\/\//, "")}`);
      x.onclick = async () => {
        await set({ relays: (P.relays || []).filter((u) => u !== url) });
        paintRelays();
      };
      row.append(x);
    }
    box.append(row);
  }
  if (readOnly.size) {
    const r = document.createElement("div");
    r.className = "row";
    r.innerHTML = `<span class="name sub"></span>`;
    r.querySelector(".sub").textContent =
      (T["set.relayCoverage"] || "+ {n} more around the world, read only — so chat and listeners anywhere on the globe reach you")
        .replace("{n}", readOnly.size);
    box.append(r);
  }
}
setInterval(() => { if (!document.hidden) paintRelays(); }, 6000);

function showRelayError(message) {
  const input = $("#relay-add"), err = $("#relay-err");
  err.textContent = message || "";
  err.hidden = !message;
  if (message) input.setAttribute("aria-invalid", "true");
  else input.removeAttribute("aria-invalid");
}
$("#relay-add").addEventListener("input", () => showRelayError(null));
$("#relay-add").addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); $("#relay-btn").click(); }
});

$("#relay-btn").addEventListener("click", async () => {
  const input = $("#relay-add");
  const url = input.value.trim();
  // Checked here for the message, and again in presence-nostr because a
  // renderer is not where a security rule belongs.
  // What was typed stays, so it can be corrected rather than retyped.
  if (!/^wss:\/\/[a-z0-9.-]+(:\d{1,5})?(\/\S*)?$/i.test(url)) {
    showRelayError(T["set.relayBad"] || "Must start with wss://");
    input.focus();
    return;
  }
  showRelayError(null);
  const next = [...new Set([...(P.relays || []), url])].slice(0, 8);
  await set({ relays: next });
  input.value = "";
  paintRelays();
});

Icons.set($("#privacy"), "disclose");
Icons.set($("#terms"), "disclose");
Icons.set($("#licences"), "disclose");   // was missing entirely

$("#mail").addEventListener("click", () => window.auralfm.openMail());
/* ── documents ────────────────────────────────────────────────────────────────
   Privacy, Terms and the licences, read in a panel instead of being handed to
   whatever the OS opens .md files with.

   There was a Help section here listing eight documents with a search box. It
   was the wrong content: a person who has downloaded a radio app cannot
   contribute to it, there is nowhere in it to enforce a code of conduct, and a
   post-mortem on a removed feature is a decision record rather than help. Help
   will mean how to use the app -- what shortwave is, what the bands do, how the
   chat works -- and until that is written there is none. */
let DOCBODY = new Map();

async function loadDocs() {
  for (const d of (await guard("docsList", () => window.auralfm.docsList(), [])) || []) {
    const doc = await guard("docsRead", () => window.auralfm.docsRead(d.id), null);
    if (doc) DOCBODY.set(d.id, doc);
  }
}

// What opened the reader, so closing it puts focus back there rather than on
// nothing. The settings list goes inert while it is open: aria-modal only tells
// a screen reader, and Tab was walking into the controls hidden underneath.
let docOpener = null;

function openDocView(id) {
  const doc = DOCBODY.get(id);
  if (!doc) return;
  docOpener = document.activeElement;
  $("main").inert = true;
  $("#doctitle").textContent = doc.title;
  // Built in the main process from a fixed tag set with everything escaped
  // first, so a document cannot contribute markup of its own.
  $("#docbody").innerHTML = doc.html;
  $("#docs").classList.add("open");
  $("#docbody").scrollTop = 0;
  $("#docbody").focus();
}

function closeDocView() {
  $("#docs").classList.remove("open");
  $("#docbody").textContent = "";
  $("main").inert = false;
  docOpener?.focus();
  docOpener = null;
}

$("#docback").addEventListener("click", closeDocView);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && $("#docs").classList.contains("open")) {
    e.preventDefault();
    closeDocView();
  }
});

$("#privacy").addEventListener("click", () => openDocView("privacy"));
$("#terms").addEventListener("click", () => openDocView("terms"));
$("#licences").addEventListener("click", () => openDocView("licences"));

(async () => {
  const [prefs, strings, langs, version, pals] = await Promise.all([
    window.auralfm.getPrefs(),
    window.auralfm.strings(),
    window.auralfm.languages(),
    window.auralfm.version(),
    window.auralfm.palettes(),
  ]);
  P = prefs; T = strings; PALS = pals;
  await paintPalettes();
  paintAppIcons();
  await paintMine();

  const sel = $("#language");
  const sys = document.createElement("option");
  sys.value = "system";
  sys.textContent = T["set.language.system"] || "System";
  sel.append(sys);
  for (const l of langs) {
    const o = document.createElement("option");
    o.value = l.code; o.textContent = l.name;
    sel.append(o);
  }

  // `version` is an object now: {version, channel, dev}. A release shows nothing
  // but the number; anything else says what it is, so a bug report from a tester
  // arrives with the channel already in it.
  const v = typeof version === "string" ? { version } : (version || {});
  const mark = v.dev ? " · development" : v.channel ? ` · ${v.channel}` : "";
  $("#ver").textContent = "AuralFM " + (v.version || "") + mark;
  translate();
  paint();
  loadDocs();
})();
