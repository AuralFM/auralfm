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
 * background, and a terminal is almost entirely those two things. AuralFM is a
 * photoreal Earth: the dominant surface is real satellite imagery, and
 * recolouring it would destroy the exact property the app is built on. So a
 * palette here touches the things around the planet, not the planet.
 *
 * Five surfaces, and the station dots are the one that actually reads as a
 * theme from across the room — there are seven hundred of them.
 */

const PALETTES = [
  {
    id: "onyx",
    name: "Onyx",
    free: true,
    /**
     * The brand. Onyx and bone.
     *
     * Bone rather than white, because white is what every system accent already
     * is — bone is warm and slightly soft, and it is what stops the app looking
     * like it borrowed its colours from the OS. Onyx is not flat black either;
     * real onyx has depth, which is why the icon's background is a gradient
     * rather than a fill.
     *
     * The receiver dots stay brass rather than going bone too: an antenna is not
     * a place, and the whole point of two dot colours is that you can tell them
     * apart at a glance across seven hundred of them.
     */
    accent: "#E9E2D4",
    accentLight: "#2A2622",
    dot: "#EDE6D8",
    rx: "#C9A227",
    atmosphere: "#9A9188",
    star: "#F5F0E4",
  },
  {
    id: "onair",
    name: "On Air",
    free: true,
    accent: "#30D158",      // systemGreen — where AuralFM started
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

/**
 * Onyx leads. On Air is kept because it is where the app started and some people
 * will prefer it, but the identity is onyx and bone now.
 */
const DEFAULT_ID = "onyx";

const byId = (id) => PALETTES.find((p) => p.id === id) || PALETTES[0];

/**
 * What the user may actually apply.
 *
 * Locked palettes are still listed — hiding them would make the picker look
 * complete when it is not — but they cannot be selected until #15 decides
 * whether AuralFM is monetised at all. Until then `unlocked` is simply true for
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
