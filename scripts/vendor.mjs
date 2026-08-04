// Copy runtime libs out of node_modules into the renderer so pages can load them
// as same-origin scripts. Keeps the CSP at script-src 'self' instead of having to
// widen it for a path outside the renderer directory.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
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

];

/**
 * `onnxruntime-common` is the second bare specifier, and it is a tree of 21
 * small ES modules with relative imports between them rather than one file — so
 * it is copied whole and the import map points at its entry.
 */
/**
 * Nothing is copied as a tree any more.
 *
 * `onnxruntime-common` used to be vendored whole — 85 files — because
 * transformers imports it as a bare specifier. It turns out `ort.wasm.bundle.min.mjs`
 * already exports every symbol that specifier is used for (Tensor,
 * InferenceSession, env, registerBackend), so the import map points both names
 * at the one bundle and the tree is gone. Verified by loading Whisper with the
 * tree deleted.
 */
const TREES = [];

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

/**
 * The captions runtime manifest.
 *
 * These four files are *not* copied into the app. They are 11 MB of WebAssembly
 * and loader for a feature that is off by default, so they are fetched on first
 * use instead — see `src/captions-runtime.js` for the reasoning and the risks.
 *
 * What ships is this manifest: a URL, a byte count and a SHA-256 per file. The
 * hash is taken from the copy in `node_modules`, which is the copy the feature
 * was actually tested against, so the CDN is not trusted to define what correct
 * means — it is only trusted to serve it, and checked.
 *
 * jsDelivr because it mirrors npm by exact version and needs no key. The
 * version comes from the installed packages rather than being written here, so
 * a dependency bump cannot silently leave the manifest pointing at old bytes.
 */
const RUNTIME = [
  ["@huggingface/transformers", "dist/transformers.web.min.js"],
  ["onnxruntime-web",           "dist/ort.wasm.bundle.min.mjs"],
  ["onnxruntime-web",           "dist/ort-wasm-simd-threaded.mjs"],
  ["onnxruntime-web",           "dist/ort-wasm-simd-threaded.wasm"],
];

const GEN = path.join(ROOT, "assets", "generated");
fs.mkdirSync(GEN, { recursive: true });

const files = [];
for (const [pkg, rel] of RUNTIME) {
  const src = path.join(ROOT, "node_modules", pkg, rel);
  if (!fs.existsSync(src)) { console.warn(`vendor: ${pkg}/${rel} not installed`); continue; }
  const buf = fs.readFileSync(src);
  const version = JSON.parse(
    fs.readFileSync(path.join(ROOT, "node_modules", pkg, "package.json"), "utf8")).version;
  files.push({
    name: path.basename(rel),
    url: `https://cdn.jsdelivr.net/npm/${pkg}@${version}/${rel}`,
    bytes: buf.length,
    sha256: crypto.createHash("sha256").update(buf).digest("hex"),
  });
}
if (files.length === RUNTIME.length) {
  const out = path.join(GEN, "captions-runtime.json");
  fs.writeFileSync(out, JSON.stringify({ files }, null, 2) + "\n");
  const mb = files.reduce((n, f) => n + f.bytes, 0) / 1048576;
  console.log(`vendor: captions-runtime.json  ${files.length} files  ${mb.toFixed(1)} MB fetched on demand`);
} else {
  console.warn("vendor: captions runtime manifest not written — some files missing");
}
