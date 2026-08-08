/**
 * Put the mark on the splash.
 *
 * Inline, and fetched rather than pasted: one copy of the artwork lives in
 * `assets/icon-line.svg`, and this is the cheapest page in the app so it does
 * not get a second file to load.
 *
 * An `<img>` would not do. The file is drawn in `currentColor` precisely so it
 * takes the palette, and an image element has no palette to take — it would
 * render black on black.
 *
 * Nothing here is allowed to be a reason the app does not start. If the fetch
 * fails the splash is onyx and a wordmark, which is a perfectly good splash.
 */
(async () => {
  try {
    const res = await fetch("../../assets/icon-line.svg");
    if (res.ok) document.getElementById("mark").innerHTML = await res.text();
  } catch { /* onyx and a wordmark is enough */ }
})();
