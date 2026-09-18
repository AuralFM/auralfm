/**
 * IPC: The station catalogue: search, places, a place's channels, resolving a stream, playback outcomes, and stations you added yourself.
 *
 * Registered once, from main.js, which passes `ctx`: the helpers these
 * handlers share with the rest of the main process, and getters for the windows
 * — getters, because the windows are created and destroyed after registration.
 */

const { ipcMain } = require("electron");
const catalog = require("../catalog");
const failures = require("../failures");
const mine = require("../mystations");
const resolver = require("../resolver");

module.exports = function register(ctx) {
  const { broadcast, hydrateMine } = ctx;

  ipcMain.handle("catalog:search", (_e, q, limit, filter) => {
    // Push known-bad streams down rather than hiding them — a station that failed
    // last night may be fine now, and silently vanishing would be worse.
    const hits = catalog.search(q, limit, filter);
    hits.sort((a, b) => failures.penalty(a.id) - failures.penalty(b.id));
    // Your own stations first. You added them deliberately, so a query that
    // matches one should not have to out-rank 38,000 others to surface it.
    return [...mine.search(q).map(hydrateMine), ...hits];
  });
  ipcMain.on("player:failed", (_e, id) => failures.markFailed(id));
  ipcMain.on("player:ok", (_e, id) => failures.markPlayed(id));
  ipcMain.handle("player:next", (_e, ch, tried) =>
    catalog.nextInPlace(ch, [...(tried || []), ...failures.recentlyFailed()]));
  ipcMain.handle("catalog:stats", () => catalog.stats());
  ipcMain.handle("stream:resolve", (_e, ch) => {
    // Nothing to resolve: you told us the URL. Going through the three-tier
    // resolver would ask radio.garden about a station it has never heard of.
    if (mine.isMine(ch?.id)) {
      const s = mine.get(ch.id);
      return s ? { url: s.url } : null;
    }
    return resolver.resolve(ch);
  });
  ipcMain.handle("mine:list", () => mine.all().map(hydrateMine));

  ipcMain.handle("mine:add", (_e, input) => {
    const r = mine.add(input);
    if (r.ok) broadcast("mine:changed");
    return r.ok ? { ok: true, station: hydrateMine(r.station) } : r;
  });
  ipcMain.handle("mine:remove", (_e, id) => {
    const ok = mine.remove(id);
    if (ok) broadcast("mine:changed");
    return ok;
  });
  ipcMain.handle("catalog:places", (_e, q, limit) => catalog.placeSearch(q, limit));
  ipcMain.handle("catalog:placeChannels", (_e, i, filter) => {
    const r = catalog.placeChannels(i, filter);
    if (!r.place) return r;
    // Filters describe catalogue metadata (band, radio-browser tag) that a
    // hand-added station does not have, so yours are only hidden when a filter is
    // actually on — otherwise they would vanish for no reason the user can see.
    const own = (filter?.band || filter?.tag) ? [] : mine.forPlace(i).map(hydrateMine);
    return { ...r, channels: [...own, ...r.channels], total: r.total + own.length };
  });
  ipcMain.handle("catalog:placeFacets", (_e, i) => ({ tags: catalog.placeTags(i), bands: catalog.placeBands(i) }));
  /** One station by id — for anything holding a name that has lost its place. */
  ipcMain.handle("catalog:byId", (_e, id) => catalog.byId(String(id || "")) || null);

  /** Somewhere else. The renderer names no station; the catalogue picks. */
  ipcMain.handle("catalog:random", () => catalog.randomChannel());

  ipcMain.handle("catalog:globePoints", () => {
    const pts = catalog.globePoints();
    const extra = mine.countsByPlace();
    if (!extra.size) return pts;
    const seen = new Set();
    for (const p of pts) {
      const n = extra.get(p[0]);
      if (n) { p[3] += n; seen.add(p[0]); }
    }
    // A station you added somewhere the catalogue has none puts a dot on the
    // globe that was not there before.
    for (const [i, n] of extra) {
      if (seen.has(i)) continue;
      const pl = catalog.placeById?.(i);
      if (pl) pts.push([i, pl.lon, pl.lat, n]);
    }
    return pts;
  });
};
