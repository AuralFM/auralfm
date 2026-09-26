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
    const lang = p.lang ? (/^[a-z]{2}(-[a-z]{2})?$/i.test(p.lang) ? p.lang.toLowerCase().split("-")[0]
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
    } else box.append(claimLine(ch));
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
    box.append(el("p", "pnone", t("profile.loading", "Looking…")));
    btn.setAttribute("aria-controls", box.id);
    btn.setAttribute("aria-expanded", "true");
    row.after(box);
    paint(box, await profileOf(ch.id), ch);
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
