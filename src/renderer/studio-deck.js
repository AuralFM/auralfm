/**
 * The studio's music bed: a track streamed rather than decoded whole
 * (explore-studio.js), from a file on this device or from a link.
 *
 * It was decoded into one AudioBuffer, which is every sample of the file as
 * 32-bit floats held in memory at once: a one-hour mix is about 1.4 GB, so a
 * DJ's actual set either failed as "could not be played" or hung the panel
 * with nothing on screen (Melton, 28 Sept: adding tracks was "difficult").
 * An <audio> element plays it as it goes, and starts at once.
 *
 * Routing an element through Web Audio is what silenced one station in six
 * (npm run audit, "nothing routes the radio through Web Audio"), because a
 * cross-origin stream passes silence into the graph. That cannot happen here
 * and the audit holds it: every element this file routes is one it made with
 * `new Audio(`, and it plays one of two things only:
 *
 *   - a `blob:` URL of a file already on this device; or
 *   - the desktop's own address for a track from a link, auralfm-track://
 *     (src/main/ipc-app.js), which passes the file through as it arrives and
 *     says the mixer may read it. That one is asked for with
 *     `crossOrigin = "anonymous"`; without it the mixer would hear nothing.
 */
(() => {
  const OWN = /^auralfm-track:\/\/[0-9a-f]{32}\/$/;
  /**
   * Load a track (a File or Blob, or a link the desktop opened) and wire it
   * into `into`. Resolves once it can play; rejects if this system cannot.
   */
  function load(ctx, into, source, name) {
    const linked = typeof source === "string";
    if (linked && !OWN.test(source)) return Promise.reject(new Error("unplayable"));
    const el = new Audio();
    const url = linked ? source : URL.createObjectURL(source);
    if (linked) el.crossOrigin = "anonymous";
    el.preload = "auto";
    el.loop = true;
    el.src = url;
    const done = () => { if (!linked) URL.revokeObjectURL(url); };
    return new Promise((resolve, reject) => {
      const fail = () => { clearTimeout(slow); done(); reject(new Error("unplayable")); };
      // A link has a network in front of it; a file does not.
      const slow = setTimeout(fail, linked ? 30000 : 20000);
      el.addEventListener("error", fail, { once: true });
      el.addEventListener("canplay", () => {
        clearTimeout(slow);
        const node = ctx.createMediaElementSource(el);
        node.connect(into);
        resolve({
          name, el,
          get duration() { return el.duration; },
          release() { el.pause(); try { node.disconnect(); } catch {} el.removeAttribute("src"); el.load(); done(); },
        });
      }, { once: true });
    });
  }
  window.StudioDeck = { load };
})();
