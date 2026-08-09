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
  /**
   * Five steps, two of them centred.
   *
   * This used to be four, and there was a second onboarding surface as well — a
   * modal `#intro` overlay with five slides of its own. They ran at the same time
   * on a real first launch, stacked on each other, and both marked themselves
   * seen after about twenty seconds without anyone touching either one. Nobody
   * saw it because it only reproduces with no prior state, which the one machine
   * running this app has never had.
   *
   * The overlay is gone. Two of its slides taught something nothing else did and
   * are folded in here:
   *
   *   **The centre is the selection.** Not guessable. The globe looks like a map
   *   you click, and it is also a dial you turn — whatever ends up under the
   *   middle becomes the selection. Somebody who never learns that thinks the app
   *   is a list with a decorative Earth attached.
   *
   *   **Nothing is collected.** The app's own position, and the last step rather
   *   than the first: it means more once you have seen what the thing does than as
   *   an assertion before anything has happened.
   *
   * The rest of the overlay's content was already covered better elsewhere. "Two
   * kinds of dot" is the `shortwave` tip, which waits until somebody has played
   * five stations — a far better moment for "that amber one is a real antenna"
   * than a modal in the first ten seconds. "Three buttons and a search box" is
   * what the three anchored steps below already point at.
   */
  const STEPS = [
    {
      welcome: true,
      title: "Welcome to AuralFM",
      body: "A globe you listen to. Spin it — whatever sits under the middle "
          + "becomes the selection. Click a dot to hear that place.",
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
    {
      welcome: true,
      title: "Nothing is collected",
      body: "No account, and no server of ours. The station list is already on "
          + "this Mac, so the globe and search work with the network unplugged. "
          + "Nothing reports what you played.",
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
    // Last step wins over centred. The closing card is also a `welcome` card, so
    // checking welcome first labelled the final button "Show me" — an invitation
    // to look at something that is not there.
    next.textContent = i === STEPS.length - 1 ? "Done"
                     : (step.welcome ? "Show me" : "Next");
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
