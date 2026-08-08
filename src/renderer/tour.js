/**
 * The introduction.
 *
 * Apple's TipKit guidance is that a tip teaches a new feature, reveals a hidden
 * one, or shows a faster way — and that it should be quick, instructional and
 * easy to remember. Not promotion, not error messages, not long instructions.
 * Every step here is one sentence for that reason.
 *
 * A welcome card in the middle first, because arriving inside a walkthrough with
 * no idea what the app is reads as an interruption. Then three tips, each beside
 * the control it describes with an arrow pointing at it — never on top of it,
 * because a card covering the thing it is explaining is the commonest way this
 * pattern fails.
 *
 * Back as well as forward. A walkthrough you can only leave is one people leave.
 */
(() => {
  const STEPS = [
    {
      welcome: true,
      title: "Welcome to AuralFM",
      body: "A globe you listen to. Click anywhere to hear what that place is playing.",
    },
    {
      anchor: "#layersBtn",
      title: "Globe layers",
      body: "Weather, day and night, the ISS, shortwave receivers.",
    },
    {
      anchor: "#newsBtn",
      title: "Headlines",
      body: "What is being reported where your station broadcasts from.",
    },
    {
      anchor: "#favBtn",
      title: "Favorites",
      body: "The star beside a station keeps it here and in the menu bar.",
    },
  ];

  const $ = (s) => document.querySelector(s);

  let i = 0, card = null, ring = null, arrow = null, pending = false;

  function teardown(seen) {
    for (const n of [card, ring, arrow]) n?.remove();
    card = ring = arrow = null;
    pending = false;
    removeEventListener("keydown", onKey, true);
    removeEventListener("resize", position);
    if (seen) window.auralfm?.setPrefs?.({ tourSeen: true });
  }

  function onKey(e) {
    if (e.key === "Escape") { e.preventDefault(); teardown(true); }
    else if (e.key === "ArrowRight" || e.key === "Enter") { e.preventDefault(); go(1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
  }

  /** Centre the welcome card; park everything else off-screen. */
  function centre() {
    const c = card.getBoundingClientRect();
    card.style.left = `${Math.round((innerWidth - c.width) / 2)}px`;
    card.style.top = `${Math.round((innerHeight - c.height) / 2 - 20)}px`;
    ring.hidden = true;
    arrow.hidden = true;
  }

  /**
   * Put the card beside its control, with the arrow between them.
   *
   * Below when there is room, above when there is not, and always clear of the
   * control by the arrow's own height — the card must never cover the thing the
   * sentence is about.
   */
  function beside(target) {
    const GAP = 13;
    const r = target.getBoundingClientRect();
    const c = card.getBoundingClientRect();

    const below = r.bottom + GAP + c.height < innerHeight - 12;
    const top = below ? r.bottom + GAP : r.top - GAP - c.height;
    let left = r.left + r.width / 2 - c.width / 2;
    left = Math.max(12, Math.min(left, innerWidth - c.width - 12));

    card.style.left = `${Math.round(left)}px`;
    card.style.top = `${Math.round(top)}px`;

    ring.hidden = false;
    ring.style.left = `${Math.round(r.left - 5)}px`;
    ring.style.top = `${Math.round(r.top - 5)}px`;
    ring.style.width = `${Math.round(r.width + 10)}px`;
    ring.style.height = `${Math.round(r.height + 10)}px`;

    // The arrow is a rotated square, so half its diagonal is what sticks out.
    arrow.hidden = false;
    arrow.className = `tourarrow ${below ? "up" : "down"}`;
    arrow.style.left = `${Math.round(r.left + r.width / 2 - 5)}px`;
    arrow.style.top = `${Math.round(below ? top - 5 : top + c.height - 5)}px`;
  }

  function position() {
    if (!card) return;
    const step = STEPS[i];
    if (step.welcome) return centre();
    const target = $(step.anchor);
    if (target) beside(target);
  }

  function render() {
    const step = STEPS[i];
    card.innerHTML = "";
    card.classList.toggle("welcome", !!step.welcome);

    const h = document.createElement("div");
    h.className = "tourh";
    h.textContent = step.title;
    const p = document.createElement("p");
    p.textContent = step.body;

    const row = document.createElement("div");
    row.className = "tourrow";

    // Back is a chevron rather than a word: it is the smaller of the two
    // choices and should read that way. Absent on the first step, where there
    // is nowhere to go.
    const back = document.createElement("button");
    back.className = "tourback";
    back.textContent = "‹";
    back.setAttribute("aria-label", "Previous");
    back.onclick = () => go(-1);
    back.disabled = i === 0;

    const dots = document.createElement("span");
    dots.className = "tourdots";
    for (let n = 0; n < STEPS.length; n++) {
      const d = document.createElement("i");
      if (n === i) d.className = "on";
      dots.append(d);
    }
    dots.setAttribute("aria-label", `Step ${i + 1} of ${STEPS.length}`);

    const skip = document.createElement("button");
    skip.className = "tourskip";
    skip.textContent = "Skip";
    skip.onclick = () => teardown(true);

    const next = document.createElement("button");
    next.className = "tourgo";
    next.textContent = step.welcome ? "Show me" : (i === STEPS.length - 1 ? "Done" : "Next");
    next.onclick = () => go(1);

    row.append(back, dots, skip, next);
    card.append(h, p, row);
    position();
    next.focus();
  }

  function go(delta) {
    const n = i + delta;
    if (n < 0) return;
    if (n >= STEPS.length) return teardown(true);
    i = n;
    render();
  }

  function start() {
    pending = false;
    if (card) return;
    // A step whose control is missing would point at nothing.
    if (!STEPS.every((s) => s.welcome || $(s.anchor))) return;
    i = 0;
    ring = document.createElement("div");
    ring.className = "tourring";
    arrow = document.createElement("div");
    arrow.className = "tourarrow";
    card = document.createElement("div");
    card.className = "tourcard";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-label", "Introduction");
    document.body.append(ring, arrow, card);
    addEventListener("keydown", onKey, true);
    addEventListener("resize", position);
    render();
  }

  window.Tour = {
    /**
     * Called on every prefs change, so it has to be idempotent while running and
     * still able to start again afterwards.
     *
     * `pending` rather than a permanent latch. applyPrefs fires on boot and on
     * every prefs:changed, and a once-only flag meant Settings could set
     * tourSeen back to false and nothing happened until the app was restarted —
     * which is exactly what Melton hit. The flag now covers only the gap between
     * being asked and the card appearing.
     */
    maybeStart(prefs) {
      if (!prefs || prefs.tourSeen) return;
      if (card || pending) return;
      pending = true;
      const soon = () => setTimeout(start, 500);
      if (document.body.classList.contains("revealed")) soon();
      else {
        const obs = new MutationObserver(() => {
          if (document.body.classList.contains("revealed")) { obs.disconnect(); soon(); }
        });
        obs.observe(document.body, { attributes: true, attributeFilter: ["class"] });
      }
    },
  };
})();
