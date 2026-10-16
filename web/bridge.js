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
 * not open), no stations of your own, and a reader for the world feeds' stories
 * only. Headlines, and those stories, come through the site's own proxy
 * routes, because neither Google News nor a publisher lets a web page read it
 * directly.
 *
 * Everything that persists — favourites, settings, the last station — lives in
 * this browser's localStorage and nowhere else. There is no account. Clearing
 * the site's data is a complete reset, which is the same promise the desktop
 * app's throwaway identity makes.
 */
(() => {
  // A phone gets the half-size globe pictures (explore-core.js, texUrl). The
  // same question the phone layout asks (web/web.css), asked once at load.
  window.AuralLite = matchMedia("(max-width: 700px), (pointer: coarse) and (max-height: 500px)").matches;
  /**
   * The installed app, down to the bottom of the screen (web/web.css, html.tail).
   *
   * Installed on an iPhone with the see-through status bar, the page starts at
   * the very top of the screen, and iOS then lays it out a status bar short of
   * the bottom: a blank strip under the tab bar.
   *
   * The first fix added the strip's height to the page's own idea of its
   * height, and overshot by about as much again: on his phone the labels under
   * the tab icons went off the screen. The page's idea of its height is not a
   * steady number in this mode, so it is no longer asked. What is steady: the
   * page starts at the top of the screen, and the screen is `screen.height`
   * tall. So the page is told to be exactly that tall, in points.
   *
   * Only when installed, on a phone, upright, and really under the status bar
   * (a top inset above nothing: under the old opaque bar the page starts below
   * it and is rightly shorter). And not while something is being typed into:
   * the keyboard needs the page to shrink, and a fixed height would leave the
   * field behind it.
   */
  const typing = () => /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "") || document.activeElement?.isContentEditable === true;
  // Settings is this same page in a frame (below): the frame is not the screen.
  const framed = (() => { try { return window.parent !== window; } catch { return true; } })();
  const fitScreen = () => {
    const root = document.documentElement;
    let tall = 0, seen = {};
    try {
      const installed = !framed && (navigator.standalone === true || matchMedia("(display-mode: standalone)").matches);
      const upright = matchMedia("(orientation: portrait)").matches;
      if (document.body) {
        const probe = document.createElement("div");
        probe.style.cssText = "position:fixed;top:0;left:0;width:0;height:env(safe-area-inset-top);visibility:hidden;pointer-events:none";
        document.body.append(probe);
        const inset = probe.offsetHeight;
        probe.style.height = "100dvh";
        const dvh = probe.offsetHeight;
        probe.remove();
        const full = upright ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height);
        seen = { installed, upright, lite: !!window.AuralLite, inset, full, inner: window.innerHeight, client: root.clientHeight, dvh,
                 visual: Math.round(window.visualViewport?.height || 0), typing: typing() };
        if (installed && upright && window.AuralLite && inset > 0 && !typing()) tall = full;
      }
    } catch { tall = 0; }
    root.style.setProperty("--tall", `${tall}px`);
    root.classList.toggle("tail", tall > 0);
    window.AuralFitSeen = { ...seen, tall };
    document.dispatchEvent(new Event("auralfm:fit"));
  };
  window.AuralFit = fitScreen;
  if (document.body) fitScreen(); else document.addEventListener("DOMContentLoaded", fitScreen);
  addEventListener("pageshow", fitScreen);
  addEventListener("orientationchange", () => setTimeout(fitScreen, 350));
  addEventListener("resize", fitScreen);
  // Typing starts and stops: the keyboard gets the page it needs, then it is given back.
  addEventListener("focusin", fitScreen);
  addEventListener("focusout", () => setTimeout(fitScreen, 250));
  // The stretched page must not move (web/web.css says why it can): if
  // anything scrolls the window, it is put back, so the app is never left slid up.
  const unscroll = () => {
    if (!document.documentElement.classList.contains("tail")) return;
    if (window.scrollY || document.documentElement.scrollTop || document.body?.scrollTop) {
      window.scrollTo(0, 0); document.documentElement.scrollTop = 0; if (document.body) document.body.scrollTop = 0;
    }
  };
  addEventListener("scroll", unscroll, { passive: true });
  document.addEventListener("scroll", unscroll, { passive: true, capture: true });
  window.visualViewport?.addEventListener("scroll", unscroll, { passive: true });
  // A change of focus is what scrolls it: checked again once the phone has had its say.
  addEventListener("focusin", () => { unscroll(); setTimeout(unscroll, 60); setTimeout(unscroll, 320); });
  /**
   * What the phone reports, on the screen, for when this is wrong again: the
   * numbers above can only be read on the device itself. Shown after "fit" is
   * typed into Settings > Move to a new install (a Home Screen app cannot be
   * given a link), or with ?fit; "fitoff" takes it away.
   */
  const fitNote = () => {
    let on = false;
    try { const q = new URLSearchParams(location.search); if (q.has("fit")) localStorage.setItem("auralfm.fit", "1"); on = localStorage.getItem("auralfm.fit") === "1"; } catch { on = false; }
    let box = document.getElementById("fitnote");
    if (!on) { box?.remove(); return; }
    if (!document.body) return;
    if (!box) {
      box = document.createElement("pre");
      box.id = "fitnote";
      box.style.cssText = "position:fixed;left:8px;top:calc(env(safe-area-inset-top) + 64px);z-index:2147483600;margin:0;padding:8px 10px;max-width:70vw;white-space:pre-wrap;font:12px/1.35 ui-monospace,Menlo,monospace;color:#fff;background:rgba(0,0,0,.78);border-radius:8px;pointer-events:none";
      document.body.append(box);
    }
    const bar = document.querySelector(".tabbar")?.getBoundingClientRect();
    const s = window.AuralFitSeen || {};
    box.textContent = Object.entries({ ...s, tabBottom: bar ? Math.round(bar.bottom) : "none", body: Math.round(document.body.getBoundingClientRect().height) })
      .map(([k, v]) => `${k} ${v}`).join("\n");
  };
  document.addEventListener("auralfm:fit", () => setTimeout(fitNote, 60));
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
  // The carry-over code (backupCode, below): its mark, and the small files of
  // the messaging modules that go with it (web/shims/fs.js keeps them here).
  const BACKUP_TAG = "auralfm1:";
  const FS = "auralfm.web.fs:";
  const BACKUP_FILES = ["muted.json", "contacts.json", "filter.json"];
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
    // Favorites sync ran, or was turned on or off, in the other page. Off has
    // to be said twice: this page's file shim still holds the secret in memory
    // (web/shims/fs.js), and its next round would write it back.
    else if (e.key === FS + "favsync.json") { if (e.newValue === null) favsync?.stop(); else emit("favsync", favsync?.status()); }
  });

  // ── the catalogue ───────────────────────────────────────────────────────────
  // catalog.js reads the bundle synchronously through its fs shim, so the file is
  // fetched first and every catalogue call waits for it.
  const catalogReady = fetch("data/stations.min.json")
    .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); })
    .then((text) => {
      M.files["stations.min.json"] = text; M.catalog.load(); M.catalog.setHideExplicit(getPrefs().hideExplicit);
      // Only what a page served over https can play (src/catalog.js setPlayableOnly).
      M.catalog.setPlayableOnly(true);
      window.AuralLaunch?.step("launch.globe", "Drawing the globe");
      // Favourites and the last station saved under the catalogue's old ids find
      // themselves again by name (catalog.relinkSaved), and so does a station
      // already cued from them.
      const { state, moved } = M.catalog.relinkSaved(getState());
      if (moved) setState({ favorites: state.favorites, lastChannel: state.lastChannel });
      if (current && !M.catalog.byId(String(current.id))) current = M.catalog.relink(current) || current;
    })
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
    if ("hideExplicit" in changed) M.catalog.setHideExplicit(getPrefs().hideExplicit);
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
    if ("favorites" in patch) favsync?.touch();
    return true;
  }

  // Favorites sync (src/favsync.js, bundled with the messaging). It reads and
  // writes the one list above. The main page looks for the other devices'
  // changes when it opens and when it comes back to the front; Settings only
  // runs a round when asked, so two pages never do the same work at once.
  const favsync = window.AuralFavSync || null;
  favsync?.init("/auralfm-web", {
    get: () => { const f = getState().favorites; return Array.isArray(f) ? f : []; },
    set: (favorites) => { const st = { ...getState(), favorites }; write("state", st); emit("state", st); },
    changed: (s) => emit("favsync", s),
  });
  if (favsync && !/settings\.html/.test(location.pathname)) {
    setTimeout(() => favsync.wake(), 4000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) favsync.wake(); });
  }

  // The layers this version can draw, with the desktop's defaults. Shortwave is
  // absent: an https page may not open a receiver's ws://.
  const LAYERS = [
    ["clouds", true], ["dayNight", true], ["stations", true], ["iss", true],
    ["wspr", false], ["constellations", true], ["drift", false],
    // Off, as on the desktop: the read-out is a line of figures about the sun
    // and the ISS, and it is not what somebody opening a radio wants first.
    ["listeners", true], ["statusBar", false],
    // Shows on air, as on the desktop: their own layer, on at every launch.
    ["onAir", true],
  ];
  
  const ON_AT_LAUNCH = new Set(["stations", "shortwave", "onAir"]);
  function startQuiet() {
    const st = {};
    for (const [id] of LAYERS) st[id] = ON_AT_LAUNCH.has(id);
    write("layers", st);
  }
  startQuiet();

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
  // Offered to AirPlay and to iOS's own output picker (AirPods, Bluetooth
  // speakers), which is what `pickOutput` below opens.
  audio.setAttribute("x-webkit-airplay", "allow");

  /**
   * Where the sound goes, on Safari.
   *
   * A page elsewhere lists outputs and picks one (setSinkId). Safari lists none,
   * so the button used to hide and the only way to AirPods was Control Centre.
   * But Safari will open the system's own route picker — the one every iPhone
   * music app shows, with the AirPods, the Bluetooth speaker and the AirPlay
   * devices in it — and says when there is anything to pick. Explore shows its
   * output button whenever there is (web/after.js).
   */
  let routes = false;
  audio.addEventListener("webkitplaybacktargetavailabilitychanged", (e) => {
    routes = e.availability === "available";
    emit("routes", routes);
  });

  /**
   * Tell iOS this is a player, before it plays.
   *
   * Left on "auto", a page's audio session is decided by what it happens to be
   * using, and the share card's waveform opens a Web Audio graph, which is the
   * shape of an "ambient" page: muted by the silent switch, and not the session
   * a Bluetooth headset or the lock screen treats as the thing playing.
   * "playback" is what a radio is. Safari 16.4 and later; elsewhere a no-op.
   */
  const asPlayer = () => { try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch { /* older Safari */ } };
  let current = null, previous = null, live = false, status = "", isError = false, isNotice = false;
  let gen = 0, tried = [], watchdog = null;
  /**
   * What is kept while the network is away: the URL that was playing and the
   * generation it belonged to. Non-null means a hold is in effect and `online`
   * has something to put back.
   */
  let held = null;

  const channelOf = (ch) => ch && { id: ch.id, title: ch.title, place: ch.place,
    country: ch.country, lat: ch.lat, lon: ch.lon };
  let lastPlayer = null;
  const publish = () => {
    const was = lastPlayer?.playing && lastPlayer.channel?.id;
    lastPlayer = { channel: channelOf(current), status, error: isError,
      playing: live, volume: audio.volume, rssi: null,
      // A line that has to be read whole (cueAsked): the row gives it the room.
      notice: isNotice,
      sleepEndsAt: window.AuralSleep?.endsAt() || 0 };
    emit("player", lastPlayer);
    // Presence follows what is playing, as the desktop's syncNostrPresence does.
    if ((live && lastPlayer.channel?.id) !== was) chat?.sync(lastPlayer);
  };
  const setStatus = (text, err = false, notice = false) => { status = text; isError = err; isNotice = notice; publish(); };

  function applyOutput() {
    const id = getPrefs().audioOutput || "";
    audio.setSinkId?.(id).catch(() => {});
  }

  // radio-browser asks to be told when one of its stations is played; that is how
  // its rankings stay honest. Fire and forget.
  // A mirror from radio-browser's pool, as the desktop picks one (src/resolver.js):
  // it asks clients to spread across them, and one mirror down is then not play
  // down for everybody. de1 until the pool answers, and if it never does.
  let RB = "https://de1.api.radio-browser.info";
  // Every call to it ends: a server that takes the connection and never answers
  // left play spinning. AbortSignal.timeout is iOS 16+; older phones wait, as before.
  const within = (ms) => (typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(ms) : undefined);
  fetch(`${RB}/json/servers`, { signal: within(6000) }).then((r) => (r.ok ? r.json() : [])).then((list) => {
    const names = [...new Set(list.map((s) => s.name).filter((n) => /^[a-z0-9-]+\.api\.radio-browser\.info$/.test(n || "")))];
    if (names.length) RB = `https://${names[Math.floor(Math.random() * names.length)]}`;
  }).catch(() => { /* keep de1 */ });
  const reportClick = (uuid) => { if (uuid) fetch(`${RB}/json/url/${uuid}`, { signal: within(5000) }).catch(() => {}); };
  const heldText = () => M.i18n.strings(getPrefs().language, locale)["st.held"] || "Not available where you are yet";

  /**
   * A station's profile: the same files the desktop reads from disk
   * (src/profiles.js), fetched one at a time, by the same hash. The card reads
   * it, and so does play, for the stream we recorded.
   */
  const profileOf = (() => {
    const shards = new Map();
    const shardOf = (id) => {
      let h = 0x811c9dc5;
      for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 0x01000193); }
      return ((h >>> 0) & 0xff).toString(16).padStart(2, "0");
    };
    return async (id) => {
      id = String(id || ""); if (!id) return null;
      const s = shardOf(id);
      if (!shards.has(s)) shards.set(s, fetch(`data/profiles/${s}.json`).then((r) => (r.ok ? r.json() : {})).catch(() => ({})));
      return (await shards.get(s))[id] || null;
    };
  })();

  /**
   * Where a station can be heard from a web page, best first, and always the
   * station's own server: nothing here asks another directory for a redirect
   * (src/resolver.js says why). https only: an http stream is refused by the
   * browser on an https page however it is reached.
   *
   *   1. radio-browser, by the station's own id, when the catalogue matched one.
   *      Its data is openly licensed and it asks to be the source it is.
   *   2. The stream we recorded ourselves, in the station's profile.
   *   3. radio-browser by name, for a station the catalogue did not match.
   */
  async function candidates(ch) {
    const out = [];
    const add = (u) => { if (u && u.startsWith("https://") && !out.includes(u)) out.push(u); };
    // All three asked at once, and taken in this order: one lookup that times
    // out costs one timeout before play tries something, not the sum of them.
    const byId = ch.rbuuid
      ? fetch(`${RB}/json/stations/byuuid/${encodeURIComponent(ch.rbuuid)}`, { signal: within(8000) }).then((r) => r.json())
      : Promise.resolve([]);
    const ours = profileOf(ch.id);
    const q = new URLSearchParams({ name: ch.title, limit: "5", hidebroken: "true", order: "votes", reverse: "true" });
    const byName = fetch(`${RB}/json/stations/search?${q}`, { signal: within(8000) }).then((r) => r.json());
    const [id, profile, named] = await Promise.allSettled([byId, ours, byName]);
    const [s] = id.status === "fulfilled" && Array.isArray(id.value) ? id.value : [];
    if (s && s.lastcheckok !== 0) add(s.url_resolved || s.url);
    if (profile.status === "fulfilled") add(profile.value?.stream);
    if (named.status === "fulfilled" && Array.isArray(named.value)) {
      const list = named.value;
      const same = (x) => !ch.country || (x.country || "").toLowerCase() === String(ch.country).toLowerCase();
      for (const x of [...list.filter(same), ...list.filter((x) => !same(x))]) add(x.url_resolved || x.url);
    }
    return out;
  }

  async function tune(ch, { chained = false } = {}) {
    if (!ch) return;
    if (!chained) tried = [];
    const my = ++gen;
    // The station before, for "previous" on the lock screen and the headphones.
    // An auto-skip is not a choice, so it does not become somewhere to go back to.
    if (!chained && current && current.id !== ch.id) previous = current;
    current = ch;
    asPlayer();
    live = false;
    // A new choice ends any hold, and drops the URL a resume would have used.
    held = null; playingUrl = null;
    setState({ lastChannel: ch });
    // Held back where the listener is (src/region.js): not a failure, so no
    // skipping on to the next station, and no stream is looked up at all.
    await catalogReady;
    if (my !== gen) return;
    if (M.catalog.held(ch)) return setStatus(heldText(), true);
    setStatus("Finding stream…");
    reportClick(ch.rbuuid);
    const urls = await candidates(ch);
    if (my !== gen) return;
    // candidates() just failed every fetch it made; that is the network, not
    // the station, and the messages below would both be wrong about it.
    if (!navigator.onLine) return hold(my);
    // Say why, when the reason is the browser rather than the station.
    if (!urls.length && ch.secure === false) return fail("Only an insecure stream — browsers block it here");
    tryNext(urls, my);
  }

  /**
   * HLS (a stream that is a playlist of short files, .m3u8). Safari and the
   * iPhone play it themselves. Chrome and Firefox do not, so about 1,800
   * stations said "Stream unavailable here" on a computer (first seen in
   * India's list). hls.js plays them through the same <audio>. It is
   * fetched only when a station needs it: 386 KB that most listeners, on
   * iPhone, will never load.
   */
  const isHls = (url) => /\.m3u8(\?|#|$)/i.test(url);
  const nativeHls = !!audio.canPlayType("application/vnd.apple.mpegurl");
  let hls = null, hlsLib = null;
  const loadHls = () => (hlsLib ||= new Promise((ok, no) => {
    const s = document.createElement("script");
    s.src = "vendor/hls.light.min.js";
    s.onload = () => ok(window.Hls); s.onerror = () => { hlsLib = null; no(new Error("hls.js did not load")); };
    document.head.append(s);
  }));
  const dropHls = () => { if (hls) { try { hls.destroy(); } catch { /* already gone */ } hls = null; } };

  function viaHls(url, urls, my) {
    playingUrl = url;
    setStatus("Connecting…");
    watchdog = setTimeout(() => { if (my === gen && !live) tryNext(urls, my); }, 12000);
    audio.onerror = () => { if (my === gen) tryNext(urls, my); };
    loadHls().then((Hls) => {
      if (my !== gen) return;
      if (!Hls || !Hls.isSupported()) return tryNext(urls, my);
      hls = new Hls({ enableWorker: false });
      // A fatal error is the stream's, or its host refusing a page it does not
      // know (CORS): either way, the next candidate.
      hls.on(Hls.Events.ERROR, (_e, data) => { if (data.fatal && my === gen) tryNext(urls, my); });
      hls.loadSource(url);
      hls.attachMedia(audio);
      audio.play().catch((err) => {
        if (my !== gen || err.name === "AbortError") return;
        if (err.name === "NotAllowedError") { clearTimeout(watchdog); return setStatus("Press play"); }
      });
    }).catch(() => { if (my === gen) tryNext(urls, my); });
  }

  function tryNext(urls, my) {
    clearTimeout(watchdog);
    dropHls();
    if (my !== gen) return;
    // A blip is not a broken station. Spending the list here is how walking out
    // of wifi used to end on "Stream unavailable here".
    if (!navigator.onLine) return hold(my);
    const url = urls.shift();
    if (!url) return fail("Stream unavailable here");
    if (isHls(url) && !nativeHls) return viaHls(url, urls, my);
    audio.src = url;
    playingUrl = url;                 // the card's waveform samples a copy of it
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

  let playingUrl = null;

  /**
   * Keep the station while the network is away.
   *
   * `navigator.onLine` is trusted in one direction only: false means there is
   * genuinely no network, while true can still be a captive portal or a cell
   * with no data behind it. So false holds, and true falls through to the
   * ordinary failure path rather than promising something it cannot know.
   */
  function hold(my) {
    if (my !== gen) return;
    clearTimeout(watchdog);
    live = false;
    audio.pause();
    held = { url: playingUrl, gen: my };
    setStatus("Reconnecting…");
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "paused";
  }

  // A stream that is already playing stalls rather than erroring when the
  // network goes, so the event is the only warning. Everything still connecting
  // reaches hold() through tryNext instead, which is where its failure lands.
  addEventListener("offline", () => { if (live) hold(gen); });

  addEventListener("online", () => {
    if (!held || held.gen !== gen || !current) return;
    const { url } = held;
    held = null;
    // The URL that was working is the one to put back. Only when there was none
    // — the network went while the stream was still being found — is the search
    // worth running again.
    // An HLS stream in a browser that needs the library is found again from
    // the start: the library's own state did not survive the gap.
    if (!url || (isHls(url) && !nativeHls)) return tune(current);
    setStatus("Connecting…");
    audio.src = url;
    playingUrl = url;
    // The network says it is back; this says whether the stream actually is.
    watchdog = setTimeout(() => { if (!live) tune(current); }, 12000);
    audio.play().catch(() => tune(current));
  });

  function stop(said = "Stopped", notice = false) {
    gen++; clearTimeout(watchdog); live = false;
    held = null;
    playingUrl = null;
    dropHls();
    audio.pause(); audio.removeAttribute("src"); audio.load();
    setStatus(said, false, notice);
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "paused";
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
        // The lock screen draws this at the size of an album cover; without it
        // iOS shows a grey rectangle beside the station's name.
        artwork: [
          { src: "assets/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "assets/icons/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      });
      navigator.mediaSession.playbackState = "playing";
    }
  });
  audio.addEventListener("waiting", () => { if (live) setStatus("Buffering…"); });

  /**
   * A pause nobody here asked for.
   *
   * iOS pauses the page itself when AirPods come out of an ear, when the
   * Bluetooth device disconnects, for a call and for Siri. The player went on
   * saying it was live — the button showed pause, the lock screen said playing —
   * and pressing play did nothing, because as far as it knew it was playing.
   * Every pause of our own (stop, hold) clears `live` first, so a pause that
   * arrives while it is still set came from outside. It stops cleanly, and play,
   * from anywhere, tunes in again: a live station resumes at now, not where it
   * was left.
   */
  audio.addEventListener("pause", () => {
    if (!live || audio.ended) return;
    stop("Paused");
  });
  if ("mediaSession" in navigator) {
    navigator.mediaSession.setActionHandler("play", () => current && tune(current));
    navigator.mediaSession.setActionHandler("pause", () => stop());
    navigator.mediaSession.setActionHandler("stop", () => stop());
    /**
     * Next, from the lock screen and the headphones.
     *
     * A radio has no track list, so next means the next station in the place
     * you are listening to — the same thing the rail offers, reachable without
     * unlocking the phone.
     */
    navigator.mediaSession.setActionHandler("nexttrack", async () => {
      if (!current) return;
      const next = await catalogReady.then(() => M.catalog.nextInPlace(current, []));
      if (next) tune(next);
    });
    // And back: a triple press on AirPods, or ⏮ on the lock screen, returns to
    // the station before this one.
    navigator.mediaSession.setActionHandler("previoustrack", () => { if (previous) tune(previous); });
  }

  /**
   * The sleep timer (src/renderer/sleep.js), the same file the Mac's player
   * uses. The fade sets the level directly so it is never saved half-faded;
   * on an iPhone it does nothing (iOS owns the volume) and the stop is what
   * counts. `timeupdate` keeps arriving while a stream plays with the screen
   * off, when a page's own timers may not.
   */
  window.AuralSleep?.init({
    level: () => audio.volume,
    setLevel: (v) => { audio.volume = v; },
    playing: () => live || (!!playingUrl && !audio.paused),
    // A notice, so a phone's player row shows it whole: on an iPhone it
    // read "Sleep ti…", which does not say why the sound stopped.
    stop: () => stop("Sleep timer ended", true),
    changed: () => publish(),
  });
  audio.addEventListener("timeupdate", () => window.AuralSleep?.check());

  function transport({ action, value } = {}) {
    if (action === "toggle") { if (live) stop(); else if (current) tune(current); }
    else if (action === "sleep") window.AuralSleep?.set(value);
    else if (action === "volume") {
      window.AuralSleep?.userLevel(Math.max(0, Math.min(1, Number(value) || 0)));
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
    { welcome: true, title: "Radio chosen by people. Found by place.",
      body: "Spin the globe. Whatever sits under the middle is selected. "
          + "Click a dot to hear that place, live." },
    { anchor: "#layersBtn", title: "Globe layers",
      body: "Live clouds, day and night, the ISS, radio propagation, the stars." },
    { anchor: "#newsBtn", title: "Headlines",
      body: "What is being reported where your station broadcasts from." },
    { anchor: "#favBtn", title: "Favorites",
      body: "The star beside a station keeps it here, in this browser." },
    { welcome: true, title: "No algorithm. Nobody in the middle.",
      body: "Nothing is ranked or recommended. Each station plays straight from "
          + "its own server, and there is no account to listen. "
          + "Favorites and settings stay in this browser." },
  ];

  // The few desktop sentences that are about the Mac, said about a browser. Only
  // in English for now; the other languages still name macOS here.
  const WEB_EN = {
    "set.contrastHint": "Stronger text and borders. Follows your device unless you turn it on here.",
    "set.tipsHint": "Short descriptions when you rest the pointer on a control.",
    "set.mineHint": "Stations you added yourself. They stay in this browser and are never sent anywhere.",
    "set.appIconHint": "Changes the icon on your home screen.",
  };

  /**
   * The privacy line, in every language, because the desktop's is not true here.
   *
   * The desktop says "No analytics", and means it. On the web the host counts
   * page views — which page, when, the referring site and the country — the way
   * any website's host does, and the site's owner can read those counts. So the
   * web does not repeat the desktop's sentence: it says what is still true (no
   * account, nothing about what you play) and what the host sees. The other
   * languages used to fall through to the desktop line, which on the web also
   * named a Mac.
   */
  const WEB_PROMISE = {
    en: "Radio chosen by people. Found by place. No algorithm, and no account to listen. Nothing about "
      + "what you play is reported. Like any website, the host counts page views: which page, when, and "
      + "the country. Favorites, settings and your chat identity stay in this browser.",
    es: "Radio elegida por personas. Encontrada por lugar. Sin algoritmo y sin cuenta para escuchar. Nada "
      + "de lo que escuchas se comunica. Como cualquier sitio web, el servidor cuenta las visitas: qué "
      + "página, cuándo y el país. Favoritos, ajustes y tu identidad del chat se quedan en este navegador.",
    fr: "Une radio choisie par des gens, trouvée par lieu. Aucun algorithme, aucun compte pour écouter. "
      + "Rien de ce que vous écoutez n'est transmis. Comme tout site web, l'hébergeur compte les pages "
      + "vues : quelle page, quand et le pays. Favoris, réglages et votre identité de chat restent dans "
      + "ce navigateur.",
    de: "Radio, von Menschen ausgewählt. Nach Ort gefunden. Kein Algorithmus, kein Konto zum Hören. "
      + "Nichts darüber, was du hörst, wird gemeldet. Wie bei jeder Website zählt der Host "
      + "Seitenaufrufe: welche Seite, wann und das Land. Favoriten, Einstellungen und deine "
      + "Chat-Identität bleiben in diesem Browser.",
    pt: "Rádio escolhida por pessoas. Encontrada pelo lugar. Sem algoritmo e sem conta para ouvir. Nada "
      + "do que você ouve é informado. Como qualquer site, o servidor conta as visualizações: qual "
      + "página, quando e o país. Favoritos, ajustes e sua identidade no chat ficam neste navegador.",
  };

  // ── proxied sources ─────────────────────────────────────────────────────────
  M.news.setBase("/api/news");
  // World headlines come from the newsrooms' own feeds, each on its own route.
  M.news.setFeedBase("/api/feeds");
  // And their stories are read in the app through a route per newsroom.
  M.news.setReadBase("/api/read");

  // ── the bridge ──────────────────────────────────────────────────────────────
  chat = window.AuralChat ? window.AuralChat({ getPrefs, emit }) : null;
  const none = async () => null, empty = async () => [];
  const noop = () => {};
  const api = {
    // catalogue
    /**
     * The share card, in a browser.
     *
     * The desktop hands the card to AppKit — the clipboard, a save panel, a
     * deep link. A page has its own three: the clipboard's image API, a
     * download, and the address of this site. A phone uses none of them and
     * goes to the system share sheet instead (web/phone-bar.js).
     */
    cardLevels: async () => (live && playingUrl
      ? await window.AuralLevels?.sample(playingUrl).catch(() => null)
      : null),
    /**
     * Straight from the tap, with no await in front of it. Safari (and so every
     * iPhone) only lets a page copy or share inside the gesture that asked, and
     * fetching the data URL first spent it — Copy did nothing on a phone, and
     * Save fell through to opening the picture on a page of its own.
     */
    cardCopy: (dataUrl) => {
      try {
        return navigator.clipboard.write([new ClipboardItem({ "image/png": pngFile(dataUrl) })])
          .then(() => true, () => false);
      } catch { return Promise.resolve(false); }
    },
    cardSave: async (dataUrl) => {
      // A phone: the system's sheet, whose first row is Save Image. A page
      // cannot write into Photos itself; touching and holding the card can.
      const file = pngFile(dataUrl, true);
      if (matchMedia("(pointer: coarse)").matches && navigator.canShare?.({ files: [file] })) {
        try { await navigator.share({ files: [file] }); return "shared"; }
        catch (e) { if (e?.name === "AbortError") return null; }
      }
      try {
        const a = document.createElement("a");
        const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
        a.href = dataUrl; a.download = `AuralFM ${stamp}.png`;
        document.body.append(a); a.click(); a.remove();
        return a.download;
      } catch { return null; }
    },
    cardLink: async (_title, id) => {
      // The station's own link: it opens here, cued (?station=, below).
      const link = id && !String(id).startsWith("my:")
        ? `https://listen.auralfm.xyz/?station=${encodeURIComponent(id)}` : "https://listen.auralfm.xyz/";
      try { await navigator.clipboard.writeText(link); return true; }
      catch { return false; }
    },

    stats: cat(() => M.catalog.stats()),
    globePoints: cat(() => M.catalog.globePoints()),
    places: cat((q, limit, opts) => M.catalog.placeSearch(q, limit, opts || {})),
    search: cat((q, limit, filter) => M.catalog.search(q, limit, filter)),
    // Stations a browser can play first. Nothing is hidden: an http-only one may
    // still have an https copy on radio-browser, found when it is picked.
    placeChannels: cat((i, filter) => {
      const r = M.catalog.placeChannels(i, filter);
      if (r?.channels) r.channels = [...r.channels.filter((c) => c.secure), ...r.channels.filter((c) => !c.secure)];
      return r;
    }),
    placeFacets: cat((i) => ({ tags: M.catalog.placeTags(i), bands: M.catalog.placeBands(i) })),
    // Vibes (web first, web/after.js): the lanes, and the places that play one.
    vibes: cat(() => M.catalog.VIBES.map(({ id, name }) => ({ id, name }))),
    vibePlaces: cat((id) => M.catalog.vibePlaces(id)),
    stationById: cat((id) => M.catalog.byId(String(id || "")) || null),
    profile: profileOf,
    randomStation: cat(() => M.catalog.randomChannel()),
    nextStation: cat((ch, t) => M.catalog.nextInPlace(ch, t || [])),
    distance: async (aLat, aLon, bLat, bLon, units) =>
      M.geo.format(M.geo.haversine(aLat, aLon, bLat, bLon), M.geo.resolveUnits(units, locale)),
    unit: async (units) => M.geo.resolveUnits(units, locale),

    // playback
    tune, transport, onPlayerState: on("player"), playerNow: async () => lastPlayer,
    // Safari's own output picker (AirPods, Bluetooth, AirPlay); see `routes`.
    canPickOutput: () => routes,
    pickOutput: () => { try { audio.webkitShowPlaybackTargetPicker?.(); } catch { /* not Safari */ } },
    onRoutes: on("routes"),
    tuneSdr: noop, reportOk: noop, reportFailed: noop,

    // preferences, state, strings, palettes, layers
    getPrefs: async () => getPrefs(), setPrefs: async (p) => setPrefs(p), onPrefs: on("prefs"),
    getState: async () => getState(), setState: async (p) => setState(p), onStateChanged: on("state"),
    favSync: async (op, arg) => {
      if (!favsync) return { on: false, at: null, error: "offline", count: 0 };
      if (op === "start") return favsync.start();
      if (op === "join") return favsync.join(String(arg || "").slice(0, 400));
      if (op === "stop") return favsync.stop();
      if (op === "code") return favsync.code();
      if (op === "now") return favsync.sync();
      return favsync.status();
    },
    onFavSync: on("favsync"),
    strings: async () => {
      const t = M.i18n.strings(getPrefs().language, locale);
      const lang = M.i18n.resolve(getPrefs().language, locale);
      const promise = { "set.promise": WEB_PROMISE[lang] || WEB_PROMISE.en };
      return lang === "en" ? { ...t, ...WEB_EN, ...promise } : { ...t, ...promise };
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
    // Headlines come through the site's proxy route (see the manifest in
    // scripts/build-web.mjs); Google News does not let a page read it.
    news: (country) => M.news.get(country),
    // The world feeds' stories read here; anything else opens where it was
    // published (web/after.js asks this before choosing).
    readArticle: (url) => M.news.read(url),
    canReadArticle: (url) => M.news.canRead(url),

    // shortwave: not in a browser (plain ws:// receivers)
    sdrPoints: empty, sdrOnAir: empty, sdrStats: async () => ({ count: 0 }),

    // messaging: the desktop's own, see web/messaging.js
    onPeers: on("peers"), onChat: on("chat"), onNotes: on("notes"), onDms: on("dms"),
    onRtcSignal: (fn) => on("rtc")(([from, payload, at]) => fn(from, payload, at)),
    onHubMessages: on("hub"), onSocial: on("social"), onPanicWiped: on("wiped"),
    ...(chat ? chat.api : {
      presenceStats: none, presenceView: noop, chatHistory: empty, notesHistory: empty,
      dmHistory: empty, hubHistory: empty, socialList: empty, muteList: empty,
      profilesKnown: async () => ({}), filterList: async () => ({ terms: [], shipped: [] }),
    }),
    /**
     * Moving to a new install.
     *
     * An iPhone fixes some things when the icon is added to the Home Screen
     * (the status bar's style is one), so getting them means removing the icon
     * and adding it again, and that deletes everything the old one held: a
     * Home Screen app has storage of its own, which Safari cannot reach and
     * which does not survive its icon. There is no account to bring it back.
     *
     * So the old install writes what it holds as one line of text, the person
     * carries it (the clipboard, Notes, a message to themselves), and the new
     * install reads it back. What it holds: favourites and where you left
     * off, settings, the mute list, kept contacts and the word list. What it
     * never holds: a key. There is none to hold: identities here are made per
     * launch and never stored.
     */
    backupCode: async () => {
      const files = {};
      for (const f of BACKUP_FILES) { try { const v = localStorage.getItem(FS + f); if (v) files[f] = v; } catch { /* not stored */ } }
      const pack = { v: 1, app: "auralfm", at: new Date().toISOString().slice(0, 10),
        state: Object.fromEntries(STATE_KEYS.filter((k) => k in getState()).map((k) => [k, getState()[k]])),
        prefs: M.prefs.pick(read("prefs", {})), layers: read("layers", null), files };
      const bytes = new TextEncoder().encode(JSON.stringify(pack));
      let bin = ""; for (const b of bytes) bin += String.fromCharCode(b);
      return BACKUP_TAG + btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    },
    backupRestore: async (code) => {
      // Whatever came with it from the clipboard: spaces, line breaks, quotes.
      const text = String(code || "").replace(/[\s"'“”]/g, "");
      // The private listening switch (explore-shows.js) is set by a link, and a
      // Home Screen app cannot be given a link: typed here, the word does it.
      if (/^fit(off)?$/i.test(text)) {
        try { if (/off$/i.test(text)) localStorage.removeItem("auralfm.fit"); else localStorage.setItem("auralfm.fit", "1"); } catch { return { ok: false, error: "damaged" }; }
        return { ok: true, favourites: 0, flag: true };
      }
      if (/^ears(off)?$/i.test(text)) {
        try { if (/off$/i.test(text)) localStorage.removeItem("auralfm.shows.ears"); else localStorage.setItem("auralfm.shows.ears", "1"); } catch { return { ok: false, error: "damaged" }; }
        return { ok: true, favourites: 0, flag: true };
      }
      const at = text.indexOf(BACKUP_TAG);
      if (at < 0) return { ok: false, error: "notours" };
      let pack = null;
      try {
        const b64 = text.slice(at + BACKUP_TAG.length).replace(/-/g, "+").replace(/_/g, "/");
        const bin = atob(b64 + "=".repeat((4 - b64.length % 4) % 4));
        pack = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
      } catch { return { ok: false, error: "damaged" }; }
      if (!pack || pack.app !== "auralfm" || pack.v !== 1 || typeof pack.state !== "object") return { ok: false, error: "damaged" };
      // Favourites join the ones already here (the new install may have a few);
      // the rest of where-you-left-off comes from the code.
      const here = getState(), mine = Array.isArray(here.favorites) ? here.favorites : [];
      const theirs = (Array.isArray(pack.state.favorites) ? pack.state.favorites : [])
        .filter((f) => f && typeof f.id === "string" && typeof f.title === "string").slice(0, 2000);
      const favorites = [...theirs, ...mine.filter((f) => !theirs.some((x) => x.id === f.id))];
      const state = { ...here };
      for (const k of STATE_KEYS) if (k in pack.state) state[k] = pack.state[k];
      state.favorites = favorites;
      write("state", state);
      if (pack.prefs && typeof pack.prefs === "object") write("prefs", { ...read("prefs", {}), ...M.prefs.pick(pack.prefs), durableIdentity: false });
      if (pack.layers && typeof pack.layers === "object") write("layers", pack.layers);
      // A file only where this install has none of its own: a mute made here
      // since is not undone by an older list.
      for (const f of BACKUP_FILES) {
        const v = pack.files?.[f];
        if (typeof v !== "string" || v.length > 400000) continue;
        try { JSON.parse(v); if (!localStorage.getItem(FS + f)) localStorage.setItem(FS + f, v); } catch { /* not a file of ours */ }
      }
      return { ok: true, favourites: theirs.length };
    },
    // Everything this browser holds, as the desktop's Erase does: identities,
    // mutes, contacts, messages and word-list changes, then favourites and
    // history. Appearance settings stay.
    panicWipe: async () => {
      const done = chat ? chat.wipe() : [];
      const keep = getPrefs();
      // Sync off first, or its next round would fill the emptied list again.
      try { favsync?.stop(); done.push("favorites sync"); } catch { /* was not on */ }
      write("state", {});
      write("prefs", { ...keep, presence: false });
      done.push("favourites and history");
      emit("prefs", getPrefs());
      emit("state", {});
      emit("wiped");
      return done;
    },

    // not in this version: your own stations
    onMineChanged: noop,
    mineList: empty,
    mineAdd: async () => ({ ok: false, error: "Adding your own stations is not in the web version yet." }),
    // Privacy, Terms and the open source licences, from the same allowlist and
    // the same renderer the desktop reads them through. The files are inlined
    // into the bundle by scripts/build-web.mjs, so this needs no network and
    // works with none.
    docsList: async () => M.docs.list(),
    docsRead: async (id) => M.docs.read(id),

    // windows and links
    openSettings: () => window.AuralSheet?.open(),
    openExplore: () => window.open("index.html", "auralfm"),
    openLink: (url) => { if (/^https:\/\//.test(url)) window.open(url, "_blank", "noopener"); },
    openExternal: (url) => { if (/^https:\/\//.test(url)) window.open(url, "_blank", "noopener"); },
    // The globe has painted: lift the launch screen (web/launch.js).
    exploreReady: () => window.AuralLaunch?.done(),
    tipNext: none, tipDonate: noop, tipRetire: noop,
    reportError: (r) => sendReport(r),
  };

  /**
   * Error reports, only when the listener has turned them on (Settings, Privacy;
   * off by default, prefs.errorReports). errors.js sends each distinct error
   * at most three times; this adds a ceiling of ten a session, and takes out
   * anything that could say what was playing or who was listening: every
   * address that is not this app's own becomes <url> (a stream's address is a
   * station), and any 64-character key becomes <key>. Only the kind, the
   * message, the stack and the page go; nothing a caller adds. The platform is
   * one word, not the user agent. here.now keeps the list, readable by AuralFM
   * only (.herenow/data.json, written by scripts/build-web.mjs).
   */
  let reportsSent = 0;
  function redactReport(r, version, platform) {
    const own = /^https?:\/\/(listen\.auralfm\.xyz|localhost(:\d+)?|127\.0\.0\.1(:\d+)?)\//;
    const scrub = (t, n) => String(t || "")
      .replace(/\b(?:https?|wss?|blob|data):[^\s)'"]+/g, (u) => (own.test(u) ? u.replace(/[?#][^:\s)]*/, "") : "<url>"))
      .replace(/\b[0-9a-f]{64}\b/gi, "<key>")
      .slice(0, n);
    return {
      where: scrub(r?.where, 40), message: scrub(r?.message, 300), stack: scrub(r?.stack, 2000),
      page: scrub(r?.page, 60), repeat: Math.max(1, Math.min(99, Math.round(+r?.repeat || 1))),
      build: String(version || "").slice(0, 40), platform,
    };
  }
  function sendReport(r) {
    if (getPrefs().errorReports !== true || reportsSent >= 10) return;
    reportsSent++;
    const ua = navigator.userAgent;
    const platform = /iPhone|iPad|iPod/.test(ua) ? "ios" : /Android/.test(ua) ? "android"
      : /Mac/.test(ua) ? "mac" : /Windows/.test(ua) ? "windows" : "other";
    const body = { ...redactReport(r, VERSION, platform), standalone: matchMedia("(display-mode: standalone)").matches };
    fetch(".herenow/data/errors", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(body), keepalive: true, signal: within(8000) }).catch(() => { /* a report must never become an error */ });
  }

  /** A data: URL as a PNG, made synchronously so it can be used inside a tap. */
  function pngFile(dataUrl, named) {
    const bin = atob(String(dataUrl).split(",")[1] || "");
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return named ? new File([bytes], "AuralFM.png", { type: "image/png" }) : new Blob([bytes], { type: "image/png" });
  }

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
    const q = new URLSearchParams(location.search);
    const asked = q.get("station");
    if (asked) return cueAsked(asked, q.has("play"));
    const saved = getState().lastChannel;
    if (saved) { current = saved; setStatus("Press play"); }
    else cueHome();
  });

  /**
   * A shared card's link: listen.auralfm.xyz/?station=<id>.
   *
   * The code on a share card opens the station it names, cued and paused —
   * sound is still something the listener starts — with the globe gone to its
   * place and its card open. A station that has left the catalogue falls back
   * to the usual first visit rather than an empty player.
   *
   * &play=1 is our own Play button (the site's station pages): the listener
   * has asked, so the station starts. A browser may still refuse sound on a
   * page nobody has touched yet; tune() then leaves it at "Press play", and
   * the first press anywhere on the page starts it. Not a press on the play
   * button itself, which does its own job.
   */
  async function cueAsked(id, wantsPlay = false) {
    await catalogReady;
    const ch = M.catalog.byId(String(id));
    if (!ch || (!ch.secure && location.protocol === "https:")) {
      /**
       * Say so. The link named a station and the app opened on another one
       * with no word about it, which reads as the link being wrong. A station
       * with only an http stream cannot play on an https page (the catalogue
       * leaves it out of every list here), and one that has left the
       * catalogue is not anywhere. The line stays until the listener presses
       * something.
       */
      // Short enough to be read whole in a phone's player row (about 150pt).
      const why = ch ? "Not playable here" : "No longer listed";
      const saved = getState().lastChannel;
      if (saved) current = saved; else await cueHome();
      setStatus(why, false, true);
      return;
    }
    current = ch;
    setStatus("Press play");
    const show = () => (document.getElementById("launch") ? setTimeout(show, 400) : window.AuralOpenStation?.(ch));
    show();
    if (!wantsPlay) return;
    tune(ch);
    addEventListener("click", (e) => {
      if (audio.paused && current === ch && !e.target.closest?.("#play")) tune(ch);
    }, { once: true, capture: true });
  }

  /**
   * A first visit opens with something to press play on.
   *
   * A returning listener gets their last station back, paused, and the phone
   * then rests with the sheet tucked away and the globe clear. A first visit
   * had nothing to put in that row, so the sheet stood up as a list of cities
   * instead — the one screen a new listener sees, spent on a table.
   *
   * The station is the listener's own city's strongest one that a browser can
   * play, found the way the globe finds where to open: from the time zone, which
   * costs no permission prompt and no coordinates. Cued, never played — sound is
   * still something the listener starts.
   */
  async function cueHome() {
    await catalogReady;
    if (current) return;                        // something was picked meanwhile
    let tz = "";
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch {}
    const city = tz.split("/").pop()?.replace(/_/g, " ") || "";
    const hit = city && M.catalog.placeSearch(city, 1)?.places?.[0];
    if (!hit) return;
    const { channels = [] } = M.catalog.placeChannels(hit.i) || {};
    const pick = channels.find((c) => c.secure && c.ok !== false) || channels.find((c) => c.secure);
    if (pick && !current) { current = pick; setStatus("Press play"); }
  }
})();
