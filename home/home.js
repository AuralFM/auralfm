/**
 * The front door's three behaviours: the menu on small screens, sections that
 * arrive as they are reached, and the tagline lighting up word by word.
 *
 * All of it is IntersectionObserver or a click — no scroll listener — and all
 * of it stands down for prefers-reduced-motion, where the page is simply there.
 */
(() => {
  "use strict";
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Sections only start hidden once this file is actually running. Marked from
  // the page head instead, a failed load of this script left them invisible.
  document.documentElement.classList.add("js");

  // ── the menu ──────────────────────────────────────────────────────────────
  const island = document.querySelector(".island");
  const burger = document.querySelector(".burger");
  const menu = document.getElementById("menu");
  if (island && burger && menu) {
    const set = (open) => {
      island.dataset.open = String(open);
      burger.setAttribute("aria-expanded", String(open));
      burger.setAttribute("aria-label", open ? "Close the menu" : "Open the menu");
      // The root, not the body: iOS Safari scrolls a page whose body is locked.
      document.documentElement.style.overflow = open ? "hidden" : "";
      if (open) {
        menu.hidden = false;
        // A frame to let it lay out hidden, then the transition runs from there.
        requestAnimationFrame(() => requestAnimationFrame(() => menu.classList.add("open")));
        menu.querySelector("a")?.focus();
      } else {
        menu.classList.remove("open");
        const done = () => { if (island.dataset.open === "false") menu.hidden = true; };
        still ? done() : setTimeout(done, 700);
      }
    };
    burger.addEventListener("click", () => set(island.dataset.open !== "true"));
    // Choosing somewhere closes it; so does Escape, and focus goes back.
    menu.addEventListener("click", (e) => { if (e.target.closest("a")) set(false); });
    addEventListener("keydown", (e) => {
      if (e.key === "Escape" && island.dataset.open === "true") { set(false); burger.focus(); }
    });
    // Growing past the phone layout with it open would strand a locked page.
    matchMedia("(max-width: 760px)").addEventListener?.("change", (e) => { if (!e.matches) set(false); });
  }

  // ── sections arrive as they are reached ───────────────────────────────────
  const reveals = document.querySelectorAll(".reveal");
  if (still || !("IntersectionObserver" in window)) {
    for (const el of reveals) el.classList.add("in");
  } else {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
    }, { rootMargin: "0px 0px -10% 0px" });
    for (const el of reveals) io.observe(el);
  }

  // ── the tagline, one word at a time ───────────────────────────────────────
  // Split into spans for the colour, with the sentence kept whole for a screen
  // reader: the spans are hidden from it and the original text is its label.
  const words = document.querySelector(".tagline .words");
  if (words) {
    const text = words.textContent.replace(/\s+/g, " ").trim();
    words.setAttribute("aria-label", text);
    words.setAttribute("role", "text");
    words.textContent = "";
    // Each sentence on its own line, so the break falls where the thought does.
    const spans = [];
    for (const sentence of text.split(/(?<=\.)\s+/)) {
      const line = document.createElement("span");
      line.className = "line";
      line.setAttribute("aria-hidden", "true");
      sentence.split(" ").forEach((w, i, all) => {
        const s = document.createElement("span");
        s.className = "w";
        s.textContent = w + (i < all.length - 1 ? " " : "");
        line.append(s);
        spans.push(s);
      });
      words.append(line);
    }
    if (still || !("IntersectionObserver" in window)) {
      for (const s of spans) s.classList.add("on");
    } else {
      // Each word lights as it crosses a line two thirds of the way down.
      const io = new IntersectionObserver((entries) => {
        for (const e of entries) if (e.isIntersecting) { e.target.classList.add("on"); io.unobserve(e.target); }
      }, { rootMargin: "0px 0px -35% 0px" });
      for (const s of spans) io.observe(s);
    }
  }
})();
