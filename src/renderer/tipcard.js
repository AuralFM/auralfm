/**
 * Showing one rule-based tip.
 *
 * The rules live in the main process because the store does. This is only the
 * presentation, and it deliberately reuses the introduction's card, arrow and
 * ring: a tip and a tour step are the same kind of object — a sentence about a
 * control, beside that control — and giving them two different looks would be
 * inventing a second vocabulary for one idea.
 *
 * One difference, and it is the reason this is a separate file rather than a
 * fourth step of the tour: a tip has a close button and no Next. It is not a
 * sequence, it is a single answer to "have they found this yet", and it retires
 * the moment it is acknowledged.
 *
 * It never interrupts. It asks once, a while after launch, and again only after
 * something has been donated — so a tip arrives while somebody is using the app
 * rather than while they are looking at it.
 */
(() => {
  const START = performance.now();
  const uptime = () => Math.round(performance.now() - START);

  let card = null, ring = null, arrow = null, showing = null, asked = false;

  const $ = (s) => document.querySelector(s);

  function close(reason) {
    if (showing) window.auralfm?.tipRetire?.(showing, reason);
    for (const n of [card, ring, arrow]) n?.remove();
    card = ring = arrow = null;
    showing = null;
    removeEventListener("resize", position);
    removeEventListener("keydown", onKey, true);
  }

  function onKey(e) { if (e.key === "Escape") { e.preventDefault(); close("dismissed"); } }

  function position() {
    if (!card || !showing) return;
    const target = $(card.dataset.anchor);
    if (!target) return close("dismissed");
    const GAP = 13;
    const r = target.getBoundingClientRect();
    const c = card.getBoundingClientRect();
    const below = r.bottom + GAP + c.height < innerHeight - 12;
    const top = below ? r.bottom + GAP : r.top - GAP - c.height;
    let left = r.left + r.width / 2 - c.width / 2;
    left = Math.max(12, Math.min(left, innerWidth - c.width - 12));
    card.style.left = `${Math.round(left)}px`;
    card.style.top = `${Math.round(top)}px`;
    ring.style.left = `${Math.round(r.left - 5)}px`;
    ring.style.top = `${Math.round(r.top - 5)}px`;
    ring.style.width = `${Math.round(r.width + 10)}px`;
    ring.style.height = `${Math.round(r.height + 10)}px`;
    arrow.className = `tourarrow ${below ? "up" : "down"}`;
    arrow.style.left = `${Math.round(r.left + r.width / 2 - 5)}px`;
    arrow.style.top = `${Math.round(below ? top - 5 : top + c.height - 5)}px`;
  }

  function show(tip) {
    // Never over the introduction, and never two at once.
    if (card || document.querySelector(".tourcard")) return;
    if (!$(tip.anchor)) return;

    showing = tip.id;
    ring = document.createElement("div");
    ring.className = "tourring";
    arrow = document.createElement("div");
    arrow.className = "tourarrow";
    card = document.createElement("div");
    card.className = "tourcard tip";
    card.dataset.anchor = tip.anchor;
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-label", tip.title);

    const x = document.createElement("button");
    x.className = "tipx";
    x.textContent = "×";
    x.setAttribute("aria-label", "Dismiss");
    x.onclick = () => close("dismissed");

    const h = document.createElement("div");
    h.className = "tourh";
    h.textContent = tip.title;
    const p = document.createElement("p");
    p.textContent = tip.body;

    const row = document.createElement("div");
    row.className = "tourrow";
    const got = document.createElement("button");
    got.className = "tourgo";
    got.textContent = "Got it";
    got.onclick = () => close("acknowledged");
    row.append(got);

    card.append(x, h, p, row);
    document.body.append(ring, arrow, card);
    position();
    addEventListener("resize", position);
    addEventListener("keydown", onKey, true);
  }

  async function ask() {
    if (card || asked) return;
    // The introduction owns the first minute of a first run.
    if (document.querySelector(".tourcard")) return;
    asked = true;
    const tip = await window.guard?.("tipNext", () => window.auralfm.tipNext(uptime()), null);
    asked = false;
    if (tip) show(tip);
  }

  /**
   * Donate, then consider asking.
   *
   * Asking after a donation is what makes a tip arrive in the middle of use
   * rather than on a timer: the rules have just changed, so this is the only
   * moment the answer can have changed too. Debounced, because a few of these
   * fire in bursts.
   */
  let pending = null;
  function donate(id) {
    window.auralfm?.tipDonate?.(id);
    clearTimeout(pending);
    pending = setTimeout(ask, 2500);
  }

  window.Tip = { donate, ask, close, get showing() { return showing; } };

  // One unprompted look, late enough that nothing is still loading.
  setTimeout(ask, 30_000);
})();
