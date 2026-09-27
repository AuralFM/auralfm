/**
 * The launch screen on the web and the iPhone app.
 *
 * The desktop app opens on a splash window and shows the main one only once the
 * globe has painted. A web page has no second window, and it showed its
 * absence: on a slow phone connection, five seconds of blank page while the
 * scripts arrived, then the whole interface with an empty hole where the globe
 * would be for another ten, and the tour opening over the hole.
 *
 * So the page carries its own splash in its first bytes (build-web.mjs writes
 * the markup and its style into index.html, so it paints before a single
 * script has loaded): the mark, the name, the wave, and one line saying what
 * it is actually doing. It lifts when the globe reports it has painted — the
 * same explore:ready moment that shows the desktop window — so the first thing
 * anyone sees after it is the finished Earth.
 *
 * It is not a progress bar. The line changes when a real step finishes
 * (stations fetched, then the globe drawn), and nothing counts up at a made-up
 * rate. After six seconds it says why a first visit is slow, because it is:
 * about ten megabytes of globe and stations, which the service worker keeps,
 * so the second launch is quick.
 *
 * Nothing here may keep the app from appearing. The veil lifts on its own after
 * 45 seconds whatever happened; a globe that failed says so in the app itself.
 */
(() => {
  const veil = document.getElementById("launch");
  if (!veil) return;
  const say = veil.querySelector(".launch-say");
  const slow = veil.querySelector(".launch-slow");
  let over = false;
  const tr = (key, fallback) => { try { return typeof t === "function" ? t(key, fallback) : fallback; } catch { return fallback; } };
  const slowTimer = setTimeout(() => {
    if (!slow) return;
    slow.classList.add("on");
    slow.removeAttribute("aria-hidden");   // announced by the status region now it is shown
  }, 6000);
  const floor = setTimeout(() => done(), 45000);

  function step(key, fallback) {
    if (over || !say) return;
    say.dataset.i18n = key;             // so applyStrings translates it if it runs after
    say.textContent = tr(key, fallback);
  }

  function done() {
    if (over) return;
    over = true;
    clearTimeout(slowTimer); clearTimeout(floor);
    // reveal.js stands aside while this is on screen; the page is revealed
    // under the veil, then the veil fades off it.
    requestAnimationFrame(() => {
      document.body.classList.add("revealed");
      veil.classList.add("gone");
      veil.removeAttribute("role");
      veil.setAttribute("aria-hidden", "true");
      setTimeout(() => veil.remove(), 600);
    });
  }

  window.AuralLaunch = { step, done };
})();
