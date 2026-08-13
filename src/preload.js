const { contextBridge, ipcRenderer } = require("electron");

// Deliberately narrow. contextIsolation is on, so this is the entire surface a
// renderer can reach — no filesystem, no network, no node. Both the popover and
// the Explore window load this same bridge.
contextBridge.exposeInMainWorld("auralfm", {
  /**
   * Great-circle distance between two places, already formatted.
   *
   * Over IPC rather than by requiring src/geo.js here. A preload that requires
   * a local module fails *silently* in this configuration -- the module does
   * not load, no error is logged anywhere, and `window.auralfm` simply never
   * appears, taking all 76 of these with it. Found by checking the bridge at
   * runtime rather than by trusting that the app still started.
   *
   * `units` is the preference, not the answer. "system" is resolved in main
   * against the real locale rather than guessed from a country.
   */
  distance: (aLat, aLon, bLat, bLon, units) =>
    ipcRenderer.invoke("geo:distance", aLat, aLon, bLat, bLon, units),

  // persistence
  getState: () => ipcRenderer.invoke("state:get"),
  /**
   * Send only the keys you changed. Sending a whole object sends whatever this
   * window last read, which is how one renderer's stale copy silently deleted
   * favorites the other had just saved.
   */
  setState: (patch) => ipcRenderer.invoke("state:set", patch),
  onStateChanged: (fn) => ipcRenderer.on("state:changed", (_e, s) => fn(s)),

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
  setLayers: (patch) => ipcRenderer.send("globe:setLayers", patch),
  weather: (i, lat, lon) => ipcRenderer.invoke("weather:get", i, lat, lon),
  news: (country) => ipcRenderer.invoke("news:get", country),
  readArticle: (url) => ipcRenderer.invoke("news:read", url),
  markets: () => ipcRenderer.invoke("markets:get"),

  // preferences
  getPrefs: () => ipcRenderer.invoke("prefs:get"),
  setPrefs: (patch) => ipcRenderer.invoke("prefs:set", patch),
  onPrefs: (fn) => ipcRenderer.on("prefs:changed", (_e, p) => fn(p)),
  openSettings: () => ipcRenderer.send("settings:open"),
  strings: () => ipcRenderer.invoke("i18n:strings"),
  languages: () => ipcRenderer.invoke("i18n:languages"),
  palettes: () => ipcRenderer.invoke("palettes:list"),
  palette: () => ipcRenderer.invoke("palettes:get"),

  // stations you added yourself
  mineList: () => ipcRenderer.invoke("mine:list"),
  // Fire-and-forget on purpose: the reporter must not be able to reject and
  // create the very unhandled rejection it exists to catch.
  reportError: (r) => ipcRenderer.send("app:error", r),
  errorLogPath: () => ipcRenderer.invoke("app:errorLogPath"),
  errorLogRead: () => ipcRenderer.invoke("app:errorLogRead"),
  // Rule-based tips, on TipKit's model: donate what happened, ask what to show.
  tipDonate: (id) => ipcRenderer.send("tips:donate", id),
  tipNext: (uptime) => ipcRenderer.invoke("tips:next", uptime),
  tipRetire: (id, reason) => ipcRenderer.send("tips:retire", id, reason),
  docsList: () => ipcRenderer.invoke("docs:list"),
  docsRead: (id) => ipcRenderer.invoke("docs:read", id),
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
  // Read a cell while browsing. Never announces; see the handler in main.
  presenceView: (lat, lon) => ipcRenderer.send("presence:view", lat, lon),

  onPeers: (fn) => ipcRenderer.on("presence:peers", (_e, list) => fn(list)),
  // Muting. The renderer passes the full pubkey it received with the message;
  // main validates it and owns the list.
  // Panic wipe. Invoked so the caller knows it finished, and broadcast so every
  // window drops what it is holding.
  panicWipe: () => ipcRenderer.invoke("panic:wipe"),
  onPanicWiped: (fn) => ipcRenderer.on("panic:wiped", () => fn()),
  muteList: () => ipcRenderer.invoke("mute:list"),
  muteAdd: (pubkey) => ipcRenderer.invoke("mute:add", pubkey),
  muteRemove: (pubkey) => ipcRenderer.invoke("mute:remove", pubkey),
  chatHistory: () => ipcRenderer.invoke("presence:history"),
  chatSay: (text, nick) => ipcRenderer.invoke("presence:say", text, nick),
  onChat: (fn) => ipcRenderer.on("presence:messages", (_e, list) => fn(list)),

  /**
   * Location notes. Text in, nothing else — the cell and the expiry are main's to
   * decide, because a renderer choosing either could pin a note to a place the
   * app is not in or to a day that never ends.
   */
  notesHistory: () => ipcRenderer.invoke("notes:history"),
  noteDrop: (text) => ipcRenderer.invoke("notes:drop", text),
  onNotes: (fn) => ipcRenderer.on("presence:notes", (_e, list) => fn(list)),

  /**
   * Private messages.
   *
   * Note what is absent: there is no way to ask for a key, sign anything, or
   * encrypt anything. The renderer names a recipient and supplies words. Every
   * private key stays on the other side of this bridge, which is the only reason
   * a compromised renderer cannot impersonate anybody.
   */
  dmHistory: () => ipcRenderer.invoke("dm:history"),
  dmThread: (pubkey) => ipcRenderer.invoke("dm:thread", pubkey),
  dmSend: (pubkey, text) => ipcRenderer.invoke("dm:send", pubkey, text),
  dmRead: (pubkey) => ipcRenderer.invoke("dm:read", pubkey),
  onDms: (fn) => ipcRenderer.on("presence:dms", (_e, list) => fn(list)),
  onUnread: (fn) => ipcRenderer.on("presence:unread", (_e, n) => fn(n)),

  /**
   * The word filter, and reporting.
   *
   * `chatReport` opens an email draft and mutes the sender. It sends nothing —
   * the person reads the draft and presses send, or does not.
   */
  filterList: () => ipcRenderer.invoke("filter:list"),
  filterAdd: (term) => ipcRenderer.invoke("filter:add", term),
  filterRemove: (term) => ipcRenderer.invoke("filter:remove", term),
  filterReset: () => ipcRenderer.invoke("filter:reset"),
  chatReport: (msg) => ipcRenderer.invoke("chat:report", msg),

  /** Contacts: favorite, verified, and a label only you ever see. */
  socialList: () => ipcRenderer.invoke("social:list"),
  socialGet: (pubkey) => ipcRenderer.invoke("social:get", pubkey),
  socialFavorite: (pubkey, on) => ipcRenderer.invoke("social:favorite", pubkey, on),
  socialVerify: (pubkey, on) => ipcRenderer.invoke("social:verify", pubkey, on),
  socialLabel: (pubkey, label) => ipcRenderer.invoke("social:label", pubkey, label),
  socialFingerprint: (pubkey) => ipcRenderer.invoke("social:fingerprint", pubkey),
  onSocial: (fn) => ipcRenderer.on("social:changed", (_e, list) => fn(list)),
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
  // Told once, when the globe has actually painted. Reveals the window.
  exploreReady: () => ipcRenderer.send("explore:ready"),
  publishState: (state) => ipcRenderer.send("player:state", state),
  onTune: (fn) => ipcRenderer.on("player:tune", (_e, ch) => fn(ch)),
  onPlayerState: (fn) => ipcRenderer.on("player:state", (_e, s) => fn(s)),

  // windows
  openExplore: () => ipcRenderer.send("explore:open"),
  hide: () => ipcRenderer.send("popover:hide"),
  onShown: (fn) => ipcRenderer.on("popover:shown", () => fn()),
  setHeight: (h) => ipcRenderer.send("popover:height", h),
});
