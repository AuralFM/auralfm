/**
 * Explore, part 5 of 17: The globe's state and its light: the library, sun, moon, textures, day and night, live imagery.
 *
 * Explore is one page split across plain scripts that share a global scope, in
 * the order explore.html loads them. This part only declares: nothing in it runs
 * at load, so it has no wire function. The parts that do run something at load
 * keep it in a wire function that explore.js calls once every part has loaded.
 */

// ── globe view ───────────────────────────────────────────────────────────────
let globe = null, globeLoading = null, globePts = null, sunTimer = null;

/**
 * Shortwave receivers, merged into the same point layer as the stations rather
 * than given a layer of their own. globe.gl merges points into one geometry, so
 * a second layer would mean a second full rebuild on every selection change for
 * the sake of 838 dots. Per-point colour is a function, so one layer can carry
 * both — the only cost is that everything downstream has to check `kind`.
 */
let sdrPts = null;
let sdrSel = null;      // the receiver whose bands are in the rail
let liveTexReady = false;

/** Load the 1.7 MB globe bundle only when someone actually asks for the globe. */
function loadGlobeLib() {
  if (window.Globe) return Promise.resolve();
  if (globeLoading) return globeLoading;
  globeLoading = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "vendor/globe.gl.min.js";
    s.onload = resolve;
    s.onerror = () => reject(new Error("globe.gl failed to load — run `npm run vendor`"));
    document.head.appendChild(s);
  });
  return globeLoading;
}

const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

/**
 * Sub-solar point: the lat/lng where the sun is directly overhead right now.
 * NOAA-style approximation — declination plus the equation of time, which is the
 * bit that stops the terminator drifting up to ~16 minutes off across the year.
 * Accurate to well under a degree, which is far finer than a globe this size can
 * show.
 */
function subsolarPoint(date = new Date()) {
  const rad = Math.PI / 180;
  const dayOfYear = (date - Date.UTC(date.getUTCFullYear(), 0, 0)) / 86400000;
  const decl = -23.44 * Math.cos(rad * (360 / 365) * (dayOfYear + 10));
  const B = rad * (360 / 365) * (dayOfYear - 81);
  const eqTime = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B); // minutes
  const utcHours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  let lng = -15 * (utcHours - 12 + eqTime / 60);
  lng = ((lng + 180) % 360 + 360) % 360 - 180;
  return { lat: decl, lng };
}

/**
 * Sub-lunar point and illuminated fraction.
 *
 * Low-precision lunar position (Meeus, chapter 47, principal terms only) —
 * roughly a degree, which is finer than a dot on this globe can express. A full
 * ephemeris would be many times the code for no visible gain.
 *
 * Deliberately *not* used to light the Earth: real moonlight is ~400,000x
 * dimmer than sunlight and would be invisible next to the night-lights texture.
 * It marks where the moon is, and how full it is.
 */
function moonPoint(date = new Date()) {
  const rad = Math.PI / 180;
  const JD = date.getTime() / 86400000 + 2440587.5;
  const T = (JD - 2451545) / 36525;

  const L = 218.316 + 13.176396 * (JD - 2451545);        // mean longitude
  const M = 134.963 + 13.064993 * (JD - 2451545);        // mean anomaly
  const F = 93.272 + 13.229350 * (JD - 2451545);         // argument of latitude

  const lambda = (L + 6.289 * Math.sin(M * rad)) * rad;  // ecliptic longitude
  const beta = 5.128 * Math.sin(F * rad) * rad;          // ecliptic latitude
  const eps = (23.439 - 0.0000004 * (JD - 2451545)) * rad;

  // ecliptic -> equatorial
  const ra = Math.atan2(
    Math.sin(lambda) * Math.cos(eps) - Math.tan(beta) * Math.sin(eps),
    Math.cos(lambda));
  const dec = Math.asin(
    Math.sin(beta) * Math.cos(eps) + Math.cos(beta) * Math.sin(eps) * Math.sin(lambda));

  // Greenwich mean sidereal time -> sub-lunar longitude
  const gmst = (280.46061837 + 360.98564736629 * (JD - 2451545)) % 360;
  let lng = (ra / rad - gmst) % 360;
  lng = ((lng + 180) % 360 + 360) % 360 - 180;

  // Illuminated fraction from the sun-moon elongation.
  const sunM = (357.529 + 0.98560028 * (JD - 2451545)) * rad;
  const sunLambda = (280.459 + 0.98564736 * (JD - 2451545) + 1.915 * Math.sin(sunM)) * rad;
  const elong = Math.acos(Math.cos(beta) * Math.cos(lambda - sunLambda));
  const illum = (1 - Math.cos(elong)) / 2;
  // Waxing when the moon leads the sun in ecliptic longitude.
  const waxing = Math.sin(lambda - sunLambda) > 0;

  return { lat: dec / rad, lng, illum, waxing };
}

const MOON_PHASES = [
  [0.02, "new moon", "●"], [0.24, "waxing crescent", "☽"], [0.30, "first quarter", "☽"],
  [0.72, "waxing gibbous", "☽"], [0.98, "full moon", "○"], [1.01, "waning gibbous", "☾"],
];
function moonPhaseName({ illum, waxing }) {
  if (illum < 0.02) return ["new moon", "●"];
  if (illum > 0.98) return ["full moon", "○"];
  const band = illum < 0.28 ? "crescent" : illum < 0.72 ? "quarter" : "gibbous";
  const dir = waxing ? "waxing" : "waning";
  const name = band === "quarter" ? (waxing ? "first quarter" : "last quarter") : `${dir} ${band}`;
  return [name, waxing ? "☽" : "☾"];
}

/** Unit vector toward the sun, in the globe's own coordinate frame. */
function sunVector() {
  const { lat, lng } = subsolarPoint();
  const c = globe.getCoords(lat, lng, 0);
  const len = Math.hypot(c.x, c.y, c.z) || 1;
  return { x: c.x / len, y: c.y / len, z: c.z / len };
}

/** globe.gl doesn't re-export THREE, so clone the texture class off an existing one. */
function loadTexture(url, TexClass, like) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const t = new TexClass(img);
      if (like) {
        t.wrapS = like.wrapS; t.wrapT = like.wrapT;
        t.colorSpace = like.colorSpace; t.flipY = like.flipY;
        t.minFilter = like.minFilter; t.magFilter = like.magFilter;
      }
      t.needsUpdate = true;
      resolve(t);
    };
    img.onerror = () => reject(new Error(`texture failed: ${url}`));
    img.src = url;
  });
}

/**
 * Poll until fn() returns something truthy.
 *
 * The budget counts only time the window is actually visible. three-globe hands
 * its texture over on a render tick, and a hidden or occluded window has its
 * animation frames throttled to nothing — so wall-clock time spent in the
 * background is time in which nothing could possibly have progressed. Charging
 * it against the timeout is how a backgrounded launch used to fail.
 */
const waitFor = (fn, ms = 30000) => new Promise((res, rej) => {
  let spent = 0, last = Date.now();
  (function poll() {
    const v = fn();
    if (v) return res(v);
    const now = Date.now();
    if (!document.hidden) spent += now - last;
    last = now;
    if (spent > ms) return rej(new Error("timed out waiting for texture"));
    setTimeout(poll, 60);
  })();
});

/**
 * Blend the daytime and night-lights textures across the real terminator.
 *
 * Injected into the existing MeshPhongMaterial rather than built as a fresh
 * ShaderMaterial, because globe.gl bundles three privately and never exposes the
 * constructors. Texture lookups use the geometry's own uv attribute, forwarded
 * through our own varying — that can't drift from the texture, and doesn't
 * depend on three's internal varying names.
 *
 * Injected at <opaque_fragment>, not at the end of the shader: everything after
 * it (tone mapping, colour-space encoding) still has to run on our blended
 * colour. Writing gl_FragColor last skips sRGB encoding and the daylit half
 * comes out several stops too dark.
 */
/**
 * The globe shader only exists once its program compiles, which happens on the
 * first render after needsUpdate — not when applyDayNight() returns. Anything
 * that wants to set a uniform before then has to wait rather than give up.
 *
 * It used to give up: the live cloud composite was fetched, stitched, and then
 * dropped on the floor if the shader wasn't ready, and the Day/Night menu toggle
 * silently did nothing in the same window. Both now queue.
 */
let shaderQueue = [];
function withShader(fn) {
  const sh = globe?.globeMaterial()?.userData?.shader;
  if (sh) { fn(sh); return true; }
  shaderQueue.push(fn);
  return false;
}
function flushShaderQueue(sh) {
  const q = shaderQueue;
  shaderQueue = [];
  for (const fn of q) { try { fn(sh); } catch { /* one bad consumer must not block the rest */ } }
}

async function applyDayNight() {
  const mat = globe.globeMaterial();
  const dayTex = await waitFor(() => mat.map);
  const TexClass = dayTex.constructor;

  const [nightTex, bumpTex, lightsTex] = await Promise.all([
    loadTexture("vendor/earth-night.jpg", TexClass, dayTex),
    loadTexture("vendor/earth-topology.png", TexClass, dayTex),
    // 8192x4096 city lights. Fails soft: if it is missing the shader keeps the
    // vendored night texture, which is the same imagery at a quarter the size.
    loadTexture("vendor/earth-lights.jpg", TexClass, dayTex).catch(() => null),
  ]);

  // Satellite imagery is fetched *without* blocking: on a cold start it can take
  // tens of seconds, and a globe that refuses to appear until the weather
  // downloads is a worse globe. Compile on Blue Marble now, swap the live layer
  // in when it lands.
  loadLiveImagery(TexClass, dayTex);

  mat.bumpMap = bumpTex;
  mat.bumpScale = 4;            // globe radius is 100, so this is subtle relief
  mat.shininess = 6;
  // three-globe nulls material.color once a globe texture is applied, so this
  // has to be guarded — assigning through it threw and silently skipped the
  // shader hook below.
  mat.color?.setHex?.(0xffffff);

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.nightMap = { value: nightTex };
    shader.uniforms.liveMap = { value: nightTex };   // placeholder until imagery lands
    shader.uniforms.hasLive = { value: 0 };
    shader.uniforms.dayNightOn = { value: 1 };
    shader.uniforms.sunDirection = { value: sunVector() };
    shader.uniforms.lightsMap = { value: lightsTex || nightTex };
    shader.uniforms.hasLights = { value: lightsTex ? 1 : 0 };

    // Two separate frames here, and mixing them up has bitten this shader twice.
    //
    // UVs: pass the geometry's own through, rather than deriving them from the
    // normal. Deriving looks right on paper but silently rotates the map —
    // three's SphereGeometry puts u=0 at -X, not u=0.5 at +Z, so the Americas
    // ended up showing Europe and Africa.
    //
    // Normal: it must be in the SAME frame as the sun vector, and it was not.
    // three-globe rotates the globe mesh by -90 degrees about Y, so `position`
    // (object space, before that rotation) sat a quarter-turn away from
    // sunVector(), which comes from getCoords() and is already in the parent
    // frame. The terminator was therefore always 90 degrees out. Multiplying by
    // modelMatrix puts the normal in the same frame as the sun and keeps it
    // correct even if that rotation ever changes.
    shader.vertexShader = "varying vec3 vGlobeNormal;\nvarying vec2 vGlobeUv;\n" + shader.vertexShader
      .replace("void main() {", "void main() {\n  vGlobeNormal = normalize(mat3(modelMatrix) * position);\n  vGlobeUv = uv;");

    shader.fragmentShader =
      "uniform sampler2D nightMap;\nuniform sampler2D liveMap;\nuniform float hasLive;\nuniform float dayNightOn;\n" +
      "uniform sampler2D lightsMap;\nuniform float hasLights;\n" +
      "uniform vec3 sunDirection;\nvarying vec3 vGlobeNormal;\nvarying vec2 vGlobeUv;\n" +
      shader.fragmentShader.replace("#include <opaque_fragment>", `#include <opaque_fragment>
        vec3 n = normalize(vGlobeNormal);
        vec3 dayC   = texture2D(map, vGlobeUv).rgb;
        vec3 nightC = texture2D(nightMap, vGlobeUv).rgb;

        // City lights, at four times the resolution of the vendored night
        // texture and as a mask rather than a picture: the colour is decided
        // here, so it can be tuned without refetching 6.8 MB from NASA.
        //
        // The base is the day texture at a few percent — continents stay
        // faintly readable at night the way they do under a full moon, and it
        // keeps coastlines legible where nobody lives. The old night texture is
        // still the fallback when the 8K one is missing.
        if (hasLights > 0.5) {
          float lit = texture2D(lightsMap, vGlobeUv).r;
          // Sodium and LED street lighting, warm and slightly orange. The power
          // curve lifts small towns without blowing out the conurbations.
          vec3 glow = vec3(1.0, 0.78, 0.50) * pow(lit, 0.80) * 2.0;
          nightC = dayC * 0.055 + glow;
        }

        // Today's satellite pass, where it exists. VIIRS returns pure black
        // where the swaths don't meet, so treat near-black as "no data" and keep
        // Blue Marble there — a gap should look like clear sky, not a puncture.
        vec3 liveC = texture2D(liveMap, vGlobeUv).rgb;
        /**
         * Where the live pass ends and Blue Marble resumes.
         *
         * This was a hard step(), which is why the globe looked like an
         * amalgamation of photographs: every satellite footprint met the base
         * texture along a knife edge, so the geostationary discs and the daily
         * polar swaths showed as straight-sided panels. The seams are real —
         * different sensors, different passes, genuinely different times of day
         * — but the *edges* were ours.
         *
         * A smoothstep feathers the join over a band of brightness instead of
         * cutting at one value. It cannot make two sensors agree on colour; it
         * can stop the boundary being a line.
         */
        float lum = max(liveC.r, max(liveC.g, liveC.b));
        float haveData = smoothstep(0.02, 0.13, lum) * hasLive;
        dayC = mix(dayC, liveC, haveData);
        // Clouds are bright; carry a little of them onto the night side too, so
        // a storm doesn't vanish at the terminator.
        float cloud = smoothstep(0.45, 0.85, dot(liveC, vec3(0.33))) * haveData;
        nightC = mix(nightC, nightC + vec3(0.10), cloud);
        float cosSun = dot(n, normalize(sunDirection));
        // ~10 degrees of softness: civil twilight, not a hard line
        float t = mix(1.0, smoothstep(-0.09, 0.09, cosSun), dayNightOn);
        vec3 col = mix(nightC * 1.6, dayC, t);
        // A restrained warm band either side of the terminator — sunrise, not sunset filter.
        col += vec3(0.075, 0.032, 0.0) * max(0.0, 1.0 - abs(cosSun) * 22.0) * dayNightOn;
        gl_FragColor = vec4(col, gl_FragColor.a);`);

    mat.userData.shader = shader;   // handle for the per-minute sun update
  };
  // three's default program cache key already stringifies onBeforeCompile, so
  // replacing the hook is enough to force a recompile.
  mat.needsUpdate = true;

  // Don't await this — the globe should be interactive immediately. It only
  // exists to release anything that queued on the shader.
  waitFor(() => mat.userData.shader)
    .then(flushShaderQueue)
    .catch(() => { /* setupDayNight() owns reporting and retry */ });
}

/**
 * applyDayNight() is the one part of init that depends on an asset arriving, so
 * it is also the one part that can fail. It used to be awaited bare, which meant
 * a slow texture took the sky, the ISS, the LOD and the live clouds down with
 * it — and reported the failure into a status bar that is hidden by default, so
 * the globe just quietly looked wrong.
 *
 * Now it fails alone, says so where it can be seen, and tries again when the
 * window comes back to the front, which is exactly when a throttled load can
 * finally make progress.
 */
let dayNightRetry = null;
async function setupDayNight() {
  try {
    await applyDayNight();
    if (dayNightRetry) { document.removeEventListener("visibilitychange", dayNightRetry); dayNightRetry = null; }
    return true;
  } catch (err) {
    const el = $("globestatus");
    if (el) el.textContent = `day/night unavailable — ${err.message}`;
    if (!dayNightRetry) {
      dayNightRetry = () => { if (!document.hidden) setupDayNight(); };
      document.addEventListener("visibilitychange", dayNightRetry);
    }
    return false;
  }
}

const loadImage = (src) => new Promise((res, rej) => {
  const i = new Image();
  i.onload = () => res(i);
  i.onerror = () => rej(new Error("image failed"));
  i.src = src;
});

/**
 * Build one sky texture from the daily global pass plus whatever geostationary
 * frames exist, composited on a canvas.
 *
 * Order matters: VIIRS underneath for complete coverage, GOES on top where it
 * exists because it is ten minutes old rather than a day. Painting them the
 * other way round would bury the current data under yesterday's.
 */
async function loadLiveImagery(TexClass, like) {
  try {
    const sky = await window.auralfm.clouds();
    if (!sky?.base && !sky?.goesE && !sky?.goesW) return;

    const cv = document.createElement("canvas");
    cv.width = 2048; cv.height = 1024;
    const ctx = cv.getContext("2d");

    // Sub-satellite longitudes. GOES imagery is only trustworthy near the middle
    // of its disk; toward the limb it is stretched and colour-shifted.
    const SUBLON = { goesE: -75.2, goesW: -137.0 };

    let liveCount = 0;
    for (const key of ["base", "goesE", "goesW"]) {
      if (!sky[key]) continue;
      try {
        const img = await loadImage("file://" + sky[key]);
        if (key === "base") { ctx.drawImage(img, 0, 0, cv.width, cv.height); continue; }

        // Feather the disk instead of pasting it. A hard-edged disk lands as a
        // pale wedge with a diagonal seam where GOES meets VIIRS — different
        // sensors, different colour grading, and a visible cut between them.
        const tmp = document.createElement("canvas");
        tmp.width = cv.width; tmp.height = cv.height;
        const tc = tmp.getContext("2d");
        tc.drawImage(img, 0, 0, tmp.width, tmp.height);

        const cx = ((SUBLON[key] + 180) / 360) * tmp.width;
        const cy = tmp.height / 2;
        // ~55 deg of longitude at full strength, fading out by ~78.
        const r0 = (55 / 360) * tmp.width, r1 = (78 / 360) * tmp.width;
        const grad = tc.createRadialGradient(cx, cy, r0, cx, cy, r1);
        grad.addColorStop(0, "rgba(0,0,0,1)");
        grad.addColorStop(1, "rgba(0,0,0,0)");
        tc.globalCompositeOperation = "destination-in";
        tc.fillStyle = grad;
        tc.fillRect(0, 0, tmp.width, tmp.height);

        ctx.globalAlpha = 0.92;
        ctx.drawImage(tmp, 0, 0);
        ctx.globalAlpha = 1;
        liveCount++;
      } catch { /* skip this layer */ }
    }

    const tex = new TexClass(cv);
    if (like) { tex.wrapS = like.wrapS; tex.wrapT = like.wrapT; tex.colorSpace = like.colorSpace; tex.flipY = like.flipY; }
    tex.needsUpdate = true;

    withShader((sh) => {
      sh.uniforms.liveMap.value = tex;
      liveTexReady = true;
      sh.uniforms.hasLive.value = layers.clouds ? 1 : 0;
    });

    const el = $("liveflag");
    if (el) {
      el.textContent = liveCount
        ? ` · live cloud cover (${liveCount === 2 ? "GOES E+W" : "GOES"} 10 min · rest daily)`
        : " · cloud cover (daily pass)";
    }
  } catch { /* Blue Marble is a perfectly good fallback */ }
}

function updateSun() {
  if (!globe) return;
  // The readout must not depend on the shader: the program compiles on the first
  // render after needsUpdate, which is after initGlobe returns.
  // Deliberately not queued: this runs every minute, so if the shader is not up
  // yet the next tick will carry a fresher sun anyway.
  const sh = globe.globeMaterial()?.userData?.shader;
  if (sh) sh.uniforms.sunDirection.value = sunVector();
  const { lat, lng } = subsolarPoint();
  const m = moonPoint();
  const [phase, glyph] = moonPhaseName(m);
  paintGlobeReadout(lat, lng, m, phase, glyph);
}
