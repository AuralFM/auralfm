/**
 * The ionosphere, made visible.
 *
 * WSPR — Weak Signal Propagation Reporter — is a worldwide network of amateurs
 * transmitting tiny beacons at very low power and reporting everything they
 * hear. Every report is a complete statement about the sky: this transmitter,
 * in this grid square, was heard by this receiver, in that one, on this band, at
 * this signal-to-noise ratio, just now.
 *
 * Which means every report is an arc on a globe. AuralFM already shows where the
 * receivers are; this shows the paths actually open between them, which is the
 * entire reason shortwave is interesting. A signal leaving Rome arrives in New
 * Zealand by bouncing off the sky, and until now that was invisible in an app
 * built around it.
 *
 * `wspr.live` publishes the archive as a keyless ClickHouse endpoint. It is run
 * by volunteers, so it gets the same treatment as every other free service here:
 * one query per refresh, aggregated server-side rather than downloading the lot,
 * a cache, a cooldown, and a contactable User-Agent.
 */

const { cooldown } = require("./backoff");

const API = "https://db1.wspr.live/";
const UA = "AuralFM/0.1 (+https://github.com/meltonbell3/auralfm)";

/**
 * WSPR transmits on a two-minute cycle, so nothing new exists faster than that
 * and polling harder would only cost somebody else bandwidth.
 */
const REFRESH_MS = 3 * 60_000;
const WINDOW_MIN = 10;          // how far back to look
const BUDGET = 260;             // arcs on screen; see the note in get()
const MIN_KM = 400;             // below this the arc is shorter than the dot

const cool = cooldown({ min: 5 * 60_000, max: 60 * 60_000, label: "wspr" });
let last = { at: 0, key: "", spots: [] };

/**
 * Maidenhead locator to latitude/longitude.
 *
 * Two letters give a 20°x10° field, two digits a 2°x1° square, and an optional
 * two letters a 5'x2.5' subsquare. Returns the centre of whatever precision was
 * given, which is the honest answer — a 4-character locator genuinely does mean
 * "somewhere in this 2 by 1 degree box".
 */
function fromGrid(loc) {
  const g = String(loc || "").trim();
  if (!/^[A-R]{2}[0-9]{2}([A-X]{2})?$/i.test(g)) return null;
  const U = g.toUpperCase();

  let lon = (U.charCodeAt(0) - 65) * 20 - 180;
  let lat = (U.charCodeAt(1) - 65) * 10 - 90;
  lon += (U.charCodeAt(2) - 48) * 2;
  lat += (U.charCodeAt(3) - 48) * 1;

  if (U.length === 6) {
    lon += (U.charCodeAt(4) - 65) * (2 / 24);
    lat += (U.charCodeAt(5) - 65) * (1 / 24);
    lon += 1 / 24;              // centre of the subsquare
    lat += 0.5 / 24;
  } else {
    lon += 1;                   // centre of the square
    lat += 0.5;
  }
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
}

/**
 * Bands are reported as the integer megahertz of the band edge, which is also
 * how amateurs name them — "twenty metres" is 14 MHz. Mapping to the wavelength
 * name is what makes the layer readable to anyone who has ever heard of 40m.
 */
const BAND_NAME = {
  "-1": "LF", 0: "2200m", 1: "160m", 3: "80m", 5: "60m", 7: "40m", 10: "30m",
  14: "20m", 18: "17m", 21: "15m", 24: "12m", 28: "10m", 50: "6m", 144: "2m",
};

const q = (sql) => `${API}?query=${encodeURIComponent(sql)}%20FORMAT%20JSON`;

/**
 * @param {number|null} band  MHz band edge, or null for all
 * @returns {Promise<Array<{txLat,txLon,rxLat,rxLon,tx,rx,band,bandName,km,snr}>>}
 */
async function get(band = null) {
  const key = String(band ?? "all");
  if (key === last.key && Date.now() - last.at < REFRESH_MS) return last.spots;
  if (cool.blocked) return key === last.key ? last.spots : [];

  /**
   * Ordering by distance is not vanity. Thirty thousand spots arrive every ten
   * minutes and almost all of them are short domestic hops that would draw as
   * specks; the long paths are both the legible ones and the ones that are
   * actually saying something about the ionosphere. Aggregating and limiting
   * server-side also means one small response instead of megabytes.
   */
  const where = [
    `time > subtractMinutes(now(), ${WINDOW_MIN})`,
    `distance > ${MIN_KM}`,
    band == null ? null : `band = ${Number(band)}`,
  ].filter(Boolean).join(" AND ");

  const sql =
    `SELECT tx_sign, tx_loc, rx_sign, rx_loc, band, distance, snr ` +
    `FROM wspr.rx WHERE ${where} ORDER BY distance DESC LIMIT ${BUDGET}`;

  try {
    const res = await fetch(q(sql), {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    const rows = Array.isArray(body?.data) ? body.data : [];

    const out = [];
    const seen = new Set();
    for (const r of rows) {
      const a = fromGrid(r.tx_loc), b = fromGrid(r.rx_loc);
      if (!a || !b) continue;
      // The same path is often reported by several receivers in one grid square.
      // Drawing it five times just thickens the line.
      const id = `${r.tx_loc}>${r.rx_loc}`;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({
        tx: r.tx_sign, rx: r.rx_sign,
        txLat: a.lat, txLon: a.lon, rxLat: b.lat, rxLon: b.lon,
        band: r.band, bandName: BAND_NAME[String(r.band)] || `${r.band}MHz`,
        km: r.distance, snr: r.snr,
      });
    }

    last = { at: Date.now(), key, spots: out };
    cool.ok();
    return out;
  } catch (err) {
    cool.fail(err);
    return key === last.key ? last.spots : [];
  }
}

module.exports = { get, fromGrid, BAND_NAME, BUDGET };
