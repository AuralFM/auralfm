/**
 * AuralFM in a browser: the `window.auralfm` bridge, without Electron.
 *
 * The desktop pages talk to their main process through `window.auralfm` and
 * nothing else, so the same pages run here unchanged once this object answers
 * the same calls. Where the main process used a module that only needs `fetch`
 * — the catalogue, weather, prices, the ISS, space weather, palettes, strings —
 * this calls that very module, wrapped for the browser by scripts/build-web.mjs
 * into `window.AuralMods`. Nothing is reimplemented that could be reused.
 *
 * Messaging is the desktop's Nostr code too, bundled into `window.AuralChat`
 * (web/messaging.js), and satellites into `window.AuralLive` (web/live.js).
 *
 * What the web version does not do, it says by returning nothing rather than by
 * pretending: no shortwave (receivers speak plain ws://, which an https page may
 * not open), no article reader, no stations of your own. Flights and headlines
 * come through the site's own proxy routes, because neither source lets a web
 * page read it directly.
 *
 * Everything that persists — favourites, settings, the last station — lives in
 * this browser's localStorage and nowhere else. There is no account. Clearing
 * the site's data is a complete reset, which is the same promise the desktop
 * app's throwaway identity makes.
 */
(() => {
  "use strict";
  // Settings opens as a popover over the app, in a frame. One bridge serves
  // both: a second would open its own relay connections, and a mute made in
  // Settings would not reach the chat until a reload.
  try {
    if (window.parent !== window && window.parent.auralfm) {
      window.auralfm = window.parent.auralfm;
      window.AuralTourSteps = window.parent.AuralTourSteps;
      return;
    }
  } catch { /* not ours; run standalone */ }

  const M = window.AuralMods;
  const VERSION = M.version;
  let chat = null;        // messaging, once the page's other pieces exist

  // ── storage ─────────────────────────────────────────────────────────────────
  // Every read and write is guarded: a private window or blocked site data makes
  // localStorage throw, and the app must still run, just without memory.
  const KEY = "auralfm.web.";
  const read = (k, d) => {
    try { const v = localStorage.getItem(KEY + k); return v ? JSON.parse(v) : d; }
    catch { return d; }
  };
  const write = (k, v) => { try { localStorage.setItem(KEY + k, JSON.stringify(v)); } catch { /* memory only */ } };

  // ── events ──────────────────────────────────────────────────────────────────
  const subs = {};
  const on = (ch) => (fn) => { (subs[ch] ||= []).push(fn); };
  const emit = (ch, v) => {
    for (const fn of subs[ch] || []) { try { fn(v); } catch (e) { console.error(e); } }
  };
  // Settings opens in its own tab, as it has its own window on the desktop. A
  // change there reaches this tab through the storage event.
  addEventListener("storage", (e) => {
    if (e.key === KEY + "prefs") { emit("prefs", getPrefs()); applyOutput(); }
    else if (e.key === KEY + "layers") emit("layers", layerState());
    else if (e.key === KEY + "state") emit("state", getState());
  });

  // ── the catalogue ───────────────────────────────────────────────────────────
  // catalog.js reads the bundle synchronously through its fs shim, so the file is
  // fetched first and every catalogue call waits for it.
  const catalogReady = fetch("data/stations.min.json")
    .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); })
    .then((text) => { M.files["stations.min.json"] = text; M.catalog.load(); })
    .catch((err) => console.error("catalog:", err));
  const cat = (fn) => async (...a) => { await catalogReady; return fn(...a); };

  // ── preferences and state ───────────────────────────────────────────────────
  const locale = navigator.language || "en";
  // The durable identity is the one desktop setting the web never honours: here
  // every key is thrown away with the site's data, which is the promise.
  // Listeners and chat are on unless you turn them off. The desktop starts with
  // them off; the web version is where people come to try the app, and a chat
  // they never find is not a feature they tried. What it shares is the same
  // either way — the station's area, never the listener's — and Settings says so.
  const getPrefs = () => {
    const saved = read("prefs", {});
    const p = { ...M.prefs.normalize(saved), durableIdentity: false };
    if (!("presence" in saved)) p.presence = true;
    return p;
  };
  function setPrefs(patch) {
    const picked = M.prefs.pick(patch || {});
    const next = { ...getPrefs(), ...picked, durableIdentity: false };
    write("prefs", next);
    emit("prefs", next);
    afterPrefs(picked);
    return next;
  }
  // What a change means beyond the page repainting — the desktop's setPrefs.
  function afterPrefs(changed) {
    if ("audioOutput" in changed) applyOutput();
    if (["presence", "relays", "powFloor"].some((k) => k in changed)) chat?.sync(lastPlayer);
    if (["filterChat", "onlyKept", "powFloor"].some((k) => k in changed)) chat?.refresh();
  }

  const STATE_KEYS = ["favorites", "vol", "lastChannel", "exploreView", "locked"];
  const getState = () => read("state", {});
  function setState(patch) {
    if (!patch || typeof patch !== "object") return false;
    const merged = { ...getState() };
    for (const k of STATE_KEYS) if (k in patch) merged[k] = patch[k];
    write("state", merged);
    emit("state", merged);
    return true;
  }

  // The layers this version can draw, with the desktop's defaults. Shortwave is
  // absent: an https page may not open a receiver's ws://.
  const LAYERS = [
    ["clouds", true], ["dayNight", true], ["stations", true], ["iss", true],
    ["flights", false], ["wspr", false], ["constellations", true], ["drift", false],
    ["listeners", true], ["statusBar", true],
  ];
  const layerState = () => {
    const saved = read("layers", {});
    return Object.fromEntries(LAYERS.map(([id, d]) => [id, saved[id] ?? d]));
  };
  function setLayers(patch) {
    const allowed = new Set(LAYERS.map(([id]) => id));
    const saved = read("layers", {});
    for (const [id, v] of Object.entries(patch || {})) if (allowed.has(id)) saved[id] = !!v;
    write("layers", saved);
    emit("layers", layerState());
  }

  // ── playback ────────────────────────────────────────────────────────────────
  // On the desktop the menu-bar panel owns the audio and Explore only watches it.
  // Here there is one page, so this is that panel: same states, same auto-skip.
  const audio = new Audio();
  audio.preload = "none";
  audio.volume = getState().vol ?? 0.8;
  let current = null, live = false, status = "", isError = false;
  let gen = 0, tried = [], watchdog = null;

  const channelOf = (ch) => ch && { id: ch.id, title: ch.title, place: ch.place,
    country: ch.country, lat: ch.lat, lon: ch.lon };
  let lastPlayer = null;
  const publish = () => {
    const was = lastPlayer?.playing && lastPlayer.channel?.id;
    lastPlayer = { channel: channelOf(current), status, error: isError,
      playing: live, volume: audio.volume, rssi: null };
    emit("player", lastPlayer);
    // Presence follows what is playing, as the desktop's syncNostrPresence does.
    if ((live && lastPlayer.channel?.id) !== was) chat?.sync(lastPlayer);
  };
  const setStatus = (text, err = false) => { status = text; isError = err; publish(); };

  function applyOutput() {
    const id = getPrefs().audioOutput || "";
    audio.setSinkId?.(id).catch(() => {});
  }

  // radio-browser asks to be told when one of its stations is played; that is how
  // its rankings stay honest. Fire and forget.
  const RB = "https://de1.api.radio-browser.info";
  const reportClick = (uuid) => { if (uuid) fetch(`${RB}/json/url/${uuid}`).catch(() => {}); };

  /**
   * Where a station can be heard from a web page, best first. https only: an
   * http stream is refused by the browser on an https page however it is reached.
   *
   *   1. radio-browser, by the station's own id, when the catalogue matched one.
   *      Its data is openly licensed and it asks to be the source it is.
   *   2. radio.garden's listen URL, which redirects to the stream; the audio
   *      element follows the redirect itself, as radio.garden's own site does.
   *   3. radio-browser by name, for a station the catalogue did not match.
   */
  async function candidates(ch) {
    const out = [];
    const add = (u) => { if (u && u.startsWith("https://") && !out.includes(u)) out.push(u); };
    if (ch.rbuuid) {
      try {
        const [s] = await (await fetch(`${RB}/json/stations/byuuid/${encodeURIComponent(ch.rbuuid)}`)).json();
        if (s && s.lastcheckok !== 0) add(s.url_resolved || s.url);
      } catch { /* try the others */ }
    }
    if (ch.id && ch.secure !== false) {
      add(`https://radio.garden/api/ara/content/listen/${encodeURIComponent(ch.id)}/channel.mp3`);
    }
    try {
      const q = new URLSearchParams({ name: ch.title, limit: "5", hidebroken: "true", order: "votes", reverse: "true" });
      const list = await (await fetch(`${RB}/json/stations/search?${q}`)).json();
      const same = (s) => !ch.country || (s.country || "").toLowerCase() === String(ch.country).toLowerCase();
      for (const s of [...list.filter(same), ...list.filter((s) => !same(s))]) add(s.url_resolved || s.url);
    } catch { /* what we have, then */ }
    return out;
  }

  async function tune(ch, { chained = false } = {}) {
    if (!ch) return;
    if (!chained) tried = [];
    const my = ++gen;
    current = ch;
    live = false;
    setState({ lastChannel: ch });
    setStatus("Finding stream…");
    reportClick(ch.rbuuid);
    const urls = await candidates(ch);
    if (my !== gen) return;
    // Say why, when the reason is the browser rather than the station.
    if (!urls.length && ch.secure === false) return fail("Only an insecure stream — browsers block it here");
    tryNext(urls, my);
  }

  function tryNext(urls, my) {
    clearTimeout(watchdog);
    if (my !== gen) return;
    const url = urls.shift();
    if (!url) return fail("Stream unavailable here");
    audio.src = url;
    setStatus("Connecting…");
    audio.play().catch((err) => {
      if (my !== gen || err.name === "AbortError") return;
      // The browser wants a click before sound, not a different stream. Skipping
      // here would walk a working station list for no reason.
      if (err.name === "NotAllowedError") { clearTimeout(watchdog); return setStatus("Press play"); }
      tryNext(urls, my);
    });
    audio.onerror = () => { if (my === gen) tryNext(urls, my); };
    watchdog = setTimeout(() => {
      if (my === gen && !live) tryNext(urls, my);
    }, 12000);
  }

  function stop() {
    gen++; clearTimeout(watchdog); live = false;
    audio.pause(); audio.removeAttribute("src"); audio.load();
    setStatus("Stopped");
  }

  // Three tries in the same place, as the desktop panel does, before giving up.
  async function fail(reason) {
    live = false;
    setStatus(reason, true);
    if (!current || tried.length >= 3) return;
    tried.push(current.id);
    await catalogReady;
    const next = M.catalog.nextInPlace(current, tried);
    if (!next) return setStatus(`${reason} — no alternative here`, true);
    setStatus(`${current.title} unavailable · trying ${next.title}`, true);
    tune(next, { chained: true });
  }

  audio.addEventListener("playing", () => {
    clearTimeout(watchdog);
    live = true;
    setStatus([current?.place, current?.country].filter(Boolean).join(" · ") || "Live");
    if ("mediaSession" in navigator && current) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: current.title, album: "AuralFM",
        artist: [current.place, current.country].filter(Boolean).join(" · "),
      });
    }
  });
  audio.addEventListener("waiting", () => { if (live) setStatus("Buffering…"); });
  if ("mediaSession" in navigator) {
    navigator.mediaSession.setActionHandler("play", () => current && tune(current));
    navigator.mediaSession.setActionHandler("pause", stop);
  }

  function transport({ action, value } = {}) {
    if (action === "toggle") { if (live) stop(); else if (current) tune(current); }
    else if (action === "volume") {
      // iOS ignores volume set by a page (the hardware buttons own it) but does
      // honour mute, so zero is also a mute and the mute button works there too.
      audio.muted = (Number(value) || 0) === 0;
      audio.volume = Math.max(0, Math.min(1, Number(value) || 0));
      setState({ vol: audio.volume });
      publish();
    }
  }

  // ── the tour ────────────────────────────────────────────────────────────────
  // The desktop tour talks about this Mac, the menu bar and receivers. These are
  // the same steps, true of a browser tab.
  window.AuralTourSteps = [
    { welcome: true, title: "Welcome to AuralFM",
      body: "A globe you listen to. Spin it — whatever sits under the middle "
          + "becomes the selection. Click a dot to hear that place." },
    { anchor: "#layersBtn", title: "Globe layers",
      body: "Live clouds, day and night, the ISS, flights, radio propagation, the stars." },
    { anchor: "#newsBtn", title: "Headlines",
      body: "What is being reported where your station broadcasts from." },
    { anchor: "#favBtn", title: "Favorites",
      body: "The star beside a station keeps it here, in this browser." },
    { welcome: true, title: "Nothing is collected",
      body: "No account, and nothing reports what you played. Favorites and "
          + "settings stay in this browser — clear its site data and they are gone." },
  ];

  // The few desktop sentences that are about the Mac, said about a browser. Only
  // in English for now; the other languages still name macOS here.
  const WEB_EN = {
    "set.contrastHint": "Stronger text and borders. Follows your device unless you turn it on here.",
    "set.tipsHint": "Short descriptions when you rest the pointer on a control.",
    "set.mineHint": "Stations you added yourself. They stay in this browser and are never sent anywhere.",
    "set.appIconHint": "Changes the icon on your home screen.",
    "set.promise": "No accounts. No analytics. Favorites, settings and your chat identity stay in this "
      + "browser — clear its site data and they are gone.",
  };

  // ── proxied sources ─────────────────────────────────────────────────────────
  M.news.setBase("/api/news");
  M.flights.setBase("/api/flights");
  // Explore asks for flights every 12 seconds. here.now's proxy allows 100
  // requests an hour per visitor, so on the web the same answer is reused for
  // 40 seconds — 90 an hour — and planes move a little less often.
  const FLIGHTS_EVERY_MS = 40_000;
  let flightsCache = { at: 0, data: [] };
  async function flightsNow(lat, lng, span, want) {
    if (Date.now() - flightsCache.at < FLIGHTS_EVERY_MS) return flightsCache.data;
    flightsCache = { at: Date.now(), data: flightsCache.data };
    try { flightsCache.data = await M.flights.get(lat, lng, span, want); } catch { /* keep the last */ }
    return flightsCache.data;
  }

  // ── the bridge ──────────────────────────────────────────────────────────────
  chat = window.AuralChat ? window.AuralChat({ getPrefs, emit }) : null;
  const none = async () => null, empty = async () => [];
  const noop = () => {};
  const api = {
    // catalogue
    stats: cat(() => M.catalog.stats()),
    globePoints: cat(() => M.catalog.globePoints()),
    places: cat((q, limit) => M.catalog.placeSearch(q, limit)),
    search: cat((q, limit, filter) => M.catalog.search(q, limit, filter)),
    // Stations a browser can play first. Nothing is hidden: an http-only one may
    // still have an https copy on radio-browser, found when it is picked.
    placeChannels: cat((i, filter) => {
      const r = M.catalog.placeChannels(i, filter);
      if (r?.channels) r.channels = [...r.channels.filter((c) => c.secure), ...r.channels.filter((c) => !c.secure)];
      return r;
    }),
    placeFacets: cat((i) => ({ tags: M.catalog.placeTags(i), bands: M.catalog.placeBands(i) })),
    stationById: cat((id) => M.catalog.byId(String(id || "")) || null),
    randomStation: cat(() => M.catalog.randomChannel()),
    nextStation: cat((ch, t) => M.catalog.nextInPlace(ch, t || [])),
    distance: async (aLat, aLon, bLat, bLon, units) =>
      M.geo.format(M.geo.haversine(aLat, aLon, bLat, bLon), M.geo.resolveUnits(units, locale)),

    // playback
    tune, transport, onPlayerState: on("player"),
    tuneSdr: noop, reportOk: noop, reportFailed: noop,

    // preferences, state, strings, palettes, layers
    getPrefs: async () => getPrefs(), setPrefs: async (p) => setPrefs(p), onPrefs: on("prefs"),
    getState: async () => getState(), setState: async (p) => setState(p), onStateChanged: on("state"),
    strings: async () => {
      const t = M.i18n.strings(getPrefs().language, locale);
      return M.i18n.resolve(getPrefs().language, locale) === "en" ? { ...t, ...WEB_EN } : t;
    },
    languages: async () => M.i18n.LANGUAGES,
    palettes: async () => M.palettes.list(),
    palette: async () => M.palettes.byId(getPrefs().palette),
    layers: async () => layerState(), setLayers, onLayers: on("layers"),
    version: async () => ({ version: VERSION, channel: "web" }),

    // the globe's live facts, through the desktop's own modules
    weather: (i, lat, lon) => M.weather.get(i, lat, lon),
    markets: async () => M.markets.get(),
    iss: () => M.iss.get(),
    space: () => M.space.get(),
    sky: async () => {
      try {
        const sky = await (await fetch("assets/sky.json")).json();
        sky.lang = M.i18n.resolve(getPrefs().language, locale);
        return sky;
      } catch { return null; }
    },
    // Cloud imagery straight from NASA GIBS, which lets a web page read it; the
    // desktop downloads the same images to disk first.
    clouds: async () => Object.fromEntries([...M.clouds.LAYER_KEYS.map((k) => [k, M.clouds.urlFor(k)]), ["at", Date.now()]]),
    satellites: async () => (window.AuralLive ? window.AuralLive.satellites.get() : []),
    wspr: (band) => M.wspr.get(band),
    // Flights and headlines come through the site's proxy routes (see the
    // manifest in scripts/build-web.mjs); neither source lets a page read it.
    flights: (lat, lng, span, want) => flightsNow(lat, lng, span, want),
    news: (country) => M.news.get(country),

    // shortwave: not in a browser (plain ws:// receivers)
    sdrPoints: empty, sdrOnAir: empty, sdrStats: async () => ({ count: 0 }),

    // messaging: the desktop's own, see web/messaging.js
    onPeers: on("peers"), onChat: on("chat"), onNotes: on("notes"), onDms: on("dms"),
    onHubMessages: on("hub"), onSocial: on("social"), onPanicWiped: on("wiped"),
    ...(chat ? chat.api : {
      presenceStats: none, presenceView: noop, chatHistory: empty, notesHistory: empty,
      dmHistory: empty, hubHistory: empty, socialList: empty, muteList: empty,
      profilesKnown: async () => ({}), filterList: async () => ({ terms: [], shipped: [] }),
    }),
    // Everything this browser holds, as the desktop's Erase does: identities,
    // mutes, contacts, messages and word-list changes, then favourites and
    // history. Appearance settings stay.
    panicWipe: async () => {
      const done = chat ? chat.wipe() : [];
      const keep = getPrefs();
      write("state", {});
      write("prefs", { ...keep, presence: false });
      done.push("favourites and history");
      emit("prefs", getPrefs());
      emit("state", {});
      emit("wiped");
      return done;
    },

    // not in this version: the article reader (web/after.js opens the article
    // instead), your own stations
    onMineChanged: noop,
    readArticle: none,
    mineList: empty,
    mineAdd: async () => ({ ok: false, error: "Adding your own stations is not in the web version yet." }),
    docsList: empty,

    // windows and links
    openSettings: () => window.AuralSheet?.open(),
    openExplore: () => window.open("index.html", "auralfm"),
    openLink: (url) => { if (/^https:\/\//.test(url)) window.open(url, "_blank", "noopener"); },
    openExternal: (url) => { if (/^https:\/\//.test(url)) window.open(url, "_blank", "noopener"); },
    exploreReady: noop,
    tipNext: none, tipDonate: noop, tipRetire: noop,
    reportError: noop,
  };

  // Anything the pages ask for that is not above is a feature this version does
  // not have. Answer it with nothing, once, and say so in the console, rather
  // than throw into a page that was written for the desktop.
  const warned = new Set();
  window.auralfm = new Proxy(api, {
    get(target, key) {
      if (key in target) return target[key];
      if (typeof key === "string" && !warned.has(key)) {
        warned.add(key);
        console.info(`auralfm.${key}: not in the web version`);
      }
      return key.startsWith?.("on") ? noop : none;
    },
  });

  M.markets.start();
  applyOutput();
  // After the page's own scripts have subscribed, or they would miss it.
  addEventListener("DOMContentLoaded", () => {
    const saved = getState().lastChannel;
    if (saved) { current = saved; setStatus("Press play"); }
  });
})();
