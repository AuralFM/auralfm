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

  /** The app's own colours, so a card looks like the thing it came from. */
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
     * The layout, as bands.
     *
     * The first version placed each element from its own constant and they
     * collided — the waveform landed across the title and the foot sat on top of
     * the place. Bands are stated once here and everything hangs off them.
     */
    const M = 96;
    const inner = W - M * 2;
    const GLOBE_CY = 380, GLOBE_R = 330;      //  50 ..  710
    const WAVE_Y = 762, WAVE_H = 84;          // 762 ..  846
    const LABEL_Y = 906;
    const TITLE_TOP = 962;                    // two lines reach ~1160
    const FOOT_NAME = H - 96, FOOT_TIME = H - 52;   // 1254, 1298

    // The Earth, centred on the station, above the words about it.
    const R = GLOBE_R, CX = W / 2, CY = GLOBE_CY;
    const placed = Number.isFinite(now.lat) && Number.isFinite(now.lon)
      && drawGlobe(ctx, CX, CY, R, now.lat, now.lon, now.sun || { lat: 0, lng: 0 });

    if (placed) {
      // A ring where the station is — dead centre, because the projection is
      // centred on it. That is the whole idea: this is the view from above you.
      ctx.strokeStyle = "rgba(233,226,212,.85)";
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(CX, CY, 13, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = "rgba(233,226,212,.30)";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(CX, CY, 30, 0, Math.PI * 2); ctx.stroke();
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

    // The station, as large as it can be without being cut.
    const titleSize = fitted(ctx, now.title, 700, 76, 40, inner);
    ctx.font = `700 ${titleSize}px Inter, system-ui, sans-serif`;
    const lines = wrap(ctx, now.title, inner, 2);
    ctx.fillStyle = BONE;
    let y = TITLE_TOP + titleSize;
    for (const line of lines) {
      ctx.fillText(line, M, y);
      y += titleSize * 1.14;
    }

    /**
     * Where it is coming from.
     *
     * A constant gap, not a multiple of the title size — it was a multiple, and
     * a long station name, which is exactly the case that shrinks the title,
     * pulled the place up against it. And clamped above the foot, because a
     * two-line title used to push this line straight through "AuralFM".
     */
    const where = [now.place, now.country].filter(Boolean).join(", ");
    if (where) {
      const ps = fitted(ctx, where, 500, 40, 26, inner);
      ctx.font = `500 ${ps}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = DIM;
      y = Math.min(y + 26, FOOT_NAME - 46);
      ctx.fillText(where, M, y);
      y += 30;
    }

    // Shortwave says so, with the frequency, because that is the whole identity
    // of a shortwave broadcast in a way a station name is not.
    if (now.sdr && now.freq) {
      ctx.font = "500 32px Inter, system-ui, sans-serif";
      ctx.fillStyle = FAINT;
      ctx.fillText(`${Number(now.freq.toFixed(2))} kHz · shortwave`,
                   M, Math.min(y + 12, FOOT_NAME - 8));
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
