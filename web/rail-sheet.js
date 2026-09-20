/**
 * The station sheet on phones: the list, pulled up over the globe.
 *
 * Two rests, which is all this needs: peek, where the planet is whole and a few
 * stations show under it, and open, where the list fills the screen. The globe
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
  let open = false, y = 0, restY = 0, drag = null, raf = 0, pending = 0;

  const stations = rail.querySelector(".stations");
  const grab = document.createElement("button");
  grab.type = "button";
  grab.className = "sheetgrab";
  grab.setAttribute("aria-controls", "stationlist");
  stations?.prepend(grab);
  const say = () => {
    grab.setAttribute("aria-expanded", String(open));
    grab.setAttribute("aria-label", open ? "Hide the station list" : "Show the station list");
  };

  const measure = () => {
    // The tags scroll sideways under the weather, so they are the line the
    // resting sheet stops at.
    const chips = rail.querySelector(".chips");
    const head = rail.querySelector(".placehead");
    const peek = chips?.offsetHeight && !head?.hidden
      ? chips.offsetTop + 6
      : Math.round(cols.clientHeight * PEEK_FALLBACK);
    restY = Math.max(0, Math.round(rail.offsetHeight - peek));
    // The globe's read-out sits above whatever the sheet is showing.
    document.documentElement.style.setProperty("--peek", `${peek}px`);
  };
  const put = (v) => {
    y = v;
    rail.style.setProperty("--sheet-y", `${v}px`);
  };
  const settle = (toOpen) => {
    open = toOpen;
    say();
    rail.classList.remove("sliding");
    rail.classList.add("settling");
    put(toOpen ? 0 : restY);
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
    if (next < 0) next = band(next, rail.offsetHeight);
    if (next > restY) next = restY + band(next - restY, rail.offsetHeight);
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
    if (moved < 10) return settle(!open);
    settle(landing < restY / 2);
  }

  // Enter and Space on the handle, for everyone not using a finger.
  grab.addEventListener("click", (e) => { if (!drag && e.detail === 0) settle(!open); });
  rail.addEventListener("pointerdown", start);
  rail.addEventListener("pointermove", move);
  rail.addEventListener("pointerup", end);
  rail.addEventListener("pointercancel", end);

  const reset = () => {
    if (!phone.matches) { rail.style.removeProperty("--sheet-y"); return; }
    measure(); rail.classList.remove("sliding"); put(open ? 0 : restY);
  };
  // The place block changes height with every place — two lines of tags, or
  // none — so the rest it defines is remeasured when the list repaints.
  const head = rail.querySelector(".placehead");
  if (head && typeof ResizeObserver !== "undefined") new ResizeObserver(reset).observe(head);
  addEventListener("resize", reset);
  phone.addEventListener?.("change", reset);
  // After the catalogue has painted, so offsetHeight is the real one.
  requestAnimationFrame(() => requestAnimationFrame(reset));
  say();

  /** Picking a place on the globe is a request to see its stations. */
  window.AuralRailSheet = {
    open: () => { if (phone.matches && !open) { measure(); settle(true); } },
    peek: () => { if (phone.matches && open) { measure(); settle(false); } },
  };
})();
