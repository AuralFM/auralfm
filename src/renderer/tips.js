/**
 * Help tags.
 *
 * Apple calls a tooltip a *help tag*, and defines it as a small transient view
 * that "briefly describes how to use a component". That word — *use* — is the
 * whole brief. A tag that says "Layers" over a button labelled Layers has told
 * nobody anything; "Choose what the globe shows" has.
 *
 * macOS already draws a help tag for any element with a `title` attribute, and
 * this app had twenty of them. Three problems with leaving it at that: the delay
 * is long and not ours to set, the tag cannot be styled to match the app, and
 * there is no way to turn it off. So this takes them over — and the taking over
 * matters, because an element left with both a `title` and a custom tag shows
 * two tooltips, one of them native and unstyled, a few hundred milliseconds
 * apart. `adopt()` strips `title` for exactly that reason.
 *
 * Off is a real state, not a smaller version of on. When tips are off nothing
 * listens, nothing is scheduled, and `title` goes back onto the element so the
 * system tag still works for anyone who wants it.
 */
(() => {
  const DELAY_IN = 450;      // long enough not to fire while crossing a toolbar
  const DELAY_OUT = 80;
  const EDGE = 8;            // keep this far from the window edge

  let enabled = true;
  let el = null;             // the tag itself, created lazily
  let timer = null;
  let current = null;
  let seq = 0;

  const tipOf = (node) => node?.closest?.("[data-tip]");

  function ensure() {
    if (el) return el;
    el = document.createElement("div");
    el.className = "helptag";
    el.setAttribute("role", "tooltip");
    el.id = "helptag";
    el.hidden = true;
    document.body.appendChild(el);
    return el;
  }

  function place(target) {
    const tag = ensure();
    const r = target.getBoundingClientRect();
    tag.hidden = false;
    const t = tag.getBoundingClientRect();

    // Below by default, above when there is no room. Never off-screen sideways.
    let top = r.bottom + 7;
    if (top + t.height > innerHeight - EDGE) top = r.top - t.height - 7;
    let left = r.left + r.width / 2 - t.width / 2;
    left = Math.max(EDGE, Math.min(left, innerWidth - t.width - EDGE));

    tag.style.top = `${Math.round(top)}px`;
    tag.style.left = `${Math.round(left)}px`;
  }

  function show(target) {
    const text = target.getAttribute("data-tip");
    if (!text) return;
    const tag = ensure();
    tag.textContent = text;
    place(target);
    tag.classList.add("on");
    target.setAttribute("aria-describedby", "helptag");
    current = target;
  }

  function hide() {
    clearTimeout(timer);
    if (!el) return;
    el.classList.remove("on");
    el.hidden = true;
    current?.removeAttribute("aria-describedby");
    current = null;
  }

  function onEnter(e) {
    if (!enabled) return;
    const target = tipOf(e.target);
    if (!target || target === current) return;
    clearTimeout(timer);
    const mine = ++seq;
    timer = setTimeout(() => { if (mine === seq && enabled) show(target); }, DELAY_IN);
  }

  function onLeave(e) {
    if (!enabled) return;
    const target = tipOf(e.target);
    if (!target) return;
    seq++;
    clearTimeout(timer);
    timer = setTimeout(hide, DELAY_OUT);
  }

  /**
   * Take `title` over, or hand it back.
   *
   * Runs on whatever is in the document now and again whenever a list is
   * re-rendered, so rows built after start-up are covered too. Idempotent: an
   * element that already has `data-tip` is left alone.
   */
  function adopt(root = document) {
    if (enabled) {
      for (const node of root.querySelectorAll("[title]")) {
        const text = node.getAttribute("title");
        if (!text) { node.removeAttribute("title"); continue; }
        node.setAttribute("data-tip", text);
        /**
         * Keep the name. For a control with nothing else to go by — an icon, a
         * glyph — `title` was its accessible name, and removing it left the
         * popover's favourite star announcing as "button". So the text becomes
         * the aria-label first. Only when there is no other name: a label that
         * is already there, or real text in the control, wins. `data-tip-named`
         * marks names this wrote, so a title that changes later (Lock / Locked)
         * updates the name instead of leaving a stale one.
         */
        const named = node.hasAttribute("aria-labelledby") || node.textContent.trim()
          || (node.hasAttribute("aria-label") && !node.hasAttribute("data-tip-named"));
        if (!named) { node.setAttribute("aria-label", text); node.setAttribute("data-tip-named", ""); }
        node.removeAttribute("title");        // or macOS draws its own as well
      }
    } else {
      for (const node of root.querySelectorAll("[data-tip]")) {
        node.setAttribute("title", node.getAttribute("data-tip"));
        node.removeAttribute("data-tip");
      }
    }
  }

  function setEnabled(on) {
    const was = enabled;
    enabled = !!on;
    if (was === enabled) return;
    hide();
    adopt();
  }

  /**
   * Adopt whatever appears later, without anyone having to remember.
   *
   * Eleven places in explore.js set `title` from JavaScript — a signal strength,
   * a market symbol, a row that was just rendered — and a dozen of them were
   * still carrying it after the first adopt(), which means macOS was drawing its
   * own tag underneath ours. Watching the attribute is the only version of this
   * that does not rot the next time somebody adds a `.title =`.
   */
  new MutationObserver((records) => {
    if (!enabled) return;
    for (const rec of records) {
      if (rec.type === "attributes" && rec.target.hasAttribute?.("title")) {
        const text = rec.target.getAttribute("title");
        rec.target.removeAttribute("title");
        if (text) rec.target.setAttribute("data-tip", text);
      } else if (rec.type === "childList") {
        for (const node of rec.addedNodes) {
          if (node.nodeType === 1 && (node.hasAttribute("title") || node.querySelector?.("[title]"))) {
            adopt(node.parentElement || document);
            break;
          }
        }
      }
    }
  }).observe(document.documentElement, {
    subtree: true, childList: true, attributes: true, attributeFilter: ["title"],
  });

  document.addEventListener("pointerover", onEnter, true);
  document.addEventListener("pointerout", onLeave, true);
  // Any of these means the pointer is no longer just resting somewhere.
  for (const ev of ["pointerdown", "wheel", "blur"]) {
    document.addEventListener(ev, hide, true);
  }
  addEventListener("keydown", (e) => { if (e.key === "Escape") hide(); }, true);

  window.Tips = { setEnabled, adopt, hide, get enabled() { return enabled; } };
})();
