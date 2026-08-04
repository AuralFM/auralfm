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
  ["@huggingface/transformers", "dist/transformers.web.min.js"],
  /**
   * The `jsep` runtime, which is what the bundle actually asks for.
   *
   * The plain 12 MB build looked like the right choice and is never loaded: even
   * the non-WebGPU bundle dynamically imports `ort-wasm-simd-threaded.jsep.mjs`.
   * The failure reads "no available backend found", which sounds like a missing
   * capability rather than a missing file, and cost an hour.
   */
  ["onnxruntime-web", "dist/ort-wasm-simd-threaded.jsep.wasm"],
  ["onnxruntime-web", "dist/ort-wasm-simd-threaded.jsep.mjs"],
  /**
   * The runtime itself, resolved by an import map in the page.
   *
   * `transformers.web.min.js` is not self-contained: it carries a bare
   * `onnxruntime-web/webgpu` specifier, which a bundler would resolve and a
   * browser cannot. An import map in popover.html points that name at this file
   * instead, which is cheaper and clearer than adding a build step to a project
   * that has deliberately never had one.
   */
  /**
   * The plain WASM bundle, not the WebGPU one.
   *
   * Transformers.js imports `onnxruntime-web/webgpu`, and the import map points
   * that name here instead. The WebGPU build wants the 25 MB `jsep` runtime;
   * this one wants the 12 MB plain build, and the integrated GPUs this app
   * targets get little from WebGPU anyway — an Iris Plus 645 is not going to
   * outrun its own CPU on this.
   */
  ["onnxruntime-web", "dist/ort.bundle.min.mjs"],
];

/**
 * `onnxruntime-common` is the second bare specifier, and it is a tree of 21
 * small ES modules with relative imports between them rather than one file — so
 * it is copied whole and the import map points at its entry.
 */
const TREES = [["onnxruntime-common", "dist/esm", "ort-common"]];

fs.mkdirSync(OUT, { recursive: true });

for (const [pkg, rel, name] of TREES) {
  const src = path.join(ROOT, "node_modules", pkg, rel);
  if (!fs.existsSync(src)) { console.warn(`vendor: ${pkg} not installed`); continue; }
  const dest = path.join(OUT, name);
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(src, dest, { recursive: true });
  const n = fs.readdirSync(dest).length;
  console.log(`vendor: ${name}/  ${n} files`);
}
for (const [pkg, rel] of LIBS) {
  const src = path.join(ROOT, "node_modules", pkg, rel);
  if (!fs.existsSync(src)) { console.warn(`vendor: ${pkg} not installed — run npm install`); continue; }
  const dest = path.join(OUT, path.basename(rel));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log(`vendor: ${path.basename(rel)}  ${(fs.statSync(dest).size / 1024).toFixed(0)} KB`);
}
