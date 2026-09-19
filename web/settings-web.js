/**
 * Settings on the web: only what this version can honour.
 *
 * Two things are hidden. The app icon changes the Mac's Dock icon, which a
 * browser does not have. The durable identity keeps one key across sessions,
 * and the web version's promise is the opposite: every key goes with the site's
 * data. Hidden rather than removed, because settings.js binds to them at load.
 *
 * Inside the Settings sheet the page is marked `embedded`, so the sheet's own
 * header ("Settings", Done) replaces the page's title.
 */
(() => {
  if (window.parent !== window) document.documentElement.classList.add("embedded");

  const hide = (el) => el?.setAttribute("hidden", "");

  addEventListener("DOMContentLoaded", () => {
    hide(document.querySelector('h2[data-i18n="set.appIcon"]')?.closest("section"));

    // The durable identity's card, and the paragraph that explains it.
    hide(document.getElementById("durableIdentity")?.closest(".card"));
    hide(document.querySelector('[data-i18n="set.durableHint"]'));
    // Wording that is about the Mac — the privacy promise among it — comes from
    // the bridge's web strings (WEB_EN in web/bridge.js), through the page's own
    // translation pass.
  });
})();
