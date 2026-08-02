/**
 * Market ticker data.
 *
 * Crypto comes from CoinGecko, which is keyless and needs no account — so a
 * fresh clone shows live prices with nothing to sign up for.
 *
 * Stocks do NOT have a keyless source worth relying on. Probed while building
 * this: Yahoo's public chart endpoint returns 429 on both query1 and query2,
 * and Stooq's CSV endpoint 404s. Every remaining provider (Alpha Vantage,
 * Finnhub, Twelve Data) requires an API key. So equities are wired but dormant:
 * set GLOBEFM_STOCK_KEY and they light up, and until then the ticker is honest
 * about showing crypto only rather than faking an index.
 *
 * Best-effort like everything else live here: cached, silent on failure.
 */

const CG = "https://api.coingecko.com/api/v3/simple/price";
const COINS = ["bitcoin", "ethereum", "solana"];
const SYMBOL = { bitcoin: "BTC", ethereum: "ETH", solana: "SOL" };

// Alpha Vantage: free tier, 25 calls/day — fine for a ticker refreshed hourly.
const STOCK_KEY = process.env.GLOBEFM_STOCK_KEY || null;
const STOCKS = ["SPY", "QQQ", "DIA"];

const { cooldown } = require("./backoff");

const TTL_MS = 90 * 1000;
const STOCK_TTL_MS = 15 * 60 * 1000;
let cache = { at: 0, items: [] };
let stockCache = { at: 0, items: [] };

async function crypto() {
  const q = new URLSearchParams({
    ids: COINS.join(","),
    vs_currencies: "usd",
    include_24hr_change: "true",
  });
  const res = await fetch(`${CG}?${q}`, {
    headers: { "User-Agent": "GlobeFM/0.1" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
  const j = await res.json();
  return COINS.filter((c) => j[c]).map((c) => ({
    symbol: SYMBOL[c] || c.toUpperCase(),
    price: j[c].usd,
    changePct: j[c].usd_24h_change ?? null,
  }));
}

async function stocks() {
  if (!STOCK_KEY) return [];
  if (Date.now() - stockCache.at < STOCK_TTL_MS) return stockCache.items;
  const out = [];
  for (const sym of STOCKS) {
    try {
      const u = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${sym}&apikey=${STOCK_KEY}`;
      const res = await fetch(u, { signal: AbortSignal.timeout(8000) });
      const q = (await res.json())["Global Quote"];
      if (!q?.["05. price"]) continue;
      out.push({
        symbol: sym,
        price: Number(q["05. price"]),
        changePct: parseFloat(q["10. change percent"]) || null,
      });
    } catch { /* skip this symbol */ }
  }
  if (out.length) stockCache = { at: Date.now(), items: out };
  return out;
}

/**
 * @returns {Promise<{items: Array<{symbol,price,changePct}>, hasStocks: boolean}>}
 */
// cache.at only advanced when items came back, so a failing provider was
// re-asked every 90 seconds indefinitely.
const cool = cooldown({ min: 2 * 60_000, max: 30 * 60_000, label: "markets" });

async function get() {
  if (Date.now() - cache.at < TTL_MS && cache.items.length) {
    return { items: cache.items, hasStocks: !!STOCK_KEY };
  }
  if (cool.blocked) return { items: cache.items, hasStocks: !!STOCK_KEY };
  try {
    const [c, s] = await Promise.all([crypto(), stocks()]);
    const items = [...s, ...c];
    if (items.length) { cache = { at: Date.now(), items }; cool.ok(); }
    else cool.fail("no quotes returned");
    return { items, hasStocks: !!STOCK_KEY };
  } catch (err) {
    cool.fail(err);
    return { items: cache.items, hasStocks: !!STOCK_KEY };
  }
}

module.exports = { get };
