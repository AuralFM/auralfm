// Copy runtime libs out of node_modules into the renderer so pages can load them
// as same-origin scripts. Keeps the CSP at script-src 'self' instead of having to
// widen it for a path outside the renderer directory.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "src", "renderer", "vendor");
const LIBS = [
  ["globe.gl", "dist/globe.gl.min.js"],
  // Earth textures ship inside three-globe (a globe.gl dependency), so the real-
  // world globe needs no download and the app stays offline-first.
  ["three-globe", "example/img/earth-blue-marble.jpg"],
  ["three-globe", "example/img/earth-night.jpg"],
  ["three-globe", "example/img/earth-topology.png"],
  ["three-globe", "example/img/night-sky.png"],

  /**
   * Whisper, in the renderer.
   *
   * Transformers.js runs the model as ONNX over WebAssembly, which is the whole
   * reason captions do not turn this into a native app — no whisper.cpp, no
   * per-architecture binaries, no change to how this builds.
   *
   * The 12 MB `.wasm` is the plain SIMD build rather than the 25 MB `jsep` one:
   * jsep carries the WebGPU path, and the integrated GPUs this targets do not
   * benefit enough to justify doubling the runtime.
   */
  /**
   * Whisper, in the renderer — pinned to transformers 3.8.1.
   *
   * 4.x ships onnxruntime-web 1.26-dev, which cannot open the Whisper graphs on
   * the Hub: every model and every dtype fails identically with
   * "TransposeDQWeightsForMatMulNBits Missing required scale", including fp32,
   * which is the tell that it is a runtime mismatch rather than a setting.
   * 3.8.1 pins 1.22 instead.
   *
   * **Not the `.jsep` build.** transformers ships `ort-wasm-simd-threaded.jsep.wasm`
   * and that is what was vendored first: 20.6 MB. JSEP is the JavaScript
   * Execution Provider — the WebGPU and WebNN backends — and `captions.js` asks
   * for `device: "wasm"` and nothing else, so all of that plumbing was shipped
   * in every download and could never execute. The plain build is 10.6 MB, and
   * its loader is 47 KB against 389 KB.
   *
   * Safe because the versions are the same object: transformers 3.8.1 pins
   * onnxruntime-web 1.22.0-dev.20250409-89f8206ba4, and that exact build is what
   * onnxruntime-web resolves to. Checked at vendor time below, because the whole
   * reason the pair used to come from the transformers package was to stop the
   * runtime and the loader drifting across an npm update — that risk is real and
   * an assertion is a better answer to it than a bigger file.
   */
  ["@huggingface/transformers", "dist/transformers.web.min.js"],
  ["onnxruntime-web", "dist/ort-wasm-simd-threaded.wasm"],
  ["onnxruntime-web", "dist/ort-wasm-simd-threaded.mjs"],
  ["onnxruntime-web", "dist/ort.wasm.bundle.min.mjs"],
];

/**
 * `onnxruntime-common` is the second bare specifier, and it is a tree of 21
 * small ES modules with relative imports between them rather than one file — so
 * it is copied whole and the import map points at its entry.
 */
const TREES = [["onnxruntime-common", "dist/esm", "ort-common"]];

/**
 * The ONNX runtime is now taken from `onnxruntime-web` while the loader that
 * drives it comes from `@huggingface/transformers`. That is only safe while
 * they are the same build, so check rather than hope — a silent mismatch here
 * surfaces much later as an unopenable model graph, which is exactly the class
 * of failure that cost a day when transformers 4.x was tried.
 */
function assertRuntimeMatchesLoader() {
  const read = (pkg) =>
    JSON.parse(fs.readFileSync(path.join(ROOT, "node_modules", pkg, "package.json"), "utf8"));
  try {
    const want = read("@huggingface/transformers").dependencies["onnxruntime-web"];
    const got = read("onnxruntime-web").version;
    if (want !== got) {
      console.error(
        `vendor: onnxruntime-web mismatch — transformers wants ${want}, installed is ${got}.\n` +
        `        The vendored WASM would not match the loader. Fix the pin before shipping.`);
      process.exit(1);
    }
    console.log(`vendor: onnxruntime-web ${got} matches the transformers pin`);
  } catch {
    console.warn("vendor: could not verify the onnxruntime-web pin");
  }
}
assertRuntimeMatchesLoader();

fs.mkdirSync(OUT, { recursive: true });

for (const [pkg, rel, name] of TREES) {
  const src = path.join(ROOT, "node_modules", pkg, rel);
  if (!fs.existsSync(src)) { console.warn(`vendor: ${pkg} not installed`); continue; }
  const dest = path.join(OUT, name);
  fs.rmSync(dest, { recursive: true, force: true });
  /**
   * Runtime files only.
   *
   * The published tree is 85 files and 468 KB, of which 120 KB is the 21 modules
   * the browser actually loads; the rest is TypeScript declarations and source
   * maps that shipped inside every download and were never read. A missing
   * `.map` costs nothing — dev tools just show the minified file, which is what
   * they show for every other vendored library here anyway.
   */
  fs.cpSync(src, dest, {
    recursive: true,
    filter: (from) =>
      fs.statSync(from).isDirectory() ||
      (from.endsWith(".js") && !from.endsWith(".min.js.map")) ||
      from.endsWith("package.json"),
  });
  const n = fs.readdirSync(dest).length;
  const kb = fs.readdirSync(dest).reduce((t, f) => t + fs.statSync(path.join(dest, f)).size, 0) / 1024;
  console.log(`vendor: ${name}/  ${n} files  ${kb.toFixed(0)} KB`);
}
for (const [pkg, rel] of LIBS) {
  const src = path.join(ROOT, "node_modules", pkg, rel);
  if (!fs.existsSync(src)) { console.warn(`vendor: ${pkg} not installed — run npm install`); continue; }
  const dest = path.join(OUT, path.basename(rel));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log(`vendor: ${path.basename(rel)}  ${(fs.statSync(dest).size / 1024).toFixed(0)} KB`);
}
