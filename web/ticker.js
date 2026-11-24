/**
 * The ticker: one line across the top of the web app, in the brand's voice and
 * the listener's theme.
 *
 * The brand guide gives the ticker the name alone (Logo · Secondary) and Space
 * Mono for the line: capitals, open spacing, bracketed labels. It is painted
 * in the theme's colour, so it changes with the palette and with light and
 * dark like everything else the theme touches; its ink is whichever of onyx
 * and bone reads better on that colour, worked out from the colour itself.
 * Where neither reaches 4.5:1 (On Air's green in light mode gave 4.3), the
 * colour is deepened toward onyx, a step at a time, until bone does: the line
 * is 12px, and small type gets no allowance. Every item is a way back to the
 * sites: this week's picks, the Journal, the waitlists, the docs.
 *
 * Slow on purpose (about 40px a second), paused under the pointer or keyboard
 * focus, still for anyone who asked for reduced motion, and closable: closed,
 * it stays away for a week. Not on phones yet: the phone layout has no top bar
 * to sit above, and one is not added without being designed for it.
 */
{
  const ITEMS = [
    { name: true, text: "Every town, on air." },
    { label: "This week", text: "Seven stations, one from every part of the globe: the Friday picks", href: "https://auralfm.xyz/#picks" },
    { label: "Vibes", text: "Pick one and every place that plays it lights up", href: "https://auralfm.xyz/vibes/" },
    { label: "Journal", text: "Listening through someone else's antenna", href: "https://blog.auralfm.xyz/listening-through-someone-elses-antenna/" },
    { text: "Less algorithms. More humans." },
    { label: "Desktop", text: "Shortwave, your own stations and a player in the menu bar: join the waitlist", href: "https://auralfm.xyz/beta/" },
    { label: "Support", text: "Keep it independent: join the sponsorship waitlist", href: "https://auralfm.xyz/support/#waitlist" },
    { label: "iPhone", text: "Add AuralFM to your home screen", href: "https://docs.auralfm.xyz/#iphone" },
    { label: "How it works", text: "Vibes, headlines, chat and privacy, in the docs", href: "https://docs.auralfm.xyz/" },
    { label: "Instagram", text: "@auralfm.xyz: stations worth your ears", href: "https://www.instagram.com/auralfm.xyz/" },
    { text: "No chart. No feed. Nobody paying to be heard." },
  ];

  /**
   * Onyx or bone, whichever has more contrast on the theme's colour (WCAG's
   * relative luminance). Read from the page, so a palette or theme change is
   * followed without the ticker knowing how themes are made.
   */
  const lum = (rgb) => {
    const [r, g, b] = rgb.map((c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  const ONYX = lum([12, 11, 11]), BONE = lum([247, 244, 238]);
  // The theme's colour as it is set, not as painted: a colour read from the
  // bar mid-way through a change of theme gave the old ink to the new colour.
  const accent = () => {
    const v = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
    const hex = /^#([0-9a-f]{6})$/i.exec(v);
    if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16));
    const rgb = v.match(/[\d.]+/g);
    return rgb && rgb.length >= 3 ? rgb.slice(0, 3).map(Number) : null;
  };
  function ink(bar) {
    let c = accent();
    if (!c) return;
    let L = lum(c);
    if (Math.max(ratio(L, ONYX), ratio(L, BONE)) < 4.5) {
      for (let k = 0; k < 20 && ratio(L, BONE) < 4.5; k++) { c = c.map((x, i) => x + ([12, 11, 11][i] - x) * 0.08); L = lum(c); }
      bar.style.setProperty("--ticker-bg", `rgb(${c.map(Math.round).join(" ")})`);
    } else bar.style.removeProperty("--ticker-bg");
    bar.style.setProperty("--ticker-ink", ratio(L, ONYX) >= ratio(L, BONE) ? "#0C0B0B" : "#F7F4EE");
  }

  const KEY = "auralfm.tickerClosed";
  const WEEK = 7 * 864e5;
  const phone = matchMedia("(max-width: 700px), (pointer: coarse) and (max-height: 500px)").matches;
  let closed = 0;
  try { closed = Number(localStorage.getItem(KEY)) || 0; } catch { /* private mode */ }

  if (!phone && Date.now() - closed > WEEK) {
    const bar = document.createElement("aside");
    bar.className = "ticker";
    bar.setAttribute("aria-label", "AuralFM news");
    const run = document.createElement("div");
    run.className = "ticker-run";
    const line = (hidden) => {
      const ul = document.createElement("ul");
      if (hidden) { ul.setAttribute("aria-hidden", "true"); ul.inert = true; }
      for (const it of ITEMS) {
        const li = document.createElement("li");
        const inner = document.createElement(it.href ? "a" : "span");
        if (it.href) { inner.href = it.href; inner.target = "_blank"; inner.rel = "noopener"; }
        if (it.name) {
          const n = document.createElement("b");
          n.className = "ticker-name";
          n.textContent = "AURAL.FM";
          inner.append(n, " ");
        }
        if (it.label) {
          const b = document.createElement("b");
          b.textContent = `[ ${it.label} ]`;
          inner.append(b, " ");
        }
        inner.append(it.text);
        li.append(inner);
        ul.append(li);
      }
      return ul;
    };
    // Two copies, so the loop joins without a gap; the second is decoration.
    run.append(line(false), line(true));
    const x = document.createElement("button");
    x.type = "button";
    x.className = "ticker-x";
    x.setAttribute("aria-label", "Close the news bar for a week");
    x.textContent = "×";
    x.onclick = () => {
      bar.remove();
      try { localStorage.setItem(KEY, String(Date.now())); } catch { /* private mode */ }
      dispatchEvent(new Event("resize"));
    };
    bar.append(run, x);
    document.body.prepend(bar);
    // Its ink follows the theme: palettes and light or dark are set on <html>.
    ink(bar);
    new MutationObserver(() => ink(bar)).observe(document.documentElement, { attributes: true, attributeFilter: ["style", "data-theme", "class"] });
    matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => requestAnimationFrame(() => ink(bar)));
    // The loop's length is one copy's width, at a steady 40px a second.
    requestAnimationFrame(() => {
      const w = run.firstChild.getBoundingClientRect().width;
      run.style.setProperty("--ticker-w", `${w}px`);
      run.style.setProperty("--ticker-s", `${Math.max(20, w / 40)}s`);
    });
  }
}
