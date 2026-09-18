/**
 * Shared by Explore and the menu-bar popover, loaded before either window's own
 * scripts. One copy, because the point of it is that no row gets half of it.
 */
/**
 * Make a clickable row work from the keyboard too.
 *
 * Most rows in Explore were divs with an onclick: a mouse could pick a station,
 * a place or a headline and a keyboard could not reach any of them, so without
 * a pointer there was no way to play anything. The popover's favourites had the
 * same gap. Three row kinds already did this by hand (suggestions, frequency
 * results, bands); this is that pattern once, so the next row cannot forget half
 * of it.
 *
 * `focusEl` is for rows that hold buttons of their own. A station row carries a
 * star and sometimes a remove button, and a button inside a button is its own
 * accessibility error, so there the name area takes focus and the row keeps the
 * click. Keys are only taken when the focus target itself has them, so Enter on
 * the star does not also play the station.
 */
function activatable(el, go, focusEl = el) {
  focusEl.setAttribute("role", "button");
  focusEl.tabIndex = 0;
  el.addEventListener("click", go);
  focusEl.addEventListener("keydown", (e) => {
    if (e.target !== focusEl || (e.key !== "Enter" && e.key !== " ")) return;
    e.preventDefault();
    // The row has used the key. Without this a Space on a popover row also
    // reached the panel's own Space shortcut, which toggled play straight after
    // the row had tuned — pausing or re-tuning what was just picked.
    e.stopPropagation();
    go(e);
  });
  return el;
}
