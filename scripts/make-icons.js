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
  ["icon.svg",      "trayTemplate.png",    16, "template"],
  ["icon.svg",      "trayTemplate@2x.png", 32, "template"],
  ["icon.svg",      "favicon.png",         64, "app"],
  ["icon-line.svg", "app-512.png",        512, "app"],
  ["icon-line.svg", "app-1024.png",      1024, "app"],
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

function page(svg, size, style = "template") {
  if (style === "template") {
    return `<!doctype html><meta charset="utf-8">
      <style>
        html,body{margin:0;padding:0;background:transparent}
        #w{width:${size}px;height:${size}px;color:#000}
        svg{width:100%;height:100%;display:block}
      </style>
      <div id="w">${svg}</div>`;
  }

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
        background:radial-gradient(125% 125% at 26% 20%, #2A2622 0%, #171514 45%, #0C0B0B 100%);
        display:flex;align-items:center;justify-content:center;
      }
      /* The top edge catch-light, drawn inside the clip. It used to be an inset
         box-shadow, which the clip now eats — and an inset shadow followed the
         rounded rect anyway, not the squircle. */
      #s::before{
        content:"";position:absolute;left:0;right:0;top:0;
        height:${Math.max(1, Math.round(box*0.004))}px;
        background:rgba(233,226,212,.16);
      }
      #s{position:relative}
      #g{width:${glyph}px;height:${glyph}px;color:#E9E2D4;display:block;position:relative}
      svg{width:100%;height:100%;display:block}
    </style>
    <div id="c"><div id="d"><div id="s"><div id="g">${svg}</div></div></div></div>`;
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
    webPreferences: { offscreen: true },
  });

  fs.mkdirSync(ICONSET, { recursive: true });

  const tmp = path.join(OUT, ".render.html");
  const render = async (win, svgFile, size, style) => {
    const svg = fs.readFileSync(path.join(ASSETS, svgFile), "utf8");
    fs.writeFileSync(tmp, page(svg, size, style));
    await win.loadFile(tmp);
    await sleep(150);
    const shot = await win.webContents.capturePage({ x: 0, y: 0, width: size, height: size });
    const img = shot.getSize().width === size
      ? shot
      : shot.resize({ width: size, height: size, quality: "best" });
    return img.toPNG();
  };

  try {
    for (const [src, name, size, style] of JOBS) {
      const svg = fs.readFileSync(path.join(ASSETS, src), "utf8");
      fs.writeFileSync(tmp, page(svg, size, style));
      await win.loadFile(tmp);
      await sleep(150);                       // let the SVG paint
      const shot = await win.webContents.capturePage({ x: 0, y: 0, width: size, height: size });
      // capturePage returns device pixels, so on a Retina display this comes back
      // at 2x the requested size. Downscale to the exact pixel dimensions we asked
      // for — which also means every icon is supersampled, not just resized up.
      const img = shot.getSize().width === size
        ? shot
        : shot.resize({ width: size, height: size, quality: "best" });
      const png = img.toPNG();
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
  } finally {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    win.destroy();
  }
  console.log("written to assets/generated/");
  app.quit();
});
