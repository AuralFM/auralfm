/**
 * Explore, part 15 of 17: Search: places, stations and result rows.
 *
 * Explore is one page split across plain scripts that share a global scope, in
 * the order explore.html loads them. Declarations live here; anything that runs
 * at load — listeners, IPC subscriptions, one-off calls — is in wireSearch(),
 * which explore.js calls once every part has loaded. That keeps the original
 * single-file behaviour: no handler can fire into a part that has not loaded.
 */

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
  showSort(false);                     // a search ranks by the match
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
  if (catalogEmpty) {
    failureInto(placeListEl, t("places.noCatalog",
      "No stations are installed in this copy of AuralFM. It was built without its station catalog."));
    placeHeadEl.textContent = "";
    return;
  }
  if (!places.places.length && !stations.length) {
    placeListEl.innerHTML = `<div class="empty">${t("empty.noMatch", "Nothing matches that.")}</div>`;
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
  return activatable(el, () => goToPlace(p.i));
}

/** A station hit: fly to its city, show that city, and play it. */
function stationResultRow(ch) {
  const el = document.createElement("div");
  el.className = "place";
  el.innerHTML = `<span class="pmeta"><div class="pn"></div><div class="pc"></div></span>`;
  el.querySelector(".pn").textContent = ch.title;
  el.querySelector(".pc").textContent = [ch.place, ch.country].filter(Boolean).join(" · ");
  activatable(el, async () => {
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
  });
  return el;
}

function wireSearch() {
  // ── input ────────────────────────────────────────────────────────────────────
  qEl.addEventListener("input", () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => runSearch(qEl.value), 130);
  });
  // Each press is the next order, and a new order is a new browse.
  if (window.Icons) Icons.set($("placeSort"), "filter");
  $("placeSort")?.addEventListener("click", nextSort);
}
