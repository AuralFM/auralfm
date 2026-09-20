/**
 * Explore, part 4 of 17: Favourites, trips, markets, headlines and weather.
 *
 * Explore is one page split across plain scripts that share a global scope, in
 * the order explore.html loads them. Declarations live here; anything that runs
 * at load — listeners, IPC subscriptions, one-off calls — is in wirePanels(),
 * which explore.js calls once every part has loaded. That keeps the original
 * single-file behaviour: no handler can fire into a part that has not loaded.
 */

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
      `<div class="empty">${t("empty.favorites", "No favorites yet.")}<br>${t("empty.favoritesHint", "Tap the star beside a station to save it.")}</div>`;
    return;
  }
  for (const f of favorites) placeListEl.appendChild(stationResultRow(f));
}

/**
 * Travelling.
 *
 * Press it and you land somewhere; it keeps moving every fifteen minutes until
 * you press it again. A one-shot button was the wrong shape for what this is —
 * the point is to leave it on and let the world come past, not to press a dice
 * roll over and over.
 *
 * Uniform over all 38,000 stations, deliberately. Weighting by anything — how
 * many stations a place has, what worked yesterday — would keep handing back the
 * same busy cities and would be a recommendation engine wearing a dice costume.
 *
 * It stops itself if the lock is on, because the lock means "stay here" and two
 * features arguing about which station is playing is worse than either.
 */
const TRIP_EVERY_MS = 5 * 60 * 1000;
let tripTimer = null;

async function tripHop({ announce = true } = {}) {
  const b = $("tripBtn");
  b.classList.add("busy");
  try {
    const pick = await guard("randomStation", () => window.auralfm.randomStation(), null);
    if (!pick) {
      if (announce) systemLine(t("ctl.somewhereFailed", "Could not find anywhere just now"));
      return false;
    }
    showingFavorites = false;
    $("favBtn").setAttribute("aria-pressed", "false");
    // The same call every other "play this" path in this window makes. The first
    // version called a `playChannel` that does not exist in this file, so the
    // button threw on click and did nothing at all — found by pressing it, not
    // by reading it.
    window.auralfm.tune(pick);
    if (Number.isFinite(pick.lat) && Number.isFinite(pick.lon)) flyTo(pick.lat, pick.lon);
    if (announce) {
      systemLine(t("ctl.somewhereWent", "Somewhere else: {place}")
        .replace("{place}", [pick.place, pick.country].filter(Boolean).join(", ") || pick.title));
    }
    return true;
  } finally { b.classList.remove("busy"); }
}

function stopTrip({ say = false } = {}) {
  if (tripTimer) { clearInterval(tripTimer); tripTimer = null; }
  const b = $("tripBtn");
  b.setAttribute("aria-pressed", "false");
  b.title = t("ctl.somewhere", "Take me somewhere");
  if (say) systemLine(t("ctl.tripStopped", "Stopped travelling"));
}

async function startTrip() {
  const b = $("tripBtn");
  b.setAttribute("aria-pressed", "true");
  b.title = t("ctl.tripStop", "Stop travelling");
  systemLine(t("ctl.tripStarted", "Travelling — a new station every 5 minutes"));
  await tripHop();
  if (tripTimer) clearInterval(tripTimer);
  tripTimer = setInterval(async () => {
    // The lock means "stay here". Honour it rather than argue with it.
    if (locked) { stopTrip({ say: true }); return; }
    await tripHop();
  }, TRIP_EVERY_MS);
}

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
    // Re-fit on the way out. The numbers change width as they tick, the web
    // font lands after the first paint, and the bar is not always its final
    // size when the first strip is built — none of which used to reach this
    // path, so a single bad measurement lasted until the window was resized.
    fitMarkets();
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
let marketsWatch = null;

function fitMarkets() {
  const el = $("markets");
  if (!el || !el.children.length) return;
  // The bar getting its width is the moment this becomes answerable, and it
  // arrives whether or not anything is refreshing — unlike the 1 Hz tick, which
  // is off while the window is hidden. The bar spans the window, so its size
  // does not depend on what this function decides: no loop.
  if (!marketsWatch && el.parentElement && typeof ResizeObserver !== "undefined") {
    marketsWatch = new ResizeObserver(() => fitMarkets());
    marketsWatch.observe(el.parentElement);
  }
  const kids = [...el.children];
  const deltas = kids.map((k) => k.querySelector(".ch")).filter(Boolean);

  /**
   * How much room the strip has — asked of the bar, never of the strip.
   *
   * `el.clientWidth` was the obvious measurement and the wrong one. The strip
   * is `flex: 0 1 auto` with `min-width: 0`, so its width *is* its content,
   * and its content is exactly what this function is deciding. Run once while
   * the strip was still empty it read about nothing, hid all three coins "to
   * fit", and left the strip 10px wide — which then measured as no room at
   * all, for good. The ticker was invisible on every fresh open until a window
   * resize happened to call this again against a settled layout.
   *
   * The bar's width does not depend on the strip, so asking it instead is a
   * fixed point: the same answer whenever this runs.
   */
  const room = () => {
    const bar = el.parentElement;
    const bs = getComputedStyle(bar), es = getComputedStyle(el);
    const barGap = parseFloat(bs.columnGap) || parseFloat(bs.gap) || 0;
    let taken = 0, siblings = 0;
    for (const c of bar.children) {
      if (c === el || c.hidden) continue;
      const w = c.getBoundingClientRect().width;
      if (w > 0) { taken += w; siblings++; }
    }
    const inner = bar.clientWidth - (parseFloat(bs.paddingLeft) || 0) - (parseFloat(bs.paddingRight) || 0);
    const free = inner - taken - barGap * siblings;
    const cap = parseFloat(es.maxWidth);
    return Math.max(0, Math.min(free, Number.isFinite(cap) ? cap : free)
                       - (parseFloat(es.paddingLeft) || 0));
  };
  const gap = parseFloat(getComputedStyle(el).gap || 0);
  const total = () => kids.reduce((n, k, i) =>
    k.hidden ? n : n + k.getBoundingClientRect().width + (i ? gap : 0), 0);

  /**
   * Nothing to decide until there is a bar to decide against.
   *
   * The first call happens during boot, before the window has been laid out:
   * measured then, every coin is 0 wide and the bar offers 0 room, so the old
   * code dutifully hid all three "to fit" — and that was permanent, because
   * the 1 Hz refresh takes a fast path and `document.hidden` stops it
   * entirely while the window is not on screen. A window resize was the only
   * thing that ever measured again, which is exactly what people found: the
   * ticker was dark until you dragged the window wider.
   *
   * A zero reading is not a narrow bar, it is no answer. Leave the strip alone
   * and wait for one.
   */
  if (room() <= 0) return;

  for (const k of kids) k.hidden = false;
  for (const d of deltas) d.hidden = false;
  // Measure against this state, not the one before it: unhiding is a style
  // change, and the reads below would otherwise still answer for the old box.
  void el.offsetWidth;

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
  sizeGlobe();                          // re-centre the planet between the panels
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
    list.innerHTML = `<div class="empty">`
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
    if (it.link) activatable(el, () => openReader(it));
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

function wirePanels() {
  $("tripBtn").onclick = () => { if (tripTimer) stopTrip({ say: true }); else startTrip(); };

  $("setBtn").onclick = () => window.auralfm.openSettings();

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

  $("newsBtn").onclick = () => {
    newsOpen = !newsOpen; reading = null; renderNewsPanel();
    if (newsOpen) window.Tip?.donate("newsOpened");
  };
  $("newsClose").onclick = () => { newsOpen = false; reading = null; renderNewsPanel(); };
  $("newsSrc").onclick = () => {
    newsSource = NEWS_SOURCES[(NEWS_SOURCES.indexOf(newsSource) + 1) % NEWS_SOURCES.length];
    renderNewsPanel();
  };
}
