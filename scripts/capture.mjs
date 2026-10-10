#!/usr/bin/env node
/**
 * Photographs of the web app and the sites as they are today, for the design
 * system file in Figma (its Screens page) and for decks.
 *
 *   node scripts/capture.mjs [folder]      default: the vault's Screens/<date>, else ./captures
 *   node scripts/capture.mjs --only app    just the web app  (or: sites, wide, phone, app-phone, sites-wide…)
 *   node scripts/capture.mjs --only desktop   the Mac app, from this checkout (see below)
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
 * The desktop app is only photographed when asked for by name, because it
 * cannot be done unseen: the app from this checkout opens on the screen for a
 * few minutes, with a data folder of its own, so nobody's favourites or
 * identity are read or changed. Its pictures are the insides of each window.
 * The title bar's three lights and the menu-bar popover's frosted material are
 * drawn by macOS, not by the page, and are not in them. The app is muted
 * throughout. Three pictures need the app to do what a listener does: a
 * station is played for the chat, with "Show other listeners" on for those few
 * seconds and off again; one shortwave receiver is tuned for the dial and its
 * waterfall, for as long as that takes to draw, then let go. What other people
 * wrote in a room is not ours to keep: their names and words are left out of
 * the picture. Your show is opened and nothing in it is pressed, so the
 * microphone is never asked for.
 *
 * No packages: Chrome is spoken to over its debugging socket, which Node has
 * the pieces for. macOS, with Google Chrome installed.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const VAULT = "/Users/mb3/Library/Mobile Documents/iCloud~md~obsidian/Documents/MB3Vault/04 Projects/AuralFM";
const args = process.argv.slice(2);
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
const given = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--only");
const day = new Date().toISOString().slice(0, 10);
const OUT = given || (fs.existsSync(VAULT) ? path.join(VAULT, "Screens", day) : path.resolve("captures", day));
const APP = process.env.CAPTURE_APP || "https://listen.auralfm.xyz/";
const SITE = "https://auralfm.xyz/", DOCS = "https://docs.auralfm.xyz/";
const want = (kind, width) => !only || only === kind || only === width || only === `${kind}-${width}`;
const web = only !== "desktop";
if (web && !fs.existsSync(CHROME)) { console.error(`capture: no Chrome at ${CHROME} (set CHROME)`); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });

const PHONE = { width: 390, height: 844, deviceScaleFactor: 2, mobile: true,
  ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1" };
const WIDE = { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false, ua: null };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── Chrome, with no window ───────────────────────────────────────── */
const PORT = 9300 + Math.floor(Math.random() * 400);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "auralfm-capture-"));
const chrome = !web ? null : spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--hide-scrollbars", "--no-first-run", "--mute-audio",
  "--autoplay-policy=user-gesture-required", "about:blank"], { stdio: "ignore" });
let desk = null, deskData = null;
const quit = () => {
  for (const c of [chrome, desk]) { try { c?.kill(); } catch { /* gone */ } }
  for (const d of [profile, deskData]) if (d) fs.rmSync(d, { recursive: true, force: true });
};
process.on("exit", quit); for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => process.exit(1));
/** Where it has got to, for the day it stalls: CAPTURE_VERBOSE=1. */
const say = (m) => { if (process.env.CAPTURE_VERBOSE) console.error(`capture: ${m}`); };

/** One socket to one page, in Chrome or in the app. */
async function attach(url) {
  const ws = new WebSocket(url); let seq = 0; const waiting = new Map();
  await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = () => no(new Error("no socket to the page")); });
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && waiting.has(d.id)) { const [ok, no] = waiting.get(d.id); waiting.delete(d.id); d.error ? no(new Error(d.error.message)) : ok(d.result); } };
  const cdp = (method, params = {}) => new Promise((ok, no) => { const id = ++seq; waiting.set(id, [ok, no]); ws.send(JSON.stringify({ id, method, params })); });
  /** Run a line of script in the page and give back what it returns. */
  const run = async (js) => (await cdp("Runtime.evaluate", { expression: `(async () => { ${js} })()`, awaitPromise: true, returnByValue: true })).result?.value;
  return { cdp, run, close: () => ws.close() };
}
const pagesAt = async (port) => (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).filter((p) => p.type === "page");
/** The page being photographed: every helper below speaks to this one. */
let page = null;
const cdp = (method, params) => page.cdp(method, params);
const run = (js) => page.run(js);
async function connect() {
  for (let i = 0; i < 60 && !page; i++) {
    try { const [first] = await pagesAt(PORT); if (first) page = await attach(first.webSocketDebuggerUrl); } catch { /* not up yet */ }
    if (!page) await sleep(250);
  }
  if (!page) throw new Error("Chrome did not start");
}

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
    // The page's own measure: a window of the app answers getLayoutMetrics with no width.
    const m = await run(`const e = document.scrollingElement || document.documentElement; return { w: Math.max(e.scrollWidth, innerWidth), h: Math.max(e.scrollHeight, innerHeight) };`);
    clip = { x: 0, y: 0, width: m.w, height: Math.min(m.h, 14000), scale: 1 };
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

/* ── the desktop app ──────────────────────────────────────────────── */
/** A window of the app by the page it shows, once it exists. */
async function windowOf(port, file, tries = 160) {
  for (let i = 0; i < tries; i++) {
    try { const hit = (await pagesAt(port)).find((p) => p.url.includes(`/renderer/${file}`)); if (hit) return attach(hit.webSocketDebuggerUrl); } catch { /* not up yet */ }
    await sleep(250);
  }
  return null;
}
/** A window that is not on screen may never draw a frame: do not wait for ever. */
const within = (ms, p) => Promise.race([p, sleep(ms).then(() => null)]);
/** A picture of the app, with any tip card it has just raised put away first. */
const snap = async (name, opts) => { await within(4000, tap("Got it").catch(() => false)); await sleep(350); return shot(name, opts); };
async function desktop() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const port = PORT + 500;
  deskData = fs.mkdtempSync(path.join(os.tmpdir(), "auralfm-capture-desk-"));
  desk = spawn(createRequire(import.meta.url)("electron"), [root, `--remote-debugging-port=${port}`, `--user-data-dir=${deskData}`, "--mute-audio"], { stdio: "ignore" });
  const said = {};
  try {
  // The splash is on screen only until the globe has drawn: catch it first.
  page = await windowOf(port, "splash.html", 60);
  if (page) { await sleep(700); said.splash = await within(9000, snap("desktop-00-splash").then(() => true, (e) => e.message)); page.close(); }
  page = await windowOf(port, "explore.html");
  if (!page) throw new Error("the desktop app did not open its window");
  await cdp("Page.enable"); await cdp("Runtime.enable");
  // Dark, and the tour already seen: the same listener as in the web pictures.
  await run(`for (let i = 0; i < 40 && !window.auralfm?.setPrefs; i++) await new Promise((r) => setTimeout(r, 250)); await window.auralfm.setPrefs({ tourSeen: true, theme: "dark", tips: false });`);
  await cdp("Page.reload"); await sleep(3000);
  said.drawn = await ready();
  await sleep(3000);
  await snap("desktop-01-globe");
  await run(`const r = await window.auralfm.placeSearch("Chicago"); const list = Array.isArray(r) ? r : (r?.places || []); const hit = list.find((p) => /Chicago/.test(p.title)) || list[0]; if (!hit) return null; await selectPlace(hit.i); return String(hit.title);`);
  await sleep(2000);
  await snap("desktop-02-town");
  await run(`const c = [...document.querySelectorAll("#chips button")].find((b) => /^FM \\d/.test(b.textContent)); c?.click();`);
  await sleep(1200);
  await snap("desktop-03-town-fm-dial");
  await run(`document.querySelector(".pinfo")?.click();`);
  await sleep(2200);
  await snap("desktop-04-station-page");
  said.opened = [];
  if (await tap("Headlines")) { said.opened.push("Headlines"); await sleep(2600); await snap("desktop-05-headlines"); await tap("Headlines"); await sleep(600); }
  if (await tap("Favorites")) { said.opened.push("Favorites"); await sleep(1500); await snap("desktop-06-favorites"); await tap("Favorites"); await sleep(600); }
  if (await tap("Globe layers")) { said.opened.push("Globe layers"); await sleep(1500); await snap("desktop-07-globe-layers"); await tap("Globe layers"); await sleep(600); }
  // Your show, opened and left alone: the microphone is asked for by a button in it, not by opening it.
  say("your show");
  if (await tap("Your show")) { said.opened.push("Your show"); await sleep(1800); await snap("desktop-12-your-show"); await tap("Your show"); await sleep(600); }
  // Chat is only there with other listeners shown and something playing.
  say("presence on");
  await within(5000, run(`await window.auralfm.setPrefs({ presence: true });`));
  say("town");
  await run(`const r = await window.auralfm.placeSearch("Chicago"); const list = Array.isArray(r) ? r : (r?.places || []); const hit = list.find((p) => /Chicago/.test(p.title)) || list[0]; if (hit) await selectPlace(hit.i);`);
  await sleep(1500);
  say("play");
  // A place's row and a station's row share a class; only a station has the small "about" button.
  const STATION = `[...document.querySelectorAll("#stationlist .st")].find((r) => r.querySelector(".pinfo"))`;
  said.played = await within(8000, run(`const row = ${STATION}; row?.click(); return row?.querySelector(".sn")?.textContent || null;`));
  // While a stream starts, the page answers slowly on a busy machine: ask a few times, never wait for ever.
  for (let i = 0; i < 12; i++) { if (await within(6000, run(`return !document.getElementById("chat").hidden && document.body.classList.contains("playing")`))) break; await sleep(1500); }
  say("chat");
  said.chat = await within(15000, run(`const chat = document.getElementById("chat"); if (chat.hidden) return "not shown"; let n = 0; for (const m of document.querySelectorAll("#chatlog .msg:not(.mine)")) { const who = m.querySelector(".who:not(.tuned)"); if (!who) continue; n++; who.textContent = "a listener"; for (const c of [...m.childNodes]) if (c !== who && !c.classList?.contains("who")) c.remove(); m.append(" (their words are left out of this picture)"); } return n + " messages from others, left out";`)) ?? "the page did not answer in time";
  said.chatShot = await within(40000, snap("desktop-13-chat-and-playing").then(() => true, (e) => e.message));
  await within(8000, run(`if (document.body.classList.contains("playing")) document.getElementById("play")?.click();`));
  await sleep(1500);
  await within(5000, run(`await window.auralfm.setPrefs({ presence: false });`));
  say("receiver");
  // A receiver's list first; then one is tuned, for the dial.
  said.receiver = await run(`const near = await window.auralfm.sdrNearest(41.88, -87.63, 1); const rx = Array.isArray(near) ? near[0] : null; if (!rx) return null; await selectReceiver(rx); return rx.name || rx.title || "a receiver";`).catch((e) => `not opened: ${e.message}`);
  await sleep(2200);
  await snap("desktop-08-shortwave-receiver");
  if (await run(`const b = [...document.querySelectorAll("#railtabs [role=radio]")].find((e) => /^Shortwave/.test(e.textContent.trim())); b?.click(); return !!b;`)) { await sleep(1500); await snap("desktop-09-shortwave-nearby"); }
  say("tune");
  // Back to the receiver's own list, and the first broadcast on it: choosing one is what tunes.
  said.tuned = await within(15000, run(`const near = await window.auralfm.sdrNearest(41.88, -87.63, 1); await selectReceiver(near[0]); await new Promise((r) => setTimeout(r, 1800)); const row = [...document.querySelectorAll("#stationlist .st")].find((r) => /kHz/.test(r.textContent)); row?.click(); return row?.querySelector(".sn")?.textContent || null;`));
  for (let i = 0; i < 14; i++) { if (await within(6000, run(`const t = document.getElementById("tuner"), w = document.getElementById("wfwait"); return !t.hidden && (!w || getComputedStyle(w).display === "none" || getComputedStyle(w).opacity === "0" || w.hidden);`))) { said.waterfall = true; break; } await sleep(1500); }
  await sleep(2500);
  said.tuner = await within(8000, run(`return !document.getElementById("tuner").hidden`));
  said.tunerShot = await within(40000, snap("desktop-14-shortwave-tuner").then(() => true, (e) => e.message));
  // Let the receiver go: its owner has a few listener slots and this was one of them.
  await within(8000, run(`if (document.body.classList.contains("playing")) document.getElementById("play")?.click(); try { tunerStop(); } catch {}`));
  await sleep(1500);
  say("settings");
  const explore = page;
  // Settings is a window of its own, asked for the way the menu asks for it.
  await within(8000, run(`window.auralfm.openSettings()`));
  page = await windowOf(port, "settings.html", 100);
  if (page) {
    // Its palettes and icons arrive from the main process a moment after the page does.
    said.palettes = await within(20000, run(`for (let i = 0; i < 40 && !document.querySelector("#palettes")?.children.length; i++) await new Promise((r) => setTimeout(r, 250)); return document.querySelector("#palettes")?.children.length || 0;`));
    await sleep(800);
    await within(30000, snap("desktop-10-settings").catch(() => {}));
    // The page scrolls inside itself, so the whole of it is photographed by
    // making the page as tall as what it holds. The window is not resized.
    const tall = await within(15000, run(`let h = innerHeight; for (const e of document.querySelectorAll("*")) if (e.scrollHeight > e.clientHeight + 4 && getComputedStyle(e).overflowY !== "visible") h = Math.max(h, e.scrollHeight + e.getBoundingClientRect().top); return { w: innerWidth, h: Math.ceil(h), dpr: devicePixelRatio };`));
    if (tall) {
      await cdp("Emulation.setDeviceMetricsOverride", { width: tall.w, height: Math.min(tall.h, 8000), deviceScaleFactor: tall.dpr, mobile: false });
      await sleep(1200);
      said.settings = await within(40000, snap("desktop-10-settings-whole").then(() => tall.h, (e) => e.message));
      await cdp("Emulation.clearDeviceMetricsOverride").catch(() => {});
    }
    page.close();
  }
  // The menu-bar popover exists from launch but is only on screen when the
  // menu-bar icon is pressed, which a script cannot do.
  page = await windowOf(port, "popover.html", 8);
  if (page) { await cdp("Page.reload").catch(() => {}); await sleep(1500); said.popover = await within(6000, snap("desktop-11-popover").then(() => true, (e) => e.message)); page.close(); }
  explore.close();
  } finally { page = null; desk.kill(); await sleep(800); }
  return said;
}

const notes = [];
let deskSaid = null;
if (web) {
  await connect();
  await cdp("Page.enable"); await cdp("Runtime.enable");
  try {
    if (want("app", "wide")) notes.push(["web app, wide", await app(WIDE, "web-wide")]);
    if (want("app", "phone")) notes.push(["web app, phone size", await app(PHONE, "web-phone")]);
    if (want("sites", "wide")) await sites(WIDE, "site-wide");
    if (want("sites", "phone")) await sites(PHONE, "site-phone");
  } finally { page?.close(); page = null; }
} else deskSaid = await desktop();
if (deskSaid) console.log(`capture: desktop app: ${JSON.stringify(deskSaid)}`);
for (const [what, r] of notes) console.log(`capture: ${what}: ${r.town || "no town found"}${r.drawn ? "" : " (the launch screen was lifted by hand: the globe may be unfinished)"}`);
console.log(`capture: ${made.length} pictures in ${OUT}`);
process.exit(0);
