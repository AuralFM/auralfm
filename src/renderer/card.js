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
 * ## Why 1080 by 1350
 *
 * Instagram's portrait shape, which every other timeline shows whole too. A
 * 1200x630 card is better on one platform and gets eaten on the rest.
 */
(() => {
  const W = 1080, H = 1350;
  /**
   * An instruction, not a brand.
   *
   * "Scan to Listen" is the promise the code will keep once stations have their
   * own pages. Today it reaches the repository, where the app that plays them
   * lives — so the sentence is already true in the only way it can be.
   */
  const t_scan = "Scan to Listen";

  /** The app's own colours, so a card looks like the thing it came from. */
  /**
   * The card wears the palette the person is actually using.
   *
   * Read from the live CSS custom properties rather than restated here, so the
   * card cannot drift from the app: change a palette in the stylesheet and the
   * card follows on the next render, with nothing to keep in step by hand.
   *
   * The ground stays dark in every palette, and that is deliberate rather than
   * lazy. The subject of this card is a photograph of the Earth at night with a
   * starfield behind it — a light ground would put a black circle of space on a
   * bone rectangle, which is not the light version of this card, it is a hole in
   * it. The palette shows up where it can be honest: the type, and the marker on
   * the station, which is the palette's own accent.
   */
  /**
   * "#35C46A" or "rgb(53 196 106)" in, "53,196,106" out.
   *
   * The marker draws itself at several alphas, so it needs the channels rather
   * than a colour string. Anything unparseable falls back to the app's green
   * rather than throwing — a card with a slightly wrong dot beats no card.
   */
  function rgbTriplet(value) {
    const v = String(value || "").trim();
    let m = v.match(/^#([0-9a-f]{6})$/i);
    if (m) {
      const n = parseInt(m[1], 16);
      return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
    }
    m = v.match(/^#([0-9a-f]{3})$/i);
    if (m) {
      const [r, g, b] = m[1].split("").map((c) => parseInt(c + c, 16));
      return `${r},${g},${b}`;
    }
    m = v.match(/(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
    if (m) return `${m[1]},${m[2]},${m[3]}`;
    return "53,196,106";
  }

  const readVar = (name, fallback) => {
    try {
      const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return v || fallback;
    } catch { return fallback; }
  };

  const INK = "#0C0B0B";          // onyx, the same stop the icon and splash use
  const BONE = "#E9E2D4";
  const DIM = "rgba(233,226,212,.55)";
  const FAINT = "rgba(233,226,212,.28)";

  /**
   * Fit text to a width by shrinking, not by truncating.
   *
   * A station called "Radio Nacional de España Radio 5 Todo Noticias" is not an
   * edge case, it is Tuesday. Cutting it produces a card that names the wrong
   * station; setting it smaller produces a card that is merely quieter.
   */
  function fitted(ctx, text, weight, start, min, maxWidth) {
    let size = start;
    for (;;) {
      ctx.font = `${weight} ${size}px Inter, system-ui, sans-serif`;
      if (ctx.measureText(text).width <= maxWidth || size <= min) return size;
      size -= 2;
    }
  }

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
   * ─── The card as a broadcast ticket ────────────────────────────────────────
   *
   * Melton, 28 Sept: the card is the one place in the app that leaves it, so it
   * should look like the brand the way the site does, not like a screenshot of
   * the app. So it borrows the site's language: the Earth under a tilted band, a
   * mast-red rule and foot, bracketed mono labels, the hairline grid, and the
   * station's name in Science Gothic as big as it will go — laid out like a
   * ticket, with the facts in labelled fields.
   *
   * The site's type is used here and only here. The app's own fonts do not
   * change (Melton: never); these faces are loaded under names of their own
   * ("AuralCard …") so no rule in the app's stylesheet can reach them.
   */
  const DISPLAY = '"AuralCard Display", Inter, system-ui, sans-serif';
  const MONO = '"AuralCard Mono", ui-monospace, Menlo, monospace';
  const LINE = "rgba(233,226,212,.26)";

  let fontsLoading = null;
  function loadFonts() {
    if (fontsLoading) return fontsLoading;
    const face = (family, file, desc) => {
      try {
        const f = new FontFace(family, `url(fonts/${file})`, desc);
        return f.load().then((ok) => document.fonts.add(ok)).catch(() => {});
      } catch { return Promise.resolve(); }
    };
    const wide = { weight: "100 900", stretch: "50% 200%" };
    fontsLoading = Promise.all([
      face("AuralCard Display", "ScienceGothic-latin.woff2", { ...wide, unicodeRange: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+20AC, U+2122, U+2212" }),
      face("AuralCard Display", "ScienceGothic-latin-ext.woff2", { ...wide, unicodeRange: "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+1E00-1E9F, U+1EF2-1EFF, U+20A0-20AB, U+20AD-20C0, U+2C60-2C7F, U+A720-A7FF" }),
      face("AuralCard Display", "ScienceGothic-cyrillic.woff2", { ...wide, unicodeRange: "U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116" }),
      face("AuralCard Mono", "SpaceMono-400.woff2", { weight: "400" }),
      face("AuralCard Mono", "SpaceMono-700.woff2", { weight: "700" }),
    ]);
    return fontsLoading;
  }

  /** `fitted`, for the ticket's own faces. */
  function fit(ctx, text, font, start, min, maxWidth) {
    let size = start;
    for (;;) {
      ctx.font = font(size);
      if (ctx.measureText(text).width <= maxWidth || size <= min) return size;
      size -= 2;
    }
  }

  /** A registration mark, as printed at a sheet's corners. */
  function cross(ctx, x, y, s = 14) {
    ctx.beginPath();
    ctx.moveTo(x - s, y); ctx.lineTo(x + s, y);
    ctx.moveTo(x, y - s); ctx.lineTo(x, y + s);
    ctx.stroke();
  }

  const coord = (v, pos, neg) => `${v >= 0 ? pos : neg} ${Math.abs(v).toFixed(2)}°`;

  function draw(now) {
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d");
    /**
     * The palette in use when the card is made (Melton, 28 Sept): its ground,
     * its words, its hairlines and its accent, which takes the place of the
     * site's mast red in the rule, the band and the foot. Whatever sits on the
     * accent is the palette's own on-accent colour, so it stays legible.
     */
    const ACCENT = rgbTriplet(readVar("--accent", "#35C46A"));
    const GROUND = readVar("--bg", INK), TEXT = readVar("--label", BONE), SOFT = readVar("--label2", DIM);
    const HAIR = readVar("--label3", LINE), ON_ACC = readVar("--on-accent", INK), TINT = rgbTriplet(TEXT);
    const HOT = `rgb(${ACCENT})`;
    const lum = (t) => t.split(",").map(Number).reduce((a, v, i) => a + [0.2126, 0.7152, 0.0722][i] * v, 0);
    // A code scans dark on light: the lighter of ground and words is its paper.
    const [QR_PAPER, QR_INK] = lum(TINT) > lum(rgbTriplet(GROUND)) ? [TEXT, GROUND] : [GROUND, TEXT];
    const M = 64, inner = W - M * 2;

    ctx.fillStyle = GROUND;
    ctx.fillRect(0, 0, W, H);

    // Grain, seeded from the station so the same station prints the same sheet.
    const seedFrom = `${now.title}|${now.lat}|${now.lon}`;
    let seed = 0;
    for (let i = 0; i < seedFrom.length; i++) seed = (seed * 31 + seedFrom.charCodeAt(i)) >>> 0;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 2400; i++) {
      ctx.fillStyle = `rgba(${TINT},${(rnd() * 0.05).toFixed(3)})`;
      ctx.fillRect(rnd() * W, rnd() * H, 1.5, 1.5);
    }

    // ── the head: the name, and that it is live ─────────────────────────────
    const HEAD = 104;
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = TEXT;
    ctx.font = `700 30px ${MONO}`;
    ctx.fillText("AURAL.FM", M, HEAD);
    ctx.font = `400 24px ${MONO}`;
    ctx.textAlign = "right";
    ctx.fillStyle = SOFT;
    ctx.fillText("HUMAN CURATED RADIO", W - M, HEAD);
    ctx.textAlign = "left";
    ctx.fillStyle = HOT;
    ctx.fillRect(0, 128, W, 6);

    // ── the Earth, over a tilted band, with the station marked ─────────────
    const CX = W / 2, CY = 452, R = 276;
    ctx.save();
    ctx.translate(CX, CY + 40);
    ctx.rotate(-0.12);
    ctx.fillStyle = HOT;
    ctx.fillRect(-W, -54, W * 2, 108);
    ctx.restore();

    const placed = Number.isFinite(now.lat) && Number.isFinite(now.lon);
    if (placed) {
      // A disc of ink first, so the band stops at the planet's edge.
      ctx.fillStyle = GROUND;
      ctx.beginPath(); ctx.arc(CX, CY, R + 6, 0, Math.PI * 2); ctx.fill();
      /**
       * The real Earth, not a halftone (Melton, 28 Sept): the card is for
       * showing where the station is, and a dot screen lost the coastlines
       * that say so. The rest of the ticket keeps the site's look.
       */
      drawGlobe(ctx, CX, CY, R, now.lat, now.lon, now.sun || { lat: 0, lng: 0 });
      ctx.strokeStyle = HAIR;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(CX, CY, R, 0, Math.PI * 2); ctx.stroke();
      // The orbit, dashed, and the crosshair through the station.
      ctx.strokeStyle = HAIR;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 10]);
      ctx.beginPath(); ctx.arc(CX, CY, R + 30, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = `rgba(${ACCENT},.9)`;
      ctx.beginPath();
      ctx.moveTo(CX - R - 44, CY); ctx.lineTo(CX - 30, CY);
      ctx.moveTo(CX + 30, CY); ctx.lineTo(CX + R + 44, CY);
      ctx.moveTo(CX, CY - R - 44); ctx.lineTo(CX, CY - 30);
      ctx.moveTo(CX, CY + 30); ctx.lineTo(CX, CY + R + 44);
      ctx.stroke();
      // The station: rings going out, the way the site's stations pulse.
      for (const [rr, a, w] of [[22, 0.95, 3], [38, 0.55, 2], [56, 0.28, 2]]) {
        ctx.strokeStyle = `rgba(${ACCENT},${a})`;
        ctx.lineWidth = w;
        ctx.beginPath(); ctx.arc(CX, CY, rr, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.fillStyle = `rgb(${ACCENT})`;
      ctx.beginPath(); ctx.arc(CX, CY, 10, 0, Math.PI * 2); ctx.fill();
      // Where, in the crosshair's own margin.
      ctx.font = `400 20px ${MONO}`;
      ctx.fillStyle = SOFT;
      ctx.fillText(coord(now.lat, "N", "S"), CX + 12, CY - R - 20);
      // Longitude outside the left arm, clear of the disc: the band crosses the right one.
      ctx.textAlign = "right";
      ctx.fillText(coord(now.lon, "E", "W"), CX - R - 52, CY + 7);
      ctx.textAlign = "left";
    }
    // Registration marks at the corners of the picture.
    ctx.strokeStyle = SOFT;
    ctx.lineWidth = 2;
    for (const [x, y] of [[M + 14, 166], [W - M - 14, 166], [M + 14, 752], [W - M - 14, 752]]) cross(ctx, x, y);

    // A label box, as the site pins them over its pictures.
    const tag = now.sdr ? "SHORTWAVE · LIVE" : "ON AIR · LIVE";
    ctx.font = `700 22px ${MONO}`;
    const tw = ctx.measureText(tag).width;
    ctx.fillStyle = `rgb(${ACCENT})`;
    ctx.fillRect(M + 40, 686, tw + 28, 40);
    ctx.fillStyle = ON_ACC;
    ctx.fillText(tag, M + 54, 714);

    // ── the station ────────────────────────────────────────────────────────
    const title = String(now.title || "").toUpperCase();
    const disp = (s) => `900 ${s}px ${DISPLAY}`;
    const LEAD = 0.92, hasWave = Array.isArray(now.levels) && now.levels.length;
    // Between the picture and the ticket, centred, however many lines it takes.
    const AREA_TOP = 772, AREA_END = hasWave ? 1008 : 1050, LABEL = 40;
    let size = fit(ctx, title, disp, 128, 60, inner);
    ctx.font = disp(size);
    let lines = wrap(ctx, title, inner, 2);
    if (lines.length > 1) {
      // Two lines have to fit the band too, not only the width.
      const fits = Math.floor((AREA_END - AREA_TOP - LABEL) / (0.9 + LEAD));
      size = Math.min(size, Math.max(52, fits));
      for (;;) {
        ctx.font = disp(size);
        lines = wrap(ctx, title, inner, 2);
        if (lines.every((l) => ctx.measureText(l).width <= inner) || size <= 52) break;
        size -= 2;
      }
    }
    const blockH = LABEL + size * 0.9 + (lines.length - 1) * size * LEAD;
    const top = Math.round(AREA_TOP + (AREA_END - AREA_TOP - blockH) / 2);
    ctx.fillStyle = `rgb(${ACCENT})`;
    ctx.font = `400 22px ${MONO}`;
    ctx.fillText("[ LISTENING TO ]", M, top + 20);
    ctx.font = disp(size);
    ctx.fillStyle = TEXT;
    let y = top + LABEL + size * 0.9;
    lines.forEach((line, i) => { ctx.fillText(line, M, y); if (i < lines.length - 1) y += size * LEAD; });

    // The sound, if there was any: real levels, never a drawn squiggle.
    const WAVE_Y = 1024, WAVE_H = 30;
    if (Array.isArray(now.levels) && now.levels.length) {
      const bars = now.levels, loudest = Math.max(0.15, ...bars), gap = 4;
      const bw = (inner + gap) / bars.length - gap;
      ctx.fillStyle = `rgb(${ACCENT})`;
      for (let i = 0; i < bars.length; i++) {
        const v = Math.max(0.04, Math.min(1, bars[i] / loudest));
        const h = Math.max(3, v * WAVE_H);
        ctx.fillRect(M + i * (bw + gap), WAVE_Y + (WAVE_H - h) / 2, Math.max(1.5, bw), h);
      }
    }

    // ── the ticket: the facts, in labelled fields, on the site's hairlines ──
    const GRID_TOP = 1070, ROW = 88, QRW = 176;
    const cols = 3, colW = (inner - QRW) / cols;
    ctx.strokeStyle = HAIR;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(M, GRID_TOP); ctx.lineTo(W - M, GRID_TOP);
    ctx.moveTo(M, GRID_TOP + ROW); ctx.lineTo(W - M - QRW, GRID_TOP + ROW);
    for (let c = 1; c <= cols; c++) { ctx.moveTo(M + c * colW, GRID_TOP); ctx.lineTo(M + c * colW, GRID_TOP + ROW * 2); }
    ctx.stroke();

    const stamp = now.when.toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });
    /**
     * What it is on the dial, when its name says (most FM and AM stations put
     * the frequency in it), and what it sounds like, from its own tags. These
     * took the place of "Algorithms: 0" (Melton, 28 Sept: a statement, but
     * nothing a listener can use on a card about one station).
     */
    const dial = String(now.title || "").match(/\b(\d{2,3}[.,]\d{1,2})\s*(?:fm|mhz)?\b|\b(\d{3,4})\s*(?:am|khz)\b/i);
    const signal = now.sdr && now.freq ? `${Number(now.freq.toFixed(2))} kHz`
      : dial?.[1] && +dial[1].replace(",", ".") >= 64 && +dial[1].replace(",", ".") <= 108 ? `FM ${dial[1].replace(",", ".")}`
      : dial?.[2] && +dial[2] >= 150 && +dial[2] <= 1710 ? `AM ${dial[2]}`
      : "Stream";
    const sound = (now.tags || []).join(" · ") || (now.sdr ? "Shortwave" : "Live radio");
    const fields = [
      ["City", now.place || "—"], ["Country", now.country || "—"], ["Heard", stamp],
      ["Coordinates", placed ? `${Math.abs(now.lat).toFixed(1)}${now.lat >= 0 ? "N" : "S"} ${Math.abs(now.lon).toFixed(1)}${now.lon >= 0 ? "E" : "W"}` : "—"],
      ["Signal", signal], ["Sound", sound],
    ];
    fields.forEach(([k, v], i) => {
      const x = M + (i % cols) * colW + 16, top = GRID_TOP + Math.floor(i / cols) * ROW;
      ctx.font = `400 18px ${MONO}`;
      ctx.fillStyle = `rgb(${ACCENT})`;
      ctx.fillText(k.toUpperCase(), x, top + 30);
      const val = String(v).toUpperCase();
      const vs = fit(ctx, val, (s) => `700 ${s}px ${MONO}`, 28, 16, colW - 28);
      ctx.font = `700 ${vs}px ${MONO}`;
      ctx.fillStyle = TEXT;
      ctx.fillText(val, x, top + 70);
    });

    // The code, in its own cell of the ticket.
    if (now.qr && typeof qrcode === "function") {
      try {
        const q = qrcode(0, "M");
        q.addData(now.qr);
        q.make();
        const n = q.getModuleCount(), quiet = 2, QR = 128;
        const qx = W - M - QRW + (QRW - QR) / 2 + 8, qy = GRID_TOP + 10;
        const cell = QR / (n + quiet * 2);
        ctx.fillStyle = QR_PAPER;
        ctx.fillRect(qx, qy, QR, QR);
        ctx.fillStyle = QR_INK;
        for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
          if (q.isDark(r, c)) ctx.fillRect(qx + (c + quiet) * cell, qy + (r + quiet) * cell, Math.ceil(cell), Math.ceil(cell));
        }
        ctx.font = `400 16px ${MONO}`;
        ctx.fillStyle = SOFT;
        ctx.textAlign = "center";
        ctx.fillText(t_scan.toUpperCase(), qx + QR / 2, qy + QR + 24);
        ctx.textAlign = "left";
      } catch { /* no code rather than a broken one */ }
    }

    // ── the foot: the argument, in mast red ────────────────────────────────
    const FOOT = 1266;
    ctx.fillStyle = HOT;
    ctx.fillRect(0, FOOT, W, H - FOOT);
    ctx.fillStyle = ON_ACC;
    const line = "LESS ALGORITHMS. MORE HUMANS.";
    const fs = fit(ctx, line, (s) => `900 ${s}px ${DISPLAY}`, 46, 26, inner - 170);
    ctx.font = `900 ${fs}px ${DISPLAY}`;
    ctx.fillText(line, M, FOOT + 58);
    ctx.font = `700 22px ${MONO}`;
    ctx.textAlign = "right";
    ctx.fillText("AURALFM.XYZ", W - M, FOOT + 54);
    ctx.textAlign = "left";

    return cv.toDataURL("image/png");
  }

  window.Card = {
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
          loadTexture("vendor/earth-blue-marble.jpg"),
          loadTexture("vendor/earth-night.jpg"),
        ]);
      }
      return !!TEX.day;
    },

    /**
     * Make the card. Waits for the font, because a card drawn before Inter
     * loads is drawn in the system fallback and looks like somebody else's app.
     */
    async make(now) {
      try { await loadFonts(); await document.fonts.ready; } catch { /* draw in whatever we have */ }
      // Loaded once and kept: two megabytes of texture decoded per card would be
      // felt, and these are the same files the globe already has in memory.
      if (!TEX.day) {
        [TEX.day, TEX.night] = await Promise.all([
          loadTexture("vendor/earth-blue-marble.jpg"),
          loadTexture("vendor/earth-night.jpg"),
        ]);
      }
      return draw(now);
    },
  };
})();
