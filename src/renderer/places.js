/**
 * A place's name as people say it.
 *
 * A station that gave only its country lives at "Across the United States",
 * and every list and test keys off that title, so the title stays. Shown, it
 * is the country: "United States", said the way people say it. Only the
 * country itself; "Across Texas" and "Online, no country" keep their titles.
 *
 * The same rule as plainName in src/catalog.js, here because a station saved
 * before that existed (a favourite, the last station played) carries only its
 * place's title. npm run audit holds the two to the same answers.
 *
 * Loaded by every page, after errors.js; the web bridge calls it as well.
 */
(() => {
  const plainPlace = (title, country) => {
    const m = /^(?:Across|Somewhere in) (?:the )?(.+)$/.exec(String(title || ""));
    return m && country && m[1] === country ? country : String(title || "");
  };
  /** "Town · Country", with the country said once: never "United States · United States". */
  const placeLine = (title, country, sep = " · ") => {
    const name = plainPlace(title, country);
    return [name, name === country ? "" : country].filter(Boolean).join(sep);
  };
  window.plainPlace = plainPlace;
  window.placeLine = placeLine;
})();
