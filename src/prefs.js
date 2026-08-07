/**
 * User preferences.
 *
 * Kept separate from playback state (favourites, last station) because these are
 * things the user deliberately chose, and they should survive anything that
 * might reset playback.
 *
 * Every value defaults to "system" where macOS has an opinion — appearance and
 * contrast follow the OS until the user explicitly overrides them. Respecting
 * the system setting by default is the correct behaviour, not a cop-out.
 */

const DEFAULTS = {
  theme: "system",       // system | light | dark
  contrast: "system",    // system | more
  dotSize: "normal",     // normal | large
  language: "system",    // system | en | es
  palette: "onyx",       // see src/palettes.js
  /**
   * Which app icon to wear.
   *
   * Nothing to do with light and dark. It is a choice, the way the palette is,
   * and it follows nothing.
   *
   * Only the Dock icon changes. The one Finder shows is baked into the bundle
   * at build time and cannot be swapped while the app is running, which is a
   * macOS fact rather than a shortcut taken here.
   */
  appIcon: "onyx",       // onyx | bone | onair | earth
  /**
   * Distance units for the listening history.
   *
   * "system" asks the operating system rather than inferring from a country
   * list, because the two disagree for anyone who has ever moved.
   */
  units: "system",       // system | km | mi
  /**
   * Whether the first-run walkthrough has been seen.
   *
   * Boolean rather than a version number on purpose: a tour that reappears
   * because the app changed is a tour that has learned to interrupt people, and
   * every one of those is resented.
   */
  introSeen: false,
  /**
   * Presence is off, and has to stay off by default.
   *
   * Everything else in this app is a promise that nothing leaves the machine.
   * This is the one feature that sends something, so it is the one feature the
   * user has to reach for deliberately. A default of true would make the promise
   * a lie for anyone who never opened Settings.
   */
  presence: false,
  /**
   * Nostr relays the listener added themselves, tried ahead of ours.
   *
   * Here rather than buried in state because it is a *choice about who this app
   * talks to*, which is the kind of thing a privacy-first app should let someone
   * see and change. Empty means the shipped anchors plus whatever is
   * geographically near, which is what everyone gets today.
   */
  relays: [],
};

/**
 * Take only the keys we know about, and only when the saved value is the same
 * kind of thing as the default.
 *
 * This used to test `typeof saved[k] === "string"`, which was fine while every
 * preference was a string and silently discarded the first boolean one — the
 * presence switch appeared to work, wrote itself to disk, and came back false on
 * the very next read. Comparing against the default's own type fixes the whole
 * category rather than the one instance.
 */
function normalize(saved = {}) {
  const out = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) {
    if (typeof saved[k] === typeof DEFAULTS[k]) out[k] = saved[k];
  }
  return out;
}

module.exports = { DEFAULTS, normalize };
