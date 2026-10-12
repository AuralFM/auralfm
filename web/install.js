/**
 * Add to Home Screen, first — and no tour on a phone.
 *
 * Nearly everyone arrives here from a link in Messages, on an iPhone, in
 * Safari. The app works there, but it is the home-screen app that runs full
 * screen, keeps its own favourites and opens with one tap, and Safari hides the
 * way to it three screens deep. So on an iPhone or iPad in the browser, the
 * first thing shown is how: Share, Add to Home Screen, Open as Web App, Add.
 * Opened from the home screen it never appears; there is nothing left to do.
 *
 * The tour does not run on a phone at all. Its tips point at the toolbar's
 * buttons, which a phone does not have — they moved to the tab bar — so the
 * cards pointed at the top left corner of the screen, at nothing. Laptops and
 * tablets keep it, after this guide if both are due.
 *
 * `?go=install` shows the guide anywhere but the home-screen app, so it can be
 * linked to and tested from a desktop.
 *
 * An Android phone gets the same card with one button: Chrome can add the app
 * itself, and tells the page when it is ready to (see below).
 */
(() => {
  const phone = matchMedia("(max-width: 700px), (pointer: coarse) and (max-height: 500px)");
  const still = matchMedia("(prefers-reduced-motion: reduce)");
  const standalone = navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;
  const iOS = /iPhone|iPad|iPod/.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);   // iPadOS says it is a Mac
  const forced = new URLSearchParams(location.search).get("go") === "install";
  const KEY = "auralfm.installLater";
  const LATER_MS = 7 * 24 * 60 * 60 * 1000;

  const later = () => { try { return Number(localStorage.getItem(KEY)) > Date.now(); } catch { return false; } };
  const due = !standalone && (forced || (iOS && !later()));

  // ── the tour waits for this, and never runs on a phone ─────────────────────
  let open = false, deferred = null;
  const tourStart = window.Tour?.maybeStart;
  if (tourStart) {
    window.Tour.maybeStart = (prefs) => {
      if (phone.matches) return;
      if (open || due) { deferred = prefs; return; }
      tourStart(prefs);
    };
  }
  // After the splash has lifted, like the tour: the globe first, then a card.
  const whenRevealed = (fn) => {
    const soon = () => setTimeout(fn, 700);
    if (document.body.classList.contains("revealed")) return soon();
    const obs = new MutationObserver(() => {
      if (document.body.classList.contains("revealed")) { obs.disconnect(); soon(); }
    });
    obs.observe(document.body, { attributes: true, attributeFilter: ["class"] });
  };

  /**
   * Android: the browser can install the app itself, and says when.
   *
   * Chrome fires beforeinstallprompt once the manifest and the worker satisfy
   * it. Nothing listened, so an Android listener was never offered the home
   * screen at all. The event is held (its own bar would otherwise slide up
   * beside this card), shown as the same card the iPhone gets with one button
   * in place of four steps, and made when that button is pressed. "Not now" is
   * remembered for a week, as on the iPhone; while it is, the event is left
   * alone and Chrome's own menu still offers it.
   */
  let offer = null, offerCard = null;
  const closeOffer = (remember) => {
    if (!offerCard) return;
    if (remember) { try { localStorage.setItem(KEY, String(Date.now() + LATER_MS)); } catch { /* private mode */ } }
    offerCard.remove(); offerCard = null; open = false;
    if (deferred && tourStart && !phone.matches) tourStart(deferred);
  };
  function showOffer() {
    if (offerCard || !offer) return;
    open = true;
    offerCard = document.createElement("div");
    offerCard.className = "installhint";
    offerCard.setAttribute("role", "dialog");
    offerCard.setAttribute("aria-labelledby", "installh");
    offerCard.innerHTML = `
      <div class="installhero" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" focusable="false"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8.5v7M8.5 12h7"/></svg></div>
      <h2 id="installh">Add AuralFM to your Home Screen</h2>
      <p class="installsub">It opens full screen, like an app.</p>
      <button type="button" class="installgo">Add to Home Screen</button>
      <button type="button" class="installlater">Not now</button>`;
    offerCard.querySelector(".installgo").addEventListener("click", async () => {
      const e = offer; offer = null;
      closeOffer(false);
      try { e.prompt(); const choice = await e.userChoice; if (choice?.outcome === "dismissed") { try { localStorage.setItem(KEY, String(Date.now() + LATER_MS)); } catch { /* private mode */ } } }
      catch { /* the browser withdrew the offer */ }
    });
    offerCard.querySelector(".installlater").addEventListener("click", () => closeOffer(true));
    document.body.append(offerCard);
    offerCard.querySelector(".installgo").focus({ preventScroll: true });
  }
  addEventListener("beforeinstallprompt", (e) => {
    if (standalone || iOS || later()) return;
    e.preventDefault();
    offer = e;
    whenRevealed(showOffer);
  });
  addEventListener("appinstalled", () => { offer = null; closeOffer(false); });

  if (!due) return;

  const svg = (body) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" `
    + `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
  const ICON = {
    share: svg(`<path d="M12 3v12M8 7l4-4 4 4"/><path d="M8 10H6.5A1.5 1.5 0 0 0 5 11.5v8A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-8a1.5 1.5 0 0 0-1.5-1.5H16"/>`),
    add: svg(`<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8.5v7M8.5 12h7"/>`),
    toggle: svg(`<rect x="2.5" y="7" width="19" height="10" rx="5"/><circle class="knob" cx="7.5" cy="12" r="3.2"/>`),
    done: svg(`<path d="M5 12.5l4.5 4.5L19 7.5"/>`),
  };
  const STEPS = [
    { icon: "share", html: "Tap <b>Share</b>", hint: "In Safari’s ••• menu" },
    { icon: "add", html: "Tap <b>Add to Home Screen</b>", hint: "Scroll down to find it" },
    { icon: "toggle", html: "Turn on <b>Open as Web App</b>" },
    { icon: "done", html: "Tap <b>Add</b>" },
  ];

  let card = null, step = 0, timer = null, shown = 0;

  function paint() {
    card.querySelectorAll(".installsteps li").forEach((li, i) => li.classList.toggle("on", i === step));
    const hero = card.querySelector(".installhero");
    hero.dataset.step = STEPS[step].icon;
    hero.innerHTML = ICON[STEPS[step].icon] + `<i class="installtap"></i>`;
  }

  /**
   * Twice through, then it rests on the first step. The steps are instructions
   * rather than controls, so they are not tappable; and a highlight that moves
   * forever is a distraction somebody cannot stop, so it does not.
   */
  function go(i) {
    step = (i + STEPS.length) % STEPS.length;
    paint();
    clearTimeout(timer);
    if (++shown < STEPS.length * 2 + 1 && !still.matches) timer = setTimeout(() => go(step + 1), 2400);
  }

  function close() {
    if (!card) return;
    clearTimeout(timer);
    try { localStorage.setItem(KEY, String(Date.now() + LATER_MS)); } catch { /* private mode */ }
    removeEventListener("keydown", onKey, true);
    card.remove();
    card = null;
    open = false;
    if (deferred && tourStart && !phone.matches) tourStart(deferred);
  }

  function onKey(e) { if (e.key === "Escape") close(); }

  function show() {
    if (card) return;
    open = true;
    card = document.createElement("div");
    card.className = "installhint";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-labelledby", "installh");
    card.innerHTML = `
      <div class="installhero" aria-hidden="true"></div>
      <h2 id="installh">Add AuralFM to your Home Screen</h2>
      <p class="installsub">It opens full screen, like an app.</p>
      <ol class="installsteps">${STEPS.map((s) => `
        <li><span class="installico">${ICON[s.icon]}</span>
          <span class="installtxt">${s.html}${s.hint ? `<small>${s.hint}</small>` : ""}</span></li>`).join("")}
      </ol>
      <button type="button" class="installlater">Not now</button>`;
    card.querySelector(".installlater").addEventListener("click", close);
    addEventListener("keydown", onKey, true);
    document.body.append(card);
    go(0);
  }

  whenRevealed(show);
})();
