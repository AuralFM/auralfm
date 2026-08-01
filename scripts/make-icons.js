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

const ROOT = path.resolve(__dirname, "..");
const ASSETS = path.join(ROOT, "assets");
const OUT = path.join(ASSETS, "generated");
const MAX = 1024;

// [source svg, output basename, size px]
const JOBS = [
  ["icon.svg",      "trayTemplate.png",    16],
  ["icon.svg",      "trayTemplate@2x.png", 32],
  ["icon.svg",      "favicon.png",         64],
  ["icon-line.svg", "app-512.png",        512],
  ["icon-line.svg", "app-1024.png",      1024],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function page(svg, size) {
  return `<!doctype html><meta charset="utf-8">
    <style>
      html,body{margin:0;padding:0;background:transparent}
      #w{width:${size}px;height:${size}px;color:#000}
      svg{width:100%;height:100%;display:block}
    </style>
    <div id="w">${svg}</div>`;
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

  const tmp = path.join(OUT, ".render.html");
  try {
    for (const [src, name, size] of JOBS) {
      const svg = fs.readFileSync(path.join(ASSETS, src), "utf8");
      fs.writeFileSync(tmp, page(svg, size));
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
  } finally {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    win.destroy();
  }
  console.log("written to assets/generated/");
  app.quit();
});
