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

  // ── light and dark ────────────────────────────────────────────────────────
  // The system decides until someone presses the half moon; then their choice
  // is kept (auralfm.theme) and put on <html> before the page paints, by the
  // one-line script sync-sites.mjs writes into every page's head.
  {
    const root = document.documentElement;
    const sys = matchMedia("(prefers-color-scheme: light)");
    const current = () => root.dataset.theme || (sys.matches ? "light" : "dark");
    const meta = document.querySelector('meta[name="theme-color"]');
    const paintMeta = () => meta?.setAttribute("content", current() === "light" ? "#FFFFFF" : "#0C0B0B");
    const bar = document.querySelector(".island");
    if (bar) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "cell themebtn";
      b.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><circle cx="10" cy="10" r="8.25" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10 1.75a8.25 8.25 0 0 1 0 16.5z" fill="currentColor"/></svg>';
      const label = () => {
        const next = current() === "light" ? "dark" : "light";
        b.setAttribute("aria-label", `Switch to the ${next} theme`);
        b.title = `Switch to the ${next} theme`;
      };
      b.addEventListener("click", () => {
        const next = current() === "light" ? "dark" : "light";
        root.dataset.theme = next;
        try { localStorage.setItem("auralfm.theme", next); } catch {}
        label(); paintMeta();
      });
      sys.addEventListener?.("change", () => { label(); paintMeta(); });
      bar.insertBefore(b, bar.querySelector(".go") || bar.querySelector(".burger"));
      label(); paintMeta();
    }
  }

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
  probe.style.cssText = "position:fixed;visibility:hidden;white-space:nowrap;left:0;top:0;pointer-events:none;"
    + "font-variation-settings:'wdth' 100";
  document.body.append(probe);
  // On a phone one line would shrink to a whisper ("KEEP IT UNOWNED." fitted at
  // 25px), so there the line is let go and wraps at the size the stylesheet sets.
  const phone = matchMedia("(max-width: 760px)");
  // Phones keep the stylesheet's size and wrap, unless one word alone would
  // not fit ("INDEPENDENT." ran 100px off a 375pt screen): then the size comes
  // down just enough for the longest word, measured at the phone's condensed width.
  function fitPhone(el) {
    el.style.fontSize = "";
    const cs = getComputedStyle(el);
    probe.style.font = `${cs.fontWeight} 100px/1 ${cs.fontFamily}`;
    probe.style.textTransform = cs.textTransform;
    probe.style.fontVariationSettings = cs.fontVariationSettings;
    const room = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    let widest = 0;
    for (const word of el.textContent.trim().split(/\s+/)) {
      probe.textContent = word;
      widest = Math.max(widest, probe.getBoundingClientRect().width);
    }
    probe.style.fontVariationSettings = "'wdth' 100";
    const size = Math.floor((100 * room) / widest) - 1;
    if (size < parseFloat(cs.fontSize)) el.style.fontSize = `${size}px`;
  }
  function fit() {
    for (const el of fits) {
      if (phone.matches) { fitPhone(el); continue; }
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
    const day = rows.filter((tr) => !tr.classList.contains("night")).map((tr) => tr.dataset.city || tr.querySelector("th").textContent);
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
      // Where the needle sits on the row's 24-hour dial.
      if (!Number.isNaN(h)) tr.style.setProperty("--day", ((h * 60 + Number(now.slice(3, 5))) / 1440).toFixed(4));
      if (cell.textContent === now) return;
      if (!boardShown) { cell.textContent = now; return; }
      setTimeout(() => flapTo(cell, now), i * 70);
    });
    paintSum();
  }
  /**
   * Ten cities, not the same eight every visit: the board opens on ten picked
   * from forty, and every few seconds one row turns over, split-flap, to a city
   * not on it. Each keeps what it is known for on the air there.
   */
  const CITIES = [
    ["Africa/Lagos", "Lagos", "Afrobeats · talk"], ["America/Chicago", "Chicago", "House"],
    ["Asia/Tokyo", "Tokyo", "Jazz"], ["Asia/Tbilisi", "Tbilisi", "Techno"],
    ["America/Mexico_City", "Mexico City", "Cumbia · news"], ["America/Detroit", "Detroit", "Techno · gospel"],
    ["Atlantic/Reykjavik", "Reykjavík", "Ambient"], ["Asia/Jakarta", "Jakarta", "Dangdut · pop"],
    ["America/New_York", "New York", "Hip hop · talk"], ["Europe/Paris", "Paris", "Chanson · news"],
    ["America/Jamaica", "Kingston", "Reggae · dancehall"], ["Africa/Accra", "Accra", "Highlife"],
    ["Africa/Nairobi", "Nairobi", "Benga · talk"], ["Africa/Kinshasa", "Kinshasa", "Rumba"],
    ["Africa/Johannesburg", "Johannesburg", "Amapiano"], ["Africa/Cairo", "Cairo", "Shaabi · talk"],
    ["Europe/Istanbul", "Istanbul", "Arabesk"], ["Asia/Beirut", "Beirut", "Tarab · talk"],
    ["Asia/Kolkata", "Mumbai", "Filmi · news"], ["Asia/Dhaka", "Dhaka", "Baul · news"],
    ["Asia/Seoul", "Seoul", "K-indie · talk"], ["Asia/Manila", "Manila", "OPM"],
    ["America/Argentina/Buenos_Aires", "Buenos Aires", "Tango · talk"], ["America/Sao_Paulo", "São Paulo", "Samba · funk"],
    ["America/Lima", "Lima", "Chicha · cumbia"], ["America/Bogota", "Bogotá", "Vallenato"],
    ["America/Havana", "Havana", "Son · salsa"], ["America/Port-au-Prince", "Port-au-Prince", "Kompa"],
    ["Africa/Dakar", "Dakar", "Mbalax"], ["Africa/Addis_Ababa", "Addis Ababa", "Ethio-jazz"],
    ["Asia/Ulaanbaatar", "Ulaanbaatar", "Folk · news"], ["Europe/Berlin", "Berlin", "Techno"],
    ["Europe/London", "London", "Grime · talk"], ["Europe/Lisbon", "Lisbon", "Fado"],
    ["America/Chicago", "New Orleans", "Jazz · brass"], ["America/Toronto", "Montréal", "Indie · talk"],
    ["Australia/Sydney", "Sydney", "Indie · talk"], ["Pacific/Auckland", "Auckland", "Reggae · talk"],
    ["America/Los_Angeles", "Los Angeles", "Soul · talk"], ["Asia/Bangkok", "Bangkok", "Luk thung"],
  ];
  const onBoard = () => rows.map((tr) => tr.dataset.city);
  const put = (tr, [tz, city, kind], turn) => {
    tr.dataset.tz = tz;
    tr.dataset.city = city;
    const name = tr.querySelector("th .flap") || tr.querySelector("th");
    if (turn) flapTo(name, city); else name.textContent = city;
    const k = tr.querySelector("td:last-child");
    if (turn) flapTo(k, kind); else k.textContent = kind;
  };
  if (rows.length) {
    // A fresh ten each visit.
    const pool = CITIES.slice().sort(() => Math.random() - 0.5);
    rows.forEach((tr, i) => put(tr, pool[i], false));
    paintBoard();
    if (!still) setInterval(() => {
      if (!boardShown || document.hidden) return;
      const on = new Set(onBoard());
      const next = CITIES.filter((c) => !on.has(c[1]));
      const tr = rows[Math.floor(Math.random() * rows.length)];
      put(tr, next[Math.floor(Math.random() * next.length)], true);
      paintBoard();
    }, 6000);
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

  // ── the bands never run out ───────────────────────────────────────────────
  // Each strip slides by half its text, so the text has to be at least twice
  // as wide as the strip or the end shows on a wide screen. Doubled until it is.
  const fillBands = () => {
    for (const span of document.querySelectorAll(".band-strip span")) {
      const strip = span.parentElement;
      span.dataset.unit ||= span.textContent;
      span.textContent = span.dataset.unit;
      while (span.scrollWidth < strip.clientWidth * 2.2 && span.textContent.length < 40000) span.textContent += span.textContent;
    }
  };
  fillBands();
  addEventListener("resize", () => { clearTimeout(fillBands.t); fillBands.t = setTimeout(fillBands, 200); });

  // ── on air now ────────────────────────────────────────────────────────────
  // The light over the bands: a city where it is evening or night, its time,
  // turning over to another every few seconds. Somewhere it is always late.
  const onair = document.querySelector("[data-onair]");
  if (onair) {
    const late = () => CITIES.filter(([tz]) => { const h = +clockOf(tz).slice(0, 2); return h >= 19 || h < 5; });
    const tick = () => {
      const pool = late().length ? late() : CITIES;
      const [tz, city] = pool[Math.floor(Math.random() * pool.length)];
      flapTo(onair, `${clockOf(tz)} · ${city}`);
    };
    tick();
    if (!still) setInterval(() => { if (!document.hidden) tick(); }, 7000);
  }

  // ── the live globe ─────────────────────────────────────────────────────────
  /**
   * The hero's globe, live: spin it, zoom it, find a place. No audio — the site
   * shows the world and listen.auralfm.xyz plays it — and a place you pick opens
   * there. The picture shows until the globe is ready; the globe starts loading
   * as soon as this script runs, except with data saver on.
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
      // The wave from the app's own loading screens, before the words.
      goBtn.innerHTML = '<span class="wave" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>Loading the globe…';
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
        // See-through: the stars are the figure's own (aural.css, .globe), crisp
        // at any size and slowly twinkling, rather than a picture stretched
        // over a sphere.
        .backgroundColor("rgba(0,0,0,0)")
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
      // A plain scroll wheel scrolls the page, not the globe: it sits at the top,
      // and zooming it instead trapped anyone just scrolling past. A pinch (which
      // a trackpad sends as ctrl+wheel), ⌘ or ctrl with the wheel, or two fingers
      // on a phone, zoom.
      box.addEventListener("wheel", (e) => { c.enableZoom = e.ctrlKey || e.metaKey; }, { capture: true, passive: true });
      box.addEventListener("touchstart", (e) => { c.enableZoom = e.touches.length > 1; }, { capture: true, passive: true });
      // Turning slowly, always: a touch stops it, and it picks up again a few
      // seconds after the hand lets go.
      c.autoRotate = !still; c.autoRotateSpeed = 0.28;
      let resume = 0;
      const rest = () => { clearTimeout(resume); if (!still) resume = setTimeout(() => { c.autoRotate = true; }, 5000); };
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
        flapTo(pick.querySelector(".pick-name"), p.title);   // turns over, as the board does
        pick.querySelector(".pick-meta").textContent = `${p.country} · ${p.n} station${p.n === 1 ? "" : "s"}`;
        pick.hidden = false;
      };
      const at = (e) => {
        const r = box.getBoundingClientRect();
        return globe.toGlobeCoords(e.clientX - r.left, e.clientY - r.top);
      };
      let downAt = null;
      box.addEventListener("pointerdown", (e) => { downAt = [e.clientX, e.clientY]; c.autoRotate = false; clearTimeout(resume); });
      box.addEventListener("pointerup", (e) => {
        rest();
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
    // Straight away, on every screen: waiting for the page to settle made the
    // globe the last thing to arrive, and it is the first thing people look at.
    // The Earth is 2048px now (440 KB, not 1.4 MB) and the rest travels
    // compressed, so this is about 1.3 MB. Only data saver keeps the picture.
    if (!navigator.connection?.saveData) start();
  }

  // ── the Discord ───────────────────────────────────────────────────────────
  // Links to it wait here until there is a server to link to: set the invite and
  // every [data-discord] on the three sites shows and points at it.
  const DISCORD = "";
  for (const a of document.querySelectorAll("[data-discord]")) {
    if (DISCORD) { a.href = DISCORD; a.hidden = false; a.rel = "noopener"; }
  }

  // ── the waitlists ─────────────────────────────────────────────────────────
  // The desktop beta (beta/) and sponsorship (support/#waitlist). Each form posts
  // to its own collection, declared in home/.herenow/data.json: anyone can add a
  // name, only we can read them back, and each connection is capped. This only
  // says what is wrong in words before the server has to.
  for (const form of document.querySelectorAll("[data-waitlist]")) {
    const name = form.elements.name, email = form.elements.email;
    const status = form.querySelector(".form-status");
    const btn = form.querySelector("button[type=submit]");
    const label = btn.textContent;
    const say = (text, kind) => { status.textContent = text; status.className = `form-status ${kind || ""}`; };
    const wrong = (input, text) => {
      const err = document.getElementById(input.getAttribute("aria-describedby"));
      err.textContent = text; err.hidden = !text;
      input.setAttribute("aria-invalid", text ? "true" : "false");
    };
    for (const input of [name, email])
      input.addEventListener("input", () => { if (input.getAttribute("aria-invalid") === "true" && input.value.trim()) wrong(input, ""); });
    const choice = form.dataset.choice;
    // More fields than name and email (the station claim form): data-extra names
    // them, and any that are filled in are sent too. data-prefill fills fields
    // from the address, so a station's "Claim its page" arrives already named.
    const extra = (form.dataset.extra || "").split(",").map((f) => f.trim()).filter(Boolean);
    if (form.dataset.prefill) {
      const q = new URLSearchParams(location.search);
      for (const pair of form.dataset.prefill.split(",")) {
        const [param, field] = pair.split(":").map((x) => x.trim());
        if (q.get(param) && form.elements[field]) form.elements[field].value = q.get(param).slice(0, 200);
      }
    }
    const lightning = form.elements.lightning;
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      say("");
      const who = name.value.trim(), value = email.value.trim();
      let bad = null;
      if (!who) { wrong(name, "Tell us your name."); bad ||= name; } else wrong(name, "");
      if (!value) { wrong(email, "Enter your email address."); bad ||= email; }
      else if (!email.validity.valid || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        wrong(email, "That email address does not look right. Check it and try again."); bad ||= email;
      } else wrong(email, "");
      // A Lightning address looks like an email address: name@wallet.example.
      if (lightning && lightning.value.trim() && !/^[\w.+-]+@[\w.-]+\.[a-z]{2,}$/i.test(lightning.value.trim())) {
        wrong(lightning, "A Lightning address looks like name@wallet.example. Check it and try again."); bad ||= lightning;
      } else if (lightning) wrong(lightning, "");
      // Age, as the box says: 13 and over for a list (COPPA: we do not collect
      // from children), 18 and over to claim a station, which can take money.
      const age = form.elements.age;
      if (age && !age.checked) {
        const err = document.getElementById(age.getAttribute("aria-describedby"));
        err.textContent = `Confirm you are ${parseInt(age.value, 10)} or older to send this.`; err.hidden = false;
        age.setAttribute("aria-invalid", "true"); bad ||= age;
      } else if (age) { document.getElementById(age.getAttribute("aria-describedby")).hidden = true; age.setAttribute("aria-invalid", "false"); }
      if (bad) { bad.focus(); return; }
      const done = () => { form.classList.add("sent"); say(form.dataset.done, "ok"); };
      // A person never fills in the hidden field. Tell a bot it worked and send nothing.
      if (form.elements.website.value) { done(); return; }
      btn.disabled = true; btn.textContent = "Sending…";
      try {
        const note = form.elements.note?.value.trim();
        const res = await fetch(form.dataset.waitlist, {
          method: "POST",
          headers: { "content-type": "application/json", "Idempotency-Key": crypto.randomUUID() },
          body: JSON.stringify({ name: who, email: value, ...(choice ? { [choice]: form.elements[choice].value } : {}),
            ...(age ? { age: age.value } : {}),
            ...(note ? { note } : {}),
            ...Object.fromEntries(extra.map((f) => [f, form.elements[f]?.value.trim()]).filter(([, v]) => v)) }),
        });
        if (res.ok) { done(); return; }
        const body = JSON.stringify(await res.json().catch(() => ({})));
        if (res.status === 429) say("Too many sign-ups from this connection. Try again in an hour.", "bad");
        else if ((res.status === 400 || res.status === 422) && /email/i.test(body))
          wrong(email, "That email address does not look right. Check it and try again.");
        else if (res.status === 400 || res.status === 422) say("Something in the form was not accepted. Check it and try again.", "bad");
        else say("The list could not be reached. Try again in a minute.", "bad");
      } catch {
        say("The list could not be reached. Check your connection and try again.", "bad");
      } finally {
        btn.disabled = false; btn.textContent = label;
      }
    });
  }
  // A tier's "Join the waitlist" chooses that tier in the form it jumps to.
  for (const a of document.querySelectorAll("[data-pick]")) {
    a.addEventListener("click", () => {
      const r = document.querySelector(`input[name="tier"][value="${a.dataset.pick}"]`);
      if (r) r.checked = true;
    });
  }

  // ── a directory's filter ──────────────────────────────────────────────────
  // The vibe pages list every place with its stations; typing narrows them.
  // Each row carries its own words (data-q) so this never reads the DOM text.
  for (const input of document.querySelectorAll("[data-filter]")) {
    const list = document.querySelector(input.dataset.filter);
    const rows = [...list.children];
    const count = document.getElementById("dir-count");
    const none = list.parentElement.querySelector(".dir-none");
    const total = Number(count?.dataset.total) || rows.length;
    const word = (n) => `${n.toLocaleString("en-US")} ${n === 1 ? "place" : "places"}`;
    let t = 0;
    input.addEventListener("input", () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const terms = input.value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(/\s+/).filter(Boolean);
        let shown = 0;
        for (const row of rows) {
          const hit = terms.every((w) => row.dataset.q.includes(w));
          row.hidden = !hit;
          if (hit) shown++;
        }
        if (count) count.textContent = terms.length ? `${word(shown)} of ${total.toLocaleString("en-US")}` : word(total);
        if (none) none.hidden = shown > 0;
      }, 80);
    });
  }

  // ── a station, opened in place ─────────────────────────────────────────────
  // On a vibe page every station's name is a link to it in the app. Here it
  // becomes the button the app's own rows are: press it and what the station
  // says about itself opens under its name, with its links, a way to play it
  // on the globe, and "Claim this station". The profile is the app's own file
  // (listen.auralfm.xyz/data/profiles/<xx>.json, 256 of them by a hash of the
  // station's id; src/profiles.js has the same hash), fetched once per file and
  // only when somebody opens a station in it.
  if (document.querySelector(".vst > li > a")) {
    const APP = "https://listen.auralfm.xyz/";
    const SOCIAL = [["instagram", "Instagram"], ["facebook", "Facebook"], ["x", "X"], ["youtube", "YouTube"],
      ["tiktok", "TikTok"], ["soundcloud", "SoundCloud"], ["mixcloud", "Mixcloud"], ["spotify", "Spotify"],
      ["bluesky", "Bluesky"], ["mastodon", "Mastodon"], ["telegram", "Telegram"], ["whatsapp", "WhatsApp"]];
    const NOWHERE = /^(Across |Somewhere in |Online, no country$|Online only$)/;
    const safe = (u) => (typeof u === "string" && /^https?:\/\/[^\s"'<>]+$/i.test(u) ? u : null);
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
    const link = (href, text, cls) => { const a = el("a", cls, text); a.href = href; a.target = "_blank"; a.rel = "noopener noreferrer"; return a; };
    const shardOf = (id) => {
      let h = 0x811c9dc5;
      for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 0x01000193); }
      return ((h >>> 0) & 0xff).toString(16).padStart(2, "0");
    };
    const shards = new Map();
    const profile = async (id) => {
      const s = shardOf(id);
      if (!shards.has(s)) shards.set(s, fetch(`${APP}data/profiles/${s}.json`).then((r) => (r.ok ? r.json() : {})).catch(() => ({})));
      return (await shards.get(s))[id] || null;
    };

    function paint(box, p, id, title) {
      box.textContent = "";
      if (p) {
        const town = NOWHERE.test(p.place || "") ? null : p.place;
        const lang = p.lang && /^[a-z]{2}([-_][a-z]{2})?$/i.test(p.lang)
          ? (() => { try { return new Intl.DisplayNames([navigator.language || "en"], { type: "language" }).of(p.lang.toLowerCase().split(/[-_]/)[0]); } catch { return null; } })()
          : null;
        const facts = [town, p.region && p.region !== town ? p.region : null, p.country, lang, p.bitrate ? `${p.bitrate} kbps` : null].filter(Boolean).join(" · ");
        const head = el("div", "sp-head");
        // https only: a picture over http is refused on an https page anyway.
        if (/^https:\/\//.test(p.image || "") && safe(p.image)) {
          const img = el("img", "sp-logo");
          img.alt = ""; img.decoding = "async"; img.referrerPolicy = "no-referrer";
          img.width = img.height = 44;
          // Shown once it has arrived: a logo that never loads leaves no grey box.
          img.onload = () => { if (box.isConnected) head.prepend(img); };
          img.src = p.image;
        }
        if (facts) head.append(el("p", "sp-where", facts));
        box.append(head);
        // Thirty words at most, as in the app: a taste of the station, not its page.
        if (p.description) {
          const words = p.description.trim().split(/\s+/);
          const d = el("p", "sp-desc", words.length > 30 ? `${words.slice(0, 30).join(" ").replace(/[,;:.\-–—]+$/, "")}…` : p.description);
          d.dir = "auto";
          box.append(d);
        }
        const chips = [...(p.genres || []).slice(0, 4), ...(p.moods || []).slice(0, 3)];
        if (chips.length) { const row = el("p", "sp-chips"); for (const c of chips) row.append(el("span", "", c)); box.append(row); }
      } else {
        box.append(el("p", "sp-none", "Nothing more about this station yet."));
      }
      const links = el("p", "sp-links");
      const play = link(`${APP}?station=${encodeURIComponent(id)}`, "Play on the globe ", "sp-play");
      const arrow = el("span", "", "→"); arrow.setAttribute("aria-hidden", "true");   // drawn, not read out
      play.append(arrow);
      links.append(play);
      const site = safe(p?.website);
      if (site) links.append(link(site, "Website"));
      for (const [k, name] of SOCIAL) { const u = safe(p?.social?.[k]); if (u) links.append(link(u, name)); }
      // The station's own donation page, when it has published one: opened on
      // the station's site, never through us, and not where tips cannot be sent.
      if (p && !p.noTips && /^https:\/\//.test(p.donate || "") && safe(p.donate)) links.append(link(p.donate, "Donate"));
      box.append(links);
      const claim = el("p", "sp-claim", "Run this station? ");
      claim.append(link(`https://docs.auralfm.xyz/claim/?station=${encodeURIComponent(title)}&id=${encodeURIComponent(id)}`, "Claim this station"));
      box.append(claim);
    }

    async function toggle(b) {
      const li = b.parentElement, open = b.getAttribute("aria-expanded") === "true";
      if (open) { li.querySelector(".sp")?.remove(); b.setAttribute("aria-expanded", "false"); return; }
      const id = new URL(b.href).searchParams.get("station") || "", title = b.textContent.trim(), box = el("div", "sp");
      box.id = `sp-${id}`;
      box.setAttribute("role", "region");
      box.setAttribute("aria-label", title);
      box.append(el("p", "sp-none", "Looking…"));
      li.append(box);
      b.setAttribute("aria-controls", box.id);
      b.setAttribute("aria-expanded", "true");
      const p = await profile(id);
      if (box.isConnected) paint(box, p, id, title);
    }

    for (const b of document.querySelectorAll(".vst > li > a")) { b.setAttribute("role", "button"); b.setAttribute("aria-expanded", "false"); }
    document.addEventListener("click", (e) => {
      const b = e.target.closest?.(".vst > li > a");
      // A new tab or window was asked for: let the link be a link.
      if (!b || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button) return;
      e.preventDefault();
      toggle(b);
    });
    // A button answers to Space as well as Enter.
    document.addEventListener("keydown", (e) => {
      if (e.key !== " " || !e.target.matches?.(".vst > li > a")) return;
      e.preventDefault();
      toggle(e.target);
    });
  }

  // ── line drawings that draw themselves in ──────────────────────────────────
  // CSS draws a stroke in by animating its dash offset from its full length to
  // zero. Each shape's real length is measured here and handed to CSS as --len.
  // (Used by the stepped frame; the vibe icons are filled drawings and wipe in.)
  // (pathLength="1" did this in Chrome, but Safari ignores it on circles and
  // rectangles, which drew dotted or not at all.) Without script, --len is
  // unset and every line simply shows whole.
  const measure = (root) => {
    for (const el of root.querySelectorAll("path, circle, rect, line, polyline")) {
      try { el.style.setProperty("--len", el.getTotalLength().toFixed(1)); } catch { /* not rendered */ }
    }
  };

  // ── the stepped frame ─────────────────────────────────────────────────────
  // A heavy outline stepping round a [data-frame] block, after архитекторы.рф,
  // drawn in once when the block comes into view. It opens at the top left,
  // where the block's label and headline start, and steps once at the bottom
  // right. Drawn in real pixels for the block's current size (not a scaled
  // 100 × 100 box), so its line weight and length are exact in every browser;
  // redrawn when the block resizes. CSS hides it on phones.
  const framed = document.querySelectorAll("[data-frame]");
  if (framed.length) {
    const NS = "http://www.w3.org/2000/svg";
    const seen = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add("in"); seen.unobserve(e.target); }
    }, { threshold: 0.35 });
    const draw = (svg, path) => {
      const w = svg.clientWidth, h = svg.clientHeight;
      if (!w || !h) return;
      svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
      const X = (f) => (f * w).toFixed(1), Y = (f) => (f * h).toFixed(1);
      path.setAttribute("d", `M${X(0.6)} 0H${w}V${Y(0.82)}H${X(0.93)}V${h}H0V${Y(0.56)}`);
      measure(svg);
    };
    for (const el of framed) {
      const svg = document.createElementNS(NS, "svg");
      svg.setAttribute("class", "stepframe");
      svg.setAttribute("aria-hidden", "true");
      const path = document.createElementNS(NS, "path");
      svg.append(path);
      el.prepend(svg);
      draw(svg, path);
      new ResizeObserver(() => draw(svg, path)).observe(svg);
      if (still) svg.classList.add("in"); else seen.observe(svg);
    }
  }

  // ── the live bar: one place at a time ─────────────────────────────────────
  // "04:12 in Lagos · Cool FM 96.9": the time people there would tell you, and a
  // station broadcasting from there, the whole bar a link that opens the place
  // in the app. It used to flap through random letters on the way to a bare
  // "04:12 LAGOS", which read as noise until it landed and never said what it
  // was. The cities and stations are assets/live.json, written from the
  // catalogue by scripts/build-home-globe.mjs; until it arrives (or if it
  // cannot), the bar keeps to a few cities it knows, without stations.
  const bar = document.querySelector("[data-cycle]");
  if (bar) {
    const cell = bar.closest(".livebar");
    const link = document.createElement("a");
    link.className = cell.className + " livelink";
    link.href = "https://listen.auralfm.xyz/";
    link.innerHTML = '<span class="live" aria-hidden="true"></span><span class="lb" data-lb></span>';
    cell.replaceWith(link);
    const slot = link.querySelector("[data-lb]");
    let cities = [["Africa/Lagos", "Lagos", "", "", []], ["America/Mexico_City", "Mexico City", "", "", []],
      ["Asia/Tbilisi", "Tbilisi", "", "", []], ["Asia/Jakarta", "Jakarta", "", "", []]];
    let at = Math.floor(Math.random() * 1000);
    const paint = () => {
      const [tz, city, title, country, names] = cities[at++ % cities.length];
      const station = names.length ? names[Math.floor(Math.random() * names.length)] : "";
      slot.innerHTML = '<span class="lb-now"><b></b> in <span class="lb-city"></span></span>'
        + (station ? '<span class="lb-st"></span>' : "");
      slot.querySelector("b").textContent = clockOf(tz);
      slot.querySelector(".lb-city").textContent = city;
      if (station) slot.querySelector(".lb-st").textContent = station;
      link.href = title
        ? `https://listen.auralfm.xyz/?place=${encodeURIComponent(title)}&country=${encodeURIComponent(country)}`
        : "https://listen.auralfm.xyz/";
      link.setAttribute("aria-label", `${clockOf(tz)} in ${city}${station ? `, ${station}` : ""}. Listen there`);
    };
    const next = () => {
      if (still) return paint();
      slot.classList.add("out");
      setTimeout(() => { paint(); slot.classList.remove("out"); }, 260);
    };
    paint();
    // The stylesheet carries a version stamp (?v=…, scripts/sync-sites.mjs), so match inside the href.
    const root = document.querySelector('link[rel="stylesheet"][href*="aural.css"]')?.href.replace(/aural\.css(\?.*)?$/, "") || "/";
    fetch(root + "assets/live.json").then((r) => r.json()).then((list) => {
      if (Array.isArray(list) && list.length) { cities = list; at = Math.floor(Math.random() * list.length); paint(); }
    }).catch(() => {});
    // Every 6.5s: often enough to feel alive, not so often it pulls the eye.
    if (!still) setInterval(next, 6500);
  }
  // ── halftones ─────────────────────────────────────────────────────────────
  // The Earth as a dot screen, the way the posters this page borrows from print
  // a photograph: bigger dots where it is brighter. <canvas data-halftone> with
  // data-lat/data-lon for the view, data-ink naming a colour token, data-cell
  // for the screen and data-spin (degrees a second) to turn it.
  //
  // Only the dots are sampled, not every pixel: a few thousand look-ups into
  // the one equirectangular image the live globe already uses, so a spinning
  // halftone costs less than the page's own scrolling. Paused off screen, still
  // for prefers-reduced-motion.
  const tones = [...document.querySelectorAll("canvas[data-halftone]")];
  if (tones.length) {
    let earth = null;
    const loadEarth = () => earth || (earth = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = 1024; c.height = 512;
        const x = c.getContext("2d", { willReadFrequently: true });
        x.drawImage(img, 0, 0, 1024, 512);
        resolve({ w: 1024, h: 512, d: x.getImageData(0, 0, 1024, 512).data });
      };
      img.onerror = () => resolve(null);
      img.src = "/assets/globe/earth.jpg";
    }));
    const css = getComputedStyle(document.documentElement);
    const token = (name) => css.getPropertyValue(`--${name}`).trim() || name;
    const rad = Math.PI / 180;

    function paint(cv, tex, lon0) {
      const dpr = Math.min(2, devicePixelRatio || 1);
      const w = cv.clientWidth, h = cv.clientHeight;
      if (!w || !h) return;
      if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
      const g = cv.getContext("2d");
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      g.fillStyle = token(cv.dataset.ink || "ink");
      const r = Math.min(w, h) / 2 - 1, cx = w / 2, cy = h / 2;
      const cell = +(cv.dataset.cell || 9);
      const φ0 = (+cv.dataset.lat || 0) * rad, λ0 = lon0 * rad;
      const s0 = Math.sin(φ0), c0 = Math.cos(φ0);
      const invert = cv.dataset.invert === "true";
      for (let py = cy - r + cell / 2; py < cy + r; py += cell) {
        for (let px = cx - r + cell / 2; px < cx + r; px += cell) {
          const x = (px - cx) / r, y = (cy - py) / r, ρ2 = x * x + y * y;
          if (ρ2 > 1) continue;
          const ρ = Math.sqrt(ρ2), c = Math.asin(ρ), sc = Math.sin(c), cc = Math.cos(c);
          const φ = Math.asin(cc * s0 + (ρ ? y * sc * c0 / ρ : 0));
          const λ = λ0 + Math.atan2(x * sc, ρ * c0 * cc - y * s0 * sc);
          let u = ((λ / Math.PI + 1) / 2) % 1; if (u < 0) u += 1;
          const t = ((Math.min(tex.h - 1, ((0.5 - φ / Math.PI) * tex.h) | 0) * tex.w) + ((u * tex.w) | 0)) * 4;
          let l = (0.2126 * tex.d[t] + 0.7152 * tex.d[t + 1] + 0.0722 * tex.d[t + 2]) / 255;
          l = Math.min(1, l * 1.6) * (0.6 + 0.4 * Math.sqrt(1 - ρ2));   // the limb, darker
          if (invert) l = 1 - l;
          const d = (cell / 2) * 1.1 * Math.sqrt(l);
          if (d < 0.5) continue;
          g.beginPath(); g.arc(px, py, d, 0, Math.PI * 2); g.fill();
        }
      }
    }

    loadEarth().then((tex) => {
      if (!tex) return;
      for (const cv of tones) {
        let lon = +cv.dataset.lon || 0, on = false, last = 0, raf = 0;
        const spin = still ? 0 : +(cv.dataset.spin || 0);
        const tick = (t) => {
          if (!on) { raf = 0; return; }
          if (last) lon += spin * (t - last) / 1000;
          last = t;
          paint(cv, tex, lon);
          raf = spin ? requestAnimationFrame(tick) : 0;
        };
        const run = () => { if (!raf) { last = 0; raf = requestAnimationFrame(tick); } };
        new IntersectionObserver(([e]) => { on = e.isIntersecting; if (on) run(); }).observe(cv);
        new ResizeObserver(() => { if (!spin) paint(cv, tex, lon); }).observe(cv);
      }
    });
  }

})();
