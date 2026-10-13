/**
 * The sleep timer: stop the station after a while, quietly.
 *
 * Radio is what people fall asleep to, and a stream does not end the way a
 * record does. Without this the last station of the night plays until morning,
 * on a phone's battery and somebody's data.
 *
 * One timer, wherever the sound is made. On the Mac that is the menu bar panel
 * (popover.js) and on the web it is the page's bridge (web/bridge.js); each
 * hands this file the five things it needs and nothing else. It lives with the
 * sound and not in Explore because Explore's window can be closed while the
 * station plays on.
 *
 * It goes by the clock, not by counting. A timer in a background tab is
 * slowed, and a laptop that sleeps does not count at all, so every look
 * compares the time now with the time it should end. The players also call
 * check() as the stream plays, which a phone keeps doing with its screen off.
 *
 * The last twenty seconds fade. On an iPhone the fade does nothing, because iOS
 * does not let a page set the volume, and the station simply stops on time.
 * The level is put back afterwards, and it is never saved while it is faded.
 *
 * Not a preference: nothing is written, and quitting ends it.
 */
(() => {
  "use strict";
  const FADE_MS = 20000;
  const CHOICES = [15, 30, 45, 60, 90];
  let io = null, endsAt = 0, tick = null, from = null;

  function restore() {
    if (from === null) return;
    const level = from;
    from = null;
    io.setLevel(level);
  }

  function check() {
    if (!io || !endsAt) return;
    const left = endsAt - Date.now();
    if (left <= 0) {
      clearInterval(tick); tick = null; endsAt = 0;
      // Stop first, then the level: the other way round is a blip of full
      // volume at the very moment somebody is falling asleep.
      if (io.playing()) io.stop();
      restore();
      io.changed();
      return;
    }
    if (left <= FADE_MS && io.playing()) {
      if (from === null) from = io.level();
      io.setLevel(from * (left / FADE_MS));
    }
  }

  /** Minutes from now, one of CHOICES. Anything else turns it off. */
  function set(minutes) {
    if (!io) return;
    clearInterval(tick); tick = null; endsAt = 0;
    restore();
    const m = Number(minutes);
    if (CHOICES.includes(m)) {
      endsAt = Date.now() + m * 60000;
      tick = setInterval(check, 500);
    }
    io.changed();
  }

  window.AuralSleep = {
    CHOICES,
    /** { level, setLevel, playing, stop, changed } from whoever makes the sound. */
    init(hooks) { io = hooks; },
    set,
    check,
    endsAt: () => endsAt,
    /** The listener moved the volume during the fade: that is the level to keep. */
    userLevel(v) { if (from !== null) from = v; },
  };
})();
