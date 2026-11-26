/**
 * Explore, the listening room's way in and its host panel.
 *
 * The room (room.html, src/main/ipc-room.js) is the globe full screen on a
 * second display, a backdrop for people lying under it. Nobody there can press
 * anything, so it is steered from here.
 *
 * The way in is a small tag in the globe's corner whose dot breathes in the
 * theme's colour, not another toolbar button. Once the room is open the tag
 * gives way to the panel: how the room moves (Follow, Favourites, Drift, Dial),
 * what is up next, the town before, the next town, the next station in this
 * town, the listener's favourites to play into it, and the way out. Playing
 * anything in Explore while the room follows turns the room there too.
 *
 * Desktop only: the web build has no second window, so the tag stays hidden
 * where the bridge has no `roomOpen`.
 */
let roomOpenNow = false, roomMode = "follow", roomFavKey = "";

function paintRoomPanel(s = {}) {
  if ("open" in s) roomOpenNow = !!s.open;
  if (s.mode) roomMode = s.mode;
  const panel = $("roompanel"), btn = $("roomBtn");
  if (!panel || !btn) return;
  panel.hidden = !roomOpenNow;
  btn.hidden = roomOpenNow || typeof window.auralfm.roomOpen !== "function";
  for (const b of $("roommode").querySelectorAll("button[data-mode]")) {
    const on = b.dataset.mode === roomMode;
    b.setAttribute("aria-pressed", String(on));
    b.tabIndex = on ? 0 : -1;
  }
  const timed = roomMode === "drift" || roomMode === "favs";
  $("roomdriftrow").hidden = !timed;
  $("roomdriftrow").querySelector("label").textContent = roomMode === "favs"
    ? t("room.everyFav", "A new one every") : t("room.every", "A new town every");
  if (Number.isFinite(s.driftMin)) $("roomdrift").value = String(s.driftMin);
  const left = Number(s.left) || 0, clock = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  const n = String(s.driftMin ?? $("roomdrift").value);
  $("roomsay").textContent = roomMode === "drift" ? t("room.sayDrift", "A new town every {n} min. Next in {t}.").replace("{n}", n).replace("{t}", clock)
    : roomMode === "favs" ? (s.favourites && !s.favourites.length ? t("room.noFavs", "No favorites yet. Star a station to add it.")
      : t("room.sayFavs", "Your favorites, one after another. A new one every {n} min. Next in {t}.").replace("{n}", n).replace("{t}", clock))
    : roomMode === "dial" ? t("room.sayDial", "The arrows, the wheel or a knob turn the dial west to east.")
    : t("room.sayFollow", "Play anything here and the room turns there.");
  if ("upNext" in s) {
    $("roomnextline").hidden = !s.upNext;
    $("roomnextname").textContent = s.upNext ? [plainPlace(s.upNext.place, s.upNext.country), s.upNext.title].filter(Boolean).join(" · ") : "";
  }
  if (Array.isArray(s.favourites)) paintRoomFavs(s.favourites);
  if ("external" in s) $("roomwhere").textContent = t("room.on", "On {screen}").replace("{screen}",
    s.external ? t("room.secondScreen", "the second screen") : t("room.thisScreen", "this screen"));
}

/** The listener's favourites, to play into the room one at a time. Redrawn only when the list changes. */
function paintRoomFavs(list) {
  const key = list.map((f) => f.id).join("|");
  if (key === roomFavKey) return;
  roomFavKey = key;
  const ul = $("roomfavlist");
  ul.textContent = "";
  if (!list.length) {
    const li = document.createElement("li");
    li.className = "roomsay";
    li.textContent = t("room.noFavs", "No favorites yet. Star a station to add it.");
    ul.append(li);
    return;
  }
  for (const f of list) {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.id = f.id;
    const name = document.createElement("span");
    name.textContent = f.title || plainPlace(f.place, f.country);
    const where = document.createElement("small");
    where.textContent = plainPlace(f.place, f.country);
    b.append(name, where);
    li.append(b);
    ul.append(li);
  }
}

function wireRoom() {
  const api = window.auralfm;
  const btn = $("roomBtn");
  if (!btn || typeof api.roomOpen !== "function") return;   // the web: no room
  btn.hidden = false;
  $("roommode").setAttribute("aria-label", t("room.how", "How the room moves"));
  btn.onclick = () => api.roomOpen();
  $("roommode").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-mode]");
    if (b) api.roomCommand("mode", b.dataset.mode);
  });
  // One Tab stop for the four, arrows between them.
  $("roommode").addEventListener("keydown", (e) => {
    const all = [...$("roommode").querySelectorAll("button[data-mode]")];
    const at = all.findIndex((b) => b.dataset.mode === roomMode);
    const to = { ArrowRight: at + 1, ArrowDown: at + 1, ArrowLeft: at - 1, ArrowUp: at - 1, Home: 0, End: all.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    const b = all[(to + all.length) % all.length];
    api.roomCommand("mode", b.dataset.mode);
    b.focus();
  });
  $("roomprev").onclick = () => api.roomCommand("prev");
  $("roomnext").onclick = () => api.roomCommand("next");
  $("roomhere").onclick = () => api.roomCommand("here");
  $("roomdrift").onchange = () => api.roomCommand("drift", Number($("roomdrift").value));
  $("roomfavlist").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-id]");
    if (b) api.roomCommand("play", b.dataset.id);
  });
  $("roomleave").onclick = () => api.roomClose();
  api.onRoomStatus?.((s) => {
    const opening = s?.open && !roomOpenNow;
    paintRoomPanel(s || {});
    if (s?.open && s.mode === undefined) api.roomCommand("status");
    // The room has just opened: the keyboard goes to the panel that steers it.
    if (opening) $("roommode").querySelector('button[aria-pressed="true"]')?.focus();
  });
  api.roomIsOpen?.().then((open) => { paintRoomPanel({ open }); if (open) api.roomCommand("status"); }).catch(() => {});
}
