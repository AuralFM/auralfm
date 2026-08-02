/**
 * Market ticker data.
 *
 * Crypto is genuinely live: Coinbase's exchange feed is a keyless WebSocket that
 * needs no account and no key, and it ticks several times a second. Measured on
 * a quiet Sunday: 42 ticks in 8 seconds across BTC, ETH and SOL. CoinGecko's
 * REST endpoint stays as the fallback for when the socket cannot connect, so a
 * fresh clone still shows prices either way.
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

const CB_WS = "wss://ws-feed.exchange.coinbase.com";
const CB_PRODUCTS = ["BTC-USD", "ETH-USD", "SOL-USD"];

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
  // The live socket wins whenever it is healthy — no cache, no TTL, just the
  // price as of a moment ago.
  const now = liveItems();
  if (now.length) {
    const s = STOCK_KEY ? await stocks().catch(() => []) : [];
    return { items: [...s, ...now], hasStocks: !!STOCK_KEY, live: true };
  }
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

// ── live crypto ──────────────────────────────────────────────────────────────
/**
 * Coinbase's ticker channel, in main so the renderer keeps its no-network
 * property. The socket ticks several times a second; that is far more than a
 * ticker needs to show, so prices are held here and pushed onward at 1 Hz by
 * whoever subscribes. Sending every tick over IPC would be five times a second
 * of work to move a number that changes in the third decimal place.
 *
 * open_24h is what the percentage is measured against — the same 24-hour window
 * CoinGecko reports, so the two sources agree rather than disagreeing by a few
 * tenths depending on which one answered.
 */
let ws = null, wsAlive = false, wsRetry = null;
const live = new Map();          // symbol -> { price, changePct, at }

const wsCool = cooldown({ min: 60_000, max: 30 * 60_000, label: "markets/ws" });

function connectLive() {
  if (ws || wsCool.blocked) return;
  let sock;
  try { sock = new WebSocket(CB_WS); } catch (err) { return wsCool.fail(err); }
  ws = sock;

  const giveUp = setTimeout(() => { if (!wsAlive) { try { sock.close(); } catch {} } }, 15000);

  sock.onopen = () => sock.send(JSON.stringify({
    type: "subscribe", product_ids: CB_PRODUCTS, channels: ["ticker"],
  }));

  sock.onmessage = (m) => {
    let d;
    try { d = JSON.parse(m.data); } catch { return; }
    if (d.type !== "ticker" || !d.price) return;
    if (!wsAlive) { wsAlive = true; wsCool.ok(); clearTimeout(giveUp); console.log("markets: live crypto feed connected"); }
    const price = Number(d.price);
    const open = Number(d.open_24h);
    live.set((d.product_id || "").split("-")[0], {
      price,
      changePct: open ? ((price - open) / open) * 100 : null,
      at: Date.now(),
    });
  };

  const down = () => {
    clearTimeout(giveUp);
    ws = null;
    const wasAlive = wsAlive;
    wsAlive = false;
    if (!wasAlive) wsCool.fail("could not connect");
    // A feed that was working and dropped is worth one patient retry; the
    // cooldown handles the case where it keeps failing.
    clearTimeout(wsRetry);
    wsRetry = setTimeout(connectLive, wasAlive ? 5000 : 60_000);
  };
  sock.onclose = down;
  sock.onerror = () => { /* onclose always follows */ };
}

/** Live prices if the socket is healthy and recent, otherwise nothing. */
function liveItems() {
  if (!wsAlive) return [];
  const fresh = Date.now() - 30_000;
  const out = [];
  for (const sym of ["BTC", "ETH", "SOL"]) {
    const v = live.get(sym);
    if (v && v.at > fresh) out.push({ symbol: sym, price: v.price, changePct: v.changePct });
  }
  return out.length === CB_PRODUCTS.length ? out : [];
}

function start() { connectLive(); }

module.exports = { get, start, liveItems };
