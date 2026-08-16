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
 * **No web address.** There is nowhere honest to send somebody yet: no site, and
 * the repository is private. A URL that goes nowhere is worse than none, so the
 * card carries none and the `auralfm://` link is offered separately, for the
 * people who already have the app.
 *
 * ## Why 1080 square
 *
 * It is Instagram's native shape and it survives every other timeline without
 * being cropped through the middle. A 1200x630 card is better on one platform
 * and gets its top and bottom eaten on the rest.
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
    if (out.length === lines && words.length) {
      // Something was dropped: mark it rather than ending mid-thought.
      const last = out[lines - 1];
      if (ctx.measureText(last).width > maxWidth - 30) {
        out[lines - 1] = last.replace(/\s+\S+$/, "") + "…";
      }
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
   * Draw the card.
   *
   * @param {{title:string, place:string, country:string, sdr:boolean,
   *          freq:number|null, when:Date, lat:number|null, lon:number|null,
   *          sun:{lat:number,lng:number}, levels:number[]|null}} now
   * @returns {string} a data URL
   */
  function draw(now) {
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d");

    ctx.fillStyle = INK;
    ctx.fillRect(0, 0, W, H);

    /**
     * Space, fading out before the words start.
     *
     * The Earth was floating on flat ink, which is not where the Earth is. Stars
     * put it somewhere. They stop before the text does, though: a starfield
     * behind a caption is a caption you have to work to read, so density falls to
     * nothing by the time the type begins and the lower third is honest black.
     *
     * Deterministic from the station's own coordinates rather than random, so
     * the same station gives the same sky twice. A card that reshuffles its
     * background every time you press the button feels like a slot machine.
     */
    const seedFrom = `${now.title}|${now.lat}|${now.lon}`;
    let seed = 0;
    for (let i = 0; i < seedFrom.length; i++) seed = (seed * 31 + seedFrom.charCodeAt(i)) >>> 0;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

    for (let i = 0; i < 620; i++) {
      const x = rnd() * W, y = rnd() * H;
      // Fade the field out across the middle so nothing competes with the type.
      const depth = Math.max(0, 1 - Math.max(0, y - 340) / 560);
      if (depth <= 0.02) continue;
      const r = rnd() * 1.5 + 0.4;
      const a = (0.12 + rnd() * 0.55) * depth;
      ctx.fillStyle = `rgba(233,226,212,${a.toFixed(3)})`;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    // And a wash back to black underneath them, so the fade has no seam.
    const wash = ctx.createLinearGradient(0, 620, 0, 980);
    wash.addColorStop(0, "rgba(12,11,11,0)");
    wash.addColorStop(1, INK);
    ctx.fillStyle = wash;
    ctx.fillRect(0, 620, W, 360);

    /**
     * The layout, as bands.
     *
     * The first version placed each element from its own constant and they
     * collided — the waveform landed across the title and the foot sat on top of
     * the place. Bands are stated once here and everything hangs off them.
     */
    const M = 96;
    /**
     * The code belongs in the foot row, not beside the words.
     *
     * It sat up beside the title, which cost the type a third of the card's
     * width for something that is a footnote — you scan it after reading, not
     * instead of reading. Down here it lines up with the wordmark and the time,
     * which is the row of small permanent things, and everything above gets the
     * full measure back: the station, the city, and the waveform.
     */
    const QR = 116;
    const QR_X = W - M - QR, QR_Y = 1160;     // 1160 .. 1276, label under it
    const inner = W - M * 2;                  // the full measure, back again
    const GLOBE_CY = 380, GLOBE_R = 330;      //   50 ..  710
    const WAVE_Y = 772, WAVE_H = 88;          //  772 ..  860
    const LABEL_Y = 916;
    // Close under the label, because the three lines are one thought: what, and
    // where. They were spread far enough apart to read as three separate facts.
    const TITLE_TOP = 942;
    const TEXT_FLOOR = 1150;                  // the words stop where the foot begins
    const FOOT_NAME = 1236, FOOT_TIME = 1278;

    // The Earth, centred on the station, above the words about it.
    const R = GLOBE_R, CX = W / 2, CY = GLOBE_CY;
    const placed = Number.isFinite(now.lat) && Number.isFinite(now.lon)
      && drawGlobe(ctx, CX, CY, R, now.lat, now.lon, now.sun || { lat: 0, lng: 0 });

    if (placed) {
      /**
       * The station, in the app's own green.
       *
       * Drawn as a dot inside two fading rings. A still image cannot pulse, and
       * pretending otherwise is not available — but a pulse *stopped* looks like
       * this, and the rings read as the wave that just left. The live globe is
       * where an actual pulse belongs.
       */
      /**
       * The station, in the palette's accent.
       *
       * It was fixed green — right in Onyx and On Air, wrong in the other seven.
       * `--accent` is the one token every palette redefines, so this is the
       * single most visible way a card can belong to the person who made it.
       */
      const GREEN = rgbTriplet(readVar("--accent", "#35C46A"));
      const glow = ctx.createRadialGradient(CX, CY, 4, CX, CY, 46);
      glow.addColorStop(0, `rgba(${GREEN},.55)`);
      glow.addColorStop(1, `rgba(${GREEN},0)`);
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(CX, CY, 46, 0, Math.PI * 2); ctx.fill();

      ctx.strokeStyle = `rgba(${GREEN},.75)`;
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(CX, CY, 20, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = `rgba(${GREEN},.30)`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(CX, CY, 34, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = `rgb(${GREEN})`;
      ctx.beginPath(); ctx.arc(CX, CY, 8.5, 0, Math.PI * 2); ctx.fill();
      // The limb, so the sphere has an edge against the ink.
      ctx.strokeStyle = "rgba(233,226,212,.18)";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(CX, CY, R, 0, Math.PI * 2); ctx.stroke();
    }

    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = FAINT;
    ctx.font = "590 26px Inter, system-ui, sans-serif";
    ctx.letterSpacing = "2px";
    ctx.fillText("LISTENING TO", M, LABEL_Y);
    ctx.letterSpacing = "0px";

    /**
     * The station, as large as it can be without being cut — by width *and* by
     * height.
     *
     * `fitted` only ever answered the width question, so a name long enough to
     * take two lines was still set at the full size and the second line pushed
     * the city down onto the foot. The clamp that stopped it hitting "AuralFM"
     * then parked the city 20px under the second baseline, which is a collision
     * wearing a seatbelt. The budget below is the honest fix: whatever is left
     * between the label and the foot has to hold every line plus the gap under
     * them, so a two-line title is set smaller rather than allowed to overflow.
     */
    const GAP = 64;                           // last title baseline -> city baseline
    const LEAD = 1.14;
    let titleSize = fitted(ctx, now.title, 700, 88, 44, inner);
    ctx.font = `700 ${titleSize}px Inter, system-ui, sans-serif`;
    let lines = wrap(ctx, now.title, inner, 2);
    if (lines.length > 1) {
      const budget = TEXT_FLOOR - TITLE_TOP;
      const fits = Math.floor((budget - GAP) / (1 + LEAD * (lines.length - 1)));
      if (fits < titleSize) {
        titleSize = Math.max(44, fits);
        ctx.font = `700 ${titleSize}px Inter, system-ui, sans-serif`;
        lines = wrap(ctx, now.title, inner, 2);
      }
    }
    ctx.fillStyle = BONE;
    let y = TITLE_TOP + titleSize;
    lines.forEach((line, i) => {
      ctx.fillText(line, M, y);
      // Between lines only. Advancing after the last one left a whole empty line
      // of air under the title, which is what put the city adrift from it.
      if (i < lines.length - 1) y += titleSize * LEAD;
    });

    /**
     * Where it is coming from.
     *
     * A constant gap, not a multiple of the title size — it was a multiple, and
     * a long station name, which is exactly the case that shrinks the title,
     * pulled the place up against it. Close, because the station and the place
     * it broadcasts from are one thought, not two facts that happen to be
     * stacked. The clamp stays as a backstop, but the height budget above is
     * what actually keeps this off the foot now.
     */
    const where = [now.place, now.country].filter(Boolean).join(", ");
    if (where) {
      const ps = fitted(ctx, where, 500, 40, 26, inner);
      ctx.font = `500 ${ps}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = DIM;
      y = Math.min(y + GAP, TEXT_FLOOR);
      ctx.fillText(where, M, y);
      y += 30;
    }

    // Shortwave says so, with the frequency, because that is the whole identity
    // of a shortwave broadcast in a way a station name is not.
    if (now.sdr && now.freq) {
      ctx.font = "500 32px Inter, system-ui, sans-serif";
      ctx.fillStyle = FAINT;
      ctx.fillText(`${Number(now.freq.toFixed(2))} kHz · shortwave`,
                   M, Math.min(y + 12, TEXT_FLOOR + 42));
    }

    /**
     * The sound, across the card.
     *
     * Real levels, sampled from what was actually playing over the last few
     * seconds — never a generated squiggle. A decorative waveform on a card that
     * says "listening to" is a lie told in a picture, and this app does not tell
     * them. If there is nothing to draw the band is simply absent.
     */
    if (Array.isArray(now.levels) && now.levels.length) {
      const bars = now.levels;
      /**
       * Scaled to its own loudest moment, not to an absolute.
       *
       * Somebody listening quietly is still listening, and an absolute scale
       * draws them a flat line that reads as a broken feature. The *shape* is
       * the true thing here — which second was louder than which — and the floor
       * keeps genuine silence looking silent rather than being amplified into a
       * pattern that was never there.
       */
      const loudest = Math.max(0.15, ...bars);
      const bandY = WAVE_Y;
      const bandH = WAVE_H;
      const gap = 5;
      const bw = (inner + gap) / bars.length - gap;
      for (let i = 0; i < bars.length; i++) {
        const v = Math.max(0.02, Math.min(1, bars[i] / loudest));
        const h = Math.max(3, v * bandH);
        const x = M + i * (bw + gap);
        // Brighter where it is louder, so the shape reads even at a glance.
        ctx.fillStyle = `rgba(233,226,212,${0.22 + v * 0.55})`;
        ctx.beginPath();
        ctx.roundRect(x, bandY + (bandH - h) / 2, Math.max(1.5, bw), h, Math.min(3, bw / 2));
        ctx.fill();
      }
    }

    /**
     * The code, on the right.
     *
     * A prototype, and it says so honestly by pointing somewhere real rather
     * than somewhere invented: the repository, which is where the app itself
     * lives. It 404s until that repository is public, and it is one constant to
     * change the day there is a site — or, later, the day a station has a page
     * of its own, which is what Melton actually wants it to reach.
     *
     * Encoded by a library rather than by hand. A subtly wrong QR looks perfect
     * and scans as nothing, and there is no way to check that from here — the
     * only honest verification is a phone, so the encoder is one that is already
     * verified by everybody else using it.
     */
    if (now.qr && typeof qrcode === "function") {
      try {
        const q = qrcode(0, "M");
        q.addData(now.qr);
        q.make();
        const n = q.getModuleCount();
        const quiet = 3;                       // a code with no margin will not scan
        const cell = QR / (n + quiet * 2);
        ctx.fillStyle = "rgba(233,226,212,.92)";
        ctx.beginPath();
        ctx.roundRect(QR_X, QR_Y, QR, QR, 12);
        ctx.fill();
        ctx.fillStyle = INK;
        for (let r = 0; r < n; r++) {
          for (let c = 0; c < n; c++) {
            if (!q.isDark(r, c)) continue;
            ctx.fillRect(QR_X + (c + quiet) * cell, QR_Y + (r + quiet) * cell,
                         Math.ceil(cell), Math.ceil(cell));
          }
        }
        /**
         * Under the code, right-aligned to it.
         *
         * A caption belongs under the thing it captions. It sat above for a
         * while because the code was low enough that anything beneath it would
         * have been on the card's edge — so the code moved up rather than the
         * label staying in the wrong place. Right-aligned because the words are
         * wider than the code: set from its left edge they ran past the card's
         * own margin, which is the one line here that has to be straight.
         */
        ctx.fillStyle = FAINT;
        ctx.font = "500 20px Inter, system-ui, sans-serif";
        ctx.textAlign = "right";
        ctx.fillText(t_scan, QR_X + QR, QR_Y + QR + 30);
        ctx.textAlign = "left";
      } catch { /* no code rather than a broken one */ }
    }

    // The foot: the app, and when. The time is the point of a card like this —
    // it says "right now", which is the only claim it is making.
    ctx.font = "700 34px Inter, system-ui, sans-serif";
    ctx.fillStyle = BONE;
    ctx.fillText("AuralFM", M, FOOT_NAME);

    ctx.font = "500 27px Inter, system-ui, sans-serif";
    ctx.fillStyle = FAINT;
    const stamp = now.when.toLocaleString([], {
      weekday: "short", hour: "numeric", minute: "2-digit",
    });
    ctx.fillText(stamp, M, FOOT_TIME);

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
      try { await document.fonts.ready; } catch { /* draw in whatever we have */ }
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
