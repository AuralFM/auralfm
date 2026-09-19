/**
 * Satellites for AuralFM on the web: the desktop's src/satellites.js, bundled
 * with its satellite.js dependency. Its two-line-element cache lives in this
 * browser's localStorage (web/shims/fs.js) instead of the app's data folder, so
 * orbits are fetched from CelesTrak at most as often as the desktop fetches them.
 */
const satellites = require("../src/satellites.js");

satellites.init("/auralfm-web");
window.AuralLive = { satellites };
