#!/usr/bin/env node
/**
 * Photographs of the web app and the sites as they are today, for the design
 * system file in Figma (its Screens page) and for decks.
 *
 *   node scripts/capture.mjs [folder]      default: the vault's Screens/<date>, else ./captures
 *   node scripts/capture.mjs --only app    just the web app  (or: sites, wide, phone, app-phone, sites-wide…)
 *
 * The Screens page had four desktop screens from August and nothing of the
 * phone or the web. A screen redrawn by hand in Figma is out of date the week
 * after; a photograph taken by a script can be taken again. So this drives a
 * Chrome with no window, the same way each time: dark theme, the first-run
 * tour already seen, each panel opened in turn, and it waits for the globe.
 *
 * What it cannot show: the iPhone itself. The notch, the home bar and Safari's
 * own behaviour only exist on the phone, so the iPhone screens in Figma are
 * Melton's own screenshots. These are the web app at a phone's size.
 *
 * No packages: Chrome is spoken to over its debugging socket, which Node has
 * the pieces for. macOS, with Google Chrome installed.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const VAULT = "/Users/mb3/Library/Mobile Documents/iCloud~md~obsidian/Documents/MB3Vault/04 Projects/AuralFM";
const args = process.argv.slice(2);
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
const given = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--only");
const day = new Date().toISOString().slice(0, 10);
const OUT = given || (fs.existsSync(VAULT) ? path.join(VAULT, "Screens", day) : path.resolve("captures", day));
const APP = process.env.CAPTURE_APP || "https://listen.auralfm.xyz/";
const SITE = "https://auralfm.xyz/", DOCS = "https://docs.auralfm.xyz/";
if (!fs.existsSync(CHROME)) { console.error(`capture: no Chrome at ${CHROME} (set CHROME)`); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });

const PHONE = { width: 390, height: 844, deviceScaleFactor: 2, mobile: true,
  ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1" };
const WIDE = { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false, ua: null };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── Chrome, with no window ───────────────────────────────────────── */
const PORT = 9300 + Math.floor(Math.random() * 400);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "auralfm-capture-"));
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--hide-scrollbars", "--no-first-run", "--mute-audio",
  "--autoplay-policy=user-gesture-required", "about:blank"], { stdio: "ignore" });
const quit = () => { try { chrome.kill(); } catch { /* gone */ } fs.rmSync(profile, { recursive: true, force: true }); };
process.on("exit", quit); process.on("SIGINT", () => process.exit(1));

let ws = null, seq = 0; const waiting = new Map();
async function connect() {
  for (let i = 0; i < 60; i++) {
    try {
      const pages = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = pages.find((p) => p.type === "page");
      if (page) { ws = new WebSocket(page.webSocketDebuggerUrl); break; }
    } catch { /* not up yet */ }
    await sleep(250);
  }
  if (!ws) throw new Error("Chrome did not start");
  await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = () => no(new Error("no socket to Chrome")); });
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && waiting.has(d.id)) { const [ok, no] = waiting.get(d.id); waiting.delete(d.id); d.error ? no(new Error(d.error.message)) : ok(d.result); } };
}
const cdp = (method, params = {}) => new Promise((ok, no) => { const id = ++seq; waiting.set(id, [ok, no]); ws.send(JSON.stringify({ id, method, params })); });
/** Run a line of script in the page and give back what it returns. */
const run = async (js) => (await cdp("Runtime.evaluate", { expression: `(async () => { ${js} })()`, awaitPromise: true, returnByValue: true })).result?.value;

async function size(d) {
  await cdp("Emulation.setDeviceMetricsOverride", { width: d.width, height: d.height, deviceScaleFactor: d.deviceScaleFactor, mobile: d.mobile });
  await cdp("Emulation.setUserAgentOverride", { userAgent: d.ua || (await cdp("Browser.getVersion")).userAgent.replace("Headless", "") });
  await cdp("Emulation.setTouchEmulationEnabled", { enabled: !!d.mobile });
  await cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }, { name: "prefers-reduced-motion", value: "reduce" }] });
}
async function go(url, settle = 1500) {
  await cdp("Page.navigate", { url });
  for (let i = 0; i < 80; i++) { if (await run("return document.readyState").catch(() => "") === "complete") break; await sleep(250); }
  await sleep(settle);
}
const made = [];
async function shot(name, { full = false } = {}) {
  let clip;
  if (full) {
    const m = await cdp("Page.getLayoutMetrics");
    clip = { x: 0, y: 0, width: m.cssContentSize.width, height: Math.min(m.cssContentSize.height, 14000), scale: 1 };
  }
  const { data } = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: full, ...(clip ? { clip } : {}) });
  fs.writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(data, "base64"));
  made.push(name);
}

/* ── the web app ──────────────────────────────────────────────────── */
// The words in the page that open each thing. One place, so a renamed tab is one line here.
const tap = (label) => run(`const b = [...document.querySelectorAll("button, [role=tab], [role=button], a")].find((e) => (e.textContent || "").trim() === ${JSON.stringify(label)} || e.getAttribute("aria-label") === ${JSON.stringify(label)}); if (b) b.click(); return !!b;`);
/** The globe is drawn and the launch screen has lifted. A window that is never shown draws slowly: give it time, then lift it by hand. */
async function ready() {
  for (let i = 0; i < 100; i++) { if (await run(`return !document.getElementById("launch") || getComputedStyle(document.getElementById("launch")).display === "none"`)) return true; await sleep(300); }
  await run(`document.getElementById("launch")?.remove()`);
  return false;
}
async function app(d, tag) {
  await size(d);
  await go(APP, 2500);
  // Dark, and the tour already seen, as for somebody who has used it before.
  await run(`for (let i = 0; i < 40 && !window.auralfm?.setPrefs; i++) await new Promise((r) => setTimeout(r, 250)); await window.auralfm?.setPrefs?.({ tourSeen: true, theme: "dark" });`);
  await go(APP, 2500);
  const drawn = await ready();
  // At a phone's size, in a browser, the app offers to be put on the Home
  // Screen. Somebody who has it installed never sees that sheet.
  await sleep(1200);
  await tap("Not now");
  await sleep(2600);
  await shot(`${tag}-01-globe`);
  // A town, and its FM dial.
  const town = await run(`const r = await window.auralfm.placeSearch("Chicago"); const list = Array.isArray(r) ? r : (r?.places || []); const hit = list.find((p) => /Chicago/.test(p.title)) || list[0]; if (!hit) return null; await selectPlace(hit.i); return hit.title;`);
  await sleep(1500);
  if (d.mobile) { await tap("Explore"); await sleep(900); }
  await shot(`${tag}-02-town`);
  await run(`const c = [...document.querySelectorAll("#chips button")].find((b) => /^FM \\d/.test(b.textContent)); c?.click();`);
  await sleep(1200);
  await shot(`${tag}-03-town-fm-dial`);
  await run(`document.querySelector(".pinfo")?.click();`);
  await sleep(2200);
  await shot(`${tag}-04-station-page`);
  for (const [n, label] of [["05-headlines", "Headlines"], ["06-chat", "Chat"], ["07-favorites", "Favorites"]]) {
    if (await tap(label)) { await sleep(2600); await shot(`${tag}-${n}`); }
  }
  if (await tap("Settings")) { await sleep(1800); await shot(`${tag}-08-settings`); }
  return { drawn, town };
}

/* ── the sites ────────────────────────────────────────────────────── */
const PAGES = [["home", SITE], ["support", `${SITE}support/`], ["links", `${SITE}links/`], ["newsletter", `${SITE}newsletter/`],
  ["shop", `${SITE}shop/`], ["beta", `${SITE}beta/`], ["docs", DOCS], ["docs-for-stations", `${DOCS}stations/`]];
async function sites(d, tag) {
  await size(d);
  for (const [name, url] of PAGES) {
    await go(url, 2200);
    // The dark theme, as the app: the sites follow the same switch.
    await run(`try { localStorage.setItem("auralfm.theme", "dark"); document.documentElement.dataset.theme = "dark"; } catch {}`);
    await sleep(500);
    await shot(`${tag}-${name}`, { full: true });
  }
}

await connect();
await cdp("Page.enable"); await cdp("Runtime.enable");
const notes = [];
try {
  const want = (kind, width) => !only || only === kind || only === width || only === `${kind}-${width}`;
  if (want("app", "wide")) notes.push(["web app, wide", await app(WIDE, "web-wide")]);
  if (want("app", "phone")) notes.push(["web app, phone size", await app(PHONE, "web-phone")]);
  if (want("sites", "wide")) await sites(WIDE, "site-wide");
  if (want("sites", "phone")) await sites(PHONE, "site-phone");
} finally { ws?.close(); }
for (const [what, r] of notes) console.log(`capture: ${what}: ${r.town || "no town found"}${r.drawn ? "" : " (the launch screen was lifted by hand: the globe may be unfinished)"}`);
console.log(`capture: ${made.length} pictures in ${OUT}`);
process.exit(0);
