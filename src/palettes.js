/**
 * Colour schemes.
 *
 * Deliberately original, and deliberately not named after anybody else's.
 *
 * The obvious move was to ship the well-known terminal palettes — Catppuccin,
 * Dracula, Nord, Gruvbox. They are MIT licensed so it would be lawful, and it
 * would still be wrong: a paid tier whose whole value is other people's unpaid
 * design work is a bad trade for the small revenue it would earn, Dracula sells
 * its own PRO edition so we would be competing with the author, and those
 * communities have expectations about the use of their names that a purchase
 * menu does not meet. Borrowing the *aesthetic* costs nothing and owes nobody.
 *
 * There is also a product reason. A terminal theme recolours text on a
 * background, and a terminal is almost entirely those two things. GlobeFM is a
 * photoreal Earth: the dominant surface is real satellite imagery, and
 * recolouring it would destroy the exact property the app is built on. So a
 * palette here touches the things around the planet, not the planet.
 *
 * Five surfaces, and the station dots are the one that actually reads as a
 * theme from across the room — there are seven hundred of them.
 */

const PALETTES = [
  {
    id: "onair",
    name: "On Air",
    free: true,
    accent: "#30D158",      // systemGreen — where GlobeFM started
    accentLight: "#248A3D",
    dot: "#5ef08a",
    rx: "#ffb340",
    atmosphere: "#8ab4f8",
    star: "#FFD60A",
  },
  {
    id: "nightearth",
    name: "Night Earth",
    free: true,
    // The blue of city lights seen from orbit, which is what the globe mostly is.
    accent: "#5AC8F5",
    accentLight: "#0071A4",
    dot: "#7fd6ff",
    rx: "#ffcf70",
    atmosphere: "#6fa8ff",
    star: "#DCE7FF",
  },
  {
    id: "ember",
    name: "Ember",
    free: true,
    // Terminator warmth — the band of sunrise the day/night shader already draws.
    accent: "#FF9F0A",
    accentLight: "#B25E00",
    dot: "#ffc46b",
    rx: "#7ee0ff",          // inverted, so receivers stay unmistakably other
    atmosphere: "#ff9d6b",
    star: "#FFE9B0",
  },
  {
    id: "deepfield",
    name: "Deep Field",
    free: false,
    accent: "#BF7FFF",
    accentLight: "#7A3BC4",
    dot: "#d6a8ff",
    rx: "#8fe8b0",
    atmosphere: "#a98cff",
    star: "#F0E4FF",
  },
  {
    id: "ionosphere",
    name: "Ionosphere",
    free: false,
    // Aurora green over the polar night; the shortwave palette.
    accent: "#2AE8B0",
    accentLight: "#00795C",
    dot: "#6ff3d0",
    rx: "#ff9ecb",
    atmosphere: "#57e0c4",
    star: "#CFFFF2",
  },
  {
    id: "shortwave",
    name: "Shortwave",
    free: false,
    // Dial glow: the amber of a lit tuning scale on a valve receiver.
    accent: "#E8B04B",
    accentLight: "#8A5D00",
    dot: "#f2cc7d",
    rx: "#ff8f5e",
    atmosphere: "#d9a760",
    star: "#FFF0C9",
  },
];

const DEFAULT_ID = "onair";

const byId = (id) => PALETTES.find((p) => p.id === id) || PALETTES[0];

/**
 * What the user may actually apply.
 *
 * Locked palettes are still listed — hiding them would make the picker look
 * complete when it is not — but they cannot be selected until #15 decides
 * whether GlobeFM is monetised at all. Until then `unlocked` is simply true for
 * everything, so nothing is taken away from anyone while the question is open.
 */
function list(entitled = true) {
  return PALETTES.map((p) => ({
    id: p.id, name: p.name, free: p.free,
    unlocked: p.free || entitled,
    swatch: [p.accent, p.dot, p.rx],
  }));
}

module.exports = { PALETTES, DEFAULT_ID, byId, list };
