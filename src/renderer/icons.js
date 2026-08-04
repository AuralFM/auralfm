/**
 * The icon set.
 *
 * The transport used to be built from whatever character was closest to hand —
 * 🔒 for the lock, 🔊 for the volume, ▶ and ❚❚ for the transport, ☆ for a
 * favourite. Two problems with that, and the second is the serious one.
 *
 * The colour emoji are Apple's artwork. They arrive with their own palette,
 * their own weight and their own idea of how much space they want, so a control
 * strip built from them can never be made to look designed — the padlock is
 * yellow, the speaker is grey-blue, and neither one cares what the accent colour
 * is. Next to a drawn glyph they look pasted in, because they are.
 *
 * And a text glyph is not an icon. It inherits the font's metrics, sits on a
 * baseline, and shifts when the font falls back — which is why the lock and the
 * play triangle never quite lined up.
 *
 * These are drawn here instead: one 24×24 grid, `currentColor` throughout, so
 * every icon takes the palette's colour, scales without blurring, and weighs
 * nothing. No font dependency, no licence question, and nothing to fall back to.
 *
 * SF Symbols would be the obvious alternative and is deliberately not used: its
 * licence governs where Apple's artwork may appear, and drawing eight simple
 * shapes is cheaper than reasoning about that every time the app is
 * distributed.
 */
(function (root) {
  const SVG = (body, extra = "") =>
    `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" ` +
    `stroke="currentColor" stroke-width="1.7" stroke-linecap="round" ` +
    `stroke-linejoin="round" aria-hidden="true" focusable="false" ${extra}>${body}</svg>`;

  const PATHS = {
    // Solid shapes, because a transport control should read as a button face
    // rather than an outline at 11px.
    play:  SVG(`<path d="M8 5.2 19 12 8 18.8Z" fill="currentColor" stroke-linejoin="round"/>`),
    pause: SVG(`<path d="M9 5.5v13M15 5.5v13" stroke-width="2.6"/>`),

    // The shackle lifts and shifts right when open — the movement is the whole
    // signal, and it reads at a glance in a way a colour change does not.
    lock:   SVG(`<rect x="5" y="10.5" width="14" height="9.5" rx="2.2"/>
                 <path d="M8.4 10.5V7.8a3.6 3.6 0 0 1 7.2 0v2.7"/>`),
    unlock: SVG(`<rect x="5" y="10.5" width="14" height="9.5" rx="2.2"/>
                 <path d="M8.4 10.5V7.8a3.6 3.6 0 0 1 7.2 0"/>`),

    // Three states, because volume is not a boolean and the middle one is where
    // most people leave it.
    volumeOff:  SVG(`<path d="M11 5.5 6.5 9.2H3.5v5.6h3L11 18.5Z" fill="currentColor"/>
                     <path d="M16 9.8l4.5 4.4M20.5 9.8L16 14.2"/>`),
    volumeLow:  SVG(`<path d="M11 5.5 6.5 9.2H3.5v5.6h3L11 18.5Z" fill="currentColor"/>
                     <path d="M14.6 9.6a3.4 3.4 0 0 1 0 4.8"/>`),
    volumeHigh: SVG(`<path d="M11 5.5 6.5 9.2H3.5v5.6h3L11 18.5Z" fill="currentColor"/>
                     <path d="M14.6 9.6a3.4 3.4 0 0 1 0 4.8M17.4 7.2a7 7 0 0 1 0 9.6"/>`),

    star:     SVG(`<path d="M12 4.2l2.42 4.9 5.41.79-3.92 3.81.93 5.39L12 16.55l-4.84 2.54.93-5.39L4.17 9.89l5.41-.79Z"/>`),
    starFill: SVG(`<path d="M12 4.2l2.42 4.9 5.41.79-3.92 3.81.93 5.39L12 16.55l-4.84 2.54.93-5.39L4.17 9.89l5.41-.79Z" fill="currentColor"/>`),

    headlines: SVG(`<rect x="3.5" y="5" width="17" height="14" rx="2.2"/>
                    <path d="M7 9.2h6M7 12.5h10M7 15.8h10"/>`),
    source:    SVG(`<circle cx="12" cy="12" r="7.2"/><circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none"/>`),
    external:  SVG(`<path d="M14 5h5v5M19 5l-8.4 8.4"/>
                    <path d="M18 14.2V18a1.8 1.8 0 0 1-1.8 1.8H6A1.8 1.8 0 0 1 4.2 18V7.8A1.8 1.8 0 0 1 6 6h3.8"/>`),
  };

  /**
   * Put an icon inside an element.
   *
   * Sets `innerHTML` from a fixed table rather than accepting markup, so this
   * can never become a way for a station name to inject anything.
   */
  function setIcon(el, name) {
    if (!el) return;
    const svg = PATHS[name];
    if (svg) el.innerHTML = svg;
  }

  root.Icons = { svg: (n) => PATHS[n] || "", set: setIcon, names: Object.keys(PATHS) };
})(typeof window !== "undefined" ? window : globalThis);
