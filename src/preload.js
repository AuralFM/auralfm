const { contextBridge, ipcRenderer } = require("electron");

// Deliberately narrow. contextIsolation is on, so this is the entire surface a
// renderer can reach — no filesystem, no network, no node. Both the popover and
// the Explore window load this same bridge.
contextBridge.exposeInMainWorld("auralfm", {
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
  iss: () => ipcRenderer.invoke("iss:get"),
  satellites: () => ipcRenderer.invoke("sats:get"),
  sky: () => ipcRenderer.invoke("sky:get"),
  layers: () => ipcRenderer.invoke("globe:layers"),
  onLayers: (fn) => ipcRenderer.on("globe:layers", (_e, l) => fn(l)),
  weather: (i, lat, lon) => ipcRenderer.invoke("weather:get", i, lat, lon),
  news: (country) => ipcRenderer.invoke("news:get", country),
  markets: () => ipcRenderer.invoke("markets:get"),

  // preferences
  getPrefs: () => ipcRenderer.invoke("prefs:get"),
  setPrefs: (patch) => ipcRenderer.invoke("prefs:set", patch),
  onPrefs: (fn) => ipcRenderer.on("prefs:changed", (_e, p) => fn(p)),
  openSettings: () => ipcRenderer.send("settings:open"),
  openDoc: (name) => ipcRenderer.send("doc:open", name),
  docText: (name) => ipcRenderer.invoke("doc:text", name),
  strings: () => ipcRenderer.invoke("i18n:strings"),
  languages: () => ipcRenderer.invoke("i18n:languages"),
  palettes: () => ipcRenderer.invoke("palettes:list"),
  palette: () => ipcRenderer.invoke("palettes:get"),

  // stations you added yourself
  mineList: () => ipcRenderer.invoke("mine:list"),
  mineAdd: (input) => ipcRenderer.invoke("mine:add", input),
  mineRemove: (id) => ipcRenderer.invoke("mine:remove", id),
  onMineChanged: (fn) => ipcRenderer.on("mine:changed", () => fn()),
  version: () => ipcRenderer.invoke("app:version"),

  // shortwave receivers
  sdrPoints: () => ipcRenderer.invoke("sdr:points"),
  sdrGet: (i) => ipcRenderer.invoke("sdr:get", i),
  sdrStats: () => ipcRenderer.invoke("sdr:stats"),
  sdrNearest: (lat, lng, n) => ipcRenderer.invoke("sdr:nearest", lat, lng, n),
  sdrOnAir: (opts) => ipcRenderer.invoke("sdr:onair", opts),
  sdrSchedule: () => ipcRenderer.invoke("sdr:schedule"),
  flights: (lat, lng, span, want) => ipcRenderer.invoke("flights:get", lat, lng, span, want),
  wspr: (band) => ipcRenderer.invoke("wspr:get", band),
  space: () => ipcRenderer.invoke("space:get"),
  presenceStats: () => ipcRenderer.invoke("presence:stats"),
  onPeers: (fn) => ipcRenderer.on("presence:peers", (_e, list) => fn(list)),
  caption: (msg) => ipcRenderer.send("caption:line", msg),
  onCaption: (fn) => ipcRenderer.on("caption:line", (_e, m) => fn(m)),
  chatHistory: () => ipcRenderer.invoke("presence:history"),
  chatSay: (text, nick) => ipcRenderer.invoke("presence:say", text, nick),
  onChat: (fn) => ipcRenderer.on("presence:messages", (_e, list) => fn(list)),
  tuneSdr: (rx) => ipcRenderer.send("sdr:tune", rx),
  onTuneSdr: (fn) => ipcRenderer.on("sdr:tune", (_e, rx) => fn(rx)),
  openMail: () => ipcRenderer.send("mail:open"),
  openLink: (url) => ipcRenderer.send("open:external", url),
  stats: () => ipcRenderer.invoke("catalog:stats"),
  resolve: (channel) => ipcRenderer.invoke("stream:resolve", channel),

  // playback — Explore requests, the popover performs, everyone observes
  tune: (channel) => ipcRenderer.send("player:tune", channel),
  reportFailed: (id) => ipcRenderer.send("player:failed", id),
  mediaKeys: (on) => ipcRenderer.send("player:mediakeys", on),
  onMediaKey: (fn) => ipcRenderer.on("player:mediakey", (_e, a) => fn(a)),
  onListeners: (fn) => ipcRenderer.on("player:listeners", (_e, n) => fn(n)),
  transport: (msg) => ipcRenderer.send("player:transport", msg),
  onTransport: (fn) => ipcRenderer.on("player:transport", (_e, m) => fn(m)),
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
