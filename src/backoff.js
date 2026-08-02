/**
 * Failure cooldown for the live services.
 *
 * Every live feature in this app polls on a timer, and every one of them had the
 * same hole: a TTL that only advanced on success. When a service went down, the
 * "don't fetch again yet" guard never engaged, so the poll interval became the
 * retry interval — and the retry interval was tuned for how fast the *data*
 * changes, not for how gently a failing service should be treated.
 *
 * The ISS ticks every 4 seconds. Satellites every 30. That is not polling any
 * more, it is a denial of service with our name on it, and Celestrak rate-limited
 * us for exactly that.
 *
 * So: on failure, wait. Double the wait each time, cap it, and reset on the first
 * success. Small enough that a blip costs one skipped update; large enough that
 * a genuine outage costs the service almost nothing.
 */

/**
 * @param {object}  [opts]
 * @param {number}  [opts.min]  first wait after a failure, ms
 * @param {number}  [opts.max]  ceiling, ms
 * @param {string}  [opts.label] prefix for the one log line per failure
 */
function cooldown({ min = 60_000, max = 60 * 60_000, label = "" } = {}) {
  let until = 0;
  let wait = min;

  return {
    /** True when we are still serving out a penalty and must not call out. */
    get blocked() { return Date.now() < until; },

    /** Seconds left, for a log line or a status read-out. */
    get remaining() { return Math.max(0, Math.round((until - Date.now()) / 1000)); },

    ok() { wait = min; until = 0; },

    /** @param {Error|string} [err] logged once, not once per retry */
    fail(err) {
      until = Date.now() + wait;
      if (label) {
        const mins = wait >= 60_000 ? `${Math.round(wait / 60_000)} min` : `${Math.round(wait / 1000)}s`;
        console.warn(`${label}: ${err?.message || err || "failed"} — backing off ${mins}`);
      }
      wait = Math.min(wait * 2, max);
    },
  };
}

module.exports = { cooldown };
