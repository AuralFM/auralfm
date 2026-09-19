/**
 * Levels for the share card's waveform, measured from a copy of the stream.
 *
 * The waveform was removed because it was measured from the radio itself:
 * `createMediaElementSource` on the playing element routes its sound through Web
 * Audio for good, and for a station whose server does not answer cross-origin
 * requests that route carries silence — about one station in six went quiet.
 *
 * So this never touches the playing element. It opens a second, private copy
 * of the same stream, asks for it with CORS, and measures that for a few
 * seconds through a gain of zero, so nothing is heard twice. A station that
 * refuses CORS makes this copy fail to load — which costs the card its waveform
 * and costs the radio nothing. No waveform is the honest answer there; a
 * generated one would be a picture of sound that was never measured.
 *
 * The audit holds the line: createMediaElementSource may appear here and only
 * here, and only on an element this file created.
 */
(() => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function sample(url, { ms = 3200, bars = 48 } = {}) {
    if (!url || typeof AudioContext === "undefined") return null;
    const copy = new Audio();
    copy.crossOrigin = "anonymous";
    copy.preload = "auto";
    copy.src = url + (url.includes("?") ? "&" : "?") + "_lv=" + Date.now();
    const ctx = new AudioContext();
    try {
      const source = ctx.createMediaElementSource(copy);
      const meter = ctx.createAnalyser();
      meter.fftSize = 1024;
      const silent = ctx.createGain();
      silent.gain.value = 0;                 // measured, never heard
      source.connect(meter); meter.connect(silent); silent.connect(ctx.destination);
      await new Promise((ok, no) => {
        copy.addEventListener("playing", ok, { once: true });
        copy.addEventListener("error", no, { once: true });
        setTimeout(no, 4000);
        copy.play().catch(no);
      });
      const buf = new Float32Array(meter.fftSize);
      const out = [];
      for (let i = 0; i < bars; i++) {
        await sleep(ms / bars);
        meter.getFloatTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += v * v;
        out.push(Math.sqrt(sum / buf.length));
      }
      // All zeros is a stream that decoded to nothing, not a quiet one.
      return out.some((v) => v > 0.001) ? out : null;
    } catch {
      return null;
    } finally {
      try { copy.pause(); copy.removeAttribute("src"); copy.load(); } catch {}
      try { ctx.close(); } catch {}
    }
  }

  window.AuralLevels = { sample };
})();
