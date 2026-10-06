/**
 * Explore, part 14 of 17: Space weather, WSPR, satellites and the ISS — and fitting the globe to its window.
 *
 * Explore is one page split across plain scripts that share a global scope, in
 * the order explore.html loads them. Declarations live here; anything that runs
 * at load — listeners, IPC subscriptions, one-off calls — is in wireTrackers(),
 * which explore.js calls once every part has loaded. That keeps the original
 * single-file behaviour: no handler can fire into a part that has not loaded.
 */

// ── ISS ──────────────────────────────────────────────────────────────────────
/**
 * The station, live, with the track it has just flown.
 *
 * The trail is *recorded*, not predicted — positions we actually observed rather
 * than an orbit we propagated. Less impressive, but it is true, and it needs no
 * SGP4 propagator.
 */
let issTrail = [], issTimer = null, sats = [], satTimer = null;
let wsprData = [], wsprTimer = null, wsprBusy = false;

/**
 * Space weather. Refreshed rarely on purpose — the sun does not change fast, the
 * K-index only meaningfully moves every three hours, and flux is a daily figure.
 */
let spaceWx = null;
async function refreshSpace() {
  try { spaceWx = (await window.auralfm.space()) || spaceWx; } catch { /* keep the last */ }
}

/**
 * Radio propagation — the ionosphere, drawn.
 *
 * Every WSPR report is a statement that a signal left one grid square and
 * arrived in another, right now, on a named band. Drawn as great-circle arcs,
 * that is a live picture of which paths across the planet are open — the thing
 * the whole shortwave feature depends on and the one thing the globe could not
 * previously show.
 *
 * It polls a volunteer-run service, so: nothing fetched unless the layer is on,
 * nothing fetched while the window is hidden, and the module behind it caps the
 * result and backs off.
 */
async function tickWspr() {
  if (!layers.wspr) { wsprData = []; paintOrbits(); return; }
  if (document.hidden || wsprBusy) return;
  wsprBusy = true;
  try {
    wsprData = (await window.auralfm.wspr(null)) || [];
    paintOrbits();
  } catch { /* best-effort, like everything else live here */ }
  finally { wsprBusy = false; }
}

function syncWsprTimer() {
  const wanted = !!layers.wspr;
  const running = !!wsprTimer;
  if (wanted === running) return;
  clearInterval(wsprTimer);
  wsprTimer = null;
  if (wanted) {
    tickWspr();
    // WSPR transmits on a two-minute cycle; nothing new exists faster.
    wsprTimer = setInterval(tickWspr, 3 * 60000);
  } else {
    wsprData = [];
    paintOrbits();
  }
}

/**
 * Orbits, propagated rather than recorded.
 *
 * The ISS trail below is where it has *been*; these are where each spacecraft is
 * *going* — a full revolution of real SGP4 track. Propagated in main, because it
 * is pure maths and the renderer has no node modules.
 */
async function tickSatellites() {
  if (!globe || !layers.iss) return;
  const list = await window.auralfm.satellites();
  if (Array.isArray(list) && list.length) sats = list;
  paintOrbits();
}

let issAt = null;

/**
 * One rings layer, two tenants. globe.gl rebuilds a layer wholesale on update,
 * so the ISS and the listeners share it and branch on `kind` rather than
 * fighting over which one drew last.
 */
function paintRings() {
  if (!globe) return;
  const data = [];
  if (layers.iss && issAt) data.push({ ...issAt, kind: "iss" });
  // Gated like every other thing drawn on this globe. It was not, so somebody
  // who turned all the layers off still had rings pulsing at them with nothing
  // in the panel to explain what they were.
  // A show on air is its own layer (On Air), drawn by explore-shows.js as a
  // beacon with a ring under it. With that layer off, its host is one more
  // listener in that town.
  const shows = !!layers.onAir && !!window.AuralShows?.on;
  for (const p of peers) {
    if (p.live && shows) data.push({ lat: p.lat, lng: p.lon, kind: "live", label: p.label });
    else if (layers.listeners) data.push({ lat: p.lat, lng: p.lon, kind: "peer", label: p.label });
  }
  // Your show, live (explore-studio.js): your town, in the accent, and always —
  // it is you, not a layer.
  const live = window.AuralStudio?.live;
  if (live) data.push({ lat: live.lat, lng: live.lon, kind: "live" });

  globe
    .ringsData(data)
    .ringLat("lat").ringLng("lng")
    // Listeners pulse wider and slower than the ISS — it is overhead and moving,
    // they are a place on the ground where somebody is sitting.
    .ringMaxRadius((d) => (d.kind === "live" ? 5 : d.kind === "peer" ? 3.6 : 2.4))
    .ringPropagationSpeed((d) => (d.kind === "live" ? 1.2 : d.kind === "peer" ? 0.8 : 1.6))
    .ringRepeatPeriod((d) => (d.kind === "live" ? 900 : d.kind === "peer" ? 2600 : 1400))
    .ringAltitude(0.055)
    .ringColor((d) => d.kind === "live"
      ? (t) => hexA(getComputedStyle(document.documentElement).getPropertyValue("--err").trim() || "#E5484D", 0.85 * (1 - t))
      : d.kind === "peer"
      ? (t) => hexA(palette?.star || "#F5F0E4", 0.5 * (1 - t))
      : (t) => `rgba(255,255,255,${0.55 * (1 - t)})`);
}

function paintOrbits() {
  if (!globe) return;
  const orbitPaths = sats.flatMap((s) =>
    s.path.map((seg) => ({ pts: seg, orbit: true })));
  const issPaths = issTrail.length > 1 ? splitTrail(issTrail).map((seg) => ({ pts: seg })) : [];

  /**
   * Propagation arcs. globe.gl interpolates a path along the great circle
   * between its points, so two endpoints are enough to get the curve that
   * actually crosses the planet — which is the shape the signal took.
   *
   * Split at the antimeridian, because a path from Rome to New Zealand crosses
   * it and would otherwise draw straight back across the map.
   */
  const prop = [];
  if (layers.wspr) {
    for (const w of wsprData) {
      let lon2 = w.rxLon;
      if (Math.abs(lon2 - w.txLon) > 180) lon2 += lon2 < w.txLon ? 360 : -360;
      prop.push({ pts: [[w.txLat, w.txLon], [w.rxLat, lon2]], wspr: true, spot: w });
    }
  }

  globe
    .pathsData([...prop, ...orbitPaths, ...issPaths])
    .pathPoints((d) => d.pts)
    .pathPointLat((p) => p[0]).pathPointLng((p) => p[1])
    // Propagation arcs bow well off the surface — a shortwave signal really does
    // go up to the ionosphere and come back down, and drawing it flat against
    // the ground would be both uglier and less true.
    .pathPointAlt((d) => (d.wspr ? 0.16 : 0.052))
    .pathColor((d) => {
      if (d.wspr) {
        // Strength by signal-to-noise. WSPR runs from roughly -30dB, which is
        // below the noise floor and still decodable, up to about 0 — so a strong
        // path reads bright and a marginal one is a whisper, which is honest.
        const a = Math.max(0.12, Math.min(0.8, (d.spot.snr + 32) / 34));
        const c = palette?.rx || "#C9A227";
        return [`${hexA(c, 0)}`, `${hexA(c, a)}`, `${hexA(c, 0)}`];
      }
      return d.orbit
        ? ["rgba(120,180,255,0.05)", "rgba(120,180,255,0.4)"]
        : ["rgba(255,255,255,0)", "rgba(255,255,255,0.55)"];
    })
    .pathStroke((d) => (d.wspr ? 0.45 : d.orbit ? 0.7 : 1.1))
    .pathDashLength(1).pathDashGap(0)
    .pathLabel((d) => d.wspr
      ? `${d.spot.tx} → ${d.spot.rx} · ${d.spot.bandName} · ${d.spot.km.toLocaleString()} km · SNR ${d.spot.snr}`
      : "")
    .pathTransitionDuration(0);

  globe
    .labelsData(sats.map((s) => ({ lat: s.lat, lng: s.lng, name: s.name })))
    .labelLat("lat").labelLng("lng").labelText("name")
    .labelSize(0.9).labelDotRadius(0.28)
    .labelColor(() => "rgba(190,215,255,0.85)")
    .labelAltitude(0.055)
    .labelResolution(2);
}

/** Break a lat/lng run wherever it crosses the antimeridian. */
function splitTrail(trail) {
  const segs = []; let run = [];
  for (const [la, ln] of trail) {
    if (run.length && Math.abs(ln - run[run.length - 1][1]) > 180) {
      if (run.length > 1) segs.push(run);
      run = [];
    }
    run.push([la, ln]);
  }
  if (run.length > 1) segs.push(run);
  return segs;
}

async function tickISS() {
  if (!globe || !layers.iss) return;
  const p = await window.auralfm.iss();
  if (!p) return;

  issTrail.push([p.lat, p.lng]);
  if (issTrail.length > 90) issTrail.shift();          // ~6 min of track

  issAt = { lat: p.lat, lng: p.lng };
  paintRings();
  paintOrbits();

  const el = $("issreadout");
  if (el) {
    el.innerHTML = `⌖ ISS <b>${Math.abs(p.lat).toFixed(1)}°${p.lat >= 0 ? "N" : "S"} `
      + `${Math.abs(p.lng).toFixed(1)}°${p.lng >= 0 ? "E" : "W"}</b> · ${Math.round(p.altKm)} km`
      + (p.sunlit === null ? "" : p.sunlit ? " · sunlit" : " · in shadow");
  }
}

/**
 * Pixel budget per frame.
 *
 * The cost here is pure fill rate — the day/night shader across every pixel.
 * Measured on a 4K display: disabling the atmosphere gained 1fps and removing
 * all 12,296 points gained 2, while halving the buffer took it from 5fps to 56.
 * Geometry is not the problem; resolution is.
 *
 * There is a hard cliff around 4 Mpx where the frame misses vsync and drops
 * straight to half rate: 6.0 Mpx -> 31fps, 4.5 -> 31, 3.4 -> 56. Sitting just
 * under it is worth a little softness on very large windows.
 */
const TARGET_PIXELS = 3.5e6;

function sizeGlobe() {
  if (!globe) return;
  const w = $("globewrap");
  if (!w.clientWidth || !w.clientHeight) return;
  globe.width(w.clientWidth).height(w.clientHeight);
  centreGlobe(w);

  /**
   * Scale the drawing buffer to fit the pixel budget rather than blindly
   * honouring devicePixelRatio. A 3840px window at ratio 2 asks for a 7680x4320
   * buffer — 24 megapixels a frame, which is what the stutter was.
   *
   * Going below 1.0 on a huge window is the right trade: the globe is a smooth
   * sphere, so slight softness is nearly invisible, while 5fps is not.
   */
  const r = globe.renderer();
  if (!r) return;
  const css = w.clientWidth * w.clientHeight;
  const ratio = Math.max(0.75, Math.min(window.devicePixelRatio || 1,
                                        Math.sqrt(TARGET_PIXELS / Math.max(css, 1))));
  if (Math.abs(r.getPixelRatio() - ratio) > 0.02) r.setPixelRatio(ratio);
}

/**
 * Centre the planet in the space the rail leaves, not in the window.
 *
 * The globe fills the whole window and the station rail floats over its right
 * side, so a planet centred in the canvas sits half under the rail. Shifting
 * the camera's view window by half the covered width moves the picture without
 * shrinking the canvas — space still runs behind the rail — and three's
 * raycaster reads the same projection, so clicks still land where they look.
 *
 * Measured rather than read from --rail: on a phone the rail sits below the
 * globe, covers none of it, and the offset has to fall to zero on its own.
 * Headlines float on the left the same way, so they push the other way.
 */
function centreGlobe(w) {
  const cam = globe.camera && globe.camera();
  if (!cam || !cam.setViewOffset) return;
  const g = w.getBoundingClientRect();
  const box = (el) => {
    const r = el && el.offsetParent && !el.hidden ? el.getBoundingClientRect() : null;
    return r && r.top < g.bottom && r.bottom > g.top && r.left < g.right && r.right > g.left ? r : null;
  };
  const acrossG = (r) => Math.max(0, Math.min(g.right, r.right) - Math.max(g.left, r.left));
  /**
   * A panel beside the globe takes width; a panel under it takes height.
   *
   * This only measured width, which is right for the rail in a Mac window and
   * wrong for the same rail as a phone sheet: the sheet spans the screen, so
   * "covered" was the whole canvas and the planet was pushed half a screen off
   * to the left. Anything as wide as the globe is below it, not beside it, and
   * what it costs is the bottom of the view rather than one side.
   */
  const side = (el) => {
    const r = box(el);
    if (!r) return 0;
    const wide = acrossG(r);
    return wide > g.width * 0.9 ? 0 : wide;
  };
  const below = (el) => {
    const r = box(el);
    if (!r || acrossG(r) <= g.width * 0.9) return 0;
    return Math.max(0, g.bottom - Math.max(r.top, g.top));
  };
  const panels = [document.querySelector(".railcol"), document.getElementById("newspanel"), document.getElementById("studiopanel")];
  // The rail covers the right; headlines, or the studio, the left (one at a
  // time). Centre between them: with the studio open and wide, that is the
  // planet moving right to stay in view.
  const shiftX = Math.round((side(panels[0]) - Math.max(side(panels[1]), side(panels[2]))) / 2);
  /**
   * The planet holds still while panels come and go.
   *
   * Measuring whatever happens to be on screen meant the globe re-centred
   * every time a panel opened or the sheet stood down — tapping through the
   * tabs slid the Earth around behind them. On a phone the sheet's resting
   * height is the one number that does not change with what is open, so the
   * view is centred above that and stays there. --peek is published by
   * web/rail-sheet.js; without it (the desktop) we measure as before.
   */
  // Null when unpublished (the desktop), which is not the same as 0: a phone
  // with the sheet tucked down publishes how little it covers, and a falsy 0
  // used to fall through to measuring whatever sheet happened to be up.
  const rawPeek = getComputedStyle(document.documentElement).getPropertyValue("--peek").trim();
  const peek = rawPeek ? parseFloat(rawPeek) || 0 : null;
  /**
   * The search field drops in over the top of the globe, and used to cost the
   * planet nothing: centred for the sheet alone, the Earth sat high in what
   * was left once the field covered the sky above it.
   *
   * box() above cannot see it — the field is `position: fixed`, and
   * offsetParent is null for fixed elements — so it is measured here instead.
   * What it takes off the top is worth exactly what the sheet takes off the
   * bottom, with the opposite sign.
   */
  const overTop = (el) => {
    if (!el || el.hidden) return 0;
    const r = el.getBoundingClientRect();
    // Only something lying across the top of the globe, not beside or below it.
    if (!r.height || r.left > g.right || r.right < g.left) return 0;
    if (r.top > g.top + g.height / 2) return 0;
    return Math.max(0, Math.min(r.bottom, g.bottom) - Math.max(r.top, g.top));
  };
  const covered = overTop(document.querySelector(".searchbar"));
  const shiftY = peek !== null
    ? Math.round((peek - covered) / 2)
    : Math.round((Math.max(0, ...panels.map(below)) - covered) / 2);
  if (shiftX || shiftY) cam.setViewOffset(g.width, g.height, shiftX, shiftY, g.width, g.height);
  else cam.clearViewOffset();
  cam.updateProjectionMatrix();
}

/**
 * Watch the pane, not the window.
 *
 * A window resize listener misses every case where the pane changes size without
 * the window doing so — and the rail is fluid, so that is most of them. On a 4K
 * display the canvas was sitting at 600x544 inside a 3200x2064 pane: 19% of the
 * width, which is exactly the "globe doesn't fill the space" complaint.
 */
function watchGlobeSize() {
  const w = $("globewrap");
  if (!w || typeof ResizeObserver === "undefined") return;
  new ResizeObserver(() => sizeGlobe()).observe(w);
}

let flying = false;
function flyTo(lat, lng, altitude = 0.62) {
  if (!globe) return;
  globe.controls().autoRotate = false;   // don't drift away from what you picked
  pauseDrift(9000);
  // Suppress follow-the-centre for the duration: the fly emits change events the
  // whole way, and following mid-flight snaps the selection to whatever city the
  // camera happens to pass over. That is how picking Los Angeles landed on
  // Brownsville TX.
  flying = true;
  globe.pointOfView({ lat, lng, altitude }, 800);
  clearTimeout(flyDone);
  flyDone = setTimeout(() => { flying = false; applyLod(); }, 1100);
}
let flyDone = null;

/** Merged geometry means selection changes need the layer rebuilt, not just recoloured. */
function refreshGlobeSelection() {
  if (globe && globePts) applyLod(true);
}

function wireTrackers() {
  /**
   * A hidden window must not poll, but it must also not stay empty once it comes
   * back — so returning to the front asks immediately rather than waiting out the
   * remaining interval.
   */
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    if (layers.wspr) tickWspr();
  });

  window.addEventListener("resize", () => { sizeGlobe(); fitMarkets(); });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (globe) refreshGlobeSelection();
  });
}
