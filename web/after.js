/**
 * Loaded after Explore's own parts and before explore.js starts them.
 *
 * On the desktop a headline opens in a reader: the main process fetches the
 * article and strips it to text. A web page cannot fetch another site's article,
 * so on the web a headline opens where it was published, in a new tab. The
 * headline rows call the global openReader() when they are chosen, so this
 * replaces it; nothing else in Explore changes.
 */
// eslint-disable-next-line no-global-assign
openReader = (item) => {
  if (item?.link) window.auralfm.openLink(item.link);
};
