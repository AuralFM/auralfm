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
  paintPresence();
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
    b.innerHTML = `<span class="sw"><i></i><i></i><i></i></span>
                   <span class="nm"></span>`;
    [...b.querySelectorAll(".sw i")].forEach((i, k) => { i.style.background = p.swatch[k]; });
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

  $("#relay-head").textContent =
    `${T["set.relays"] || "Relays"} — ${s?.connected ?? 0}/${urls.length} ${T["set.relayConnected"] || "connected"}`;

  box.innerHTML = "";
  if (!urls.length) {
    const r = document.createElement("div");
    r.className = "row";
    r.innerHTML = `<span class="name sub"></span>`;
    r.querySelector(".sub").textContent = T["set.relayNone"] || "Nothing dialled yet — play something.";
    box.append(r);
    return;
  }
  for (const url of urls) {
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
      x.onclick = async () => {
        await set({ relays: (P.relays || []).filter((u) => u !== url) });
        paintRelays();
      };
      row.append(x);
    }
    box.append(row);
  }
}
setInterval(() => { if (!document.hidden) paintRelays(); }, 6000);

$("#relay-btn").addEventListener("click", async () => {
  const input = $("#relay-add");
  const url = input.value.trim();
  // Checked here for the message, and again in presence-nostr because a
  // renderer is not where a security rule belongs.
  if (!/^wss:\/\/[a-z0-9.-]+(:\d{1,5})?(\/\S*)?$/i.test(url)) {
    input.setAttribute("aria-invalid", "true");
    input.placeholder = T["set.relayBad"] || "Must start with wss://";
    input.value = "";
    return;
  }
  input.removeAttribute("aria-invalid");
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

function openDocView(id) {
  const doc = DOCBODY.get(id);
  if (!doc) return;
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
