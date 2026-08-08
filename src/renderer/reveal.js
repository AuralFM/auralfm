/**
 * Reveal the page once the window is actually on screen.
 *
 * Deliberately its own script, above every other one, because `body` starts at
 * `opacity:0` and a throw anywhere below must not be able to leave a permanently
 * invisible window. Nothing here depends on the globe, the preload bridge, or
 * any other file.
 *
 * The timing is the whole point. `explore:ready` fires when the globe has
 * painted, but main only calls `show()` *after* receiving it — so adding the
 * class there would run the fade while the window is still hidden and finish it
 * before anyone saw it. A hidden BrowserWindow reports
 * `document.visibilityState === "hidden"`, and showing it fires
 * `visibilitychange`, which is the real signal.
 */
(() => {
  let done = false;
  const reveal = () => {
    if (done) return;
    done = true;
    // One frame, so the browser has certainly observed the opacity:0 start
    // state. Setting it in the same frame can skip the transition entirely.
    requestAnimationFrame(() => document.body.classList.add("revealed"));
  };

  if (document.visibilityState === "visible") reveal();
  else document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") reveal();
  });

  // The floor under everything. If the visibility signal never arrives — a
  // platform that reports it differently, a window shown some other way — the
  // page still appears. An unfaded window is a small disappointment; an
  // invisible one is a broken app.
  setTimeout(reveal, 4000);
})();
