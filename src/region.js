/**
 * Where the listener is, for one rule: in the UK and the EU (and the EEA, whose
 * copyright law is the EU's), music stations from other countries are held back.
 *
 * Why: Warner Music v TuneIn [2021] EWCA Civ 441. A station licensed in its own
 * country is not thereby licensed for listeners somewhere else, and an index
 * that makes it easy for them to reach it needs a licence there itself. TuneIn
 * answered by holding back foreign stations in the UK; this is the same answer
 * (Melton, 26 Sept: option 3 of docs/LEGAL-AND-SECURITY.md §9), until PPL, PRS
 * and a lawyer say otherwise. What stays open there: the listener's own
 * country's stations, and talk, news, sport and faith from anywhere (the
 * bundle's speech slot, scripts/lib/match.mjs). Everywhere else, nothing
 * changes.
 *
 * Where the listener is comes from the device's time zone, never from an IP
 * address or a server: nothing leaves the device to work it out. It is a guess
 * — a traveller keeps their home clock, a VPN changes nothing — and it errs one
 * way only: a zone outside these countries is never held back.
 *
 * A "country" here is a list of the catalogue's own country names, because the
 * catalogue files some parts of a country separately: Portugal's Azores and
 * Madeira, France's overseas departments.
 */

// Catalogue country names for each listener country (the first is its name).
const HOMES = {
  GB: ["United Kingdom", "Bailiwick of Jersey", "Bailiwick of Guernsey", "Isle of Man"],
  AT: ["Austria"], BE: ["Belgium"], BG: ["Bulgaria"], HR: ["Croatia"], CY: ["Cyprus"], CZ: ["Czechia"],
  DK: ["Denmark"], EE: ["Estonia"], FI: ["Finland", "Åland Islands"],
  FR: ["France", "Guadeloupe", "Martinique", "French Guiana", "Réunion", "Mayotte", "Collectivity of Saint Martin"],
  DE: ["Germany"], GR: ["Greece"], HU: ["Hungary"], IE: ["Ireland"], IT: ["Italy"], LV: ["Latvia"],
  LT: ["Lithuania"], LU: ["Luxembourg"], MT: ["Malta"], NL: ["Netherlands"], PL: ["Poland"],
  PT: ["Portugal", "Azores", "Madeira"], RO: ["Romania"], SK: ["Slovakia"], SI: ["Slovenia"], ES: ["Spain"],
  SE: ["Sweden"], NO: ["Norway"], IS: ["Iceland"], LI: ["Liechtenstein"],
};

// IANA time zones (and their old aliases) → listener country.
const ZONES = {
  "Europe/London": "GB", "Europe/Belfast": "GB", "GB": "GB", "GB-Eire": "GB",
  "Europe/Jersey": "GB", "Europe/Guernsey": "GB", "Europe/Isle_of_Man": "GB",
  "Europe/Vienna": "AT", "Europe/Brussels": "BE", "Europe/Sofia": "BG", "Europe/Zagreb": "HR",
  "Asia/Nicosia": "CY", "Asia/Famagusta": "CY", "Europe/Nicosia": "CY", "Europe/Prague": "CZ",
  "Europe/Copenhagen": "DK", "Europe/Tallinn": "EE", "Europe/Helsinki": "FI", "Europe/Mariehamn": "FI",
  "Europe/Paris": "FR", "America/Guadeloupe": "FR", "America/Martinique": "FR", "America/Cayenne": "FR",
  "Indian/Reunion": "FR", "Indian/Mayotte": "FR", "America/Marigot": "FR",
  "Europe/Berlin": "DE", "Europe/Busingen": "DE", "Europe/Athens": "GR", "Europe/Budapest": "HU",
  "Europe/Dublin": "IE", "Eire": "IE", "Europe/Rome": "IT", "Europe/Riga": "LV", "Europe/Vilnius": "LT",
  "Europe/Luxembourg": "LU", "Europe/Malta": "MT", "Europe/Amsterdam": "NL", "Europe/Warsaw": "PL",
  "Poland": "PL", "Europe/Lisbon": "PT", "Portugal": "PT", "Atlantic/Azores": "PT", "Atlantic/Madeira": "PT",
  "Europe/Bucharest": "RO", "Europe/Bratislava": "SK", "Europe/Ljubljana": "SI",
  "Europe/Madrid": "ES", "Africa/Ceuta": "ES", "Atlantic/Canary": "ES", "Europe/Stockholm": "SE",
  "Europe/Oslo": "NO", "Arctic/Longyearbyen": "NO", "Atlantic/Reykjavik": "IS", "Iceland": "IS",
  "Europe/Vaduz": "LI",
};

/** The device's time zone, or "" when the runtime will not say. */
function deviceZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { return ""; }
}

/**
 * The listener's home for the rule, or null where nothing is held back:
 * { code, countries: Set<catalogue country name> }.
 */
function homeFor(zone = deviceZone()) {
  const code = ZONES[zone];
  return code ? { code, countries: new Set(HOMES[code]) } : null;
}

module.exports = { homeFor, deviceZone, HOMES, ZONES };
