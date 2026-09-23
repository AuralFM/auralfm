/**
 * The station sheet on phones: the list, pulled up over the globe.
 *
 * Three rests: down, tucked behind the player with the planet clear (home,
 * whenever a station is loaded); peek, where the place or the top of the list
 * shows under the planet; and open, where the list fills the screen. The globe
 * is behind the whole time, so nothing is a mode you have to leave.
 *
 * Rules it follows (Apple's Designing Fluid Interfaces, and the reason each is
 * here rather than a fixed animation):
 *  - the sheet tracks the finger 1:1 while dragging, from wherever it is now;
 *  - the rest it lands on comes from where the flick was *going*, projected the
 *    way scrolling decelerates — so a short fast flick opens it and a long slow
 *    drag ends where you left it;
 *  - past a rest it rubber-bands rather than stopping dead;
 *  - a drag can start mid-animation and takes over from the current position.
 *
 * Only the grab area drags: the handle and the place heading. The list itself
 * scrolls, because a list that sometimes scrolls and sometimes drags the window
 * is the thing that makes a sheet feel unreliable.
 *
 * The handle is a real button, not a painted pill. A sheet whose only way up is
 * a drag is a feature that does not exist for anyone using a keyboard or
 * VoiceOver — and the gesture is unchanged by giving it a control to hang on.
 */
(() => {
  const phone = matchMedia("(max-width: 700px)");
  const rail = document.querySelector(".railcol");
  const cols = document.querySelector(".cols");
  if (!rail || !cols) return;

  /**
   * At rest the sheet shows the place and nothing more.
   *
   * It was a share of the globe area, which is a number with no meaning in it:
   * on one phone it cut the weather line in half, on another it showed three
   * stations. The sheet now rests exactly where the place's own block ends —
   * name, coordinates, distance, weather — so the first thing you see is where
   * you are, and everything below it is what the drag is for.
   */
  const PEEK_FALLBACK = 0.40;        // of the globe area, before a place is picked
  /**
   * Three rests: open (the list fills the screen), peek (the place, or the top
   * of the list), and down — tucked behind the player, globe clear.
   *
   * Down is where it lives whenever there is a station in the player. Testers
   * found it by accident, through a bug that hid the sheet, and it was the
   * layout they asked to keep: the planet and the row that plays it, and
   * nothing else until you ask. Explore and Favourites bring it up to peek;
   * pulling it down, or closing either, puts it away again. With no station
   * there is nothing to show in its place, so it rests at peek as before.
   */
  let rest = "peek", y = 0, restY = 0, downY = 0, drag = null, raf = 0, pending = 0;
  let chosen = false;                  // has anything settled the sheet yet?

  const now = document.getElementById("now");
  const hasStation = () => !!(now && !now.hidden && now.offsetHeight);
  const home = () => (hasStation() ? "down" : "peek");

  const stations = rail.querySelector(".stations");
  const grab = document.createElement("button");
  grab.type = "button";
  grab.className = "sheetgrab";
  grab.setAttribute("aria-controls", "stationlist");
  stations?.prepend(grab);
  const say = () => {
    grab.setAttribute("aria-expanded", String(rest === "open"));
    grab.setAttribute("aria-label", rest === "open" ? "Hide the station list" : "Show the station list");
  };

  const measure = () => {
    // The tags scroll sideways under the weather, so they are the line the
    // resting sheet stops at.
    const chips = rail.querySelector(".chips");
    const head = rail.querySelector(".placehead");
    /**
     * The place list rests on its fourth row.
     *
     * With no place picked the sheet is a list of places, and it rested at 40%
     * of the globe — seven rows of Paris, London, Moscow and on, with the planet
     * they are on squeezed into what was left. Four is enough to say "this is a
     * list, pull it up", and the globe is what the screen is for.
     */
    const PEEK_ROWS = 4;
    const places = rail.querySelector("#placelist");
    const rows = places && !places.hidden ? places.querySelectorAll(".place") : [];
    /**
     * The whole row of tags, not the top of it. The rest stopped 6px into the
     * chips, so at peek they showed as a strip of half-drawn pills above the
     * player — they are the place's filters, and a cut control is a broken one.
     */
    const peek = chips?.offsetHeight && !head?.hidden
      ? chips.offsetTop + chips.offsetHeight + 10
      : rows.length
      ? Math.round(rows[Math.min(PEEK_ROWS, rows.length) - 1].getBoundingClientRect().bottom
                   - rail.getBoundingClientRect().top)
      : Math.round(cols.clientHeight * PEEK_FALLBACK);
    restY = Math.max(0, Math.round(rail.offsetHeight - peek));
    // Clear of the shadow too, so nothing of it shows above the player.
    downY = rail.offsetHeight + 48;
    // How much of the bottom of the view the sheet takes at its home rest. The
    // globe centres above this and the read-out sits on it, so it follows the
    // rest the sheet returns to, not wherever it happens to be — the planet
    // holds still while Explore comes and goes over it.
    const covers = `${home() === "down" ? 0 : peek}px`;
    const root = document.documentElement.style;
    if (root.getPropertyValue("--peek") !== covers) {
      root.setProperty("--peek", covers);
      // The globe's own box has not changed, so nothing else would tell it the
      // space above the sheet has; a station arriving is exactly this case.
      if (typeof sizeGlobe === "function") requestAnimationFrame(() => sizeGlobe());
    }
  };
  const put = (v) => {
    y = v;
    rail.style.setProperty("--sheet-y", `${v}px`);
    /**
     * Down is off the screen, so it is out of reach too. Without this VoiceOver
     * swiped straight into a list nobody could see, and Tab walked through it;
     * the player row is the way back up, and it is a real button.
     */
    rail.inert = phone.matches && rest === "down";
  };
  const yOf = (r) => (r === "open" ? 0 : r === "peek" ? restY : downY);
  const settle = (to) => {
    if (to === "down" && !hasStation()) to = "peek";
    rest = to;
    chosen = true;
    say();
    rail.classList.remove("sliding");
    rail.classList.add("settling");
    put(yOf(to));
  };

  /** Where a flick is heading, the way scroll deceleration ends (Apple's own). */
  const project = (v) => (v / 1000) * 0.998 / (1 - 0.998);
  /** Past the end, follow less and less rather than stopping dead. */
  const band = (over, dim) => (over * dim * 0.55) / (dim + 0.55 * Math.abs(over));

  function start(e) {
    if (!phone.matches) return;
    // The handle and the heading drag; a control inside the heading does not.
    const inGrab = e.target === grab ||
                   e.target.closest(".placehead") && !e.target.closest("button, input, a");
    if (!inGrab) return;
    measure();
    // Capture keeps the drag alive when the finger leaves the sheet's box. It
    // throws if the pointer is already gone, and a drag that cannot be captured
    // is still a drag worth tracking, so a failure here is not fatal.
    try { rail.setPointerCapture(e.pointerId); } catch {}
    rail.classList.add("sliding");
    rail.classList.remove("settling");
    // From where it is *now*, not from where it was going: an interrupted
    // animation has to continue from the pixel on screen or it jumps.
    const at = new DOMMatrixReadOnly(getComputedStyle(rail).transform).m42;
    drag = { id: e.pointerId, from: e.clientY, base: at, last: e.clientY, at: e.timeStamp, v: 0 };
    put(at);
  }

  function move(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const dt = Math.max(1, e.timeStamp - drag.at);
    drag.v = ((e.clientY - drag.last) / dt) * 1000;     // px per second
    drag.last = e.clientY; drag.at = e.timeStamp;
    let next = drag.base + (e.clientY - drag.from);
    // With a station the sheet can go all the way down; without one, peek is
    // the floor and it rubber-bands past it as before.
    const floor = hasStation() ? downY : restY;
    if (next < 0) next = band(next, rail.offsetHeight);
    if (next > floor) next = floor + band(next - floor, rail.offsetHeight);
    /**
     * The newest position wins, not the first of the batch.
     *
     * This coalesced by holding the frame open and dropping later moves, which
     * kept whichever value arrived first — so a burst of moves in one frame
     * (iOS delivers coalesced touches, and any busy frame does it too) left the
     * sheet drawn behind the finger and `y` stale, which is the number the
     * release then projects from. Keep the latest and draw that.
     */
    pending = next;
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; put(pending); });
  }

  function end(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const moved = Math.abs(e.clientY - drag.from);
    const landing = y + project(drag.v);
    drag = null;
    cancelAnimationFrame(raf); raf = 0;
    // Under a finger's width is a tap on the handle, which toggles.
    if (moved < 10) return settle(rest === "open" ? "peek" : "open");
    // The nearest rest to where the flick was going.
    const rests = ["open", "peek", ...(hasStation() ? ["down"] : [])];
    settle(rests.reduce((a, b) => (Math.abs(yOf(b) - landing) < Math.abs(yOf(a) - landing) ? b : a)));
  }

  // Enter and Space on the handle, for everyone not using a finger.
  grab.addEventListener("click", (e) => { if (!drag && e.detail === 0) settle(rest === "open" ? "peek" : "open"); });
  rail.addEventListener("pointerdown", start);
  rail.addEventListener("pointermove", move);
  rail.addEventListener("pointerup", end);
  rail.addEventListener("pointercancel", end);

  const reset = () => {
    if (!phone.matches) { rail.style.removeProperty("--sheet-y"); rail.inert = false; return; }
    if (rest === "down" && !hasStation()) rest = "peek";
    measure(); rail.classList.remove("sliding"); put(yOf(rest));
  };
  // The place block changes height with every place — two lines of tags, or
  // none — so the rest it defines is remeasured when the list repaints.
  const head = rail.querySelector(".placehead");
  // The place list too: its rows decide the rest when no place is picked, and
  // it appears and disappears as searches start and are cleared.
  if (typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver(reset);
    for (const el of [head, rail.querySelector("#placelist"), now]) if (el) ro.observe(el);
  }
  /**
   * A station arriving in the player sends the sheet home.
   *
   * On a first visit the sheet stands at peek because the player is empty; the
   * moment a station is cued or picked there is a row to show instead, so it
   * goes down — unless the listener has it up on purpose, for Explore or
   * Favourites, or has pulled it open.
   */
  let had = hasStation();
  if (now) new MutationObserver(() => {
    const has = hasStation();
    if (has && !had && rest === "peek" && !window.AuralRailSheet?.busy?.()) { measure(); settle("down"); }
    had = has;
  }).observe(now, { attributes: true, attributeFilter: ["hidden"] });
  addEventListener("resize", reset);
  phone.addEventListener?.("change", reset);
  /**
   * After the catalogue has painted, so offsetHeight is the real one — and only
   * if nothing has placed the sheet in the meantime. A browser holds animation
   * frames back while the tab is in the background, so this can run seconds
   * late; it used to send the sheet home over the top of an Explore the
   * listener had already opened.
   */
  requestAnimationFrame(() => requestAnimationFrame(() => { if (!chosen) rest = home(); reset(); }));
  say();

  window.AuralRailSheet = {
    /** Picking a place on the globe is a request to see its stations. */
    // Always settled, never skipped because `rest` already says so: before the
    // first paint `rest` is only a default, the sheet is still where CSS left
    // it, and a skipped call recorded nothing for startup to respect.
    open: () => { if (phone.matches) { measure(); settle("open"); } },
    /** Explore and Favourites: the sheet at its middle rest. */
    peek: () => { if (phone.matches) { measure(); settle("peek"); } },
    /** Back to where it lives: down with a station, peek without. */
    home: () => { if (phone.matches) { measure(); settle(home()); } },
    /** Set by the tab bar: is Explore or Favourites holding the sheet up? */
    busy: null,
  };
})();
