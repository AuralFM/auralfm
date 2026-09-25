/**
 * Loaded after Explore's own parts and before explore.js starts them.
 *
 * On the desktop every headline opens in the reader: the main process fetches
 * the article and strips it to text. A web page cannot fetch another site's
 * article, so here only the world feeds' stories can be read, each newsroom
 * through its own proxy route (src/news.js). Anything else — a country
 * headline is a Google News link — opens where it was published, in a new tab,
 * rather than in a reader that would only say it could not. The headline rows
 * call the global openReader() when chosen, so this wraps it.
 */
{
  const readInApp = openReader;
  // eslint-disable-next-line no-global-assign
  openReader = (item) => {
    if (!item?.link) return;
    if (window.auralfm.canReadArticle(item.link)) readInApp(item);
    else window.auralfm.openLink(item.link);
  };
}

/**
 * The output button, on Safari: the system's own picker.
 *
 * Explore's button opens a menu of the outputs the page can list. Safari lists
 * none, so the button hid — on an iPhone the way to AirPods was Control Centre.
 * When the bridge says Safari has somewhere to send the sound (AirPods, a
 * Bluetooth speaker, AirPlay), the button stays and opens the picker iOS itself
 * shows, which also connects a device that is paired but not in use. Elsewhere
 * Explore's own menu is untouched. renderOutputs is the global Explore calls on
 * every device change, so this wraps it, as openReader is wrapped above.
 */
{
  const listOutputs = renderOutputs;
  let routes = window.auralfm.canPickOutput?.() || false;
  // eslint-disable-next-line no-global-assign
  renderOutputs = async () => {
    const wrap = $("outwrap"), btn = $("outbtn");
    if (!routes || !wrap || !btn) {
      wrap?.classList.remove("route");
      btn?.setAttribute("aria-haspopup", "listbox");
      return listOutputs();
    }
    closeOutMenu();
    wrap.hidden = false;
    wrap.classList.add("route");
    // A system sheet, not this page's menu.
    btn.setAttribute("aria-haspopup", "dialog");
    btn.removeAttribute("aria-expanded");
    Icons.set(btn, "route");
    btn.title = t("ctl.output", "Where the sound comes out");
    btn.setAttribute("aria-label", btn.title);
  };
  window.auralfm.onRoutes?.((on) => { routes = on; renderOutputs(); });
  // Ahead of Explore's own click handler, which would open the empty menu. The
  // picker has to open inside the tap, so this calls it directly.
  document.addEventListener("click", (e) => {
    if (!routes || !e.target.closest?.("#outbtn")) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    window.auralfm.pickOutput();
  }, true);
}

/**
 * The service worker, and asking to keep what it caches.
 *
 * Registered here rather than in the bridge because it is about this page
 * being a web app, not about standing in for the desktop's main process. The
 * request to persist matters on a phone: without it the browser may clear the
 * cache when space runs short, and the ten megabytes of globe would be fetched
 * again on the next flight.
 */
if ("serviceWorker" in navigator) {
  addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => { /* http, or refused */ });
  });
}
navigator.storage?.persist?.().catch(() => {});

/**
 * The icon's long-press shortcuts arrive as a query.
 *
 * The manifest can only name a URL, so each shortcut opens the app with one —
 * and the app presses the button somebody meant to press. It waits for the
 * control to be wired rather than guessing at a delay: the catalogue has to
 * load before "somewhere else" has anywhere to send you.
 */
{
  const go = new URLSearchParams(location.search).get("go");
  const id = go === "somewhere" ? "tripBtn" : go === "favorites" ? "favBtn" : null;
  if (id) {
    const started = Date.now();
    const tick = setInterval(() => {
      const el = document.getElementById(id);
      if (el?.onclick) { clearInterval(tick); el.click(); }
      else if (Date.now() - started > 20000) clearInterval(tick);
    }, 120);
  }
}

/**
 * A place, by name: ?place=Lagos&country=Nigeria.
 *
 * The homepage's live globe links here when somebody picks a dot ("Listen
 * here"). A name rather than a catalogue index, because the site and the app
 * are published separately and an index can shift when the catalogue is
 * rebuilt; a name and a country do not. Waits for the app's own first
 * selection to land (see below), then flies to the one asked for.
 * No station starts: arriving somewhere is not the same as pressing play.
 */
{
  const q = new URLSearchParams(location.search);
  const want = q.get("place");
  if (want) {
    const country = q.get("country") || "";
    const go = async () => {
      const list = (await window.auralfm.places(want, 12))?.places || [];
      const hit = list.find((p) => p.title === want && (!country || p.country === country))
        || list.find((p) => p.title === want) || list[0];
      if (hit) goToPlace(hit.i, { fly: true });
    };
    // The app makes its own first selection — the last station's place, or a
    // city near you from the time zone — some while after the page appears, and
    // a place chosen before that was simply replaced by it. So this waits for
    // that first selection, then moves on to the place that was asked for.
    const started = Date.now();
    const wait = () => {
      const settled = document.body.classList.contains("revealed")
        && (selection.placeIndex !== null || Date.now() - started > 9000);
      if (settled) setTimeout(go, 500);
      else if (Date.now() - started < 30000) setTimeout(wait, 250);
    };
    wait();
  }
}
