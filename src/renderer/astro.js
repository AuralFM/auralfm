/**
 * Where the planets are.
 *
 * The sky in GlobeFM is real — 5,044 catalogued stars and 89 constellation
 * figures from the Yale Bright Star Catalog — but until now it was missing the
 * five objects most people can actually name. If Jupiter is up over Marfa
 * tonight, it should be up over Marfa in the app.
 *
 * Uses JPL's Keplerian elements for approximate positions of the major planets,
 * the set fitted for 1800–2050 with linear rates per century. Accurate to a few
 * arcminutes for the naked-eye planets over that span, which is far finer than a
 * 4096-pixel sky canvas can express — the same standard the existing lunar
 * position is held to.
 *
 * Deliberately no perturbation terms. Jupiter and Saturn's mutual perturbation
 * is the largest omission and it is still under a tenth of a degree here; adding
 * it would be several times the code for a correction smaller than the dot.
 *
 * Plain script so Node can load it for tests, same as kiwi.js.
 */
(function (root) {
  "use strict";

  const RAD = Math.PI / 180;
  const OBLIQUITY = 23.43928;              // J2000 mean obliquity of the ecliptic

  /**
   * a (AU), e, I (deg), L (deg), longitude of perihelion, longitude of ascending
   * node — each followed by its rate per Julian century. Earth is carried as the
   * Earth–Moon barycentre, which is what the geocentric subtraction needs.
   */
  const ELEMENTS = {
    Mercury: {
      a: [0.38709927, 0.00000037], e: [0.20563593, 0.00001906],
      I: [7.00497902, -0.00594749], L: [252.25032350, 149472.67411175],
      peri: [77.45779628, 0.16047689], node: [48.33076593, -0.12534081],
      H: -0.42, colour: "#d8cbbf",
    },
    Venus: {
      a: [0.72333566, 0.00000390], e: [0.00677672, -0.00004107],
      I: [3.39467605, -0.00078890], L: [181.97909950, 58517.81538729],
      peri: [131.60246718, 0.00268329], node: [76.67984255, -0.27769418],
      H: -4.40, colour: "#fdf3d8",
    },
    Earth: {
      a: [1.00000261, 0.00000562], e: [0.01671123, -0.00004392],
      I: [-0.00001531, -0.01294668], L: [100.46457166, 35999.37244981],
      peri: [102.93768193, 0.32327364], node: [0.0, 0.0],
    },
    Mars: {
      a: [1.52371034, 0.00001847], e: [0.09339410, 0.00007882],
      I: [1.84969142, -0.00813131], L: [-4.55343205, 19140.30268499],
      peri: [-23.94362959, 0.44441088], node: [49.55953891, -0.29257343],
      H: -1.52, colour: "#e2795b",
    },
    Jupiter: {
      a: [5.20288700, -0.00011607], e: [0.04838624, -0.00013253],
      I: [1.30439695, -0.00183714], L: [34.39644051, 3034.74612775],
      peri: [14.72847983, 0.21252668], node: [100.47390909, 0.20469106],
      H: -9.40, colour: "#e8d7b8",
    },
    Saturn: {
      a: [9.53667594, -0.00125060], e: [0.05386179, -0.00050991],
      I: [2.48599187, 0.00193609], L: [49.95424423, 1222.49362201],
      peri: [92.59887831, -0.41897216], node: [113.66242448, -0.28867794],
      H: -8.88, colour: "#e6d9a8",
    },
  };

  const NAKED_EYE = ["Mercury", "Venus", "Mars", "Jupiter", "Saturn"];

  const wrap360 = (d) => ((d % 360) + 360) % 360;
  const wrap180 = (d) => { const w = wrap360(d); return w > 180 ? w - 360 : w; };

  const julianCenturies = (date) =>
    ((date.getTime() / 86400000 + 2440587.5) - 2451545.0) / 36525;

  /**
   * Kepler's equation, solved in degrees as JPL specifies. Six iterations is
   * ample: the naked-eye planets are all under e=0.21, where this converges to
   * well below a millidegree in three.
   */
  function eccentricAnomaly(M, e) {
    const eStar = e / RAD;                     // e in degrees, per JPL's method
    let E = M + eStar * Math.sin(M * RAD);
    for (let i = 0; i < 6; i++) {
      const dM = M - (E - eStar * Math.sin(E * RAD));
      E += dM / (1 - e * Math.cos(E * RAD));
    }
    return E;
  }

  /** Heliocentric ecliptic rectangular coordinates, in AU. */
  function heliocentric(name, T) {
    const el = ELEMENTS[name];
    const at = (p) => p[0] + p[1] * T;
    const a = at(el.a), e = at(el.e), I = at(el.I);
    const L = at(el.L), peri = at(el.peri), node = at(el.node);

    const omega = peri - node;                       // argument of perihelion
    const M = wrap180(L - peri);
    const E = eccentricAnomaly(M, e);

    // In the orbital plane, perihelion along +x.
    const xo = a * (Math.cos(E * RAD) - e);
    const yo = a * Math.sqrt(1 - e * e) * Math.sin(E * RAD);

    const cw = Math.cos(omega * RAD), sw = Math.sin(omega * RAD);
    const cn = Math.cos(node * RAD), sn = Math.sin(node * RAD);
    const ci = Math.cos(I * RAD), si = Math.sin(I * RAD);

    return {
      x: (cw * cn - sw * sn * ci) * xo + (-sw * cn - cw * sn * ci) * yo,
      y: (cw * sn + sw * cn * ci) * xo + (-sw * sn + cw * cn * ci) * yo,
      z: (sw * si) * xo + (cw * si) * yo,
    };
  }

  /** Ecliptic rectangular -> right ascension / declination, plus distance. */
  function toEquatorial(v) {
    const ce = Math.cos(OBLIQUITY * RAD), se = Math.sin(OBLIQUITY * RAD);
    const x = v.x;
    const y = ce * v.y - se * v.z;
    const z = se * v.y + ce * v.z;
    const dist = Math.hypot(x, y, z);
    return {
      ra: wrap360(Math.atan2(y, x) / RAD),
      dec: Math.asin(z / dist) / RAD,
      dist,
    };
  }

  /**
   * The Sun, seen from Earth. Exposed because it is the cheapest possible check
   * that the whole chain is right: its declination must match the sub-solar
   * latitude the globe already computes by a completely different route.
   */
  function sun(date = new Date()) {
    const T = julianCenturies(date);
    const e = heliocentric("Earth", T);
    return toEquatorial({ x: -e.x, y: -e.y, z: -e.z });
  }

  /**
   * @returns {Array<{name, ra, dec, dist, elongation, mag, colour}>}
   *   ra/dec in degrees, dist in AU from Earth, elongation in degrees from the Sun.
   */
  function planets(date = new Date()) {
    const T = julianCenturies(date);
    const earth = heliocentric("Earth", T);
    const sunPos = toEquatorial({ x: -earth.x, y: -earth.y, z: -earth.z });
    const sunDist = Math.hypot(earth.x, earth.y, earth.z);

    return NAKED_EYE.map((name) => {
      const h = heliocentric(name, T);
      const geo = { x: h.x - earth.x, y: h.y - earth.y, z: h.z - earth.z };
      const eq = toEquatorial(geo);
      const r = Math.hypot(h.x, h.y, h.z);       // heliocentric distance

      // Angle between the planet and the Sun as seen from Earth.
      const cosEl = Math.cos(eq.dec * RAD) * Math.cos(sunPos.dec * RAD) *
                    Math.cos((eq.ra - sunPos.ra) * RAD) +
                    Math.sin(eq.dec * RAD) * Math.sin(sunPos.dec * RAD);
      const elongation = Math.acos(Math.max(-1, Math.min(1, cosEl))) / RAD;

      // Apparent magnitude without the phase term. Fine for sizing a dot on a
      // 4096px sky; it overstates Venus and Mercury near inferior conjunction,
      // when they are lost in the Sun's glare anyway.
      const mag = ELEMENTS[name].H + 5 * Math.log10(Math.max(1e-6, r * eq.dist));

      return { name, ra: eq.ra, dec: eq.dec, dist: eq.dist, elongation, mag,
               colour: ELEMENTS[name].colour, sunDist };
    });
  }

  root.Astro = { planets, sun, heliocentric, toEquatorial, julianCenturies, NAKED_EYE };
})(typeof globalThis !== "undefined" ? globalThis : this);
