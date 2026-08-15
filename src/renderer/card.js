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
  const W = 1080, H = 1080;

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
   * Draw the card.
   *
   * @param {{title:string, place:string, country:string, sdr:boolean,
   *          freq:number|null, when:Date}} now
   * @returns {string} a data URL
   */
  function draw(now) {
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d");

    ctx.fillStyle = INK;
    ctx.fillRect(0, 0, W, H);

    // A horizon, not a decoration: the app is a globe, and a curve at the foot
    // of the card says so without shipping a screenshot of one.
    ctx.strokeStyle = "rgba(233,226,212,.10)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(W / 2, H + 620 - i * 46, 900, Math.PI * 1.12, Math.PI * 1.88);
      ctx.stroke();
    }

    const M = 96;                       // margin
    const inner = W - M * 2;

    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = FAINT;
    ctx.font = "590 26px Inter, system-ui, sans-serif";
    ctx.letterSpacing = "2px";
    ctx.fillText("LISTENING TO", M, 210);
    ctx.letterSpacing = "0px";

    // The station, as large as it can be without being cut.
    const titleSize = fitted(ctx, now.title, 700, 96, 44, inner);
    ctx.font = `700 ${titleSize}px Inter, system-ui, sans-serif`;
    const lines = wrap(ctx, now.title, inner, 3);
    ctx.fillStyle = BONE;
    let y = 210 + titleSize + 40;
    for (const line of lines) {
      ctx.fillText(line, M, y);
      y += titleSize * 1.14;
    }

    /**
     * Where it is coming from.
     *
     * The gap above it is a constant, not a multiple of the title size. It was a
     * multiple, and a long station name — which is the case that shrinks the
     * title — pulled the place up against it, so the cards that needed the
     * separation most had the least.
     */
    y += 30;
    const where = [now.place, now.country].filter(Boolean).join(", ");
    if (where) {
      const s = fitted(ctx, where, 500, 46, 28, inner);
      ctx.font = `500 ${s}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = DIM;
      ctx.fillText(where, M, y + 18);
      y += s + 34;
    }

    // Shortwave says so, with the frequency, because that is the whole identity
    // of a shortwave broadcast in a way a station name is not.
    if (now.sdr && now.freq) {
      ctx.font = "500 34px Inter, system-ui, sans-serif";
      ctx.fillStyle = FAINT;
      ctx.fillText(`${Number(now.freq.toFixed(2))} kHz · shortwave`, M, y + 10);
    }

    // The foot: the app, and when. The time is the point of a card like this —
    // it says "right now", which is the only claim it is making.
    ctx.font = "700 34px Inter, system-ui, sans-serif";
    ctx.fillStyle = BONE;
    ctx.fillText("AuralFM", M, H - M - 40);

    ctx.font = "500 27px Inter, system-ui, sans-serif";
    ctx.fillStyle = FAINT;
    const stamp = now.when.toLocaleString([], {
      weekday: "short", hour: "numeric", minute: "2-digit",
    });
    ctx.fillText(stamp, M, H - M);

    return cv.toDataURL("image/png");
  }

  window.Card = {
    /**
     * Make the card. Waits for the font, because a card drawn before Inter
     * loads is drawn in the system fallback and looks like somebody else's app.
     */
    async make(now) {
      try { await document.fonts.ready; } catch { /* draw in whatever we have */ }
      return draw(now);
    },
  };
})();
