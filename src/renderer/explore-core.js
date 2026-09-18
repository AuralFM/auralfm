/**
 * Explore, part 1 of 17: Selection, journeys, places and the filter chips.
 *
 * Explore is one page split across plain scripts that share a global scope, in
 * the order explore.html loads them. Declarations live here; anything that runs
 * at load — listeners, IPC subscriptions, one-off calls — is in wireCore(),
 * which explore.js calls once every part has loaded. That keeps the original
 * single-file behaviour: no handler can fire into a part that has not loaded.
 */

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
