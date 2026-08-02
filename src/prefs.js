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
};

function normalize(saved = {}) {
  const out = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) {
    if (typeof saved[k] === "string") out[k] = saved[k];
  }
  return out;
}

module.exports = { DEFAULTS, normalize };
