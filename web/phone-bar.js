/**
 * The phone layout: the globe, and the player and its tabs beneath it.
 *
 * A Mac puts everything in the title bar, which is where a pointer already is.
 * On a phone that row is the furthest thing from the hand holding it, and five
 * tiles across the top were spending the screen's best real estate on chrome.
 *
 * So, after Radio Garden: no top bar at all. The globe runs edge to edge with a
 * few small controls down its right side, and the bottom carries a player and
 * five labelled tabs. Labels because an unexplained row of glyphs is a quiz —
 * Instagram, YouTube and Radio Garden all label theirs.
 *
 *   ┌───────────────────────────────┐
 *   │  globe                     ≡  │  layers, lock, somewhere else
 *   │                            ▤  │
 *   │                            ⤫  │
 *   ├───────────────────────────────┤
 *   │ ◉ Station name         ▶  ⋯ │  the now-playing row: one big button
 *   ├───────────────────────────────┤
 *   │  Explore Headlines … Settings │  tabs
 *   └───────────────────────────────┘
 *
 * Everything here moves existing elements rather than rebuilding them: each id
 * carries its handlers from explore-*.js with it, and `home` remembers where
 * every one came from so a window that grows back puts them all back.
 */
(() => {
  const phone = matchMedia("(max-width: 700px)");
  const $ = (id) => document.getElementById(id);
  const toolbar = document.querySelector(".toolbar");
  const now = $("now");
  if (!toolbar || !now) return;

  const home = new Map();
  const remember = (el) => el && !home.has(el) && home.set(el, [el.parentNode, el.nextSibling]);
  const icon = (name) => window.Icons?.svg?.(name) || "";

  // ── the controls that stay on the globe ────────────────────────────────────
  const side = document.createElement("div");
  side.className = "globeside";

  // ── the search bar, which is a tab rather than a permanent field ───────────
  const searchbar = document.createElement("div");
  searchbar.className = "searchbar";
  searchbar.hidden = true;

  // ── the tabs ───────────────────────────────────────────────────────────────
  const tabs = document.createElement("nav");
  tabs.className = "tabbar";
  tabs.hidden = true;
  tabs.setAttribute("aria-label", "Sections");

  const chatPanel = document.createElement("div");
  chatPanel.className = "chatpanel";
  chatPanel.hidden = true;
  const chatNone = document.createElement("p");
  chatNone.className = "chatnone";
  chatNone.textContent = "Play a station to talk to the place it comes from.";

  /** One tab: a glyph, a word under it, and whether it is the one you are on. */
  function tab(name, label, glyph, onPick) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "tab";
    b.dataset.tab = name;
    b.setAttribute("aria-pressed", "false");
    b.innerHTML = `<span class="tabicon">${icon(glyph)}</span><span class="tablabel"></span>`;
    b.querySelector(".tablabel").textContent = label;
    b.onclick = () => onPick(b);
    tabs.append(b);
    return b;
  }

  /**
   * One panel at a time, and the tabs say which.
   *
   * Each of these already had a control of its own — the headlines button, the
   * favourites button, the settings sheet — so this does not reimplement them,
   * it drives them and then reads back what actually happened. That direction
   * matters: closing headlines with its own × or settings with Done has to
   * leave the tabs telling the truth, and a tab that only remembers its own
   * clicks cannot. Everything below reads the DOM.
   */
  const shown = {
    explore: () => !searchbar.hidden,
    headlines: () => !!$("newspanel") && !$("newspanel").hidden,
    favorites: () => $("favBtn")?.getAttribute("aria-pressed") === "true",
    chat: () => !chatPanel.hidden,
    settings: () => !!document.querySelector(".setsheet:not([hidden])"),
  };
  const act = {
    explore(on) {
      searchbar.hidden = !on;
      // The field drops in from the top, where the globe's own controls live.
      document.body.classList.toggle("searching", on);
      // And it covers the sky, so the planet owes itself a re-centre. Showing
      // the field does not resize the globe, so no observer catches this.
      if (typeof sizeGlobe === "function") requestAnimationFrame(() => sizeGlobe());
      if (on) $("q")?.focus(); else $("q")?.blur();
    },
    headlines(on) { if (shown.headlines() !== on) $("newsBtn")?.click(); },
    favorites(on) { if (shown.favorites() !== on) $("favBtn")?.click(); },
    chat(on) { chatPanel.hidden = !on; },
    settings(on) { if (on) window.AuralSheet?.open(); else window.AuralSheet?.close(); },
  };

  /**
   * Paint the tabs from what is actually open — and only when it changed.
   *
   * setAttribute records a mutation even when the value is identical, and this
   * runs from a MutationObserver watching those same attributes, so writing
   * unconditionally is an observer feeding itself. It hung the page.
   */
  const sync = () => {
    for (const b of tabs.querySelectorAll(".tab")) {
      const on = String(!!shown[b.dataset.tab]?.());
      if (b.getAttribute("aria-pressed") !== on) b.setAttribute("aria-pressed", on);
    }
  };

  const setTab = (name) => {
    // Headlines and chat replace the sheet rather than covering it; Explore and
    // Favourites *are* the sheet, so it stays.
    document.body.classList.toggle("panel-open", name === "headlines" || name === "chat");
    // Close the others first: two panels over one globe is how a phone ends up
    // with something open that nobody meant to leave behind.
    for (const key of Object.keys(act)) if (key !== name && shown[key]()) act[key](false);
    if (act[name]) act[name](true);
    sync();
  };
  const toggle = (name) => setTab(shown[name]() ? "none" : name);

  /**
   * Explore is the search.
   *
   * They were two tabs doing one thing: exploring this app *is* looking for a
   * place, and a magnifying glass beside a globe asked people to guess which
   * of the two meant "find somewhere". One tab, and it opens the field.
   */
  tab("explore", "Explore", "globe", () => {
    toggle("explore");
    window.AuralRailSheet?.peek();
  });
  tab("headlines", "Headlines", "headlines", () => toggle("headlines"));
  /**
   * Favourites is the sheet too, so it rests where the sheet rests.
   *
   * Without this it opened wherever the sheet happened to be left — and if
   * that was all the way up, from the now-playing strip or a drag, Favourites
   * arrived filling the screen for a list that is usually a few rows. A tab is
   * a place you go, not a continuation of whatever you were doing, so it
   * settles to the same peek Explore does.
   */
  tab("favorites", "Favorites", "star", () => {
    toggle("favorites");
    window.AuralRailSheet?.peek();
  });
  tab("chat", "Chat", "chat", () => toggle("chat"));
  tab("settings", "Settings", "gear", () => toggle("settings"));

  /**
   * Anything closed by its own control repaints the tabs.
   *
   * The headlines ×, the favourites button in the rail, Done in settings: all
   * of them change an attribute, and watching the attributes is what keeps a
   * tab from claiming something is open after it has gone.
   */
  const watch = new MutationObserver(sync);
  watch.observe(document.body, {
    attributes: true, subtree: true, childList: true,
    attributeFilter: ["hidden", "aria-pressed", "class"],
  });

  // ── the now-playing row ────────────────────────────────────────────────────
  /**
   * The strip is one button, because it does one thing: it shows the station
   * sheet. It was a div with a click handler, which is a control that exists
   * for a finger and not for a keyboard or VoiceOver.
   */
  const open = document.createElement("button");
  open.type = "button";
  open.className = "nowopen";
  open.setAttribute("aria-label", "Show the station list");

  /**
   * Share, through the system's own sheet.
   *
   * The desktop offers a card with Copy, Save and Copy link beside it, which is
   * four buttons doing what iOS already does better — and does with every app
   * on the phone, not just the ones we thought of. So here the card goes
   * straight into the share sheet as a file, and the phone takes it from there.
   * If this browser has no share sheet, the app's own falls back in.
   */
  async function shareCard() {
    // `playing` and `buildCard` are explore-playback.js's own top-level
    // bindings; these are plain scripts sharing one scope.
    const ch = typeof playing !== "undefined" ? playing : null;
    if (!ch) return;
    let png = null;
    try { png = await buildCard(); } catch {}
    if (!png) return;
    const where = [ch.place, ch.country].filter(Boolean).join(", ");
    const text = where ? `${ch.title} — ${where}` : ch.title;
    try {
      const file = new File([await (await fetch(png)).blob()], "auralfm.png", { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) return await navigator.share({ files: [file], text });
      if (navigator.share) return await navigator.share({ title: "AuralFM", text, url: location.href });
    } catch (e) {
      if (e?.name === "AbortError") return;        // they closed the sheet
    }
    openShareSheet();
  }

  function layout(on) {
    tabs.hidden = !on;
    document.body.classList.toggle("phonebar", on);
    if (on) {
      // The globe's own controls: what it shows, what is held, and where to go
      // next. Lock sits here rather than in the player because it is a switch
      // you set once and then forget, not part of reading what is on.
      for (const el of [$("layersBtn"), $("lock"), $("tripBtn")]) { remember(el); side.append(el); }
      document.querySelector(".globewrap")?.append(side);
      // Search is a tab now, so the field lives in a bar that tab opens.
      const q = $("q");
      if (q) { remember(q); searchbar.append(q); }
      // Play, lock and share belong with the station, not among the tabs, and
      // they sit after its name: what is on, then what to do with it. Lock
      // holds a station rather than a city — in the sheet's heading it read as
      // locking onto the place, which is not a thing it can do.
      const play = $("play"), share = $("nowShare");
      if (play) { remember(play); now.append(play); }
      if (share) { remember(share); now.append(share); share.onclick = shareCard; }
      now.insertBefore(open, now.firstChild);
      const chat = $("chat");
      if (chat) { remember(chat); chatPanel.append(chat, chatNone); }
      document.body.append(searchbar, chatPanel, tabs);
      sync();                // nothing is open; the globe has the screen
    } else {
      open.remove(); side.remove();
      const share = $("nowShare");
      if (share) share.onclick = openShareSheet;      // the desktop's own sheet
      searchbar.remove(); chatPanel.remove(); tabs.remove();
      for (const el of home.keys()) {
        const [parent, before] = home.get(el);
        parent.insertBefore(el, before && before.parentNode === parent ? before : null);
      }
      home.clear();
    }
  }

  // The big button sits under the row's text, so the text has to say what it is.
  open.addEventListener("click", () => window.AuralRailSheet?.open());
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && shown.explore()) setTab("none");
  });

  /**
   * How much of the bottom belongs to the player.
   *
   * Panels anchor to it (--chrome), so nothing opens over the transport it was
   * opened from. Measured, not guessed: the row comes and goes with what is
   * playing, and iOS grows the bar by the home indicator.
   */
  const chrome = () => {
    const h = (tabs.hidden ? 0 : tabs.offsetHeight) + (now.hidden ? 0 : now.offsetHeight);
    document.documentElement.style.setProperty("--chrome", `${h}px`);
  };
  if (typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver(chrome);
    ro.observe(tabs); ro.observe(now);
  }
  new MutationObserver(chrome).observe(now, { attributes: true, attributeFilter: ["hidden"] });
  addEventListener("resize", chrome);
  visualViewport?.addEventListener("resize", chrome);

  layout(phone.matches);
  chrome();
  phone.addEventListener?.("change", (e) => { layout(e.matches); chrome(); });
})();
