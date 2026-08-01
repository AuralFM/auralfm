const { contextBridge, ipcRenderer } = require("electron");

// Deliberately narrow: the renderer gets persistence and two UI signals, nothing
// else. contextIsolation is on, so this is the entire surface it can reach.
contextBridge.exposeInMainWorld("globefm", {
  getState: () => ipcRenderer.invoke("state:get"),
  setState: (state) => ipcRenderer.invoke("state:set", state),
  hide: () => ipcRenderer.send("popover:hide"),
  setTrayTitle: (text) => ipcRenderer.send("tray:title", text),
});
