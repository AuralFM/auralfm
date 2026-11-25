/**
 * The listening room: the app's globe, on a ceiling.
 *
 * The same globe as Explore, in a room: the Blue Marble, the night side with
 * the city lights when "Day and night" is on, the stars behind, every town that
 * broadcasts as a dot in the theme's colour, and the slow drift. It is a
 * backdrop. When a station plays, the globe turns to its town and rings it,
 * holds there for a while, and drifts on.
 *
 * The room plays nothing. It asks main to tune, main forwards to the popover,
 * and the popover's one <audio> element is the sound (src/main/ipc-room.js).
 * It is steered from Explore's room panel (explore-room.js); a few keys work
 * here too, for a host standing at the projector.
 *
 * Four ways to run a session:
 *   Follow      the room goes wherever the app plays.
 *   Favourites  the listener's own favourites, one after another.
 *   Drift       a station somewhere else every few minutes, the catalogue's own
 *               random choice of one that plays.
 *   Dial        the world west to east in stops; where it rests, that town plays.
 * In each, what comes next is chosen ahead and said ("up next"), so nobody is
 * left guessing where the room goes.
 *
 * A live stream takes two to four seconds to start, so the tune is asked for
 * the moment the globe starts to turn, and the town arrives with its sound.
 */
(() => {
  const $ = (id) => document.getElementById(id);
  const api = window.auralfm;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const NOWHERE = /^(Across |Somewhere in |Online, no country$|Online only$)/;

  let globe = null;
  let layers = { dayNight: true, stations: true, drift: true };
  let palette = { dot: "#02E8CD", atmosphere: "#8AB4F8" };
  let points = [];

  // ── the globe ──────────────────────────────────────────────────────────────
  function loadScript(src) {
    return new Promise((ok, no) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = no; document.head.append(s); });
  }
  function loadTexture(url, TexClass, like) {
    return new Promise((ok, no) => {
      const img = new Image();
      img.onload = () => {
        const t = new TexClass(img);
        if (like) { t.wrapS = like.wrapS; t.wrapT = like.wrapT; t.colorSpace = like.colorSpace; t.flipY = like.flipY; t.minFilter = like.minFilter; t.magFilter = like.magFilter; }
        t.needsUpdate = true;
        ok(t);
      };
      img.onerror = () => no(new Error(url));
      img.src = url;
    });
  }
  const waitFor = (get, ms = 15000) => new Promise((ok, no) => {
    const t0 = Date.now();
    (function poll() { const v = get(); if (v) return ok(v); if (Date.now() - t0 > ms) return no(new Error("timed out")); setTimeout(poll, 50); })();
  });

  /** Where the sun is overhead: the globe's own arithmetic (explore-globe.js, subsolarPoint). */
  function subsolar(date = new Date()) {
    const rad = Math.PI / 180;
    const day = (date - Date.UTC(date.getUTCFullYear(), 0, 0)) / 86400000;
    const decl = -23.44 * Math.cos(rad * (360 / 365) * (day + 10));
    const B = rad * (360 / 365) * (day - 81);
    const eq = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
    const h = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
    return { lat: decl, lng: ((-15 * (h - 12 + eq / 60) + 180) % 360 + 360) % 360 - 180 };
  }
  function sunVector() {
    const { lat, lng } = subsolar();
    const c = globe.getCoords(lat, lng, 0);
    const n = Math.hypot(c.x, c.y, c.z) || 1;
    return { x: c.x / n, y: c.y / n, z: c.z / n };
  }

  /**
   * The night side: the shader Explore's globe uses (explore-globe.js,
   * applyDayNight), without the live satellite layer, which a backdrop does not
   * need. The city lights warm and soft; ten degrees of dusk at the terminator.
   */
  async function dayNight() {
    const mat = globe.globeMaterial();
    const dayTex = await waitFor(() => mat.map);
    const TexClass = dayTex.constructor;
    const [nightTex, bumpTex, lightsTex] = await Promise.all([
      loadTexture("vendor/earth-night.jpg", TexClass, dayTex),
      loadTexture("vendor/earth-topology.png", TexClass, dayTex).catch(() => null),
      loadTexture("vendor/earth-lights.jpg", TexClass, dayTex).catch(() => null),
    ]);
    if (bumpTex) { mat.bumpMap = bumpTex; mat.bumpScale = 4; }
    mat.shininess = 6;
    mat.color?.setHex?.(0xffffff);
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.nightMap = { value: nightTex };
      shader.uniforms.lightsMap = { value: lightsTex || nightTex };
      shader.uniforms.hasLights = { value: lightsTex ? 1 : 0 };
      shader.uniforms.dayNightOn = { value: layers.dayNight === false ? 0 : 1 };
      shader.uniforms.sunDirection = { value: sunVector() };
      shader.vertexShader = "varying vec3 vGlobeNormal;\nvarying vec2 vGlobeUv;\n" + shader.vertexShader
        .replace("void main() {", "void main() {\n  vGlobeNormal = normalize(mat3(modelMatrix) * position);\n  vGlobeUv = uv;");
      shader.fragmentShader =
        "uniform sampler2D nightMap;\nuniform sampler2D lightsMap;\nuniform float hasLights;\nuniform float dayNightOn;\nuniform vec3 sunDirection;\nvarying vec3 vGlobeNormal;\nvarying vec2 vGlobeUv;\n" +
        shader.fragmentShader.replace("#include <opaque_fragment>", `#include <opaque_fragment>
          vec3 n = normalize(vGlobeNormal);
          vec3 dayC = texture2D(map, vGlobeUv).rgb;
          vec3 nightC = texture2D(nightMap, vGlobeUv).rgb;
          if (hasLights > 0.5) {
            float lit = texture2D(lightsMap, vGlobeUv).r;
            nightC = dayC * 0.055 + vec3(1.0, 0.78, 0.50) * pow(lit, 0.80) * 2.0;
          }
          float cosSun = dot(n, normalize(sunDirection));
          float t = mix(1.0, smoothstep(-0.09, 0.09, cosSun), dayNightOn);
          vec3 col = mix(nightC * 1.6, dayC, t);
          col += vec3(0.075, 0.032, 0.0) * max(0.0, 1.0 - abs(cosSun) * 22.0) * dayNightOn;
          gl_FragColor = vec4(col, gl_FragColor.a);`);
      mat.userData.shader = shader;
    };
    mat.needsUpdate = true;
  }
  function applyLayers() {
    const sh = globe?.globeMaterial()?.userData?.shader;
    if (sh) { sh.uniforms.dayNightOn.value = layers.dayNight === false ? 0 : 1; sh.uniforms.sunDirection.value = sunVector(); }
    globe?.pointsData(layers.stations === false ? [] : points);
    drift(true);
  }

  async function buildGlobe() {
    await loadScript("vendor/globe.gl.min.js");
    globe = Globe()($("globe"))
      .globeImageUrl("vendor/earth-blue-marble.jpg")
      .backgroundImageUrl("vendor/night-sky.png")
      .showAtmosphere(true)
      .atmosphereColor(palette.atmosphere || "#8AB4F8")
      .atmosphereAltitude(0.17)
      .pointsData(layers.stations === false ? [] : points)
      .pointLat("lat").pointLng("lng")
      .pointColor(() => palette.dot || "#02E8CD")
      .pointRadius((d) => 0.09 + Math.sqrt(d.count) * 0.013)
      .pointAltitude(0.002)
      .pointsMerge(true)
      .pointLabel(() => "")
      // The town playing: bone rings, wide and slow, as Explore rings a listener.
      .ringsData([])
      .ringLat("lat").ringLng("lng")
      .ringMaxRadius(3.6).ringPropagationSpeed(0.8).ringRepeatPeriod(2200).ringAltitude(0.02)
      .ringColor(() => (t) => `rgba(247,244,238,${0.8 * (1 - t)})`)
      .width(innerWidth).height(innerHeight);
    const c = globe.controls();
    c.enableZoom = false; c.enablePan = false;
    c.autoRotateSpeed = 0.18; c.enableDamping = true; c.dampingFactor = 0.08;
    globe.pointOfView({ lat: 18, lng: 10, altitude: 2.4 }, 0);
    drift(true);
    await dayNight().catch(() => {});
    // The sun moves: the terminator follows each minute.
    setInterval(() => { const sh = globe.globeMaterial()?.userData?.shader; if (sh) sh.uniforms.sunDirection.value = sunVector(); }, 60000);
  }

  // The slow drift, as Explore's ("Drift" layer), held while a town has just arrived.
  let holdUntil = 0;
  const HOLD_MS = 45000;
  function drift(on) {
    if (!globe) return;
    globe.controls().autoRotate = !reduced && layers.drift !== false && on && Date.now() >= holdUntil;
  }
  setInterval(() => drift(true), 1000);

  /** Turn to a town, the shorter way, and hold on it while it plays. */
  function turnTo(lat, lng) {
    if (!globe) return;
    holdUntil = Date.now() + HOLD_MS;
    drift(false);
    globe.pointOfView({ lat, lng, altitude: 1.7 }, reduced ? 0 : 2600);
  }

  // ── the words ──────────────────────────────────────────────────────────────
  function localTime(lng) {
    const now = new Date();
    const h = (((now.getUTCHours() * 60 + now.getUTCMinutes() + lng * 4) / 60) % 24 + 24) % 24;
    return `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.floor((h % 1) * 60)).padStart(2, "0")} ${h >= 6 && h < 18 ? "day" : "night"}`;
  }
  /**
   * A town's name, or the country's for a station that has no town ("Across
   * the United States" is "United States": nobody says the "the" aloud).
   */
  const countryName = (c) => String(c || "").replace(/^the\s+/i, "");
  const nowhere = (ch) => NOWHERE.test(String(ch?.place || "")) || !ch?.place;
  const nameOf = (ch) => (nowhere(ch) ? countryName(ch?.country) || "On air" : String(ch.place));

  let pending = null, pendingAt = 0, last = null, upNext = null;
  function paintWords() {
    const ch = pending || (last?.channel && Number.isFinite(last.channel.lat) ? last.channel : null);
    $("here").hidden = !ch;
    $("wait").hidden = !!ch;
    if (ch) {
      const tuning = !!pending || !last?.playing;
      $("eyebrow").classList.toggle("tuning", tuning);
      $("eyetext").textContent = [tuning ? "Tuning" : "Live", nowhere(ch) ? "Nationwide" : countryName(ch.country), Number.isFinite(ch.lon) ? localTime(ch.lon) : ""].filter(Boolean).join(" · ");
      $("town").textContent = nameOf(ch);
      $("station").textContent = ch.title || "";
    }
    $("next").textContent = upNext ? `Up next · ${nameOf(upNext)}` : "";
  }

  // ── the player is the truth ────────────────────────────────────────────────
  const heard = [];
  let shown = null;
  function onPlayer(state) {
    last = state || null;
    const ch = state?.channel && Number.isFinite(state.channel.lat) && Number.isFinite(state.channel.lon) ? state.channel : null;
    if (pending && ch && ch.id === pending.id && state.playing) pending = null;
    if (pending && Date.now() - pendingAt > 12000) pending = null;
    paintWords();
    if (!ch || ch.id === shown) return;
    shown = ch.id;
    if (heard[heard.length - 1]?.id !== ch.id) heard.push(ch);
    globe?.ringsData([{ lat: ch.lat, lng: ch.lon }]);
    if (!pending) turnTo(ch.lat, ch.lon);
    say(`${nameOf(ch)}. ${ch.title || ""}`);
    if (mode !== "follow" && mode !== "dial") chooseNext();
    status();
  }

  /** Ask for a station and start turning at the same moment, so they land together. */
  async function go(ch) {
    if (!ch) return false;
    if (!Number.isFinite(ch.lat) || !Number.isFinite(ch.lon)) {
      const found = await api.stationById?.(ch.id).catch(() => null);
      if (found) ch = { ...found, ...ch, lat: found.lat, lon: found.lon };
    }
    if (!Number.isFinite(ch.lat) || !Number.isFinite(ch.lon)) return false;
    pending = ch; pendingAt = Date.now();
    paintWords();
    api.tune(ch);
    globe?.ringsData([{ lat: ch.lat, lng: ch.lon }]);
    turnTo(ch.lat, ch.lon);
    return true;
  }

  // ── favourites ─────────────────────────────────────────────────────────────
  let favourites = [], favAt = -1;
  const usable = (list) => (Array.isArray(list) ? list.filter((f) => f && f.id && !String(f.id).startsWith("sdr:")) : []);
  async function readFavourites() {
    const st = await api.getState?.().catch(() => null);
    favourites = usable(st?.favorites);
  }
  api.onStateChanged?.((s) => { if (Array.isArray(s?.favorites)) { favourites = usable(s.favorites); status(); } });

  // ── what the host can do ───────────────────────────────────────────────────
  const MODES = { follow: "Follow", favs: "Favorites", drift: "Drift", dial: "Dial" };
  let mode = "follow", driftMin = 4, driftTimer = null, driftAt = 0;
  const say = (words) => { $("said").textContent = words; };

  /** Choose what comes next now, so it can be said before it plays. */
  async function chooseNext() {
    if (mode === "favs") {
      if (!favourites.length) await readFavourites();
      const at = favourites.findIndex((f) => f.id === last?.channel?.id);
      if (at >= 0) favAt = at;
      upNext = favourites.length ? favourites[(favAt + 1) % favourites.length] : null;
    } else if (mode === "drift") {
      upNext = await api.randomStation().catch(() => null);
    } else upNext = null;
    paintWords(); status();
  }

  async function nextTown() {
    if (mode === "dial") return turn(1);
    if (mode === "drift" || mode === "favs") driftAt = Date.now() + driftMin * 60000;
    if (!upNext && mode !== "follow") await chooseNext();
    const ch = mode === "follow" ? await api.randomStation().catch(() => null) : upNext;
    if (mode === "favs" && ch) favAt = favourites.indexOf(ch);
    upNext = null;
    await go(ch);
    status();
  }
  function townBefore() {
    if (mode === "dial") return turn(-1);
    const nowId = last?.channel?.id;
    const at = heard.map((c) => c.id).lastIndexOf(nowId);
    const prev = heard[(at > 0 ? at : heard.length) - 1];
    if (prev && prev.id !== nowId) { heard.splice(at > 0 ? at : heard.length - 1); go(prev); }
  }
  /** The next station in the same town, round and back to the first (catalog.nextInPlace). */
  let hereTried = { key: "", ids: [] };
  async function nextHere() {
    const ch = last?.channel;
    if (!ch || ch.sdr) return;
    const key = `${ch.place}|${ch.country}`;
    if (hereTried.key !== key) hereTried = { key, ids: [] };
    if (!hereTried.ids.includes(ch.id)) hereTried.ids.push(ch.id);
    let n = await api.nextStation(ch, hereTried.ids).catch(() => null);
    if (!n) { hereTried.ids = [ch.id]; n = await api.nextStation(ch, hereTried.ids).catch(() => null); }
    if (n) go({ ...n, lat: n.lat ?? ch.lat, lon: n.lon ?? ch.lon, place: n.place ?? ch.place, country: n.country ?? ch.country });
  }
  /** One favourite, chosen by hand in the panel. */
  async function playOne(id) {
    if (!favourites.length) await readFavourites();
    const f = favourites.find((x) => x.id === id);
    if (!f) return;
    favAt = favourites.indexOf(f);
    if (mode === "drift" || mode === "favs") driftAt = Date.now() + driftMin * 60000;
    await go(f);
  }

  function status() {
    const timed = mode === "drift" || mode === "favs";
    const left = timed ? Math.max(0, Math.round((driftAt - Date.now()) / 1000)) : 0;
    $("mode").textContent = timed ? `${MODES[mode]} · next ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : MODES[mode];
    api.roomStatus?.({
      mode, driftMin, left,
      upNext: upNext ? { id: upNext.id, title: upNext.title || "", place: nameOf(upNext) } : null,
      favourites: favourites.slice(0, 200).map((f) => ({ id: f.id, title: f.title || "", place: nameOf(f) })),
    });
  }

  async function setMode(next) {
    if (!MODES[next]) return;
    mode = next;
    say(MODES[next]);
    clearInterval(driftTimer); driftTimer = null;
    upNext = null;
    if (mode === "favs") await readFavourites();
    if (mode === "drift" || mode === "favs") {
      // Starts at once, then every few minutes; what comes next is chosen ahead.
      nextTown();
      driftTimer = setInterval(() => { if (Date.now() >= driftAt) nextTown(); else status(); }, 1000);
    }
    if (mode === "dial") dialStart();
    paintWords(); status();
  }
  function setDrift(min) {
    driftMin = Math.max(1, Math.min(30, Math.round(min)));
    if (mode === "drift" || mode === "favs") driftAt = Math.min(driftAt, Date.now() + driftMin * 60000);
    status();
  }

  api.onRoomCommand?.((c) => {
    if (c?.cmd === "mode") setMode(c.arg);
    else if (c?.cmd === "next") nextTown();
    else if (c?.cmd === "prev") townBefore();
    else if (c?.cmd === "here") nextHere();
    else if (c?.cmd === "drift") setDrift(Number(c.arg) || driftMin);
    else if (c?.cmd === "play") playOne(String(c.arg || ""));
    else if (c?.cmd === "status") readFavourites().then(status);
  });

  // ── the dial ───────────────────────────────────────────────────────────────
  // The world west to east in slices of two degrees, each the town with the most
  // stations in it: about 150 stops round the Earth, the way a dial has stops.
  let stops = [], at = 0, restTimer = null;
  function buildStops() {
    const best = new Map();
    for (const p of points) {
      const k = Math.floor((p.lng + 180) / 2);
      const b = best.get(k);
      if (!b || p.count > b.count) best.set(k, p);
    }
    stops = [...best.entries()].sort((a, b) => a[0] - b[0]).map(([, p]) => p);
  }
  function dialStart() {
    if (!stops.length || !globe) return;
    const lng = globe.pointOfView().lng;
    at = stops.reduce((bi, p, n) => (Math.abs(p.lng - lng) < Math.abs(stops[bi].lng - lng) ? n : bi), 0);
  }
  async function turn(by) {
    if (mode !== "dial") await setMode("dial");
    if (!stops.length) return;
    at = (at + by + stops.length) % stops.length;
    const p = stops[at];
    holdUntil = Date.now() + HOLD_MS; drift(false);
    globe?.pointOfView({ lat: p.lat, lng: p.lng, altitude: 1.9 }, reduced ? 0 : 500);
    const r = await api.placeChannels(p.i).catch(() => null);
    const ch = r?.channels?.find((c) => c.ok !== false) || r?.channels?.[0];
    const full = ch && { ...ch, lat: ch.lat ?? p.lat, lon: ch.lon ?? p.lng, place: ch.place ?? r.place?.title, country: ch.country ?? r.place?.country };
    if (stops[at] !== p) return;               // turned on past it while asking
    if (full) { pending = full; pendingAt = Date.now(); paintWords(); }
    clearTimeout(restTimer);
    restTimer = setTimeout(() => { if (full) go(full); }, 700);   // where it rests, it plays
  }

  // A MIDI knob: a small step per click (1 or 65 one way, 127 or 63 the other),
  // or a position, read as the change since the knob's last message.
  const lastCC = new Map();
  function knob(key, v) {
    const prev = lastCC.get(key);
    lastCC.set(key, v);
    if (v >= 1 && v <= 3) return 1;
    if (v >= 125) return -1;
    if (v >= 65 && v <= 67) return prev === undefined || Math.abs(v - prev) <= 2 ? 1 : Math.sign(v - prev);
    if (v >= 61 && v <= 63) return prev === undefined || Math.abs(v - prev) <= 2 ? -1 : Math.sign(v - prev);
    return prev === undefined ? 0 : Math.sign(v - prev);
  }
  async function wireMidi() {
    if (!navigator.requestMIDIAccess) return;
    try {
      const midi = await navigator.requestMIDIAccess();
      const listen = (input) => { input.onmidimessage = (m) => {
        const [st, cc, v] = m.data;
        if ((st & 0xf0) !== 0xb0) return;
        const by = knob(`${input.id}:${st & 0x0f}:${cc}`, v);
        if (by) turn(by);
      }; };
      midi.inputs.forEach(listen);
      midi.onstatechange = (e) => { if (e.port.type === "input" && e.port.state === "connected") listen(e.port); };
    } catch { /* no MIDI; the panel and the keys still steer */ }
  }

  // ── keys, for a host at the projector ──────────────────────────────────────
  // Hidden by default: the ceiling is a backdrop. H shows them, H again hides.
  let keysPinned = false;
  addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
    const k = e.key.toLowerCase();
    if (k === "h" || k === "?") { keysPinned = !keysPinned; $("keys").classList.toggle("gone", !keysPinned); return; }
    if (k === "escape") { api.roomClose(); return; }
    if (k === "f") setMode("follow");
    else if (k === "v") setMode("favs");
    else if (k === "d") setMode("drift");
    else if (k === "k") setMode("dial");
    else if (k === "arrowright") nextTown();
    else if (k === "arrowleft") townBefore();
    else if (k === "arrowup" || k === "arrowdown") nextHere();
    else if (k === " ") api.roomPlayPause();
    else return;
    e.preventDefault();
  });
  let wheel = 0;
  addEventListener("wheel", (e) => {
    wheel += e.deltaY + e.deltaX;
    while (Math.abs(wheel) >= 60) { turn(Math.sign(wheel)); wheel -= Math.sign(wheel) * 60; }
  }, { passive: true });
  let idleTimer = null;
  addEventListener("pointermove", () => {
    document.body.classList.remove("idle");
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => document.body.classList.add("idle"), 2500);
  });
  addEventListener("resize", () => globe?.width(innerWidth).height(innerHeight));

  // ── start ──────────────────────────────────────────────────────────────────
  (async () => {
    const [raw, lay, pal] = await Promise.all([
      api.globePoints().catch(() => []),
      api.layers?.().catch(() => null),
      api.palette?.().catch(() => null),
    ]);
    points = (raw || []).map(([i, lng, lat, count]) => ({ i, lng, lat, count })).filter((p) => Number.isFinite(p.lng) && Number.isFinite(p.lat));
    if (lay) layers = { ...layers, ...lay };
    if (pal) palette = { ...palette, ...pal };
    buildStops();
    await buildGlobe();
    api.onLayers?.((l) => { if (l) { layers = { ...layers, ...l }; applyLayers(); } });
    api.onPrefs?.(async () => {
      const p = await api.palette?.().catch(() => null);
      if (p) { palette = { ...palette, ...p }; globe?.atmosphereColor(palette.atmosphere).pointColor(() => palette.dot); }
    });
    await readFavourites();
    api.onPlayerState(onPlayer);
    onPlayer(await api.playerNow().catch(() => null));
    status();
    wireMidi();
  })();
})();
