/**
 * Not a service worker the homepage uses. It never registers this.
 *
 * Until 2026-09-23 the web app lived at auralfm.xyz and installed its worker
 * (web/sw.js) at /sw.js, controlling the whole origin and caching the app's
 * shell. The app now lives at listen.auralfm.xyz and the homepage has taken
 * auralfm.xyz — but a browser that ran the app here would go on answering
 * auralfm.xyz from that cache, showing the old app forever.
 *
 * Browsers re-check a worker's script when a page it controls is opened, so
 * this file is what they find at the old address: it takes over at once,
 * deletes every cache the app left, unregisters itself, and reloads the open
 * pages onto the network, which serves the homepage. After that, nothing on
 * this origin is controlled by a worker at all.
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) await caches.delete(key);
    await self.registration.unregister();
    const pages = await self.clients.matchAll({ type: "window" });
    for (const page of pages) page.navigate(page.url).catch(() => {});
  })());
});
