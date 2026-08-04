/**
 * Live captions.
 *
 * Whisper, running on this machine, over WebAssembly. No cloud speech API —
 * sending the audio somewhere would mean the app transmits what you are
 * listening to, which contradicts the promise the first-run walkthrough makes on
 * card four. On-device or not at all.
 *
 * Two things had to be measured before any of this was worth writing.
 *
 * **The audio was unreadable.** `createMediaElementSource` on a cross-origin
 * stream returns pure silence — measured peak 0.00000, rms 0.00000. Not poor
 * quality: no samples at all. So captions were blocked on exactly the half of
 * the app they are most wanted for, and would have worked only on shortwave,
 * where we decode ADPCM ourselves and already hold PCM.
 *
 * The unlock is `crossOrigin = "anonymous"`, and a probe of eleven live streams
 * found **nine send `Access-Control-Allow-Origin`** — Zeno, AzuraCast, Shoutcast
 * v2 and StreamABC set it by default. So most stations work and no proxy is
 * needed. It is applied *only* when captions are switched on, so the default
 * path stays byte-for-byte what it has always been.
 *
 * **Whisper wants 16 kHz mono.** The stream is whatever the station sends,
 * usually 44.1 kHz stereo, so everything here is about getting from one to the
 * other without stalling the audio thread.
 */
/**
 * STATUS: it loads and runs. It is too slow to be live on this hardware.
 *
 * Pinned to @huggingface/transformers **3.8.1**, which pins onnxruntime-web
 * 1.22. Version 4.2 pins 1.26, and 1.26 cannot open the Whisper graphs on the
 * Hub at all — every model and every dtype failed identically with
 * "TransposeDQWeightsForMatMulNBits Missing required scale", including fp32,
 * which is the tell that it was a runtime mismatch rather than a setting.
 * On 3.8.1 the pipeline builds in 22 seconds including the download.
 *
 * Then the measurement that decides the feature, on an Intel i5-8257U with
 * Iris Plus 645 — six seconds of audio, three runs each, single-threaded WASM:
 *
 *     whisper-base   39.6s mean   RTF 6.61
 *     whisper-tiny   15.5s mean   RTF 2.59
 *
 * Anything above 1.0 cannot keep up with live audio. Even `tiny` — which would
 * be too inaccurate for radio anyway — is two and a half times too slow, and
 * `small` would be worse than `base` by roughly another factor of three.
 *
 * The obvious lever is closed: WASM threads need `SharedArrayBuffer`, which
 * needs cross-origin isolation, which a `file://` page cannot have. Measured:
 * `crossOriginIsolated` is false and `SharedArrayBuffer` is undefined, on four
 * available cores.
 *
 * So there are three real routes, none of them a setting:
 *
 *   1. Serve the renderer from a custom protocol with COOP/COEP headers, which
 *      unlocks threads — worth perhaps 2-3x, so `tiny` might just reach live and
 *      `base` still would not.
 *   2. Apple Silicon. The same WASM is several times faster per core there, and
 *      this may simply work on an M-series machine.
 *   3. Native whisper.cpp, which is the thing this approach was chosen to avoid.
 *
 * Whatever ships, it should **measure the machine before offering the feature**
 * rather than let someone switch on captions and watch them arrive a minute
 * late. The benchmark above is four lines and takes fifteen seconds.
 *
 * Off by default. Nothing here runs unless the `captions` pref is on.
 */
(function (root) {
  const SAMPLE_RATE = 16000;      // what Whisper is trained on; not negotiable
  /**
   * Seconds of audio per pass.
   *
   * Whisper's own window is 30s and it degrades on very short clips — it has no
   * context to disambiguate with. But a caption that appears 30 seconds after
   * the words is not a caption. Six seconds is the compromise: long enough to
   * carry a sentence, short enough that the delay reads as lag rather than as
   * the feature being broken.
   */
  const CHUNK_SEC = 6;
  const MODELS = {
    base:  "onnx-community/whisper-base",
    small: "onnx-community/whisper-small",
  };

  let pipe = null, loading = null, ctx = null, node = null, source = null;
  let mapped = false;

  /**
   * Make sure the runtime is on disk, and teach the module loader where it is.
   *
   * Returns a `file://` directory URL ending in a slash. Two things have to
   * happen before transformers can be imported, and only one of them is the
   * download:
   *
   * `transformers.web.min.js` imports the bare specifiers `onnxruntime-web` and
   * `onnxruntime-common`, which nothing in a browser resolves without an import
   * map — and the map cannot be written into the HTML, because the path depends
   * on where this machine keeps application support. So it is injected here,
   * once, immediately before the first module import. Both names point at the
   * same bundle; it exports every symbol reached for under either.
   */
  async function runtimeBase() {
    const res = await root.auralfm.installCaptionsRuntime();
    if (!res?.ok) throw new Error(res?.error || "could not install the captions runtime");
    // encodeURI, not raw: the default macOS path contains "Application Support",
    // and an unescaped space makes the import a parse error rather than a 404.
    const base = "file://" + res.dir.split("/").map(encodeURIComponent).join("/") + "/";
    if (!mapped) {
      const bundle = base + "ort.wasm.bundle.min.mjs";
      const el = document.createElement("script");
      el.type = "importmap";
      el.textContent = JSON.stringify({
        imports: { "onnxruntime-web": bundle, "onnxruntime-common": bundle },
      });
      document.head.appendChild(el);
      mapped = true;
    }
    return base;
  }
  let buffer = [], collected = 0, busy = false, stopped = true;
  let onText = () => {}, onStatus = () => {};
  const stats = { runs: 0, audioSec: 0, computeSec: 0, model: null };

  /** Real-time factor: <1 means it can keep up with live audio. */
  const rtf = () => (stats.audioSec ? stats.computeSec / stats.audioSec : null);

  async function load(which = "base") {
    if (pipe) return pipe;
    if (loading) return loading;
    onStatus({ state: "loading", model: which });
    loading = (async () => {
      const base = await runtimeBase();          // downloads on first use
      const T = await import(base + "transformers.web.min.js");
      // Weights come from Hugging Face on first use and are cached by the
      // browser after that. Together with the runtime fetch above, those are
      // the two third parties this feature talks to; both happen only when
      // captions are switched on, and both are one way — never audio.
      T.env.allowLocalModels = false;
      // Absolute, and not derived from document.baseURI: the runtime now lives
      // outside the app directory, so a relative path resolves against the
      // wrong base — the failure is "no available backend found", which sounds
      // like a missing feature rather than a missing slash.
      T.env.backends.onnx.wasm.wasmPaths = base;
      T.env.backends.onnx.wasm.numThreads = 1;   // renderer stays responsive
      // `device: "wasm"` below is the only backend ever requested, which is why
      // the fetched runtime is the plain build and not the `.jsep` one — JSEP
      // is the WebGPU/WebNN provider and its extra 10 MB could never execute.
      // See the manifest note in scripts/vendor.mjs.
      const p = await T.pipeline("automatic-speech-recognition", MODELS[which] || MODELS.base, {
        dtype: { encoder_model: "q8", decoder_model_merged: "q8" },
        device: "wasm",
      });
      pipe = p;
      stats.model = which;
      onStatus({ state: "ready", model: which });
      return p;
    })().catch((e) => {
      loading = null;
      onStatus({ state: "error", error: String(e && e.message || e) });
      throw e;
    });
    return loading;
  }

  /**
   * Average to mono and drop to 16 kHz.
   *
   * Nearest-neighbour rather than a resampling filter, deliberately: the input
   * is already a lossy stream, Whisper's own front end is a mel spectrogram that
   * throws most of this away, and a proper filter would cost more than it buys.
   */
  function downsample(chunks, fromRate) {
    const total = chunks.reduce((n, c) => n + c.length, 0);
    const flat = new Float32Array(total);
    let at = 0;
    for (const c of chunks) { flat.set(c, at); at += c.length; }
    const ratio = fromRate / SAMPLE_RATE;
    const out = new Float32Array(Math.floor(total / ratio));
    for (let i = 0; i < out.length; i++) out[i] = flat[Math.floor(i * ratio)];
    return out;
  }

  async function run(samples) {
    if (busy || !pipe) return;
    busy = true;
    const t0 = performance.now();
    try {
      const out = await pipe(samples, {
        // Whisper's own translate task: speech in any language straight to
        // English text, with no second translation step to go wrong.
        task: "translate",
        chunk_length_s: 30,
        return_timestamps: false,
      });
      const text = String(out?.text || "").trim();
      stats.runs++;
      stats.audioSec += samples.length / SAMPLE_RATE;
      stats.computeSec += (performance.now() - t0) / 1000;
      // Whisper hallucinates politely on silence — a stretch of static reliably
      // becomes "Thank you." or a subtitle credit. Dropping the known ones is
      // cruder than a confidence threshold and much more effective.
      if (text && !/^(thank you\.?|you|thanks for watching.*|\[.*\]|\(.*\))$/i.test(text)) {
        onText({ text, rtf: rtf() });
      }
    } catch (e) {
      onStatus({ state: "error", error: String(e && e.message || e) });
    } finally {
      busy = false;
    }
  }

  /**
   * Start listening to an audio element.
   *
   * The element must already have `crossOrigin` set and have been (re)loaded, or
   * the graph is silent — see the note at the top. `start` does not set it,
   * because changing it after a load has no effect and hiding that would make
   * the silence look like a bug in here.
   */
  async function start(audioEl, which = "base") {
    stop();
    stopped = false;
    await load(which);
    if (stopped) return;

    ctx = new AudioContext();
    source = ctx.createMediaElementSource(audioEl);
    // 4096 frames is about 93ms at 44.1kHz — small enough not to add audible
    // latency, large enough that the callback is not the bottleneck.
    node = ctx.createScriptProcessor(4096, 1, 1);
    source.connect(node);
    // Through to the speakers as well, or attaching the analyser mutes the app.
    source.connect(ctx.destination);
    node.connect(ctx.destination);

    const need = ctx.sampleRate * CHUNK_SEC;
    node.onaudioprocess = (e) => {
      if (stopped) return;
      buffer.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      collected += e.inputBuffer.length;
      if (collected < need || busy) return;
      const samples = downsample(buffer, ctx.sampleRate);
      buffer = []; collected = 0;
      run(samples);
    };
    onStatus({ state: "listening", model: which });
  }

  function stop() {
    stopped = true;
    buffer = []; collected = 0;
    try { node && (node.onaudioprocess = null); } catch {}
    try { node?.disconnect(); } catch {}
    try { source?.disconnect(); } catch {}
    // The AudioContext is deliberately not closed: closing it detaches the
    // element permanently, and createMediaElementSource can only ever be called
    // once per element. Closing here would silence the app on the second toggle.
    node = null; source = null;
    onStatus({ state: "idle" });
  }

  root.Captions = {
    start, stop, load,
    stats: () => ({ ...stats, rtf: rtf() }),
    onText: (fn) => { onText = fn; },
    onStatus: (fn) => { onStatus = fn; },
    MODELS,
  };
})(typeof window !== "undefined" ? window : globalThis);
