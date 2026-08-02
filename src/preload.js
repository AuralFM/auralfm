const { contextBridge, ipcRenderer } = require("electron");

// Deliberately narrow. contextIsolation is on, so this is the entire surface a
// renderer can reach — no filesystem, no network, no node. Both the popover and
// the Explore window load this same bridge.
contextBridge.exposeInMainWorld("globefm", {
  // persistence
  getState: () => ipcRenderer.invoke("state:get"),
  setState: (state) => ipcRenderer.invoke("state:set", state),

  // catalog
  search: (q, limit) => ipcRenderer.invoke("catalog:search", q, limit),
  places: (q, limit) => ipcRenderer.invoke("catalog:places", q, limit),
  placeChannels: (i) => ipcRenderer.invoke("catalog:placeChannels", i),
  globePoints: () => ipcRenderer.invoke("catalog:globePoints"),
  stats: () => ipcRenderer.invoke("catalog:stats"),
  resolve: (channel) => ipcRenderer.invoke("stream:resolve", channel),

  // playback — Explore requests, the popover performs, everyone observes
  tune: (channel) => ipcRenderer.send("player:tune", channel),
  publishState: (state) => ipcRenderer.send("player:state", state),
  onTune: (fn) => ipcRenderer.on("player:tune", (_e, ch) => fn(ch)),
  onPlayerState: (fn) => ipcRenderer.on("player:state", (_e, s) => fn(s)),

  // windows
  openExplore: () => ipcRenderer.send("explore:open"),
  hide: () => ipcRenderer.send("popover:hide"),
  onShown: (fn) => ipcRenderer.on("popover:shown", () => fn()),
  setHeight: (h) => ipcRenderer.send("popover:height", h),
});
