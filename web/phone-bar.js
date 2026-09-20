/**
 * The phone's bottom bar: the five things you reach for, under your thumb.
 *
 * On a Mac every control lives in the title bar, which is where a pointer
 * already is. On a phone that row is the furthest point from your hand, and it
 * put five tiles across the top of the screen competing with the globe —
 * which is the thing people came for.
 *
 * So the browsing controls move down and split around the transport, the way
 * Instagram and YouTube arrange a phone: headlines and chat on the left,
 * favourites and somewhere-else on the right, play in the middle. Search stays
 * at the top, because typing belongs near the keyboard, and Layers joins
 * Settings up there with it — a bottom bar is for places you go, and those two
 * change how the app looks rather than where you are (Material's split between
 * primary and secondary navigation, and five items is its ceiling).
 *
 * The elements are moved, not rebuilt: every handler in explore-*.js is bound
 * to these ids and travels with the node.
 */
(() => {
  const phone = matchMedia("(max-width: 700px)");
  const $ = (id) => document.getElementById(id);
  const toolbar = document.querySelector(".toolbar");
  const now = $("now");
  if (!toolbar || !now) return;

  // Where each control came from, so a window that grows back puts it back.
  const home = new Map();
  const remember = (el) => el && !home.has(el) && home.set(el, [el.parentNode, el.nextSibling]);

  const bar = document.createElement("nav");
  bar.className = "tabbar";
  bar.hidden = true;
  bar.setAttribute("aria-label", "Player and browsing");
  const left = document.createElement("div");
  const right = document.createElement("div");
  left.className = right.className = "tabgroup";
  bar.append(left, right);
  document.body.append(bar);

  /**
   * The strip above the bar: what is on air, and a way back to it.
   *
   * The transport used to be a full row floating over the globe with the play
   * button in it. One line of text and a tap that opens the station sheet says
   * the same thing in a quarter of the height.
   */
  const toSheet = (e) => {
    if (e.target.closest("button, input, a")) return;
    window.AuralRailSheet?.open();
  };

  /**
   * Chat, as a panel of its own.
   *
   * On a Mac it is a section under the station list, which works because the
   * rail is tall. On a phone the same section sits below the fold of a sheet
   * that is mostly list. Given its own panel it is one tap away and the list
   * keeps its room. The node moves rather than being rebuilt, so every handler
   * and the log itself come with it.
   */
  const chatPanel = document.createElement("div");
  chatPanel.className = "chatpanel";
  chatPanel.hidden = true;
  // Chat only exists while something is playing somewhere real, so the panel
  // says which of those is missing rather than opening onto nothing.
  const chatNone = document.createElement("p");
  chatNone.className = "chatnone";
  chatNone.textContent = "Play a station to talk to the place it comes from.";

  const chatBtn = document.createElement("button");
  chatBtn.type = "button";
  chatBtn.id = "chatBtn";
  chatBtn.setAttribute("aria-pressed", "false");
  chatBtn.setAttribute("aria-controls", "chat");
  chatBtn.setAttribute("aria-label", "Chat");
  chatBtn.title = "Chat";
  chatBtn.innerHTML = window.Icons?.svg?.("chat") || "";
  chatBtn.onclick = () => {
    const open = chatPanel.hidden;
    chatPanel.hidden = !open;
    chatBtn.setAttribute("aria-pressed", String(open));
  };

  function layout(on) {
    bar.hidden = !on;
    document.body.classList.toggle("phonebar", on);
    const play = $("play");
    const chat = $("chat");
    if (on) {
      remember($("newsBtn")); left.append($("newsBtn"));
      left.append(chatBtn);
      remember(play); bar.insertBefore(play, right);
      for (const el of [$("favBtn"), $("tripBtn")]) { remember(el); right.append(el); }
      // Layers is a view option, not a destination: it belongs with Settings.
      const layers = $("layersBtn"), set = $("setBtn");
      if (layers && set) { remember(layers); set.parentNode.insertBefore(layers, set); }
      // Lock belongs with the station it holds, which is the sheet's heading.
      const lock = $("lock"), head = $("head");
      if (lock && head) { remember(lock); head.append(lock); }
      if (chat) { remember(chat); chatPanel.append(chat, chatNone); document.body.append(chatPanel); }
      now.addEventListener("click", toSheet);
    } else {
      chatPanel.hidden = true;
      chatBtn.remove();
      chatPanel.remove();
      for (const el of home.keys()) {
        const [parent, before] = home.get(el);
        parent.insertBefore(el, before && before.parentNode === parent ? before : null);
      }
      home.clear();
      now.removeEventListener("click", toSheet);
    }
  }

  /**
   * How much of the bottom belongs to the player.
   *
   * The panels anchor to it (--chrome), so headlines, layers and chat stop
   * above the strip and the bar rather than lying over the transport they were
   * opened from. Measured rather than guessed: the strip comes and goes with
   * what is playing, and the bar grows by the home indicator's height.
   */
  const chrome = () => {
    const h = (bar.hidden ? 0 : bar.offsetHeight) + (now.hidden ? 0 : now.offsetHeight);
    document.documentElement.style.setProperty("--chrome", `${h}px`);
  };
  if (typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver(chrome);
    ro.observe(bar); ro.observe(now);
  }
  new MutationObserver(chrome).observe(now, { attributes: true, attributeFilter: ["hidden"] });
  addEventListener("resize", chrome);
  // iOS hides and shows its own bars without firing a window resize; the visual
  // viewport is the one that notices, and the panels are anchored to this.
  visualViewport?.addEventListener("resize", chrome);

  layout(phone.matches);
  chrome();
  phone.addEventListener?.("change", (e) => layout(e.matches));
})();
