/**
 * Rasterize assets/*.svg into the PNGs macOS needs.
 *
 *   npm run icons
 *
 * Run via Electron (not plain node) so we get Chromium's SVG renderer and a
 * genuinely transparent backing store — QuickLook and sips both flatten alpha
 * in ways that ruin a menu bar template image.
 *
 * Menu bar icons must be named *Template.png. macOS reads only their alpha and
 * redraws them in the correct color, so they invert automatically on dark menu
 * bars and turn white when the menu is open. Any color in the file is discarded,
 * which is why these are rendered pure black.
 */

const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const { execFileSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const ASSETS = path.join(ROOT, "assets");
// The Earth variant paints with the texture three-globe gives the globe, read
// from the vendored copy so the icon and the app can never disagree about it.
const TEXTURES = require("node:url").pathToFileURL(
  path.join(ROOT, "src", "renderer", "vendor")).href;
const OUT = path.join(ASSETS, "generated");
const ICONSET = path.join(ROOT, "build", "icon.iconset");
const MAX = 1024;

/**
 * The .icns entries, and which glyph each one uses.
 *
 * Two glyphs, on purpose. The outlined globe is beautiful at 128 and above and
 * collapses into a solid disc at 32, because its latitude lines merge once they
 * are under a pixel apart. The filled globe keeps its bands legible down to 16.
 * Carrying different artwork at different sizes is exactly what the .icns format
 * is for, and it is what Apple's own icons do.
 *
 * This also fixes a quieter problem: nothing regenerated build/icon.icns, so the
 * packaged app kept shipping whatever was committed there months ago.
 */
const ICNS = [
  ["icon_16x16.png",        16,  "icon.svg"],
  ["icon_16x16@2x.png",     32,  "icon.svg"],
  ["icon_32x32.png",        32,  "icon.svg"],
  ["icon_32x32@2x.png",     64,  "icon.svg"],
  ["icon_128x128.png",     128,  "icon-line.svg"],
  ["icon_128x128@2x.png",  256,  "icon-line.svg"],
  ["icon_256x256.png",     256,  "icon-line.svg"],
  ["icon_256x256@2x.png",  512,  "icon-line.svg"],
  ["icon_512x512.png",     512,  "icon-line.svg"],
  ["icon_512x512@2x.png", 1024,  "icon-line.svg"],
];

// [source svg, output basename, size px, style]
//
// "template" is a menu bar image: pure black on transparency, because macOS
// reads only the alpha and redraws it — any colour in the file is discarded.
//
// "app" is the Dock/Finder icon and needs the opposite treatment. It used to be
// rendered the same way as the tray glyph — black line art on a transparent
// square — which is nearly invisible on a dark Dock and has none of the shape
// macOS expects. It now composes the glyph onto a proper icon: rounded square,
// Apple's margins, and the night-Earth palette the app itself uses.
const JOBS = [
  ["icon.svg",      "trayTemplate.png",    16, "template", "onyx"],
  ["icon.svg",      "trayTemplate@2x.png", 32, "template", "onyx"],
  ["icon.svg",      "favicon.png",         64, "app",      "onyx"],
  ["icon-line.svg", "app-512.png",        512, "app",      "onyx"],
  ["icon-line.svg", "app-1024.png",      1024, "app",      "onyx"],
  // The switchable set, chosen in Settings. 512 is what app.dock.setIcon wants.
  // Nothing here replaces the bundle's own icon: that is fixed at build time,
  // so Finder keeps showing the default while the Dock follows the setting.
  ["icon.svg",      "dock-onyx.png",      512, "app",      "onyx"],
  ["icon.svg",      "dock-bone.png",      512, "app",      "bone"],
  ["icon.svg",      "dock-onair.png",     512, "app",      "onair"],
  ["icon-line.svg", "dock-earth.png",     512, "app",      "earth"],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Apple's macOS icon grid, as ratios of the full canvas.
 *
 * The rounded square occupies 824 of 1024 and its corner radius is 185.4 — the
 * remaining margin is not padding, it is the space the system expects for the
 * shadow. Getting this wrong is the single most obvious way an icon reads as a
 * port rather than a Mac app.
 */
/**
 * The switchable icons.
 *
 * Two Noun Project marks were licensed, filled and outlined, and this is how
 * they compose against the brand. The Earth is not the mark at all: it is the
 * same texture the globe is wearing, so the thing in the Dock and the thing on
 * screen are one object rather than an emblem of it.
 *
 * `body` fills the squircle, `glyph` colours the mark, `catch` is the top edge
 * highlight. `texture` replaces the fill and drops the glyph entirely.
 */
const VARIANTS = {
  onyx: {
    body: "radial-gradient(125% 125% at 26% 20%, #2A2622 0%, #171514 45%, #0C0B0B 100%)",
    glyph: "#E9E2D4",
    catch: "rgba(233,226,212,.16)",
  },
  bone: {
    // Inverted. Bone is warm rather than white, so the onyx mark sits on it the
    // way ink sits on paper instead of reading as a cut-out.
    body: "radial-gradient(125% 125% at 26% 20%, #FBF9F5 0%, #EFE9DC 45%, #E2DACA 100%)",
    glyph: "#1E1B19",
    catch: "rgba(255,255,255,.55)",
  },
  onair: {
    // The green the app uses for a live signal, deepened toward the edge so it
    // reads as a lit object rather than a flat swatch.
    body: "radial-gradient(125% 125% at 26% 20%, #4BD98A 0%, #35C46A 45%, #1B7A44 100%)",
    glyph: "#F7F4EE",
    catch: "rgba(255,255,255,.30)",
  },
  // A globe, at the same size as the line-art glyph the other three use -- not
  // the texture stretched across the whole tile. The first version filled the
  // squircle with a flat equirectangular crop, which reads as a map of the world
  // rather than as the object this app draws.
  earth: {
    // Space, not a flat dark tile: the same night-sky.png the globe scene puts
    // behind the Earth, so the icon and the app share one sky the way they
    // already share one Earth.
    sky: "night-sky.png",
    texture: "earth-blue-marble.jpg",
    catch: "rgba(255,255,255,.10)",
  },
};

const SQUIRCLE = 824 / 1024;
const GLYPH = 0.62;              // of the squircle — line art needs room to breathe

/**
 * The squircle, as an actual superellipse.
 *
 * This was `border-radius`, and `border-radius` draws a *circular* arc: it
 * curves at a constant rate and then stops dead where it meets the straight
 * edge. Apple's corner is continuous — it eases into the straight edge, so the
 * curvature never jumps. Measured against Music.app at 512px, the difference
 * shows up as a corner that reads noticeably squarer than the system's, and it
 * is one of the tells that an icon was not drawn for the Mac.
 *
 * |x|^n + |y|^n = 1 with n = 5 is the usual approximation and is close enough
 * that the remaining error is under a pixel at 1024.
 *
 * Sampled rather than fitted with béziers: at these sizes 512 points is smooth
 * past the resolution of the output, and a sampled path cannot be subtly wrong
 * in the way a hand-fitted control point can.
 */
function squirclePath(box, n = 5) {
  const r = box / 2, pts = [], N = 512;
  for (let i = 0; i < N; i++) {
    const t = (i / N) * 2 * Math.PI;
    const c = Math.cos(t), s = Math.sin(t);
    const x = r + r * Math.sign(c) * Math.abs(c) ** (2 / n);
    const y = r + r * Math.sign(s) * Math.abs(s) ** (2 / n);
    pts.push(`${x.toFixed(2)} ${y.toFixed(2)}`);
  }
  return `M${pts[0]}L${pts.slice(1).join("L")}Z`;
}

function page(svg, size, style = "template", variant = "onyx") {
  if (style === "template") {
    return `<!doctype html><meta charset="utf-8">
      <style>
        html,body{margin:0;padding:0;background:transparent}
        #w{width:${size}px;height:${size}px;color:#000}
        svg{width:100%;height:100%;display:block}
      </style>
      <div id="w">${svg}</div>
      <script>requestAnimationFrame(() => requestAnimationFrame(
        () => { document.documentElement.dataset.ready = "1"; }));</script>`;
  }

  const v = VARIANTS[variant] || VARIANTS.onyx;
  const box = Math.round(size * SQUIRCLE);
  const glyph = Math.round(box * GLYPH);
  const clip = squirclePath(box);
  /**
   * The shadow, matched to the system rather than guessed.
   *
   * Profiled from Music.app at 512px by reading alpha outward from the icon
   * body: 60 two pixels below, 33 at the sides, 8 above, gone by 24.
   *
   * That is one shadow pushed downward, not two. The first attempt here stacked
   * an ambient blur under a key blur and measured 57 above the icon where the
   * system has 8 — the ambient term is what makes a shadow look symmetrical, and
   * a symmetrical shadow reads as a sticker rather than an object on a surface.
   * A single offset blur reproduces all three numbers. The parameters below were
   * not chosen by eye: a sweep over offset x blur x opacity, scored as RMS error
   * against the system's profile at five distances on three sides, bottoms out
   * at 0.012 / 0.014 / 0.32 with an RMS of 2 out of 255.
   *
   * `drop-shadow` and not `box-shadow`: box-shadow is drawn from the border box
   * and would ignore the clip entirely, casting a rectangle's shadow from behind
   * a squircle. drop-shadow follows the rendered alpha, which is the whole point
   * once the shape is no longer a rounded rect.
   *
   * The margin this occupies is not padding. macOS reserves it for exactly this,
   * which is why the body is 824/1024 and not the full canvas.
   */
  const px = (f) => (size * f).toFixed(2) + "px";
  return `<!doctype html><meta charset="utf-8">
    <style>
      html,body{margin:0;padding:0;background:transparent}
      #c{
        width:${size}px;height:${size}px;
        display:flex;align-items:center;justify-content:center;
      }
      #d{
        filter: drop-shadow(0 ${px(0.012)} ${px(0.014)} rgba(0,0,0,.32));
        display:flex;
      }
      /* Onyx and bone.
         Onyx is not flat black — real onyx has depth and a slight warmth, so the
         gradient lifts toward the top-left the way the globe's own lit limb does.
         Bone is not white: it is warm and slightly soft, which is what keeps the
         mark from looking like a system glyph borrowed from somewhere else. */
      #s{
        width:${box}px;height:${box}px;
        clip-path:path("${clip}");
        background:${v.sky
          ? `url("${TEXTURES}/${v.sky}") 50% 46% / 145% no-repeat, #04060B`
          : v.body};
        display:flex;align-items:center;justify-content:center;
      }
      /* The top edge catch-light, drawn inside the clip. It used to be an inset
         box-shadow, which the clip now eats — and an inset shadow followed the
         rounded rect anyway, not the squircle. */
      #s::before{
        content:"";position:absolute;left:0;right:0;top:0;
        height:${Math.max(1, Math.round(box*0.004))}px;
        background:${v.catch};
      }
      #s{position:relative}
      /* Day falling into night across the face, so the Earth variant is the same
         object the app draws rather than a flat photograph of a map. */
      /* The sphere.
         A circle of texture is only a disc until it is lit, so the limb darkening
         is what makes it read as round -- and it stays at the outer edge instead
         of washing the face. The version this replaces laid two gradients at .55
         and .88 opacity across the entire tile and buried the Earth completely.
         Keep anything added here weak enough that the map still reads. */
      ${v.texture ? `
      #g{
        border-radius:50%;overflow:hidden;position:relative;
        background:url("${TEXTURES}/${v.texture}") 42% 48% / 232% no-repeat, #06121F;
        /* The atmosphere. Three rings of the same blue at widening spreads: a
           tight bright one on the limb, then two bleeding into the sky. Without
           it the Earth is a ball pasted onto a starfield.

           box-shadow is not clipped by overflow:hidden -- overflow clips
           children, not shadows -- so the glow escapes the circle while the
           texture inside stays clipped to it. An earlier attempt added
           overflow:visible and a ::before to work around a problem that does not
           exist, and lost the texture doing it. */
        box-shadow:
          0 0 ${Math.round(glyph*0.05)}px rgba(130,185,255,.55),
          0 0 ${Math.round(glyph*0.15)}px rgba(85,145,230,.32),
          0 0 ${Math.round(glyph*0.32)}px rgba(50,100,190,.18);
      }
      #g::after{
        content:"";position:absolute;inset:0;border-radius:50%;
        background:
          radial-gradient(circle at 33% 27%,
            rgba(255,255,255,.20) 0%, rgba(255,255,255,.05) 20%, rgba(255,255,255,0) 44%),
          radial-gradient(circle at 50% 50%,
            rgba(0,0,0,0) 54%, rgba(2,10,24,.30) 85%, rgba(1,4,12,.60) 100%);
      }` : ""}
      #g{width:${glyph}px;height:${glyph}px;color:${v.glyph || "transparent"};display:block;position:relative}
      svg{width:100%;height:100%;display:block}
    </style>
    <div id="c"><div id="d"><div id="s"><div id="g">${v.texture ? "" : svg}</div></div></div></div>
    <script>
      /* Say when this frame is really ready.
         The capture used to wait a flat 150ms, which is plenty for inline SVG and
         not for a 1.4 MB JPEG, so the Earth variant was photographed before its
         texture decoded. Signalled on a data attribute rather than a global,
         because executeJavaScript runs in an isolated world and cannot see a
         global set here -- the DOM is shared, so an attribute crosses. */
      (async () => {
        ${v.texture ? `try {
          await Promise.all(${JSON.stringify(
            [`${TEXTURES}/${v.texture}`, v.sky ? `${TEXTURES}/${v.sky}` : null].filter(Boolean)
          )}.map(async (u) => {
            const i = new Image(); i.src = u; await i.decode();
          }));
        } catch (e) { document.documentElement.dataset.texErr = String(e); }` : ""}
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        document.documentElement.dataset.ready = "1";
      })();
    </script>`;
}

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  // One window reused for every job. Creating a fresh transparent+offscreen
  // BrowserWindow per icon fails with ERR_FAILED on the second one.
  const win = new BrowserWindow({
    width: MAX, height: MAX,
    show: false, frame: false, transparent: true,
    backgroundColor: "#00000000",
    useContentSize: true,
    // Not offscreen. An offscreen renderer rasterizes the squircle, the
    // gradients and the SVG glyph correctly but drops the Earth texture, so the
    // Earth variant captured as flat #06121F while the same markup shown in a
    // real window -- the icon picker in Settings -- painted it fine. A hidden
    // ordinary window captures identically and does paint it.
    webPreferences: {},
  });

  fs.mkdirSync(ICONSET, { recursive: true });

  const tmp = path.join(OUT, ".render.html");
  const untilReady = async (win, ms = 8000) => {
    const start = Date.now();
    for (;;) {
      const err = await win.webContents.executeJavaScript(
        "document.documentElement.dataset.texErr || null");
      // Checked on every pass, not only on timeout. A texture that fails to load
      // sets texErr and *still* lets the ready flag be set, because the catch
      // swallows it — so the old code sailed past a broken texture and wrote a
      // flat icon while reporting success.
      if (err) throw new Error("texture failed to load: " + err);
      if (await win.webContents.executeJavaScript(
        "document.documentElement.dataset.ready === '1'")) return;
      if (Date.now() - start > ms) throw new Error("icon never reported ready");
      await sleep(40);
    }
  };

  /**
   * Did the map actually arrive?
   *
   * `Image.decode()` proves the file parses. It does not prove the *CSS
   * background layer* has been rasterized, and those are separate pieces of work
   * in the compositor — so on an unlucky run the capture happened with the
   * texture decoded and the layer still unpainted. The Earth came out as flat
   * fallback navy, the starfield behind it came out pure black, the build
   * reported success, and a black sphere shipped.
   *
   * That is not fixable by waiting longer on a guess. The only reliable signal is
   * the artifact: a photograph of the Earth has continents, oceans and ice in it,
   * so its luminance varies a lot. A flat fill does not vary at all. Measured
   * over the middle half of the canvas, the broken render scored sd 11.9 and a
   * correct one 42.2 — far enough apart to test with confidence.
   */
  const FLAT_SD = 25;
  const contrast = (img) => {
    const { width: w, height: h } = img.getSize();
    const b = img.getBitmap();
    const x0 = Math.round(w * 0.25), x1 = Math.round(w * 0.75);
    const y0 = Math.round(h * 0.25), y1 = Math.round(h * 0.75);
    let n = 0, sum = 0, sumSq = 0;
    for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
      const o = (y * w + x) * 4;
      const lum = 0.2126 * b[o + 2] + 0.7152 * b[o + 1] + 0.0722 * b[o];
      n++; sum += lum; sumSq += lum * lum;
    }
    const mean = sum / n;
    return Math.sqrt(Math.max(0, sumSq / n - mean * mean));
  };

  /**
   * Load, settle, capture — and for a textured variant, prove the texture is in
   * the pixels before accepting the shot. Retries rather than failing on the
   * first flat frame, because the cause is a race and a second attempt with the
   * layer already warm almost always wins.
   */
  const shoot = async (win, size, textured, attempts = 4) => {
    for (let i = 1; ; i++) {
      await win.loadFile(tmp);
      await untilReady(win);
      // More frames on each retry: the first pass is the cold one.
      for (let f = 0; f < i * 2; f++) await sleep(60);
      const shot = await win.webContents.capturePage({ x: 0, y: 0, width: size, height: size });
      const img = shot.getSize().width === size
        ? shot
        : shot.resize({ width: size, height: size, quality: "best" });
      if (!textured) return img;
      const sd = contrast(img);
      if (sd >= FLAT_SD) return img;
      if (i >= attempts) {
        throw new Error(`textured icon rendered flat after ${attempts} attempts `
          + `(contrast sd ${sd.toFixed(1)}, need ${FLAT_SD}). `
          + `Refusing to write a black icon — that is the bug this check exists for.`);
      }
      console.log(`  retrying textured render (attempt ${i} was flat, sd ${sd.toFixed(1)})`);
    }
  };

  // capturePage returns device pixels, so on a Retina display a shot comes back
  // at 2x the requested size. shoot() downscales to the exact dimensions asked
  // for — which also means every icon is supersampled, not just resized up.
  const render = async (win, svgFile, size, style) => {
    const svg = fs.readFileSync(path.join(ASSETS, svgFile), "utf8");
    fs.writeFileSync(tmp, page(svg, size, style));
    return (await shoot(win, size, false)).toPNG();
  };

  try {
    for (const [src, name, size, style, variant] of JOBS) {
      const svg = fs.readFileSync(path.join(ASSETS, src), "utf8");
      fs.writeFileSync(tmp, page(svg, size, style, variant));
      const png = (await shoot(win, size, !!VARIANTS[variant]?.texture)).toPNG();
      fs.writeFileSync(path.join(OUT, name), png);
      console.log(`  ${name.padEnd(22)} ${size}x${size}  ${(png.length / 1024).toFixed(1)} KB`);
    }

    // ── the .icns, which is what actually ships ──────────────────────────────
    for (const [name, size, svgFile] of ICNS) {
      const png = await render(win, svgFile, size, "app");
      fs.writeFileSync(path.join(ICONSET, name), png);
    }
    execFileSync("iconutil", ["-c", "icns", ICONSET, "-o", path.join(ROOT, "build", "icon.icns")]);
    const icns = fs.statSync(path.join(ROOT, "build", "icon.icns"));
    console.log(`  build/icon.icns        ${ICNS.length} sizes  ${(icns.size / 1024).toFixed(0)} KB`);
  } catch (err) {
    /**
     * Fail the build, loudly.
     *
     * Without this the rejection surfaced as an UnhandledPromiseRejectionWarning
     * and the process still exited 0, so `npm run dist` printed the error, walked
     * straight past it, and packaged whatever icon happened to be on disk. Every
     * guard above was already working and none of them could stop a release —
     * which is the same shape as the bug they exist to catch.
     */
    console.error("\nicon generation failed:", err.message, "\n");
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    win.destroy();
    app.exit(1);
    return;
  } finally {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    if (!win.isDestroyed()) win.destroy();
  }
  console.log("written to assets/generated/");
  app.quit();
});
