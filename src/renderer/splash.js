/**
 * Put the mark on the splash.
 *
 * Inline, and fetched rather than pasted: one copy of the artwork lives in
 * `assets/mark.svg`, and this is the cheapest page in the app so it does not
 * get a second file to load.
 *
 * The mark is the brand's ring globe (the logo kit, exported from the design
 * file): an onyx disc with the globe knocked out of it. The disc stays onyx and
 * the globe is drawn in `currentColor`, so it takes the splash's bone.
 *
 * An `<img>` would not do. An image element has no colour to take — it would
 * render the file's own fills, and nothing here could tint it.
 *
 * Nothing here is allowed to be a reason the app does not start. If the fetch
 * fails the splash is onyx and a wordmark, which is a perfectly good splash —
 * and which is also why a missing mark went unnoticed when the old line globe
 * was deleted. scripts/audit.mjs now checks that the file this asks for ships.
 */
(async () => {
  try {
    const res = await fetch("../../assets/mark.svg");
    if (res.ok) document.getElementById("mark").innerHTML = await res.text();
  } catch { /* onyx and a wordmark is enough */ }
})();
