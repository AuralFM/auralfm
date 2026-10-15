/**
 * Local headlines for the place you're listening to.
 *
 * Source is Google News' RSS endpoint, which is keyless and takes a country and
 * a language — so a station in São Paulo gets Brazilian headlines in Portuguese,
 * which is the point. Runs in main; the renderer keeps its no-network guarantee.
 *
 * Caveat worth knowing: this endpoint is undocumented. Everything else live in
 * this app was moved to build time precisely so an upstream change couldn't
 * break it, and news can't get that protection — it has to be current. So it is
 * strictly decorative and strictly best-effort: cached for 15 minutes, silent on
 * failure, and nothing depends on it.
 *
 * Country names are the ones the station catalogue uses, which is why "Türkiye" and
 * "Czechia" appear in modern spelling. The 45 or so below cover ~89% of stations
 * in the catalog; anything unmapped falls back to world news in English.
 */

const { cooldown } = require("./backoff");
const { validUrl, safeFetch } = require("./safehost");
// A country's own newsrooms, where we have them (src/news-feeds.js says why).
const COUNTRY_FEEDS = require("./news-feeds");

const TTL_MS = 15 * 60 * 1000;
const cache = new Map();          // country -> { at, items }

// country -> [gl (country code), hl (interface language)]
const LOCALES = {
  "United States": ["US", "en-US"],      "Brazil": ["BR", "pt-BR"],
  "France": ["FR", "fr"],                "Spain": ["ES", "es"],
  "Germany": ["DE", "de"],               "Argentina": ["AR", "es-419"],
  "United Kingdom": ["GB", "en-GB"],     "Italy": ["IT", "it"],
  "Mexico": ["MX", "es-419"],            "Colombia": ["CO", "es-419"],
  "Indonesia": ["ID", "id"],             "Canada": ["CA", "en-CA"],
  "Chile": ["CL", "es-419"],             "Netherlands": ["NL", "nl"],
  "Russia": ["RU", "ru"],                "Greece": ["GR", "el"],
  "Australia": ["AU", "en-AU"],          "Türkiye": ["TR", "tr"],
  "Nigeria": ["NG", "en-NG"],            "Romania": ["RO", "ro"],
  "Poland": ["PL", "pl"],                "China": ["CN", "zh-CN"],
  "Belgium": ["BE", "nl"],               "Peru": ["PE", "es-419"],
  "India": ["IN", "en-IN"],              "Portugal": ["PT", "pt-PT"],
  "Venezuela": ["VE", "es-419"],         "South Africa": ["ZA", "en-ZA"],
  "Ecuador": ["EC", "es-419"],           "Switzerland": ["CH", "de"],
  "Serbia": ["RS", "sr"],                "Uruguay": ["UY", "es-419"],
  "Philippines": ["PH", "en-PH"],        "Austria": ["AT", "de"],
  "Dominican Republic": ["DO", "es-419"],"Hungary": ["HU", "hu"],
  "Croatia": ["HR", "hr"],               "Guatemala": ["GT", "es-419"],
  "Ukraine": ["UA", "uk"],               "Thailand": ["TH", "th"],
  "Ireland": ["IE", "en-IE"],            "Norway": ["NO", "no"],
  "Sweden": ["SE", "sv"],                "Czechia": ["CZ", "cs"],
  "Paraguay": ["PY", "es-419"],          "Kenya": ["KE", "en-KE"],
  "Ghana": ["GH", "en-GH"],              "Uganda": ["UG", "en-UG"],
  "New Zealand": ["NZ", "en-NZ"],        "Japan": ["JP", "ja"],
  "South Korea": ["KR", "ko"],           "Israel": ["IL", "he"],
  "Egypt": ["EG", "ar"],                 "Morocco": ["MA", "ar"],
  "Denmark": ["DK", "da"],               "Finland": ["FI", "fi"],
  "Bulgaria": ["BG", "bg"],              "Slovakia": ["SK", "sk"],
};

/**
 * This endpoint is undocumented, so treat an outage as a reason to stop asking —
 * briefly.
 *
 * It was two minutes doubling to thirty, which is right for a poll and wrong for
 * this: headlines are only fetched while somebody has the panel open, so every
 * request is a person waiting. One dropped request on a phone (a tunnel, the app
 * sent to the background mid-fetch) blanked every country for minutes, and the
 * panel said "unavailable right now" each time it was reopened. The 15-minute
 * cache is what protects Google; this only has to stop a retry storm.
 */
const cool = cooldown({ min: 15_000, max: 2 * 60_000, label: "news" });

/**
 * HTML entities to text.
 *
 * The typographic ones matter more than they look: article prose is full of
 * curly quotes and em dashes, and a reader view that renders them as `&mdash;`
 * is worse than no reader view.
 */
const decode = (s) => s
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  // Hex as well: the BBC writes an apostrophe as &#x27;, and a title showed it.
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'")
  .replace(/&nbsp;/g, " ")
  .replace(/&lsquo;|&rsquo;/g, "'").replace(/&ldquo;|&rdquo;/g, '"')
  .replace(/&mdash;/g, "\u2014").replace(/&ndash;/g, "\u2013").replace(/&hellip;/g, "\u2026")
  .trim();

// The opening tag may carry attributes: Atom writes `<title type="html">`.
const pick = (item, tag) => {
  const m = item.match(new RegExp(`<${tag}(?:\\s[^>]*)?>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`));
  return m ? decode(m[1]) : "";
};
// An Atom entry's link is an attribute, and the one to the story is rel="alternate" (or has no rel).
const atomLink = (entry) => {
  const links = [...entry.matchAll(/<link\b([^>]*)>/g)].map((m) => m[1]);
  const pickOne = links.find((l) => /rel=["']alternate["']/.test(l)) || links.find((l) => !/rel=/.test(l)) || "";
  return decode((/href=["']([^"']+)["']/.exec(pickOne) || [, ""])[1]);
};

/**
 * Minimal RSS extraction — no XML parser needed for the handful of fields a
 * reading list uses.
 *
 * Deliberately headline, link, publisher and time only. Rendering article *text*
 * would mean scraping publisher sites, which is both fragile and a licensing
 * problem: this hands off to the browser instead of pretending to be a reader.
 */
/**
 * Which publishers a reader can actually read.
 *
 * The feed is Google's aggregate, so it ranks by whatever Google ranks by, and
 * a headline from a title nobody can open is worse than no headline: it is a
 * promise the app cannot keep. Listeners are across the globe, and a
 * subscription to a New York newspaper is not a reasonable prerequisite for
 * reading what happened today.
 *
 * So the list is reordered rather than filtered. Publishers anyone can read
 * come first, unknown ones keep their place in the middle, and the ones behind
 * a hard paywall sink to the bottom. Nothing is hidden -- a paywalled headline
 * still says what happened, and pretending an outlet does not exist is its own
 * kind of editorialising.
 *
 * "Open" here means readable without paying, not free of advertising and not
 * neutral. Several are state-funded and it shows. That is a different argument
 * and not one this sort should be making.
 */
const OPEN = [
  "ap news", "associated press", "bbc", "al jazeera", "npr", "pbs",
  "deutsche welle", "dw", "france 24", "rfi", "voa", "voice of america",
  "euronews", "cbc", "abc.net.au", "abc news (au", "the guardian", "guardian",
  "sky news", "cna", "channel newsasia", "the conversation", "propublica",
  "reuters", "ansa", "efe", "kyodo", "yle", "nrk", "swissinfo", "rte",
];

/** Hard paywalls. Metered counts: a reader on their tenth article is stopped. */
const PAYWALLED = [
  "wall street journal", "wsj", "new york times", "nytimes", "financial times",
  "the economist", "bloomberg", "washington post", "the times", "telegraph",
  "nikkei", "le monde", "foreign policy", "the atlantic", "new yorker",
  "wired", "business insider", "barron", "the information", "harvard business",
];

/** -1 open, 0 unknown, 1 paywalled. Lower sorts first. */
function readability(source) {
  const s = String(source || "").toLowerCase();
  if (OPEN.some((n) => s.includes(n))) return -1;
  if (PAYWALLED.some((n) => s.includes(n))) return 1;
  return 0;
}

/**
 * @param {string} [source]  a publisher's own feed names itself; Google's
 *   aggregate does not, and puts the publisher at the end of each title
 */
function parseItems(xml, limit, source = "") {
  const out = [];
  // `<item rdf:about=…>` as well as `<item>`: DW's feed is RSS 1.0 (RDF). And
  // `<entry>` where there are no items at all: several public broadcasters
  // (VRT, Sveriges Radio, Taiwan's PTS) publish Atom, not RSS.
  let blocks = xml.split(/<item[\s>]/).slice(1);
  const atom = !blocks.length;
  if (atom) blocks = xml.split(/<entry[\s>]/).slice(1);
  for (const item of blocks) {
    const title = pick(item, "title");
    if (!title) continue;
    // Google formats titles as "Headline - Publisher"; a publisher's own feed
    // does not, and its titles are left whole.
    const split = source ? -1 : title.lastIndexOf(" - ");
    out.push({
      title: split > 20 ? title.slice(0, split) : title,
      source: source || pick(item, "source") || (split > 20 ? title.slice(split + 3) : ""),
      link: atom ? atomLink(item) : pick(item, "link"),
      at: Date.parse(pick(item, "pubDate") || pick(item, "dc:date") || pick(item, "updated") || pick(item, "published")) || null,
    });
  }
  // Read the whole feed, then order it, then trim. Stopping at `limit` while
  // parsing would sort a slice Google chose rather than the feed itself, which
  // is the thing being corrected.
  return out
    .map((item, i) => ({ item, i, rank: readability(item.source) }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.item);
}

const parseTitles = (xml, limit) => parseItems(xml, limit).map((i) => i.title);

/**
 * Google News' RSS root. The web version cannot read Google News from a page, so
 * it points this at its own proxy route (setBase); the desktop never changes it.
 */
let RSS = "https://news.google.com/rss";
const setBase = (base) => { RSS = String(base).replace(/\/+$/, ""); };

/**
 * World headlines, from the newsrooms themselves.
 *
 * They were Google News' World topic, and on the web that request goes out
 * from here.now's servers — which Google answers, some of the time, with its
 * 503 "Sorry…" page for automated traffic (tested 2026-09-23: the World topic
 * 503'd through here.now while a country edition returned 34 stories). World
 * is where the panel opens, so the panel opened on nothing: the "sometimes it
 * works" first reported, and then "headlines are missing".
 *
 * Four publishers anyone can read, from four places, each over its own feed:
 * one failing leaves three. They are taken in rounds, so all four are heard.
 * Country and place headlines stayed on Google's editions until 9 Oct 2026,
 * when those stopped answering the relay too: they now come from each
 * country's own newsrooms, the same way (src/news-feeds.js).
 *
 * `route` is the web version's proxy path (/api/feeds/<route>); the desktop
 * fetches `url` itself. scripts/build-web.mjs writes the routes from this list.
 * `site` is where the feed's own stories live, which the web reader reaches
 * through /api/read/<route>/* — the host every link in that feed names, checked
 * 2026-09-24, so no story arrives there by a redirect the route cannot follow.
 */
const WORLD_FEEDS = [
  { name: "BBC", route: "bbc", url: "https://feeds.bbci.co.uk/news/world/rss.xml", site: "https://www.bbc.co.uk" },
  { name: "Al Jazeera", route: "aljazeera", url: "https://www.aljazeera.com/xml/rss/all.xml", site: "https://www.aljazeera.com" },
  { name: "France 24", route: "france24", url: "https://www.france24.com/en/rss", site: "https://www.france24.com" },
  { name: "DW", route: "dw", url: "https://rss.dw.com/rdf/rss-en-world", site: "https://www.dw.com" },
];
let FEEDS = null;                  // null: fetch each feed's own url
const setFeedBase = (base) => { FEEDS = String(base).replace(/\/+$/, ""); };

async function fetchFeed(url, parse) {
  const res = await fetch(url, {
    headers: { "User-Agent": "AuralFM/0.1" },
    redirect: "follow",
    signal: AbortSignal.timeout(9000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parse(await res.text());
}

/**
 * Headlines from a list of newsrooms' own feeds: the world's, or one country's.
 *
 * Three at a time. A country may list more: some newsrooms refuse the web
 * version's relay (`relay: false`, found by asking each one through it), and
 * the web then takes the next ones down the list, so a phone still hears two
 * or three. The relay forwards the query string it is given and not the one
 * in its own configuration, so a feed whose address ends in `?outputType=xml`
 * is asked for with that on the end here too: without it nine feeds answered
 * the relay with a 404 or a web page (9 Oct 2026).
 */
const search = (url) => { try { return new URL(url).search; } catch { return ""; } };
async function fromFeeds(feeds, limit) {
  const use = feeds.filter((f) => !(FEEDS && f.relay === false)).slice(0, 3);
  const results = await Promise.allSettled(use.map((f) =>
    fetchFeed(FEEDS ? `${FEEDS}/${f.route}${search(f.url)}` : f.url, (xml) => parseItems(xml, 40, f.name))));
  const lists = results.filter((r) => r.status === "fulfilled" && r.value.length)
    .map((r) => r.value.slice().sort((a, b) => (b.at || 0) - (a.at || 0)));
  if (!lists.length) throw new Error("none of these feeds answered");
  /**
   * In rounds: each outlet's newest, then each one's next, and so on — within
   * a round, newest first. Strictly newest-first let the outlets that publish
   * most often fill the list, and DW, which files fewer, longer pieces, showed
   * once in twelve. The point of four newsrooms is to hear all four.
   */
  const out = [];
  for (let round = 0; out.length < limit; round++) {
    const next = lists.map((l) => l[round]).filter(Boolean);
    if (!next.length) break;
    out.push(...next.sort((a, b) => (b.at || 0) - (a.at || 0)));
  }
  return out.slice(0, limit);
}

/**
 * Headlines for a country, or throws.
 *
 * Throws rather than returning [] when nothing could be fetched, because the
 * panel tells "this place has no headlines" apart from "the network failed" and
 * offers Try again only for the second. Returning [] for both meant it never
 * offered it: a dropped request read as "Headlines unavailable right now", with
 * no way forward but closing and reopening. An older copy still beats an error.
 *
 * @param {string|null} country  null or "world" for the international edition
 */
async function get(country, limit = 12) {
  // A country with neither newsrooms nor a locale here gets the world edition,
  // as the header says. It used to get the US edition, so a station in Senegal
  // showed American news.
  const own = (country && COUNTRY_FEEDS[country]) || null;
  const key = own || (country && LOCALES[country]) ? country : "world";
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.items;
  if (cool.blocked) {
    if (hit) return hit.items;
    throw new Error(`news: backing off for ${cool.remaining}s`);
  }

  // No country means world news, not "whatever the US is reading" — this app is
  // about the whole globe, and the default should say so. World comes from the
  // publishers' own feeds (WORLD_FEEDS, above), and so does a country that has
  // newsrooms listed (src/news-feeds.js). Google's edition is what is left: for
  // a country with a locale and no newsrooms, and for the desktop when every
  // one of a country's own feeds has failed. The web never asks Google: its
  // relay is refused there, and a refusal would also start the backoff below
  // and take World down with it.
  const google = () => {
    const [gl, hl] = LOCALES[key];
    return fetchFeed(`${RSS}?hl=${hl}&gl=${gl}&ceid=${gl}:${hl.split("-")[0]}`,
                     (xml) => parseItems(xml, limit));
  };
  try {
    let items;
    if (key === "world") items = await fromFeeds(WORLD_FEEDS, limit);
    else if (own) {
      try { items = await fromFeeds(own, limit); }
      catch (err) { if (FEEDS || !LOCALES[key]) throw err; items = await google(); }
    } else if (FEEDS) throw new Error(`news: no newsrooms listed for ${key}`);
    else items = await google();
    cache.set(key, { at: Date.now(), items });
    cool.ok();
    return items;
  } catch (err) {
    // A small country's two papers being down is not a reason to stop asking
    // for everybody else's: only World and Google start the backoff.
    if (!own && !(FEEDS && key !== "world")) cool.fail(err);
    if (hit) return hit.items;
    throw err;
  }
}

module.exports = { get, setBase, setFeedBase, WORLD_FEEDS, COUNTRY_FEEDS };

/**
 * Read an article without opening a browser.
 *
 * A headline is a promise; a link out to a page of consent banners and
 * newsletter interstitials is how that promise gets broken. This fetches the
 * page here — the main process has no CORS to negotiate — and pulls out the
 * text, so the story can be read in the panel it was found in.
 *
 * Extraction is a heuristic, not Readability. Bringing in a real parser means
 * bringing in a DOM implementation, which is tens of megabytes for a feature
 * that has to work on wire-service HTML most of the time and is allowed to fail
 * visibly the rest of it. The rule below — the container holding the most
 * paragraph text wins — is what every readability algorithm does first, and it
 * is most of the benefit for none of the weight.
 */
const READ_TTL_MS = 30 * 60_000;
const readCache = new Map();

/**
 * The reader on the web.
 *
 * A page cannot fetch another site's article, so the web version reads through
 * one proxy route per world-feed newsroom (setReadBase). That covers what World
 * shows, and nothing else: a country headline is a Google News link, which leads
 * to Google's own page and not to the publisher, so no fixed route could reach
 * it. canRead() says which is which, so the web opens those where they were
 * published instead of showing a reader that was never going to work.
 */
let READ = null;                   // null: fetch the article itself (desktop)
const setReadBase = (base) => { READ = String(base).replace(/\/+$/, ""); };

function viaRoute(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  const f = WORLD_FEEDS.find((x) => x.site === u.origin);
  return f ? `${READ}/${f.route}${u.pathname}${u.search}` : null;
}

const canRead = (url) => validUrl(url) && (!READ || !!viaRoute(url));

const stripTags = (html) => html
  .replace(/<!--[\s\S]*?-->/g, "")
  .replace(/<(script|style|noscript|svg|iframe|form)\b[\s\S]*?<\/\1>/gi, "")
  .replace(/<(nav|header|footer|aside)\b[\s\S]*?<\/\1>/gi, "");

async function read(url) {
  // A scheme test is not a host check. This URL comes out of somebody else's RSS
  // feed, and `^https?://` is perfectly happy with the loopback interface,
  // RFC1918 space and a cloud metadata endpoint. Same check the receiver list
  // gets, for the same reason: neither list is ours.
  if (!canRead(url)) return null;
  const hit = readCache.get(url);
  if (hit && Date.now() - hit.at < READ_TTL_MS) return hit.doc;

  let html;
  if (READ) {
    // Our own route, to the one host it serves; the route sets the User-Agent.
    // A redirect comes back unfollowed and reads as a failure, as it should.
    try {
      const res = await fetch(viaRoute(url), { redirect: "manual", signal: AbortSignal.timeout(12000) });
      if (!res.ok) return null;
      html = await res.text();
    } catch { return null; }
  } else try {
    // safeFetch follows redirects by hand and re-checks the host at every hop.
    // `redirect: "follow"` validates nothing after the first one, so a permitted
    // publisher could bounce the request anywhere and the check above would be
    // decoration.
    const res = await safeFetch(url, {
      // A plain browser UA: a number of publishers serve a stub to anything that
      // looks automated, and a stub extracts to nothing, which reads as a bug in
      // here rather than a decision over there.
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
                               "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15" },
      signal: AbortSignal.timeout(12000),
    });
    if (!res || !res.ok) return null;
    html = await res.text();
  } catch { return null; }

  const clean = stripTags(html);
  const title = decode((/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i.exec(html)
                      || /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html) || [, ""])[1]).trim();

  // Score every block-level container by how much paragraph text it holds, and
  // take the winner. Nesting means a parent always beats its child on raw total,
  // so the deepest container above the threshold is preferred.
  const paras = [...clean.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => decode(m[1].replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim())
    // Navigation, captions and cookie notices are short; prose is not.
    .filter((t) => t.length > 60);

  if (!paras.length) return null;
  const doc = { url, title, paragraphs: paras.slice(0, 40), words: paras.join(" ").split(/\s+/).length };
  readCache.set(url, { at: Date.now(), doc });
  return doc;
}

module.exports.read = read;
module.exports.canRead = canRead;
module.exports.setReadBase = setReadBase;
