/**
 * The hero drifts between its featured stories.
 *
 * Three rules it has to keep: it stops the moment somebody chooses a story
 * themselves, it does not run at all under prefers-reduced-motion, and it does
 * not run while the tab is in the background, where it would be animating for
 * nobody. The dots are real buttons, so this is reachable without a pointer.
 */
(() => {
  "use strict";
  const slides = [...document.querySelectorAll(".slide")];
  const dots = document.querySelector(".dots");
  if (slides.length < 2 || !dots) return;

  const still = matchMedia("(prefers-reduced-motion: reduce)");
  let at = 0, timer = null, chosen = false;

  const show = (i) => {
    at = (i + slides.length) % slides.length;
    slides.forEach((s, n) => s.toggleAttribute("data-on", n === at));
    [...dots.children].forEach((b, n) => b.setAttribute("aria-current", String(n === at)));
  };

  slides.forEach((s, n) => {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("role", "tab");
    b.setAttribute("aria-label", s.querySelector(".slide-title")?.textContent.trim() || `Story ${n + 1}`);
    b.addEventListener("click", () => { chosen = true; stop(); show(n); });
    dots.appendChild(b);
  });

  const stop = () => { clearInterval(timer); timer = null; };
  const start = () => {
    if (timer || chosen || still.matches || document.hidden) return;
    timer = setInterval(() => show(at + 1), 7000);
  };

  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));
  still.addEventListener?.("change", () => (still.matches ? stop() : start()));
  show(0);
  start();
})();
