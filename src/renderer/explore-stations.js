/**
 * Explore, part 2 of 17: The station rail: what a place broadcasts, nearby receivers, your own stations.
 *
 * Explore is one page split across plain scripts that share a global scope, in
 * the order explore.html loads them. This part only declares: nothing in it runs
 * at load, so it has no wire function. The parts that do run something at load
 * keep it in a wire function that explore.js calls once every part has loaded.
 */

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

  // Shortwave is not in the web build, and nearbyReceivers() is empty there, so
  // railMode never reaches "shortwave" — but the name has to be allowed to be
  // absent, because these scripts share one scope and that file may not be in it.
  if (railMode === "shortwave" && typeof renderNearbyReceivers === "function") {
    return renderNearbyReceivers(nearby);
  }

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
    // The name area takes focus rather than the row, because the row holds the
    // star (and for your own stations a remove button): see activatable().
    activatable(el, (e) => {
      if (e?.target?.closest?.(".star, .rm")) return;
      window.auralfm.tune(ch);           // an explicit pick always plays
      window.Tip?.donate("stationPlayed");
      markPending(ch.id);                // and says so now, not in eleven seconds
      if (locked) setLocked(true);       // and becomes the new locked station
    }, el.querySelector(".smeta"));
    const star = el.querySelector(".star");
    // It was an SVG and nothing else, so it announced as "button".
    star.setAttribute("aria-label", t("ctl.favorite", "Favorite"));
    star.setAttribute("aria-pressed", String(isFav(ch.id)));
    star.onclick = (e) => { e.stopPropagation(); toggleFav(ch); };
    // A station you added can be removed again; one you did not, cannot.
    if (ch.mine) {
      const rm = document.createElement("button");
      rm.className = "rm";
      rm.textContent = "−";
      rm.title = t("mine.remove", "Remove this station");
      // The glyph is the content, so without this the name is "minus".
      rm.setAttribute("aria-label", rm.title);
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
  row.innerHTML = `<span class="smeta"><div class="sn"></div><div class="stags"></div></span>`;
  row.querySelector(".sn").textContent = p.title;
  row.querySelector(".stags").textContent = subtitle;
  return activatable(row, () => goToPlace(p.i, { play: false }));
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
  else favorites.push({ id:ch.id, title:ch.title, place:ch.place, country:ch.country, secure:ch.secure,
                       // Coordinates too. Without them a favourite is a name and a
                       // place-string, and everything downstream that needs a point on
                       // the globe — the share card most visibly — had nothing to draw.
                       lat:ch.lat, lon:ch.lon });
  // Only the list we changed. Writing the whole object back would send this
  // window's copy of vol and lastChannel too, undoing whatever the popover did
  // while this one was not looking.
  await window.auralfm.setState({ favorites });
  renderStations();
}
