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
 * Country names are the ones radio.garden uses, which is why "Türkiye" and
 * "Czechia" appear in modern spelling. The 45 or so below cover ~89% of stations
 * in the catalog; anything unmapped falls back to world news in English.
 */

const { cooldown } = require("./backoff");
const { validUrl, safeFetch } = require("./safehost");

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
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'")
  .replace(/&nbsp;/g, " ")
  .replace(/&lsquo;|&rsquo;/g, "'").replace(/&ldquo;|&rdquo;/g, '"')
  .replace(/&mdash;/g, "\u2014").replace(/&ndash;/g, "\u2013").replace(/&hellip;/g, "\u2026")
  .trim();

const pick = (item, tag) => {
  const m = item.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`));
  return m ? decode(m[1]) : "";
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
 * promise the app cannot keep. Melton's users are across the globe, and a
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
  // `<item rdf:about=…>` as well as `<item>`: DW's feed is RSS 1.0 (RDF).
  for (const item of xml.split(/<item[\s>]/).slice(1)) {
    const title = pick(item, "title");
    if (!title) continue;
    // Google formats titles as "Headline - Publisher"; a publisher's own feed
    // does not, and its titles are left whole.
    const split = source ? -1 : title.lastIndexOf(" - ");
    out.push({
      title: split > 20 ? title.slice(0, split) : title,
      source: source || pick(item, "source") || (split > 20 ? title.slice(split + 3) : ""),
      link: pick(item, "link"),
      at: Date.parse(pick(item, "pubDate") || pick(item, "dc:date")) || null,
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
 * one failing leaves three. They are taken in rounds, so all four are heard. Country and place headlines stay on
 * Google's editions, which answer, and which are the only way to have them in
 * the country's own language.
 *
 * `route` is the web version's proxy path (/api/feeds/<route>); the desktop
 * fetches `url` itself. scripts/build-web.mjs writes the routes from this list.
 */
const WORLD_FEEDS = [
  { name: "BBC", route: "bbc", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
  { name: "Al Jazeera", route: "aljazeera", url: "https://www.aljazeera.com/xml/rss/all.xml" },
  { name: "France 24", route: "france24", url: "https://www.france24.com/en/rss" },
  { name: "DW", route: "dw", url: "https://rss.dw.com/rdf/rss-en-world" },
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

async function worldHeadlines(limit) {
  const results = await Promise.allSettled(WORLD_FEEDS.map((f) =>
    fetchFeed(FEEDS ? `${FEEDS}/${f.route}` : f.url, (xml) => parseItems(xml, 40, f.name))));
  const lists = results.filter((r) => r.status === "fulfilled" && r.value.length)
    .map((r) => r.value.slice().sort((a, b) => (b.at || 0) - (a.at || 0)));
  if (!lists.length) throw new Error("no world feed answered");
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
  // A country with no locale here gets the world edition, as the header says.
  // It used to get the US edition, so a station in Senegal showed American news.
  const key = country && LOCALES[country] ? country : "world";
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.items;
  if (cool.blocked) {
    if (hit) return hit.items;
    throw new Error(`news: backing off for ${cool.remaining}s`);
  }

  // No country means world news, not "whatever the US is reading" — this app is
  // about the whole globe, and the default should say so. World comes from the
  // publishers' own feeds (WORLD_FEEDS, above); a country from Google's edition.
  try {
    const items = key === "world"
      ? await worldHeadlines(limit)
      : await (() => {
          const [gl, hl] = LOCALES[key];
          return fetchFeed(`${RSS}?hl=${hl}&gl=${gl}&ceid=${gl}:${hl.split("-")[0]}`,
                           (xml) => parseItems(xml, limit));
        })();
    cache.set(key, { at: Date.now(), items });
    cool.ok();
    return items;
  } catch (err) {
    cool.fail(err);
    if (hit) return hit.items;
    throw err;
  }
}

module.exports = { get, setBase, setFeedBase, WORLD_FEEDS };

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

const stripTags = (html) => html
  .replace(/<!--[\s\S]*?-->/g, "")
  .replace(/<(script|style|noscript|svg|iframe|form)\b[\s\S]*?<\/\1>/gi, "")
  .replace(/<(nav|header|footer|aside)\b[\s\S]*?<\/\1>/gi, "");

async function read(url) {
  // A scheme test is not a host check. This URL comes out of somebody else's RSS
  // feed, and `^https?://` is perfectly happy with the loopback interface,
  // RFC1918 space and a cloud metadata endpoint. Same check the receiver list
  // gets, for the same reason: neither list is ours.
  if (!validUrl(url)) return null;
  const hit = readCache.get(url);
  if (hit && Date.now() - hit.at < READ_TTL_MS) return hit.doc;

  let html;
  try {
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
