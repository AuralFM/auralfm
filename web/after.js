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
