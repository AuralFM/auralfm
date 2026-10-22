/**
 * The ticker: one line across the top of the web app, in the website's colours.
 *
 * The app and auralfm.xyz were built apart and looked it — the app like an Apple
 * utility, the site like a poster. This is the bridge between them: the site's
 * aqua, its uppercase and its bracketed voice, running above the app's own
 * toolbar in the app's own typeface (which never changes), and every item a way
 * back to the site: what is new, the Journal, the waitlists, the docs.
 *
 * Slow on purpose (about 40px a second), paused under the pointer or keyboard
 * focus, still for anyone who asked for reduced motion, and closable — closed,
 * it stays away for a week. Not on phones yet: the phone layout has no top bar
 * to sit above, and one is not added without being designed for it.
 */
{
  /**
   * auralfm.xyz and the Journal are behind a password while they are finished.
   * The web app is public, so a link there would land a listener on a sign-in
   * page. Items on those sites are held back until this is true.
   */
  const SITE_PUBLIC = false;
  const ITEMS = [
    { text: "Listen in." },
    { label: "Human curated", text: "Less algorithms. More humans. Human curated radio > algorithmic playlists." },
    { label: "New", text: "Vibes: pick one and every place that plays it lights up", href: "https://auralfm.xyz/vibes/", site: true },
    { label: "Journal", text: "Listening through someone else's antenna", href: "https://blog.auralfm.xyz/listening-through-someone-elses-antenna/", site: true },
    { label: "Desktop", text: "The fullest version is in private beta — join the waitlist", href: "https://auralfm.xyz/beta/", site: true },
    { label: "Sponsors", text: "Keep it independent — join the sponsorship waitlist", href: "https://auralfm.xyz/support/#waitlist", site: true },
    { label: "How it works", text: "The docs: vibes, headlines, chat and privacy", href: "https://docs.auralfm.xyz/" },
    { label: "iPhone", text: "Add AuralFM to your home screen", href: "https://docs.auralfm.xyz/#iphone" },
    { label: "Instagram", text: "Follow @auralfm.xyz: stations worth your ears, and the cards people post", href: "https://www.instagram.com/auralfm.xyz/" },
    { text: "No chart. No feed. Nobody paying to be heard." },
  ].filter((it) => SITE_PUBLIC || !it.site);

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
    // The loop's length is one copy's width, at a steady 40px a second.
    requestAnimationFrame(() => {
      const w = run.firstChild.getBoundingClientRect().width;
      run.style.setProperty("--ticker-w", `${w}px`);
      run.style.setProperty("--ticker-s", `${Math.max(20, w / 40)}s`);
    });
  }
}
