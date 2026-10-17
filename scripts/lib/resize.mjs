/**
 * Resize a picture to a width, keeping its shape.
 *
 * sips on macOS, where the app is built and published. ImageMagick elsewhere,
 * which is what the Linux CI runner has (.github/workflows/web.yml): sips does
 * not exist there, and an image library as a dependency for three resizes is
 * not worth it.
 */

import { execFileSync } from "node:child_process";

const has = (bin) => {
  try { execFileSync("which", [bin], { stdio: "ignore" }); return true; } catch { return false; }
};

/** `quality` sets JPEG quality (and writes a JPEG); without it the format follows `out`. */
export function resize(src, out, width, { quality } = {}) {
  if (process.platform === "darwin") {
    const fmt = quality ? ["-s", "format", "jpeg", "-s", "formatOptions", String(quality)] : [];
    execFileSync("sips", [...fmt, "--resampleWidth", String(width), src, "--out", out], { stdio: "ignore" });
    return;
  }
  const im = has("magick") ? "magick" : has("convert") ? "convert" : null;
  if (!im) throw new Error("resize: neither sips nor ImageMagick is installed");
  execFileSync(im, [src, "-resize", `${width}x`, ...(quality ? ["-quality", String(quality)] : []), out], { stdio: "ignore" });
}
