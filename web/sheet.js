/**
 * Settings as a sheet over the app, where the desktop opens a window.
 *
 * A modal task, so it dims what is behind it and takes the focus: the page goes
 * inert while it is open, the way the desktop's reader and share sheet do. On
 * wide screens, three ways out — Done, a tap on the dimmed page, Escape. On a
 * phone Done is hidden (web.css): the tab bar stays live under the sheet, so any
 * tab, the Settings tab again, or pulling the sheet down closes it, as they do
 * every other panel there. Focus returns to where it came from.
 *
 * Wide screens get a form sheet that grows from the Settings button (motion
 * starts from its source). Phones get a bottom sheet you can drag: it tracks
 * the finger 1:1 from where it was grabbed, resists being pulled up past its
 * top, and on release projects the flick's momentum to decide whether to close,
 * handing the finger's velocity to the spring so there is no seam. Reduced
 * motion replaces all of it with a short cross-fade.
 *
 * The contents are the desktop's own settings.html, in a frame that borrows this
 * page's bridge (see the top of web/bridge.js).
 */
(() => {
  "use strict";
  const phone = () => matchMedia("(max-width: 700px)").matches;
  const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  let root = null, panel = null, opener = null, anim = null;

  // A damped spring on one number. Response in seconds, damping ratio 1 = none
  // of the bounce; both are Apple's parameters. Starts from the current value and
  // velocity, so a spring can be grabbed and re-aimed mid-flight.
  function spring(from, to, v0, { response = 0.35, damping = 1, onFrame, onDone }) {
    cancelAnimationFrame(anim);
    const k = (2 * Math.PI / response) ** 2, c = 4 * Math.PI * damping / response;
    let x = from, v = v0, last = performance.now();
    const step = (now) => {
      const dt = Math.min(0.032, (now - last) / 1000); last = now;
      const a = -k * (x - to) - c * v;
      v += a * dt; x += v * dt;
      if (Math.abs(x - to) < 0.5 && Math.abs(v) < 5) { onFrame(to); onDone?.(); return; }
      onFrame(x);
      anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
  }

  function build() {
    root = document.createElement("div");
    root.className = "setsheet";
    root.hidden = true;
    root.innerHTML = `
      <div class="setsheet-scrim"></div>
      <div class="setsheet-panel" role="dialog" aria-modal="true" aria-labelledby="setsheet-title">
        <div class="setsheet-grab" aria-hidden="true"></div>
        <header class="setsheet-head">
          <h2 id="setsheet-title" tabindex="-1">Settings</h2>
          <button type="button" class="setsheet-done">Done</button>
        </header>
        <iframe class="setsheet-frame" title="Settings" src="about:blank"></iframe>
      </div>`;
    document.body.append(root);
    panel = root.querySelector(".setsheet-panel");
    root.querySelector(".setsheet-scrim").addEventListener("click", close);
    root.querySelector(".setsheet-done").addEventListener("click", close);
    addEventListener("keydown", (e) => { if (e.key === "Escape" && !root.hidden) { e.preventDefault(); close(); } });
    dragToDismiss(root.querySelector(".setsheet-grab"));
    dragToDismiss(root.querySelector(".setsheet-head"));
  }

  /**
   * What goes inert while the sheet is open.
   *
   * Everything behind it, as a modal should — except the phone's chrome. On a
   * phone Settings is not a modal, it is one of five tabs, and it sits under
   * the bar by design. Inerting the bar took it out of hit-testing entirely:
   * it was still there, still lit, still showing Settings as the current tab,
   * and completely dead. Done was the only way out.
   *
   * The globe and the rail behind it still go inert, which is the part that
   * matters — nothing back there should be reachable by touch or by Tab.
   */
  const CHROME = ".tabbar, .now";
  const behind = () => [...document.body.children].filter((el) =>
    el !== root && el.tagName !== "SCRIPT" && !(phone() && el.matches(CHROME)));
  const place = (y) => { panel.style.transform = `translateY(${y}px)`; root.style.setProperty("--dim", String(Math.max(0, 1 - y / panel.offsetHeight))); };

  function open() {
    if (!root) build();
    if (!root.hidden) return;
    opener = document.activeElement;
    const frame = root.querySelector(".setsheet-frame");
    frame.src = "settings.html";
    root.hidden = false;
    for (const el of behind()) el.inert = true;
    // A modal only where it is one. On a phone it is a tab, and VoiceOver keeps
    // the reader inside an aria-modal dialog — which, with no Done there, would
    // leave nothing to swipe to that closes it. Without the flag the tab bar is
    // reachable, as it is by touch.
    panel.setAttribute("aria-modal", String(!phone()));
    // Grow from the button that opened it, on wide screens.
    const r = document.getElementById("setBtn")?.getBoundingClientRect();
    if (r) {
      const p = panel.getBoundingClientRect();
      panel.style.transformOrigin = `${r.left + r.width / 2 - p.left}px ${r.top + r.height / 2 - p.top}px`;
    }
    root.classList.remove("closing");
    if (still()) { root.classList.add("fade"); requestAnimationFrame(() => root.classList.add("open")); }
    else if (phone()) {
      place(panel.offsetHeight);
      root.classList.add("open");
      spring(panel.offsetHeight, 0, 0, { response: 0.35, damping: 1, onFrame: place });
    } else {
      requestAnimationFrame(() => root.classList.add("open"));
    }
    // Done where there is one; on a phone it is hidden and cannot take focus,
    // so the dialog's own title does, and VoiceOver starts at "Settings".
    const done = root.querySelector(".setsheet-done");
    if (done.offsetParent) done.focus();
    else root.querySelector("#setsheet-title").focus();
  }

  function finish() {
    root.hidden = true;
    root.classList.remove("open", "closing", "fade");
    panel.style.transform = "";
    root.querySelector(".setsheet-frame").src = "about:blank";
    // Not behind() — every child. If the window crossed the phone breakpoint
    // while this was open, behind() no longer names what open() inerted, and
    // the difference is a permanently dead control.
    for (const el of document.body.children) el.inert = false;
    opener?.focus?.();
    opener = null;
  }

  function close(velocity = 0) {
    if (!root || root.hidden || root.classList.contains("closing")) return;
    root.classList.add("closing");
    if (still()) { root.classList.remove("open"); setTimeout(finish, 200); return; }
    if (phone()) {
      const y = new DOMMatrix(getComputedStyle(panel).transform).m42;
      spring(y, panel.offsetHeight, typeof velocity === "number" ? velocity : 0,
             { response: 0.3, damping: 0.8, onFrame: place, onDone: finish });
      return;
    }
    root.classList.remove("open");
    setTimeout(finish, 220);
  }

  /** Drag the sheet down to dismiss it; phones only. */
  function dragToDismiss(handle) {
    let startY = 0, startT = 0, samples = [];
    handle.addEventListener("pointerdown", (e) => {
      if (!phone() || still() || e.target.closest("button")) return;
      cancelAnimationFrame(anim);
      handle.setPointerCapture(e.pointerId);
      // Respect where it was grabbed: move from the sheet's current position.
      startT = new DOMMatrix(getComputedStyle(panel).transform).m42;
      startY = e.clientY;
      samples = [[e.timeStamp, 0]];
    });
    handle.addEventListener("pointermove", (e) => {
      if (!handle.hasPointerCapture(e.pointerId)) return;
      let y = startT + e.clientY - startY;
      // Past the top it resists, progressively, rather than stopping dead.
      if (y < 0) y = -((-y * 60 * 0.55) / (60 + 0.55 * -y));
      place(y);
      samples.push([e.timeStamp, y]);
      if (samples.length > 5) samples.shift();
    });
    const release = (e) => {
      if (!handle.hasPointerCapture(e.pointerId)) return;
      handle.releasePointerCapture(e.pointerId);
      const y = new DOMMatrix(getComputedStyle(panel).transform).m42;
      const [t0, y0] = samples[0], [t1, y1] = samples[samples.length - 1];
      const v = t1 > t0 ? ((y1 - y0) / (t1 - t0)) * 1000 : 0;       // px/s
      const projected = y + (v / 1000) * 0.998 / (1 - 0.998);       // where the flick is going
      if (projected > panel.offsetHeight / 2) close(v);
      else spring(y, 0, v, { response: 0.3, damping: 0.8, onFrame: place });
    };
    handle.addEventListener("pointerup", release);
    handle.addEventListener("pointercancel", release);
  }

  window.AuralSheet = { open, close };
})();
