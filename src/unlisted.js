"use strict";
/**
 * Which hosts AuralFM no longer lists, read from data/hidden-shows.json.
 *
 * The Terms say AuralFM "can hide a show from the apps, for a report or a
 * breach of these terms", and that it removes what a valid copyright notice
 * identifies. Until 8 Oct 2026 there was nothing to do that with. This is the
 * switch: a host on the list is not on the globe, not in On air, and cannot be
 * tuned to from AuralFM's apps.
 *
 * What it is not. The sound goes from the host's device to the listener, so
 * this stops nothing at the source: it takes down our listing, which is the
 * part that is ours. And a host is known by the key their show was announced
 * with. A host with no lasting identity gets a new key each session, so for
 * them a hiding lasts until they restart.
 *
 * Kept strict on purpose: anything that is not a well-formed entry is ignored,
 * so a damaged file hides nobody by accident and unhides nobody either (the
 * caller keeps its last good list when this returns null).
 */
const KEY = /^[0-9a-f]{64}$/;

/** The hidden hosts' keys, or null when the file is not one of ours. */
function read(json, now = Date.now()) {
  if (!json || json.v !== 1 || !Array.isArray(json.hosts)) return null;
  const keys = [];
  for (const h of json.hosts) {
    const key = String(h?.key || "").toLowerCase();
    if (!KEY.test(key)) continue;
    // "until" is the last day of a hiding with an end.
    if (h.until && !(Date.parse(`${h.until}T23:59:59Z`) > now)) continue;
    keys.push(key);
  }
  return keys;
}

module.exports = { read };
