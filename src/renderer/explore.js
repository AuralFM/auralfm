const $ = (id) => document.getElementById(id);
const placeListEl=$("placelist"), stationListEl=$("stationlist"), qEl=$("q"),
      placeHeadEl=$("placehead"), headEl=$("head");

/**
 * Selection lives here, above the view, not inside it. The Globe view in the
 * next phase renders the same `selection` and calls the same selectPlace() —
 * switching views must never lose your place.
 */
const selection = { placeIndex: null, place: null, channels: [] };

/**
 * Where you have been.
 *
 * Named `journey` rather than `history` because `window.history` is a real
 * global and shadowing it is the kind of trap that costs somebody an afternoon.
 *
 * A stack rather than a "last place" field, because the interesting thing about
 * listening across a globe is the route, not the previous stop. Back and
 * forward behave the way a browser's do: going back does not truncate, going
 * somewhere new from the middle does.
 *
 * Capped at 50. This exists to be walked, not archived, and an unbounded array
 * of every place clicked in a session is a memory leak with a nice name.
 *
 * `travelling` guards the obvious trap: selectPlace is what pushes, and back
 * and forward call selectPlace, so without it every step backwards would
 * append itself and the stack would grow while you walked it.
 */
const journey = { stack: [], at: -1 };
let travelling = false;

function pushJourney(i, place) {
  if (travelling) return;
  if (journey.stack[journey.at]?.i === i) return;      // same place twice is not a journey
  journey.stack.length = journey.at + 1;               // a new turn drops the forward path
  journey.stack.push({ i, title: place.title, lat: place.lat, lon: place.lon });
  if (journey.stack.length > 50) journey.stack.shift();
  journey.at = journey.stack.length - 1;
}

async function travel(step) {
  const to = journey.at + step;
  if (to < 0 || to >= journey.stack.length) return;
  travelling = true;
  journey.at = to;
  try { await goToPlace(journey.stack[to].i); }
  finally { travelling = false; }
  paintDistance();
}

/**
 * How far the last hop was.
 *
 * Deliberately the distance from the previous place rather than from the
 * listener: the app does not know where the listener is and is not going to
 * find out. This measures the journey across the map, which is the thing that
 * is actually happening.
 */
async function paintDistance() {
  const el = $("hop");
  if (!el) return;
  const here = journey.stack[journey.at], prev = journey.stack[journey.at - 1];
  if (!here || !prev) { el.textContent = ""; el.hidden = true; return; }
  // Await, then check the stack has not moved. Two quick selections would
  // otherwise race and paint the older answer over the newer one.
  const at = journey.at;
  const d = await window.auralfm.distance(prev.lat, prev.lon, here.lat, here.lon, prefs.units);
  if (journey.at !== at) return;
  el.textContent = `${d} from ${prev.title}`;
  el.hidden = false;
}
let favorites = [];
let playing = null;          // channel currently playing, per the popover
let debounce = null, seq = 0;

const isFav = (id) => favorites.some((f) => f.id === id);

/**
 * The third state, for any list that can be waited on.
 *
 * Loading and empty were the only two states these lists had. A rejected IPC
 * left whatever was on screen before, which reads as the click having done
 * nothing — the worst of the three, because there is no way to tell it from a
 * slow network and nothing to press.
 *
 * Only for surfaces somebody is waiting on. The background polls — weather,
 * clouds, flights, the ISS — are best-effort by design and degrade by drawing
 * nothing; a retry button for a 4Hz tick would be noise.
 */
function failureInto(el, message, retry) {
  el.textContent = "";
  const box = document.createElement("div");
  box.className = "failed";
  box.setAttribute("role", "status");
  const p = document.createElement("p");
  p.textContent = message;
  box.append(p);
  if (retry) {
    const again = document.createElement("button");
    again.className = "retry";
    again.textContent = t("action.retry", "Try again");
    again.onclick = retry;
    box.append(again);
  }
  el.append(box);
}

// ── places ───────────────────────────────────────────────────────────────────
async function loadPlaces(query = "") {
  const my = ++seq;
  const res = await guard("places", () => window.auralfm.places(query, 400), null);
  if (my !== seq) return;
  if (!res) {
    placeListEl.hidden = false;
    stationListEl.hidden = true;
    placeHeadEl.textContent = "";
    failureInto(placeListEl, t("places.unreachable", "Could not load places."),
                () => loadPlaces(query));
    return;
  }
  const { total, places } = res;
  placeHeadEl.textContent = `${total.toLocaleString()} places · most stations first`;
  placeListEl.hidden = false;
  stationListEl.hidden = true;
  placeListEl.innerHTML = "";
  if (!places.length) {
    placeListEl.innerHTML = `<div class="empty" style="padding:32px 16px">${t("empty.noPlace", "No place matches that.")}</div>`;
    return;
  }
  for (const p of places) {
    const el = document.createElement("div");
    el.className = "place";
    el.dataset.i = p.i;
    el.setAttribute("aria-selected", p.i === selection.placeIndex);
    el.innerHTML = `<span class="pmeta"><div class="pn"></div><div class="pc"></div></span>
                    <span class="cnt"></span>`;
    el.querySelector(".pn").textContent = p.title;
    el.querySelector(".pc").textContent = p.country;
    el.querySelector(".cnt").textContent = p.count;
    el.onclick = () => goToPlace(p.i);
    placeListEl.appendChild(el);
  }
  markPlaceSelection();
}

/**
 * Mark the selected place by index, not by comparing display text — the globe
 * can select a place that the list is currently filtered away from, and text
 * matching silently failed in exactly that case.
 */
function markPlaceSelection({ scroll = false } = {}) {
  let hit = null;
  for (const el of placeListEl.children) {
    if (!el.dataset?.i) continue;
    const on = Number(el.dataset.i) === selection.placeIndex;
    el.setAttribute("aria-selected", on);
    if (on) hit = el;
  }
  if (hit && scroll) hit.scrollIntoView({ block: "nearest" });
  return hit;
}

async function selectPlace(i, { keepFilter = false } = {}) {
  window.Tip?.donate("placeSelected");
  if (!keepFilter) filter = { band: null, tag: null };   // a new place starts unfiltered
  const res = await guard("placeChannels", () => window.auralfm.placeChannels(i, filter), null);
  if (!res) {
    stationListEl.hidden = false;
    placeListEl.hidden = true;
    failureInto(stationListEl, t("stations.unreachable", "Could not load stations for this place."),
                () => selectPlace(i, { keepFilter }));
    return;
  }
  const { place, channels, total } = res;
  if (!place) return;
  selection.placeIndex = i;
  selection.place = place;
  selection.channels = channels;
  selection.total = total;
  pushJourney(i, place);
  paintDistance();
  markPlaceSelection({ scroll: true });
  renderStations();
  renderChips();
  loadWeather(place);
  if (newsOpen) renderNewsPanel();
  refreshGlobeSelection();
}

// ── filters ──────────────────────────────────────────────────────────────────
// Band comes from the station name, the only signal available, so ~46% of
// channels have no band at all. Those are excluded from AM/FM rather than
// guessed at — which is why the counts never add up to the total, by design.
let filter = { band: null, tag: null };

async function renderChips() {
  const el = $("chips");
  el.innerHTML = "";
  if (selection.placeIndex == null) return;
  const facets = await guard("placeFacets",
    () => window.auralfm.placeFacets(selection.placeIndex), null);

  const chip = (label, active, onClick) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.setAttribute("aria-pressed", active);
    b.onclick = onClick;
    el.appendChild(b);
  };

  const anyFilter = filter.band || filter.tag;
  chip("All", !anyFilter, () => setFilter({ band: null, tag: null }));
  if (facets.bands.fm) chip(`FM ${facets.bands.fm}`, filter.band === "fm",
    () => setFilter({ band: filter.band === "fm" ? null : "fm", tag: filter.tag }));
  if (facets.bands.am) chip(`AM ${facets.bands.am}`, filter.band === "am",
    () => setFilter({ band: filter.band === "am" ? null : "am", tag: filter.tag }));
  for (const { tag, n } of facets.tags) {
    chip(`${tag} ${n}`, filter.tag === tag,
      () => setFilter({ band: filter.band, tag: filter.tag === tag ? null : tag }));
  }
}

async function setFilter(next) {
  filter = next;
  await selectPlace(selection.placeIndex, { keepFilter: true });
}

// ── stations ─────────────────────────────────────────────────────────────────
/**
 * A place offers two different things to listen to, and they are not
 * interchangeable: the stations broadcasting *from* there, and the shortwave
 * receivers near there that let you hear what the sky sounds like *over* there.
 *
 * Before this, the receivers existed only as dots on the globe, so the only way
 * to reach one was to hit a 4-pixel target — and in somewhere like Los Angeles
 * they are buried under a hundred station dots. A place with receivers nearby
 * now says so, and you can switch.
 */
let railMode = "stations";        // stations | shortwave

function renderRailTabs(nearby) {
  const tabs = $("railtabs");
  tabs.innerHTML = "";
  // Two different kinds of absent, and they need different mechanisms.
  //
  // Before anything is selected the tabs are genuinely not there, which is the
  // `hidden` attribute's job. Once a place is selected they are always there —
  // just blank when it has no receivers nearby — because appearing and
  // disappearing moved everything under them by 32px. That is the `ghost` class.
  //
  // Collapsing the two broke it: dropping `hidden` in favour of the class alone
  // left the attribute set from the markup with nothing to clear it, so the tabs
  // never appeared at all.
  tabs.hidden = false;
  tabs.classList.toggle("ghost", !nearby.length);
  tabs.dataset.sel = railMode;   // drives the sliding pill in CSS
  if (!nearby.length) return;
  const mk = (mode, label) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.setAttribute("aria-checked", String(railMode === mode));
    b.setAttribute("role", "radio");
    b.onclick = () => {
      // Belt and braces: the tabs are hidden in the favourites view, but a tab
      // that switches the rail must never leave `showingFavorites` set — the
      // flag also gates globe-follow and the empty state, so a stale `true`
      // goes wrong in three places at once rather than one.
      if (showingFavorites) {
        showingFavorites = false;
        $("favBtn").setAttribute("aria-pressed", "false");
        headEl.hidden = false;
        placeListEl.hidden = true;
        stationListEl.hidden = false;
      }
      railMode = mode;
      // Move the pill here rather than waiting for the re-render: the press
      // should be answered in the same frame it happens, not after the list
      // rebuilds behind it.
      tabs.dataset.sel = mode;
      renderStations();
      syncTunerVisibility();
    };
    tabs.append(b);
  };
  mk("stations", `${t("app.stations", "Stations")} ${selection.total ?? selection.channels.length}`);
  mk("shortwave", `${t("rail.shortwave", "Shortwave")} ${nearby.length}`);
}

/** "#RRGGBB" plus an alpha, as an rgba() string. */
function hexA(hex, a) {
  const n = parseInt(String(hex).replace("#", ""), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Great-circle distance in kilometres, rounded. */
function greatCircleKm(lat1, lon1, lat2, lon2) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(a))));
}

/** Receivers within a day's drive of the selected place, nearest first. */
function nearbyReceivers() {
  if (!selection.place || !sdrPts) return [];
  const { lat, lon } = selection.place;
  return sdrPts
    .map((r) => ({ ...r, km: greatCircleKm(lat, lon, r.lat, r.lng) }))
    .filter((r) => r.km <= 1500)
    .sort((a, b) => a.km - b.km)
    .slice(0, 12);
}

/**
 * Remove a station, but not yet.
 *
 * The delete is real and there is no server-side copy to get it back from: a
 * station in this list is a stream URL somebody typed in by hand. It sat behind
 * a one-character button with no friction at all, which is a stray click away
 * from gone.
 *
 * The grace period is the friction, and it is better here than a confirmation
 * dialog for two reasons. A modal to confirm a "−" is heavier than the action
 * deserves, and more importantly nothing is deleted during the wait, so the
 * station keeps its id. Deleting and re-adding would not: `mine.add` mints a
 * fresh id, favourites are keyed by id, and an undo that silently unfavourites
 * the thing it just restored is worse than no undo.
 *
 * If the window closes first the timer never fires and the station stays. That
 * is the right way round for this to fail.
 */
const REMOVE_GRACE_MS = 6000;

function armRemoval(el, ch) {
  if (el.dataset.arming) return;
  el.dataset.arming = "1";
  el.classList.add("undo");
  el.setAttribute("aria-live", "polite");
  const keep = el.innerHTML;
  el.innerHTML = "";
  const name = document.createElement("span");
  name.className = "smeta";
  name.innerHTML = `<div class="sn"></div><div class="stags"></div>`;
  name.querySelector(".sn").textContent = ch.title;
  name.querySelector(".stags").textContent = t("mine.removed", "removed");
  const undo = document.createElement("button");
  undo.className = "undob";
  undo.textContent = t("mine.undo", "Undo");
  el.append(name, undo);

  const commit = setTimeout(async () => {
    await window.auralfm.mineRemove(ch.id);
    await selectPlace(selection.placeIndex, { keepFilter: true });
  }, REMOVE_GRACE_MS);

  undo.onclick = (e) => {
    e.stopPropagation();
    clearTimeout(commit);
    delete el.dataset.arming;
    el.classList.remove("undo");
    el.removeAttribute("aria-live");
    el.innerHTML = keep;
    // The restored markup is inert HTML; re-render so its buttons work again.
    selectPlace(selection.placeIndex, { keepFilter: true });
  };
}

/**
 * Say "yes, that one" before the network has agreed.
 *
 * The gap this fills is long: `playing` only becomes true once audio actually
 * arrives, which for an internet stream is routinely eight to eleven seconds
 * after the click. Cleared by the player-state handler on either outcome, so a
 * row cannot stay pending once the answer is known.
 */
function markPending(id) {
  for (const el of stationListEl.children) {
    if (el.dataset?.id) el.classList.toggle("pending", el.dataset.id === id);
  }
}

function clearPending() {
  for (const el of stationListEl.children) el.classList?.remove("pending");
}

function renderStations() {
  const { place, channels } = selection;
  syncTunerVisibility();
  // The globe read-out now opens with the selected place; without this it only
  // caught up on the next minute tick, so it showed the previous place for up to
  // sixty seconds after you moved.
  updateSun();
  headEl.hidden = false;
  headEl.querySelector("h2").textContent = place.title;
  const shown = channels.length, total = selection.total ?? shown;
  headEl.querySelector("p").textContent =
    `${place.country} · ` + (shown === total
      ? `${total} station${total === 1 ? "" : "s"}`
      : `${shown} of ${total} stations`);

  // Where this place actually is, and how far it is from what you are hearing.
  // Formatted like the sun read-out so the two agree on what a coordinate looks
  // like in this app.
  const coord = (v, pos, neg) => `${Math.abs(v).toFixed(1)}°${v >= 0 ? pos : neg}`;
  let sub = headEl.querySelector("p").textContent;
  sub += ` · ${coord(place.lat, "N", "S")} ${coord(place.lon, "E", "W")}`;
  if (playing && playing.lat != null && playing.lon != null) {
    const km = greatCircleKm(place.lat, place.lon, playing.lat, playing.lon);
    // Under 20km is the same town by another name; saying "3 km from what's
    // playing" is noise, not information.
    if (km > 20) sub += ` · ${km.toLocaleString()} km from ${playing.title}`;
  }
  headEl.querySelector("p").textContent = sub;

  const nearby = nearbyReceivers();
  if (!nearby.length) railMode = "stations";
  renderRailTabs(nearby);

  if (railMode === "shortwave") return renderNearbyReceivers(nearby);

  stationListEl.innerHTML = "";
  if (!channels.length) {
    stationListEl.innerHTML = (filter.band || filter.tag)
      ? `<div class="empty">${t("empty.noStationsFilter", "No stations match that filter here.")}</div>`
      : `<div class="empty">${t("empty.nothingOnAir", "Nothing on air here.")}</div>`;
    return;
  }
  for (const ch of channels) {
    const el = document.createElement("div");
    el.className = "st";
    el.dataset.id = ch.id;
    el.setAttribute("aria-current", playing?.id === ch.id);
    el.innerHTML = `<span class="smeta"><div class="sn"></div><div class="stags"></div></span>
                    <button class="star${isFav(ch.id) ? " on" : ""}">${Icons.svg(isFav(ch.id) ? "starFill" : "star")}</button>
                    <span class="bars"><i></i><i></i><i></i></span>`;
    el.querySelector(".sn").textContent = ch.title;
    el.querySelector(".stags").textContent = ch.tags.length ? ch.tags.slice(0, 4).join(" · ") : "";
    el.onclick = (e) => {
      if (e.target.closest(".star")) return;
      window.auralfm.tune(ch);           // an explicit pick always plays
      window.Tip?.donate("stationPlayed");
      markPending(ch.id);                // and says so now, not in eleven seconds
      if (locked) setLocked(true);       // and becomes the new locked station
    };
    el.querySelector(".star").onclick = (e) => { e.stopPropagation(); toggleFav(ch); };
    // A station you added can be removed again; one you did not, cannot.
    if (ch.mine) {
      const rm = document.createElement("button");
      rm.className = "rm";
      rm.textContent = "−";
      rm.title = t("mine.remove", "Remove this station");
      rm.onclick = (e) => {
        e.stopPropagation();
        armRemoval(el, ch);
      };
      el.append(rm);
      el.querySelector(".sn").textContent = ch.title;
      el.querySelector(".stags").textContent =
        [t("mine.yours", "added by you"), ...(ch.tags || []).slice(0, 3)].join(" · ");
    }
    stationListEl.appendChild(el);
  }
  stationListEl.appendChild(addStationRow());
  paintNearby();
}

/**
 * What else is within reach, when a place has almost nothing.
 *
 * Most of the 12,296 places carry a handful of stations, so selecting one leaves
 * a couple of rows above a tall blank panel — which reads as something failing
 * to load rather than as a small town honestly having one transmitter.
 *
 * Filling it with neighbours turns a dead end into a direction. It also happens
 * to be the truest thing to put there: radio *is* regional, and the next place
 * over is exactly where a listener in a one-station town would already be
 * pointing their aerial.
 *
 * Only when the list is genuinely short. A city with four hundred stations has
 * no gap to fill and does not need advice.
 */
/**
 * One clickable place row, in the *station* list's idiom.
 *
 * Named `placeSuggestion` rather than the obvious `placeRow`, because that name
 * was already taken by the row the search results use — and a second function
 * declaration silently wins or loses depending on source order. It lost, so
 * these rows rendered in the search list's style with the wrong text, which
 * looked like a CSS problem and was a naming one.
 *
 * The cold open and the nearby list both build this. Writing it twice is how
 * the two quietly drift apart — different padding, different keyboard handling,
 * one of them forgetting `role="button"`. The audit caught the copy.
 */
function placeSuggestion(p, subtitle) {
  const row = document.createElement("div");
  row.className = "st";
  row.setAttribute("role", "button");
  row.tabIndex = 0;
  row.innerHTML = `<span class="smeta"><div class="sn"></div><div class="stags"></div></span>`;
  row.querySelector(".sn").textContent = p.title;
  row.querySelector(".stags").textContent = subtitle;
  const go = () => goToPlace(p.i, { play: false });
  row.addEventListener("click", go);
  row.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); }
  });
  return row;
}

const NEARBY_WHEN_UNDER = 8;
let placeCache = null;

async function paintNearby() {
  const here = selection.place;
  if (!here || selection.channels.length >= NEARBY_WHEN_UNDER) return;
  const mine = selection.placeIndex;

  if (!placeCache) {
    try { placeCache = (await window.auralfm.places("", 900)).places || []; }
    catch { placeCache = []; }
  }
  if (selection.placeIndex !== mine) return;      // selection moved while waiting

  const R = 6371, rad = Math.PI / 180;
  const km = (a, b) => {
    const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
    const h = Math.sin(dLat / 2) ** 2 +
              Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  };

  const near = placeCache
    .filter((p) => p.i !== here.i && p.count > 0)
    .map((p) => ({ ...p, km: km(here, p) }))
    // 1,200 km is a morning's drive at the top end and still the same weather,
    // the same news and usually the same language. Past that it is not "nearby",
    // it is somewhere else.
    .filter((p) => p.km <= 1200)
    .sort((a, b) => b.count - a.count || a.km - b.km)
    .slice(0, 8);
  if (!near.length) return;

  const head = document.createElement("div");
  head.className = "cohead";
  head.textContent = t("near.head", "More within reach");
  stationListEl.append(head);

  for (const p of near) {
    stationListEl.append(placeSuggestion(p, `${Math.round(p.km)} km · ${p.count} ` +
      (p.count === 1 ? t("cold.station", "station") : t("cold.stationsShort", "stations"))));
  }
}

/**
 * "Add a station" at the foot of the list for wherever you are.
 *
 * Deliberately here rather than in a menu: the moment you notice a station is
 * missing is the moment you are looking at the place it should be in, and the
 * place is the one piece of information the form would otherwise have to ask
 * for.
 */
function addStationRow() {
  const row = document.createElement("div");
  row.className = "addst";
  const btn = document.createElement("button");
  btn.textContent = `+ ${t("mine.add", "Add a station here")}`;
  btn.onclick = () => openAddForm(row);
  row.append(btn);
  return row;
}

function openAddForm(row) {
  if (row.querySelector("form")) return;
  row.innerHTML = "";
  const place = selection.place;
  const f = document.createElement("form");
  f.innerHTML =
    `<input name="title" type="text" autocomplete="off" spellcheck="false">
     <input name="url" type="url" autocomplete="off" spellcheck="false">
     <div class="err" hidden></div>
     <div class="acts"><button type="submit"></button><button type="button" class="cancel"></button></div>`;
  const $$ = (n) => f.querySelector(n);
  $$('[name="title"]').placeholder = t("mine.name", "Station name");
  $$('[name="url"]').placeholder = t("mine.url", "Stream URL (http:// or https://)");
  $$("button[type=submit]").textContent = `${t("mine.save", "Add to")} ${place.title}`;
  $$(".cancel").textContent = t("mine.cancel", "Cancel");
  $$(".cancel").onclick = () => { row.replaceWith(addStationRow()); };

  f.onsubmit = async (e) => {
    e.preventDefault();
    const err = $$(".err");
    err.hidden = true;
    const res = await window.auralfm.mineAdd({
      title: $$('[name="title"]').value,
      url: $$('[name="url"]').value,
      placeIndex: selection.placeIndex,
    });
    if (!res.ok) { err.textContent = res.error; err.hidden = false; return; }
    await selectPlace(selection.placeIndex, { keepFilter: true });
    // It exists now, so the globe should know: a place with no stations before
    // has a dot it did not have.
    globePts = (await guard("globePoints", () => window.auralfm.globePoints(), []))
      .map(([i, lng, lat, count]) => ({ i, lng, lat, count }));
    applyLod(true);
    window.auralfm.tune(res.station);      // adding one is asking to hear it
  };
  row.append(f);
  $$('[name="title"]').focus();
}

async function toggleFav(ch) {
  // Donated before the write, because the tip it retires is about the gesture
  // rather than about the file having been saved.
  if (!isFav(ch.id)) window.Tip?.donate("favoriteAdded");
  const state = (await window.auralfm.getState()) || {};
  favorites = Array.isArray(state.favorites) ? state.favorites : [];
  const i = favorites.findIndex((f) => f.id === ch.id);
  if (i >= 0) favorites.splice(i, 1);
  else favorites.push({ id:ch.id, title:ch.title, place:ch.place, country:ch.country, secure:ch.secure });
  state.favorites = favorites;
  await window.auralfm.setState(state);
  renderStations();
}

// ── playback (observed, never performed here) ────────────────────────────────
/**
 * Point the on-air dot at the signal.
 *
 * dBm in, a 0..1 quality out. The window is −105 to −55: below −105 a broadcast
 * is in the noise and above −55 it is as good as it gets on shortwave, so
 * anything outside that range has nothing left to say. Clamped rather than
 * scaled, because the interesting resolution is all in the middle.
 *
 * The two outputs are deliberately linked. `--pulse-min` is how far the dot
 * falls — near 1 it barely moves. `--pulse-dur` is how fast — a fading signal
 * hurries. Together they read as "struggling" without anyone being told.
 */
function paintSignal(rssi) {
  const dot = $("dot");
  if (!dot) return;
  if (rssi == null || !Number.isFinite(rssi)) {
    // An internet stream. Steady, and no invented number.
    dot.classList.remove("sig");
    dot.style.removeProperty("--pulse-min");
    dot.style.removeProperty("--pulse-dur");
    return;
  }
  const q = Math.max(0, Math.min(1, (rssi + 105) / 50));
  dot.classList.add("sig");
  // Strong -> falls only to 0.88 and takes 2.6s. Weak -> falls to 0.12, 0.55s.
  dot.style.setProperty("--pulse-min", (0.12 + q * 0.76).toFixed(3));
  dot.style.setProperty("--pulse-dur", (0.55 + q * 2.05).toFixed(2) + "s");
  // The dot already shows signal strength by how it breathes; a number in a
  // help tag is a second, worse version of the same thing.
}

window.auralfm.onPlayerState((s) => {
  paintSignal(s?.rssi);
  /**
   * When the dial goes away.
   *
   * Not simply "whenever the state is not a receiver" — that was the first
   * version and it hid the dial instantly, because the popover publishes a
   * cleared state while it is still connecting. The dial appeared and vanished
   * before the first audio frame.
   *
   * The second attempt keyed on `playing`, which is worse in a quieter way: a
   * weak receiver reports not-playing while the session is perfectly alive, so
   * the dial vanished exactly when someone would reach for it.
   *
   * The signal that actually means "this session is over" is the channel no
   * longer being a receiver — after one has been seen.
   */
  if (tuneState) {
    if (s.channel?.sdr) tuneState.wasLive = true;
    else if (tuneState.wasLive) tunerStop();
  }
  // Pausing is not the same as leaving, but holding a receiver while paused is
  // the same as squatting it. The Kiwi's own limit would free the slot after
  // thirty minutes; for those thirty minutes someone else is told the receiver
  // is full while we sit on it playing nothing.
  //
  // A grace period rather than an instant release, because reconnecting is also
  // load and a quick pause-and-resume should not cost the operator a second
  // handshake. Ninety seconds is long enough to answer the door.
  if (tuneState && s.channel?.sdr) {
    if (s.playing) { clearTimeout(idleRelease); idleRelease = null; }
    else if (!idleRelease) {
      idleRelease = setTimeout(() => {
        idleRelease = null;
        if (!playing) tunerStop();   // still paused — give the slot back
      }, 90_000);
    }
  }
  playing = s.playing ? s.channel : null;
  document.body.classList.toggle("playing", !!s.playing);
  const bar = $("now");
  if (!s.channel) {
    bar.hidden = true;
    clearPending();
    loadNews(null);
  } else {
    bar.hidden = false;
    $("nowName").textContent = s.channel.title;
    $("nowStatus").textContent = s.status || "";
    $("nowStatus").classList.toggle("err", !!s.error);
    const spoken = [s.channel.title, s.status].filter(Boolean).join(", ");
    if ($("nowSpoken").textContent !== spoken) $("nowSpoken").textContent = spoken;
    // Pending is over the moment there is an answer, either way.
    if (s.playing || s.error) clearPending(); else markPending(s.channel.id);
    $("dot").style.display = s.playing ? "" : "none";
    Icons.set($("play"), s.playing ? "pause" : "play");
    if (typeof s.volume === "number") paintVolume(s.volume);
    // Headlines from wherever the station is broadcasting from.
    loadNews(s.playing ? s.channel.country : null);
    if (newsOpen && newsSource === "playing") renderNewsPanel();
  }
  for (const el of stationListEl.children) {
    if (!el.dataset?.id) continue;
    el.setAttribute("aria-current", playing?.id === el.dataset.id);
  }
  paintNowStar();
  syncChat(prefs);          // presence follows what is playing
  // Tuning across the world moves us to a different cell; re-read it rather than
  // keep counting against the last one.
  window.auralfm.presenceStats()
    .then((st) => { myCell = st?.cell || null; paintChatHead(); })
    .catch(() => paintChatHead());
});

/**
 * The star beside the transport.
 *
 * Favouriting already existed in every list, but not where you are most likely
 * to want it: you hear something good, and the thing you are looking at is the
 * player, not the row you clicked three minutes ago.
 *
 * Hidden for shortwave, because a favourite is a station you can return to and a
 * band on one receiver is a place plus a frequency plus whether the ionosphere
 * is cooperating. Pretending otherwise would save something that does not come
 * back.
 */
function paintNowStar() {
  const b = $("nowStar");
  if (!b) return;
  const ch = playing;
  const canFav = !!(ch && ch.id && !ch.sdr);
  b.hidden = !canFav;
  if (!canFav) return;
  const on = isFav(ch.id);
  Icons.set(b, on ? "starFill" : "star");
  b.classList.toggle("on", on);
  b.setAttribute("aria-pressed", String(on));
}

$("nowStar").onclick = async () => {
  if (!playing || !playing.id || playing.sdr) return;
  await toggleFav(playing);          // it reloads `favorites` from disk; paint after
  paintNowStar();
};

// ── transport ────────────────────────────────────────────────────────────────
// Explore has no audio element — these drive the one player in the popover, so
// there is still exactly one stream no matter which window you touch.
$("play").onclick = () => window.auralfm.transport({ action: "toggle" });

let preMute = 0.8;
function paintVolume(v) {
  $("vol").value = v;
  Icons.set($("mute"), v === 0 ? "volumeOff" : v < 0.5 ? "volumeLow" : "volumeHigh");
}
$("vol").oninput = () => {
  const v = +$("vol").value;
  paintVolume(v);
  window.auralfm.transport({ action: "volume", value: v });
};
$("mute").onclick = () => {
  const cur = +$("vol").value;
  const next = cur > 0 ? 0 : (preMute || 0.8);
  if (cur > 0) preMute = cur;
  paintVolume(next);
  window.auralfm.transport({ action: "volume", value: next });
};

// ── station lock ─────────────────────────────────────────────────────────────
/**
 * Lock keeps what you're hearing fixed while you wander the globe.
 *
 * It blocks *incidental* changes only — clicking a dot, or the list following
 * the map. Explicitly clicking a station name still plays it, because that is an
 * unambiguous "play this", and it re-locks onto the new station rather than
 * silently unlocking.
 */
let locked = false;

function setLocked(on) {
  locked = on;
  // Locking means the station owns everything again, including the room.
  syncChatView();
  const b = $("lock");
  b.setAttribute("aria-pressed", on);
  Icons.set(b, on ? "lock" : "unlock");
  b.title = on ? "Locked while you browse" : "Lock this station";
  window.auralfm.getState().then((st) => window.auralfm.setState({ ...(st || {}), locked: on }));
}
$("lock").onclick = () => { setLocked(!locked); window.Tip?.donate("lockUsed"); };

// ── favourites ───────────────────────────────────────────────────────────────
let showingFavorites = false;

async function showFavorites() {
  const state = (await window.auralfm.getState()) || {};
  favorites = Array.isArray(state.favorites) ? state.favorites : [];
  showingFavorites = true;
  $("favBtn").setAttribute("aria-pressed", "true");
  qEl.value = "";
  headEl.hidden = true;
  stationListEl.hidden = true;
  placeListEl.hidden = false;
  // The tabs count *this place's* stations and receivers, and favourites are
  // not a place. Left visible they kept the previous place's numbers over a
  // list those numbers do not describe — and clicking one rendered into
  // stationListEl, which is hidden here, so the view appeared frozen until an
  // unrelated click forced it back. Selecting any place calls renderRailTabs,
  // which unhides them again.
  $("railtabs").hidden = true;
  placeHeadEl.textContent = favorites.length
    ? `${favorites.length} favorite${favorites.length === 1 ? "" : "s"}`
    : "Favorites";
  placeListEl.innerHTML = "";
  if (!favorites.length) {
    placeListEl.innerHTML =
      `<div class="empty" style="padding:30px 16px">${t("empty.favorites", "No favorites yet.")}<br>${t("empty.favoritesHint", "Tap the star beside a station to save it.")}</div>`;
    return;
  }
  for (const f of favorites) placeListEl.appendChild(stationResultRow(f));
}

$("favBtn").onclick = () => {
  if (!showingFavorites) { showFavorites(); return; }
  showingFavorites = false;
  $("favBtn").setAttribute("aria-pressed", "false");
  /**
   * Go back to where you were, not to a browse list.
   *
   * Leaving favourites used to call `loadPlaces("")`, which drops you into the
   * cold-start suggestions even though a place is still selected and the globe
   * is still pointed at it. The rail and the planet disagreed, and the way out
   * was to click some unrelated station to force a repaint — which is exactly
   * how this was reported.
   *
   * With a place selected, restore it. Only fall back to browsing when there is
   * genuinely nothing to go back to.
   */
  if (selection.placeIndex !== null) {
    headEl.hidden = false;
    placeListEl.hidden = true;
    stationListEl.hidden = false;
    // The favourites count belongs to the favourites view. It is not inside
    // placelist, so hiding that leaves 22px of "6 favorites" sitting above the
    // station list of a place it has nothing to do with.
    placeHeadEl.textContent = "";
    renderRailTabs(nearbyReceivers());
    renderStations();
    syncTunerVisibility();
  } else {
    loadPlaces("");
  }
};

// ── markets ──────────────────────────────────────────────────────────────────
/**
 * Live prices in the transport bar.
 *
 * Crypto is keyless via CoinGecko. Equities are not: Yahoo's public endpoint
 * 429s and Stooq's CSV is gone, so every remaining provider wants an API key.
 * Rather than fake an index, the strip shows what it can actually verify and
 * says so on hover.
 */
let marketTimer = null;

/**
 * Crypto now arrives over a live Coinbase socket rather than a 90-second poll,
 * so the ticker refreshes once a second and prices visibly move. Rows are
 * updated in place rather than rebuilt — replacing the DOM every second
 * restarts the flash animation on every symbol at once, which turns a quiet
 * ticker into a strobe.
 */
let lastPrices = new Map();

async function renderMarkets() {
  const el = $("markets");
  if (!el) return;
  const { items, hasStocks } = (await window.auralfm.markets()) || { items: [] };
  if (!items?.length) { el.textContent = ""; return; }

  // Same symbols in the same order: update the numbers and leave the DOM alone.
  const existing = [...el.children];
  const sameShape = existing.length === items.length &&
    items.every((it, i) => existing[i].dataset.sym === it.symbol);
  if (sameShape) {
    items.forEach((it, i) => {
      const wrap = existing[i];
      const up = (it.changePct ?? 0) >= 0;
      const px = wrap.querySelector(".px");
      const text = it.price >= 1000 ? Math.round(it.price).toLocaleString()
                 : it.price >= 1   ? it.price.toFixed(2)
                 : it.price.toFixed(4);
      if (px.textContent !== text) {
        const prev = lastPrices.get(it.symbol);
        px.textContent = text;
        // A one-shot tint in the direction it moved, so you can see it tick.
        if (prev != null && it.price !== prev) {
          px.classList.remove("tick-up", "tick-dn");
          void px.offsetWidth;                       // restart the animation
          px.classList.add(it.price > prev ? "tick-up" : "tick-dn");
        }
      }
      lastPrices.set(it.symbol, it.price);
      const ch = wrap.querySelector(".ch");
      ch.className = `ch ${up ? "up" : "dn"}`;
      ch.textContent = it.changePct == null ? "" : `${up ? "▲" : "▼"}${Math.abs(it.changePct).toFixed(1)}%`;
    });
    el.title = hasStocks ? "" : el.title;
    return;
  }

  el.innerHTML = "";
  for (const it of items) {
    lastPrices.set(it.symbol, it.price);
    const up = (it.changePct ?? 0) >= 0;
    const wrap = document.createElement("span");
    wrap.className = "m";
    wrap.dataset.sym = it.symbol;
    wrap.innerHTML = `<span class="sym"></span><span class="px"></span><span class="ch"></span>`;
    wrap.querySelector(".sym").textContent = it.symbol;
    wrap.querySelector(".px").textContent =
      it.price >= 1000 ? Math.round(it.price).toLocaleString()
      : it.price >= 1   ? it.price.toFixed(2)
      : it.price.toFixed(4);
    const ch = wrap.querySelector(".ch");
    ch.className = `ch ${up ? "up" : "dn"}`;
    ch.textContent = it.changePct == null ? "" : `${up ? "▲" : "▼"}${Math.abs(it.changePct).toFixed(1)}%`;
    el.appendChild(wrap);
  }
  // No help tag. "BTC 65,016" is a price next to a symbol and needs no
  // explanation, and the old one spent two lines on an environment variable that
  // is a maintainer's concern rather than a listener's. The price itself is live
  // off Coinbase's feed; only the percentage is the 24h change, which is what
  // every ticker shows.
  fitMarkets();
}

/**
 * Drop whole symbols, never half of one.
 *
 * The strip is capped at the rail's width so it can no longer spill across into
 * the globe — that was the complaint, and `max-width` alone fixes it. But
 * `overflow:hidden` on its own resolves a narrow window by slicing a price down
 * the middle, and "SOL 73." reads as a rendering bug rather than as a choice.
 *
 * Two stages, because losing a whole coin is a worse trade than losing its
 * percentage. First try everything. If that does not fit, drop every 24h change
 * and try again — that alone buys back about a third of the strip and keeps all
 * three prices. Only if it still does not fit do whole symbols go, from the end:
 * SOL first, then ETH, and BTC is the last to leave.
 */
function fitMarkets() {
  const el = $("markets");
  if (!el || !el.children.length) return;
  const kids = [...el.children];
  const deltas = kids.map((k) => k.querySelector(".ch")).filter(Boolean);

  // `clientWidth` is the padding box; the strip's own left padding is inside it.
  const room = () => el.clientWidth - parseFloat(getComputedStyle(el).paddingLeft || 0);
  const gap = parseFloat(getComputedStyle(el).gap || 0);
  const total = () => kids.reduce((n, k, i) =>
    k.hidden ? n : n + k.getBoundingClientRect().width + (i ? gap : 0), 0);

  for (const k of kids) k.hidden = false;
  for (const d of deltas) d.hidden = false;

  // Stage one: everything.
  if (total() <= room() + 0.5) return;

  // Stage two: the same prices without their 24h change.
  for (const d of deltas) d.hidden = true;
  if (total() <= room() + 0.5) return;

  // Stage three: whole symbols, from the end. Never half of one — "SOL 73."
  // reads as a rendering bug rather than as a choice — and once one has gone,
  // everything after it goes too, because a gap in the middle of the strip
  // looks like missing data.
  let used = 0;
  const r = room();
  kids.forEach((k, i) => {
    const w = k.getBoundingClientRect().width + (i ? gap : 0);
    if (k.hidden || used + w > r + 0.5) { k.hidden = true; return; }
    used += w;
  });
  for (let i = 1; i < kids.length; i++) if (kids[i - 1].hidden) kids[i].hidden = true;
}

// ── headline panel ───────────────────────────────────────────────────────────
/**
 * A reading list, not a reader. RSS carries headline, publisher and time but not
 * article text; rendering the article would mean scraping publisher sites, which
 * is fragile and a licensing problem. Clicking hands off to the browser.
 */
let newsOpen = false;
/**
 * Headline source, cycled from the panel header.
 *   world   international edition — the default, because this app is about the
 *           whole globe rather than one country
 *   place   wherever you're looking on the map
 *   playing the country of the station currently on air
 */
const NEWS_SOURCES = ["world", "place", "playing"];
let newsSource = "world";

function relTime(ms) {
  if (!ms) return "";
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

async function renderNewsPanel() {
  const panel = $("newspanel");
  panel.hidden = !newsOpen;
  document.body.classList.toggle("news-open", newsOpen);
  $("newsBtn").setAttribute("aria-pressed", newsOpen);
  if (!newsOpen) return;

  const country =
    newsSource === "world"   ? null
    : newsSource === "playing" ? (tickCountry || null)
    : (selection.place?.country || null);

  const labels = { world: "World", place: "This place", playing: "Now playing" };
  $("newsSrc").setAttribute("aria-pressed", newsSource !== "world");
  $("newsSrc").title = `Source: ${labels[newsSource]} — click to change`;
  $("newsplace").textContent =
    newsSource === "world" ? "World headlines"
    : country ? country
    : `${labels[newsSource]} · nothing selected`;
  const list = $("newslist");
  // aria-busy rather than a live region: a screen reader should be told the
  // panel is working, not read three empty boxes.
  list.setAttribute("aria-busy", "true");
  list.innerHTML = `<div class="skel"><div class="h"></div><div class="m"></div></div>`.repeat(3);

  // A sentinel rather than null, because "the call failed" and "there is nothing
  // here" are different answers and the panel should not say the same thing to
  // both. Empty is a fact about the place; failed is a fact about the network,
  // and only one of them is worth offering a button for.
  const FAILED = Symbol("failed");
  const items = await guard("news", () => window.auralfm.news(country), FAILED);
  list.removeAttribute("aria-busy");
  if (!newsOpen) return;

  if (items === FAILED) {
    list.textContent = "";
    const box = document.createElement("div");
    box.className = "failed";
    box.setAttribute("role", "status");
    const msg = document.createElement("p");
    msg.textContent = t("news.unreachable", "Could not reach the headlines.");
    const again = document.createElement("button");
    again.className = "retry";
    again.textContent = t("action.retry", "Try again");
    again.onclick = () => loadNews(country);
    box.append(msg, again);
    list.append(box);
    return;
  }

  if (!items?.length) {
    list.innerHTML = `<div class="empty" style="padding:22px 12px">`
      + (country ? "No headlines for here." : "Headlines unavailable right now.")
      + `</div>`;
    return;
  }
  if (reading) return renderReader(list);
  list.innerHTML = "";
  for (const it of items) {
    const el = document.createElement("div");
    el.className = "story";
    el.innerHTML = `<div class="h"></div><div class="m"></div>`;
    el.querySelector(".h").textContent = it.title;
    el.querySelector(".m").textContent = [it.source, relTime(it.at)].filter(Boolean).join(" · ");
    if (it.link) el.onclick = () => openReader(it);
    list.appendChild(el);
  }
}

/**
 * The reader.
 *
 * A headline is a promise, and a link out to a page of consent banners and
 * newsletter interstitials is how that promise gets broken. The article is
 * fetched and stripped in the main process — no CORS there — and read in the
 * panel it was found in.
 *
 * It fails openly. Roughly a third of stories will not extract: paywalls,
 * publishers that block anything without a session, pages that are mostly
 * JavaScript. When that happens the button to open it properly is right there,
 * which is a better answer than a spinner that never resolves.
 */
let reading = null;

async function openReader(item) {
  reading = { item, doc: null, state: "loading" };
  renderNewsPanel();
  const doc = await window.auralfm.readArticle(item.link).catch(() => null);
  // The panel may have moved on while a slow publisher was thinking.
  if (!reading || reading.item !== item) return;
  reading = { item, doc, state: doc ? "ready" : "failed" };
  renderNewsPanel();
}

function closeReader() { reading = null; renderNewsPanel(); }

function renderReader(list) {
  const { item, doc, state } = reading;
  list.innerHTML = "";

  const back = document.createElement("button");
  back.className = "readback";
  back.textContent = t("news.back", "‹ Headlines");
  back.onclick = closeReader;
  list.append(back);

  const h = document.createElement("div");
  h.className = "readtitle";
  h.textContent = (doc && doc.title) || item.title;
  const meta = document.createElement("div");
  meta.className = "readmeta";
  meta.textContent = [item.source, relTime(item.at),
    doc ? `${doc.words.toLocaleString()} ${t("news.words", "words")}` : null]
    .filter(Boolean).join(" · ");
  list.append(h, meta);

  if (state === "loading") {
    const p = document.createElement("div");
    p.className = "readnote";
    p.textContent = t("news.loading", "Fetching the article…");
    list.append(p);
    return;
  }

  if (state === "failed") {
    const p = document.createElement("div");
    p.className = "readnote";
    p.textContent = t("news.failed",
      "This article does not open in AuralFM. It needs a browser, or it needs a subscription.");
    const b = document.createElement("button");
    b.className = "readopen";
    b.textContent = t("news.open", "Open in browser");
    b.onclick = () => window.auralfm.openLink(item.link);
    list.append(p, b);
    return;
  }

  for (const para of doc.paragraphs) {
    const p = document.createElement("p");
    p.className = "readp";
    p.textContent = para;
    list.append(p);
  }
  const b = document.createElement("button");
  b.className = "readopen";
  b.textContent = t("news.open", "Open in browser");
  b.onclick = () => window.auralfm.openLink(doc.url || item.link);
  list.append(b);
}

$("newsBtn").onclick = () => {
  newsOpen = !newsOpen; reading = null; renderNewsPanel();
  if (newsOpen) window.Tip?.donate("newsOpened");
};
$("newsClose").onclick = () => { newsOpen = false; reading = null; renderNewsPanel(); };
$("newsSrc").onclick = () => {
  newsSource = NEWS_SOURCES[(NEWS_SOURCES.indexOf(newsSource) + 1) % NEWS_SOURCES.length];
  renderNewsPanel();
};

// ── local headlines ──────────────────────────────────────────────────────────
/**
 * Headlines are the pop-out card's job now.
 *
 * There was a scrolling ticker along the bottom as well, which was two answers
 * to one question — and the card is the better one, because it can show a whole
 * headline and open the story. The ticker also cost the rail a row it needed.
 *
 * What survives is one variable: which country is playing, so the card's "Now
 * playing" source knows what to ask for. Fetching moved into the card, which
 * only asks when it is open — the ticker used to pull headlines for every
 * station you passed over, whether or not anybody was reading them.
 */
let tickCountry = null;

function loadNews(country) {
  if (country === tickCountry) return;
  tickCountry = country;
  if (newsOpen && newsSource === "playing") renderNewsPanel();
}

// ── weather ──────────────────────────────────────────────────────────────────
// Imperial for US locales, metric everywhere else — the app is used by whoever
// clones it, and 87°F/30°C is the kind of detail that reads as wrong instantly.
const US = /^en-US|^en$/.test(navigator.language || "");
const temp = (c) => (US ? `${Math.round(c * 9 / 5 + 32)}°F` : `${Math.round(c)}°C`);

async function loadWeather(place) {
  const el = $("wx");
  el.classList.remove("on");
  el.textContent = "";
  const asked = place.i;

  const w = await window.auralfm.weather(place.i, place.lat, place.lon);
  // The user may have clicked elsewhere while this was in flight.
  if (!w || selection.placeIndex !== asked) return;

  const hhmm = (w.localTime || "").slice(11, 16);
  const local = hhmm
    ? new Date(`2000-01-01T${hhmm}:00`).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : null;

  el.innerHTML = `<span class="sym"></span><span class="t"></span><span class="d"></span>`;
  el.querySelector(".sym").textContent = w.symbol;
  el.querySelector(".t").textContent = temp(w.tempC);
  el.querySelector(".d").textContent =
    `· ${w.text}` + (local ? ` · ${local} local` : "");
  el.title =
    `Feels like ${temp(w.feelsC)} · humidity ${w.humidity}% · wind ${Math.round(w.windKph)} km/h`
    + (w.tz ? ` · ${w.tz}` : "");
  el.classList.add("on");
}

// ── globe view ───────────────────────────────────────────────────────────────
let globe = null, globeLoading = null, globePts = null, sunTimer = null;

/**
 * Shortwave receivers, merged into the same point layer as the stations rather
 * than given a layer of their own. globe.gl merges points into one geometry, so
 * a second layer would mean a second full rebuild on every selection change for
 * the sake of 838 dots. Per-point colour is a function, so one layer can carry
 * both — the only cost is that everything downstream has to check `kind`.
 */
let sdrPts = null;
let sdrSel = null;      // the receiver whose bands are in the rail
let liveTexReady = false;

/** Load the 1.7 MB globe bundle only when someone actually asks for the globe. */
function loadGlobeLib() {
  if (window.Globe) return Promise.resolve();
  if (globeLoading) return globeLoading;
  globeLoading = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "vendor/globe.gl.min.js";
    s.onload = resolve;
    s.onerror = () => reject(new Error("globe.gl failed to load — run `npm run vendor`"));
    document.head.appendChild(s);
  });
  return globeLoading;
}

const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

/**
 * Sub-solar point: the lat/lng where the sun is directly overhead right now.
 * NOAA-style approximation — declination plus the equation of time, which is the
 * bit that stops the terminator drifting up to ~16 minutes off across the year.
 * Accurate to well under a degree, which is far finer than a globe this size can
 * show.
 */
function subsolarPoint(date = new Date()) {
  const rad = Math.PI / 180;
  const dayOfYear = (date - Date.UTC(date.getUTCFullYear(), 0, 0)) / 86400000;
  const decl = -23.44 * Math.cos(rad * (360 / 365) * (dayOfYear + 10));
  const B = rad * (360 / 365) * (dayOfYear - 81);
  const eqTime = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B); // minutes
  const utcHours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  let lng = -15 * (utcHours - 12 + eqTime / 60);
  lng = ((lng + 180) % 360 + 360) % 360 - 180;
  return { lat: decl, lng };
}

/**
 * Sub-lunar point and illuminated fraction.
 *
 * Low-precision lunar position (Meeus, chapter 47, principal terms only) —
 * roughly a degree, which is finer than a dot on this globe can express. A full
 * ephemeris would be many times the code for no visible gain.
 *
 * Deliberately *not* used to light the Earth: real moonlight is ~400,000x
 * dimmer than sunlight and would be invisible next to the night-lights texture.
 * It marks where the moon is, and how full it is.
 */
function moonPoint(date = new Date()) {
  const rad = Math.PI / 180;
  const JD = date.getTime() / 86400000 + 2440587.5;
  const T = (JD - 2451545) / 36525;

  const L = 218.316 + 13.176396 * (JD - 2451545);        // mean longitude
  const M = 134.963 + 13.064993 * (JD - 2451545);        // mean anomaly
  const F = 93.272 + 13.229350 * (JD - 2451545);         // argument of latitude

  const lambda = (L + 6.289 * Math.sin(M * rad)) * rad;  // ecliptic longitude
  const beta = 5.128 * Math.sin(F * rad) * rad;          // ecliptic latitude
  const eps = (23.439 - 0.0000004 * (JD - 2451545)) * rad;

  // ecliptic -> equatorial
  const ra = Math.atan2(
    Math.sin(lambda) * Math.cos(eps) - Math.tan(beta) * Math.sin(eps),
    Math.cos(lambda));
  const dec = Math.asin(
    Math.sin(beta) * Math.cos(eps) + Math.cos(beta) * Math.sin(eps) * Math.sin(lambda));

  // Greenwich mean sidereal time -> sub-lunar longitude
  const gmst = (280.46061837 + 360.98564736629 * (JD - 2451545)) % 360;
  let lng = (ra / rad - gmst) % 360;
  lng = ((lng + 180) % 360 + 360) % 360 - 180;

  // Illuminated fraction from the sun-moon elongation.
  const sunM = (357.529 + 0.98560028 * (JD - 2451545)) * rad;
  const sunLambda = (280.459 + 0.98564736 * (JD - 2451545) + 1.915 * Math.sin(sunM)) * rad;
  const elong = Math.acos(Math.cos(beta) * Math.cos(lambda - sunLambda));
  const illum = (1 - Math.cos(elong)) / 2;
  // Waxing when the moon leads the sun in ecliptic longitude.
  const waxing = Math.sin(lambda - sunLambda) > 0;

  return { lat: dec / rad, lng, illum, waxing };
}

const MOON_PHASES = [
  [0.02, "new moon", "●"], [0.24, "waxing crescent", "☽"], [0.30, "first quarter", "☽"],
  [0.72, "waxing gibbous", "☽"], [0.98, "full moon", "○"], [1.01, "waning gibbous", "☾"],
];
function moonPhaseName({ illum, waxing }) {
  if (illum < 0.02) return ["new moon", "●"];
  if (illum > 0.98) return ["full moon", "○"];
  const band = illum < 0.28 ? "crescent" : illum < 0.72 ? "quarter" : "gibbous";
  const dir = waxing ? "waxing" : "waning";
  const name = band === "quarter" ? (waxing ? "first quarter" : "last quarter") : `${dir} ${band}`;
  return [name, waxing ? "☽" : "☾"];
}

/** Unit vector toward the sun, in the globe's own coordinate frame. */
function sunVector() {
  const { lat, lng } = subsolarPoint();
  const c = globe.getCoords(lat, lng, 0);
  const len = Math.hypot(c.x, c.y, c.z) || 1;
  return { x: c.x / len, y: c.y / len, z: c.z / len };
}

/** globe.gl doesn't re-export THREE, so clone the texture class off an existing one. */
function loadTexture(url, TexClass, like) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const t = new TexClass(img);
      if (like) {
        t.wrapS = like.wrapS; t.wrapT = like.wrapT;
        t.colorSpace = like.colorSpace; t.flipY = like.flipY;
        t.minFilter = like.minFilter; t.magFilter = like.magFilter;
      }
      t.needsUpdate = true;
      resolve(t);
    };
    img.onerror = () => reject(new Error(`texture failed: ${url}`));
    img.src = url;
  });
}

/**
 * Poll until fn() returns something truthy.
 *
 * The budget counts only time the window is actually visible. three-globe hands
 * its texture over on a render tick, and a hidden or occluded window has its
 * animation frames throttled to nothing — so wall-clock time spent in the
 * background is time in which nothing could possibly have progressed. Charging
 * it against the timeout is how a backgrounded launch used to fail.
 */
const waitFor = (fn, ms = 30000) => new Promise((res, rej) => {
  let spent = 0, last = Date.now();
  (function poll() {
    const v = fn();
    if (v) return res(v);
    const now = Date.now();
    if (!document.hidden) spent += now - last;
    last = now;
    if (spent > ms) return rej(new Error("timed out waiting for texture"));
    setTimeout(poll, 60);
  })();
});

/**
 * Blend the daytime and night-lights textures across the real terminator.
 *
 * Injected into the existing MeshPhongMaterial rather than built as a fresh
 * ShaderMaterial, because globe.gl bundles three privately and never exposes the
 * constructors. Texture lookups use the geometry's own uv attribute, forwarded
 * through our own varying — that can't drift from the texture, and doesn't
 * depend on three's internal varying names.
 *
 * Injected at <opaque_fragment>, not at the end of the shader: everything after
 * it (tone mapping, colour-space encoding) still has to run on our blended
 * colour. Writing gl_FragColor last skips sRGB encoding and the daylit half
 * comes out several stops too dark.
 */
/**
 * The globe shader only exists once its program compiles, which happens on the
 * first render after needsUpdate — not when applyDayNight() returns. Anything
 * that wants to set a uniform before then has to wait rather than give up.
 *
 * It used to give up: the live cloud composite was fetched, stitched, and then
 * dropped on the floor if the shader wasn't ready, and the Day/Night menu toggle
 * silently did nothing in the same window. Both now queue.
 */
let shaderQueue = [];
function withShader(fn) {
  const sh = globe?.globeMaterial()?.userData?.shader;
  if (sh) { fn(sh); return true; }
  shaderQueue.push(fn);
  return false;
}
function flushShaderQueue(sh) {
  const q = shaderQueue;
  shaderQueue = [];
  for (const fn of q) { try { fn(sh); } catch { /* one bad consumer must not block the rest */ } }
}

async function applyDayNight() {
  const mat = globe.globeMaterial();
  const dayTex = await waitFor(() => mat.map);
  const TexClass = dayTex.constructor;

  const [nightTex, bumpTex, lightsTex] = await Promise.all([
    loadTexture("vendor/earth-night.jpg", TexClass, dayTex),
    loadTexture("vendor/earth-topology.png", TexClass, dayTex),
    // 8192x4096 city lights. Fails soft: if it is missing the shader keeps the
    // vendored night texture, which is the same imagery at a quarter the size.
    loadTexture("vendor/earth-lights.jpg", TexClass, dayTex).catch(() => null),
  ]);

  // Satellite imagery is fetched *without* blocking: on a cold start it can take
  // tens of seconds, and a globe that refuses to appear until the weather
  // downloads is a worse globe. Compile on Blue Marble now, swap the live layer
  // in when it lands.
  loadLiveImagery(TexClass, dayTex);

  mat.bumpMap = bumpTex;
  mat.bumpScale = 4;            // globe radius is 100, so this is subtle relief
  mat.shininess = 6;
  // three-globe nulls material.color once a globe texture is applied, so this
  // has to be guarded — assigning through it threw and silently skipped the
  // shader hook below.
  mat.color?.setHex?.(0xffffff);

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.nightMap = { value: nightTex };
    shader.uniforms.liveMap = { value: nightTex };   // placeholder until imagery lands
    shader.uniforms.hasLive = { value: 0 };
    shader.uniforms.dayNightOn = { value: 1 };
    shader.uniforms.sunDirection = { value: sunVector() };
    shader.uniforms.lightsMap = { value: lightsTex || nightTex };
    shader.uniforms.hasLights = { value: lightsTex ? 1 : 0 };

    // Two separate frames here, and mixing them up has bitten this shader twice.
    //
    // UVs: pass the geometry's own through, rather than deriving them from the
    // normal. Deriving looks right on paper but silently rotates the map —
    // three's SphereGeometry puts u=0 at -X, not u=0.5 at +Z, so the Americas
    // ended up showing Europe and Africa.
    //
    // Normal: it must be in the SAME frame as the sun vector, and it was not.
    // three-globe rotates the globe mesh by -90 degrees about Y, so `position`
    // (object space, before that rotation) sat a quarter-turn away from
    // sunVector(), which comes from getCoords() and is already in the parent
    // frame. The terminator was therefore always 90 degrees out. Multiplying by
    // modelMatrix puts the normal in the same frame as the sun and keeps it
    // correct even if that rotation ever changes.
    shader.vertexShader = "varying vec3 vGlobeNormal;\nvarying vec2 vGlobeUv;\n" + shader.vertexShader
      .replace("void main() {", "void main() {\n  vGlobeNormal = normalize(mat3(modelMatrix) * position);\n  vGlobeUv = uv;");

    shader.fragmentShader =
      "uniform sampler2D nightMap;\nuniform sampler2D liveMap;\nuniform float hasLive;\nuniform float dayNightOn;\n" +
      "uniform sampler2D lightsMap;\nuniform float hasLights;\n" +
      "uniform vec3 sunDirection;\nvarying vec3 vGlobeNormal;\nvarying vec2 vGlobeUv;\n" +
      shader.fragmentShader.replace("#include <opaque_fragment>", `#include <opaque_fragment>
        vec3 n = normalize(vGlobeNormal);
        vec3 dayC   = texture2D(map, vGlobeUv).rgb;
        vec3 nightC = texture2D(nightMap, vGlobeUv).rgb;

        // City lights, at four times the resolution of the vendored night
        // texture and as a mask rather than a picture: the colour is decided
        // here, so it can be tuned without refetching 6.8 MB from NASA.
        //
        // The base is the day texture at a few percent — continents stay
        // faintly readable at night the way they do under a full moon, and it
        // keeps coastlines legible where nobody lives. The old night texture is
        // still the fallback when the 8K one is missing.
        if (hasLights > 0.5) {
          float lit = texture2D(lightsMap, vGlobeUv).r;
          // Sodium and LED street lighting, warm and slightly orange. The power
          // curve lifts small towns without blowing out the conurbations.
          vec3 glow = vec3(1.0, 0.78, 0.50) * pow(lit, 0.80) * 2.0;
          nightC = dayC * 0.055 + glow;
        }

        // Today's satellite pass, where it exists. VIIRS returns pure black
        // where the swaths don't meet, so treat near-black as "no data" and keep
        // Blue Marble there — a gap should look like clear sky, not a puncture.
        vec3 liveC = texture2D(liveMap, vGlobeUv).rgb;
        /**
         * Where the live pass ends and Blue Marble resumes.
         *
         * This was a hard step(), which is why the globe looked like an
         * amalgamation of photographs: every satellite footprint met the base
         * texture along a knife edge, so the geostationary discs and the daily
         * polar swaths showed as straight-sided panels. The seams are real —
         * different sensors, different passes, genuinely different times of day
         * — but the *edges* were ours.
         *
         * A smoothstep feathers the join over a band of brightness instead of
         * cutting at one value. It cannot make two sensors agree on colour; it
         * can stop the boundary being a line.
         */
        float lum = max(liveC.r, max(liveC.g, liveC.b));
        float haveData = smoothstep(0.02, 0.13, lum) * hasLive;
        dayC = mix(dayC, liveC, haveData);
        // Clouds are bright; carry a little of them onto the night side too, so
        // a storm doesn't vanish at the terminator.
        float cloud = smoothstep(0.45, 0.85, dot(liveC, vec3(0.33))) * haveData;
        nightC = mix(nightC, nightC + vec3(0.10), cloud);
        float cosSun = dot(n, normalize(sunDirection));
        // ~10 degrees of softness: civil twilight, not a hard line
        float t = mix(1.0, smoothstep(-0.09, 0.09, cosSun), dayNightOn);
        vec3 col = mix(nightC * 1.6, dayC, t);
        // A restrained warm band either side of the terminator — sunrise, not sunset filter.
        col += vec3(0.075, 0.032, 0.0) * max(0.0, 1.0 - abs(cosSun) * 22.0) * dayNightOn;
        gl_FragColor = vec4(col, gl_FragColor.a);`);

    mat.userData.shader = shader;   // handle for the per-minute sun update
  };
  // three's default program cache key already stringifies onBeforeCompile, so
  // replacing the hook is enough to force a recompile.
  mat.needsUpdate = true;

  // Don't await this — the globe should be interactive immediately. It only
  // exists to release anything that queued on the shader.
  waitFor(() => mat.userData.shader)
    .then(flushShaderQueue)
    .catch(() => { /* setupDayNight() owns reporting and retry */ });
}

/**
 * applyDayNight() is the one part of init that depends on an asset arriving, so
 * it is also the one part that can fail. It used to be awaited bare, which meant
 * a slow texture took the sky, the ISS, the LOD and the live clouds down with
 * it — and reported the failure into a status bar that is hidden by default, so
 * the globe just quietly looked wrong.
 *
 * Now it fails alone, says so where it can be seen, and tries again when the
 * window comes back to the front, which is exactly when a throttled load can
 * finally make progress.
 */
let dayNightRetry = null;
async function setupDayNight() {
  try {
    await applyDayNight();
    if (dayNightRetry) { document.removeEventListener("visibilitychange", dayNightRetry); dayNightRetry = null; }
    return true;
  } catch (err) {
    const el = $("globestatus");
    if (el) el.textContent = `day/night unavailable — ${err.message}`;
    if (!dayNightRetry) {
      dayNightRetry = () => { if (!document.hidden) setupDayNight(); };
      document.addEventListener("visibilitychange", dayNightRetry);
    }
    return false;
  }
}

const loadImage = (src) => new Promise((res, rej) => {
  const i = new Image();
  i.onload = () => res(i);
  i.onerror = () => rej(new Error("image failed"));
  i.src = src;
});

/**
 * Build one sky texture from the daily global pass plus whatever geostationary
 * frames exist, composited on a canvas.
 *
 * Order matters: VIIRS underneath for complete coverage, GOES on top where it
 * exists because it is ten minutes old rather than a day. Painting them the
 * other way round would bury the current data under yesterday's.
 */
async function loadLiveImagery(TexClass, like) {
  try {
    const sky = await window.auralfm.clouds();
    if (!sky?.base && !sky?.goesE && !sky?.goesW) return;

    const cv = document.createElement("canvas");
    cv.width = 2048; cv.height = 1024;
    const ctx = cv.getContext("2d");

    // Sub-satellite longitudes. GOES imagery is only trustworthy near the middle
    // of its disk; toward the limb it is stretched and colour-shifted.
    const SUBLON = { goesE: -75.2, goesW: -137.0 };

    let liveCount = 0;
    for (const key of ["base", "goesE", "goesW"]) {
      if (!sky[key]) continue;
      try {
        const img = await loadImage("file://" + sky[key]);
        if (key === "base") { ctx.drawImage(img, 0, 0, cv.width, cv.height); continue; }

        // Feather the disk instead of pasting it. A hard-edged disk lands as a
        // pale wedge with a diagonal seam where GOES meets VIIRS — different
        // sensors, different colour grading, and a visible cut between them.
        const tmp = document.createElement("canvas");
        tmp.width = cv.width; tmp.height = cv.height;
        const tc = tmp.getContext("2d");
        tc.drawImage(img, 0, 0, tmp.width, tmp.height);

        const cx = ((SUBLON[key] + 180) / 360) * tmp.width;
        const cy = tmp.height / 2;
        // ~55 deg of longitude at full strength, fading out by ~78.
        const r0 = (55 / 360) * tmp.width, r1 = (78 / 360) * tmp.width;
        const grad = tc.createRadialGradient(cx, cy, r0, cx, cy, r1);
        grad.addColorStop(0, "rgba(0,0,0,1)");
        grad.addColorStop(1, "rgba(0,0,0,0)");
        tc.globalCompositeOperation = "destination-in";
        tc.fillStyle = grad;
        tc.fillRect(0, 0, tmp.width, tmp.height);

        ctx.globalAlpha = 0.92;
        ctx.drawImage(tmp, 0, 0);
        ctx.globalAlpha = 1;
        liveCount++;
      } catch { /* skip this layer */ }
    }

    const tex = new TexClass(cv);
    if (like) { tex.wrapS = like.wrapS; tex.wrapT = like.wrapT; tex.colorSpace = like.colorSpace; tex.flipY = like.flipY; }
    tex.needsUpdate = true;

    withShader((sh) => {
      sh.uniforms.liveMap.value = tex;
      liveTexReady = true;
      sh.uniforms.hasLive.value = layers.clouds ? 1 : 0;
    });

    const el = $("liveflag");
    if (el) {
      el.textContent = liveCount
        ? ` · live cloud cover (${liveCount === 2 ? "GOES E+W" : "GOES"} 10 min · rest daily)`
        : " · cloud cover (daily pass)";
    }
  } catch { /* Blue Marble is a perfectly good fallback */ }
}

function updateSun() {
  if (!globe) return;
  // The readout must not depend on the shader: the program compiles on the first
  // render after needsUpdate, which is after initGlobe returns.
  // Deliberately not queued: this runs every minute, so if the shader is not up
  // yet the next tick will carry a fresher sun anyway.
  const sh = globe.globeMaterial()?.userData?.shader;
  if (sh) sh.uniforms.sunDirection.value = sunVector();
  const { lat, lng } = subsolarPoint();
  const m = moonPoint();
  const [phase, glyph] = moonPhaseName(m);
  paintGlobeReadout(lat, lng, m, phase, glyph);
}

/**
 * The line under the globe.
 *
 * It used to open with the subsolar point — a real fact, and one almost nobody
 * can use. "17.2°N 134.3°W" is the answer to a question a listener has not asked.
 *
 * So it now leads with the thing that changes as you move, which is what makes a
 * read-out worth glancing at: where you are looking, and whether it is day or
 * night there. The astronomy follows, quieter, for whoever wants it.
 *
 * Solar time from longitude rather than a timezone database, the same arithmetic
 * the terminator uses — so this line and the darkness on the globe can never
 * disagree, which they would if one followed politics and the other the sun.
 */
function paintGlobeReadout(sunLat, sunLng, m, phase, glyph) {
  const el = $("sunreadout");
  if (!el) return;
  const fmt = (v, pos, neg) => `${Math.abs(v).toFixed(1)}°${v >= 0 ? pos : neg}`;
  const bits = [];

  const here = selection.place || (sdrSel ? { title: sdrSel.loc || sdrSel.name,
                                             lat: sdrSel.lat, lon: sdrSel.lng } : null);
  if (here && Number.isFinite(here.lat) && Number.isFinite(here.lon)) {
    const now = new Date();
    const h = (((now.getUTCHours() * 60 + now.getUTCMinutes() + here.lon * 4) / 60) % 24 + 24) % 24;
    const hh = String(Math.floor(h)).padStart(2, "0");
    const mm = String(Math.floor((h % 1) * 60)).padStart(2, "0");
    // Civil twilight either side, matching the terminator's own softness.
    const lit = h >= 6 && h < 18;
    bits.push(`<b>${here.title}</b> ${hh}:${mm} ${lit ? t("readout.day", "day") : t("readout.night", "night")}`);
  }

  bits.push(`${glyph} <b>${phase} ${Math.round(m.illum * 100)}%</b>`);
  bits.push(`&#9788;&#xFE0E; ${fmt(sunLat, "N", "S")} ${fmt(sunLng, "E", "W")}`);
  el.innerHTML = bits.join(" &nbsp;·&nbsp; ");
}

async function initGlobe() {
  await loadGlobeLib();
  const raw = await window.auralfm.globePoints();      // [i, lon, lat, count]
  globePts = raw.map(([i, lng, lat, count]) => ({ i, lng, lat, count }));

  const accent = css("--accent") || "#E9E2D4";
  const el = $("globe");

  globe = Globe()(el)
    // Textures are vendored from three-globe, so the real Earth costs no network.
    .globeImageUrl("vendor/earth-blue-marble.jpg")
    // Sky is drawn from a real catalogue below; start on the vendored texture so
    // there is never a blank frame.
    .backgroundImageUrl("vendor/night-sky.png")
    .showGlobe(true)
    .showAtmosphere(true)
    .atmosphereColor(palette?.atmosphere || "#8ab4f8")
    .atmosphereAltitude(0.17)
    .pointsData(globePts)
    .pointLat("lat").pointLng("lng")
    // Amber for receivers so they read as a different kind of thing entirely —
    // these are antennas, not places, and conflating them would be a lie.
    .pointColor((d) => d.kind === "sdr"
      ? (sdrSel && sdrSel.host === d.host ? "#ffffff" : (palette?.rx || "#ffb340"))
      : (d.i === selection.placeIndex ? "#ffffff" : (palette?.dot || "#5ef08a")))
    .pointLabel((d) => d.label)
    // Near-flat discs, not columns. Extruded points turn the limb into fuzz and
    // read as noise rather than geography.
    // Size comes from dotRadius() so the Settings toggle can change it. Smaller
    // than they were: at full zoom 12,296 dots merge into a haze and
    // picking one is a fight; the fix is fewer, tighter dots plus level-of-detail
    // below, not a bigger hit target — "Large" is there for people who need it.
    // The selected place has to be findable in a field of a thousand dots, so it
    // is drawn much larger than anything around it rather than merely paler.
    .pointRadius((d) => {
      // 0.14, not 0.28. A station dot is 0.09 + sqrt(count) * 0.013, so a place
      // with three stations draws at about 0.11 — the receivers were two and a
      // half times bigger than the thing they sit among, which is why a click in
      // dense western Europe landed on a receiver you were not aiming at. They
      // still need to be findable; colour does that job, and size was doing it
      // twice.
      if (d.kind === "sdr") return (sdrSel && sdrSel.host === d.host) ? 0.7 : 0.14;
      return d.i === selection.placeIndex ? 0.8 : dotRadius(d);
    })
    .pointAltitude((d) =>
      (d.i === selection.placeIndex || (sdrSel && sdrSel.host === d.host)) ? 0.012 : 0.002)
    // Merged into one geometry: unmerged, 12,296 points cost 12,298 draw calls
    // per frame. Merged it is ~3. The tradeoff is that changing a point's colour
    // means rebuilding the layer, which only happens on selection.
    .pointsMerge(true)
    .pointLabel((d) => d.kind === "sdr"
      ? `${d.loc || d.name} · shortwave receiver`
      : `${d.count} station${d.count === 1 ? "" : "s"}`)
    // NOT .onPointClick — see pickPoint(). pointsMerge collapses every dot into
    // one mesh, so globe.gl raycasts that single object and hands the callback
    // the entire data array rather than the dot under the cursor. Wiring it up
    // meant every click on the globe selected an arbitrary place.
    ;

  // Before setupDayNight: the read-outs are global facts about the sun, the moon
  // and the ISS, and none of them needs the Earth texture to have arrived.
  mountReadouts();
  updateSun();
  await setupDayNight();
  // A slow drift — the Earth is never truly still, and a dead-static globe reads
  // as a screenshot. Slow enough not to fight you while you aim.
  //
  // Set from the layer, not to `true`. Hardcoding it here meant the globe always
  // span on launch no matter what Slow Rotation was set to, and the only thing
  // that could stop it was toggling the layer *on* and then off again — so the
  // control appeared to work backwards.
  globe.controls().autoRotate = !!layers.drift;
  globe.controls().autoRotateSpeed = 0.18;
  globe.controls().enableDamping = true;
  globe.controls().dampingFactor = 0.08;
  globe.controls().rotateSpeed = 0.75;
  globe.controls().addEventListener("change", onCameraChange);
  applyLod(true);

  // Stop the idle spin as soon as the user grabs it — autorotate fighting a drag
  // is the fastest way to make a globe feel broken.
  // Pause the drift while you're actually handling it, then let it resume.
  /**
   * Hit-testing, in screen space, because globe.gl cannot do it for us.
   *
   * `pointsMerge` merges 13,000 dots into a single mesh — without it the globe
   * ran at 5fps — and a merged mesh has no per-dot geometry to raycast against.
   * So we project every visible dot to the screen and take the nearest one
   * within a finger's width of the cursor.
   *
   * Doing it in pixels rather than degrees is what makes a dense region usable:
   * zoomed out over Europe the dots are on top of each other and you get the
   * nearest, zoomed into Los Angeles they are far apart and you get exactly the
   * one you aimed at. The threshold never has to change.
   */
  const HIT_PX = 14;
  function pickPoint(ev) {
    const data = globe.pointsData();
    if (!data.length) return null;
    const rect = el.getBoundingClientRect();
    const x = ev.clientX - rect.left, y = ev.clientY - rect.top;
    let best = null, bestD = HIT_PX * HIT_PX;
    for (const d of data) {
      const c = globe.getScreenCoords(d.lat, d.lng, 0.002);
      if (!c || c.x == null) continue;
      // Points on the far side project onto the disc too; getScreenCoords does
      // not tell us, so drop anything behind the horizon by comparing against
      // the camera's sub-point.
      const dx = c.x - x, dy = c.y - y;
      const dd = dx * dx + dy * dy;
      if (dd < bestD) { bestD = dd; best = d; }
    }
    return best;
  }

  /** True when a lat/lng faces the camera — the far hemisphere must not be clickable. */
  function facing(lat, lng) {
    const pov = globe.pointOfView();
    const rad = Math.PI / 180;
    return Math.sin(lat * rad) * Math.sin(pov.lat * rad) +
           Math.cos(lat * rad) * Math.cos(pov.lat * rad) *
           Math.cos((lng - pov.lng) * rad) > 0;
  }

  let downAt = null;
  el.addEventListener("pointerdown", (e) => {
    globe.controls().autoRotate = false; pauseDrift();
    downAt = { x: e.clientX, y: e.clientY, t: Date.now() };
  });
  el.addEventListener("pointerup", (e) => {
    if (!downAt) return;
    // A drag is not a click. Rotating the globe should never select anything.
    const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
    const quick = Date.now() - downAt.t < 500;
    downAt = null;
    if (moved > 5 || !quick) return;
    const d = pickPoint(e);
    if (!d || !facing(d.lat, d.lng)) return;
    d.kind === "sdr" ? selectReceiver(d) : goToPlace(d.i, { play: true });
  });

  // Hover label, throttled to one projection pass per frame.
  let hoverRaf = null;
  el.addEventListener("pointermove", (e) => {
    if (hoverRaf) return;
    hoverRaf = requestAnimationFrame(() => {
      hoverRaf = null;
      const d = pickPoint(e);
      const hit = d && facing(d.lat, d.lng) ? d : null;
      el.style.cursor = hit ? "pointer" : "";
      // Deliberately no tag on the globe. A label that follows the pointer across
      // a sphere is not help, it is a readout appearing where nobody asked for
      // one — and with a station locked it describes something you are not even
      // listening to. What is under the pointer belongs on the status line.
    });
  });

  el.addEventListener("wheel", () => { globe.controls().autoRotate = false; pauseDrift(); }, { passive: true });

  sizeGlobe();
  watchGlobeSize();
  updateSun();
  layers = (await window.auralfm.layers()) || layers;
  syncFlightTimer();
  syncWsprTimer();
  drawSky();
  tickISS();
  tickSatellites();
  clearInterval(issTimer);
  clearInterval(satTimer);
  issTimer = setInterval(tickISS, 4000);        // 7.6 km/s; 4s is visible motion
  satTimer = setInterval(tickSatellites, 30000); // orbits move slowly on screen
  // The terminator moves ~0.25° a minute; once a minute is imperceptibly smooth
  // and costs nothing.
  clearInterval(sunTimer);
  sunTimer = setInterval(updateSun, 60000);
  refreshSpace();
  setInterval(refreshSpace, 20 * 60000);
  applyLod(true);
  updateSun();

  /**
   * Tell main the globe is genuinely on screen, which reveals the window.
   *
   * Two frames, not one. The first is when three.js has been *told* about the
   * points; the second is after it has drawn them. Revealing on the first shows
   * a globe with no dots for about sixteen milliseconds, which is exactly the
   * kind of flicker the splash exists to remove.
   *
   * Main also has a six-second fallback, so a throw anywhere above cannot leave
   * someone staring at a logo.
   */
  requestAnimationFrame(() => requestAnimationFrame(() => {
    window.auralfm.exploreReady?.();
  }));
}

/**
 * Put the live read-outs in place.
 *
 * Called before the day/night work rather than after it. applyDayNight() waits
 * on a texture with a 30-second budget, and everything after it used to wait
 * too — so with the Status Readout switched on the bar sat on its placeholder
 * "Loading globe…" for as long as that took. The read-outs do not depend on the
 * texture, so they should not queue behind it.
 */
function mountReadouts() {
  const bar = $("globehint");
  if ($("sunreadout")) return;
  // Replaces #globestatus, which carried the placeholder. That element is the
  // only translatable thing in this bar — the read-outs are numbers, and a
  // language change used to wipe them by writing over their parent.
  
  bar.innerHTML =
    `<span id="sunreadout"></span><span id="issreadout"></span><span id="liveflag"></span>`;
}

/**
 * Level of detail. Zoomed out, only places with enough stations to matter are
 * drawn — the whole 12,296 at global zoom is an unreadable smear and makes
 * clicking a specific city nearly impossible. Zoom in and the rest appear.
 *
 * Swapping the point set rebuilds merged geometry, so this only runs when the
 * tier actually changes, not on every camera frame.
 */
const LOD_TIERS = [
  { minAltitude: 1.6, minCount: 12 },   // whole-globe: only major broadcast cities
  { minAltitude: 0.9, minCount: 4 },
  { minAltitude: 0,   minCount: 1 },    // close in: everything
];
let lodTier = -1;

let lodCentre = null;

/**
 * Which dots to draw.
 *
 * Two rules, and the second one is new because the first alone made the globe
 * unreadable up close. Zoomed into California the old filter still drew every
 * place in the hemisphere with at least one station — several thousand dots in a
 * uniform speckle, covering the terrain, with a one-station town rendered at
 * almost the same weight as Los Angeles. You could not tell where you were.
 *
 *  1. By size, as before: far out, only the major broadcast cities.
 *  2. By where you are actually looking. Anything beyond the visible cap is
 *     dropped outright — it was being drawn on the far side of the planet where
 *     nobody could see it, and it was crowding the near side through the limb.
 *
 * Recomputed when the tier changes or the centre moves appreciably, not every
 * frame: the points are merged into one geometry, so each rebuild is real work.
 */
function applyLod(force = false) {
  if (!globe || !globePts) return;
  const pov = globe.pointOfView();
  const alt = pov.altitude;
  const idx = LOD_TIERS.findIndex((t) => alt >= t.minAltitude);
  const tier = idx < 0 ? LOD_TIERS.length - 1 : idx;

  const rad = Math.PI / 180;
  const angFrom = (lat, lng, lat0, lng0) =>
    Math.acos(Math.max(-1, Math.min(1,
      Math.sin(lat * rad) * Math.sin(lat0 * rad) +
      Math.cos(lat * rad) * Math.cos(lat0 * rad) * Math.cos((lng - lng0) * rad)))) / rad;

  // The true horizon half-angle for this camera height, plus a small margin so
  // dots do not pop in at the edge of the disc. Guessed at first, which drew
  // most of North America while you were looking at California.
  const cap = Math.min(92, (Math.acos(1 / (1 + alt)) / rad) + 6);

  const moved = !lodCentre || angFrom(pov.lat, pov.lng, lodCentre.lat, lodCentre.lng) > 4;
  if (tier === lodTier && !moved && !force) return;
  lodTier = tier;
  lodCentre = { lat: pov.lat, lng: pov.lng };

  /**
   * A fixed budget of dots on screen, rather than a fixed station-count
   * threshold.
   *
   * The threshold approach could not win: tuned for the whole globe it hid
   * everything local, and tuned for a city it drew 3,594 dots across a
   * hemisphere in an unreadable speckle. A budget is self-tuning — zoomed out
   * you get the world's major broadcast cities, zoomed into California you get
   * the biggest places *in California*, because those are the only candidates
   * left in view. Same number of dots either way, always legible.
   */
  const BUDGET = 700;
  let shown = [];
  if (layers.stations) {
    const inView = [];
    for (const p of globePts) {
      if (p.i === selection.placeIndex) continue;                 // added below regardless
      if (p.count < LOD_TIERS[tier].minCount) continue;
      if (angFrom(p.lat, p.lng, pov.lat, pov.lng) > cap) continue;
      inView.push(p);
    }
    // Biggest first, so what survives the cut is what a map would have labelled.
    if (inView.length > BUDGET) {
      inView.sort((a, b) => b.count - a.count);
      inView.length = BUDGET;
    }
    shown = inView;
    const sel = globePts.find((p) => p.i === selection.placeIndex);
    if (sel) shown.push(sel);
  }
  // Receivers are sparse enough that thinning them by zoom would just make them
  // vanish. All 838, or none.
  // Receivers get their own, smaller budget. They are a different kind of thing
  // and there should never be so many amber dots that they compete with the
  // terrain — 405 of them at global zoom was its own kind of speckle. Nearest to
  // what you are looking at wins, so zooming into a region surfaces its local
  // antennas rather than a thinned-out world.
  const RX_BUDGET = 200;
  if (layers.shortwave && sdrPts) {
    const near = [];
    for (const r of sdrPts) {
      const d = angFrom(r.lat, r.lng, pov.lat, pov.lng);
      if (d <= cap) near.push({ r, d });
    }
    if (near.length > RX_BUDGET) {
      near.sort((a, b) => a.d - b.d);
      near.length = RX_BUDGET;
    }
    for (const n of near) shown.push(n.r);
    if (sdrSel && !shown.includes(sdrSel)) shown.push(sdrSel);
  }
  globe.pointsData(shown);
  // No place-count read-out: it told you nothing you could act on, and it was
  // the longest thing in the status bar.
}

let driftTimer = null;
/**
 * Resume the idle drift a few seconds after you stop handling the globe.
 *
 * The `layers.drift` check is the whole point: without it, turning Slow Rotation
 * off in the View menu stopped the globe for six seconds and then the next touch
 * of the mouse started it again, which reads as the setting being ignored. It
 * was.
 */
function pauseDrift(ms = 6000) {
  clearTimeout(driftTimer);
  driftTimer = setTimeout(() => {
    if (globe && !flying && layers.drift) globe.controls().autoRotate = true;
  }, ms);
}

/**
 * Run fn at most every `ms`, on both the leading and trailing edge.
 *
 * This replaced a debounce, and the difference is the whole reason the list felt
 * stuck. A debounce waits for the camera to go quiet — but the camera is never
 * quiet while you are dragging, and with the idle drift on it is never quiet at
 * all, so the 420ms timer was reset on every frame and the list simply did not
 * follow until you stopped touching the globe. Measured cost of following:
 * 1.8ms to find the nearest place, 0.3ms for the channel lookup. There was never
 * a performance reason to wait.
 */
function throttle(fn, ms) {
  let last = 0, timer = null;
  return function run() {
    const now = Date.now();
    const wait = ms - (now - last);
    if (wait <= 0) { last = now; clearTimeout(timer); timer = null; fn(); }
    else if (!timer) timer = setTimeout(() => { timer = null; last = Date.now(); fn(); }, wait);
  };
}

const followThrottled = throttle(followCentre, 90);
// Aircraft are fetched for wherever you are looking, so moving the camera has to
// ask again — but no faster than the feed's own minimum gap.
const flightsThrottled = throttle(() => { if (layers.flights) tickFlights(); }, 12000);
const lodThrottled = throttle(() => applyLod(), 200);

function onCameraChange() {
  lodThrottled();
  followThrottled();
  flightsThrottled();
}

/**
 * Whatever is under the middle of the globe becomes the selection, so spinning
 * the map browses the world instead of just moving pixels. Deliberately does
 * *not* start playing — auto-playing on every drag would be chaos. Clicking a
 * dot is the gesture that makes sound.
 */
function followCentre() {
  if (!globe || !globePts || showingFavorites || flying) return;
  // Locked means locked: browsing the globe must not pull the list out from
  // under you. Clicking a dot or searching still works — this only stops the
  // globe's own motion from changing what you are looking at.
  if (locked) return;
  if (sdrSel) return;                  // a receiver's bands are not a place
  const pov = globe.pointOfView();
  const near = nearestPlace(pov.lat, pov.lng);
  if (!near || near.i === selection.placeIndex) return;
  // Only follow what's plausibly on screen; at global zoom the nearest dot to
  // centre can be thousands of km away and switching to it feels random.
  const maxDeg = 6 + pov.altitude * 26;
  if (near.dist > maxDeg) return;
  goToPlace(near.i, { fly: false });
  syncChatView();          // the room moves with the place, read only
}

/** Great-circle nearest place, in degrees. A linear scan over 12k is sub-ms. */
function nearestPlace(lat, lng) {
  const rad = Math.PI / 180;
  const la = lat * rad, lo = lng * rad;
  let best = null, bestCos = -2;
  for (const p of globePts) {
    const pla = p.lat * rad, plo = p.lng * rad;
    const c = Math.sin(la) * Math.sin(pla)
            + Math.cos(la) * Math.cos(pla) * Math.cos(plo - lo);
    if (c > bestCos) { bestCos = c; best = p; }
  }
  if (!best) return null;
  return { i: best.i, dist: Math.acos(Math.min(1, Math.max(-1, bestCos))) / rad };
}

// ── layer toggles ────────────────────────────────────────────────────────────
/**
 * Which globe layers are on, driven from View in the menu bar. These are view
 * options rather than settings, so they live in the menu and take effect at once
 * — no dialog, no apply button.
 */
let layers = { clouds: true, dayNight: true, stations: true, shortwave: true,
               iss: true, flights: false, wspr: false, constellations: true,
               drift: true, listeners: true, statusBar: false };

/**
 * Show and hide the dots without rebuilding them.
 *
 * globe.gl merges every point into one geometry — 12,298 draw calls down to
 * about three, which is why the globe is smooth at all. The price is that
 * handing it a new set costs a merge, measured at **122ms of frame time** on a
 * 2019 Intel Mac. That is the freeze people describe as the layer panel being
 * broken.
 *
 * Emptying the set is cheap (~20ms); refilling it is not. So switching a layer
 * off and on again used to cost a full merge on the way back, for data that had
 * not changed at all.
 *
 * When both point layers go off, the group is hidden instead and the geometry
 * kept. Turning them back on is then a boolean — free. A merge only happens
 * when the set genuinely differs, which is when exactly one of the two changes.
 */
let pointsGroup = null;

/** Find the object globe.gl parents its merged point mesh to. Cached. */
function findPointsGroup() {
  if (pointsGroup || !globe) return pointsGroup;
  let best = null, bestVerts = -1;
  globe.scene().traverse((o) => {
    const v = o.geometry?.attributes?.position?.count || 0;
    // The merged point mesh is the biggest thing parented to a plain Group that
    // is not the globe sphere itself (which has no Group parent of its own).
    if (v > bestVerts && o.type === "Mesh" && o.parent?.type === "Group") {
      best = o.parent; bestVerts = v;
    }
  });
  pointsGroup = best;
  return pointsGroup;
}

function applyPointVisibility(prev) {
  const want = layers.stations || layers.shortwave;
  const had = prev.stations || prev.shortwave;
  const setChanged = layers.stations !== prev.stations || layers.shortwave !== prev.shortwave;
  const grp = findPointsGroup();

  if (!want) {
    // Hide, keep the geometry. Falls back to emptying if the group could not be
    // found, which is correct but slower — never wrong, just not the fast path.
    if (grp) grp.visible = false;
    else globe.pointsData([]);
    return;
  }
  if (grp) grp.visible = true;
  // Coming back from both-off with nothing else changed: the geometry we kept is
  // still right, so there is nothing to do.
  if (!had && !layersDifferBeyondBoth(prev)) return;
  if (setChanged) applyLod(true);
}

/** Did anything change other than the two point layers switching together? */
function layersDifferBeyondBoth(prev) {
  return (layers.stations !== prev.stations) !== (layers.shortwave !== prev.shortwave);
}

function applyLayers(next) {
  const prev = layers;
  layers = { ...layers, ...next };

  const bar = $("globehint");
  if (bar) bar.hidden = !layers.statusBar;
  paintLayers();          // the inspector reflects whatever main just confirmed
  if (!globe) return;

  withShader((sh) => {
    sh.uniforms.hasLive.value = (layers.clouds && liveTexReady) ? 1 : 0;
    // Sun fully overhead everywhere reads as permanent daylight, which is what
    // "day/night off" should mean.
    sh.uniforms.dayNightOn.value = layers.dayNight ? 1 : 0;
  });

  applyPointVisibility(prev);

  /**
   * Only when the orbits layer actually changed.
   *
   * This used to run on *every* layer change, and `paintOrbits` is the most
   * expensive function in the file: 325ms of synchronous work plus another
   * ~100ms of frame time, measured. Toggling station dots rebuilt the ISS
   * ground track and its labels for no reason, which is where most of the
   * "layers panel is laggy" came from — not from the points at all.
   *
   * The orbit data is kept fresh by its own timers (`tickISS` every 4s,
   * `tickSatellites` every 30s), so nothing here needs to drive it.
   */
  if (layers.listeners !== prev.listeners) paintRings();
  if (layers.iss !== prev.iss) {
    if (!layers.iss) { globe.pathsData([]).labelsData([]); issAt = null; paintRings(); }
    else paintOrbits();
  }

  globe.controls().autoRotate = layers.drift && !flying;

  // Not `!== prev.flights`: the poll has to start when the layer is already on
  // at launch, too. Keying it on the transition meant quitting with aircraft
  // switched on came back to a checked menu item and an empty sky.
  syncFlightTimer();
  syncWsprTimer();

  if (layers.constellations !== prev.constellations) drawSky();
}

window.auralfm.onLayers((l) => applyLayers(l));

// ── preferences ──────────────────────────────────────────────────────────────
/**
 * Appearance, contrast and dot size are set in Settings and pushed to every
 * window, so this reacts rather than polls.
 *
 * "system" removes the attribute entirely instead of writing data-theme="system",
 * which lets the prefers-color-scheme media query win again — an explicit value
 * here would permanently outrank the OS.
 */
let prefs = { theme: "system", contrast: "system", dotSize: "normal", language: "system",
              palette: "onair" };

/**
 * The active colour scheme.
 *
 * A palette touches the things around the planet, never the planet — the Earth
 * is real satellite imagery and recolouring it would destroy the one property
 * the whole app rests on. So: the accent, the station dots, the receiver dots,
 * the atmosphere glow and the stars.
 *
 * The dots are the surface that actually reads as a theme from across the room;
 * there are seven hundred of them and two colours of them.
 */
let palette = null;

async function applyPalette() {
  palette = (await window.auralfm.palette()) || null;
  if (!palette) return;
  const r = document.documentElement;
  // Light appearance needs the darker variant to stay legible on a pale panel,
  // exactly as the hand-written tokens did before palettes existed.
  const light = r.getAttribute("data-theme") === "light" ||
    (r.getAttribute("data-theme") !== "dark" && !matchMedia("(prefers-color-scheme: dark)").matches);
  r.style.setProperty("--accent", light ? palette.accentLight : palette.accent);
  // In light theme the star follows the accent, not `palette.star`.
  // Every palette's star is a near-white or a pale tint -- #F5F0E4, #DCE7FF,
  // #FFE9B0 -- because it was chosen to sit on the night side of a globe. On the
  // light background those measure 1.01 to 1.40:1, which is invisible: Melton
  // could not find the favourite stars at all. accentLight is already designed
  // for this background and clears the 3:1 floor WCAG sets for non-text UI in all
  // nine palettes. Dark theme keeps the pale star, where it measures 12 to 18:1.
  r.style.setProperty("--star", light ? palette.accentLight : palette.star);
  if (globe) {
    globe.atmosphereColor(palette.atmosphere);
    applyLod(true);                       // merged geometry: colour means rebuild
    drawSky();
  }
}

// Large is ~1.7×: enough to be visibly easier to see and to hit, short of the
// point where dense regions like western Europe fuse into one blob.
const DOT_SCALE = { normal: 1, large: 1.7 };
const dotRadius = (d) =>
  (0.09 + Math.sqrt(d.count) * 0.013) * (DOT_SCALE[prefs.dotSize] || 1);

function applyPrefs(next) {
  // Help tags follow the pref, and adopt() migrates any title= that arrived
  // with a freshly rendered row.
  window.Tips?.setEnabled(next?.tips !== false);
  window.Tips?.adopt();
  // Runs once, after the reveal, and only if it has never run.
  window.Tour?.maybeStart(next);
  const prev = prefs;
  prefs = { ...prefs, ...next };
  const r = document.documentElement;

  if (prefs.theme === "system") r.removeAttribute("data-theme");
  else r.setAttribute("data-theme", prefs.theme);
  r.setAttribute("data-contrast", prefs.contrast === "more" ? "more" : "normal");

  // Points are merged into a single geometry, so a size change means a rebuild.
  if (globe && prefs.dotSize !== prev.dotSize && layers.stations) applyLod(true);

  if (prefs.language !== prev.language) {
    applyStrings();
    drawSky();          // the constellation names are part of the interface too
  }
  // Appearance changes swap the accent between its light and dark variants.
  if (prefs.palette !== prev.palette || prefs.theme !== prev.theme ||
      prefs.contrast !== prev.contrast) applyPalette();
}
window.auralfm.onPrefs((next) => { applyPrefs(next); syncChat(next); });

/**
 * Stations you add or remove can change in another window — Settings has a
 * "Your stations" list with a Remove button on it. Without this, removing one
 * there left it sitting in the rail here until you navigated away and back,
 * and left the globe's dot counting a station that no longer existed.
 */
window.auralfm.onMineChanged(async () => {
  const raw = await window.auralfm.globePoints();
  globePts = raw.map(([i, lng, lat, count]) => ({ i, lng, lat, count }));
  if (selection.placeIndex != null) await selectPlace(selection.placeIndex, { keepFilter: true });
  applyLod(true);
});

// ── interface language ───────────────────────────────────────────────────────
/**
 * Only AuralFM's own chrome is translated. Station names, place names and
 * headlines stay in the language of the place they come from — translating
 * those would be wrong, not helpful.
 */
let T = {};
const t = (key, fallback) => T[key] || fallback;

async function applyStrings() {
  T = (await window.auralfm.strings()) || {};
  for (const el of document.querySelectorAll("[data-i18n]")) {
    const v = T[el.dataset.i18n];
    if (v) el.textContent = v;
  }
  for (const el of document.querySelectorAll("[data-i18n-title]")) {
    const v = T[el.dataset.i18nTitle];
    if (v) { el.title = v; el.setAttribute("aria-label", v); }
  }
  // After translation, not before. adopt() moves `title` onto `data-tip` and
  // removes it, and running it first captured the untranslated literal that the
  // markup ships as a fallback — the Layers button showed "Layers" instead of
  // "Choose what the globe shows".
  window.Tips?.adopt();
  for (const el of document.querySelectorAll("[data-i18n-ph]")) {
    const v = T[el.dataset.i18nPh];
    if (v) el.placeholder = v;
  }
}

/**
 * The cold open.
 *
 * Before anything is selected the rail was a single line of instruction above a
 * tall empty panel. Spinning the globe fills it — `followCentre` selects
 * whatever is under the middle — but at launch nobody has spun anything yet, so
 * the first thing the app shows is a blank.
 *
 * What goes there should be *alive*, so the world reads as awake before you
 * touch it, and it should be a door rather than a poster. So: the places where
 * it is currently the middle of the night, which is when radio is most itself —
 * the overnight shows, the stations nobody is watching. Every row flies you
 * there.
 *
 * The hour is solar, computed from longitude rather than a timezone database.
 * That is not a shortcut standing in for civil time: it is the same arithmetic
 * the terminator on the globe uses, so the list and the darkness agree with each
 * other, which they would not if one followed politics and the other the sun.
 */
async function paintColdOpen() {
  // Built rather than found: the station list clears its own innerHTML whenever
  // a place is selected or a search runs, so a static child would exist exactly
  // until the first time anything happened.
  if (selection.placeIndex !== null || sdrSel || showingFavorites) return;
  const el = document.createElement("div");
  el.className = "empty";
  el.id = "coldopen";
  el.style.cssText = "padding:0;text-align:left";

  let places = [], stats = null;
  try {
    [places, stats] = await Promise.all([
      window.auralfm.places("", 600).then((r) => r.places || []),
      window.auralfm.stats().catch(() => null),
    ]);
  } catch { return; }

  const utcMin = new Date().getUTCHours() * 60 + new Date().getUTCMinutes();
  const solarHour = (lon) => (((utcMin + lon * 4) / 60) % 24 + 24) % 24;

  const night = places
    .map((p) => ({ ...p, h: solarHour(p.lon) }))
    .filter((p) => p.h >= 22 || p.h < 5)
    .sort((a, b) => b.count - a.count)
    .slice(0, 9);

  // Only now, once the data is in hand, does the placeholder get replaced —
  // otherwise a slow catalogue leaves the rail blank for longer than before.
  if (selection.placeIndex !== null || sdrSel) return;
  stationListEl.innerHTML = "";
  stationListEl.append(el);

  const lead = document.createElement("div");
  lead.className = "colead";
  lead.innerHTML = stats
    ? `<b>${stats.channels.toLocaleString()}</b> ${t("cold.stations", "stations")} · ` +
      `<b>${(stats.places || 0).toLocaleString()}</b> ${t("cold.places", "places")}`
    : "";
  el.append(lead);

  if (!night.length) return;

  const head = document.createElement("div");
  head.className = "cohead";
  head.textContent = t("cold.night", "Where it is the middle of the night");
  const note = document.createElement("div");
  note.className = "conote";
  note.textContent = t("cold.nightWhy",
    "The overnight shows — the hours radio keeps to itself.");
  el.append(head, note);

  const unit = (n) => (n === 1 ? t("cold.station", "station") : t("cold.stationsShort", "stations"));
  for (const p of night) {
    const hh = String(Math.floor(p.h)).padStart(2, "0");
    const mm = String(Math.floor((p.h % 1) * 60)).padStart(2, "0");
    el.append(placeSuggestion(p, `${hh}:${mm} · ${p.country} · ${p.count} ${unit(p.count)}`));
  }
}

/**
 * The dial.
 *
 * Explore owns the picture and the controls; the popover owns the only socket in
 * the app that makes sound. So this window opens its *own* connection for the
 * spectrum — which costs the receiver nothing extra, because the Kiwi's own
 * client opens exactly these two sockets — and asks the popover to retune the
 * audio by message.
 *
 * That split is the point of moving it here. A menu-bar popover exists to show
 * what is playing; it had grown a spectrum display, four tuning buttons and
 * three filter buttons, which is a receiver front panel wearing a player's
 * clothes.
 */
let wfSession = null, tuneState = null;
/** Pending release of a paused receiver — see the player:state handler. */
let idleRelease = null;
const WF_H = 88;
let wfFloor = -120;

/**
 * dBm to colour, scaled to the band rather than to a constant.
 *
 * A fixed window looks reasonable and is nearly useless: a quiet evening sits
 * inside about fifteen decibels, so everything renders one flat blue and a
 * carrier ten dB above the noise is invisible. The floor tracks the tenth
 * percentile of recent rows — the noise — and the scale runs 45 dB above it, so
 * signals stand out by how far they rise above *their own* floor, which is the
 * only measure comparable between bands.
 */
function wfColour(db) {
  const t = Math.max(0, Math.min(1, (db - wfFloor) / 45));
  if (t < 0.35) { const k = t / 0.35; return [0, Math.round(20 * k), Math.round(60 + 90 * k)]; }
  if (t < 0.65) { const k = (t - 0.35) / 0.3; return [Math.round(30 * k), Math.round(20 + 180 * k), Math.round(150 - 60 * k)]; }
  const k = (t - 0.65) / 0.35;
  return [Math.round(30 + 225 * k), Math.round(200 + 40 * k), Math.round(90 - 90 * k)];
}

function tunerStart(rx, freq, mode, width) {
  tunerStop();
  tuneState = { host: rx.host, freq, mode, width: width || "normal" };
  syncTunerVisibility();
  paintDial();

  const cv = $("wf"), ctx = cv.getContext("2d");
  const W = cv.width;
  ctx.fillStyle = "#05070c";
  ctx.fillRect(0, 0, W, WF_H);
  const img = ctx.createImageData(W, 1);
  wfFloor = -120;                       // re-learn the floor for each receiver

  // Held until the first row lands. The receiver is somebody's BeagleBone at the
  // other end of a WebSocket, so this is seconds, not milliseconds.
  $("wfwrap")?.classList.add("waiting");
  wfSession = new Kiwi.KiwiWaterfall({
    host: rx.host, freq, zoom: 10,
    onRow: (row) => {
      $("wfwrap")?.classList.remove("waiting");
      const sorted = Array.from(row).sort((a, b) => a - b);
      wfFloor = wfFloor * 0.92 + (sorted[Math.floor(sorted.length * 0.1)] - 255) * 0.08;
      ctx.drawImage(cv, 0, 0, W, WF_H - 1, 0, 1, W, WF_H - 1);
      for (let x = 0; x < W; x++) {
        // 1024 bins into 512 pixels: take the stronger of each pair, because a
        // narrow carrier averaged with its neighbour disappears, and a carrier
        // that disappears is the one thing this display exists to show.
        const [r, g, b] = wfColour(Math.max(row[x * 2], row[x * 2 + 1]) - 255);
        img.data[x * 4] = r; img.data[x * 4 + 1] = g; img.data[x * 4 + 2] = b; img.data[x * 4 + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      ctx.fillStyle = "rgba(255,255,255,0.30)";
      ctx.fillRect(W / 2, 0, 1, 1);
    },
  });
  wfSession.connect();
}

function tunerStop() {
  clearTimeout(idleRelease); idleRelease = null;
  $("wfwrap")?.classList.remove("waiting");
  wfSession?.stop();
  wfSession = null;
  tuneState = null;
  if ($("tuner")) $("tuner").hidden = true;
}

/**
 * The dial belongs to the Shortwave tab.
 *
 * It used to appear whenever a receiver session existed, which meant it hung
 * above the *station* list too — a black spectrum panel and seven controls
 * pushing the stations down, describing a radio the Stations tab has nothing to
 * do with. Switching tabs is switching instruments; each one should show its
 * own.
 *
 * The session keeps running underneath. Going back to Stations hides the dial,
 * it does not hang up on the receiver.
 */
function syncTunerVisibility() {
  const el = $("tuner");
  // `sdrSel`, not `railMode`. The rail tabs are a *place's* two lists — its
  // stations, and the receivers near it — and they stay on "stations" even after
  // you open a receiver, because opening one replaces the whole rail. So the
  // question is not which tab is selected, it is whether a receiver is what you
  // are looking at.
  if (el) el.hidden = !(tuneState && sdrSel);
}

function paintDial() {
  if (!tuneState) return;
  $("tfreq").textContent =
    `${Number(tuneState.freq.toFixed(2))} kHz ${tuneState.mode.toUpperCase()}`;
  for (const b of $("bw").children) {
    b.setAttribute("aria-pressed", String(b.dataset.w === tuneState.width));
  }
  // The step is mode-dependent — 100 Hz on AM, 10 Hz on sideband — so the
  // tooltips have to be, or they describe a radio we are not tuning.
  const st = Kiwi.steps(tuneState.mode);
  for (const b of document.querySelectorAll(".tb")) {
    const hz = st[b.dataset.hz.slice(1)];
    b.title = `${b.dataset.hz[0] === "-" ? "Down" : "Up"} ` +
              `${Math.abs(hz) >= 1000 ? `${Math.abs(hz) / 1000} kHz` : `${Math.abs(hz)} Hz`}`;
  }
}

/** Retune both halves: the picture here, the audio over there. */
function retune(freq, width) {
  if (!tuneState) return;
  tuneState.freq = Math.min(30000, Math.max(1, +freq.toFixed(3)));
  if (width) tuneState.width = width;
  wfSession?.tune(tuneState.freq);
  window.auralfm.transport({ action: "retune",
    value: { freq: tuneState.freq, mode: tuneState.mode, width: tuneState.width } });
  paintDial();
}

for (const b of document.querySelectorAll(".tb")) {
  b.onclick = () => {
    if (!tuneState) return;
    const hz = Kiwi.steps(tuneState.mode)[b.dataset.hz.slice(1)];
    retune(tuneState.freq + (b.dataset.hz[0] === "-" ? -hz : hz) / 1000);
  };
}
for (const b of $("bw").children) {
  b.onclick = () => { if (tuneState) retune(tuneState.freq, b.dataset.w); };
}

/**
 * The first run.
 *
 * Radio is not obvious any more. Most people have never turned a dial, shortwave
 * is a rumour, and "borrowing somebody's antenna in New Zealand" sounds like a
 * figure of speech until you have done it. An interface that assumes otherwise
 * is a large part of why this technology reads as inaccessible rather than
 * merely old.
 *
 * Four cards, and the rules they follow are Apple's rather than mine: explain
 * only what is *not* discoverable, never explain a button that explains itself,
 * stay skippable at every step, and never come back. A tour that reappears has
 * learned to interrupt people.
 *
 * So there is nothing here about play or volume. What is here: that the globe is
 * the control, that the two colours of dot are two different technologies, what
 * shortwave actually is, and that nothing is being collected — which is the one
 * promise worth making before someone starts rather than after.
 */



/** Real-time factor of the last measurement, for the audit and for #30. */
let capRtf = null;

/**
 * The layer inspector.
 *
 * Built from whatever `globe:layers` reports rather than from a list written
 * here, so adding a layer in main.js puts it in this panel automatically. The
 * alternative — a second list to keep in step — is how the menu ended up with
 * ten items nobody could see the state of.
 *
 * Labels come from the same i18n keys the menu uses, so the two can never
 * disagree about what a layer is called.
 */
let layersOpen = false;

const LAYER_ORDER = [
  "stations", "shortwave", "dayNight", "clouds",
  "constellations", "iss", "flights", "wspr", "listeners", "drift", "statusBar",
];

function paintLayers() {
  const panel = $("layers"), list = $("laylist");
  if (!panel || !list) return;
  panel.hidden = !layersOpen;
  $("layersBtn").setAttribute("aria-pressed", String(layersOpen));
  if (!layersOpen) return;

  // Known order first so the list does not reshuffle, then anything new.
  const ids = [...LAYER_ORDER.filter((k) => k in layers),
               ...Object.keys(layers).filter((k) => !LAYER_ORDER.includes(k))];
  list.innerHTML = "";
  for (const id of ids) {
    const b = document.createElement("button");
    b.className = "layrow";
    b.setAttribute("aria-pressed", String(!!layers[id]));
    const dot = document.createElement("span");
    dot.className = "laydot";
    const label = document.createElement("span");
    label.textContent = t(`layer.${id}`, id);
    b.append(dot, label);
    b.onclick = () => {
      /**
       * Acknowledge instantly, commit optimistically, let the echo correct it.
       *
       * Still painted from main's echo — main owns this state and a panel that
       * lied about a failed write would be worse than a slow one. But the echo
       * can be 100ms away and the work behind it another 120, and for that
       * quarter second the row looked like it had ignored the click. It had not;
       * it was waiting to be told what it already knew.
       *
       * So the dot moves now and `paintLayers` overwrites it a moment later with
       * whatever actually happened. If the write fails the row flips back, which
       * is the honest outcome and is visible rather than silent.
       */
      b.setAttribute("aria-pressed", String(!layers[id]));
      b.classList.add("pending");
      window.auralfm.setLayers({ [id]: !layers[id] });
    };
    list.append(b);
  }
}

/**
 * Move the planet, not the panel.
 *
 * The inspector sits over the top-right of the globe, which is where the Earth
 * usually is. Shrinking the panel would make it cramped and shrinking the globe
 * would make the whole window lurch; nudging the *camera* costs nothing and is
 * the thing a person would do themselves — lean the world away from the thing
 * they just opened.
 *
 * A rotation rather than a pan, because three-globe's camera orbits a fixed
 * centre: panning would fight the controls, where a few degrees of longitude
 * and a little altitude simply slides the planet down and left and keeps every
 * layer — constellations included — in the same frame.
 */
function shiftForPanel(open) {
  if (!globe || flying) return;
  const pov = globe.pointOfView();
  const dLng = open ? -22 : 22;
  const dAlt = open ? 0.18 : -0.18;
  globe.pointOfView({
    lat: pov.lat,
    lng: pov.lng + dLng,
    altitude: Math.max(0.32, Math.min(4, pov.altitude + dAlt)),
  }, 420);
}

$("layersBtn").onclick = () => {
  layersOpen = !layersOpen;
  if (layersOpen) window.Tip?.donate("layersOpened");
  paintLayers();
  shiftForPanel(layersOpen);
};

// Click anywhere else on the globe to dismiss, the way an inspector should.
document.addEventListener("pointerdown", (e) => {
  if (!layersOpen) return;
  if ($("layers").contains(e.target) || $("layersBtn").contains(e.target)) return;
  layersOpen = false;
  paintLayers();
  shiftForPanel(false);
}, true);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && layersOpen) { layersOpen = false; paintLayers(); shiftForPanel(false); }
});

// ── real sky ─────────────────────────────────────────────────────────────────
/**
 * Draw the actual sky — 5,044 stars to magnitude 6 and 89 constellation figures
 * from the Yale Bright Star Catalog — into an equirectangular canvas used as the
 * scene backdrop.
 *
 * Honest limitation: this is a *backdrop*, not an oriented sky dome. Stars sit
 * correctly relative to each other and the constellations are the real figures,
 * but the sky does not parallax as you spin the Earth. Doing that properly means
 * a textured sky sphere on its own rotation, which is a bigger change than the
 * payoff justifies right now.
 */
async function drawSky() {
  if (!layers.constellations) {
    globe.backgroundImageUrl("vendor/night-sky.png");   // plain stars, no figures
    return;
  }
  const sky = await window.auralfm.sky();
  if (!sky?.stars?.length) return;   // keep the vendored texture
  const lang = sky.lang || "en";     // resolved in main, where "system" means something

  const W = 4096, H = 2048;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#05070c";
  ctx.fillRect(0, 0, W, H);

  // RA 0-360 -> x, Dec +90..-90 -> y
  const X = (ra) => ((ra % 360) + 360) % 360 / 360 * W;
  const Y = (dec) => (90 - dec) / 180 * H;

  /**
   * The ecliptic — the plane of the solar system, seen edge-on from inside it.
   *
   * Every planet, the Moon and the Sun stay within a few degrees of this line,
   * which is *why* the zodiac is the zodiac: those are simply the figures the
   * Sun passes in front of over a year. Drawing it turns twelve arbitrary names
   * into one visible fact, and it puts the planets already on this canvas into
   * the geometry that explains why they are where they are.
   *
   * Obliquity is 23.44 degrees — the Earth's tilt, the same number that gives us
   * seasons and the terminator's lean on the globe.
   */
  const OBLIQ = 23.4393 * Math.PI / 180;
  ctx.strokeStyle = "rgba(233,226,212,0.20)";
  ctx.lineWidth = 1.4;
  ctx.setLineDash([7, 7]);
  ctx.beginPath();
  let prevX = null;
  for (let deg = 0; deg <= 360; deg += 1) {
    const lam = deg * Math.PI / 180;
    const dec = Math.asin(Math.sin(OBLIQ) * Math.sin(lam)) * 180 / Math.PI;
    const ra = Math.atan2(Math.cos(OBLIQ) * Math.sin(lam), Math.cos(lam)) * 180 / Math.PI;
    const x = X(ra), y = Y(dec);
    // The curve wraps at RA 0; lifting the pen stops a stripe across the sky.
    if (prevX !== null && Math.abs(x - prevX) > W / 2) ctx.moveTo(x, y);
    else if (prevX === null) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
    prevX = x;
  }
  ctx.stroke();
  ctx.setLineDash([]);

  const zodiacal = new Set((sky.names || []).filter((n) => n.z).map((n) => n.id));

  // Constellation figures first, so stars sit on top of their own lines.
  ctx.lineWidth = 1.6;
  for (const c of sky.constellations) {
    // The twelve on the ecliptic are drawn brighter — not because they matter
    // astronomically, but because the line above is the reason anyone has heard
    // of them, and the pairing is the whole point.
    ctx.strokeStyle = zodiacal.has(c.id) ? "rgba(180,205,255,0.38)" : "rgba(120,165,255,0.22)";
    for (const seg of c.l) {
      ctx.beginPath();
      let px = null;
      for (const [ra, dec] of seg) {
        const x = X(ra), y = Y(dec);
        // Lift the pen where the figure crosses RA 0. Right ascension wraps and
        // the canvas does not, so a segment from 359 to 1 degrees was drawn as a
        // line straight across the entire sky — Pegasus, Pisces and Cetus each
        // laid a horizontal streak over everything. Invisible until the labels
        // arrived and gave the eye something to compare against.
        if (px !== null && Math.abs(x - px) > W / 2) ctx.moveTo(x, y);
        else if (px === null) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        px = x;
      }
      ctx.stroke();
    }
  }

  for (const [ra, dec, mag] of sky.stars) {
    // Magnitude is backwards and logarithmic: mag 0 is brilliant, mag 6 is the
    // naked-eye limit. Map it to radius and alpha so the sky has real hierarchy.
    const b = Math.max(0, (6.2 - mag) / 6.2);
    const r = 0.6 + b * b * 3.4;
    ctx.globalAlpha = 0.35 + b * 0.65;
    // Bright stars stay white; the faint ones take the palette's tint, which is
    // how a real sky looks and keeps the scheme visible without dyeing Sirius.
    ctx.fillStyle = b > 0.72 ? "#ffffff" : (palette?.star || "#ffffff");
    ctx.beginPath();
    ctx.arc(X(ra), Y(dec), r, 0, 6.2832);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  /**
   * Names.
   *
   * "That's Orion" is most of what anyone wants from a star map, and the lines
   * alone could never say it. Drawn after the stars so the type sits over the
   * figure it belongs to, and sized by the catalogue's own prominence rank so
   * Orion and Ursa Major read before Lacerta.
   *
   * The label point comes from the catalogue rather than a centroid of the
   * lines: a centroid lands inside the figure and collides with its own stars.
   */
  /**
   * Write a label that survives the sky's mirroring.
   *
   * This canvas is handed to `backgroundImageUrl`, which maps it onto the
   * inside of the celestial sphere — and from the inside you see it flipped
   * left-for-right. That is *correct* for the geometry: the constellations then
   * appear the way they do when you stand outside and look up, which is the
   * whole point of drawing real ones. Text does not survive the same trip, so
   * every label read backwards — Orion rendered as "noirO", Shield as "bleidS".
   *
   * Pre-flipping just the glyphs cancels the mapping's flip and leaves every
   * star, line and coordinate exactly where it was. Flipping the whole canvas
   * instead would have fixed the words and quietly mirrored the sky.
   */
  function skyText(text, x, y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(-1, 1);
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  ctx.textAlign = "center";
  for (const n of sky.names || []) {
    const label = n.name?.[lang] || n.name?.en || n.id;
    if (!label) continue;
    const prominent = n.rank === 1;
    ctx.font = `${prominent ? 600 : 500} ${prominent ? 25 : 19}px ` +
               `-apple-system, system-ui, sans-serif`;
    ctx.globalAlpha = n.z ? 0.72 : (prominent ? 0.55 : 0.34);
    ctx.fillStyle = n.z ? (palette?.accent || "#E9E2D4") : "#cfe0ff";
    skyText(label, X(n.ra), Y(n.dec));
  }
  ctx.globalAlpha = 1;

  /**
   * The planets, on top of the stars because that is where they are — wandering
   * across a fixed background. Drawn with their own colour and a soft halo so
   * they read as a different kind of object rather than just a brighter star,
   * which is exactly how they look to the eye.
   *
   * Positions are computed for right now, so the sky redraws them as they move.
   */
  for (const pl of Astro.planets()) {
    const x = X(pl.ra), y = Y(pl.dec);
    const b = Math.max(0.15, Math.min(1, (2.5 - pl.mag) / 7));
    const r = 2.2 + b * 4.4;

    const halo = ctx.createRadialGradient(x, y, 0, x, y, r * 3.6);
    halo.addColorStop(0, pl.colour);
    halo.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(x, y, r * 3.6, 0, 6.2832);
    ctx.fill();

    ctx.globalAlpha = 1;
    ctx.fillStyle = pl.colour;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 6.2832);
    ctx.fill();

    // A name, because an unlabelled bright dot is just a brighter star.
    ctx.font = "600 21px -apple-system, system-ui, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.62)";
    ctx.textAlign = "center";
    skyText(pl.name, x, y - r - 11);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = "left";

  globe.backgroundImageUrl(cv.toDataURL("image/jpeg", 0.86));
}

// ── ISS ──────────────────────────────────────────────────────────────────────
/**
 * The station, live, with the track it has just flown.
 *
 * The trail is *recorded*, not predicted — positions we actually observed rather
 * than an orbit we propagated. Less impressive, but it is true, and it needs no
 * SGP4 propagator.
 */
let issTrail = [], issTimer = null, sats = [], satTimer = null;
let flightData = [], flightTimer = null, flightBusy = false;
let wsprData = [], wsprTimer = null, wsprBusy = false;

/**
 * Space weather. Refreshed rarely on purpose — the sun does not change fast, the
 * K-index only meaningfully moves every three hours, and flux is a daily figure.
 */
let spaceWx = null;

/**
 * Other listeners, if presence is switched on.
 *
 * Drawn as slow pulsing rings rather than dots, because a different *shape*
 * reads as a different kind of thing far more reliably than a different colour —
 * and on a globe that already carries station dots, receiver dots, aircraft
 * trails and propagation arcs, one more coloured dot would just be noise.
 *
 * A ring is also the honest picture: these are not points, they are geohash
 * cells about twenty kilometres across. Somebody is listening near there.
 */
let peers = [];
window.auralfm.onPeers((list) => {
  peers = Array.isArray(list) ? list : [];
  paintRings();
  paintChatHead();
});

/**
 * The conversation in the cell you are listening to.
 *
 * This is a *public* square about twenty kilometres across, not a private
 * message, and the interface should never let anyone forget it: no encryption
 * badge, no lock, no direct-message affordance, and a placeholder that says
 * "this place" rather than a person's name.
 *
 * It appears only when presence is on and something is playing, because those
 * are the same two conditions under which we announce at all — a chat box that
 * cannot send is worse than no chat box.
 */
let chatOn = false;
let myCell = null;

/** Same test the main process uses: one cell contains the other, at any zoom. */
const sameCell = (a, b) => a.startsWith(b) || b.startsWith(a);

function paintChatHead() {
  const where = $("chatwhere"), who = $("chatpeers");
  if (!where || !who) return;
  /**
   * Only the people in *this* cell.
   *
   * `peers` is everyone the relays have shown us anywhere on Earth, which is
   * right for the rings on the globe and wrong here: the first version of this
   * header read "Near Lisbon · 11 listening" while the eleven were in Toronto,
   * Tehran and Prague. A true number under a false label is worse than no
   * number.
   */
  const cell = viewingCell || myCell;
  const near = cell ? peers.filter((p) => p.geohash && sameCell(p.geohash, cell)).length : 0;
  // Name the room actually on screen. While browsing that is the place under the
  // globe, not the station playing in your ears, and labelling it wrong is worse
  // than showing nothing — it would attribute strangers to a city they are not in.
  const browsedPlace = viewingCell && selection.place ? selection.place.title : null;
  where.textContent = browsedPlace
    ? `${t("chat.near", "Near")} ${browsedPlace}`
    : playing?.place
      ? `${t("chat.near", "Near")} ${playing.place}`
      : t("chat.here", "Around here");
  who.textContent = near
    ? `${near} ${near === 1 ? t("chat.listener", "listening") : t("chat.listeners", "listening")}`
    : t("chat.alone", "nobody else yet");

  /**
   * Say what the number is not.
   *
   * "3 listening" invites the obvious wrong reading — that three people are
   * using AuralFM. The relays can see far more than that, everywhere on Earth,
   * and the difference between the two numbers is the whole shape of the
   * network. It does not belong in the header, where it would compete with the
   * count that actually describes this place, but leaving it unexplained is why
   * the question keeps getting asked.
   */
  const everywhere = peers.length;
  // No tag. This was two sentences explaining a number that is already on
  // screen — a readout wearing a help tag, and the longest one in the app. Help
  // tags describe how to use a control; this describes data.
  who.setAttribute("aria-label", everywhere > near
    ? `${near} here, ${everywhere} worldwide`
    : `${near} here`);
}

/**
 * One timeline, three sources.
 *
 * Public messages, location notes and private messages all belong to the place
 * you are looking at, and they arrive on three separate channels. The first
 * version of this gave each one its own panel, which was wrong for a reason
 * worth keeping: they are the same conversation. A note left this morning and a
 * reply whispered privately an hour later read as one exchange, and splitting
 * them into tabs makes the reader reassemble the order by hand.
 *
 * So they are held separately — each channel repaints its own cache — and merged
 * by time on the way to the screen. Styling carries the difference, because the
 * difference matters enormously: a note is public and permanent, a private
 * message is neither.
 */
let noteCache = [];
let dmCache = [];
/** Everything main knows about the people here, keyed by pubkey. */
let contacts = new Map();

function paintChat(list) {
  // Kept so /mute can turn a name somebody typed into the key it belongs to.
  chatCache = Array.isArray(list) ? list.slice(-200) : [];
  repaintLog();
}

function paintNotes(list) {
  noteCache = Array.isArray(list) ? list.slice(0, 200) : [];
  repaintLog();
}

function paintDms(list) {
  dmCache = Array.isArray(list) ? list.slice(-200) : [];
  repaintLog();
}

function repaintLog() {
  const log = $("chatlog");
  if (!log) return;
  // Only stick to the bottom if the reader is already there — yanking someone
  // away from a line they are reading is the classic chat-window sin.
  const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
  log.innerHTML = "";

  const merged = [
    ...chatCache.map((m) => ({ ...m, sort: m.at || 0 })),
    ...noteCache.map((m) => ({ ...m, kind: "note", sort: m.at || 0 })),
    ...dmCache.map((m) => ({ ...m, kind: "dm", sort: m.at || 0 })),
  ].sort((a, b) => a.sort - b.sort);

  for (const m of merged) {
    const el = document.createElement("div");
    el.className = "msg" + (m.mine ? " mine" : "") + (m.kind ? ` ${m.kind}` : "");
    const who = document.createElement("span");
    who.className = "who";
    // No nickname is the common case, and a truncated pubkey is at least true.
    who.textContent = (m.mine ? t("chat.you", "you") : (m.nick || m.from)) + "  ";
    // The name is the mute control. Nothing else in a chat line identifies a
    // person, so there is nowhere better to put it, and a separate button on
    // every message would be a column of buttons nobody wants.
    if (!m.mine && m.pubkey) {
      who.classList.add("mutable");
      who.tabIndex = 0;
      who.setAttribute("role", "button");
      who.title = t("chat.mute", "Mute or report this person");
      /**
       * Click a name: mute, or mute and report.
       *
       * Two choices rather than one, because they are not the same act. Muting is
       * about your window and takes effect now. Reporting is about the message
       * and goes to a person who will read it later — and since there is no
       * server, "later" is genuinely later. Reporting always mutes as well: a
       * report that leaves somebody on screen has done nothing for the person who
       * filed it.
       */
      const act = async () => {
        const label = m.nick || m.from;
        // Two questions rather than one dialog with three meanings. The first
        // Cancel stops everything and the second declines the extra step —
        // neither one does something on the way out, which a single confirm
        // offering "OK reports, Cancel mutes" would.
        if (!confirm(t("chat.muteAsk",
          `Mute ${label}? You will stop seeing their messages. This is only on this Mac.`)
          .replace("{who}", label))) return;
        await guard("muteAdd", () => window.auralfm.muteAdd(m.pubkey));
        if (!confirm(t("chat.reportAsk",
          "Also report this message? It opens an email draft with the message in it — nothing is sent until you send it."))) return;
        await guard("chatReport", () => window.auralfm.chatReport({
          pubkey: m.pubkey, text: m.text, at: m.at, geohash: m.geohash,
        }));
        systemLine(t("chat.reported",
          "Muted, and an email draft is open. Nothing was sent automatically — AuralFM has no "
          + "server, and it cannot delete this from the relays carrying it."));
      };
      who.onclick = act;
      who.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); act(); } };
    }
    // Mentions. BitChat uses @nickname to notify a specific person; here it only
    // marks the line, because there are no notifications to raise and a chat that
    // pings is a chat that interrupts listening.
    const mine = (prefs.nickname || "").trim();
    if (mine && new RegExp(`@${mine.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(m.text)) {
      el.classList.add("mention");
    }
    /**
     * What kind of line this is, said in words.
     *
     * A pin glyph and a padlock glyph would be quicker to scan and would tell a
     * screen reader nothing, and the distinction being marked here is the whole
     * safety property: public and permanent, versus encrypted to one person. So
     * it is a short word, in the text, that every reader gets.
     */
    if (m.kind === "note" || m.kind === "dm") {
      const tag = document.createElement("span");
      tag.className = `msgkind ${m.kind}`;
      tag.textContent = m.kind === "note"
        ? t("chat.note", "note") : t("chat.private", "private");
      el.prepend(tag);
    }

    // Contacts. A tick for somebody whose fingerprint you checked yourself, a
    // star for somebody you keep. Both after the name, both with a real label —
    // a bare glyph claiming "verified" would be the least honest thing here.
    const c = m.pubkey && contacts.get(m.pubkey);
    if (c?.verified) who.append(badge("✓", t("chat.verifiedWho", "fingerprint verified by you")));
    if (c?.favorite) who.append(badge("★", c.mutual
      ? t("chat.mutualWho", "kept, and they keep you") : t("chat.favWho", "kept by you")));

    el.append(who, document.createTextNode(m.text));
    // Everyone here from AuralFM is tuned in rather than standing there, and
    // some bitchat users are too. Say so, quietly.
    if (m.teleport) {
      const far = document.createElement("span");
      far.className = "who";
      far.style.cssText = "opacity:.55;font-weight:400";
      far.textContent = `  ${t("chat.tuned", "tuned in")}`;
      el.append(far);
    }
    log.append(el);
  }
  if (atBottom) log.scrollTop = log.scrollHeight;
}

/** A small mark after a name, with the words behind it available to everyone. */
function badge(glyph, label) {
  const b = document.createElement("span");
  b.className = "badge";
  b.textContent = ` ${glyph}`;
  b.title = label;
  b.setAttribute("aria-label", label);
  b.setAttribute("role", "img");
  return b;
}

window.auralfm.onChat(paintChat);
window.auralfm.onNotes(paintNotes);
window.auralfm.onDms((list) => {
  paintDms(list);
  /**
   * Marking read on arrival, because the panel being open is what "read" means
   * here. There is no notification and no badge to chase — the unread flag exists
   * so the menu bar can show a count while the panel is shut, and the moment the
   * log repaints with the message in it, that count is a lie.
   */
  if (!$("chat")?.hidden) {
    for (const m of list) if (m.unread && !m.mine) window.auralfm.dmRead(m.with);
  }
});
window.auralfm.onSocial((list) => {
  contacts = new Map((list || []).map((c) => [c.pubkey, c]));
  repaintLog();
});

/**
 * Show or hide the whole panel.
 *
 * Shortwave was excluded here on the argument that a receiver is somewhere you
 * listen *from* rather than a place you are in. That does not survive the
 * obvious comparison: tuning a stream from Rio while sitting in Houston puts you
 * in Rio's cell, and tuning a receiver in Wellington is the same act. Both are
 * somewhere you are not. The only real difference was that the SDR session was
 * never given coordinates, which made a missing field look like a decision.
 *
 * The condition is now simply: presence is on, something is playing, and it has
 * a location.
 */
let viewingCell = null;      // set while browsing a cell we are not listening to

async function syncChat(prefs) {
  const want = !!(prefs?.presence === true && playing
                  && typeof playing.lat === "number" && typeof playing.lon === "number");
  $("chat").hidden = !want;
  if (want === chatOn) return;
  chatOn = want;
  if (want) {
    try {
      // Contacts first, so the very first repaint already knows who is verified.
      // Painting the log and then learning about badges makes them appear a beat
      // late, which reads as a glitch on the one signal that must look solid.
      contacts = new Map((await window.auralfm.socialList() || []).map((c) => [c.pubkey, c]));
      noteCache = await window.auralfm.notesHistory() || [];
      dmCache = await window.auralfm.dmHistory() || [];
      paintChat(await window.auralfm.chatHistory());
      const st = await window.auralfm.presenceStats();
      myCell = st?.cell || null;
      viewingCell = st?.viewing || null;
    } catch { /* not up yet */ }
    paintChatHead();
    chatNotice();
  } else {
    myCell = null;
    viewingCell = null;
    // Notes belong to the place. Leaving it should not leave them on screen
    // under whatever place comes next.
    noteCache = [];
  }
}

/**
 * Point the conversation at whatever the globe is pointed at.
 *
 * With the lock off, sweeping the world already moves the place and the station
 * list. This moves the room too, which is the scanning metaphor finished — but
 * reading only. `presenceView` never announces and `say()` still guards on the
 * cell we are actually listening to, so browsing cannot broadcast a location
 * trail and cannot post into a room we are not standing in.
 *
 * Locking, or having nothing selected, hands the chat back to the station.
 */
async function syncChatView() {
  if (!chatOn) return;
  const p = (!locked && selection.place) ? selection.place : null;
  window.auralfm.presenceView(p ? p.lat : null, p ? p.lon : null);
  // Re-read rather than assume: main ignores the call entirely when presence is
  // off, and the renderer should reflect what actually happened.
  try {
    const st = await window.auralfm.presenceStats();
    viewingCell = st?.viewing || null;
  } catch { /* leave the last known state */ }
  paintChatHead();
  paintComposer();
}

/**
 * What this channel is, said once, the first time somebody sees it.
 *
 * Not a disclaimer and not a gate. Every other chat app a person has used has
 * somebody behind it who can remove a message and suspend an account, so arriving
 * here with that expectation is the reasonable thing to do — and it is wrong. The
 * sentence is short and it says the true thing: nobody moderates this, and the
 * tools are yours.
 *
 * In the log rather than in a modal, because a modal in front of a globe is an
 * interruption and this is information, not a decision. It sits at the top of the
 * conversation where somebody reading the room will read it.
 */
function chatNotice() {
  if (prefs?.chatNoticeSeen) return;
  systemLine(t("chat.notice",
    "About this channel: it is a public conversation carried by relays AuralFM does not own. "
    + "Nobody moderates it, and nothing can be deleted from somebody else's relay — not by you, "
    + "and not by us. What you do control is your own window: click a name to mute or report, "
    + "the word filter is on, and Settings can limit this to people you have kept. "
    + "Triple-click the log to erase everything."));
  window.auralfm.setPrefs({ chatNoticeSeen: true });
}

/** A room you are only looking at cannot be spoken into, and should say so. */
function paintComposer() {
  const input = $("chatinput");
  if (!input) return;
  const browsing = !!viewingCell;
  input.disabled = browsing;
  input.placeholder = browsing
    ? t("chat.browsing", "Listening here would let you reply")
    : t("chat.placeholder", "Say something to this place");
}

/**
 * Slash commands.
 *
 * BitChat's own instructions end with "type / for commands", and it is the right
 * shape for this: a chat box with one text field and no room for buttons, in an
 * app whose users are shortwave listeners already comfortable with terse syntax.
 *
 * Four of these reach a relay — /drop, /msg, /fav and /me. The rest are local,
 * and that is the point: the useful commands in a room you cannot moderate are
 * the ones that change what *you* see.
 */
const COMMANDS = {
  "/help": {
    hint: "list these commands",
    run: () => systemLine(Object.entries(COMMANDS)
      .map(([k, v]) => `${k} — ${v.hint}`).join("\n")),
  },
  "/who": {
    hint: "who else is here",
    run: () => {
      const n = peers.length;
      systemLine(n
        ? `${n} ${n === 1 ? "person" : "people"} visible on the relays right now.`
        : "Nobody else is visible on the relays right now.");
    },
  },
  "/clear": {
    hint: "clear this log (local only)",
    run: () => { $("chatlog").textContent = ""; systemLine("Cleared. Only here — the relays still have it."); },
  },
  "/me": {
    hint: "/me is listening — sends as an action",
    run: (rest) => rest ? { send: `* ${rest}` } : systemLine("Say what you are doing: /me is tuning around."),
  },
  "/mute": {
    hint: "/mute <name> — stop seeing somebody",
    run: async (rest) => {
      const who = findPerson(rest, "/mute");
      if (!who) return;
      await guard("muteAdd", () => window.auralfm.muteAdd(who.pubkey));
      systemLine(`Muted ${name(who)}. Settings can undo it.`);
    },
  },

  /**
   * Leave a note at this place — bitchat's /drop, and the only command here that
   * publishes something relays keep.
   *
   * The warning is not decoration. Everything else this app sends is an
   * ephemeral kind that relays are asked to forward and forget; a note is an
   * ordinary kind-1 text note, stored and served to anyone who asks. It is
   * signed by a key that will not exist after quit, so there is no way to
   * publish the deletion request that would ask relays to drop it. "A day" is
   * what the note asks for, not what anyone can enforce.
   */
  "/drop": {
    hint: "/drop <note> — leave a note here for a day (public, permanent)",
    run: async (rest) => {
      const body = (rest || "").trim();
      if (!body) return systemLine("Write the note: /drop the 40m band is busy after dark.");
      if (!confirm(t("notes.ask",
        "Leave this note on the relays?\n\nUnlike everything else AuralFM sends, a note is stored and public. "
        + "It asks to expire in a day, but relays are not required to honour that, and it cannot be unsent."))) return;
      const ok = await guard("noteDrop", () => window.auralfm.noteDrop(body), false);
      systemLine(ok
        ? "Note left here. Anyone tuning to this place will see it for a day."
        : "Nothing was sent — no relay is connected, or nothing is playing.");
    },
  },
  "/notes": {
    hint: "notes left at this place",
    run: async () => {
      const list = await guard("notesHistory", () => window.auralfm.notesHistory(), []);
      if (!list.length) return systemLine("No notes here. /drop leaves one.");
      systemLine(list.map((n) => `${n.nick || n.from}: ${n.text}`).join("\n"));
    },
  },

  /**
   * A private message.
   *
   * Reaches whoever is visible in the room right now with no setup at all: their
   * announced key is already on screen, and it is a perfectly good address for
   * as long as they are there. It only reaches somebody *later* if both sides
   * have switched on the durable identity in Settings — which is the honest
   * shape of a system with no accounts in it.
   */
  "/msg": {
    hint: "/msg <name> <words> — privately, encrypted",
    run: async (rest) => {
      const [first, ...words] = (rest || "").trim().split(" ");
      const who = findPerson(first, "/msg");
      if (!who) return;
      const body = words.join(" ").trim();
      if (!body) return systemLine(`Say something: /msg ${first} are you hearing this too?`);
      const ok = await guard("dmSend", () => window.auralfm.dmSend(who.pubkey, body), false);
      if (!ok) return systemLine("Not sent — no relay is connected, or they are muted.");
      systemLine(`→ ${name(who)} (private): ${body}`);
    },
  },
  "/fav": {
    hint: "/fav <name> — keep somebody, and tell them",
    run: (rest) => setFavorite(rest, true),
  },
  "/unfav": {
    hint: "/unfav <name> — stop keeping somebody",
    run: (rest) => setFavorite(rest, false),
  },

  /**
   * Fingerprints, and the one thing in this app that means something about a
   * person rather than a key.
   *
   * Printing both fingerprints and stopping is the whole design. The app cannot
   * verify anybody — only two people looking at the same sixteen characters can
   * do that, out loud, in person or on a call they already trust. Marking it
   * verified afterwards is a separate deliberate act in Settings, because a
   * confirm dialog in the middle of a chat is not a security practice.
   */
  "/verify": {
    hint: "/verify <name> — compare fingerprints in person",
    run: async (rest) => {
      const who = findPerson(rest, "/verify");
      if (!who) return;
      const theirs = await guard("fp", () => window.auralfm.socialFingerprint(who.pubkey), null);
      const mine = await guard("stats", () => window.auralfm.presenceStats(), null);
      if (!theirs) return systemLine("No key to check.");
      systemLine([
        `${name(who)}: ${theirs.readable}`,
        mine?.fingerprint ? `you: ${mine.fingerprint}` : null,
        "Read these to each other. If they match, mark them verified in Settings.",
        "A fingerprint sent over this chat proves nothing — anyone can type one.",
      ].filter(Boolean).join("\n"));
    },
  },
  /**
   * Report the last thing somebody said.
   *
   * There is nowhere to send a report to — no server, by design — so this
   * composes an email to a published address with the evidence in it, mutes
   * them, and lets the person press send or not. That is the whole mechanism,
   * and it is deliberately not dressed up as more than it is.
   */
  "/report": {
    hint: "/report <name> — mute them and draft a report",
    run: async (rest) => {
      const who = findPerson(rest, "/report");
      if (!who) return;
      await guard("muteAdd", () => window.auralfm.muteAdd(who.pubkey));
      await guard("chatReport", () => window.auralfm.chatReport({
        pubkey: who.pubkey, text: who.text, at: who.at, geohash: who.geohash,
      }));
      systemLine(`Muted ${name(who)}, and an email draft is open. Nothing was sent automatically.`);
    },
  },
  "/wipe": {
    hint: "erase everything, now",
    run: () => { panicWipe(); },
  },
};

/** What to call somebody: their nickname if they chose one, else their key stub. */
const name = (p) => p.nick || p.from || String(p.pubkey || "").slice(0, 8);

/**
 * Find the person a command is about.
 *
 * Matches a nickname exactly or a key stub by prefix, over everyone who has
 * spoken here. Reports its own failure and returns null, so every caller is one
 * line rather than five identical ones.
 */
function findPerson(rest, cmd) {
  const want = String(rest || "").trim().toLowerCase();
  if (!want) { systemLine(`Who? ${cmd} followed by the name shown beside a message.`); return null; }
  const hit = chatCache.find((m) => !m.mine && m.pubkey &&
    ((m.nick || "").toLowerCase() === want || m.from.toLowerCase().startsWith(want)));
  if (!hit) { systemLine(`Nobody called "${String(rest).trim()}" has said anything here.`); return null; }
  return hit;
}

async function setFavorite(rest, on) {
  const who = findPerson(rest, on ? "/fav" : "/unfav");
  if (!who) return;
  const ok = await guard("socialFavorite", () => window.auralfm.socialFavorite(who.pubkey, on), false);
  if (!ok) return systemLine("That did not work — they may be muted.");
  systemLine(on
    ? `Keeping ${name(who)}. They have been told, privately. It becomes mutual if they keep you back.`
    : `No longer keeping ${name(who)}.`);
  // The honest caveat, once, at the moment it matters: most keys out there are
  // ephemeral, so a favorite usually will not survive the other side quitting.
  if (on) systemLine("Most keys on this network are thrown away at quit, including ours by default. "
    + "Settings → Privacy has a durable identity if you want this to last.");
}

/**
 * Erase everything, from here.
 *
 * BitChat's triple-tap. Confirmed rather than instant, because on a desktop a
 * stray triple-click on a panel is far likelier than on a phone logo, and an
 * unrecoverable action that fires on a mis-click is a worse bug than not having
 * the gesture.
 */
async function panicWipe() {
  if (!confirm(t("chat.wipeAsk",
    "Erase favorites, listening history, the mute list and every key this session used? This cannot be undone."))) return;
  const done = await guard("panicWipe", () => window.auralfm.panicWipe(), []);
  $("chatlog").textContent = "";
  systemLine(t("chat.wiped", "Erased.") + " " + (done || []).join(", "));
}

/** A line in the log from the app rather than from a person. */
function systemLine(text) {
  const log = $("chatlog");
  const el = document.createElement("div");
  el.className = "msg system";
  el.textContent = text;
  log.append(el);
  log.scrollTop = log.scrollHeight;
}

/** Newest messages, kept so /mute can resolve a name to a key. */
let chatCache = [];

/**
 * Triple-click the log to wipe, which is BitChat's triple-tap.
 *
 * `detail` counts clicks in a native multi-click sequence, so this needs no
 * timers of its own and matches whatever the system considers a triple-click.
 */
$("chatlog").addEventListener("click", (e) => { if (e.detail === 3) panicWipe(); });

$("chatform").onsubmit = async (e) => {
  e.preventDefault();
  const input = $("chatinput");
  let text = input.value.trim();
  if (!text) return;

  if (text.startsWith("/")) {
    const [word, ...rest] = text.split(" ");
    const cmd = COMMANDS[word.toLowerCase()];
    input.value = "";
    if (!cmd) return systemLine(`${word} is not a command. Try /help.`);
    const out = await cmd.run(rest.join(" "));
    if (!out || !out.send) return;
    text = out.send;                     // /me rewrites rather than intercepts
  }

  input.disabled = true;
  const sent = await window.auralfm.chatSay(text, null).catch(() => false);
  input.disabled = false;
  input.focus();
  if (sent) input.value = "";
  else {
    // Never silently swallow it. If no relay took the message, the text stays
    // where the person typed it.
    input.placeholder = t("chat.failed", "AuralFM cannot reach a relay. It did not send your message.");
    setTimeout(() => { input.placeholder = t("chat.placeholder", "Say something to this place"); }, 4000);
  }
};
async function refreshSpace() {
  try { spaceWx = (await window.auralfm.space()) || spaceWx; } catch { /* keep the last */ }
}

/**
 * Radio propagation — the ionosphere, drawn.
 *
 * Every WSPR report is a statement that a signal left one grid square and
 * arrived in another, right now, on a named band. Drawn as great-circle arcs,
 * that is a live picture of which paths across the planet are open — the thing
 * the whole shortwave feature depends on and the one thing the globe could not
 * previously show.
 *
 * Same discipline as the aircraft layer: nothing fetched unless the layer is on,
 * nothing fetched while the window is hidden, and the module behind it caps the
 * result and backs off.
 */
async function tickWspr() {
  if (!layers.wspr) { wsprData = []; paintOrbits(); return; }
  if (document.hidden || wsprBusy) return;
  wsprBusy = true;
  try {
    wsprData = (await window.auralfm.wspr(null)) || [];
    paintOrbits();
  } catch { /* best-effort, like everything else live here */ }
  finally { wsprBusy = false; }
}

function syncWsprTimer() {
  const wanted = !!layers.wspr;
  const running = !!wsprTimer;
  if (wanted === running) return;
  clearInterval(wsprTimer);
  wsprTimer = null;
  if (wanted) {
    tickWspr();
    // WSPR transmits on a two-minute cycle; nothing new exists faster.
    wsprTimer = setInterval(tickWspr, 3 * 60000);
  } else {
    wsprData = [];
    paintOrbits();
  }
}

/**
 * Aircraft near where you are looking.
 *
 * Three guards, and all three exist because this polls a volunteer-run feed:
 * nothing is fetched unless the layer is on, nothing is fetched while the window
 * is hidden, and only one request is ever in flight. The module behind it caps
 * the result and backs off on failure.
 *
 * Drawn as short heading trails rather than dots. A dot cannot show which way
 * something is going, and direction is most of what makes a moving aircraft
 * interesting — the traffic over an airport reads as arrivals and departures
 * rather than a swarm.
 */
/** Start or stop the poll to match the layer, idempotently. */
function syncFlightTimer() {
  const wanted = !!layers.flights;
  const running = !!flightTimer;
  if (wanted === running) return;
  clearInterval(flightTimer);
  flightTimer = null;
  if (wanted) {
    tickFlights();
    flightTimer = setInterval(tickFlights, 12000);
  } else {
    flightData = [];
    paintOrbits();
  }
}

/**
 * A hidden window must not poll, but it must also not stay empty once it comes
 * back — so returning to the front asks immediately rather than waiting out the
 * remaining interval.
 */
document.addEventListener("visibilitychange", () => {
  if (document.hidden) return;
  if (layers.flights) tickFlights();
  if (layers.wspr) tickWspr();
});

async function tickFlights() {
  if (!layers.flights || !globe) { paintFlights([]); return; }
  if (document.hidden || flightBusy) return;
  flightBusy = true;
  try {
    const pov = globe.pointOfView();
    // Roughly the angular radius of what is on screen, which is what the module
    // turns into a request radius.
    // The horizon half-angle is what is actually on screen. It used to be
    // inflated and then capped at 12 degrees, which meant every zoom asked for
    // the same 250nm circle regardless of how much of the world was visible.
    const span = Math.max(1.5, Math.acos(1 / (1 + pov.altitude)) * 180 / Math.PI);
    // The endpoint will not serve beyond 250nm, and over a city the visible area
    // is far wider than that — so close in, the honest move is to fill the circle
    // we are allowed to ask for rather than thin it out.
    const want = pov.altitude <= 0.55 ? 320 : pov.altitude <= 1.2 ? 200 : 120;
    flightData = (await window.auralfm.flights(pov.lat, pov.lng, span, want)) || [];
    paintFlights(flightData);
  } catch { /* best-effort, like everything else live here */ }
  finally { flightBusy = false; }
}

/** One short great-circle segment per aircraft, pointing where it is headed. */
function flightPaths(list) {
  const rad = Math.PI / 180;
  return list.map((f) => {
    // About 90 seconds of travel, so faster aircraft draw longer trails.
    const km = Math.max(6, ((f.kt || 250) * 1.852) / 40);
    const d = (km / 6371);
    const t = (f.track ?? 0) * rad, la = f.lat * rad, lo = f.lng * rad;
    const lat2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(t));
    const lon2 = lo + Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(la),
                                 Math.cos(d) - Math.sin(la) * Math.sin(lat2));
    return { flight: f, coords: [[f.lat, f.lng], [lat2 / rad, ((lon2 / rad + 540) % 360) - 180]] };
  });
}

function paintFlights() { paintOrbits(); }

/**
 * Orbits, propagated rather than recorded.
 *
 * The ISS trail below is where it has *been*; these are where each spacecraft is
 * *going* — a full revolution of real SGP4 track. Propagated in main, because it
 * is pure maths and the renderer has no node modules.
 */
async function tickSatellites() {
  if (!globe || !layers.iss) return;
  const list = await window.auralfm.satellites();
  if (Array.isArray(list) && list.length) sats = list;
  paintOrbits();
}

let issAt = null;

/**
 * One rings layer, two tenants. globe.gl rebuilds a layer wholesale on update,
 * so the ISS and the listeners share it and branch on `kind` rather than
 * fighting over which one drew last.
 */
function paintRings() {
  if (!globe) return;
  const data = [];
  if (layers.iss && issAt) data.push({ ...issAt, kind: "iss" });
  // Gated like every other thing drawn on this globe. It was not, so somebody
  // who turned all the layers off still had rings pulsing at them with nothing
  // in the panel to explain what they were.
  if (layers.listeners) {
    for (const p of peers) data.push({ lat: p.lat, lng: p.lon, kind: "peer", label: p.label });
  }

  globe
    .ringsData(data)
    .ringLat("lat").ringLng("lng")
    // Listeners pulse wider and slower than the ISS — it is overhead and moving,
    // they are a place on the ground where somebody is sitting.
    .ringMaxRadius((d) => (d.kind === "peer" ? 3.6 : 2.4))
    .ringPropagationSpeed((d) => (d.kind === "peer" ? 0.8 : 1.6))
    .ringRepeatPeriod((d) => (d.kind === "peer" ? 2600 : 1400))
    .ringAltitude(0.055)
    .ringColor((d) => d.kind === "peer"
      ? (t) => hexA(palette?.star || "#F5F0E4", 0.5 * (1 - t))
      : (t) => `rgba(255,255,255,${0.55 * (1 - t)})`);
}

function paintOrbits() {
  if (!globe) return;
  const orbitPaths = sats.flatMap((s) =>
    s.path.map((seg) => ({ pts: seg, orbit: true })));
  const issPaths = issTrail.length > 1 ? splitTrail(issTrail).map((seg) => ({ pts: seg })) : [];
  // Aircraft share the path layer rather than adding one: globe.gl rebuilds a
  // layer wholesale on every update, and two layers updating on different clocks
  // is twice the rebuild for no gain.
  const air = (layers.flights ? flightPaths(flightData) : [])
    .map((f) => ({ pts: f.coords, air: true, flight: f.flight }));

  /**
   * Propagation arcs. globe.gl interpolates a path along the great circle
   * between its points, so two endpoints are enough to get the curve that
   * actually crosses the planet — which is the shape the signal took.
   *
   * Split at the antimeridian, because a path from Rome to New Zealand crosses
   * it and would otherwise draw straight back across the map.
   */
  const prop = [];
  if (layers.wspr) {
    for (const w of wsprData) {
      let lon2 = w.rxLon;
      if (Math.abs(lon2 - w.txLon) > 180) lon2 += lon2 < w.txLon ? 360 : -360;
      prop.push({ pts: [[w.txLat, w.txLon], [w.rxLat, lon2]], wspr: true, spot: w });
    }
  }

  globe
    .pathsData([...prop, ...orbitPaths, ...issPaths, ...air])
    .pathPoints((d) => d.pts)
    .pathPointLat((p) => p[0]).pathPointLng((p) => p[1])
    // Aircraft sit just off the surface — high enough to clear the terrain, far
    // below the orbits, which is roughly the truth.
    // Propagation arcs bow well off the surface — a shortwave signal really does
    // go up to the ionosphere and come back down, and drawing it flat against
    // the ground would be both uglier and less true.
    .pathPointAlt((d) => (d.wspr ? 0.16 : d.air ? 0.008 : 0.052))
    .pathColor((d) => {
      if (d.wspr) {
        // Strength by signal-to-noise. WSPR runs from roughly -30dB, which is
        // below the noise floor and still decodable, up to about 0 — so a strong
        // path reads bright and a marginal one is a whisper, which is honest.
        const a = Math.max(0.12, Math.min(0.8, (d.spot.snr + 32) / 34));
        const c = palette?.rx || "#C9A227";
        return [`${hexA(c, 0)}`, `${hexA(c, a)}`, `${hexA(c, 0)}`];
      }
      return d.air
        ? ["rgba(255,255,255,0)", "rgba(255,236,190,0.85)"]
        : d.orbit
        ? ["rgba(120,180,255,0.05)", "rgba(120,180,255,0.4)"]
        : ["rgba(255,255,255,0)", "rgba(255,255,255,0.55)"];
    })
    .pathStroke((d) => (d.wspr ? 0.45 : d.air ? 0.5 : d.orbit ? 0.7 : 1.1))
    .pathDashLength(1).pathDashGap(0)
    .pathLabel((d) => d.wspr
      ? `${d.spot.tx} → ${d.spot.rx} · ${d.spot.bandName} · ${d.spot.km.toLocaleString()} km · SNR ${d.spot.snr}`
      : d.air && d.flight?.flight
      ? `${d.flight.flight} · ${d.flight.altFt.toLocaleString()} ft` +
        (d.flight.kt ? ` · ${d.flight.kt} kt` : "") +
        (d.flight.type ? ` · ${d.flight.type}` : "")
      : "")
    .pathTransitionDuration(0);

  globe
    .labelsData(sats.map((s) => ({ lat: s.lat, lng: s.lng, name: s.name })))
    .labelLat("lat").labelLng("lng").labelText("name")
    .labelSize(0.9).labelDotRadius(0.28)
    .labelColor(() => "rgba(190,215,255,0.85)")
    .labelAltitude(0.055)
    .labelResolution(2);
}

/** Break a lat/lng run wherever it crosses the antimeridian. */
function splitTrail(trail) {
  const segs = []; let run = [];
  for (const [la, ln] of trail) {
    if (run.length && Math.abs(ln - run[run.length - 1][1]) > 180) {
      if (run.length > 1) segs.push(run);
      run = [];
    }
    run.push([la, ln]);
  }
  if (run.length > 1) segs.push(run);
  return segs;
}

async function tickISS() {
  if (!globe || !layers.iss) return;
  const p = await window.auralfm.iss();
  if (!p) return;

  issTrail.push([p.lat, p.lng]);
  if (issTrail.length > 90) issTrail.shift();          // ~6 min of track

  issAt = { lat: p.lat, lng: p.lng };
  paintRings();
  paintOrbits();

  const el = $("issreadout");
  if (el) {
    el.innerHTML = `⌖ ISS <b>${Math.abs(p.lat).toFixed(1)}°${p.lat >= 0 ? "N" : "S"} `
      + `${Math.abs(p.lng).toFixed(1)}°${p.lng >= 0 ? "E" : "W"}</b> · ${Math.round(p.altKm)} km`
      + (p.sunlit === null ? "" : p.sunlit ? " · sunlit" : " · in shadow");
  }
}

/**
 * Pixel budget per frame.
 *
 * The cost here is pure fill rate — the day/night shader across every pixel.
 * Measured on a 4K display: disabling the atmosphere gained 1fps and removing
 * all 12,296 points gained 2, while halving the buffer took it from 5fps to 56.
 * Geometry is not the problem; resolution is.
 *
 * There is a hard cliff around 4 Mpx where the frame misses vsync and drops
 * straight to half rate: 6.0 Mpx -> 31fps, 4.5 -> 31, 3.4 -> 56. Sitting just
 * under it is worth a little softness on very large windows.
 */
const TARGET_PIXELS = 3.5e6;

function sizeGlobe() {
  if (!globe) return;
  const w = $("globewrap");
  if (!w.clientWidth || !w.clientHeight) return;
  globe.width(w.clientWidth).height(w.clientHeight);

  /**
   * Scale the drawing buffer to fit the pixel budget rather than blindly
   * honouring devicePixelRatio. A 3840px window at ratio 2 asks for a 7680x4320
   * buffer — 24 megapixels a frame, which is what the stutter was.
   *
   * Going below 1.0 on a huge window is the right trade: the globe is a smooth
   * sphere, so slight softness is nearly invisible, while 5fps is not.
   */
  const r = globe.renderer();
  if (!r) return;
  const css = w.clientWidth * w.clientHeight;
  const ratio = Math.max(0.75, Math.min(window.devicePixelRatio || 1,
                                        Math.sqrt(TARGET_PIXELS / Math.max(css, 1))));
  if (Math.abs(r.getPixelRatio() - ratio) > 0.02) r.setPixelRatio(ratio);
}

/**
 * Watch the pane, not the window.
 *
 * A window resize listener misses every case where the pane changes size without
 * the window doing so — and the rail is fluid, so that is most of them. On a 4K
 * display the canvas was sitting at 600x544 inside a 3200x2064 pane: 19% of the
 * width, which is exactly the "globe doesn't fill the space" complaint.
 */
function watchGlobeSize() {
  const w = $("globewrap");
  if (!w || typeof ResizeObserver === "undefined") return;
  new ResizeObserver(() => sizeGlobe()).observe(w);
}

let flying = false;
function flyTo(lat, lng, altitude = 0.62) {
  if (!globe) return;
  globe.controls().autoRotate = false;   // don't drift away from what you picked
  pauseDrift(9000);
  // Suppress follow-the-centre for the duration: the fly emits change events the
  // whole way, and following mid-flight snaps the selection to whatever city the
  // camera happens to pass over. That is how picking Los Angeles landed on
  // Brownsville TX.
  flying = true;
  globe.pointOfView({ lat, lng, altitude }, 800);
  clearTimeout(flyDone);
  flyDone = setTimeout(() => { flying = false; applyLod(); }, 1100);
}
let flyDone = null;

/** Merged geometry means selection changes need the layer rebuilt, not just recoloured. */
function refreshGlobeSelection() {
  if (globe && globePts) applyLod(true);
}

window.addEventListener("resize", () => { sizeGlobe(); fitMarkets(); });
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (globe) refreshGlobeSelection();
});

// ── input ────────────────────────────────────────────────────────────────────
qEl.addEventListener("input", () => {
  clearTimeout(debounce);
  debounce = setTimeout(() => runSearch(qEl.value), 130);
});

/**
 * One field for both kinds of target. Places come first because "take me to
 * Los Angeles" is the common intent; individual stations follow, and picking
 * one flies to its city *and* starts it — which is the whole point of typing a
 * station name rather than a city.
 */
async function runSearch(query) {
  const q = query.trim();
  const my = ++seq;
  if (q) { showingFavorites = false; $("favBtn").setAttribute("aria-pressed", "false"); }
  if (!q) { await loadPlaces(""); return; }

  const [places, stations] = await Promise.all([
    window.auralfm.places(q, 40),
    window.auralfm.search(q, 25),
  ]);
  if (my !== seq) return;

  placeListEl.hidden = false;
  stationListEl.hidden = true;
  headEl.hidden = true;
  placeHeadEl.textContent = `${places.total.toLocaleString()} place${places.total === 1 ? "" : "s"}`
    + (stations.length ? ` · ${stations.length} station${stations.length === 1 ? "" : "s"}` : "");

  placeListEl.innerHTML = "";
  for (const p of places.places) placeListEl.appendChild(placeRow(p));

  if (stations.length) {
    const h = document.createElement("div");
    h.className = "sublabel";
    h.textContent = t("app.stations", "Stations");
    placeListEl.appendChild(h);
    for (const ch of stations) placeListEl.appendChild(stationResultRow(ch));
  }
  if (!places.places.length && !stations.length) {
    placeListEl.innerHTML = `<div class="empty" style="padding:32px 16px">${t("empty.noMatch", "Nothing matches that.")}</div>`;
  }
}

function placeRow(p) {
  const el = document.createElement("div");
  el.className = "place";
  el.dataset.i = p.i;
  el.setAttribute("aria-selected", p.i === selection.placeIndex);
  el.innerHTML = `<span class="pmeta"><div class="pn"></div><div class="pc"></div></span>
                  <span class="cnt"></span>`;
  el.querySelector(".pn").textContent = p.title;
  el.querySelector(".pc").textContent = p.country;
  el.querySelector(".cnt").textContent = p.count;
  el.onclick = () => goToPlace(p.i);
  return el;
}

/** A station hit: fly to its city, show that city, and play it. */
function stationResultRow(ch) {
  const el = document.createElement("div");
  el.className = "place";
  el.innerHTML = `<span class="pmeta"><div class="pn"></div><div class="pc"></div></span>`;
  el.querySelector(".pn").textContent = ch.title;
  el.querySelector(".pc").textContent = [ch.place, ch.country].filter(Boolean).join(" · ");
  el.onclick = async () => {
    // Leaving the favourites view is part of picking from it. `showingFavorites`
    // gates globe-follow and the chat panel, so a click that tuned a station but
    // left the flag set played audio into a rail still showing the favourites
    // list, with no chat for the place just travelled to. It took a second,
    // unrelated interaction to clear the flag, which is why this read as needing
    // two clicks.
    //
    // Same reset the rail tabs do. Search results reuse this row and are never
    // in the favourites view, so the guard costs them nothing.
    if (showingFavorites) {
      showingFavorites = false;
      $("favBtn").setAttribute("aria-pressed", "false");
      headEl.hidden = false;
      placeListEl.hidden = true;
      stationListEl.hidden = false;
    }
    const list = await guard("relatedPlaces", () => window.auralfm.places(ch.place, 8), null);
    const hit = list.places.find((p) => p.title === ch.place && p.country === ch.country)
             || list.places[0];
    if (hit) await goToPlace(hit.i);
    window.auralfm.tune(ch);
  };
  return el;
}

/** Select a place and take the globe there — the two always happen together. */
/** Receivers near the selected place, with how far away each one is. */
function renderNearbyReceivers(nearby) {
  stationListEl.innerHTML = "";
  const dist = (km) => km < 1 ? "here" : `${km.toLocaleString()} km`;
  for (const rx of nearby) {
    const el = document.createElement("div");
    el.className = "st";
    el.innerHTML = `<span class="smeta"><div class="sn"></div><div class="stags"></div></span>`;
    el.querySelector(".sn").textContent = rx.loc || rx.name;
    el.querySelector(".stags").textContent =
      `${dist(rx.km)} away · ${rx.slots} ${rx.slots === 1
        ? t("sdr.slot", "listener slot") : t("sdr.slots", "listener slots")}`;
    el.onclick = () => selectReceiver(rx);
    stationListEl.append(el);
  }
}

/**
 * Click a receiver: put its bands in the rail where a place's stations would go.
 *
 * Bands, not stations, because that is what a receiver actually offers — it is
 * an antenna, and what you hear depends on which slice of the spectrum you point
 * it at and whether that path is in daylight. The day/night data the globe
 * already computes is exactly what tells you which bands are worth trying, so
 * the rail says so rather than making you know it.
 */
async function selectReceiver(rx) {
  setTimeout(updateSun, 0);            // same reason as renderStations()
  sdrSel = rx;
  railMode = "stations";                 // its bands, not the nearby-receiver list
  selection.placeIndex = null;
  showingFavorites = false;
  $("favBtn").setAttribute("aria-pressed", "false");
  qEl.value = "";
  placeListEl.hidden = true;
  stationListEl.hidden = false;
  placeHeadEl.textContent = "";
  $("chips").innerHTML = "";
  $("wx").textContent = "";

  const head = $("head");
  head.hidden = false;
  head.querySelector("h2").textContent = rx.loc || rx.name;
  const asl = rx.asl ? ` · ${rx.asl} m` : "";
  head.querySelector("p").textContent =
    `${t("sdr.receiver", "Shortwave receiver")}${asl} · ${rx.slots} ${rx.slots === 1
      ? t("sdr.slot", "listener slot") : t("sdr.slots", "listener slots")}`;

  // Is this receiver in daylight? Same sub-solar point the terminator uses.
  const { lat: sunLat, lng: sunLng } = subsolarPoint();
  const rad = Math.PI / 180;
  const cosSun =
    Math.sin(rx.lat * rad) * Math.sin(sunLat * rad) +
    Math.cos(rx.lat * rad) * Math.cos(sunLat * rad) * Math.cos((rx.lng - sunLng) * rad);
  const daylight = cosSun > 0;

  // Was: daylight alone. Now the operator's actual rule of thumb — daylight,
  // solar flux, and whether the field is disturbed — and it can say why.
  const look = (b) => Kiwi.outlook(b, daylight, spaceWx);
  const bands = [...Kiwi.BANDS].sort((a, b) => (look(b).open ? 1 : 0) - (look(a).open ? 1 : 0));

  // What is actually transmitting, this minute, in UTC. Until now this list was
  // 21 band centres, so "49 m" tuned 6100 kHz whether or not anything was there.
  let air = [];
  try { air = await window.auralfm.sdrOnAir({ lat: rx.lat, lng: rx.lng }); } catch { air = []; }

  stationListEl.innerHTML = "";
  const note = document.createElement("div");
  note.className = "empty";
  note.style.cssText = "padding:6px 15px 10px;text-align:left";
  const base = daylight
    ? t("sdr.day", "In daylight — the higher bands carry furthest right now.")
    : t("sdr.night", "In darkness — the lower bands carry furthest right now.");
  // The conditions that decide it, stated rather than implied.
  const wx = [];
  if (spaceWx?.flux != null) wx.push(`${t("sdr.flux", "solar flux")} ${Math.round(spaceWx.flux)}`);
  const kpNow = spaceWx?.kpEstimated ?? spaceWx?.kp;
  if (kpNow != null) wx.push(`Kp ${kpNow.toFixed(1)}`);
  // A storm outranks the time of day. Saying "the lower bands carry furthest"
  // during a geomagnetic storm is true in general and wrong right now.
  const lead = (kpNow != null && kpNow >= 5)
    ? t("sdr.storm", "Geomagnetic storm — HF is degraded everywhere, and high-latitude paths worst.")
    : base;
  note.textContent = wx.length ? `${lead}  ·  ${wx.join(" · ")}` : lead;
  stationListEl.append(note);

  /**
   * Tune something and mark the row.
   *
   * Frequency and mode come from the caller because a schedule entry knows both
   * exactly, where a band only ever knew a centre.
   */
  const tuneRow = (el, { freq, mode, label, width }) => {
    const go = () => {
      // lat/lng travel with the receiver: the popover publishes the playing
      // channel, and without a position a shortwave session was the only kind
      // that could not say where it was — so presence and chat quietly did
      // nothing for it.
      window.Tip?.donate("shortwaveTuned");
      window.auralfm.tuneSdr({ host: rx.host, name: rx.name, loc: rx.loc,
                               lat: rx.lat, lng: rx.lng, freq, mode, band: label, width });
      tunerStart(rx, freq, mode, width);
      for (const sib of stationListEl.querySelectorAll(".st")) sib.setAttribute("aria-current", "false");
      el.setAttribute("aria-current", "true");
    };
    el.addEventListener("click", go);
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); }
    });
  };

  const heading = (text) => {
    const h = document.createElement("div");
    h.className = "empty";
    h.style.cssText = "padding:14px 15px 4px;text-align:left;font-weight:590;color:var(--label2)";
    h.textContent = text;
    stationListEl.append(h);
  };

  if (air.length) {
    /**
     * Rank what is worth trying from *this* receiver.
     *
     * Frequency order alone put Norwegian coastal stations at the top of a
     * Wellington list, so the first question is where a broadcast is aimed:
     * inside the target area beats a band merely being open, because a signal
     * pointed elsewhere is faint even on a good band. Then the band, then
     * broadcasts ahead of morse and telemetry.
     *
     * Nothing here predicts an opening. It orders the guesses.
     */
    const NEAR = 5000, WIDE = 9000;      // km from the middle of the target area
    // Broadcasters outrank everything, because that is what "a station" means.
    // Coastal radio, oceanic air-ground and VOLMET are still listed — they are
    // some of the best listening on the bands — just underneath.
    const score = (e, o) => (e.utility ? 0 : 8)
                          + (e.beamKm == null ? 0 : e.beamKm < NEAR ? 4 : e.beamKm < WIDE ? 2 : 0)
                          + (o.open ? 3 : 0);
    const scored = air.map((e) => {
      const o = look({ freq: e.khz, when: Kiwi.whenFor(e.khz) });
      return { e, o, s: score(e, o) };
    });
    scored.sort((a, b) => b.s - a.s
                       || (a.e.beamKm ?? 1e9) - (b.e.beamKm ?? 1e9)
                       || a.e.khz - b.e.khz);

    const SHOW = 80;
    const open = scored.filter((x) => x.o.open).length;
    heading(t("sdr.onair", "On air now") +
            ` · ${open} ${t("sdr.ofN", "of")} ${scored.length} ${t("sdr.onOpen", "on open bands")}`);

    for (const { e, o } of scored.slice(0, SHOW)) {
      const el = document.createElement("div");
      el.className = "st";
      el.setAttribute("role", "button");
      el.tabIndex = 0;
      el.innerHTML = `<span class="smeta"><div class="sn"></div><div class="stags"></div></span>`;
      el.querySelector(".sn").textContent = e.station;
      // kHz, to match the tuner readout and the schedule this came from.
      const bits = [`${Number(e.khz.toFixed(2))} kHz ${e.mode.toUpperCase()}`];
      if (e.lang) bits.push(e.lang);
      if (e.target) bits.push(`→ ${e.target}`);
      // Under an hour left is worth knowing before you settle in.
      if (e.until <= 60) bits.push(`${e.until} min ${t("sdr.left", "left")}`);
      if (e.note) bits.push(e.note);
      if (!o.open) { bits.push(o.why || t("sdr.unlikely", "likely quiet now")); el.style.opacity = ".55"; }
      el.querySelector(".stags").textContent = bits.join(" · ");
      tuneRow(el, { freq: e.khz, mode: e.mode, label: e.station });
      stationListEl.append(el);
    }
    // Never let a cap read as "that is all there is".
    if (scored.length > SHOW) {
      const more = document.createElement("div");
      more.className = "empty";
      more.style.cssText = "padding:8px 15px;text-align:left";
      more.textContent =
        `${scored.length - SHOW} ${t("sdr.more", "more are on air; the bands below tune anywhere.")}`;
      stationListEl.append(more);
    }
    heading(t("sdr.bands", "Browse the bands"));
  }

  for (const b of bands) {
    const el = document.createElement("div");
    el.className = "st";
    el.setAttribute("role", "button");
    el.tabIndex = 0;
    const o = look(b);
    const open = o.open;
    // Same markup as a station row — this is the station list, and a band is
    // what a receiver offers in place of a station.
    el.innerHTML = `<span class="smeta"><div class="sn"></div><div class="stags"></div></span>`;
    el.querySelector(".sn").textContent = b.label;
    el.querySelector(".stags").textContent =
      `${b.freq} kHz ${b.mode.toUpperCase()} · ${b.hint}` +
      // The reason, not just the verdict. A greyed-out row that cannot say why
      // is indistinguishable from a broken one.
      (open ? (o.why ? ` · ${o.why}` : "") : ` · ${o.why || t("sdr.unlikely", "likely quiet now")}`);
    if (!open) el.style.opacity = ".55";
    // A band may ask for a filter it needs — the digital modes occupy the whole
    // 3 kHz above the dial and are half silenced at the normal width.
    tuneRow(el, { freq: b.freq, mode: b.mode, label: b.label, width: b.width });
    stationListEl.append(el);
  }

  flyTo(rx.lat, rx.lng);
  refreshGlobeSelection();
}

async function goToPlace(i, { play = false, fly = true } = {}) {
  sdrSel = null;                       // a place and a receiver are never both selected
  tunerStop();                         // and a place has nothing to tune
  qEl.value = "";
  showingFavorites = false;
  $("favBtn").setAttribute("aria-pressed", "false");
  placeListEl.hidden = true;
  stationListEl.hidden = false;
  placeHeadEl.textContent = "";      // the search summary no longer applies
  await selectPlace(i);
  if (fly && selection.place) flyTo(selection.place.lat, selection.place.lon);
  // Prefer a station the directory believes is alive.
  if (play && !locked && selection.channels.length) {
    const pick = selection.channels.find((c) => c.ok !== false) || selection.channels[0];
    window.auralfm.tune(pick);
  }
}
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && document.activeElement === qEl && qEl.value) {
    qEl.value = ""; runSearch("");
  }
});

// ── boot ─────────────────────────────────────────────────────────────────────
(async () => {
  const state = (await window.auralfm.getState()) || {};
  favorites = Array.isArray(state.favorites) ? state.favorites : [];
  // Before the globe builds, so the first point layer is already the right size.
  applyPrefs((await window.auralfm.getPrefs()) || {});
  await applyPalette();                  // before the globe, so the first build is themed
  await applyStrings();
  setLocked(!!state.locked);
  renderMarkets();
  clearInterval(marketTimer);
  // 1 Hz: the socket is faster than that, but a ticker that changes more often
  // than you can read it is noise, not information.
  marketTimer = setInterval(renderMarkets, 1000);

  // The buttons that never change state get their icon once.
  Icons.set($("newsBtn"), "headlines");
  Icons.set($("layersBtn"), "layers");
  Icons.set($("favBtn"), "star");
  Icons.set($("newsSrc"), "source");
  Icons.set($("play"), "play");
  Icons.set($("lock"), "unlock");
  Icons.set($("mute"), "volumeHigh");
  Icons.set($("nowStar"), "star");

  await loadPlaces("");
  paintColdOpen();
  // The night moves. Repaint on the hour so a window left open overnight is not
  // still offering places where the sun came up hours ago.
  setInterval(paintColdOpen, 15 * 60_000);
  // Receivers before the globe, so the first point layer already carries them.
  try {
    sdrPts = await guard("sdrPoints", () => window.auralfm.sdrPoints(), sdrPts || []);
  } catch { sdrPts = []; }
  try {
    await initGlobe();
  } catch (err) {
    // Reveal the status bar for this: an init failure is the one time the read-out
    // has to be visible whether or not the user asked for it.
    const el = $("globestatus") || $("globehint");
    if (el) { el.textContent = err.message; $("globehint").hidden = false; }
  }

  // Quietly flag a stale catalog rather than letting it rot invisibly.
  const st = await window.auralfm.stats();
  const days = st.generated ? Math.floor((Date.now() - new Date(st.generated)) / 86400000) : 0;
  if (days >= 120) {
    placeHeadEl.textContent =
      `${placeHeadEl.textContent} · catalog ${days} days old — run npm run crawl`;
  }
})();
