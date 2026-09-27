/**
 * The site's language, brought into the app (BRAND.md §15).
 *
 * Three touches from auralfm.xyz's redesign, tried on the web first and shared
 * by the desktop since 25 September 2026, when they were approved for it. None
 * changes a font: the app's type never changes; these are motion and rhythm,
 * in the app's own face. Loaded by explore.html just before explore.js, so it
 * wraps placeRow and loadPlaces before anything calls them.
 *
 *   - Split-flap: the station on air and the place you are looking at turn over
 *     like a departure board when they change.
 *   - Sun time on every place in the list, dimmed at night — the list reads
 *     like a board of departures, and like the globe beside it.
 *   - Vibes: pick one and every place that plays it lights up on the globe,
 *     and the list becomes those places, most of it first.
 */
{
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ── split-flap ────────────────────────────────────────────────────────────
  // Each character turns over and settles left to right. The element's own
  // writes are remembered, so a change the app makes mid-turn restarts the
  // flap on the new text rather than being overwritten by the old one.
  const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", LOWER = "abcdefghijklmnopqrstuvwxyz0123456789";
  const hold = /[\s·:,.\-–—()'&/]/;
  /**
   * Timed, not counted. The globe keeps the main thread busy, so a 28ms tick
   * arrives every 120ms or so; counting ticks made a flap drag on for three
   * seconds and be caught half-turned. Each letter settles at a moment, the
   * whole thing lasts under a second however slow the ticks, and a last timer
   * lands the true text whatever happened in between.
   */
  function flap(el, text) {
    clearInterval(el.flapTimer);
    clearTimeout(el.flapDone);
    const start = performance.now();
    const step = Math.min(24, 520 / Math.max(1, text.length)), lead = 140;
    const total = lead + step * text.length;
    const write = (s) => { el.flapWrote = s; el.textContent = s; };
    const finish = () => { clearInterval(el.flapTimer); write(text); };
    el.flapTimer = setInterval(() => {
      const t = performance.now() - start;
      if (t >= total) return finish();
      let out = "";
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (t >= lead + i * step || hold.test(ch)) { out += ch; continue; }
        const set = ch === ch.toLowerCase() && ch !== ch.toUpperCase() ? LOWER : UPPER;
        out += set[(Math.random() * set.length) | 0];
      }
      write(out);
    }, 30);
    el.flapDone = setTimeout(finish, total + 60);
  }
  function flapOnChange(el) {
    if (!el || still) return;
    let last = el.textContent;
    new MutationObserver(() => {
      const now = el.textContent;
      if (now === el.flapWrote || now === last) return;
      last = now;
      flap(el, now);
    }).observe(el, { childList: true, characterData: true, subtree: true });
  }
  flapOnChange(document.getElementById("nowName"));
  flapOnChange(document.querySelector("#head h2"));
  // What the player is doing ("Connecting…", then the station's own line), so
  // a station arriving turns over like its name does.
  flapOnChange(document.getElementById("nowStatus"));
  // For anything else that changes a word in place — the launch screen's steps
  // (web/launch.js) and whatever comes next. Melton, 26 Sept: the turn-over is
  // part of how AuralFM moves from here on, on every platform.
  window.AuralFlap = {
    flap: (el, text) => { if (still) el.textContent = text; else flap(el, text); },
    onChange: flapOnChange,
  };

  // ── sun time on every place ───────────────────────────────────────────────
  // Solar, from longitude: the same arithmetic as the terminator and the globe's
  // read-out, so the list and the darkness on the globe always agree.
  const sunTime = (lon) => {
    const now = new Date();
    const h = (((now.getUTCHours() * 60 + now.getUTCMinutes() + lon * 4) / 60) % 24 + 24) % 24;
    return { text: `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.floor((h % 1) * 60)).padStart(2, "0")}`,
             night: h < 6 || h >= 20 };
  };
  const paintTime = (span) => {
    const { text, night } = sunTime(Number(span.dataset.lon));
    span.textContent = text;
    span.classList.toggle("night", night);
    span.setAttribute("aria-label", `${night ? "Night" : "Day"}, sun time ${text}`);
  };
  const placeRowBase = placeRow;
  // eslint-disable-next-line no-global-assign
  placeRow = (p) => {
    const el = placeRowBase(p);
    if (Number.isFinite(p.lon)) {
      const span = document.createElement("span");
      span.className = "ptime";
      span.dataset.lon = p.lon;
      paintTime(span);
      el.querySelector(".pmeta")?.after(span);
    }
    return el;
  };
  setInterval(() => { for (const s of document.querySelectorAll(".ptime")) paintTime(s); }, 30_000);

  // ── vibes ─────────────────────────────────────────────────────────────────
  let vibe = null, vibeList = [], vibeNames = {};
  const bar = document.createElement("div");
  bar.className = "chips vibechips";
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", "Vibes");
  bar.hidden = true;
  document.querySelector(".placebar")?.after(bar);

  const accent = () => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#5ef08a";

  /**
   * A round, soft-edged dot in the palette's accent. The particles layer draws
   * squares without a texture, and with one it takes its colour from the
   * texture and ignores particlesColor — measured: a colour set with a texture
   * came out white, and one set after the data came out black. So the colour is
   * painted into the texture, which is made from the globe's own Texture class
   * (globe.gl does not expose three.js), and remade when the palette changes.
   */
  let dotTex = null, dotFor = "";
  function dotTexture() {
    const colour = accent();
    if (dotTex && dotFor === colour) return dotTex;
    const Tex = globe.globeMaterial?.().map?.constructor;
    if (!Tex) return null;
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d");
    g.fillStyle = colour;
    g.beginPath(); g.arc(32, 32, 24, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 0.35;
    g.beginPath(); g.arc(32, 32, 31, 0, Math.PI * 2); g.fill();
    dotTex = new Tex(c);
    dotTex.needsUpdate = true;
    dotFor = colour;
    return dotTex;
  }

  /** Every place in the vibe, lit on the globe: one layer, drawn above the dots. */
  function lightGlobe(list) {
    if (typeof globe === "undefined" || !globe) return;
    globe.particlesData([]);
    if (!list.length) return;
    const tex = dotTexture();
    // Accessors before the data: set after it, they are not applied.
    globe.particleLat("lat").particleLng("lng").particleAltitude(0.014)
      .particlesSize(11).particlesSizeAttenuation(false)
      .particlesColor(() => accent());
    if (tex) globe.particlesTexture(() => tex);
    globe.particlesData([list.map((p) => ({ lat: p.lat, lng: p.lon }))]);
  }

  function renderVibeList() {
    placeListEl.innerHTML = "";
    for (const p of vibeList) placeListEl.appendChild(placeRow({ ...p, count: p.n }));
    placeHeadEl.textContent = `${vibeNames[vibe]} · ${vibeList.length.toLocaleString()} places`;
    markPlaceSelection();
  }

  function paintChips() {
    for (const b of bar.querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset.vibe === vibe));
  }

  async function setVibe(id) {
    vibe = vibe === id ? null : id;
    paintChips();
    if (!vibe) { vibeList = []; lightGlobe([]); loadPlaces(""); return; }
    const want = vibe;
    const list = await window.auralfm.vibePlaces(want);
    if (vibe !== want) return;
    vibeList = list;
    renderVibeList();
    lightGlobe(list);
  }

  // Browsing places with a vibe on shows the vibe's places; a search still
  // searches everything.
  const loadPlacesBase = loadPlaces;
  // eslint-disable-next-line no-global-assign
  loadPlaces = async (query = "", ...rest) => {
    if (vibe && !String(query).trim()) return renderVibeList();
    return loadPlacesBase(query, ...rest);
  };

  // The chips belong to the places list: shown with it, hidden with it.
  new MutationObserver(() => { bar.hidden = placeListEl.hidden; })
    .observe(placeListEl, { attributes: true, attributeFilter: ["hidden"] });
  bar.hidden = placeListEl.hidden;

  window.auralfm.vibes?.().then((list) => {
    for (const m of list || []) {
      vibeNames[m.id] = m.name;
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.vibe = m.id;
      b.textContent = m.name;
      b.setAttribute("aria-pressed", "false");
      b.onclick = () => setVibe(m.id);
      bar.append(b);
    }
    // ?vibe=jazz, from the website's vibe pages: light that vibe once the
    // globe is up. Nothing plays; the places are lit and listed.
    const asked = new URLSearchParams(location.search).get("vibe");
    if (asked && vibeNames[asked]) {
      const started = Date.now();
      const wait = () => {
        if (document.body.classList.contains("revealed")) setTimeout(() => { if (vibe !== asked) setVibe(asked); }, 400);
        else if (Date.now() - started < 30000) setTimeout(wait, 250);
      };
      wait();
    }
  }).catch(() => { /* no vibes, no bar */ });
}
