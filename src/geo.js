/**
 * Great-circle distance, and how to say it.
 *
 * The maths was already in this codebase twice, in `presence-nostr.js` for
 * choosing relays near a cell and in `sdr.js` for ranking receivers near a
 * place. A third copy for the listening history would have been the point at
 * which nobody could change the constant with confidence, so it lives here now
 * and those two call it.
 *
 * Spherical rather than flat, because the errors are not small: Reykjavik to
 * Wellington is about 17,000 km, and Euclidean geometry on latitude and
 * longitude treated as a plane gets that wrong by thousands of kilometres. The
 * Earth's mean radius is 6,371 km, which is itself an approximation of an
 * oblate spheroid, and is accurate enough that nothing in this app can tell.
 */

const R_KM = 6371;
const KM_PER_MILE = 1.609344;

/** Distance in kilometres between two points given in degrees. */
function haversine(aLat, aLon, bLat, bLon) {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLon = (bLon - aLon) * rad;
  const h = Math.sin(dLat / 2) ** 2 +
            Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Which unit to show.
 *
 * "system" asks the operating system rather than guessing from a country list.
 * `Intl.Locale.prototype.getMeasurementSystem` answers it directly where it
 * exists, and the fallback is the three locales that actually use miles for
 * road distance. Liberia and Myanmar are in that list because they are, not to
 * be exhaustive about a trivia question.
 */
function resolveUnits(pref, locale) {
  if (pref === "km" || pref === "mi") return pref;
  try {
    const l = new Intl.Locale(locale);
    const m = l.getMeasurementSystem?.();
    if (m) return m === "uksystem" || m === "ussystem" ? "mi" : "km";
  } catch { /* older runtime, fall through */ }
  return /^(en-US|en-GB|en-LR|my)\b/i.test(locale || "") ? "mi" : "km";
}

/**
 * A distance a person would say out loud.
 *
 * Rounded hard on purpose. "1,247 km" implies a precision this does not have:
 * the coordinates are a transmitter's published location, or a place centroid,
 * and neither is where the listener is. Two significant figures is honest.
 */
function format(km, units) {
  const v = units === "mi" ? km / KM_PER_MILE : km;
  const u = units === "mi" ? "mi" : "km";
  if (v < 1) return `under 1 ${u}`;
  const rounded = v < 10 ? Math.round(v)
                : v < 1000 ? Math.round(v / 10) * 10
                : Math.round(v / 100) * 100;
  return `${rounded.toLocaleString()} ${u}`;
}

/**
 * Is this a coordinate that exists?
 *
 * The shape a bad or substituted feed takes is not usually a clever lie: it is
 * NaN, a null that became zero, or a longitude of 400. Both live position feeds
 * in this app come from somebody else's server, and one of them has no HTTPS at
 * all, so the answer is checked rather than assumed.
 *
 * 0,0 is rejected on purpose. It is a real place in the Gulf of Guinea and
 * nothing this app tracks is ever there, so in practice it means a parse that
 * produced two zeroes.
 */
function onEarth(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) &&
         Math.abs(lat) <= 90 && Math.abs(lng) <= 180 &&
         !(lat === 0 && lng === 0);
}

module.exports = { haversine, resolveUnits, format, onEarth, R_KM, KM_PER_MILE };
