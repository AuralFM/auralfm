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

const decode = (s) => s
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'")
  .trim();

/** Minimal RSS title extraction — no XML parser needed for <item><title>. */
function parseTitles(xml, limit) {
  const out = [];
  const items = xml.split("<item>").slice(1);
  for (const item of items) {
    const m = item.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
    if (!m) continue;
    // Google appends " - Outlet"; keep it, attribution matters and it is short.
    const t = decode(m[1]);
    if (t) out.push(t);
    if (out.length >= limit) break;
  }
  return out;
}

async function get(country, limit = 12) {
  const key = country || "world";
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.items;

  const [gl, hl] = LOCALES[country] || ["US", "en-US"];
  const url = `https://news.google.com/rss?hl=${hl}&gl=${gl}&ceid=${gl}:${hl.split("-")[0]}`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "GlobeFM/0.1" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const items = parseTitles(await res.text(), limit);
    cache.set(key, { at: Date.now(), items });
    return items;
  } catch {
    return [];
  }
}

module.exports = { get, LOCALES };
