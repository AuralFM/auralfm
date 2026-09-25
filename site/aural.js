/**
 * The front door's behaviours: the menu on small screens, headlines that
 * stretch out as they arrive, the one line fitted to the width of the screen,
 * the tagline lighting word by word, and the globe read aloud — local times in
 * the departures board and the live bar, turning over like a split-flap board.
 *
 * All of it is IntersectionObserver, a timer or a click — no scroll listener —
 * and all of it stands down for prefers-reduced-motion, where the page is simply
 * there and the clocks change without the flap.
 */
(() => {
  "use strict";
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const seen = (els, fn, margin = "0px 0px -10% 0px") => {
    if (still || !("IntersectionObserver" in window)) { for (const el of els) fn(el); return; }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { fn(e.target); io.unobserve(e.target); }
    }, { rootMargin: margin });
    for (const el of els) io.observe(el);
  };
  // Motion only starts hidden once this file is running, so a failed load
  // leaves every headline at its full width rather than stuck condensed.
  document.documentElement.classList.add("js");

  // ── the menu ──────────────────────────────────────────────────────────────
  const island = document.querySelector(".island");
  const burger = document.querySelector(".burger");
  const menu = document.getElementById("menu");
  if (island && burger && menu) {
    const set = (open) => {
      island.dataset.open = String(open);
      burger.setAttribute("aria-expanded", String(open));
      burger.setAttribute("aria-label", open ? "Close the menu" : "Open the menu");
      // The root, not the body: iOS Safari scrolls a page whose body is locked.
      document.documentElement.style.overflow = open ? "hidden" : "";
      if (open) {
        menu.hidden = false;
        requestAnimationFrame(() => requestAnimationFrame(() => menu.classList.add("open")));
        menu.querySelector("a")?.focus();
      } else {
        menu.classList.remove("open");
        const done = () => { if (island.dataset.open === "false") menu.hidden = true; };
        still ? done() : setTimeout(done, 500);
      }
    };
    burger.addEventListener("click", () => set(island.dataset.open !== "true"));
    menu.addEventListener("click", (e) => { if (e.target.closest("a")) set(false); });
    addEventListener("keydown", (e) => {
      if (e.key === "Escape" && island.dataset.open === "true") { set(false); burger.focus(); }
    });
    // Growing past the menu's layout with it open would strand a locked page.
    matchMedia("(max-width: 1080px)").addEventListener?.("change", (e) => { if (!e.matches) set(false); });
  }

  // ── headlines stretch out as they arrive ──────────────────────────────────
  seen(document.querySelectorAll(".stretch"), (el) => el.classList.add("in"));

  // ── one line, edge to edge ────────────────────────────────────────────────
  // Measured at the width the line ends on, so the stretch lands exactly on the
  // cell's edges rather than past them.
  const fits = [...document.querySelectorAll(".fit")];
  const probe = document.createElement("span");
  probe.style.cssText = "position:absolute;visibility:hidden;white-space:nowrap;left:-9999px;top:0;"
    + "font-variation-settings:'wdth' 100";
  document.body.append(probe);
  // On a phone one line would shrink to a whisper ("KEEP IT UNOWNED." fitted at
  // 25px), so there the line is let go and wraps at the size the stylesheet sets.
  const phone = matchMedia("(max-width: 760px)");
  function fit() {
    for (const el of fits) {
      if (phone.matches) { el.style.fontSize = ""; continue; }
      const cs = getComputedStyle(el);
      probe.style.font = `${cs.fontWeight} 100px/1 ${cs.fontFamily}`;
      probe.style.textTransform = cs.textTransform;
      probe.style.letterSpacing = "0";
      probe.textContent = el.textContent.trim();
      const room = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const size = Math.min(320, Math.floor((100 * room) / probe.getBoundingClientRect().width) - 1);
      el.style.fontSize = `${size}px`;
    }
  }
  if (fits.length) {
    fit();
    document.fonts?.ready.then(fit);
    let t; addEventListener("resize", () => { clearTimeout(t); t = setTimeout(fit, 100); });
  }

  // ── the tagline, one word at a time ───────────────────────────────────────
  // Split into spans for the colour, with the sentence kept whole for a screen
  // reader: the spans are hidden from it and the original text is its label.
  const words = document.querySelector(".tagline .words");
  if (words) {
    const text = words.textContent.replace(/\s+/g, " ").trim();
    words.setAttribute("aria-label", text);
    words.setAttribute("role", "text");
    words.textContent = "";
    const spans = [];
    for (const sentence of text.split(/(?<=\.)\s+/)) {
      const line = document.createElement("span");
      line.className = "line";
      line.setAttribute("aria-hidden", "true");
      sentence.split(" ").forEach((w, i, all) => {
        const s = document.createElement("span");
        s.className = "w";
        s.textContent = w + (i < all.length - 1 ? " " : "");
        line.append(s);
        spans.push(s);
      });
      words.append(line);
    }
    seen(spans, (s) => s.classList.add("on"), "0px 0px -35% 0px");
  }

  // ── the split-flap ────────────────────────────────────────────────────────
  // Each character turns over through the alphabet and settles left to right,
  // the way a station's departure board does. Spaces and colons hold still.
  const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  function flapTo(el, text) {
    clearInterval(el.flapTimer);
    if (still) { el.textContent = text; return; }
    const len = Math.max(el.textContent.length, text.length);
    let frame = 0;
    el.flapTimer = setInterval(() => {
      let out = "";
      for (let i = 0; i < len; i++) {
        const ch = text[i] ?? " ";
        out += frame >= i + 5 || ch === " " || ch === ":" || ch === "·"
          ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0];
      }
      el.textContent = out;
      if (++frame > len + 5) { clearInterval(el.flapTimer); el.textContent = text; }
    }, 42);
  }

  // ── the globe, read aloud: local times ────────────────────────────────────
  const rows = [...document.querySelectorAll(".departures tbody tr[data-tz]")];
  const clockOf = (tz) => {
    try {
      return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz }).format(new Date());
    } catch { return "--:--"; }
  };
  let boardShown = false;
  const sum = document.querySelector("[data-board-sum]");
  /** "5/8 of these cities are in the dark", and which ones have the daylight. */
  function paintSum() {
    if (!sum) return;
    const night = rows.filter((tr) => tr.classList.contains("night"));
    const day = rows.filter((tr) => !tr.classList.contains("night")).map((tr) => tr.querySelector("th").textContent);
    sum.querySelector(".sum-big").innerHTML = `${night.length}<span>/${rows.length}</span>`;
    sum.querySelector(".sum-text").innerHTML =
      `of these cities are in the dark right now &mdash; when radio is most itself: the overnight shows, the stations nobody is watching.`
      + (day.length ? ` <b>Daylight:</b> ${day.map((d) => d.replace(/[&<>]/g, "")).join(", ")}.` : "");
    sum.setAttribute("aria-label", `${night.length} of ${rows.length} cities are in the dark right now.`);
  }
  function paintBoard() {
    rows.forEach((tr, i) => {
      const cell = tr.querySelector(".clock");
      const now = clockOf(tr.dataset.tz);
      const h = Number(now.slice(0, 2));
      tr.classList.toggle("night", h < 6 || h >= 20);
      if (cell.textContent === now) return;
      if (!boardShown) { cell.textContent = now; return; }
      setTimeout(() => flapTo(cell, now), i * 70);
    });
    paintSum();
  }
  if (rows.length) {
    paintBoard();
    // The first turn-over happens where it can be seen.
    seen([document.querySelector(".departures")], () => {
      boardShown = true;
      rows.forEach((tr, i) => {
        const cell = tr.querySelector(".clock");
        const now = cell.textContent;
        cell.textContent = "--:--";
        setTimeout(() => flapTo(cell, now), i * 90);
      });
    });
    setInterval(paintBoard, 15000);
  }

  // ── the live globe ─────────────────────────────────────────────────────────
  /**
   * The hero's globe, live: spin it, zoom it, find a place. No audio — the site
   * shows the world and listen.auralfm.xyz plays it — and a place you pick opens
   * there. The picture stays until the globe is ready, and the globe (about
   * 3.3 MB: the library, the Earth, 12,579 places) is fetched only when somebody
   * reaches for it — a tap on the picture, or on a wide screen once the page has
   * settled — never on a phone's first paint, never with data saver on.
   *
   * The dots are one merged shape, as in the app (12,579 separate ones is 12,579
   * draw calls), so a dot cannot be hovered or clicked itself. A hover or tap
   * finds the nearest place to that point on the Earth instead, names it, and
   * offers the link; a drag is a drag and never navigates.
   */
  const fig = document.querySelector("[data-live-globe]");
  if (fig) {
    const box = fig.querySelector(".globe-live");
    const goBtn = fig.querySelector(".globe-go");
    const pick = fig.querySelector(".globe-pick");
    let started = false;
    const script = (src) => new Promise((ok, no) => {
      const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = no; document.head.append(s);
    });
    const base = fig.dataset.liveGlobe || "assets/globe/";
    async function start() {
      if (started) return;
      started = true;
      fig.classList.add("loading");
      goBtn.textContent = "Loading the globe…";
      let places;
      try {
        [, places] = await Promise.all([script(base + "globe.gl.min.js"), fetch(base + "places.json").then((r) => r.json())]);
      } catch {
        fig.classList.remove("loading"); started = false; goBtn.textContent = "Spin the globe"; return;
      }
      const pts = places.map(([lat, lng, n, title, country]) => ({ lat, lng, n, title, country }));
      // eslint-disable-next-line no-undef
      const globe = Globe()(box)
        .width(box.clientWidth).height(box.clientHeight)
        .backgroundColor("#000000")
        .globeImageUrl(base + "earth.jpg")
        .showAtmosphere(true).atmosphereColor("#8ab4f8").atmosphereAltitude(0.17)
        .pointsData(pts).pointLat("lat").pointLng("lng")
        .pointColor(() => "#02E8CD")
        .pointRadius((d) => 0.1 + Math.sqrt(d.n) * 0.016)
        .pointAltitude(0.004)
        .pointsMerge(true)
        // "is-live", not "live": .live is the header's 8px dot, and the figure became one.
        .onGlobeReady(() => { fig.classList.remove("loading"); fig.classList.add("is-live"); });
      globe.pointOfView({ lat: 12, lng: 8, altitude: 1.9 }, 0);
      const c = globe.controls();
      c.enableDamping = true; c.dampingFactor = 0.08; c.rotateSpeed = 0.7;
      c.minDistance = 130; c.maxDistance = 520;
      c.autoRotate = !still; c.autoRotateSpeed = 0.35;
      addEventListener("resize", () => globe.width(box.clientWidth).height(box.clientHeight));

      const rad = Math.PI / 180;
      const nearest = (lat, lng) => {
        const alt = globe.pointOfView().altitude;
        const limit = Math.max(0.6, 2.4 * alt);          // degrees: tighter as you zoom in
        let best = null, bestD = limit;
        for (const p of pts) {
          const d = Math.acos(Math.min(1, Math.sin(lat * rad) * Math.sin(p.lat * rad)
            + Math.cos(lat * rad) * Math.cos(p.lat * rad) * Math.cos((p.lng - lng) * rad))) / rad;
          if (d < bestD) { bestD = d; best = p; }
        }
        return best;
      };
      const show = (p, pinned) => {
        if (!p) { if (!pinned) pick.hidden = true; return; }
        const href = `https://listen.auralfm.xyz/?place=${encodeURIComponent(p.title)}&country=${encodeURIComponent(p.country)}`;
        pick.innerHTML = `<span class="pick-name"></span><span class="pick-meta"></span><a class="pick-go" href="${href}">Listen here →</a>`;
        pick.querySelector(".pick-name").textContent = p.title;
        pick.querySelector(".pick-meta").textContent = `${p.country} · ${p.n} station${p.n === 1 ? "" : "s"}`;
        pick.hidden = false;
      };
      const at = (e) => {
        const r = box.getBoundingClientRect();
        return globe.toGlobeCoords(e.clientX - r.left, e.clientY - r.top);
      };
      let downAt = null;
      box.addEventListener("pointerdown", (e) => { downAt = [e.clientX, e.clientY]; c.autoRotate = false; });
      box.addEventListener("pointerup", (e) => {
        if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) return;   // a drag
        const g = at(e);
        if (g) show(nearest(g.lat, g.lng), true);
      });
      let t = 0;
      box.addEventListener("pointermove", (e) => {
        if (e.pointerType !== "mouse" || e.buttons || performance.now() - t < 60) return;
        t = performance.now();
        const g = at(e);
        if (g) show(nearest(g.lat, g.lng), false);
      });
    }
    goBtn.addEventListener("click", start);
    fig.querySelector("img")?.addEventListener("click", start);
    const roomy = matchMedia("(min-width: 1024px) and (pointer: fine)").matches;
    const saving = navigator.connection?.saveData;
    if (roomy && !saving) {
      addEventListener("load", () => (window.requestIdleCallback || setTimeout)(start, { timeout: 2500 }));
    }
  }

  // ── the live bar: one place at a time ─────────────────────────────────────
  // The departures board's cities where there is one; pages without it (the
  // support page) read the same places from here, so the bar never stands still
  // on a time that is not true.
  const PLACES = rows.length
    ? rows.map((tr) => [tr.dataset.tz, tr.querySelector("th").textContent])
    : [["Africa/Lagos", "Lagos"], ["America/Chicago", "Chicago"], ["Asia/Tokyo", "Tokyo"],
       ["Asia/Tbilisi", "Tbilisi"], ["America/Mexico_City", "Mexico City"], ["Atlantic/Reykjavik", "Reykjavík"]];
  const bar = document.querySelector("[data-cycle]");
  if (bar) {
    let at = 0;
    const next = () => {
      const [tz, city] = PLACES[at++ % PLACES.length];
      flapTo(bar, `${clockOf(tz)} ${city.toUpperCase()}`);
    };
    next();
    // Every 6.5s: often enough to feel alive, not so often it pulls the eye.
    if (!still) setInterval(next, 6500);
  }
})();
