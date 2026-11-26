/**
 * Market ticker data.
 *
 * Crypto is genuinely live: Coinbase's exchange feed is a keyless WebSocket that
 * needs no account and no key, and it ticks several times a second. Measured on
 * a quiet Sunday: 42 ticks in 8 seconds across BTC, ETH and SOL. CoinGecko's
 * REST endpoint fills in for coins Coinbase does not list and for when the
 * socket cannot connect. Nothing here runs until Settings turns prices on.
 *
 * Stocks do NOT have a keyless source worth relying on. Probed while building
 * this: Yahoo's public chart endpoint returns 429 on both query1 and query2,
 * and Stooq's CSV endpoint 404s. Every remaining provider (Alpha Vantage,
 * Finnhub, Twelve Data) requires an API key. So equities are wired but dormant:
 * set AURALFM_STOCK_KEY and they light up, and until then the ticker is honest
 * about showing crypto only rather than faking an index.
 *
 * Best-effort like everything else live here: cached, silent on failure.
 */

const CG = "https://api.coingecko.com/api/v3/simple/price";
const CB_WS = "wss://ws-feed.exchange.coinbase.com";
const CB_PRODUCTS_URL = "https://api.exchange.coinbase.com/products";

/**
 * Which coins, set from the listener's choice in Settings (prefs.priceCoins).
 * Any symbol: those Coinbase trades against the dollar come live over its
 * socket, and the rest from CoinGecko, which can be asked by symbol and answers
 * for the largest coin of that name. Measured: 399 of Coinbase's 847 products
 * are online against USD; CoinGecko answers for Monero, which Coinbase lacks.
 */
let coins = ["BTC", "ETH", "SOL"];

// Alpha Vantage: free tier, 25 calls/day — fine for a ticker refreshed hourly.
const STOCK_KEY = process.env.AURALFM_STOCK_KEY || null;
const STOCKS = ["SPY", "QQQ", "DIA"];

const { cooldown } = require("./backoff");

const TTL_MS = 90 * 1000;
const STOCK_TTL_MS = 15 * 60 * 1000;
let stockCache = { at: 0, items: [] };

/** CoinGecko by symbol. Its keys come back in whatever case it likes ("Uni"). */
async function gecko(symbols) {
  const q = new URLSearchParams({
    symbols: symbols.map((x) => x.toLowerCase()).join(","),
    vs_currencies: "usd",
    include_24hr_change: "true",
  });
  const res = await fetch(`${CG}?${q}`, {
    headers: { "User-Agent": "AuralFM/0.1" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
  const j = await res.json();
  const by = new Map(Object.entries(j).map(([k, v]) => [k.toUpperCase(), v]));
  return symbols.filter((x) => by.get(x)?.usd != null).map((x) => ({
    symbol: x,
    price: by.get(x).usd,
    changePct: by.get(x).usd_24h_change ?? null,
  }));
}

/**
 * The symbols Coinbase trades against the dollar, asked once a day. Null until
 * known, and then every coin goes to CoinGecko, which is slower but answers.
 */
let products = { at: 0, set: null };
async function coinbaseListed() {
  if (products.set && Date.now() - products.at < 24 * 3600_000) return products.set;
  try {
    const res = await fetch(CB_PRODUCTS_URL, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`Coinbase HTTP ${res.status}`);
    const list = await res.json();
    products = {
      at: Date.now(),
      set: new Set(list.filter((x) => x.quote_currency === "USD" && x.status === "online" && !x.trading_disabled)
        .map((x) => String(x.base_currency).toUpperCase())),
    };
  } catch { /* keep what was known */ }
  return products.set;
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

// A failing provider is asked again after a growing pause, not every 90 seconds.
const cool = cooldown({ min: 2 * 60_000, max: 30 * 60_000, label: "markets" });
const geckoSeen = new Map();      // symbol -> { price, changePct, at }

/** Asks CoinGecko for the coins the socket is not giving, at most every 90 seconds. */
async function fillFromGecko(missing) {
  const stale = missing.filter((x) => !(Date.now() - (geckoSeen.get(x)?.at || 0) < TTL_MS));
  if (!stale.length || cool.blocked) return;
  try {
    const got = await gecko(stale);
    for (const it of got) geckoSeen.set(it.symbol, { ...it, at: Date.now() });
    if (got.length) cool.ok(); else cool.fail("no quotes returned");
  } catch (err) { cool.fail(err); }
}

/**
 * @returns {Promise<{items: Array<{symbol,price,changePct}>, hasStocks: boolean}>}
 * The coins in the listener's order; one that neither source knows is left out.
 */
async function get() {
  if (!wanted) return { items: [], hasStocks: !!STOCK_KEY };
  const fresh = (v) => v && Date.now() - v.at < 30_000;
  await fillFromGecko(coins.filter((x) => !fresh(live.get(x))));
  const items = coins.map((x) => {
    const v = fresh(live.get(x)) ? live.get(x) : geckoSeen.get(x);
    return v && { symbol: x, price: v.price, changePct: v.changePct };
  }).filter(Boolean);
  const s = STOCK_KEY ? await stocks().catch(() => []) : [];
  return { items: [...s, ...items], hasStocks: !!STOCK_KEY, live: items.some((it) => fresh(live.get(it.symbol))) };
}

/**
 * Whether a symbol has a price anywhere, for Settings before it adds a coin.
 * Asked only when the listener presses Add, never in the background.
 * @returns {Promise<{ok: boolean, symbol?: string, live?: boolean, error?: string}>}
 */
async function lookup(raw) {
  const symbol = String(raw || "").trim().toUpperCase().replace(/^\$/, "");
  if (!/^[A-Z0-9]{1,12}$/.test(symbol)) return { ok: false, error: "invalid" };
  const listed = await coinbaseListed();
  if (listed?.has(symbol)) return { ok: true, symbol, live: true };
  try {
    const got = await gecko([symbol]);
    if (got.length) {
      geckoSeen.set(symbol, { ...got[0], at: Date.now() });
      return { ok: true, symbol, live: false };
    }
    return { ok: false, symbol, error: "unknown" };
  } catch { return { ok: false, symbol, error: "offline" }; }
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
// Only while the Crypto Prices layer is on: off, nothing connects to the exchange.
let wanted = false;
const live = new Map();          // symbol -> { price, changePct, at }

const wsCool = cooldown({ min: 60_000, max: 30 * 60_000, label: "markets/ws" });

/** The coins to ask the socket for: those Coinbase trades against the dollar. */
let subscribed = [];
function productsNow() {
  // Not known yet: the three that have always been on Coinbase.
  const on = products.set ? coins.filter((x) => products.set.has(x))
                          : coins.filter((x) => ["BTC", "ETH", "SOL"].includes(x));
  return on.map((x) => `${x}-USD`);
}
async function liveProducts() { await coinbaseListed(); return productsNow(); }

async function connectLive() {
  if (!wanted || ws || wsCool.blocked) return;
  const want = await liveProducts();
  if (!wanted || ws || !want.length) return;
  let sock;
  try { sock = new WebSocket(CB_WS); } catch (err) { return wsCool.fail(err); }
  ws = sock;

  const giveUp = setTimeout(() => { if (!wsAlive) { try { sock.close(); } catch {} } }, 15000);

  // The list as it is when the socket opens, which may have changed since.
  sock.onopen = () => {
    subscribed = productsNow();
    if (!subscribed.length) return sock.close();
    sock.send(JSON.stringify({ type: "subscribe", product_ids: subscribed, channels: ["ticker"] }));
  };

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
    subscribed = [];
    const wasAlive = wsAlive;
    wsAlive = false;
    if (!wasAlive) wsCool.fail("could not connect");
    // A feed that was working and dropped is worth one patient retry; the
    // cooldown handles the case where it keeps failing.
    clearTimeout(wsRetry);
    if (wanted) wsRetry = setTimeout(connectLive, wasAlive ? 5000 : 60_000);
  };
  sock.onclose = down;
  sock.onerror = () => { /* onclose always follows */ };
}

/** Live prices for the chosen coins the socket has given in the last 30 seconds. */
function liveItems() {
  if (!wsAlive) return [];
  const fresh = Date.now() - 30_000;
  return coins.map((x) => [x, live.get(x)]).filter(([, v]) => v && v.at > fresh)
    .map(([symbol, v]) => ({ symbol, price: v.price, changePct: v.changePct }));
}

/** Prices on, for these coins (prefs.priceCoins). Called again when the list changes. */
function start(list) {
  if (Array.isArray(list)) setCoins(list);
  wanted = true;
  connectLive();
}

/**
 * A new list from Settings. An open socket is told what changed rather than
 * reconnected, so the coins already showing keep ticking.
 */
async function setCoins(list) {
  // Checked here as well as in prefs.coinList: these symbols go into a URL and
  // onto the exchange's socket, so only plain symbols, at most eight, ever do.
  coins = (Array.isArray(list) ? list : []).map(String).filter((x) => /^[A-Z0-9]{1,12}$/.test(x)).slice(0, 8);
  for (const k of [...live.keys()]) if (!coins.includes(k)) live.delete(k);
  if (!ws) { if (wanted) connectLive(); return; }
  if (ws.readyState !== 1) return;     // still opening: onopen reads the new list
  const want = await liveProducts();
  const add = want.filter((p) => !subscribed.includes(p));
  const drop = subscribed.filter((p) => !want.includes(p));
  try {
    if (drop.length) ws.send(JSON.stringify({ type: "unsubscribe", product_ids: drop, channels: ["ticker"] }));
    if (add.length) ws.send(JSON.stringify({ type: "subscribe", product_ids: add, channels: ["ticker"] }));
    subscribed = want;
    if (!want.length) ws.close();
  } catch { /* the socket closed; onclose reconnects */ }
}

/** Prices off: close the feed and stop retrying. */
function stop() {
  wanted = false;
  clearTimeout(wsRetry);
  if (ws) { try { ws.close(); } catch { /* already closing */ } }
  live.clear();
  geckoSeen.clear();
}

module.exports = { get, start, stop, setCoins, lookup, liveItems };
