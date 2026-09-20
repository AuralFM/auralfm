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
 *   │  globe                     ≡  │  layers, headlines, somewhere else
 *   │                            ▤  │
 *   │                            ⤫  │
 *   ├───────────────────────────────┤
 *   │ ◉ Station name      ▶  🔓 ⋯ │  the now-playing row: one big button
 *   ├───────────────────────────────┤
 *   │  Explore Favorites Chat …     │  tabs
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
   * Only one of these is open at a time.
   *
   * Chat, Search and Favourites each cover the globe, and two of them open at
   * once is how a phone ends up with a panel nobody meant to leave behind.
   */
  let openTab = "explore";
  const setTab = (name) => {
    openTab = name;
    for (const b of tabs.querySelectorAll(".tab")) {
      b.setAttribute("aria-pressed", String(b.dataset.tab === name));
    }
    chatPanel.hidden = name !== "chat";
    searchbar.hidden = name !== "search";
    if (name === "search") $("q")?.focus();
    if (name !== "search") $("q")?.blur();
  };

  const explore = tab("explore", "Explore", "globe", () => {
    setTab("explore");
    window.AuralRailSheet?.peek();
  });
  tab("favorites", "Favorites", "star", (b) => {
    setTab("favorites");
    $("favBtn")?.click();            // the real control, still doing the work
    b.setAttribute("aria-pressed", $("favBtn")?.getAttribute("aria-pressed") === "true" ? "true" : "false");
  });
  tab("chat", "Chat", "chat", () => setTab(openTab === "chat" ? "explore" : "chat"));
  tab("search", "Search", "search", () => setTab(openTab === "search" ? "explore" : "search"));
  tab("settings", "Settings", "gear", () => { setTab("explore"); $("setBtn")?.click(); });

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
      // The globe's own controls: what it shows, and where to go next.
      for (const el of [$("layersBtn"), $("newsBtn"), $("tripBtn")]) { remember(el); side.append(el); }
      document.querySelector(".globewrap")?.append(side);
      // Search is a tab now, so the field lives in a bar that tab opens.
      const q = $("q");
      if (q) { remember(q); searchbar.append(q); }
      // Play, lock and share belong with the station, not among the tabs, and
      // they sit after its name: what is on, then what to do with it. Lock
      // holds a station rather than a city — in the sheet's heading it read as
      // locking onto the place, which is not a thing it can do.
      const play = $("play"), lock = $("lock"), share = $("nowShare");
      if (play) { remember(play); now.append(play); }
      if (lock) { remember(lock); now.append(lock); }
      if (share) { remember(share); now.append(share); share.onclick = shareCard; }
      now.insertBefore(open, now.firstChild);
      const chat = $("chat");
      if (chat) { remember(chat); chatPanel.append(chat, chatNone); }
      document.body.append(searchbar, chatPanel, tabs);
      setTab("explore");
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
    if (e.key === "Escape" && openTab === "search") setTab("explore");
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
