"use strict";
/**
 * The desktop's copy of the hidden list (src/unlisted.js says what it is).
 *
 * The list ships with the app and is read again from listen.auralfm.xyz, so a
 * takedown does not wait for a release and a restored show does not either.
 * Asked for only when a show is on air to be listed (explore-shows.js), at
 * most every half hour, and it carries nothing but the request itself. If the
 * address does not answer, the last good list stands.
 */
const { UA } = require("./useragent");
const unlisted = require("./unlisted");

const URL = "https://listen.auralfm.xyz/data/hidden-shows.json";
const EVERY_MS = 30 * 60 * 1000;
let keys = unlisted.read(require("../data/hidden-shows.json")) || [];
let asked = 0;

async function get() {
  if (Date.now() - asked < EVERY_MS) return keys;
  asked = Date.now();
  try {
    const res = await fetch(URL, { headers: { "User-Agent": UA }, cache: "no-store", signal: AbortSignal.timeout(8000) });
    const next = res.ok ? unlisted.read(await res.json()) : null;
    if (next) keys = next;
  } catch { /* offline, or not answering: the last good list stands */ }
  return keys;
}

module.exports = { get };
