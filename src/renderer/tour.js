/**
 * The introduction, once.
 *
 * Apple's position on onboarding is that a tour is the weakest way to teach an
 * interface — the strong way is an interface that explains itself, which is what
 * the help tags are for. This exists because the globe is genuinely unusual:
 * nothing about a sphere covered in dots says "click a dot to hear that place",
 * and a person who does not discover that has not seen the app at all.
 *
 * So it is deliberately small. Three steps, each anchored to a control that is
 * actually on screen, skippable at every one of them, and it never appears
 * again on its own — Settings can replay it, nothing else will.
 *
 * It waits for the globe. Running while the window is still assembling would
 * point at controls that have not been laid out yet, and the arrow would be
 * aimed at the wrong place.
 */
(() => {
  const STEPS = [
    {
      anchor: "#layersBtn",
      title: "Everything on the globe is a layer",
      body: "Weather, the day and night line, the ISS, shortwave receivers. Turn on what you want to see.",
    },
    {
      anchor: "#newsBtn",
      title: "Headlines follow the station",
      body: "Whatever you are listening to, this shows what is being reported where it is broadcasting from.",
    },
    {
      anchor: "#favBtn",
      title: "Keep the ones you like",
      body: "The star beside any station saves it here, and to the menu bar.",
    },
  ];

  let i = 0, card = null, shade = null;

  const $ = (s) => document.querySelector(s);

  function teardown(seen) {
    card?.remove(); shade?.remove();
    card = shade = null;
    removeEventListener("keydown", onKey, true);
    removeEventListener("resize", position);
    if (seen) window.auralfm?.setPrefs?.({ tourSeen: true });
  }

  function onKey(e) {
    if (e.key === "Escape") { e.preventDefault(); teardown(true); }
    else if (e.key === "Enter" || e.key === "ArrowRight") { e.preventDefault(); next(); }
  }

  function position() {
    if (!card) return;
    const target = $(STEPS[i].anchor);
    if (!target) return;
    const r = target.getBoundingClientRect();
    const c = card.getBoundingClientRect();
    let left = r.left + r.width / 2 - c.width / 2;
    left = Math.max(12, Math.min(left, innerWidth - c.width - 12));
    let top = r.bottom + 12;
    if (top + c.height > innerHeight - 12) top = Math.max(12, r.top - c.height - 12);
    card.style.left = `${Math.round(left)}px`;
    card.style.top = `${Math.round(top)}px`;
    // The ring sits on the control being described, so the sentence has a subject.
    shade.style.left = `${Math.round(r.left - 5)}px`;
    shade.style.top = `${Math.round(r.top - 5)}px`;
    shade.style.width = `${Math.round(r.width + 10)}px`;
    shade.style.height = `${Math.round(r.height + 10)}px`;
  }

  function render() {
    const step = STEPS[i];
    card.innerHTML = "";
    const h = document.createElement("div");
    h.className = "tourh";
    h.textContent = step.title;
    const p = document.createElement("p");
    p.textContent = step.body;
    const row = document.createElement("div");
    row.className = "tourrow";

    const dots = document.createElement("span");
    dots.className = "tourdots";
    dots.textContent = STEPS.map((_, n) => (n === i ? "●" : "○")).join(" ");
    dots.setAttribute("aria-label", `Step ${i + 1} of ${STEPS.length}`);

    const skip = document.createElement("button");
    skip.className = "tourskip";
    skip.textContent = "Skip";
    skip.onclick = () => teardown(true);

    const go = document.createElement("button");
    go.className = "tourgo";
    go.textContent = i === STEPS.length - 1 ? "Done" : "Next";
    go.onclick = next;

    row.append(dots, skip, go);
    card.append(h, p, row);
    position();
    go.focus();
  }

  function next() {
    i++;
    if (i >= STEPS.length) return teardown(true);
    render();
  }

  function start() {
    // A step whose control is missing would point at nothing.
    if (!STEPS.every((s) => $(s.anchor))) return;
    shade = document.createElement("div");
    shade.className = "tourring";
    card = document.createElement("div");
    card.className = "tourcard";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-modal", "false");
    card.setAttribute("aria-label", "Introduction");
    document.body.append(shade, card);
    addEventListener("keydown", onKey, true);
    addEventListener("resize", position);
    render();
  }

  // Claimed the moment maybeStart is accepted, not when the card appears.
  // applyPrefs runs more than once — on boot and again on every prefs:changed —
  // and both calls cleared an `if (card)` guard while card was still null,
  // because the card is created 700ms later. That rendered the tour twice, one
  // card exactly on top of the other.
  let claimed = false;

  window.Tour = {
    maybeStart(prefs) {
      if (!prefs || prefs.tourSeen) return;
      if (claimed || card) return;
      claimed = true;
      // After the reveal, so the controls have their final positions.
      const go = () => setTimeout(start, 700);
      if (document.body.classList.contains("revealed")) go();
      else {
        const obs = new MutationObserver(() => {
          if (document.body.classList.contains("revealed")) { obs.disconnect(); go(); }
        });
        obs.observe(document.body, { attributes: true, attributeFilter: ["class"] });
      }
    },
  };
})();
