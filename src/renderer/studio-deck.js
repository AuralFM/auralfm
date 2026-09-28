/**
 * The studio's music bed: a track from this device, streamed rather than
 * decoded whole (explore-studio.js).
 *
 * It was decoded into one AudioBuffer, which is every sample of the file as
 * 32-bit floats held in memory at once: a one-hour mix is about 1.4 GB, so a
 * DJ's actual set either failed as "could not be played" or hung the panel
 * with nothing on screen (Melton, 28 Sept: adding tracks was "difficult").
 * An <audio> element plays it from the file as it goes, and starts at once.
 *
 * Routing an element through Web Audio is what silenced one station in six
 * (npm run audit, "nothing routes the radio through Web Audio"), because a
 * cross-origin stream passes silence into the graph. That cannot happen here
 * and the audit holds it: every element this file routes is one it made with
 * `new Audio(`, playing a `blob:` URL of a file already on this device.
 */
(() => {
  /**
   * Load a file (a File, or a Blob from a link the desktop fetched) and wire it
   * into `into`. Resolves once it can play; rejects if this system cannot.
   */
  function load(ctx, into, blob, name) {
    const el = new Audio();
    const url = URL.createObjectURL(blob);
    el.preload = "auto";
    el.loop = true;
    el.src = url;
    return new Promise((resolve, reject) => {
      const fail = () => { clearTimeout(slow); URL.revokeObjectURL(url); reject(new Error("unplayable")); };
      const slow = setTimeout(fail, 20000);
      el.addEventListener("error", fail, { once: true });
      el.addEventListener("canplay", () => {
        clearTimeout(slow);
        const node = ctx.createMediaElementSource(el);
        node.connect(into);
        resolve({
          name, el,
          get duration() { return el.duration; },
          release() { el.pause(); try { node.disconnect(); } catch {} el.removeAttribute("src"); el.load(); URL.revokeObjectURL(url); },
        });
      }, { once: true });
    });
  }
  window.StudioDeck = { load };
})();
