/**
 * A station's profile.
 *
 * Each row in the station list gets a small "i". It opens what the station says
 * about itself, gathered by scripts/enrich.mjs and written by
 * scripts/profiles.mjs into data/profiles/<xx>.json: its description, its
 * website and socials, what it plays, and — when the station has claimed its
 * page with /.well-known/auralfm.json on its own website — a Tip button that
 * hands its Lightning address to the listener's own wallet. AuralFM never
 * touches the money; the link is `lightning:` and the wallet does the rest.
 *
 * It started on the web and came to the desktop once Melton approved it
 * (26 Sept). The profile itself comes from window.auralfm.profile(id): on the
 * desktop, the files that ship with the app (src/profiles.js); on the web, the
 * same files fetched from the site (web/bridge.js). This wraps renderStations,
 * the global Explore draws the list with. Everything is set as text, never as
 * HTML, and only http(s) links are followed: all of it comes from the stations'
 * own pages.
 */
{
  const draw = renderStations;
  const profileOf = (id) => Promise.resolve(window.auralfm.profile?.(id)).catch(() => null);

  const SOCIAL = [["instagram", "Instagram"], ["facebook", "Facebook"], ["x", "X"], ["youtube", "YouTube"],
    ["tiktok", "TikTok"], ["soundcloud", "SoundCloud"], ["mixcloud", "Mixcloud"], ["spotify", "Spotify"],
    ["bluesky", "Bluesky"], ["mastodon", "Mastodon"], ["telegram", "Telegram"], ["whatsapp", "WhatsApp"]];
  const safe = (u) => (typeof u === "string" && /^https?:\/\/[^\s"'<>]+$/i.test(u) ? u : null);
  /** "Looking…", with the wave before it. */
  const looking = () => { const p = el("p", "pnone", t("profile.loading", "Looking…")); p.prepend(waveSpan()); return p; };
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
  const link = (href, text, cls = "plink") => {
    const a = el("a", cls, text);
    a.href = href; a.target = "_blank"; a.rel = "noopener noreferrer";
    return a;
  };

  function paint(box, p, ch) {
    box.textContent = "";
    if (!p) {
      box.append(el("p", "pnone", t("profile.none", "Nothing more about this station yet.")));
      box.append(claimLine(ch));
      return;
    }
    const head = el("div", "phead");
    if (p.image) {
      const img = el("img", "plogo");
      img.alt = ""; img.loading = "lazy"; img.referrerPolicy = "no-referrer"; img.decoding = "async";
      img.onerror = () => img.remove();
      img.src = p.image;
      head.append(img);
    }
    const where = [p.place, p.region && p.region !== p.place ? p.region : null, p.country].filter(Boolean).join(" · ");
    // Languages arrive as "portuguese", "pt-BR" or "PORTUGUESE": say them once, plainly.
    // "en_GB" is "en-GB" written by a different tool.
    const lang = p.lang ? (/^[a-z]{2}([-_][a-z]{2})?$/i.test(p.lang) ? p.lang.toLowerCase().split(/[-_]/)[0]
      : p.lang.split(",")[0].trim().toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())) : null;
    const langName = lang && lang.length === 2
      ? (() => { try { return new Intl.DisplayNames([navigator.language || "en"], { type: "language" }).of(lang); } catch { return lang; } })()
      : lang;
    const facts = [where, langName, p.bitrate ? `${p.bitrate} kbps` : null].filter(Boolean).join(" · ");
    head.append(el("p", "pwhere", facts));
    box.append(head);
    // Thirty words at most, then "…" (Melton): a taste of the station, not its page.
    if (p.description) {
      const words = p.description.trim().split(/\s+/);
      box.append(el("p", "pdesc", words.length > 30 ? `${words.slice(0, 30).join(" ").replace(/[,;:.\-–—]+$/, "")}…` : p.description));
    }

    const chips = [...(p.explicit ? [t("profile.explicit", "Explicit")] : []), ...(p.genres || []).slice(0, 4), ...(p.moods || []).slice(0, 3)];
    if (chips.length) {
      const row = el("div", "pchips");
      chips.forEach((c, i) => row.append(el("span", i === 0 && p.explicit ? "pchip pexplicit" : "pchip", c)));
      box.append(row);
    }

    const links = el("div", "plinks");
    const site = safe(p.website);
    if (site) links.append(link(site, t("profile.website", "Website")));
    for (const [k, name] of SOCIAL) { const u = safe(p.social?.[k]); if (u) links.append(link(u, name)); }
    if (p.social?.nostr && /^npub1[02-9ac-hj-np-z]{58}$/.test(p.social.nostr)) links.append(link(`https://njump.me/${p.social.nostr}`, "Nostr"));
    if (links.childElementCount) box.append(links);

    const ln = p.claim?.lightning;
    if (ln && /^[\w.+-]+@[\w.-]+\.[a-z]{2,}$/i.test(ln)) {
      const tip = link(`lightning:${ln}`, t("profile.tip", "Tip this station"), "ptip");
      tip.removeAttribute("target");
      tip.title = ln;
      box.append(tip);
      box.append(el("p", "pnote", t("profile.tipNote", "Wallet to wallet, to the address the station published itself. AuralFM never holds the money.")));
    } else {
      // No tips to a country under comprehensive US sanctions (scripts/profiles.mjs).
      if (p.noTips) box.append(el("p", "pnote", t("profile.noTips", "Tips can't be sent to stations in this country.")));
      box.append(claimLine(ch));
    }
  }

  const claimLine = (ch) => {
    const p = el("p", "pnote");
    p.append(t("profile.claimQ", "Run this station? "));
    p.append(link(`https://docs.auralfm.xyz/claim/?station=${encodeURIComponent(ch?.title || "")}&id=${encodeURIComponent(ch?.id || "")}`,
      t("profile.claim", "Claim its page")));
    return p;
  };

  async function toggle(row, ch, btn) {
    const open = row.nextElementSibling?.classList.contains("sprofile");
    // Focus inside a panel about to go (a link in it) comes back to this button,
    // not to the page.
    const focusWasInside = [...stationListEl.querySelectorAll(".sprofile")].some((b) => b.contains(document.activeElement));
    stationListEl.querySelectorAll(".sprofile").forEach((b) => b.remove());
    if (focusWasInside) btn.focus();
    stationListEl.querySelectorAll(".pinfo[aria-expanded='true']").forEach((b) => b.setAttribute("aria-expanded", "false"));
    if (open) return;
    const box = el("div", "sprofile");
    box.id = `profile-${ch.id.replace(/[^\w-]/g, "")}`;
    box.setAttribute("role", "region");
    box.setAttribute("aria-label", `${ch.title}: ${t("profile.about", "about this station")}`);
    box.append(looking());
    btn.setAttribute("aria-controls", box.id);
    btn.setAttribute("aria-expanded", "true");
    row.after(box);
    paint(box, await profileOf(ch.id), ch);
  }

  // ── the player bar ───────────────────────────────────────────────────────
  // The playing station's card, from the player (Melton, 26 Sept: a card that
  // popped out over Explore or Headlines was clutter).
  //
  // A wide window has the rail, so the "i" beside the station's name opens the
  // station there: its place, the list, and its card unfolded and scrolled to.
  //
  // A phone has no rail beside the globe, so the player pulls up instead. Grab
  // the handle on the bar's top edge, or the bar anywhere that is not a
  // control: the drawer follows the finger 1:1, and where the flick was going
  // decides whether it stays up. Flick it down, press the handle, or Escape to
  // put it away. It counts as part of the chrome, so the panels that sit above
  // the player move up with it rather than being covered.
  const now = document.getElementById("now");
  const info = document.getElementById("nowInfo");
  const isPhone = () => document.body.classList.contains("phonebar");

  async function openInRail(ch) {
    const st = await Promise.resolve(window.auralfm.stationById?.(ch.id)).catch(() => null);
    if (!st || st.pi == null) return;
    const find = () => stationListEl.querySelector(`.st[data-id="${CSS.escape(String(st.id))}"]`);
    // Its place, unless the rail already shows it with the station in the list
    // (a filter can hide it; going to the place again clears the filter).
    // A station with no town ("Somewhere in …") has no dot to fly to, and flying
    // to its stand-in lets the spinning globe pick whatever town it passes.
    const nowhere = /^(Somewhere in |Online only$)/.test(st.place || "");
    // And held there while it is read: the drift must not swap it out (explore-view.js).
    if (selection.placeIndex !== st.pi || stationListEl.hidden || !find()) await goToPlace(st.pi, { fly: !nowhere, hold: true });
    else holdCentre = true;
    const row = find(), btn = row?.querySelector(".pinfo");
    if (!row || !btn) return;
    if (btn.getAttribute("aria-expanded") !== "true") await toggle(row, st, btn);
    row.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    btn.focus({ preventScroll: true });
  }
  const grab = document.getElementById("nowGrab");
  const drawer = document.getElementById("nowdrawer");
  const card = document.getElementById("nowcard");
  let nowCh = null, h = 0, isOpen = false, drag = null, painted = null;

  const barTop = () => Math.max(0, innerHeight - now.getBoundingClientRect().top);
  const full = () => Math.min(card.scrollHeight, card.offsetHeight || card.scrollHeight);
  const setH = (v) => {
    h = Math.max(0, v);
    // Fixed above the player on a phone; on a wide window it is in the layout.
    drawer.style.bottom = document.body.classList.contains("phonebar") ? `${barTop()}px` : "";
    drawer.style.height = `${Math.round(h)}px`;
    document.documentElement.style.setProperty("--drawer", `${Math.round(h)}px`);
  };
  const say = () => {
    grab.setAttribute("aria-expanded", String(isOpen));
    drawer.inert = !isOpen;
  };
  async function fill() {
    const ch = nowCh;
    if (!ch || painted === ch.id) return;
    painted = ch.id;
    card.textContent = "";
    card.setAttribute("aria-label", `${ch.title}: ${t("profile.about", "about this station")}`);
    const box = el("div", "sprofile");
    box.append(looking());
    // No name on top: the player it rises out of says it, right underneath.
    card.append(box);
    const p = await profileOf(ch.id);
    if (nowCh !== ch) return;
    paint(box, p, ch);
    if (isOpen && !drag) settle(true);        // the card grew: the drawer follows
  }
  function settle(open, { focus = false } = {}) {
    isOpen = open;
    drawer.hidden = false;
    drawer.classList.add("settling");
    setH(open ? full() : 0);
    say();
    if (open && focus) card.focus({ preventScroll: true });
    if (!open) setTimeout(() => { if (!isOpen && !drag) drawer.hidden = true; }, 400);
  }
  const toggleDrawer = (focus) => { if (isOpen) settle(false); else { fill(); drawer.hidden = false; settle(true, { focus }); } };

  // Where a flick is heading, the way scrolling decelerates (web/rail-sheet.js).
  const project = (v) => (v / 1000) * 0.998 / (1 - 0.998);
  const band = (over, dim) => (over * dim * 0.55) / (dim + 0.55 * Math.abs(over));
  // Controls on the bar keep their own job; everything else is something to pull.
  const CONTROL = "button:not(.nowopen):not(.nowgrab), input, a, select, .volwrap, .markets, .outwrap";
  let swallowClick = false;

  function down(e) {
    if (!isPhone() || !nowCh || grab.hidden || e.button > 0) return;
    const inDrawer = drawer.contains(e.target);
    if (inDrawer ? e.target.closest("a, button") || card.scrollTop > 0 && e.target !== card
                 : e.target.closest(CONTROL)) return;
    drag = { id: e.pointerId, from: e.clientY, base: h, last: e.clientY, at: e.timeStamp, v: 0, live: false };
  }
  function move(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const dy = e.clientY - drag.from;
    if (!drag.live) {
      if (Math.abs(dy) < 6) return;
      // Down on a closed drawer is not a pull; let the page have it.
      if (!isOpen && dy > 0) { drag = null; return; }
      drag.live = true;
      fill();
      drawer.hidden = false;
      drawer.classList.remove("settling");
    }
    const dt = Math.max(1, e.timeStamp - drag.at);
    drag.v = ((e.clientY - drag.last) / dt) * 1000;
    drag.last = e.clientY; drag.at = e.timeStamp;
    const max = full();
    let next = drag.base - dy;
    if (next > max) next = max + band(next - max, max || 200);
    setH(next);
    e.preventDefault();
  }
  function up(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const was = drag; drag = null;
    if (!was.live) return;
    swallowClick = true;                      // the drag was the gesture, not a tap
    setTimeout(() => { swallowClick = false; }, 0);
    const landing = h - project(was.v);
    settle(landing > full() / 2);
  }

  if (now && grab && drawer && card) {
    for (const target of [now, drawer]) target.addEventListener("pointerdown", down);
    // The rest of a drag is heard from the window: a quick pull leaves the bar
    // before the first move arrives, and the bar would never hear it.
    addEventListener("pointermove", move, { passive: false });
    addEventListener("pointerup", up);
    addEventListener("pointercancel", up);
    // A drag that ended on the big button must not also open the station list.
    now.addEventListener("click", (e) => { if (swallowClick) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);
    grab.addEventListener("click", (e) => { e.stopPropagation(); toggleDrawer(e.detail === 0); });
    info?.addEventListener("click", (e) => { e.stopPropagation(); if (nowCh) openInRail(nowCh); });
    window.auralfm.onPlayerState?.((st) => {
      const ch = st?.channel || null;
      const changed = (ch?.id ?? null) !== (nowCh?.id ?? null);
      nowCh = ch;
      // Nothing to say about a shortwave receiver or a station you added yourself.
      grab.hidden = !ch || !!ch.sdr || String(ch.id).startsWith("my:");
      if (info) info.hidden = grab.hidden;
      if (grab.hidden) { if (isOpen) settle(false); return; }
      // A new station while the card is up: the card becomes that station's.
      if (changed) { painted = null; if (isOpen) fill(); }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && isOpen) { e.preventDefault(); settle(false); grab.focus(); }
    });
    addEventListener("resize", () => { if (isOpen) setH(full()); else if (!drawer.hidden) setH(0); });
    say();
  }

  // eslint-disable-next-line no-global-assign
  renderStations = (...args) => {
    draw(...args);
    const byId = new Map((selection?.channels || []).map((c) => [String(c.id), c]));
    for (const row of stationListEl.querySelectorAll(".st[data-id]")) {
      const ch = byId.get(row.dataset.id);
      if (!ch || ch.mine || row.querySelector(".pinfo")) continue;
      const btn = el("button", "pinfo", "i");
      btn.type = "button";
      btn.setAttribute("aria-label", `${t("profile.about", "About this station")}: ${ch.title}`);
      btn.setAttribute("aria-expanded", "false");
      btn.onclick = (e) => { e.stopPropagation(); toggle(row, ch, btn); };
      row.querySelector(".star")?.before(btn);
    }
  };
}
