/**
 * Is this host safe to open a connection to?
 *
 * Two places in this app connect to somewhere a list chose rather than a person:
 * the KiwiSDR receivers, whose hosts come from a public aggregator, and the news
 * reader, whose article URLs come out of an RSS feed. Neither list is hostile
 * today. Both are somebody else's file.
 *
 * The check lives here rather than in either of them because a security check
 * that exists twice is a security check that drifts, and the copy that drifts is
 * never the one being read when it matters.
 *
 * What it rejects, and why each one:
 *
 *   - **IP literals of any kind.** A real receiver and a real publisher both
 *     have a DNS name. A literal in one of these lists is the shape an injected
 *     entry takes, and rejecting the whole class is cheaper than enumerating
 *     RFC1918, loopback, link-local and unique-local separately.
 *   - **Loopback and internal names** — localhost, .local, .internal, .home,
 *     .lan, .corp. The names a machine reaches its own network with.
 *   - **Embedded credentials, paths and whitespace.** `evil.com@10.0.0.1` is a
 *     URL that reads as one host and resolves to another.
 *   - **Odd ports.** Optional and caller-supplied, because a receiver on 8073 is
 *     ordinary and a publisher on 8073 is not.
 *
 * What it deliberately does not do is resolve DNS. A name that passes here can
 * still resolve to a private address, and nothing short of resolving and
 * checking the address before connecting closes that. On a desktop app reaching
 * a machine on the user's own network is not the escalation it is on a server,
 * and the resolve-then-connect dance is not worth the complexity here. Recorded
 * so nobody assumes the check is stronger than it is.
 */

const INTERNAL = /(^|\.)(localhost|local|internal|home|lan|corp)$/i;

/**
 * @param {string} host                 hostname, optionally `name:port`
 * @param {{minPort?: number}} [opts]   lowest acceptable port; 81 keeps a
 *                                      receiver's 8073 and refuses port 80
 *                                      smuggled in as an explicit port
 */
function validHost(host, { minPort = 81 } = {}) {
  if (typeof host !== "string" || host.length > 255) return false;
  if (/[@\s/\\?#]/.test(host)) return false;              // creds, paths, junk
  const [name, port] = host.split(":");
  if (port !== undefined) {
    if (!/^\d{1,5}$/.test(port)) return false;
    const n = +port;
    if (n < minPort || n > 65535) return false;
  }
  if (!/^[a-z0-9.-]+$/i.test(name)) return false;
  if (!name.includes(".") || name.startsWith(".") || name.endsWith(".")) return false;
  if (/^\d+(\.\d+)*$/.test(name)) return false;            // any IPv4 literal
  if (INTERNAL.test(name)) return false;
  return true;
}

/**
 * The same check, applied to a whole URL.
 *
 * Scheme is checked first because `file://` and `data:` are not hosts at all and
 * would sail past a hostname test.
 */
function validUrl(url, { schemes = ["http:", "https:"], minPort = 0 } = {}) {
  let u;
  try { u = new URL(String(url)); } catch { return false; }
  if (!schemes.includes(u.protocol)) return false;
  if (u.username || u.password) return false;
  return validHost(u.port ? `${u.hostname}:${u.port}` : u.hostname, { minPort });
}

/**
 * Fetch, re-checking the host at every redirect.
 *
 * `redirect: "follow"` validates nothing after the first hop, so a permitted
 * host can bounce the request anywhere it likes and the check becomes
 * decoration. This follows by hand and applies `validUrl` to each Location
 * before going there.
 *
 * Capped at five hops, which is more than any real article needs and fewer than
 * a redirect loop wants.
 */
async function safeFetch(url, init = {}, { max = 5, ...rules } = {}) {
  let current = String(url);
  for (let hop = 0; hop <= max; hop++) {
    if (!validUrl(current, rules)) return null;
    const res = await fetch(current, { ...init, redirect: "manual" });
    if (res.status < 300 || res.status > 399) return res;
    const next = res.headers.get("location");
    if (!next) return res;
    try { current = new URL(next, current).href; } catch { return null; }
  }
  return null;                                             // too many hops
}

module.exports = { validHost, validUrl, safeFetch };
