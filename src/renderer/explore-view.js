/**
 * Explore, part 6 of 17: Building the globe, and moving around it: readouts, level of detail, drift, camera follow, layer visibility.
 *
 * Explore is one page split across plain scripts that share a global scope, in
 * the order explore.html loads them. Declarations live here; anything that runs
 * at load — listeners, IPC subscriptions, one-off calls — is in wireView(),
 * which explore.js calls once every part has loaded. That keeps the original
 * single-file behaviour: no handler can fire into a part that has not loaded.
 */

/**
 * The line under the globe.
 *
 * It used to open with the subsolar point — a real fact, and one almost nobody
 * can use. "17.2°N 134.3°W" is the answer to a question a listener has not asked.
 *
 * So it now leads with the thing that changes as you move, which is what makes a
 * read-out worth glancing at: where you are looking, and whether it is day or
 * night there. The astronomy follows, quieter, for whoever wants it.
 *
 * Solar time from longitude rather than a timezone database, the same arithmetic
 * the terminator uses — so this line and the darkness on the globe can never
 * disagree, which they would if one followed politics and the other the sun.
 */
function paintGlobeReadout(sunLat, sunLng, m, phase, glyph) {
  const el = $("sunreadout");
  if (!el) return;
  const fmt = (v, pos, neg) => `${Math.abs(v).toFixed(1)}°${v >= 0 ? pos : neg}`;
  const bits = [];

  const here = selection.place || (sdrSel ? { title: sdrSel.loc || sdrSel.name,
                                             lat: sdrSel.lat, lon: sdrSel.lng } : null);
  if (here && Number.isFinite(here.lat) && Number.isFinite(here.lon)) {
    const now = new Date();
    const h = (((now.getUTCHours() * 60 + now.getUTCMinutes() + here.lon * 4) / 60) % 24 + 24) % 24;
    const hh = String(Math.floor(h)).padStart(2, "0");
    const mm = String(Math.floor((h % 1) * 60)).padStart(2, "0");
    // Civil twilight either side, matching the terminator's own softness.
    const lit = h >= 6 && h < 18;
    // Escaped: for a receiver this is the operator's own name for it, crawled
    // from a public list, and it is going into innerHTML.
    const title = String(here.title ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
    bits.push(`<b>${title}</b> ${hh}:${mm} ${lit ? t("readout.day", "day") : t("readout.night", "night")}`);
  }

  bits.push(`${glyph} <b>${phase} ${Math.round(m.illum * 100)}%</b>`);
  bits.push(`&#9788;&#xFE0E; ${fmt(sunLat, "N", "S")} ${fmt(sunLng, "E", "W")}`);
  el.innerHTML = bits.join(" &nbsp;·&nbsp; ");
}

async function initGlobe() {
  await loadGlobeLib();
  const raw = await window.auralfm.globePoints();      // [i, lon, lat, count]
  globePts = raw.map(([i, lng, lat, count]) => ({ i, lng, lat, count }));

  const accent = css("--accent") || "#E9E2D4";
  const el = $("globe");

  globe = Globe()(el)
    // Textures are vendored from three-globe, so the real Earth costs no network.
    .globeImageUrl(texUrl("earth-blue-marble.jpg"))
    // Sky is drawn from a real catalogue below; start on the vendored texture so
    // there is never a blank frame.
    .backgroundImageUrl(texUrl("night-sky.png"))
    .showGlobe(true)
    .showAtmosphere(true)
    .atmosphereColor(palette?.atmosphere || "#8ab4f8")
    .atmosphereAltitude(0.17)
    // Empty, not globePts: the globe shows a budget of about 700 dots chosen
    // by applyLod(), and the first applyLod(true) below replaces whatever is
    // here. Handing it all 12,253 first meant building them into one merged
    // mesh (the single biggest block of the launch after the city lights) only
    // to throw it away a moment later.
    .pointsData([])
    .pointLat("lat").pointLng("lng")
    // Amber for receivers so they read as a different kind of thing entirely —
    // these are antennas, not places, and conflating them would be a lie.
    .pointColor((d) => d.kind === "sdr"
      ? (sdrSel && sdrSel.host === d.host ? "#ffffff" : (palette?.rx || "#ffb340"))
      : (d.i === selection.placeIndex ? "#ffffff" : (palette?.dot || "#5ef08a")))
    .pointLabel((d) => d.label)
    // Near-flat discs, not columns. Extruded points turn the limb into fuzz and
    // read as noise rather than geography.
    // Size comes from dotRadius() so the Settings toggle can change it. Smaller
    // than they were: at full zoom 12,296 dots merge into a haze and
    // picking one is a fight; the fix is fewer, tighter dots plus level-of-detail
    // below, not a bigger hit target — "Large" is there for people who need it.
    // The selected place has to be findable in a field of a thousand dots, so it
    // is drawn much larger than anything around it rather than merely paler.
    .pointRadius((d) => {
      // 0.14, not 0.28. A station dot is 0.09 + sqrt(count) * 0.013, so a place
      // with three stations draws at about 0.11 — the receivers were two and a
      // half times bigger than the thing they sit among, which is why a click in
      // dense western Europe landed on a receiver you were not aiming at. They
      // still need to be findable; colour does that job, and size was doing it
      // twice.
      if (d.kind === "sdr") return (sdrSel && sdrSel.host === d.host) ? 0.7 : 0.14;
      return d.i === selection.placeIndex ? 0.8 : dotRadius(d);
    })
    .pointAltitude((d) =>
      (d.i === selection.placeIndex || (sdrSel && sdrSel.host === d.host)) ? 0.012 : 0.002)
    // Merged into one geometry: unmerged, 12,296 points cost 12,298 draw calls
    // per frame. Merged it is ~3. The tradeoff is that changing a point's colour
    // means rebuilding the layer, which only happens on selection.
    .pointsMerge(true)
    .pointLabel((d) => d.kind === "sdr"
      ? `${d.loc || d.name} · shortwave receiver`
      : `${d.count} station${d.count === 1 ? "" : "s"}`)
    // NOT .onPointClick — see pickPoint(). pointsMerge collapses every dot into
    // one mesh, so globe.gl raycasts that single object and hands the callback
    // the entire data array rather than the dot under the cursor. Wiring it up
    // meant every click on the globe selected an arbitrary place.
    ;

  // Before setupDayNight: the read-outs are global facts about the sun, the moon
  // and the ISS, and none of them needs the Earth texture to have arrived.
  mountReadouts();
  updateSun();
  await setupDayNight();
  // A slow drift — the Earth is never truly still, and a dead-static globe reads
  // as a screenshot. Slow enough not to fight you while you aim.
  //
  // Set from the layer, not to `true`. Hardcoding it here meant the globe always
  // span on launch no matter what Slow Rotation was set to, and the only thing
  // that could stop it was toggling the layer *on* and then off again — so the
  // control appeared to work backwards.
  globe.controls().autoRotate = !!layers.drift;
  globe.controls().autoRotateSpeed = 0.18;
  globe.controls().enableDamping = true;
  globe.controls().dampingFactor = 0.08;
  globe.controls().rotateSpeed = 0.75;
  globe.controls().addEventListener("change", onCameraChange);
  // A hand on the globe is browsing again, whatever was holding the rail.
  globe.controls().addEventListener("start", () => { holdCentre = false; });
  applyLod(true);

  // Stop the idle spin as soon as the user grabs it — autorotate fighting a drag
  // is the fastest way to make a globe feel broken.
  // Pause the drift while you're actually handling it, then let it resume.
  /**
   * Hit-testing, in screen space, because globe.gl cannot do it for us.
   *
   * `pointsMerge` merges 13,000 dots into a single mesh — without it the globe
   * ran at 5fps — and a merged mesh has no per-dot geometry to raycast against.
   * So we project every visible dot to the screen and take the nearest one
   * within a finger's width of the cursor.
   *
   * Doing it in pixels rather than degrees is what makes a dense region usable:
   * zoomed out over Europe the dots are on top of each other and you get the
   * nearest, zoomed into Los Angeles they are far apart and you get exactly the
   * one you aimed at. The threshold never has to change.
   */
  const HIT_PX = 14;
  function pickPoint(ev) {
    const data = globe.pointsData();
    if (!data.length) return null;
    const rect = el.getBoundingClientRect();
    const x = ev.clientX - rect.left, y = ev.clientY - rect.top;
    let best = null, bestD = HIT_PX * HIT_PX;
    for (const d of data) {
      const c = globe.getScreenCoords(d.lat, d.lng, 0.002);
      if (!c || c.x == null) continue;
      // Points on the far side project onto the disc too; getScreenCoords does
      // not tell us, so drop anything behind the horizon by comparing against
      // the camera's sub-point.
      const dx = c.x - x, dy = c.y - y;
      const dd = dx * dx + dy * dy;
      if (dd < bestD) { bestD = dd; best = d; }
    }
    return best;
  }

  /** True when a lat/lng faces the camera — the far hemisphere must not be clickable. */
  function facing(lat, lng) {
    const pov = globe.pointOfView();
    const rad = Math.PI / 180;
    return Math.sin(lat * rad) * Math.sin(pov.lat * rad) +
           Math.cos(lat * rad) * Math.cos(pov.lat * rad) *
           Math.cos((lng - pov.lng) * rad) > 0;
  }

  let downAt = null;
  el.addEventListener("pointerdown", (e) => {
    globe.controls().autoRotate = false; pauseDrift();
    downAt = { x: e.clientX, y: e.clientY, t: Date.now() };
  });
  el.addEventListener("pointerup", (e) => {
    if (!downAt) return;
    // A drag is not a click. Rotating the globe should never select anything.
    const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
    const quick = Date.now() - downAt.t < 500;
    downAt = null;
    if (moved > 5 || !quick) return;
    const d = pickPoint(e);
    if (!d || !facing(d.lat, d.lng)) return;
    // Same as the rail: a web build has no receivers to click, and no
    // selectReceiver to call, so the name is asked for before it is used.
    d.kind === "sdr"
      ? (typeof selectReceiver === "function" && selectReceiver(d))
      : goToPlace(d.i, { play: true });
  });

  // Hover label, throttled to one projection pass per frame.
  let hoverRaf = null;
  el.addEventListener("pointermove", (e) => {
    if (hoverRaf) return;
    hoverRaf = requestAnimationFrame(() => {
      hoverRaf = null;
      const d = pickPoint(e);
      const hit = d && facing(d.lat, d.lng) ? d : null;
      el.style.cursor = hit ? "pointer" : "";
      // Deliberately no tag on the globe. A label that follows the pointer across
      // a sphere is not help, it is a readout appearing where nobody asked for
      // one — and with a station locked it describes something you are not even
      // listening to. What is under the pointer belongs on the status line.
    });
  });

  el.addEventListener("wheel", () => { globe.controls().autoRotate = false; pauseDrift(); }, { passive: true });

  sizeGlobe();
  watchGlobeSize();
  updateSun();
  layers = (await window.auralfm.layers()) || layers;
  if (layers.clouds) startLiveImagery();
  syncWsprTimer();
  drawSky();
  tickISS();
  tickSatellites();
  clearInterval(issTimer);
  clearInterval(satTimer);
  issTimer = setInterval(tickISS, 4000);        // 7.6 km/s; 4s is visible motion
  satTimer = setInterval(tickSatellites, 30000); // orbits move slowly on screen
  // The terminator moves ~0.25° a minute; once a minute is imperceptibly smooth
  // and costs nothing.
  clearInterval(sunTimer);
  sunTimer = setInterval(updateSun, 60000);
  refreshSpace();
  setInterval(refreshSpace, 20 * 60000);
  applyLod(true);
  updateSun();

  /**
   * Tell main the globe is genuinely on screen, which reveals the window.
   *
   * Two frames, not one. The first is when three.js has been *told* about the
   * points; the second is after it has drawn them. Revealing on the first shows
   * a globe with no dots for about sixteen milliseconds, which is exactly the
   * kind of flicker the splash exists to remove.
   *
   * Main also has a six-second fallback, so a throw anywhere above cannot leave
   * someone staring at a logo.
   */
  requestAnimationFrame(() => requestAnimationFrame(() => {
    window.auralfm.exploreReady?.();
  }));
}

/**
 * Put the live read-outs in place.
 *
 * Called before the day/night work rather than after it. applyDayNight() waits
 * on a texture with a 30-second budget, and everything after it used to wait
 * too — so with the Status Readout switched on the bar sat on its placeholder
 * "Loading globe…" for as long as that took. The read-outs do not depend on the
 * texture, so they should not queue behind it.
 */
function mountReadouts() {
  const bar = $("globehint");
  if ($("sunreadout")) return;
  // Replaces #globestatus, which carried the placeholder. That element is the
  // only translatable thing in this bar — the read-outs are numbers, and a
  // language change used to wipe them by writing over their parent.
  
  bar.innerHTML =
    `<span id="sunreadout"></span><span id="issreadout"></span><span id="liveflag"></span>`;
}

/**
 * Level of detail. Zoomed out, only places with enough stations to matter are
 * drawn — the whole 12,296 at global zoom is an unreadable smear and makes
 * clicking a specific city nearly impossible. Zoom in and the rest appear.
 *
 * Swapping the point set rebuilds merged geometry, so this only runs when the
 * tier actually changes, not on every camera frame.
 */
const LOD_TIERS = [
  { minAltitude: 1.6, minCount: 12 },   // whole-globe: only major broadcast cities
  { minAltitude: 0.9, minCount: 4 },
  { minAltitude: 0,   minCount: 1 },    // close in: everything
];
let lodTier = -1;

let lodCentre = null;

/**
 * Which dots to draw.
 *
 * Two rules, and the second one is new because the first alone made the globe
 * unreadable up close. Zoomed into California the old filter still drew every
 * place in the hemisphere with at least one station — several thousand dots in a
 * uniform speckle, covering the terrain, with a one-station town rendered at
 * almost the same weight as Los Angeles. You could not tell where you were.
 *
 *  1. By size, as before: far out, only the major broadcast cities.
 *  2. By where you are actually looking. Anything beyond the visible cap is
 *     dropped outright — it was being drawn on the far side of the planet where
 *     nobody could see it, and it was crowding the near side through the limb.
 *
 * Recomputed when the tier changes or the centre moves appreciably, not every
 * frame: the points are merged into one geometry, so each rebuild is real work.
 */
function applyLod(force = false) {
  if (!globe || !globePts) return;
  const pov = globe.pointOfView();
  const alt = pov.altitude;
  const idx = LOD_TIERS.findIndex((t) => alt >= t.minAltitude);
  const tier = idx < 0 ? LOD_TIERS.length - 1 : idx;

  const rad = Math.PI / 180;
  const angFrom = (lat, lng, lat0, lng0) =>
    Math.acos(Math.max(-1, Math.min(1,
      Math.sin(lat * rad) * Math.sin(lat0 * rad) +
      Math.cos(lat * rad) * Math.cos(lat0 * rad) * Math.cos((lng - lng0) * rad)))) / rad;

  // The true horizon half-angle for this camera height, plus a small margin so
  // dots do not pop in at the edge of the disc. Guessed at first, which drew
  // most of North America while you were looking at California.
  const cap = Math.min(92, (Math.acos(1 / (1 + alt)) / rad) + 6);

  const moved = !lodCentre || angFrom(pov.lat, pov.lng, lodCentre.lat, lodCentre.lng) > 4;
  if (tier === lodTier && !moved && !force) return;
  lodTier = tier;
  lodCentre = { lat: pov.lat, lng: pov.lng };

  /**
   * A fixed budget of dots on screen, rather than a fixed station-count
   * threshold.
   *
   * The threshold approach could not win: tuned for the whole globe it hid
   * everything local, and tuned for a city it drew 3,594 dots across a
   * hemisphere in an unreadable speckle. A budget is self-tuning — zoomed out
   * you get the world's major broadcast cities, zoomed into California you get
   * the biggest places *in California*, because those are the only candidates
   * left in view. Same number of dots either way, always legible.
   */
  const BUDGET = 700;
  let shown = [];
  if (layers.stations) {
    const inView = [];
    for (const p of globePts) {
      if (p.i === selection.placeIndex) continue;                 // added below regardless
      if (p.count < LOD_TIERS[tier].minCount) continue;
      if (angFrom(p.lat, p.lng, pov.lat, pov.lng) > cap) continue;
      inView.push(p);
    }
    // Biggest first, so what survives the cut is what a map would have labelled.
    if (inView.length > BUDGET) {
      inView.sort((a, b) => b.count - a.count);
      inView.length = BUDGET;
    }
    shown = inView;
    const sel = globePts.find((p) => p.i === selection.placeIndex);
    if (sel) shown.push(sel);
  }
  // Receivers are sparse enough that thinning them by zoom would just make them
  // vanish. All 838, or none.
  // Receivers get their own, smaller budget. They are a different kind of thing
  // and there should never be so many amber dots that they compete with the
  // terrain — 405 of them at global zoom was its own kind of speckle. Nearest to
  // what you are looking at wins, so zooming into a region surfaces its local
  // antennas rather than a thinned-out world.
  const RX_BUDGET = 200;
  if (layers.shortwave && sdrPts) {
    const near = [];
    for (const r of sdrPts) {
      const d = angFrom(r.lat, r.lng, pov.lat, pov.lng);
      if (d <= cap) near.push({ r, d });
    }
    if (near.length > RX_BUDGET) {
      near.sort((a, b) => a.d - b.d);
      near.length = RX_BUDGET;
    }
    for (const n of near) shown.push(n.r);
    if (sdrSel && !shown.includes(sdrSel)) shown.push(sdrSel);
  }
  globe.pointsData(shown);
  // No place-count read-out: it told you nothing you could act on, and it was
  // the longest thing in the status bar.
}

let driftTimer = null;
/**
 * Resume the idle drift a few seconds after you stop handling the globe.
 *
 * The `layers.drift` check is the whole point: without it, turning Slow Rotation
 * off in the View menu stopped the globe for six seconds and then the next touch
 * of the mouse started it again, which reads as the setting being ignored. It
 * was.
 */
function pauseDrift(ms = 6000) {
  clearTimeout(driftTimer);
  driftTimer = setTimeout(() => {
    if (globe && !flying && layers.drift) globe.controls().autoRotate = true;
  }, ms);
}

/**
 * Run fn at most every `ms`, on both the leading and trailing edge.
 *
 * This replaced a debounce, and the difference is the whole reason the list felt
 * stuck. A debounce waits for the camera to go quiet — but the camera is never
 * quiet while you are dragging, and with the idle drift on it is never quiet at
 * all, so the 420ms timer was reset on every frame and the list simply did not
 * follow until you stopped touching the globe. Measured cost of following:
 * 1.8ms to find the nearest place, 0.3ms for the channel lookup. There was never
 * a performance reason to wait.
 */
function throttle(fn, ms) {
  let last = 0, timer = null;
  return function run() {
    const now = Date.now();
    const wait = ms - (now - last);
    if (wait <= 0) { last = now; clearTimeout(timer); timer = null; fn(); }
    else if (!timer) timer = setTimeout(() => { timer = null; last = Date.now(); fn(); }, wait);
  };
}

const followThrottled = throttle(followCentre, 90);
const lodThrottled = throttle(() => applyLod(), 200);

function onCameraChange() {
  lodThrottled();
  followThrottled();
}

/**
 * Whatever is under the middle of the globe becomes the selection, so spinning
 * the map browses the world instead of just moving pixels. Deliberately does
 * *not* start playing — auto-playing on every drag would be chaos. Clicking a
 * dot is the gesture that makes sound.
 */
/**
 * Set when the player's "i" opens the playing station in the rail
 * (explore-profile.js): the card was asked for, so the idle drift must not swap
 * the place out from under it a few seconds later. Grabbing the globe, or going
 * to any place yourself (goToPlace), lets the centre lead again.
 */
let holdCentre = false;
function followCentre() {
  if (!globe || !globePts || showingFavorites || browsingPlaces || flying || holdCentre) return;
  // Locked means locked: browsing the globe must not pull the list out from
  // under you. Clicking a dot or searching still works — this only stops the
  // globe's own motion from changing what you are looking at.
  if (locked) return;
  if (sdrSel) return;                  // a receiver's bands are not a place
  const pov = globe.pointOfView();
  const near = nearestPlace(pov.lat, pov.lng);
  if (!near || near.i === selection.placeIndex) return;
  // Only follow what's plausibly on screen; at global zoom the nearest dot to
  // centre can be thousands of km away and switching to it feels random.
  const maxDeg = 6 + pov.altitude * 26;
  if (near.dist > maxDeg) return;
  goToPlace(near.i, { fly: false });
  syncChatView();          // the room moves with the place, read only
}

/** Great-circle nearest place, in degrees. A linear scan over 12k is sub-ms. */
function nearestPlace(lat, lng) {
  const rad = Math.PI / 180;
  const la = lat * rad, lo = lng * rad;
  let best = null, bestCos = -2;
  for (const p of globePts) {
    const pla = p.lat * rad, plo = p.lng * rad;
    const c = Math.sin(la) * Math.sin(pla)
            + Math.cos(la) * Math.cos(pla) * Math.cos(plo - lo);
    if (c > bestCos) { bestCos = c; best = p; }
  }
  if (!best) return null;
  return { i: best.i, dist: Math.acos(Math.min(1, Math.max(-1, bestCos))) / rad };
}

// ── layer toggles ────────────────────────────────────────────────────────────
/**
 * Which globe layers are on, driven from View in the menu bar. These are view
 * options rather than settings, so they live in the menu and take effect at once
 * — no dialog, no apply button.
 */
let layers = { clouds: true, dayNight: true, stations: true, shortwave: true,
               iss: true, wspr: false, constellations: true,
               // Off: the globe opens still, looking at the listener's own city
               // (homeView). A turning planet is one you have to chase before
               // you can aim at a dot, and aiming is the whole interaction.
               drift: false, listeners: true, statusBar: false };

/**
 * Show and hide the dots without rebuilding them.
 *
 * globe.gl merges every point into one geometry — 12,298 draw calls down to
 * about three, which is why the globe is smooth at all. The price is that
 * handing it a new set costs a merge, measured at **122ms of frame time** on a
 * 2019 Intel Mac. That is the freeze people describe as the layer panel being
 * broken.
 *
 * Emptying the set is cheap (~20ms); refilling it is not. So switching a layer
 * off and on again used to cost a full merge on the way back, for data that had
 * not changed at all.
 *
 * When both point layers go off, the group is hidden instead and the geometry
 * kept. Turning them back on is then a boolean — free. A merge only happens
 * when the set genuinely differs, which is when exactly one of the two changes.
 */
let pointsGroup = null;

/** Find the object globe.gl parents its merged point mesh to. Cached. */
function findPointsGroup() {
  if (pointsGroup || !globe) return pointsGroup;
  let best = null, bestVerts = -1;
  globe.scene().traverse((o) => {
    const v = o.geometry?.attributes?.position?.count || 0;
    // The merged point mesh is the biggest thing parented to a plain Group that
    // is not the globe sphere itself (which has no Group parent of its own).
    if (v > bestVerts && o.type === "Mesh" && o.parent?.type === "Group") {
      best = o.parent; bestVerts = v;
    }
  });
  pointsGroup = best;
  return pointsGroup;
}

function applyPointVisibility(prev) {
  const want = layers.stations || layers.shortwave;
  const had = prev.stations || prev.shortwave;
  const setChanged = layers.stations !== prev.stations || layers.shortwave !== prev.shortwave;
  const grp = findPointsGroup();

  if (!want) {
    // Hide, keep the geometry. Falls back to emptying if the group could not be
    // found, which is correct but slower — never wrong, just not the fast path.
    if (grp) grp.visible = false;
    else globe.pointsData([]);
    return;
  }
  if (grp) grp.visible = true;
  // Coming back from both-off with nothing else changed: the geometry we kept is
  // still right, so there is nothing to do.
  if (!had && !layersDifferBeyondBoth(prev)) return;
  if (setChanged) applyLod(true);
}

/** Did anything change other than the two point layers switching together? */
function layersDifferBeyondBoth(prev) {
  return (layers.stations !== prev.stations) !== (layers.shortwave !== prev.shortwave);
}

function applyLayers(next) {
  const prev = layers;
  layers = { ...layers, ...next };

  const bar = $("globehint");
  if (bar) bar.hidden = !layers.statusBar;
  paintLayers();          // the inspector reflects whatever main just confirmed
  if (!globe) return;

  if (layers.clouds) startLiveImagery();
  withShader((sh) => {
    sh.uniforms.hasLive.value = (layers.clouds && liveTexReady) ? 1 : 0;
    // Sun fully overhead everywhere reads as permanent daylight, which is what
    // "day/night off" should mean.
    sh.uniforms.dayNightOn.value = layers.dayNight ? 1 : 0;
  });

  applyPointVisibility(prev);

  /**
   * Only when the orbits layer actually changed.
   *
   * This used to run on *every* layer change, and `paintOrbits` is the most
   * expensive function in the file: 325ms of synchronous work plus another
   * ~100ms of frame time, measured. Toggling station dots rebuilt the ISS
   * ground track and its labels for no reason, which is where most of the
   * "layers panel is laggy" came from — not from the points at all.
   *
   * The orbit data is kept fresh by its own timers (`tickISS` every 4s,
   * `tickSatellites` every 30s), so nothing here needs to drive it.
   */
  if (layers.listeners !== prev.listeners) paintRings();
  if (layers.iss !== prev.iss) {
    if (!layers.iss) { globe.pathsData([]).labelsData([]); issAt = null; paintRings(); }
    else paintOrbits();
  }

  globe.controls().autoRotate = layers.drift && !flying;

  // Not `!== prev.wspr`: the poll has to start when the layer is already on at
  // launch, too. Keyed on the transition, quitting with a polled layer switched
  // on came back to a checked menu item and an empty sky.
  syncWsprTimer();

  if (layers.constellations !== prev.constellations) drawSky();
}

function wireView() {
  window.auralfm.onLayers((l) => applyLayers(l));
}

/**
 * Where the globe opens: the listener's own city, and still.
 *
 * It used to open on a spinning Earth centred on nothing. Two problems in one:
 * a planet that is turning is a planet you have to chase before you can aim at
 * a dot, and a view of the mid-Atlantic is nobody's home. So the drift starts
 * off (see `layers.drift`) and the first frame looks at wherever this device
 * thinks it is.
 *
 * From the time zone, not from geolocation. `America/Chicago` is already on the
 * machine, costs no permission prompt, no network call and no coordinates about
 * a person — it names a city, at a resolution of hundreds of kilometres, which
 * is exactly the resolution this needs. Asking the browser for a real fix would
 * put a permission sheet in front of somebody before the app has shown them
 * anything, and this app's whole claim is that it asks for nothing.
 *
 * The fallback is the clock: the UTC offset gives a longitude to within a time
 * zone's width, which still opens on the right side of the world.
 */
async function homeView() {
  if (!globe) return;
  let tz = "";
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch {}
  const city = tz.split("/").pop()?.replace(/_/g, " ") || "";
  if (city) {
    const hit = (await guard("homeView", () => window.auralfm.places(city, 1), null))?.places?.[0];
    if (hit && Number.isFinite(hit.lat) && Number.isFinite(hit.lon)) {
      globe.pointOfView({ lat: hit.lat, lng: hit.lon, altitude: 1.35 }, 0);
      return;
    }
  }
  // 15° of longitude per hour, and the offset is minutes *behind* UTC.
  const lng = Math.max(-180, Math.min(180, -new Date().getTimezoneOffset() / 4));
  globe.pointOfView({ lat: 20, lng, altitude: 1.6 }, 0);
}
