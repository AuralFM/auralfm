/**
 * A picture of what you are listening to, for posting somewhere else.
 *
 * Drawn here, on a canvas, and copied to the clipboard. Nothing is uploaded and
 * nothing is fetched: the card is made from what is already on screen, so the
 * app learns nothing about where it goes afterwards and neither does anybody
 * else. That is not a small thing for a feature whose whole purpose is to leave
 * the app — a share button is the usual place a privacy promise quietly ends.
 *
 * ## What is not on it
 *
 * **No audio.** The obvious version of this feature attaches a few seconds of
 * what you are hearing, and it is the one thing that cannot be built: a stream
 * belongs to the station, and often to a label behind it, and posting a
 * recording is redistribution rather than sharing. This project purged a
 * copyrighted PDF out of its own git history over the same instinct.
 *
 * The card names the station instead, and the link opens it live — so somebody
 * hears the actual broadcast from the actual station rather than our recording
 * of it, which is also the better experience.
 *
 * **One web address:** the code opens the station on listen.auralfm.xyz, cued
 * and paused, so whoever scans it hears the broadcast from the station itself.
 *
 * ## Four shapes
 *
 * A post is 1080 by 1350, the portrait a feed shows whole. A story, a square
 * and a link preview each crop that, so each has its own layout (SHAPES).
 */
(() => {
  /**
   * The shapes a card comes in, each the size its place shows whole: a post
   * (4:5), a story (9:16), a square, and the wide one a link preview and a
   * desktop timeline use. One drawing, laid out for each.
   */
  const SHAPES = { post: [1080, 1350], story: [1080, 1920], square: [1080, 1080], wide: [1200, 630] };
  const INK = "#0C0B0B";          // onyx, the same stop the icon and splash use
  const BONE = "#F7F4EE";          // the site's bone, and its aqua, soft bone and hairline
  const AQUA = "#02E8CD", SOFT = "rgba(247,244,238,.72)", HAIR = "rgba(247,244,238,.26)";

  /** Wrap to at most `lines` lines, ellipsing only if it truly will not fit. */
  function wrap(ctx, text, maxWidth, lines) {
    const words = String(text).split(/\s+/).filter(Boolean);
    const out = [];
    let line = "";
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (ctx.measureText(next).width > maxWidth && line) {
        out.push(line);
        line = w;
        if (out.length === lines) break;
      } else line = next;
    }
    if (out.length < lines && line) out.push(line);
    const kept = out.join(" ").split(/\s+/).filter(Boolean).length;
    if (out.length === lines && kept < words.length) {
      // Something was dropped: mark it rather than ending mid-thought.
      let last = out[lines - 1] + "…";
      while (ctx.measureText(last).width > maxWidth && /\s/.test(last)) last = last.replace(/\s+\S+…$/, "…");
      out[lines - 1] = last;
    }
    return out;
  }

  /**
   * ─── The Earth, from directly above wherever you are listening ─────────────
   *
   * The same Blue Marble and night textures the globe in the app uses, projected
   * orthographically and centred on the station. Not a screenshot of the globe:
   * the WebGL canvas is created without `preserveDrawingBuffer`, so reading its
   * pixels after the frame is composited returns nothing — a thing this project
   * has already been caught by once. Drawing it here from the same source images
   * avoids the question entirely and gives a cleaner frame than a screenshot
   * would.
   *
   * The terminator is real. The night side is placed with the same subsolar
   * point the globe's day/night layer uses, at the moment the card is made, so
   * the card shows the Earth as it actually was when somebody was listening.
   */
  const TEX = { day: null, night: null };

  function loadTexture(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        const x = c.getContext("2d", { willReadFrequently: true });
        x.drawImage(img, 0, 0);
        resolve({ w: c.width, h: c.height, data: x.getImageData(0, 0, c.width, c.height).data });
      };
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  /**
   * Paint the disc.
   *
   * A per-pixel inverse projection: for each point inside the circle, work out
   * which latitude and longitude is under it, then sample the equirectangular
   * texture there. Roughly half a million pixels, which is a fraction of a second
   * and happens once, when somebody asks for a card.
   */
  function drawGlobe(ctx, cx, cy, r, centreLat, centreLon, sun) {
    if (!TEX.day) return false;
    const img = ctx.createImageData(r * 2, r * 2);
    const out = img.data;
    const rad = Math.PI / 180;
    const φ0 = centreLat * rad, λ0 = centreLon * rad;
    const sinφ0 = Math.sin(φ0), cosφ0 = Math.cos(φ0);
    const sφ = Math.sin(sun.lat * rad), cφ = Math.cos(sun.lat * rad), sλ = sun.lng * rad;

    for (let py = 0; py < r * 2; py++) {
      for (let px = 0; px < r * 2; px++) {
        const x = (px - r) / r, y = (r - py) / r;
        const ρ2 = x * x + y * y;
        const i = (py * r * 2 + px) * 4;
        if (ρ2 > 1) { out[i + 3] = 0; continue; }        // outside the disc

        const ρ = Math.sqrt(ρ2);
        const c = Math.asin(ρ);
        const sinc = Math.sin(c), cosc = Math.cos(c);
        const φ = Math.asin(cosc * sinφ0 + (ρ ? y * sinc * cosφ0 / ρ : 0));
        const λ = λ0 + Math.atan2(x * sinc, ρ * cosφ0 * cosc - y * sinφ0 * sinc);

        // Equirectangular lookup.
        let u = ((λ / Math.PI + 1) / 2) % 1; if (u < 0) u += 1;
        const v = 0.5 - φ / Math.PI;
        const tx = Math.min(TEX.day.w - 1, (u * TEX.day.w) | 0);
        const ty = Math.min(TEX.day.h - 1, (v * TEX.day.h) | 0);
        const t = (ty * TEX.day.w + tx) * 4;

        // Is this point in sunlight? Same cosine the terminator uses.
        const lit = Math.sin(φ) * sφ + Math.cos(φ) * cφ * Math.cos(λ - sλ);
        // A soft band rather than a hard edge — dusk is about ten degrees wide,
        // and a knife edge across a photograph of Earth looks like a bug.
        const k = Math.max(0, Math.min(1, (lit + 0.12) / 0.24));

        let R = TEX.day.data[t], G = TEX.day.data[t + 1], B = TEX.day.data[t + 2];
        if (k < 1) {
          let nR = 6, nG = 8, nB = 14;
          if (TEX.night) {
            const nt = (Math.min(TEX.night.h - 1, (v * TEX.night.h) | 0) * TEX.night.w
                      + Math.min(TEX.night.w - 1, (u * TEX.night.w) | 0)) * 4;
            nR = TEX.night.data[nt]; nG = TEX.night.data[nt + 1]; nB = TEX.night.data[nt + 2];
          }
          R = nR + (R - nR) * k; G = nG + (G - nG) * k; B = nB + (B - nB) * k;
        }
        // Limb darkening, so the sphere reads as a sphere rather than a sticker.
        const edge = 0.55 + 0.45 * Math.sqrt(1 - ρ2);
        out[i] = R * edge; out[i + 1] = G * edge; out[i + 2] = B * edge; out[i + 3] = 255;
      }
    }
    /**
     * Composited, not stamped.
     *
     * `putImageData` ignores compositing and writes alpha straight through, so
     * the transparent corners of the square punched a black hole in the card
     * around the disc. Through an offscreen canvas and `drawImage`, the
     * transparency behaves like transparency.
     */
    const off = document.createElement("canvas");
    off.width = r * 2; off.height = r * 2;
    off.getContext("2d").putImageData(img, 0, 0);
    ctx.drawImage(off, cx - r, cy - r);
    return true;
  }

  /**
   * The card is the one place in the app that leaves it, so it looks like the
   * brand the way the site and the posts do, not like a screenshot of the app.
   *
   * Space Mono is used here and only here. The app's own fonts do not change:
   * the face is loaded under a name of its own ("AuralCard Mono") so no rule in
   * the app's stylesheet can reach it. The name is set in the app's own Inter.
   */
  const MONO = '"AuralCard Mono", ui-monospace, Menlo, monospace';
  const SANS = 'Inter, system-ui, -apple-system, "Helvetica Neue", sans-serif';

  let fontsLoading = null;
  function loadFonts() {
    if (fontsLoading) return fontsLoading;
    const face = (family, file, desc) => {
      try {
        const f = new FontFace(family, `url(fonts/${file})`, desc);
        return f.load().then((ok) => document.fonts.add(ok)).catch(() => {});
      } catch { return Promise.resolve(); }
    };
    fontsLoading = Promise.all([
      face("AuralCard Mono", "SpaceMono-400.woff2", { weight: "400" }),
      face("AuralCard Mono", "SpaceMono-700.woff2", { weight: "700" }),
    ]);
    return fontsLoading;
  }

  /** The largest size, from `start` down to `min`, at which the text fits. */
  function fit(ctx, text, font, start, min, maxWidth) {
    let size = start;
    for (;;) {
      ctx.font = font(size);
      if (ctx.measureText(text).width <= maxWidth || size <= min) return size;
      size -= 2;
    }
  }

  /**
   * The card, in the site's look: the onyx ground and its stars, the Earth
   * filling the frame with a dot on every town that broadcasts, the station's
   * own town ringed, and the words set over it. It is the picture the posts
   * and the homepage use, so a card in a timeline reads as AuralFM at a glance.
   *
   * The colours are the site's and do not follow the app's palette: a card
   * leaves the app, and outside it there is one AuralFM.
   */
  function draw(now, shape) {
    const [W, H] = SHAPES[shape] || SHAPES.post;
    const wide = W > H, story = H > 1500, square = W === H;
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d");
    // The wide card's type is set to its height. A story is covered by its
    // own chrome above 250 px and below 1550, so everything sits between.
    const K = wide ? 0.7 : 1, M = wide ? 48 : 64, inner = W - M * 2;
    const TOP = story ? 250 : 0, END = story ? 1550 : H;
    const mono = (weight, px) => { ctx.font = `${weight} ${Math.round(px * K)}px ${MONO}`; ctx.letterSpacing = `${(px * K * 0.06).toFixed(1)}px`; };
    const sans = (weight, px) => { ctx.font = `${weight} ${px}px ${SANS}`; ctx.letterSpacing = `${(-px * 0.03).toFixed(1)}px`; };

    ctx.fillStyle = INK;
    ctx.fillRect(0, 0, W, H);

    // Stars, seeded from the station so the same station keeps its sky.
    const seedFrom = `${now.title}|${now.lat}|${now.lon}`;
    let seed = 0;
    for (let i = 0; i < seedFrom.length; i++) seed = (seed * 31 + seedFrom.charCodeAt(i)) >>> 0;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0, n = Math.round(W * H / 2400); i < n; i++) {
      ctx.fillStyle = `rgba(247,244,238,${(0.1 + rnd() * 0.6).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(rnd() * W, rnd() * H, rnd() * 1.3 + 0.3, 0, Math.PI * 2); ctx.fill();
    }

    // ── the Earth, turned to the station's town ─────────────────────────────
    // Larger than the card and off its edge, as on the posts. The town is the
    // centre of the disc, so the rings are drawn there and nothing is looked up.
    const placed = Number.isFinite(now.lat) && Number.isFinite(now.lon);
    const lat0 = placed ? now.lat : 12, lon0 = placed ? now.lon : 15;
    const R = wide ? 430 : story ? 750 : square ? 560 : 650;
    const CX = Math.round(wide ? W - 300 : W * 0.62), CY = Math.round(wide ? 300 : TOP + (END - TOP) * (square ? 0.32 : 0.34));
    const glow = ctx.createRadialGradient(CX, CY, R * 0.96, CX, CY, R * 1.14);
    glow.addColorStop(0, "rgba(120,170,255,.30)");
    glow.addColorStop(1, "rgba(120,170,255,0)");
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(CX, CY, R * 1.14, 0, Math.PI * 2); ctx.fill();
    drawGlobe(ctx, CX, CY, R, lat0, lon0, now.sun || { lat: 0, lng: 0 });

    // Every town that broadcasts, where it is on this side of the planet.
    if (Array.isArray(now.towns)) {
      const rad = Math.PI / 180, sinφ0 = Math.sin(lat0 * rad), cosφ0 = Math.cos(lat0 * rad);
      ctx.fillStyle = AQUA;
      for (const t of now.towns) {
        const φ = t.lat * rad, dλ = (t.lng - lon0) * rad;
        const facing = sinφ0 * Math.sin(φ) + cosφ0 * Math.cos(φ) * Math.cos(dλ);
        if (!(facing > 0.1)) continue;                          // behind the planet, or at its rim
        const x = CX + R * Math.cos(φ) * Math.sin(dλ), y = CY - R * (cosφ0 * Math.sin(φ) - sinφ0 * Math.cos(φ) * Math.cos(dλ));
        if (x < -4 || x > W + 4 || y < -4 || y > H + 4) continue;
        ctx.globalAlpha = 0.3 + 0.6 * facing;
        ctx.beginPath(); ctx.arc(x, y, 2.2 * K, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    if (placed) {
      for (const [rr, a, w] of [[26, 0.95, 3], [64, 0.6, 2], [114, 0.32, 2]]) {
        ctx.strokeStyle = `rgba(247,244,238,${a})`;
        ctx.lineWidth = w;
        ctx.beginPath(); ctx.arc(CX, CY, rr * K, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.fillStyle = BONE;
      ctx.beginPath(); ctx.arc(CX, CY, 10 * K, 0, Math.PI * 2); ctx.fill();
    }

    // ── the words, measured before they are drawn ───────────────────────────
    const stamp = now.when.toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });
    const dial = String(now.title || "").match(/\b(\d{2,3}[.,]\d{1,2})\s*(?:fm|mhz)?\b|\b(\d{3,4})\s*(?:am|khz)\b/i);
    const signal = now.sdr && now.freq ? `${Number(now.freq.toFixed(2))} kHz`
      : dial?.[1] && +dial[1].replace(",", ".") >= 64 && +dial[1].replace(",", ".") <= 108 ? `FM ${dial[1].replace(",", ".")}`
      : dial?.[2] && +dial[2] >= 150 && +dial[2] <= 1710 ? `AM ${dial[2]}`
      : "Stream";
    const sound = (now.tags || []).map((t) => t.charAt(0).toUpperCase() + t.slice(1)).join(" · ") || (now.sdr ? "Shortwave" : "Live radio");
    const city = /^(Across |Somewhere in |Online, no country$|Online only$)/.test(now.place || "") ? "" : now.place || "";
    const where = [city, now.country].filter(Boolean).join(", ");
    const title = String(now.title || "");
    const hasWave = Array.isArray(now.levels) && now.levels.length > 0;

    const NAME_W = wide ? 600 : inner, NAME_MAX = wide ? 84 : story ? 170 : square ? 120 : 150;
    const fits = (line) => ctx.measureText(line).width <= NAME_W;
    let size = NAME_MAX, lines = [title];
    for (; size > NAME_MAX * 0.56; size -= 2) { sans(500, size); if (fits(title)) break; }
    if (!fits(title)) {
      // Too long for one line at a size worth reading: two, as large as they fit.
      for (size = Math.round(NAME_MAX * 0.7); size >= NAME_MAX * 0.36; size -= 2) {
        sans(500, size);
        lines = wrap(ctx, title, NAME_W, 2);
        if (lines.every(fits) && !lines.at(-1).endsWith("…")) break;
      }
      lines = lines.map((line) => { let cut = line; while (cut.length > 4 && !fits(cut)) cut = cut.slice(0, -2).trimEnd() + "…"; return cut; });
    }
    const LEAD = size * 1.02, SUB = Math.round(34 * K), WAVE_H = Math.round(28 * K);
    const blockH = 26 * K + 18 * K + lines.length * LEAD + 14 * K + SUB * 1.3 + (hasWave ? 26 * K + WAVE_H : 0);
    // Tall cards hang the words from the hairline above the foot; the wide one centres them.
    const HAIR_Y = END - 232;
    const top = Math.round(wide ? (H - blockH) / 2 - 20 : HAIR_Y - 44 - blockH);

    // The ground comes back up under the words, so they read over land or sea.
    const veil = wide ? ctx.createLinearGradient(M + NAME_W - 80, 0, M + NAME_W + 240, 0) : ctx.createLinearGradient(0, top - 200, 0, top + 80);
    veil.addColorStop(wide ? 1 : 0, "rgba(12,11,11,0)");
    veil.addColorStop(wide ? 0 : 1, "rgba(12,11,11,.86)");
    ctx.fillStyle = veil;
    if (wide) ctx.fillRect(0, 0, M + NAME_W + 240, H); else ctx.fillRect(0, top - 200, W, H - top + 200);

    // ── the head ────────────────────────────────────────────────────────────
    ctx.textBaseline = "alphabetic";
    const HEAD = TOP + (wide ? 62 : 82);
    ctx.fillStyle = BONE;
    mono(700, 20);
    ctx.fillText("AURAL.FM", M, HEAD);
    ctx.fillStyle = AQUA;
    mono(400, 20);
    ctx.textAlign = "right";
    ctx.fillText(now.sdr ? "SHORTWAVE · LIVE" : "ON AIR · LIVE", W - M, HEAD);
    ctx.textAlign = "left";

    // ── where, the name, what it sounds like, and its sound ─────────────────
    let y = top + 20 * K;
    ctx.fillStyle = AQUA;
    mono(700, 20);
    const label = (where ? `In ${where}, right now` : "On air right now").toUpperCase();
    ctx.fillText(fits(label) ? label : (city || now.country || "On air").toUpperCase(), M, y);
    y += 6 * K + 18 * K;
    ctx.fillStyle = BONE;
    sans(500, size);
    for (const line of lines) { y += LEAD; ctx.fillText(line, M - size * 0.04, y - LEAD * 0.2); }
    y += 14 * K + SUB;
    ctx.font = `400 ${fit(ctx, sound, (z) => `400 ${z}px ${SANS}`, SUB, Math.round(SUB * 0.7), NAME_W)}px ${SANS}`;
    ctx.letterSpacing = "0px";
    ctx.fillText(sound, M, y);
    if (hasWave) {
      y += 26 * K + SUB * 0.3;
      const bars = now.levels, loudest = Math.max(0.15, ...bars), gap = 4 * K, width = wide ? NAME_W - 150 : inner;
      const bw = (width + gap) / bars.length - gap;
      ctx.fillStyle = AQUA;
      for (let i = 0; i < bars.length; i++) {
        const h = Math.max(3, Math.max(0.04, Math.min(1, bars[i] / loudest)) * WAVE_H);
        ctx.fillRect(M + i * (bw + gap), y + (WAVE_H - h) / 2, Math.max(1.5, bw), h);
      }
    }

    // ── the foot: what to do, when it was heard, and the code ───────────────
    const QR = Math.round(150 * (wide ? 0.76 : 1)), QR_X = W - M - QR, QR_Y = wide ? H - M - QR : HAIR_Y + 18;
    if (!wide) {
      ctx.fillStyle = HAIR;
      ctx.fillRect(M, HAIR_Y, inner, 2);
    }
    const room = (wide ? NAME_W : inner - QR - 24);
    const foot = [
      [AQUA, city ? `Listen with ${city} →` : "Listen live →"],
      [SOFT, `Heard ${stamp} · ${signal}`],
      [SOFT, "Less algorithms. More humans. · auralfm.xyz"],
    ];
    foot.forEach(([colour, words], i) => {
      const text = words.toUpperCase();
      for (let px = 20; px >= 13; px--) { mono(400, px); if (ctx.measureText(text).width <= room) break; }
      ctx.fillStyle = colour;
      ctx.fillText(text, M, wide ? H - M - (foot.length - 1 - i) * 24 : QR_Y + 48 + i * 34);
    });
    ctx.letterSpacing = "0px";

    if (now.qr && typeof qrcode === "function") {
      try {
        const q = qrcode(0, "M");
        q.addData(now.qr);
        q.make();
        // A code scans dark on light, so it sits on a bone tile whatever is behind it.
        const n = q.getModuleCount(), quiet = 2, cell = QR / (n + quiet * 2);
        ctx.fillStyle = BONE;
        ctx.fillRect(QR_X, QR_Y, QR, QR);
        ctx.fillStyle = INK;
        for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
          if (q.isDark(r, c)) ctx.fillRect(QR_X + (c + quiet) * cell, QR_Y + (r + quiet) * cell, Math.ceil(cell), Math.ceil(cell));
        }
      } catch { /* no code rather than a broken one */ }
    }

    return cv.toDataURL("image/png");
  }

  window.Card = {
    /** Each shape's width and height, for whoever shows or names one. */
    SHAPES,

    /**
     * The Earth, on any canvas.
     *
     * Exposed because it is the app's own artwork and there should be exactly
     * one function that draws it. The alternative — a second copy of the inverse
     * orthographic projection and the terminator maths for making brand imagery
     * — is two Earths that drift apart, and the one in the marketing would be
     * the one nobody notices is wrong.
     *
     * Textures must be loaded first; `ready()` does that.
     */
    drawGlobe(ctx, cx, cy, r, lat, lon, sun) {
      return drawGlobe(ctx, cx, cy, r, lat, lon, sun || { lat: 0, lng: 0 });
    },

    /** Load the textures without drawing anything. */
    async ready() {
      if (!TEX.day) {
        [TEX.day, TEX.night] = await Promise.all([
          loadTexture(`vendor/${window.AuralLite ? "lite/" : ""}earth-blue-marble.jpg`),
          loadTexture(`vendor/${window.AuralLite ? "lite/" : ""}earth-night.jpg`),
        ]);
      }
      return !!TEX.day;
    },

    /**
     * Make the card. Waits for the font, because a card drawn before Inter
     * loads is drawn in the system fallback and looks like somebody else's app.
     */
    async make(now, shape) {
      try { await loadFonts(); await document.fonts.ready; } catch { /* draw in whatever we have */ }
      // Loaded once and kept: two megabytes of texture decoded per card would be
      // felt, and these are the same files the globe already has in memory.
      if (!TEX.day) {
        [TEX.day, TEX.night] = await Promise.all([
          loadTexture(`vendor/${window.AuralLite ? "lite/" : ""}earth-blue-marble.jpg`),
          loadTexture(`vendor/${window.AuralLite ? "lite/" : ""}earth-night.jpg`),
        ]);
      }
      return draw(now, shape);
    },
  };
})();
