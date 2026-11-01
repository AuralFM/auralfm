/** The audit: Stations, places, the taxonomy, regional rules, the hidden list and headlines. */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { R, rel, fail, pass, skip, HAS_CAT, C, NO_CAT, main, EXPLORE, readSrc, channels, en, pkg } from "./lib.mjs";

// ── search folds the decimal comma ───────────────────────────────────────────
// Two lines inside norm() carry this, and breaking them fails silently: search
// keeps working, it just stops finding anything for most of the world. The six
// countries with the most frequencies in their station names all write 104,9.
{
  console.log("\nsearch finds a frequency written either way");
  const cat = await import("../../src/catalog.js").then((m) => m.default ?? m);
  if (!cat.load()) {
    skip("decimal comma", "data/stations.min.json is gitignored — runs locally");
  } else {
    const ids = (q) => cat.search(q, 60).map((x) => x.id).join(",");
    const bad = ["88.5", "101.1", "104.9"].filter((f) => ids(f) !== ids(f.replace(".", ",")));
    bad.length
      ? fail("decimal comma", `${bad.join(", ")} return different results with a comma`)
      : pass("104.9 and 104,9 return the same stations");
  }
}

// ── a favourite remembers where it is ────────────────────────────────────────
// Favourites were stored as id/title/place/country/secure — a name and a
// place-string with no point on the globe. Everything downstream that needs
// coordinates had nothing: most visibly the share card, which printed the city
// and drew no Earth. Both windows write this shape and both had to be fixed, so
// this checks both rather than the one that was noticed.
{
  console.log("\na favourite remembers where it is");
  const miss = [];
  for (const f of [EXPLORE, "src/renderer/popover.js"]) {
    const src = readSrc(f);
    const m = src.match(/favorites\.push\(\{[\s\S]{0,400}?\}\)/);
    if (!m) { miss.push(`${f}: no favorites.push found`); continue; }
    if (!/lat:\s*ch\.lat/.test(m[0]) || !/lon:\s*ch\.lon/.test(m[0])) {
      miss.push(`${f}: saves a favourite without coordinates`);
    }
  }
  if (miss.length) fail("favourite without a place", miss.join("; "));
  else pass("both windows save favourites with lat and lon");
}

// ── the catalogue does not index what nobody has searched for ───────────────
// load() folded all 38,337 titles and all 12,579 place names into two search
// haystacks before the app could paint. Measured on this machine: 3.2s for the
// channel haystack and 0.4s for the places, inside a single blocked main
// thread, on top of 2.2s of JSON.parse. In a browser that was one 8.4-second
// long task with DOMContentLoaded at 15s — a phone would be worse, and a
// session that only spins the globe never touches either array.
//
// They are built on first use now. bands[] stays eager on purpose: hydrate()
// reads it for every station shown, so it is wanted immediately and costs 0.4s.
{
  console.log("\nthe catalogue does not index what nobody has searched for");
  const src = readSrc("src/catalog.js").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const body = src.match(/function load\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/);
  const eager = [];
  if (!body) eager.push("load() is gone — this check is blind");
  // Clearing them (`haystack = placeHay = null`) is how load() hands them back
  // to the lazy builders; anything else assigned in here is the build itself.
  else for (const m of body[1].matchAll(/\b(haystack|placeHay)\s*=\s*([^;]+);/g)) {
    // Strike out the words a reset is allowed to be made of. Anything left is
    // a build: `haystack = placeHay = null` clears, `= channels.map(...)` does not.
    if (m[2].replace(/null|haystack|placeHay|[\s=]/g, ""))
      eager.push(`load() builds ${m[1]} before anything has searched`);
  }
  eager.length ? fail("the catalogue does not index what nobody has searched for", eager.join("; "))
    : pass("the search haystacks are built on first use, not at startup");
}

// ── world headlines do not hang on one gatekeeper ───────────────────────────
// World headlines were Google News' World topic, and on the web that request
// leaves from here.now's servers. Google answered it, on 2026-09-23, with its
// 503 "Sorry…" page for automated traffic — while a country edition through the
// same proxy returned 34 stories. World is where the panel opens, so the panel
// opened on nothing ("headlines are missing"). World now comes from several
// newsrooms' own feeds, and each needs a proxy route or it is a silent 404.
{
  console.log("\nworld headlines do not hang on one gatekeeper");
  const news = readSrc("src/news.js").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const build = readSrc("scripts/build-web.mjs");
  const bridge = readSrc("web/bridge.js");
  const gaps = [];
  const feeds = [...(news.match(/const WORLD_FEEDS = \[([\s\S]*?)\];/)?.[1] || "").matchAll(/url:\s*"([^"]+)"/g)].map((m) => m[1]);
  const hosts = new Set(feeds.map((u) => { try { return new URL(u).hostname; } catch { return u; } }));
  if (feeds.length < 2) gaps.push("src/news.js has no list of world feeds, so world headlines hang on one source");
  if ([...hosts].some((h) => /news\.google\./.test(h))) gaps.push("a world feed is Google News again");
  if (/\/topics\//.test(news)) gaps.push("news.js still asks for a Google News topic");
  if (!/WORLD_FEEDS/.test(build)) gaps.push("scripts/build-web.mjs does not write the feeds' proxy routes from WORLD_FEEDS");
  if (!/setFeedBase\(/.test(bridge)) gaps.push("web/bridge.js never points world headlines at the proxy routes");
  gaps.length ? fail("world headlines do not hang on one gatekeeper", gaps.join("; "))
    : pass(`world headlines come from ${hosts.size} newsrooms' own feeds, each with a route`);
}

// ── a country's headlines come from its own newsrooms ───────────────────────
// A country's headlines were Google News' edition for it. On the web that
// request leaves from the site's relay, and on 9 Oct 2026 Google refused the
// relay for every country tried (Indonesia six times out of six): "This place"
// and "Now playing" showed "Could not reach the headlines" on the web and the
// iPhone. Each country now has newsrooms of its own (src/news-feeds.js), each
// with a route, and the web asks nobody else. This runs the real module
// against a stubbed network.
{
  console.log("\na country's headlines come from its own newsrooms");
  const { createRequire } = await import("node:module");
  const req = createRequire(import.meta.url);
  const file = req.resolve(R("src/news.js"));
  const fresh = () => { delete req.cache[file]; const m = req(file); delete req.cache[file]; return m; };
  const gaps = [];
  const src = readSrc("src/news.js"), build = readSrc("scripts/build-web.mjs");
  let news = fresh();
  const feeds = news.COUNTRY_FEEDS || {}, all = Object.values(feeds).flat();
  const locales = [...src.matchAll(/"([^"]+)": \["[A-Z]{2}", "/g)].map((m) => m[1]);
  const bare = locales.filter((c) => !feeds[c]?.length);
  if (!all.length) gaps.push("src/news.js exports no COUNTRY_FEEDS");
  if (bare.length) gaps.push(`${bare.slice(0, 5).join(", ")}: a Google edition and no newsroom, so no headlines on the web`);
  const bad = all.filter((f) => !/^https:\/\/[^/]+\//.test(f.url || "") || /google\./.test(f.url) || !f.name || !/^[a-z]{2}-[a-z0-9]+$/.test(f.route || ""));
  if (bad.length) gaps.push(`${bad.slice(0, 3).map((f) => f.name || f.url).join(", ")}: not an https feed with a name and a route`);
  const routes = [...(news.WORLD_FEEDS || []), ...all].map((f) => f.route);
  if (new Set(routes).size !== routes.length) gaps.push("two feeds share a route, so one of them is never asked");
  if (!/COUNTRY_FEEDS/.test(build) || !/"news-feeds"/.test(build)) gaps.push("scripts/build-web.mjs does not carry the newsrooms or write their routes");
  if (all.length && !gaps.length) {
    const realFetch = globalThis.fetch, realLog = console.log, realWarn = console.warn;
    const rss = `<rss><channel><item><title>A headline long enough to be one</title><link>https://example.org/a</link><pubDate>Fri, 09 Oct 2026 10:00:00 GMT</pubDate></item></channel></rss>`;
    let asked = [], answer = () => new Response(rss, { status: 200 });
    globalThis.fetch = async (u) => { asked.push(String(u)); return answer(String(u)); };
    console.log = console.warn = () => {};
    try {
      const [country, list] = Object.entries(feeds).find(([c]) => locales.includes(c));
      // the web: its own routes, and nothing else
      news.setBase("/api/news"); news.setFeedBase("/api/feeds");
      const got = await news.get(country);
      if (!got.length || got[0].source !== list[0].name) gaps.push(`${country} on the web did not come back from its newsrooms`);
      if (!asked.length || asked.some((u) => !u.startsWith("/api/feeds/"))) gaps.push(`${country} on the web asked ${asked.find((u) => !u.startsWith("/api/feeds/")) || "nothing"}`);
      // the web, every newsroom down: no Google, and World still answers after
      news = fresh(); news.setBase("/api/news"); news.setFeedBase("/api/feeds");
      asked = []; answer = (u) => (list.some((f) => u.endsWith("/" + f.route)) ? new Response("no", { status: 503 }) : new Response(rss, { status: 200 }));
      let threw = false; try { await news.get(country); } catch { threw = true; }
      if (!threw) gaps.push("with every newsroom down, the web still returned something for the country");
      if (asked.some((u) => u.startsWith("/api/news"))) gaps.push("with every newsroom down, the web asked Google through the relay that Google refuses");
      let world = null; try { world = await news.get(null); } catch { /* reported below */ }
      if (!world?.length) gaps.push("a country's newsrooms failing stopped World headlines too");
      // the desktop, every newsroom down: Google's edition, as before
      news = fresh(); asked = []; answer = (u) => (/^https:\/\/news\.google\.com\//.test(u) ? new Response(rss, { status: 200 }) : new Response("no", { status: 503 }));
      let fell = null; try { fell = await news.get(country); } catch { /* reported below */ }
      if (!fell?.length || !asked.some((u) => /^https:\/\/news\.google\.com\//.test(u))) gaps.push("with every newsroom down, the desktop did not fall back to Google's edition");
    } catch (e) { gaps.push(`the check itself failed: ${e.message}`); }
    finally { globalThis.fetch = realFetch; console.log = realLog; console.warn = realWarn; }
  }
  gaps.length ? fail("a country's headlines come from its own newsrooms", gaps.join("; "))
    : pass(`${Object.keys(feeds).length} countries have ${all.length} newsrooms of their own, each with a route; the web asks nobody else`);
}

// ── world headlines read in the web app, and nothing pretends to ────────────
// The web version opened every headline in a new tab, because a page cannot
// fetch another site's article. The world feeds' stories now read in the app
// through a route per newsroom. Two ways that breaks quietly: a newsroom with
// no route (its stories fail as "does not open in AuralFM"), and a Google News
// link sent to the reader (it leads to Google, never the publisher, so it could
// only fail). This runs the real reader against a stubbed network.
{
  console.log("\nworld headlines read in the web app, and nothing pretends to");
  const { createRequire } = await import("node:module");
  const req = createRequire(import.meta.url);
  const file = req.resolve(R("src/news.js"));
  delete req.cache[file];
  const news = req(file);
  delete req.cache[file];
  const gaps = [];
  const build = readSrc("scripts/build-web.mjs");
  const after = readSrc("web/after.js").replace(/\/\*[\s\S]*?\*\//g, "");
  const feeds = news.WORLD_FEEDS || [];
  const noSite = feeds.filter((f) => !/^https:\/\/[^/]+$/.test(f.site || "")).map((f) => f.name);
  if (noSite.length) gaps.push(`no site for ${noSite.join(", ")}, so its stories cannot be read on the web`);
  if (!/\/api\/read\/\$\{f\.route\}\/\*/.test(build)) gaps.push("scripts/build-web.mjs writes no /api/read/<route>/* routes");
  if (!/setReadBase\(/.test(readSrc("web/bridge.js"))) gaps.push("web/bridge.js never points the reader at its routes");
  if (!/canReadArticle\(/.test(after)) gaps.push("web/after.js opens the reader without asking whether it can read the story");
  if (typeof news.setReadBase !== "function" || typeof news.canRead !== "function") gaps.push("news.js has no setReadBase/canRead");
  else {
    const realFetch = globalThis.fetch;
    const asked = [];
    const para = "<p>" + "A paragraph long enough to count as prose rather than a caption. ".repeat(2) + "</p>";
    globalThis.fetch = async (u) => { asked.push(String(u)); return new Response(`<title>T</title><article>${para.repeat(3)}</article>`, { status: 200 }); };
    try {
      news.setReadBase("/api/read");
      for (const f of feeds.filter((x) => x.site)) {
        const doc = await news.read(`${f.site}/news/story-1?x=1`);
        const want = `/api/read/${f.route}/news/story-1?x=1`;
        if (!doc?.paragraphs?.length) gaps.push(`a ${f.name} story did not read`);
        if (asked.at(-1) !== want) gaps.push(`a ${f.name} story was fetched from ${asked.at(-1)}, not ${want}`);
      }
      const google = "https://news.google.com/rss/articles/CBMiabc?oc=5";
      if (news.canRead(google)) gaps.push("the web reader says it can read a Google News link");
      const n = asked.length;
      if (await news.read(google)) gaps.push("the web reader read a Google News link");
      if (asked.length !== n) gaps.push("the web reader fetched a link no route serves");
    } finally { globalThis.fetch = realFetch; }
  }
  gaps.length ? fail("world headlines read in the web app, and nothing pretends to", gaps.join("; "))
    : pass(`${feeds.length} newsrooms' stories read through their own routes; Google links open out`);
}

// ── the reader decodes an entity once ──────────────────────────────────────
// news.js decoded &amp; before &lt;, so an article that wrote "&amp;lt;" (a
// story about HTML, say) showed "<" where its author wrote "&lt;". Found by
// CodeQL (js/double-escaping, alert 6).
{
  const { createRequire } = await import("node:module");
  const req = createRequire(import.meta.url);
  const file = req.resolve(R("src/news.js"));
  delete req.cache[file];
  const news = req(file);
  delete req.cache[file];
  const site = (news.WORLD_FEEDS || []).find((x) => x.site);
  const realFetch = globalThis.fetch;
  const prose = "Write &amp;lt;b&amp;gt; to make a word bold, said the station's web editor, Tom &amp; Jerry's producer.";
  globalThis.fetch = async () => new Response(`<title>T</title><article><p>${prose}</p><p>${prose}</p></article>`, { status: 200 });
  let got = "";
  try { news.setReadBase("/api/read"); got = (await news.read(`${site.site}/news/story-2`))?.paragraphs?.[0] || ""; }
  finally { globalThis.fetch = realFetch; }
  got.includes("&lt;b&gt;") && got.includes("Tom & Jerry")
    ? pass("the reader decodes \"&amp;lt;\" to \"&lt;\" and \"&amp;\" to \"&\", once each")
    : fail("the reader decodes an entity once", `read "${got.slice(0, 80)}"`);
}

// ── the taxonomy reads a station the way a listener would ──────────────────
// src/taxonomy.js sorts stations into genres, scenes, formats and moods from
// their tags, names and countries. Each case below is a way it went wrong while
// it was being written, or would: "classic hits" read as chart pop, "metallica"
// as metal, a Bangkok news station as Thai music, a hundred tags as everything.
{
  console.log("\nthe taxonomy reads a station the way a listener would");
  const { createRequire } = await import("node:module");
  const T = createRequire(import.meta.url)(R("src/taxonomy.js"));
  const soup = Array.from({ length: T.TAG_SOUP + 1 }, (_, i) => ["techno", "yoga", "christmas", "jazz"][i % 4] + (i > 3 ? i : ""));
  const cases = [
    [{ tags: ["hits"] }, "genres", "pop", true, "\"hits\" is chart pop"],
    [{ tags: ["classic hits"] }, "genres", "pop", false, "\"classic hits\" is oldies, not chart pop"],
    [{ tags: ["classic hits"] }, "moods", "feel-good", true, "\"classic hits\" feels good"],
    [{ tags: ["Hip-Hop"] }, "genres", "hip-hop", true, "\"Hip-Hop\" and \"hip hop\" are one"],
    [{ tags: ["metallica"] }, "genres", "metal", false, "\"metallica\" is a band, not the genre"],
    [{ tags: ["christian contemporary"] }, "genres", "christian", true, "a term inside a longer tag counts"],
    [{ tags: [], title: "Jazz FM 102" }, "genres", "jazz", true, "a station with no tags is found by an unmistakable name"],
    [{ tags: [], title: "Love FM" }, "moods", "love", false, "\"Love FM\" is a name, not a love-songs station"],
    [{ tags: ["pop"], country: "Japan" }, "genres", "j-pop", true, "pop from Japan is J-pop"],
    [{ tags: ["news"], country: "Thailand" }, "scenes", "thai", false, "a news station is not a music scene"],
    [{ tags: ["pop"], country: "Thailand" }, "scenes", "thai", true, "music from Thailand is the Thai scene"],
    [{ tags: soup }, "formats", "variety", true, "a station tagged with everything is Variety"],
    [{ tags: soup }, "genres", "techno", false, "…and is not every genre in its list"],
  ];
  const wrong = cases.filter(([st, axis, id, want]) =>
    T.classify({ title: "", country: "", ...st })[axis].includes(id) !== want);
  wrong.length
    ? fail("the taxonomy reads a station the way a listener would", wrong.map((c) => c[4]).join("; "))
    : pass(`${cases.length} readings hold: hits, classic hits, names, places, tag soup`);
}

// ── a donation link is the station's own page, and never for a sanctioned country
// Stations that can't take a Lightning address (a 501(c)(3) like 8-Ball Radio)
// get a Donate link to their own page. It must be https, the
// station's own page before any platform, not a paid membership, and absent
// wherever tips are absent: Cuba, Iran, North Korea and Syria.
{
  const name = "a donation link is the station's own page, and never for a sanctioned country";
  console.log(`\n${name}`);
  const bad = [];
  if (!HAS_CAT) skip(name, NO_CAT); else {
  const src = fs.readFileSync(C("scripts/enrich.mjs"), "utf8");
  const a = src.indexOf("const GIVING"), b = src.indexOf("/**\n * What a homepage says");
  const donationPage = a < 0 || b < 0 ? null : new Function(src.slice(a, b) + "; return donationPage;")();
  if (!donationPage) bad.push("scripts/enrich.mjs has no donationPage()");
  else {
    const cases = [
      [["https://donorbox.org/x", "/donate"], "https://www.kexp.example/donate", "the station's own page before a platform"],
      [["https://www.paypal.com/donate?hosted_button_id=1"], "https://www.paypal.com/donate?hosted_button_id=1", "a PayPal donation"],
      [["http://kexp.example/donate"], undefined, "http is refused"],
      [["/supporters", "/membership", "/support"], undefined, "a membership or help page is not a donation"],
      [["https://pledge.kexp.example/give"], "https://pledge.kexp.example/give", "a giving page on its own subdomain"],
    ];
    for (const [hrefs, want, what] of cases) {
      const got = donationPage(hrefs, "https://www.kexp.example/");
      if (got !== want) bad.push(`${what}: got ${got}`);
    }
  }
  const prof = fs.readFileSync(C("scripts/profiles.mjs"), "utf8");
  if (!/donate:\s*NO_TIPS\.has\(c\.country\)\s*\?\s*undefined/.test(prof)) bad.push("scripts/profiles.mjs writes a donation page for a sanctioned country");
  const ui = fs.readFileSync(R("src/renderer/explore-profile.js"), "utf8");
  if (!/const donate = !p\.noTips && \/\^https:/.test(ui)) bad.push("the station card shows Donate without checking noTips and https");
  bad.length ? fail(name, bad.join("; ")) : pass("own page first, https only, no memberships, none where tips are barred");
  }
}

// ── a station's profile is found where it was filed ───────────────────────
// scripts/profiles.mjs files each profile under a hash of the station id; the
// desktop (src/profiles.js) and the web (web/bridge.js) look it up by the same
// hash. Three copies of one function: if one drifts, every profile opens empty
// on that side and nothing says why. Compared by running all three.
{
  console.log("\na station's profile is found where it was filed");
  const { createRequire } = await import("node:module");
  const { pathToFileURL } = await import("node:url");
  const desktop = createRequire(import.meta.url)(R("src/profiles.js")).shardOf;
  const build = HAS_CAT ? (await import(pathToFileURL(C("scripts/lib/shard.mjs")).href).catch(() => null))?.shardOf : desktop;
  const bridgeSrc = fs.readFileSync(R("web/bridge.js"), "utf8");
  const body = /const shardOf = \(id\) => \{([\s\S]*?)\n\s*\};/.exec(bridgeSrc)?.[1];
  const web = body ? new Function("id", body) : null;
  const ids = ["af-3k9m2qx7", "af-0000zzzz", "k3hL3UUv", "x", "af-t4pd8w1n"];
  const bad = !build ? "scripts/lib/shard.mjs exports no shardOf" : !web ? "web/bridge.js has no shardOf" :
    ids.filter((id) => !(desktop(id) === build(id) && build(id) === web(id))).map((id) => `${id}: ${desktop(id)}/${build(id)}/${web(id)}`).join(", ");
  bad ? fail("a station's profile is found where it was filed", bad)
      : pass("the build, the desktop and the web file a profile under the same hash");
}

// ── "Hide explicit stations" hides them ───────────────────────────────────
// Explicit stations are listed and labelled; the setting
// leaves them out of lists, search and shuffle. Checked on the real catalogue:
// an explicit station is found by its name with the setting off, not with it on.
{
  console.log("\n\"Hide explicit stations\" hides them");
  const { createRequire } = await import("node:module");
  const cat = createRequire(import.meta.url)(R("src/catalog.js"));
  if (!fs.existsSync(R("data/stations.min.json"))) skip("\"Hide explicit stations\" hides them", "no catalogue — runs locally");
  else {
    const log = console.log; console.log = () => {}; cat.load(); console.log = log;
    const min = JSON.parse(fs.readFileSync(R("data/stations.min.json"), "utf8"));
    const x = min.c.find((c) => c[7] === 1);
    if (!x) skip("\"Hide explicit stations\" hides them", "the catalogue has no explicit station to try");
    else {
      cat.setHideExplicit(false);
      const shown = cat.search(x[1], 200).some((s) => s.id === x[0] && s.explicit);
      cat.setHideExplicit(true);
      const hidden = !cat.search(x[1], 200).some((s) => s.id === x[0]);
      cat.setHideExplicit(false);
      shown && hidden ? pass(`"${x[1]}" is listed and marked, and gone with the setting on`)
        : fail("\"Hide explicit stations\" hides them", `${shown ? "" : "not listed and marked with the setting off; "}${hidden ? "" : "still found with it on"}`);
    }
  }
}

// ── foreign music stations are held back in the UK and the EU ──────────────
// Option 3 of docs/LEGAL-AND-SECURITY.md §9: on London time a
// US music station is listed but held, a UK one and a speech station elsewhere
// are not, the shuffle lands only on what can play, and the two places that
// start a stream (the desktop's resolve, the web bridge's tune) ask first. On
// Los Angeles time nothing at all is held.
{
  const name = "foreign music stations are held back in the UK and the EU, and nowhere else";
  console.log("\nforeign music stations are held back in the UK and the EU");
  const { createRequire } = await import("node:module");
  const cat = createRequire(import.meta.url)(R("src/catalog.js"));
  if (!fs.existsSync(R("data/stations.min.json"))) skip(name, "no catalogue — runs locally");
  else {
    const log = console.log; console.log = () => {}; cat.load(); console.log = log;
    const min = JSON.parse(fs.readFileSync(R("data/stations.min.json"), "utf8"));
    const country = (c) => min.p[c[2]][1];
    const us = min.c.find((c) => country(c) === "United States" && c[8] !== 1 && c[4]);
    const uk = min.c.find((c) => country(c) === "United Kingdom");
    const talk = min.c.find((c) => country(c) === "United States" && c[8] === 1);
    const bad = [];
    if (!us || !uk || !talk) bad.push("the catalogue has no speech slot (run scripts/profiles.mjs)");
    else {
      cat.setRegion("Europe/London");
      if (!cat.held({ id: us[0] }) || !cat.byId(us[0])?.held) bad.push(`"${us[1]}" (US music) plays in London`);
      if (cat.held({ id: uk[0] })) bad.push(`"${uk[1]}" (UK) is held in London`);
      if (cat.held({ id: talk[0] })) bad.push(`"${talk[1]}" (US talk) is held in London`);
      if (cat.held({ id: "my:abc" })) bad.push("a station of your own is held");
      for (let k = 0; k < 40; k++) { const r = cat.randomChannel(); if (!r || r.held) { bad.push("the shuffle landed on a held station, or nothing"); break; } }
      cat.setRegion("America/Los_Angeles");
      if (cat.held({ id: us[0] }) || cat.held({ id: uk[0] })) bad.push("something is held in Los Angeles");
      cat.setRegion();
    }
    const ipc = fs.readFileSync(R("src/main/ipc-catalog.js"), "utf8");
    const bridge = fs.readFileSync(R("web/bridge.js"), "utf8");
    if (!/catalog\.held\(ch\)\)\s*return \{ held: true \}/.test(ipc)) bad.push("the desktop resolves a stream without asking catalog.held");
    if (!/M\.catalog\.held\(ch\)\) return setStatus/.test(bridge)) bad.push("the web bridge tunes without asking catalog.held");
    bad.length ? fail(name, bad.join("; ")) : pass(`"${us[1]}" is held in London and plays in Los Angeles; "${uk[1]}" and "${talk[1]}" play in both`);
  }
}

// ── headlines say when they failed, and the newest answer wins ──────────────
// Reported from the iOS PWA on 2026-09-23 as "sometimes it works, sometimes it
// doesn't". Four faults, each enough on its own:
//  - news.get() answered a failure with [], so the panel's "Could not reach the
//    headlines · Try again" state was unreachable: a dropped request on a phone
//    read as "unavailable right now", with a cooldown behind it of up to 30
//    minutes across every country;
//  - Try again called loadNews(), which does nothing for World or This place;
//  - renders overlapped with no token, so the slowest answer painted last —
//    a panel headed "France" could fill with the world edition;
//  - every player status message repainted the panel, flashing it back to
//    placeholders and fetching again while a station buffered.
{
  console.log("\nheadlines say when they failed, and the newest answer wins");
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const news = strip(readSrc("src/news.js"));
  const panels = strip(readSrc("src/renderer/explore-panels.js"));
  const playback = strip(readSrc("src/renderer/explore-playback.js"));
  const gaps = [];
  const get = news.match(/async function get\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/);
  if (!get) gaps.push("news.get is gone — this check is blind");
  else {
    if (/return\s*\[\s*\]/.test(get[1])) gaps.push("news.get answers a failure with [], which the panel reads as 'no headlines'");
    if (!/throw\b/.test(get[1])) gaps.push("news.get never throws, so the panel cannot tell a failure from an empty feed");
  }
  const render = panels.match(/async function renderNewsPanel\s*\(\)\s*\{([\s\S]*?)\n\}/);
  if (!render) gaps.push("renderNewsPanel is gone — this check is blind");
  else {
    const body = render[1];
    const token = body.match(/const (\w+) = \+\+(\w+);/);
    if (!token || !new RegExp(`${token[1]}\\s*!==\\s*${token[2]}`).test(body))
      gaps.push("renderNewsPanel has no token, so an older answer can paint over a newer one");
    const retry = body.match(/again\.onclick\s*=\s*([^;]+);/);
    if (retry && /loadNews/.test(retry[1])) gaps.push("Try again calls loadNews, which does nothing for World or This place");
  }
  if (/renderNewsPanel\s*\(/.test(playback))
    gaps.push("the player's status handler repaints the headlines on every message");
  gaps.length ? fail("headlines say when they failed", gaps.join("; "))
    : pass("a failed fetch offers Try again, which retries, and only the newest render paints");
}

// ── a description is words, and a name is a name ────────────────────────────
// 2,190 stations showed their description as "&#x62F;&#x627;…": pages in
// Arabic, Russian and Thai write letters as hexadecimal references and the
// decoder knew only decimal ones. Twenty more were "named" by a stream URL
// pasted into the name field, which no list or card can wrap. Both were found
// by throwing the catalogue's own worst cases at the phone layout (break-ui).
{
  console.log("\na description is words, and a name is a name");
  const gaps = [];
  if (!HAS_CAT) skip("a description is words, and a name is a name", NO_CAT); else {
  const { pathToFileURL } = await import("node:url");
  const { decodeEntities } = await import(pathToFileURL(C("scripts/lib/entities.mjs")).href);
  const { urlTitle } = await import(pathToFileURL(C("scripts/lib/match.mjs")).href);
  const cases = [["&#x62F;&#x627;&#x631;", "دار"], ["Caf&eacute; &amp; bar", "Café & bar"], ["&amp;#1056;&#1072;&#1076;&#1080;&#1086;", "Радио"], ["R&B", "R&B"]];
  for (const [inp, want] of cases) if (decodeEntities(inp) !== want) gaps.push(`decodeEntities(${inp}) gives ${decodeEntities(inp)}, not ${want}`);
  if (!urlTitle("https://stream.example.com/live.mp3") || urlTitle("Radio https://example.com") || urlTitle("KEXP 90.3")) gaps.push("urlTitle no longer tells a web address from a name");
  const min = R("data/stations.min.json"), prof = R("data/profiles");
  if (!fs.existsSync(min) || !fs.existsSync(prof)) skip("a description is words: the catalogue", "data/ is not built");
  else {
    const named = JSON.parse(fs.readFileSync(min, "utf8")).c.filter((c) => urlTitle(c[1])).length;
    if (named) gaps.push(`${named} station(s) in the bundle are named by a web address`);
    let coded = 0;
    for (const f of fs.readdirSync(prof)) if (/&#x?[0-9a-f]{2,6};/i.test(fs.readFileSync(path.join(prof, f), "utf8"))) coded++;
    if (coded) gaps.push(`${coded} profile file(s) still carry character references`);
  }
  gaps.length ? fail("a description is words, and a name is a name", gaps.join("; "))
    : pass("character references are decoded (decimal, hex, named, twice-escaped) and no station is named by a URL");
  }
}

// ── AuralFM can take a show off its list ─────────────────────────────────────
// The Terms say AuralFM "can hide a show from the apps" and removes what a
// valid copyright notice identifies. Until 8 Oct 2026 nothing in the app could:
// the promise was words. data/hidden-shows.json is the list, src/unlisted.js
// reads it, and explore-shows.js keeps a listed host off the globe and out of
// On air. A takedown that is cached, shipped only with the next release, or
// undone by one malformed line is not a takedown.
{
  console.log("\nAuralFM can take a show off its list");
  const gaps = [];
  const { createRequire } = await import("node:module");
  const { read } = createRequire(import.meta.url)(R("src/unlisted.js"));
  const A = "ab".repeat(32), B = "cd".repeat(32), C = "ef".repeat(32), now = Date.parse("2026-10-09T12:00:00Z");
  const got = read({ v: 1, hosts: [{ key: A }, { key: B.toUpperCase(), until: "2026-10-09" }, { key: C, until: "2026-10-08" }, { key: "not a key" }, null] }, now) || [];
  if (!got.includes(A)) gaps.push("a listed host is not hidden");
  if (!got.includes(B)) gaps.push("a key in capitals, or a hiding on its last day, is let through");
  if (got.includes(C)) gaps.push("a hiding that has ended still hides");
  if (got.length !== 2) gaps.push("a malformed entry was taken for a host");
  if (read({ v: 2, hosts: [] }) !== null || read("x") !== null || read(null) !== null) gaps.push("a file that is not ours is read as an empty list, which would unhide everyone");
  if (!Array.isArray(read(JSON.parse(readSrc("data/hidden-shows.json"))))) gaps.push("data/hidden-shows.json is not a list the apps can read");
  const shows = readSrc("src/renderer/explore-shows.js");
  if (!/live = unlistedKnown \? announced\.filter\(listed\) : \[\];/.test(shows)) gaps.push("shows are listed before the hidden list has answered, or without it");
  if (!/if \(!listed\(peer\)\) return;/.test(shows)) gaps.push("a hidden show can still be tuned to");
  // Measured 17 Oct 2026 with a stand-in host: a show taken down while it was
  // being listened to stopped, then stayed in On air, Listen button and all,
  // because the list kept the last show tuned to whatever its state.
  if (!/if \(show && !listed\(show\.peer\)\) \{\s*end\(\);/.test(shows)) gaps.push("a show taken down while it is listened to is not stopped and let go");
  const held = /const held = \(\) => ([^;]+);/.exec(shows)?.[1] || "";
  if (!/listed\(show\.peer\)/.test(held) || /^!!show &&\s*\(/.test(held) || !/told\(show\)/.test(held)) gaps.push("the show tuned to is kept on the list after it ends or is taken down");
  if ((shows.match(/held\(\) && !rows\.some/g) || []).length < 2 || /if \(show && !rows\.some/.test(shows)) gaps.push("On air or the globe keeps the show tuned to by a rule of its own");
  if (!/if \(Array\.isArray\(keys\)\) unlisted = new Set\(keys\);/.test(shows)) gaps.push("no answer empties the list instead of leaving it");
  if (!/hidden-shows\.json"\)\) return;/.test(readSrc("web/sw.js"))) gaps.push("the web app reads the hidden list from its cache");
  const web = readSrc("scripts/build-web.mjs");
  if (!/copy\("data\/hidden-shows\.json"/.test(web) || !/rel === "data\/hidden-shows\.json"\) continue;/.test(web)) gaps.push("the web build does not carry the list, or precaches it");
  if (!/listen\.auralfm\.xyz\/data\/hidden-shows\.json/.test(readSrc("src/hidden-shows.js"))) gaps.push("the desktop reads only the copy it shipped with");
  if (!pkg.build.files.includes("data/hidden-shows.json")) gaps.push("the Mac build ships without the list");
  if (!/list of shows AuralFM no longer lists/.test(readSrc("docs/PRIVACY.md"))) gaps.push("the privacy policy does not name the request");
  // The web asked once a minute and the desktop every half hour, while the
  // policy said half an hour for both. One interval, and the policy says it.
  const every = /const EVERY_MS = ([\d\s*_]+);/.exec(readSrc("src/hidden-shows.js"))?.[1];
  const ms = every ? Function(`return ${every.replace(/_/g, "")}`)() : NaN;
  if (!(ms <= 60_000)) gaps.push(`the desktop reads the hidden list every ${Math.round(ms / 60000)} minutes, so a takedown waits that long there`);
  if (!/asking = null; \}, 60_000\)/.test(shows)) gaps.push("the page re-reads the hidden list on an interval other than a minute");
  if (!/no longer lists\. Asked for only while a show is on air to be listed, at most once a minute/.test(readSrc("docs/PRIVACY.md"))) gaps.push("the privacy policy does not say how often the hidden list is read");
  gaps.length ? fail("AuralFM can take a show off its list", gaps.join("; "))
    : pass("a listed host is off the globe and On air in both apps, read fresh, and a damaged file hides and unhides nobody");
}

// ── a receiver that asked to be left out stays out ───────────────────────────
// The public promise to the people who run shortwave receivers: ask, and you
// are out, and the app never learns you existed. The crawl leaves them out of
// the shipped list. But the app also refreshed that list from the public one
// twice a day and took every receiver on it, so the first operator to opt out
// would have been back within hours (found 8 Oct 2026, before anyone had).
// Run for real, with the network and the cache faked.
{
  console.log("\na receiver that asked to be left out stays out");
  const gaps = [];
  if (!fs.existsSync(R("data/sdr.min.json"))) skip("a receiver that asked to be left out stays out", "no receiver list here");
  else {
    const { createRequire } = await import("node:module");
    const os = await import("node:os");
    const req = createRequire(import.meta.url);
    const shipped = JSON.parse(readSrc("data/sdr.min.json"));
    const mine = shipped.r.slice(0, 400).map((row) => row[0]);
    const OUT = "left-out.example:8073";
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "auralfm-sdr-"));
    // A cache from an older build, newer than the shipped list, naming the host.
    fs.writeFileSync(path.join(tmp, "sdr.json"), JSON.stringify({ g: "2099-01-01T00:00:00.000Z", src: null, r: [...shipped.r.slice(0, 400), [OUT, "x", "y", 10, 10, 4, 0]] }));
    delete req.cache[req.resolve(R("src/sdr.js"))];
    const sdr = req(R("src/sdr.js"));
    const log = console.log, warn = console.warn; console.log = console.warn = () => {};
    const realFetch = globalThis.fetch;
    try {
      sdr.init(tmp);
      const has = () => sdr.points().some((p) => p.host === OUT);
      if (has()) gaps.push("a cached list brings a host this build does not list back at launch");
      const page = "var kiwisdr_com = " + JSON.stringify([...mine, OUT].map((h) => ({ status: "active", offline: "no", gps: "(10.5, 20.5)", url: `http://${h}`, name: "n", loc: "l", users_max: "4", asl: "0" }))) + ";";
      globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => page });
      await sdr.refresh();
      if (has()) gaps.push("a refresh from the public list adds a host this build does not list");
      // The refresh stamps the list with the time it was taken.
      if (sdr.stats().generated === "2099-01-01T00:00:00.000Z") gaps.push("the refresh was not taken at all, so this check proved nothing");
    } catch (e) { gaps.push(`could not run the receiver list: ${e.message}`); }
    finally { globalThis.fetch = realFetch; console.log = log; console.warn = warn; fs.rmSync(tmp, { recursive: true, force: true }); delete req.cache[req.resolve(R("src/sdr.js"))]; }
    gaps.length ? fail("a receiver that asked to be left out stays out", gaps.join("; "))
      : pass("neither a refresh nor an old cache can add a receiver this build was not shipped with");
  }
}

// ── the catalogue's code here is the catalogue's ────────────────────────────
// 12 Oct 2026. The station list, the taxonomy and their build moved to their
// own repository, AuralFM/catalogue. The app keeps copies of the three files
// it runs (src/catalog.js, src/taxonomy.js, src/region.js) so that a checkout,
// a worktree and a packaged app still work alone. A copy edited here would be
// overwritten by the next `npm run catalogue`, and a fix made there and never
// brought over would never ship. Compared byte for byte.
{
  const name = "the catalogue's code here is the catalogue's";
  console.log(`\n${name}`);
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync(process.execPath, [R("scripts/catalogue.mjs"), "--check"], { encoding: "utf8" });
  if (r.status === 2) skip(name, NO_CAT);
  else if (r.status !== 0) fail(name, (r.stdout + r.stderr).trim());
  else pass("src/catalog.js, src/taxonomy.js and src/region.js match the catalogue's, byte for byte");
}

// ── a vibe counts what this copy shows ──────────────────────────────────────
// 13 Oct 2026. "Some stations in Vibes do not show on the web app." A vibe
// counted every station carrying its tags; the web shows only what a page
// served over https can play. So a vibe said 969 and showed 743, 1,318 of its
// rows across the vibes opened a place with nothing of that vibe in it, and a
// link to one of the missing stations opened the app on some other station
// without a word. Run against the catalogue as the web loads it.
{
  const name = "a vibe counts what this copy shows";
  console.log(`\n${name}`);
  const gaps = [];
  if (!fs.existsSync(R("data/stations.min.json"))) skip(name, "no built catalogue here (npm run catalogue)");
  else {
    const { createRequire } = await import("node:module");
    const req = createRequire(import.meta.url);
    const file = req.resolve(R("src/catalog.js"));
    delete req.cache[file];
    const log = console.log; console.log = () => {};
    const cat = req(file); cat.load(); cat.setPlayableOnly(true);
    console.log = log;
    let said = 0, shown = 0, empty = 0;
    for (const v of cat.VIBES) {
      const want = new Set(v.tags);
      for (const p of cat.vibePlaces(v.id)) {
        const n = cat.placeChannels(p.i).channels.filter((c) => c.tags.some((t) => want.has(t.toLowerCase()))).length;
        said += p.n; shown += n; if (!n) empty++;
      }
    }
    delete req.cache[file];
    if (shown < 10000) gaps.push(`only ${shown} stations found in the vibes — this check is blind`);
    if (said !== shown) gaps.push(`the vibes say ${said.toLocaleString()} stations and show ${shown.toLocaleString()}`);
    if (empty) gaps.push(`${empty.toLocaleString()} rows open a place with nothing of that vibe to play`);
    const bridge = readSrc("web/bridge.js");
    const cue = bridge.slice(bridge.indexOf("async function cueAsked("), bridge.indexOf("async function cueAsked(") + 1400);
    if (!/Not playable here/.test(cue) || !/No longer listed/.test(cue) || !/setStatus\(why, false, true\)/.test(cue)) gaps.push("a link to a station the web cannot show opens another one and says nothing");
    if (!/\.now\.notice #nowStatus/.test(readSrc("web/web.css")) || !/classList\.toggle\("notice"/.test(readSrc(EXPLORE))) gaps.push("on a phone that line is cut to its first few letters");
    gaps.length ? fail(name, gaps.join("; ")) : pass(`${shown.toLocaleString()} stations across ${cat.VIBES.length} vibes, each one counted is one shown; a link to a missing one says why`);
  }
}

// ── a place is named after a town ───────────────────────────────────────────
// Seen in the app: "Truro area area", a hundred miles from
// Truro, holding one station called Jack FM Halifax. A station too far from
// any town to join it gets a place of its own, "<nearest town> area", and the
// nearest place was sometimes another "… area" or a country's stand-in. Eight
// places shipped that way ("Seoul area area", "Across Germany area").
{
  const name = "a place is named after a town";
  console.log(`\n${name}`);
  if (!fs.existsSync(R("data/stations.min.json"))) skip(name, "no built catalogue here (npm run catalogue)");
  else {
    const places = JSON.parse(fs.readFileSync(R("data/stations.min.json"), "utf8")).p.map((p) => p[0]);
    const bad = places.filter((t) => / area area$/.test(t) || /^(Across |Somewhere in |Online).* area$/.test(t));
    const gaps = [];
    if (places.filter((t) => / area$/.test(t)).length < 50) gaps.push("almost no \"… area\" places found — this check is blind");
    if (bad.length) gaps.push(`${bad.length} places are named after a stand-in: ${bad.slice(0, 4).join(", ")}`);
    if (HAS_CAT) {
      const build = fs.readFileSync(C("scripts/expand.mjs"), "utf8");
      if (!/nearestTown\(s\.lat, s\.lon\)\[1\] <= 150/.test(build) || !/if \(standIn\(full\.places\[i\]\)\) continue;/.test(build)) gaps.push("the build still names a place after whatever place is nearest");
    }
    gaps.length ? fail(name, gaps.join("; ")) : pass(`${places.filter((t) => / area$/.test(t)).length} "… area" places, each named after a real town`);
  }
}

// ── every country in the catalogue is one the gazetteer knows ───────────────
// The catalogue writes "Türkiye", "Côte d'Ivoire", "Cape Verde"; GeoNames
// writes "Turkey", "Ivory Coast", "Cabo Verde". ccOf() returned null for
// eleven such names, so no station in them could be placed, by its name or by
// hand: 830 in Türkiye alone, and the first hand-placing sheet's Istanbul rows
// came back "not found". Read from the catalogue's checkout.
{
  const name = "every country in the catalogue is one the gazetteer knows";
  console.log(`\n${name}`);
  if (!HAS_CAT || !fs.existsSync(C("data/geonames/countryInfo.txt")) || !fs.existsSync(C("data/stations.json")))
    skip(name, "no catalogue checkout with its gazetteer and a built list here");
  else {
    const { loadGazetteer } = await import(pathToFileURL(C("scripts/lib/gazetteer.mjs")).href);
    const G = loadGazetteer(C("data/geonames"));
    const counts = new Map();
    for (const c of JSON.parse(fs.readFileSync(C("data/stations.json"), "utf8")).channels)
      if (c.country && c.country !== "Null Island") counts.set(c.country, (counts.get(c.country) || 0) + 1);
    const lost = [...counts].filter(([c]) => !G.ccOf(c)).sort((a, b) => b[1] - a[1]);
    lost.length ? fail(name, `no country code for ${lost.map(([c, n]) => `${c} (${n})`).join(", ")}: their stations cannot be placed`)
      : pass(`all ${counts.size} countries resolve to a code`);
  }
}

// ── every place is on the globe ─────────────────────────────────────────────
// radio-browser gave Bangkok Community Radio its position with latitude and
// longitude swapped (100.5, 13.76). The build made a place "Bangkok" there,
// at a latitude no globe has, and the station sat off the map. A position is
// a latitude within ±90° and a longitude within ±180°, or it is no position.
// Read from the catalogue's built list, and from the copy here when there is one.
{
  const name = "every place is on the globe";
  console.log(`\n${name}`);
  const lists = [];
  if (HAS_CAT && fs.existsSync(C("data/stations.json")))
    lists.push(["the catalogue's list", JSON.parse(fs.readFileSync(C("data/stations.json"), "utf8")).places.map((p) => [p.title, p.country, p.geo[0], p.geo[1]])]);
  if (fs.existsSync(R("data/stations.min.json")))
    lists.push(["the list here", JSON.parse(fs.readFileSync(R("data/stations.min.json"), "utf8")).p]);
  if (!lists.length) skip(name, "no built list here or in the catalogue's checkout");
  else {
    const gaps = [];
    for (const [where, places] of lists) {
      if (places.length < 5000) gaps.push(`${where} has only ${places.length} places — this check is blind`);
      const off = places.filter(([, , lng, lat]) => !Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lat) > 90 || Math.abs(lng) > 180);
      if (off.length) gaps.push(`${where}: ${off.length} off the globe: ${off.slice(0, 4).map(([t, c, lng, lat]) => `"${t}", ${c} (lat ${lat}, lng ${lng})`).join("; ")}`);
    }
    if (HAS_CAT && !/function onGlobe\(/.test(fs.readFileSync(C("scripts/expand.mjs"), "utf8"))) gaps.push("the catalogue's build takes radio-browser's position without asking whether it is one");
    gaps.length ? fail(name, gaps.join("; ")) : pass(`${lists.map(([w, p]) => `${p.length.toLocaleString("en-US")} places in ${w}`).join(", ")}, each within ±90° and ±180°`);
  }
}

// ── a place lies in the country it names ────────────────────────────────────
// radio-browser listed GD Dubai in Honduras, with the region "Just Dubai" and
// a position in San Francisco. The build made a place "Just Dubai", Honduras,
// in San Francisco, and then put KQED, RetroStrange and seven TuneIn channels
// in it, because a station joined the nearest place the build had made within
// 10 km whatever country either said. Sixty-two places in all lay in another
// country than their own: "Roma", Italy, in Brooklyn; "Seoul", South Korea, in
// Québec; "Somewhere in Guinea" off Papua New Guinea. A place is in its
// country when a town of that country (GeoNames, 1,000 people or more) is
// within 100 km; it is in another when only towns of other countries are.
{
  const name = "a place lies in the country it names";
  console.log(`\n${name}`);
  if (!HAS_CAT || !fs.existsSync(C("data/geonames/cities1000.txt")) || !fs.existsSync(C("data/stations.json")))
    skip(name, "no catalogue checkout with its gazetteer and a built list here");
  else {
    const { loadGazetteer } = await import(pathToFileURL(C("scripts/lib/gazetteer.mjs")).href);
    const G = loadGazetteer(C("data/geonames"));
    const { places, channels } = JSON.parse(fs.readFileSync(C("data/stations.json"), "utf8"));
    const held = new Map();
    for (const c of channels) held.set(c.p, (held.get(c.p) || 0) + 1);
    const gaps = [], away = [];
    let looked = 0;
    places.forEach((p, i) => {
      if (p.country === "Null Island") return;               // "Online only", where maps put what has no place
      const cc = G.ccOf(p.country), [lng, lat] = p.geo;
      if (!cc || Math.abs(lat) > 90 || Math.abs(lng) > 180) return;   // the two checks above say so
      looked++;
      const other = G.nearest(lat, lng, null, 100);
      if (other && other.cc !== cc && !G.nearest(lat, lng, cc, 100))
        away.push([held.get(i) || 0, `"${p.title}", ${p.country}, by ${other.name} (${other.cc}) with ${held.get(i) || 0} station${held.get(i) === 1 ? "" : "s"}`]);
    });
    away.sort((a, b) => b[0] - a[0]);
    if (looked < 5000) gaps.push(`only ${looked} places looked at — this check is blind`);
    if (away.length) gaps.push(`${away.length} places lie in another country: ${away.slice(0, 5).map(([, t]) => t).join("; ")}`);
    gaps.length ? fail(name, gaps.join("; ")) : pass(`${looked.toLocaleString("en-US")} places, each within 100 km of a town of its own country`);
  }
}

// ── a station that keeps failing leaves the web's lists ─────────────────────
// A sample of 500 listed stations found 27% silent, while the `ok` flag marked
// 50 of about 61,800 dead: it remembered one old check, and nothing read it.
// Hiding a good station is worse than listing a dead one, so a refusal, which
// may be about the asker, must not count, and neither may a run where too much
// failed. Fake servers give each answer.
{
  const name = "a station that keeps failing leaves the web's lists";
  console.log(`\n${name}`);
  const gaps = [];
  const { createRequire } = await import("node:module");
  const req = createRequire(import.meta.url);
  const file = req.resolve(R("src/catalog.js"));
  delete req.cache[file];
  const log = console.log; console.log = () => {};
  const cat = req(file); cat.load();
  console.log = log;
  const list = JSON.parse(fs.readFileSync(R("data/stations.min.json"), "utf8"));
  const dead = list.c.find((c) => c[3] === 1 && c[6] === 0);
  if (!dead) skip(name, "no station marked dead in this list");
  else {
    const has = () => cat.placeChannels(dead[2]).channels.some((c) => c.id === dead[0]);
    if (!has()) gaps.push("the desktop lost a station that failed a check");
    cat.setPlayableOnly(true);
    if (has()) gaps.push("the web still lists a station that keeps failing");
    if (cat.byId?.(dead[0])?.id !== dead[0]) gaps.push("a saved station that failed a check can no longer be opened");
    cat.setPlayableOnly(false);
  }
  delete req.cache[file];
  if (!HAS_CAT) skip(`${name}: the weekly check`, NO_CAT);
  else {
    const http = await import("node:http");
    const server = http.createServer((q, s) => {
      if (q.url === "/audio") { s.writeHead(200, { "content-type": "audio/mpeg" }); s.end("ID3"); }
      else if (q.url === "/page") { s.writeHead(200, { "content-type": "text/html" }); s.end("<html>"); }
      else if (q.url === "/hang") { /* never answers */ }
      else { s.writeHead(+q.url.slice(1)); s.end(); }
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const at = `http://127.0.0.1:${server.address().port}`;
    try {
      const { verdict, tally, STRIKES } = await import(pathToFileURL(C("scripts/reach.mjs")).href);
      for (const [p, want] of [["/audio", "on"], ["/page", "off"], ["/404", "off"], ["/410", "off"], ["/500", "off"],
        ["/403", "unsure"], ["/429", "unsure"], ["/451", "unsure"], ["/hang", "off"]]) {
        const got = await verdict(at + p, 300);
        if (got !== want) gaps.push(`${p} reads as ${got}, not ${want}`);
      }
      const answers = (o) => new Map(Object.entries(o));
      const a = tally({ x: 1, y: 1, z: 1 }, answers({ x: "off", y: "unsure", z: "on", b: "on", c: "on" }));
      if (a?.x !== 2 || a?.y !== 1 || a?.z !== undefined) gaps.push(`a run counted wrongly: ${JSON.stringify(a)}`);
      if (STRIKES < 2) gaps.push("one bad night hides a station");
      if (tally({}, answers({ a: "off", b: "off", c: "on" })) !== null) gaps.push("a run where most things failed still counted");
      if (!/reach\[c\.id\] >= 2\) c\.ok = 0/.test(fs.readFileSync(C("scripts/profiles.mjs"), "utf8"))) gaps.push("profiles.mjs does not fold the count in");
      if (!/scripts\/reach\.mjs/.test(fs.readFileSync(C(".github/workflows/refresh.yml"), "utf8"))) gaps.push("the weekly build does not run the check");
    } catch (e) {
      gaps.push(`the weekly check did not run: ${e.message}`);
    } finally { server.closeAllConnections(); server.close(); }
  }
  gaps.length ? fail(name, gaps.join("; ")) : pass("the web hides what fails, the desktop and saved stations keep it, and only a definite failure, two runs running, counts");
}

// ── a held station says so wherever it is found ─────────────────────────────
// Foreign music stations are held back in the UK and the EU, and the station
// list said why before anyone pressed play. Search did not, so a listener there
// found a station by name, pressed it, and only then heard it would not play.
{
  const name = "a held station says so wherever it is found";
  console.log(`\n${name}`);
  const gaps = [];
  for (const [f, label] of [["src/renderer/explore-stations.js", "the station list"], ["src/renderer/explore-search.js", "search"], ["src/renderer/popover.js", "the Mac player's list"]])
    if (!/ch\.held \? \[t\("st\.held"/.test(readSrc(f))) gaps.push(`${label} does not say a station is held back`);
  gaps.length ? fail(name, gaps.join("; ")) : pass("the list, search and the Mac player all say why before anyone presses play");
}
