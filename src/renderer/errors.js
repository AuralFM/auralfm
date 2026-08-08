/**
 * Catch what nobody was catching.
 *
 * Every renderer in this app ran without a single `error` or `unhandledrejection`
 * listener. A throw inside a render path went nowhere: `fitHeight` threw
 * `TypeError: Cannot read properties of null` on every call for two days, the
 * menu bar panel silently stopped resizing, and the only reason it was ever
 * found is that somebody noticed the gap and asked about it. That is the failure
 * this file exists to prevent — not a crash, which is loud, but a function that
 * quietly stops working.
 *
 * Two rules it follows:
 *
 * **Nothing leaves the machine.** Reports go to the main process and are written
 * to a local file. There is no endpoint, no key, no upload, and no third party.
 * "Nothing that reports back" is on the front page of this project and an
 * exception for crash data would still be an exception.
 *
 * **The user is told only when it is theirs to know.** Most of what lands here is
 * a developer's problem, and a dialog for every failed background poll would
 * train people to dismiss dialogs. The log is always written; the screen is only
 * used when a caller asks.
 */
(() => {
  const seen = new Map();
  const MAX_PER_KEY = 3;           // the same broken thing, three times, then quiet

  /** A stable key so a throw inside a 4Hz tick does not write a thousand lines. */
  const keyOf = (where, message, stack) =>
    `${where}|${message}|${(stack || "").split("\n")[1]?.trim() || ""}`;

  function report(where, message, stack, extra) {
    const key = keyOf(where, message, stack);
    const n = (seen.get(key) || 0) + 1;
    seen.set(key, n);
    if (n > MAX_PER_KEY) return;

    // Keep it in the devtools console too — that is where a developer looks
    // first, and the file is for the report that arrives a week later.
    console.error(`[${where}]`, message, stack || "");

    try {
      window.auralfm?.reportError?.({
        where, message,
        stack: (stack || "").split("\n").slice(0, 12).join("\n"),
        page: location.pathname.split("/").pop(),
        repeat: n,
        ...(extra || {}),
      });
    } catch { /* the reporter itself must never throw */ }
  }

  addEventListener("error", (e) => {
    // Resource errors (a missing image) arrive here with no `error` object and
    // are a different problem from a thrown exception.
    if (e.error) report("uncaught", e.error.message || String(e.error), e.error.stack);
    else if (e.target && e.target !== window) {
      report("resource", `failed to load ${e.target.src || e.target.href || e.target.tagName}`, "");
    }
  }, true);

  addEventListener("unhandledrejection", (e) => {
    const r = e.reason;
    report("unhandled-rejection", r?.message || String(r), r?.stack);
  });

  /**
   * Run something that talks to the main process, and say so when it fails.
   *
   * Returns `fallback` rather than throwing, because the callers here are paint
   * functions: a list that renders empty is recoverable, a list that throws
   * halfway takes the rest of the render with it.
   */
  window.guard = async function guard(label, fn, fallback = null) {
    try {
      return await fn();
    } catch (err) {
      report(`guard:${label}`, err?.message || String(err), err?.stack);
      return fallback;
    }
  };
})();
