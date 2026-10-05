/**
 * Explore, part 10 of 17: The real sky behind the globe.
 *
 * Explore is one page split across plain scripts that share a global scope, in
 * the order explore.html loads them. This part only declares: nothing in it runs
 * at load, so it has no wire function. The parts that do run something at load
 * keep it in a wire function that explore.js calls once every part has loaded.
 */

// ── real sky ─────────────────────────────────────────────────────────────────
/**
 * Draw the actual sky — 5,044 stars to magnitude 6 and 89 constellation figures
 * from the Yale Bright Star Catalog — into an equirectangular canvas used as the
 * scene backdrop.
 *
 * Honest limitation: this is a *backdrop*, not an oriented sky dome. Stars sit
 * correctly relative to each other and the constellations are the real figures,
 * but the sky does not parallax as you spin the Earth. Doing that properly means
 * a textured sky sphere on its own rotation, which is a bigger change than the
 * payoff justifies right now.
 */
async function drawSky() {
  if (!layers.constellations) {
    globe.backgroundImageUrl(texUrl("night-sky.png"));   // plain stars, no figures
    return;
  }
  const sky = await window.auralfm.sky();
  if (!sky?.stars?.length) return;   // keep the vendored texture
  const lang = sky.lang || "en";     // resolved in main, where "system" means something

  const W = 4096, H = 2048;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#05070c";
  ctx.fillRect(0, 0, W, H);

  // RA 0-360 -> x, Dec +90..-90 -> y
  const X = (ra) => ((ra % 360) + 360) % 360 / 360 * W;
  const Y = (dec) => (90 - dec) / 180 * H;

  /**
   * The ecliptic — the plane of the solar system, seen edge-on from inside it.
   *
   * Every planet, the Moon and the Sun stay within a few degrees of this line,
   * which is *why* the zodiac is the zodiac: those are simply the figures the
   * Sun passes in front of over a year. Drawing it turns twelve arbitrary names
   * into one visible fact, and it puts the planets already on this canvas into
   * the geometry that explains why they are where they are.
   *
   * Obliquity is 23.44 degrees — the Earth's tilt, the same number that gives us
   * seasons and the terminator's lean on the globe.
   */
  const OBLIQ = 23.4393 * Math.PI / 180;
  ctx.strokeStyle = "rgba(233,226,212,0.20)";
  ctx.lineWidth = 1.4;
  ctx.setLineDash([7, 7]);
  ctx.beginPath();
  let prevX = null;
  for (let deg = 0; deg <= 360; deg += 1) {
    const lam = deg * Math.PI / 180;
    const dec = Math.asin(Math.sin(OBLIQ) * Math.sin(lam)) * 180 / Math.PI;
    const ra = Math.atan2(Math.cos(OBLIQ) * Math.sin(lam), Math.cos(lam)) * 180 / Math.PI;
    const x = X(ra), y = Y(dec);
    // The curve wraps at RA 0; lifting the pen stops a stripe across the sky.
    if (prevX !== null && Math.abs(x - prevX) > W / 2) ctx.moveTo(x, y);
    else if (prevX === null) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
    prevX = x;
  }
  ctx.stroke();
  ctx.setLineDash([]);

  const zodiacal = new Set((sky.names || []).filter((n) => n.z).map((n) => n.id));

  // Constellation figures first, so stars sit on top of their own lines.
  ctx.lineWidth = 1.6;
  for (const c of sky.constellations) {
    // The twelve on the ecliptic are drawn brighter — not because they matter
    // astronomically, but because the line above is the reason anyone has heard
    // of them, and the pairing is the whole point.
    ctx.strokeStyle = zodiacal.has(c.id) ? "rgba(180,205,255,0.38)" : "rgba(120,165,255,0.22)";
    for (const seg of c.l) {
      ctx.beginPath();
      let px = null;
      for (const [ra, dec] of seg) {
        const x = X(ra), y = Y(dec);
        // Lift the pen where the figure crosses RA 0. Right ascension wraps and
        // the canvas does not, so a segment from 359 to 1 degrees was drawn as a
        // line straight across the entire sky — Pegasus, Pisces and Cetus each
        // laid a horizontal streak over everything. Invisible until the labels
        // arrived and gave the eye something to compare against.
        if (px !== null && Math.abs(x - px) > W / 2) ctx.moveTo(x, y);
        else if (px === null) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        px = x;
      }
      ctx.stroke();
    }
  }

  for (const [ra, dec, mag] of sky.stars) {
    // Magnitude is backwards and logarithmic: mag 0 is brilliant, mag 6 is the
    // naked-eye limit. Map it to radius and alpha so the sky has real hierarchy.
    const b = Math.max(0, (6.2 - mag) / 6.2);
    const r = 0.6 + b * b * 3.4;
    ctx.globalAlpha = 0.35 + b * 0.65;
    // Bright stars stay white; the faint ones take the palette's tint, which is
    // how a real sky looks and keeps the scheme visible without dyeing Sirius.
    ctx.fillStyle = b > 0.72 ? "#ffffff" : (palette?.star || "#ffffff");
    ctx.beginPath();
    ctx.arc(X(ra), Y(dec), r, 0, 6.2832);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  /**
   * Names.
   *
   * "That's Orion" is most of what anyone wants from a star map, and the lines
   * alone could never say it. Drawn after the stars so the type sits over the
   * figure it belongs to, and sized by the catalogue's own prominence rank so
   * Orion and Ursa Major read before Lacerta.
   *
   * The label point comes from the catalogue rather than a centroid of the
   * lines: a centroid lands inside the figure and collides with its own stars.
   */
  /**
   * Write a label that survives the sky's mirroring.
   *
   * This canvas is handed to `backgroundImageUrl`, which maps it onto the
   * inside of the celestial sphere — and from the inside you see it flipped
   * left-for-right. That is *correct* for the geometry: the constellations then
   * appear the way they do when you stand outside and look up, which is the
   * whole point of drawing real ones. Text does not survive the same trip, so
   * every label read backwards — Orion rendered as "noirO", Shield as "bleidS".
   *
   * Pre-flipping just the glyphs cancels the mapping's flip and leaves every
   * star, line and coordinate exactly where it was. Flipping the whole canvas
   * instead would have fixed the words and quietly mirrored the sky.
   */
  function skyText(text, x, y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(-1, 1);
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  ctx.textAlign = "center";
  for (const n of sky.names || []) {
    const label = n.name?.[lang] || n.name?.en || n.id;
    if (!label) continue;
    const prominent = n.rank === 1;
    ctx.font = `${prominent ? 600 : 500} ${prominent ? 25 : 19}px ` +
               `-apple-system, system-ui, sans-serif`;
    ctx.globalAlpha = n.z ? 0.72 : (prominent ? 0.55 : 0.34);
    ctx.fillStyle = n.z ? (palette?.accent || "#E9E2D4") : "#cfe0ff";
    skyText(label, X(n.ra), Y(n.dec));
  }
  ctx.globalAlpha = 1;

  /**
   * The planets, on top of the stars because that is where they are — wandering
   * across a fixed background. Drawn with their own colour and a soft halo so
   * they read as a different kind of object rather than just a brighter star,
   * which is exactly how they look to the eye.
   *
   * Positions are computed for right now, so the sky redraws them as they move.
   */
  for (const pl of Astro.planets()) {
    const x = X(pl.ra), y = Y(pl.dec);
    const b = Math.max(0.15, Math.min(1, (2.5 - pl.mag) / 7));
    const r = 2.2 + b * 4.4;

    const halo = ctx.createRadialGradient(x, y, 0, x, y, r * 3.6);
    halo.addColorStop(0, pl.colour);
    halo.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(x, y, r * 3.6, 0, 6.2832);
    ctx.fill();

    ctx.globalAlpha = 1;
    ctx.fillStyle = pl.colour;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 6.2832);
    ctx.fill();

    // A name, because an unlabelled bright dot is just a brighter star.
    ctx.font = "600 21px -apple-system, system-ui, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.62)";
    ctx.textAlign = "center";
    skyText(pl.name, x, y - r - 11);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = "left";

  globe.backgroundImageUrl(cv.toDataURL("image/jpeg", 0.86));
}
