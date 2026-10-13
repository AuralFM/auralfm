/**
 * Explore, part 1 of 17: Selection, journeys, places and the filter chips.
 *
 * Explore is one page split across plain scripts that share a global scope, in
 * the order explore.html loads them. This part only declares: nothing in it runs
 * at load, so it has no wire function. The parts that do run something at load
 * keep it in a wire function that explore.js calls once every part has loaded.
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
 * Kilometres or miles, for every distance the page words itself.
 *
 * The hop line below asks the main process for a finished sentence. Six other
 * lines had a number in hand and wrote " km" after it, so a listener in
 * Houston read miles under the place and kilometres everywhere else. They all
 * come through fmtKm() now.
 *
 * The unit is asked for once and again whenever the preference changes
 * (explore-prefs.js): "system" means the operating system's own answer, miles
 * in the United States and the United Kingdom, kilometres elsewhere. The
 * rounding is src/geo.js's, step for step, and the audit holds the two
 * together: two lines on one screen must not disagree.
 */
let distUnit = "km";
const KM_PER_MILE = 1.609344;
async function refreshUnit() {
  try { distUnit = (await window.auralfm.unit(prefs.units)) === "mi" ? "mi" : "km"; } catch { /* stays as it was */ }
}
function fmtKm(km) {
  const v = distUnit === "mi" ? km / KM_PER_MILE : km;
  if (v < 1) return `under 1 ${distUnit}`;
  const rounded = v < 10 ? Math.round(v)
                : v < 1000 ? Math.round(v / 10) * 10
                : Math.round(v / 100) * 100;
  return `${rounded.toLocaleString()} ${distUnit}`;
}
/** A speed, from km/h: mph where distances are miles. */
const fmtKph = (kph) => (distUnit === "mi" ? `${Math.round(kph / KM_PER_MILE)} mph` : `${Math.round(kph)} km/h`);

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
/**
 * Where a globe picture lives. On a phone the web build serves half-size ones
 * (vendor/lite/, made by scripts/build-web.mjs; the flag is set in
 * web/bridge.js): four 4096-pixel textures are about 180 MB of graphics memory
 * with their mipmaps, which is what makes iOS throw a web app out and reload
 * it, for detail a 390-point screen cannot show. The desktop never sets it.
 */
const texUrl = (name) => `vendor/${window.AuralLite ? "lite/" : ""}${name}`;
let favorites = [];
let playing = null;          // channel currently playing, per the popover
// What is in the player, playing or not: a paused or cued station can still be
// saved and shared, so the star and share act on this rather than `playing`.
let inPlayer = null;
let debounce = null, seq = 0;
let catalogEmpty = false;     // set by loadPlaces(""), read by search

const isFav = (id) => favorites.some((f) => f.id === id);

// activatable(), which makes rows keyboard-operable, lives in activatable.js:
// the menu-bar popover needs it too.

/** The wave (explore.html): five bars that say "working on it" without a number. */
function waveSpan() {
  const w = document.createElement("span");
  w.className = "wave";
  w.setAttribute("aria-hidden", "true");
  w.innerHTML = "<i></i><i></i><i></i><i></i><i></i>";
  return w;
}

/**
 * The third state, for any list that can be waited on.
 *
 * Loading and empty were the only two states these lists had. A rejected IPC
 * left whatever was on screen before, which reads as the click having done
 * nothing — the worst of the three, because there is no way to tell it from a
 * slow network and nothing to press.
 *
 * Only for surfaces somebody is waiting on. The background polls — weather,
 * clouds, the ISS — are best-effort by design and degrade by drawing
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
/**
 * How the browse list is ordered (src/catalog.js, PLACE_ORDERS).
 *
 * Shown only while the list is the browse list: a search ranks by the match,
 * favourites are yours, and a place's stations are a different list — so every
 * path that repaints the heading for something else puts the control away.
 */
const sortEl = $("placeSort");
let placeOrder = "stations";
/**
 * One button, pressed to move on. The heading beside it says where you are:
 * "12,579 places" for the default, the order's own name for the rest — in the
 * heading's type, not a pop-up of choices. That was a native select, which
 * on a phone opened a picker over a sheet the tap had also just expanded.
 */
const PLACE_ORDERS = ["stations", "gems", "near", "awake", "random"];
const orderName = (o) => t(`sort.${o}`, { stations: "Most stations", gems: "Hidden gems",
  near: "Near here", awake: "Awake now", random: "Shuffle" }[o]);
function showSort(on) { if (sortEl) sortEl.hidden = !on; }
function paintSort() {
  if (!sortEl) return;
  const next = PLACE_ORDERS[(PLACE_ORDERS.indexOf(placeOrder) + 1) % PLACE_ORDERS.length];
  const label = t("sort.label", "Sort places");
  sortEl.setAttribute("aria-label", `${label}: ${orderName(placeOrder)}. Next: ${orderName(next)}`);
  sortEl.title = `${label} · ${orderName(placeOrder)}`;
  sortEl.setAttribute("aria-pressed", String(placeOrder !== "stations"));
}
function nextSort() {
  placeOrder = PLACE_ORDERS[(PLACE_ORDERS.indexOf(placeOrder) + 1) % PLACE_ORDERS.length];
  loadPlaces("");
}

/** Where "near here" is measured from: the middle of the globe, else the place. */
function sortOpts() {
  if (placeOrder !== "near") return { order: placeOrder };
  const pov = typeof globe !== "undefined" && globe ? globe.pointOfView() : null;
  const lat = pov?.lat ?? selection.place?.lat, lon = pov?.lng ?? selection.place?.lon;
  return { order: placeOrder, lat, lon };
}

/**
 * The browse list, asked for on purpose.
 *
 * On a phone Explore opens here: the places, most stations first or however
 * the sort beside the count says, four rows showing. It used to open on the
 * place already selected, and with a station loaded that is always — so the
 * list, and the sort that exists to get past Paris and London, were only ever
 * reachable by typing into the search field and deleting it again.
 *
 * While it is up the globe does not follow its centre (followCentre), the same
 * as favourites: spinning to look around must not swap the list for a place.
 * It re-sorts instead: a hand on the globe makes it "Near here" (followBrowse,
 * explore-view.js).
 */
let browsingPlaces = false;
async function showBrowse() {
  browsingPlaces = true;
  headEl.hidden = true;
  await loadPlaces("");
}

/**
 * Back to the place that is selected, or to browsing when there is none. What
 * leaving favourites does, and now what closing Explore does too.
 */
function restorePlaceView() {
  browsingPlaces = false;
  if (selection.placeIndex === null) { loadPlaces(""); return; }
  headEl.hidden = false;
  placeListEl.hidden = true;
  stationListEl.hidden = false;
  // The list's count belongs to the list. It is not inside placelist, so
  // hiding that alone leaves "6 favorites" or "12,579 places" sitting above
  // the station list of a place it has nothing to do with.
  placeHeadEl.textContent = "";
  showSort(false);
  renderRailTabs(nearbyReceivers());
  renderStations();
  syncTunerVisibility();
}

async function loadPlaces(query = "", limit = 400) {
  const my = ++seq;
  const res = await guard("places", () => window.auralfm.places(query, limit, sortOpts()), null);
  if (my !== seq) return;
  if (!res) {
    placeListEl.hidden = false;
    stationListEl.hidden = true;
    placeHeadEl.textContent = "";
    showSort(false);
    failureInto(placeListEl, t("places.unreachable", "Could not load places."),
                () => loadPlaces(query));
    return;
  }
  const { total, places } = res;
  // No places at all, with nothing typed, is not "no match": the build shipped
  // without its catalogue. On 18 September it read "0 places · No place matches
  // that.", which blames the search for a missing file.
  catalogEmpty = !query && !total;
  if (catalogEmpty) {
    placeListEl.hidden = false;
    stationListEl.hidden = true;
    placeHeadEl.textContent = "";
    showSort(false);
    failureInto(placeListEl, t("places.noCatalog",
      "No stations are installed in this copy of AuralFM. It was built without its station catalog."));
    return;
  }
  // The count for the default order, the order's name for the others.
  placeHeadEl.textContent = placeOrder === "stations"
    ? `${total.toLocaleString()} places` : orderName(placeOrder);
  showSort(true);
  paintSort();
  placeListEl.scrollTop = 0;
  placeListEl.hidden = false;
  stationListEl.hidden = true;
  placeListEl.innerHTML = "";
  if (!places.length) {
    placeListEl.innerHTML = `<div class="empty">${t("empty.noPlace", "No place matches that.")}</div>`;
    return;
  }
  // The same row the search results use, rather than a second hand-built copy.
  for (const p of places) placeListEl.appendChild(placeRow(p));
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

/**
 * Go to a place: the rail's rows, the search hits, the journey buttons and the
 * globe's own click all end up here.
 *
 * It lived in explore-shortwave.js, which reads as an accident of where it was
 * written rather than a decision — it is about places, and touches a receiver
 * only to clear one. That mattered the day the web build stopped shipping the
 * shortwave file: these renderer scripts share one global scope, so the web app
 * loaded, painted, and then did nothing at all when touched, because every one
 * of those call sites was reaching for a function that was no longer there.
 *
 * `sdrSel` (explore-globe.js) and `tunerStop` (explore-dial.js) are both in
 * files the web does ship, so nothing here needs a guard.
 */
async function goToPlace(i, { play = false, fly = true, hold = false } = {}) {
  // A place chosen: the centre may lead again (explore-view.js) — unless this is
  // the player's "i", which holds it for the card it opens. Set before the
  // awaits below, so the drift cannot slip in while the place loads.
  holdCentre = hold;
  browsingPlaces = false;              // a place was chosen; the list has done its job
  sdrSel = null;                       // a place and a receiver are never both selected
  tunerStop();                         // and a place has nothing to tune
  qEl.value = "";
  showingFavorites = false;
  $("favBtn").setAttribute("aria-pressed", "false");
  placeListEl.hidden = true;
  stationListEl.hidden = false;
  placeHeadEl.textContent = "";      // the search summary no longer applies
  showSort(false);
  await selectPlace(i);
  if (fly && selection.place) flyTo(selection.place.lat, selection.place.lon);
  // Prefer a station the directory believes is alive.
  if (play && !locked && selection.channels.length) {
    const pick = selection.channels.find((c) => c.ok !== false) || selection.channels[0];
    window.auralfm.tune(pick);
  }
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
