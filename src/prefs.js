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
  /**
   * Help tags, on by default.
   *
   * On because somebody who has just opened a globe made of thirty-eight
   * thousand radio stations has questions, and off because somebody who has used
   * it for a month does not. When off, the `title` attributes go back on the
   * elements, so the system's own help tags still work for anyone who wants
   * them — off means "not ours", not "no help at all".
   */
  tips: true,
  /**
   * The name other listeners see, if you want one.
   *
   * Empty by default, which shows eight characters of a public key instead —
   * true, and anonymous. A nickname is a choice to be recognisable, and it is not
   * an account: nothing verifies it, two people can pick the same one, and it
   * lasts exactly as long as the key it travels with.
   */
  nickname: "",
  /**
   * Hide message text until the chat panel is open.
   *
   * BitChat has this for shoulder-surfing, and it applies here for the same
   * reason: the panel sits over a globe somebody may be showing to a room.
   */
  hidePreviews: false,
  /**
   * Keep one identity across sessions, so people can favorite and verify you.
   *
   * **Off, and it should stay off unless somebody wants what it buys.** Every
   * other key in this app is generated per area, per launch, and never written
   * down, which is why presence here is not a location trail. This one is
   * written to disk and does not change, so anyone watching relays can tell that
   * the identity which received a message on Tuesday received another on Friday.
   *
   * What it buys is the only thing that cannot be had without it: a fingerprint
   * worth comparing in person, and a favorite that still means something
   * tomorrow. Verifying a key that expires in an hour is theatre.
   *
   * Scope is narrow on purpose. It is used for private messages only. Presence
   * announcements keep using the ephemeral per-area keys, so turning this on does
   * not put a stable key on the globe and does not make the places you listen to
   * linkable to each other. See [identity.js] for the key's own handling.
   */
  durableIdentity: false,
  /**
   * Hide messages containing terms on the word list. On by default.
   *
   * On rather than off because the chat is a public channel on relays nobody
   * here controls, and a filter that ships switched off is a filter that exists
   * for a review checklist rather than for a person. The list is editable and
   * every term in it can be deleted — see [safety.js].
   */
  filterChat: true,
  /**
   * Show nothing from anyone who is not a mutual contact. Off by default.
   *
   * The strongest tool available in a design with no server, and the honest
   * answer to determined abuse: a word list can be worked around in an
   * afternoon, and being a stranger cannot. Off by default because switching it
   * on turns an open channel into a closed one, which is the right choice for
   * some people and the wrong default for a network whose whole appeal is
   * hearing from somewhere you have never been.
   */
  onlyKept: false,
  /**
   * Whether the plain warning about what this channel is has been read.
   *
   * Shown once, the first time the chat appears. Not a legal disclaimer and not
   * a EULA gate — a sentence saying nobody moderates this, because somebody
   * arriving in an open relay channel expecting a moderated room has been
   * misled by every other chat app they have used.
   */
  chatNoticeSeen: false,
  /**
   * Whether the first-run introduction has been shown.
   *
   * A flag rather than a counter: it runs once, and Settings can put it back to
   * false to run it again. Apple's guidance on onboarding is that a tour is the
   * weakest way to teach an interface, so this one is three steps, skippable at
   * every step, and never appears again on its own.
   */
  tourSeen: false,
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
