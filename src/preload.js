const { contextBridge, ipcRenderer } = require("electron");

// Deliberately narrow: the renderer gets persistence, catalog queries, stream
// resolution and two UI signals — nothing else. contextIsolation is on, so this
// is the entire surface it can reach. Note the renderer never gets filesystem or
// network access of its own; all of that stays in main.
contextBridge.exposeInMainWorld("globefm", {
  getState: () => ipcRenderer.invoke("state:get"),
  setState: (state) => ipcRenderer.invoke("state:set", state),

  search: (q, limit) => ipcRenderer.invoke("catalog:search", q, limit),
  byPlace: (place, country) => ipcRenderer.invoke("catalog:byPlace", place, country),
  stats: () => ipcRenderer.invoke("catalog:stats"),
  resolve: (channel) => ipcRenderer.invoke("stream:resolve", channel),

  hide: () => ipcRenderer.send("popover:hide"),
  setTrayTitle: (text) => ipcRenderer.send("tray:title", text),
  onShown: (fn) => ipcRenderer.on("popover:shown", () => fn()),
  setHeight: (h) => ipcRenderer.send("popover:height", h),
});
