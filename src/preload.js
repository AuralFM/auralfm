const { contextBridge, ipcRenderer } = require("electron");

// Deliberately narrow. contextIsolation is on, so this is the entire surface a
// renderer can reach — no filesystem, no network, no node. Both the popover and
// the Explore window load this same bridge.
contextBridge.exposeInMainWorld("globefm", {
  // persistence
  getState: () => ipcRenderer.invoke("state:get"),
  setState: (state) => ipcRenderer.invoke("state:set", state),

  // catalog
  search: (q, limit, filter) => ipcRenderer.invoke("catalog:search", q, limit, filter),
  places: (q, limit) => ipcRenderer.invoke("catalog:places", q, limit),
  placeChannels: (i, filter) => ipcRenderer.invoke("catalog:placeChannels", i, filter),
  placeFacets: (i) => ipcRenderer.invoke("catalog:placeFacets", i),
  globePoints: () => ipcRenderer.invoke("catalog:globePoints"),
  clouds: () => ipcRenderer.invoke("clouds:get"),
  weather: (i, lat, lon) => ipcRenderer.invoke("weather:get", i, lat, lon),
  news: (country) => ipcRenderer.invoke("news:get", country),
  stats: () => ipcRenderer.invoke("catalog:stats"),
  resolve: (channel) => ipcRenderer.invoke("stream:resolve", channel),

  // playback — Explore requests, the popover performs, everyone observes
  tune: (channel) => ipcRenderer.send("player:tune", channel),
  reportFailed: (id) => ipcRenderer.send("player:failed", id),
  mediaKeys: (on) => ipcRenderer.send("player:mediakeys", on),
  onMediaKey: (fn) => ipcRenderer.on("player:mediakey", (_e, a) => fn(a)),
  onListeners: (fn) => ipcRenderer.on("player:listeners", (_e, n) => fn(n)),
  reportOk: (id) => ipcRenderer.send("player:ok", id),
  nextStation: (ch, tried) => ipcRenderer.invoke("player:next", ch, tried),
  publishState: (state) => ipcRenderer.send("player:state", state),
  onTune: (fn) => ipcRenderer.on("player:tune", (_e, ch) => fn(ch)),
  onPlayerState: (fn) => ipcRenderer.on("player:state", (_e, s) => fn(s)),

  // windows
  openExplore: () => ipcRenderer.send("explore:open"),
  hide: () => ipcRenderer.send("popover:hide"),
  onShown: (fn) => ipcRenderer.on("popover:shown", () => fn()),
  setHeight: (h) => ipcRenderer.send("popover:height", h),
});
