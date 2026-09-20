/**
 * The service worker: the app opens without the network, and opens fast.
 *
 * Two jobs, and deliberately no more.
 *
 * **Open offline.** A navigation is tried on the network and falls back to the
 * cached page, so the app starts on a plane. What it can do there is browse:
 * the catalogue is local, the globe's textures are local, the sky is local.
 * Playing a station is not something a cache can fake, and nothing here
 * pretends otherwise.
 *
 * **Open fast.** The globe's textures and the station list are about ten
 * megabytes between them, fetched on every cold start. Cached, the second
 * launch paints the planet immediately.
 *
 * What it does NOT touch: anything cross-origin. Streams, weather, prices, the
 * ISS, relays — all of it goes straight to the network, uncached. A radio app
 * serving yesterday's stream from a cache would be a bug, and a cache of
 * somebody's listening is a record this app does not keep.
 *
 * BUILD is stamped in at build time, so a new version is a new cache and the
 * old one is deleted on activation rather than lingering as a second app.
 */
const CACHE = "auralfm-__BUILD__";

/** The shell: enough to paint the app with no network at all. */
const SHELL = __SHELL__;

self.addEventListener("install", (e) => {
  // One failed file must not fail the install, or a single 404 leaves the app
  // with no cache at all. Each is added on its own and misses are survivable.
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(SHELL.map((u) => cache.add(u).catch(() => {})));
  })());
});

/**
 * No skipWaiting here, and no clients.claim below. Both were, and both were
 * wrong for this app.
 *
 * Together they meant a newly deployed worker took over pages that were already
 * open, then deleted every cache but its own. The running page's scripts are
 * stamped with the old build's URLs — just thrown away — so each one missed and
 * went to the network. On a good connection that is invisible. On a phone with
 * a weak signal it is a dead page: the app's own HTML still on screen with
 * nothing behind it.
 *
 * The default lifecycle is the right one for a radio. A new worker waits until
 * every page using the old one has closed, so nothing is swapped underneath
 * somebody who is listening and the cache is dropped only once nothing needs
 * it. The update lands on the next launch. That is the price, and for an app
 * whose whole job is not to stop playing, it is the correct one to pay.
 */
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
  })());
});

self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;            // never someone else's
  // The proxied sources are live data wearing our own address.
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    e.respondWith((async () => {
      try { return await fetch(request); }
      catch { return (await caches.match("index.html")) || Response.error(); }
    })());
    return;
  }

  // Everything else of ours: the cache first, and fill it as we go. These are
  // build-stamped files, so a hit is the right answer by construction.
  e.respondWith((async () => {
    /**
     * Exact URLs, stamp and all.
     *
     * Matching with `ignoreSearch` looked tidier — one cached copy answering
     * every version of a query — and it meant a page from a *new* build asking
     * for `bridge.js?v=new` was served the *old* file, because the stamp was
     * the only thing telling them apart. Scripts are precached under the same
     * stamped URLs the page asks for, so a new build simply misses and fetches.
     */
    const hit = await caches.match(request);
    if (hit) return hit;
    try {
      const res = await fetch(request);
      if (res.ok && res.type === "basic") {
        const cache = await caches.open(CACHE);
        cache.put(request, res.clone()).catch(() => {});
      }
      return res;
    } catch {
      // A miss with no network. respondWith on a rejected promise is not a
      // failed request, it is a failed *page*, so answer it properly: an older
      // build's copy of the same file if the install never cached this one,
      // and an honest error if there is nothing at all.
      return (await caches.match(request, { ignoreSearch: true })) || Response.error();
    }
  })());
});
