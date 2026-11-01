/** The audit: Tokens, type, spacing, keyboard use and what can be read. */
import fs from "node:fs";
import path from "node:path";
import { ROOT, R, rel, fail, pass, skip, renderers, preload, main, EXPLORE_FILES, exploreSrc, readSrc, strings, en } from "./lib.mjs";

// ── one English, not two ─────────────────────────────────────────────────────
// The app shipped "Open source licences" next to "favorite" and "catalog". Not
// wrong either way, but a product that cannot decide reads as one nobody is
// looking after. American, because that is what the default locale already
// mostly was and where the maintainer is.
//
// Scoped to the English block only. "Licences", "analyse" and "centre" are
// correct in the French strings and "Analyse" is correct in the German ones, so
// checking the whole file would demand breaking four translations.
{
  console.log("\nthe English strings speak one English");
  const src = fs.readFileSync(R("src/i18n.js"), "utf8");
  const en = src.slice(src.indexOf('"app.'), src.indexOf('"set.colour": "Temas"'));
  const BRIT = /\b(licence|licences|colour|colours|favourite|favourites|catalogue|centre|analyse|behaviour|organise|recognise)\b/gi;
  const found = new Set();
  for (const m of en.matchAll(/":\s*"((?:[^"\\]|\\.)*)"/g)) {
    for (const hit of m[1].match(BRIT) || []) found.add(hit.toLowerCase());
  }
  found.size
    ? fail("spelling", `British spellings in the English strings: ${[...found].join(", ")}`)
    : pass("no British spellings in the English strings");
}

// ── the star survives the light theme ────────────────────────────────────────
// Every palette's `star` is a near-white chosen to sit on the night side of a
// globe, so on the light background they measure 1.01 to 1.40:1 -- invisible.
// Both renderers must branch --star on the theme, the way they already do for
// --accent. This is a structural check, not a contrast one: the measurement is
// in the transcript, and what regresses is somebody simplifying the assignment.
{
  console.log("\nthe favourite star survives the light theme");
  let bad = [];
  for (const f of ["src/renderer/popover.html", "src/renderer/explore.html"]) {
    const html = fs.readFileSync(R(f), "utf8");
    const m = html.match(/setProperty\("--star",\s*([^)]+)\)/);
    if (!m) continue;                       // renderer does not set it at all
    if (!/light\s*\?/.test(m[1])) bad.push(`${f.split("/").pop()}: ${m[1].trim()}`);
  }
  bad.length
    ? fail("star contrast", `--star is set without a light-theme branch — ${bad.join("; ")}`)
    : pass("--star branches on the theme in every renderer that sets it");
}

// ── every mark carries the set's stroke weight ───────────────────────────────
// The system icons are stroked 1.6 on a 24 grid. The hand-drawn marks arrive as filled
// outlines on boxes up to 3955 units wide, so their line thickness is baked into
// the geometry and lands wherever the artwork put it — the aeroplane measured
// 0.33 CSS px against the star's 1.07 and read as a hairline in a row of icons
// that were not hairlines.
//
// `MARK` takes a weight for exactly this, and the failure mode is forgetting one
// when adding the next mark. Solid shapes are exempt: `dots` is three filled
// circles and `globe` is a filled disc, and stroking either would thicken a
// shape that has no line to thicken.
{
  console.log("\nevery outline mark carries a stroke weight");
  const src = fs.readFileSync(R("src/renderer/icons.js"), "utf8");
  const SOLID = new Set(["dots", "globe"]);
  const missing = [];
  for (const m of src.matchAll(/(\w+): MARK\("([^"]+)",\s*`[\s\S]*?`(,\s*(\d+))?\)/g)) {
    const [, name, , , weight] = m;
    if (SOLID.has(name)) continue;
    if (!weight) missing.push(name);
  }
  if (missing.length) {
    fail("mark without a weight",
         `${missing.join(", ")} would draw thinner than the 24-grid set around them`);
  } else {
    pass("every outline mark states a weight; solid marks are exempt by name");
  }
}

// ── every button in a toolbar calls something that exists ────────────────────
// The travel globe shipped calling `playChannel(pick)`. There is no such
// function in explore.js — it threw on click and the button did nothing at all,
// which is exactly what was reported. It passed review because the *data*
// path was verified (randomStation returns a station) and the handler was not.
//
// This checks the whole class: every identifier a click handler calls has to be
// defined in the file, on `window`, or on one of the bridges.
{
  console.log("\nevery click handler calls something that exists");
  const src = exploreSrc;
  const defined = new Set();
  /**
   * Every script the page loads counts, not just this one.
   *
   * `guard` lives in errors.js and is hung on `window`; scoping this to
   * explore.js alone reported four handlers as broken that work perfectly. A
   * check that cries wolf is one people learn to skip, which is the failure mode
   * this whole file exists to avoid.
   */
  const loaded = [...fs.readFileSync(R("src/renderer/explore.html"), "utf8")
    .matchAll(/<script src="([\w./-]+)"/g)].map((m) => m[1]);
  for (const rel of [...loaded, "explore.js"]) {
    const file = R(path.join("src/renderer", rel));
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    for (const m of text.matchAll(/(?:^|\n)\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g)) defined.add(m[1]);
    for (const m of text.matchAll(/(?:^|\n)\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g)) defined.add(m[1]);
    for (const m of text.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=/g)) defined.add(m[1]);
  }
  // Things the file legitimately reaches for that are not declared in it.
  const AMBIENT = new Set(["window","document","console","Math","JSON","Date","Number","String",
    "Array","Object","Set","Map","Promise","Icons","Card","t","$","setTimeout","clearTimeout",
    "setInterval","clearInterval","requestAnimationFrame","navigator","location","fetch","alert",
    "parseInt","parseFloat","isNaN","Intl","URL","Boolean","RegExp","Error","structuredClone"]);
  const bad = [];
  // Every `X.onclick = ` handler body, and every arrow assigned to one.
  //
  // Anchored on the handler's own indentation, because handlers now sit inside
  // each part's wire function; a column-0 `};` matched none of them and the
  // check passed having read nothing. A one-line handler ends on its own line —
  // the lock button's used to run on through 5,000 characters of other code.
  let handlers = 0;
  for (const m of src.matchAll(/^( *)\$\("([\w-]+)"\)\.onclick\s*=\s*(?:async\s*)?\(?\)?\s*=>\s*\{(?:([^\n]*)\};[ \t]*$|([\s\S]*?)\n\1\};)/gm)) {
    handlers++;
    const [, , id, oneLine, block] = m;
    const body = oneLine ?? block;
    for (const c of body.matchAll(/(?:^|[^\w.$])([A-Za-z_$][\w$]*)\s*\(/g)) {
      const name = c[1];
      if (defined.has(name) || AMBIENT.has(name)) continue;
      if (/^(if|for|while|switch|catch|return|typeof|await|new|function)$/.test(name)) continue;
      // The name, not the button. Matching handler bodies by regex cannot
      // reliably say *which* onclick a call sits in — the first version blamed
      // `lock` for a call in the travel button — and a failure message that
      // names the wrong control sends you to the wrong place.
      bad.push(`${name}()`);
    }
  }
  if (handlers < 5) fail("handler check", `found only ${handlers} onclick handlers in Explore — the pattern no longer matches the code`);
  else if (bad.length) fail("handler calls a missing function",
         `Explore calls ${[...new Set(bad)].join(", ")} from a click handler; nothing defines it`);
  else pass(`all ${handlers} onclick handlers in Explore call functions that are defined`);
}

// ── keyboard and names in Explore ────────────────────────────────────────────
// Found by a Rams review and confirmed in the running app's accessibility tree:
// station, place, search, headline and receiver rows were divs with an onclick,
// so a keyboard could not pick anything to play. The row star was a nameless SVG
// that stayed invisible when focused, and the headline Close and the dial's
// arrows were named by their glyphs.
{
  console.log("\nevery clickable row works by keyboard");
  const bad = [];
  // The popover's favourites were the same divs with an onclick.
  for (const f of [...EXPLORE_FILES, "src/renderer/popover.js"]) {
    const src = fs.readFileSync(R(f), "utf8");
    for (const m of src.matchAll(/const (\w+) = document\.createElement\("(?:div|span)"\)/g)) {
      const v = m[1];
      // Up to the next element built under the same name, which is the next row.
      const rest = src.slice(m.index + m[0].length);
      const next = rest.search(new RegExp(`const ${v} = document\\.createElement\\(`));
      const body = rest.slice(0, next < 0 ? 2500 : Math.min(next, 2500));
      const clickable = new RegExp(`\\b${v}\\.(onclick\\s*=|addEventListener\\("click")`).test(body);
      if (!clickable) continue;
      const helped = new RegExp(`activatable\\(\\s*${v}\\b`).test(body);
      const byHand = new RegExp(`\\b${v}\\.tabIndex = 0`).test(body)
        && new RegExp(`\\b${v}\\.(onkeydown\\s*=|addEventListener\\("keydown")`).test(body);
      if (!helped && !byHand) bad.push(`${path.basename(f)}:${src.slice(0, m.index).split("\n").length} ${v}`);
    }
  }
  // A key the row used must stop there: a Space on a popover row also reached
  // the panel's Space shortcut and toggled play right after the row tuned.
  const helper = fs.readFileSync(R("src/renderer/activatable.js"), "utf8");
  if (!/addEventListener\("keydown"[\s\S]*?stopPropagation\(\)[\s\S]*?go\(e\)/.test(helper)) {
    bad.push("activatable.js lets a handled key reach the window's own shortcuts");
  }
  bad.length ? fail("keyboard rows", `clickable but not focusable or keyable: ${bad.join(", ")} — use activatable()`)
             : pass("every clickable row in Explore and the popover can be reached and pressed from the keyboard");

  console.log("\nno button is named by a glyph");
  const nameless = [];
  const PAGES = ["explore", "popover", "settings"];
  const pageScripts = (page) => (page === "explore" ? exploreSrc
    : fs.readFileSync(R(`src/renderer/${page}.js`), "utf8"));
  const html = fs.readFileSync(R("src/renderer/explore.html"), "utf8");
  for (const page of PAGES) {
  const doc = fs.readFileSync(R(`src/renderer/${page}.html`), "utf8");
  for (const m of doc.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
    const [, attrs, inner] = m;
    // An entity is a glyph (&laquo; is «), not nothing — deleting it made the
    // dial's arrows look like empty icon buttons and pass unnamed.
    const text = inner.replace(/<[^>]+>/g, "").replace(/&#?\w+;/g, "\u2022").trim();
    if (/\p{L}/u.test(text)) continue;                              // has words
    // Empty buttons get an icon at runtime, so the name has to be an attribute.
    // Privacy, Terms and Licences in Settings were empty with none.
    if (/aria-label=|aria-labelledby=|data-i18n-title=/.test(attrs)) continue;
    // Empty in the markup because script writes words into it (the chat's
    // "3 private"), which is a name, not an icon.
    const id = (attrs.match(/id="([^"]+)"/) || [])[1];
    if (!text && id && new RegExp(`\\$\\("${id}"\\)[\\s\\S]{0,400}?\\.textContent\\s*=`).test(pageScripts(page))) continue;
    nameless.push(`${page}.html ${(attrs.match(/id="([^"]+)"/) || attrs.match(/class="([^"]+)"/) || [,"?"])[1]} "${text || "(empty)"}"`);
  }
  }
  const src = [exploreSrc, ...["popover", "settings"].map((p) => fs.readFileSync(R(`src/renderer/${p}.js`), "utf8"))].join("\n");
  // Buttons built in script, whose whole text is a glyph: the remove button on
  // your own stations was a bare "−" and announced as "minus".
  for (const m of src.matchAll(/const (\w+) = document\.createElement\("button"\);[\s\S]{0,300}?\1\.textContent = "([^"]{1,3})";/g)) {
    const [, v, glyph] = m;
    if (/\p{L}/u.test(glyph)) continue;
    const after = src.slice(m.index, m.index + m[0].length + 400);
    if (!new RegExp(`${v}\\.setAttribute\\("aria-label"`).test(after)) nameless.push(`script-built button "${glyph}" (${v})`);
  }
  if (!/\.star"\)[\s\S]{0,300}?setAttribute\("aria-label"/.test(src)) nameless.push("the station row star has no aria-label");
  if (!/\.st:focus-within \.star/.test(html)) nameless.push("the station row star is not shown on focus");
  nameless.length ? fail("button names", nameless.join("; "))
                  : pass("every glyph-only button is named in words, and the row star shows on focus");
}

// ── Explore's styles live in the stylesheet ─────────────────────────────────
// Flagged by a Rams review: the same empty state carried padding:32px 16px in
// two scripts, 30px 16px in a third and 22px 12px in a fourth, shortwave set
// five more by hand, and the chat wrote its own for "tuned in". All of them live
// in explore.html now, so no script writes a block of style: no style="" in a
// template and no cssText. Single properties that change at runtime (a signal's
// pulse, a menu's position, a dimmed row) are still set one at a time.
{
  console.log("\nExplore's styles live in the stylesheet");
  const bad = [];
  for (const f of EXPLORE_FILES) {
    const src = fs.readFileSync(R(f), "utf8");
    const at = (i) => `${path.basename(f)}:${src.slice(0, i).split("\n").length}`;
    for (const m of src.matchAll(/<\w+[^>`]*\sstyle="/g)) bad.push(at(m.index));
    for (const m of src.matchAll(/\.style\.cssText\s*=/g)) bad.push(at(m.index));
  }
  bad.length ? fail("inline styles", `a block of inline style at ${bad.join(", ")} — put it in explore.html`)
             : pass("no Explore script writes a block of inline style");
}

// ── inputs, tokens and help tags across the three windows ────────────────────
// From a Rams review of the popover and Settings, confirmed in the running app.
// The nickname field announced as "Anonymous" (its placeholder), the popover's
// output menu used var(--pane) and that page never defined it, and turning help
// tags on stripped `title` — the only name the popover's row star had.
{
  const PAGES = ["explore", "popover", "settings"];
  const read = (f) => fs.readFileSync(R(f), "utf8");

  console.log("\nevery input has a name");
  const unnamed = [];
  for (const page of PAGES) {
    const doc = read(`src/renderer/${page}.html`);
    for (const m of doc.matchAll(/<input\b([^>]*)>/g)) {
      const a = m[1];
      if (/type="hidden"/.test(a)) continue;
      const id = (a.match(/id="([^"]+)"/) || [])[1];
      // A placeholder is not a name: it disappears on the first keystroke and
      // says what to type, not what the field is.
      const named = /aria-label=|aria-labelledby=|data-i18n-title=/.test(a)
        || (id && new RegExp(`<label[^>]*for="${id}"`).test(doc));
      if (!named) unnamed.push(`${page}.html ${id || "(no id)"}`);
    }
  }
  unnamed.length ? fail("input names", `named only by a placeholder: ${unnamed.join(", ")}`)
                 : pass("every input in the three windows has a label, not just a placeholder");

  console.log("\nevery var() a page uses is defined");
  const undef = [];
  for (const page of PAGES) {
    const doc = read(`src/renderer/${page}.html`);
    const scripts = [...doc.matchAll(/<script src="([\w./-]+)"/g)]
      .map((m) => R(`src/renderer/${m[1]}`)).filter((f) => fs.existsSync(f))
      .map((f) => fs.readFileSync(f, "utf8")).join("\n");
    const defined = new Set([
      ...[...doc.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]),
      ...[...scripts.matchAll(/setProperty\(\s*["'](--[\w-]+)["']/g)].map((m) => m[1]),
    ]);
    // Only uses with no fallback: var(--x, y) is written to survive an absence.
    for (const m of doc.matchAll(/var\((--[\w-]+)\)/g)) {
      if (!defined.has(m[1])) undef.push(`${page}.html ${m[1]}`);
    }
  }
  const uniq = [...new Set(undef)];
  uniq.length ? fail("undefined tokens", `used with no fallback and never defined: ${uniq.join(", ")}`)
              : pass("every var() used without a fallback is defined in its own page");

  console.log("\nhelp tags keep a control's name");
  // Both routes a title takes must go through take(), which keeps the name:
  // adopt() for what is there at load, and the observer for titles set later.
  // The observer had its own copy of the strip, without the name, which is how
  // a fix to adopt() alone left every title set from script still nameless.
  const tips = read("src/renderer/tips.js");
  const take = tips.match(/function take\(node\) \{[\s\S]*?\n  \}/);
  const adopt = tips.match(/function adopt\([\s\S]*?\n  \}/);
  const observer = tips.match(/new MutationObserver\([\s\S]*?\}\)\.observe/);
  const problems = [];
  if (!take || !/setAttribute\("aria-label"/.test(take[0])) problems.push("take() does not keep the name");
  if (!adopt || !/\btake\(node\)/.test(adopt[0])) problems.push("adopt() does not go through take()");
  if (!observer || !/\btake\(rec\.target\)/.test(observer[0])) problems.push("the title observer does not go through take()");
  if (/removeAttribute\("title"\)/.test(tips.replace(take?.[0] || "", ""))) problems.push("a title is removed somewhere other than take()");
  problems.length ? fail("help tags", problems.join("; "))
    : pass("every title help tags take over, at load or later, keeps a nameless control named");

  console.log("\nthe Settings reader holds focus");
  // aria-modal only tells a screen reader. Tab walked out of the reader into the
  // settings underneath, and closing it left focus on nothing.
  const set = read("src/renderer/settings.js");
  const open = set.match(/function openDocView\([\s\S]*?\n\}/);
  const close = set.match(/function closeDocView\([\s\S]*?\n\}/);
  const gaps = [];
  if (!open || !/\$\("main"\)\.inert = true/.test(open[0])) gaps.push("opening does not make the list inert");
  if (!open || !/docOpener = document\.activeElement/.test(open[0])) gaps.push("opening does not remember the opener");
  if (!close || !/\$\("main"\)\.inert = false/.test(close[0])) gaps.push("closing leaves the list inert");
  if (!close || !/docOpener\?\.focus\(\)/.test(close[0])) gaps.push("closing does not return focus");
  gaps.length ? fail("settings reader", gaps.join("; "))
    : pass("the reader keeps Tab inside and hands focus back when it closes");

  console.log("\na refused relay keeps what was typed and says why");
  // An invalid address used to be erased, with the reason moved into the
  // placeholder: the text was lost and a screen reader heard only "invalid".
  const relayBtn = set.match(/\$\("#relay-btn"\)\.addEventListener\("click", async \(\) => \{([\s\S]*?)\n\}\);/);
  const setHtml = read("src/renderer/settings.html");
  const relayGaps = [];
  if (!relayBtn) relayGaps.push("could not find the relay Add handler");
  else {
    const refused = relayBtn[1].split(/\n  showRelayError\(null\);/)[0];
    if (/input\.value = ""/.test(refused)) relayGaps.push("an invalid address is still erased");
    if (/input\.placeholder =/.test(refused)) relayGaps.push("the reason still goes in the placeholder");
    if (!/showRelayError\(/.test(refused)) relayGaps.push("the reason is not shown next to the field");
  }
  if (!/id="relay-add"[^>]*aria-describedby="relay-err"/.test(setHtml)) relayGaps.push("#relay-add is not described by #relay-err");
  if (!/id="relay-err"[^>]*role="alert"/.test(setHtml)) relayGaps.push("#relay-err is not announced");
  relayGaps.length ? fail("relay error", relayGaps.join("; "))
    : pass("the address stays and the reason is next to it, read out");

  console.log("\nthe share sheet holds focus");
  // Same defect as the reader, in Explore: Tab walked out of the card into the
  // toolbar behind it.
  const play = read("src/renderer/explore-playback.js");
  const openSheet = play.match(/async function openShareSheet\([\s\S]*?\n\}/);
  const closeSheet = play.match(/function closeShareSheet\([\s\S]*?\n\}/);
  const holes = [];
  if (!/const behindSheet = \(\) => \[[^\]]*\.toolbar[^\]]*\.cols[^\]]*\$\("now"\)\]/.test(play)) holes.push("behindSheet() does not cover the toolbar, the columns and the transport");
  if (!openSheet || !/el\.inert = true/.test(openSheet[0])) holes.push("opening does not make the page inert");
  if (!closeSheet || !/el\.inert = false/.test(closeSheet[0])) holes.push("closing leaves the page inert");
  holes.length ? fail("share sheet", holes.join("; "))
    : pass("the share sheet keeps Tab inside while it is open");

  console.log("\nan output's check mark is not part of its name");
  // The ✓ is drawn for the chosen output, and without aria-hidden it was read
  // as part of every option's name: "✓ System output".
  const loud = [];
  for (const f of ["src/renderer/popover.js", "src/renderer/explore-playback.js"]) {
    const src = read(f);
    const ticks = (src.match(/tick\.textContent = "\\u2713";/g) || []).length;
    const hushed = (src.match(/tick\.setAttribute\("aria-hidden", "true"\)/g) || []).length;
    if (!ticks) loud.push(`${f}: no tick found to check`);
    else if (hushed < ticks) loud.push(`${f}: ${ticks - hushed} tick(s) not aria-hidden`);
  }
  loud.length ? fail("output ticks", loud.join("; "))
    : pass("every output menu hides its tick from the accessible name");

  console.log("\nthe popover's keys yield to the output menu");
  // The panel's keydown handler is registered first, so it saw Escape before
  // the menu did and hid the whole popover; Space toggled playback instead of
  // choosing the focused device.
  const pop = read("src/renderer/popover.js");
  const panelKeys = pop.match(/\/\/ ── keys ─+\ndocument\.addEventListener\("keydown", e => \{\n([\s\S]*?)\n\}\);/);
  !panelKeys ? fail("popover keys", "could not find the panel's keydown handler")
    : !/^\s*(\/\/.*\n\s*)*if \(!\$\("outmenu"\)\.hidden\) return;/.test(panelKeys[1])
      ? fail("popover keys", "the panel's keydown handler does not step aside while the output menu is open")
      : pass("Escape and Space reach the output menu while it is open");
}

// ── the reds and the small print can be read, and Settings pressed ──────────
// The design review of 6 Oct 2026, measured in the running app. White on the
// dark theme's red was 3.7:1 on a show's beacon, its Stop button and the
// studio's On air. The light theme's secondary text was still 3.7:1 on the
// globe page and the menu-bar panel after Settings had been raised. On a phone
// Settings' buttons were 18px tall ("Join" was 26 by 18) beside text at 10px,
// and turning sync on or off dropped the keyboard's place to the top of the page.
{
  console.log("\nthe reds and the small print can be read, and Settings pressed");
  const lum = (h) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
  const css = (f) => readSrc(f).replace(/\/\*[\s\S]*?\*\//g, "");
  const gaps = [];
  for (const f of ["src/renderer/explore.html", "src/renderer/settings.html"]) {
    const pairs = [...css(f).matchAll(/--err:(#[0-9A-Fa-f]{6});\s*--on-err:(#[0-9A-Fa-f]{6})/g)];
    if (!pairs.length || pairs.length !== (css(f).match(/--err:#/g) || []).length) gaps.push(`${f}: an --err with no --on-err beside it`);
    for (const [, err, on] of pairs) if (ratio(err, on) < 4.5) gaps.push(`${f}: ${on} on ${err} is ${ratio(err, on).toFixed(2)}:1`);
    if (/background:var\(--err\);\s*color:(?!var\(--on-err\))/.test(css(f))) gaps.push(`${f}: something is written on --err in a colour of its own`);
  }
  for (const f of ["src/renderer/explore.html", "src/renderer/popover.html", "src/renderer/settings.html"]) {
    const seen = [...css(f).matchAll(/--label2:rgba\(23,21,20,(\.\d+)\)/g)];
    if (!seen.length) gaps.push(`${f}: no light-theme --label2 found, so this check is blind`);
    for (const [, a] of seen) {
      const on = "#" + [23, 21, 20].map((n) => Math.round(255 - (255 - n) * a).toString(16).padStart(2, "0")).join("");
      if (ratio(on, "#FFFFFF") < 4.5) gaps.push(`${f}: light secondary text at ${a} is ${ratio(on, "#FFFFFF").toFixed(2)}:1 on white`);
    }
  }
  const set = css("src/renderer/settings.html");
  const under = set.match(/font-size:(?:\d|1[01])(?:\.\d+)?px/g);
  if (under) gaps.push(`Settings has text under 12px (${[...new Set(under)].join(", ")})`);
  const hit = (set.match(/:is\(([^)]*)\)::before\{[^}]*width:max\(100%,var\(--hit\)\);height:max\(100%,var\(--hit\)\)/) || [])[1] || "";
  if (![".link", ".sw", ".seg button"].every((c) => hit.split(",").includes(c))) gaps.push("Settings' links, switches and segments have no larger area to press");
  if (!/@media \(pointer:coarse\)\{\s*:root\{--hit:44px\}\s*\.row\{min-height:44px\}/.test(set)) gaps.push("under a finger Settings' controls are not 44px, or its rows are shorter than that");
  if (/color:var\(--label3\)/.test(set)) gaps.push("Settings writes words in --label3, which is 2.5:1");
  const js = readSrc("src/renderer/settings.js");
  if (!/if \(pressed\) \(on \? \$\("#synccopy"\) : \$\("#syncon"\)\)\.focus\(\)/.test(js)) gaps.push("turning sync on or off drops focus");
  if (!/if \(!st\?\.on\) failed\(\)/.test(js)) gaps.push("a sync that did not turn on says nothing");
  gaps.length ? fail("the reds and the small print can be read, and Settings pressed", gaps.join("; "))
    : pass("what is written on --err clears 4.5:1 in both themes, light secondary text does on all three pages, and Settings is 12px and 44px under a finger");
}

// ── nothing is written under 12px ───────────────────────────────────────────
// 10 Oct 2026. The profile is WCAG 2.2 AA with A11Y.md's floor on top: no text
// under 12px (docs/a11y/A11Y.md §4). A count found 52 sizes under it: 43 in
// Explore, 6 in the popover, 3 in web.css, from 9px to 11.5px. Settings had its
// own check and was clean; nothing held the other pages.
//
// Read from every page and every stylesheet and script beside them, so a size
// set from a script is seen too. Three sizes are not words and stay: each is
// named below with its reason, and the check fails when one of them stops
// matching, so the list cannot outlive what it excuses.
{
  const name = "nothing is written under 12px";
  console.log(`\n${name}`);
  const MIN = 12;
  const NOT_WORDS = {
    "src/renderer/popover.html": { "#toggle": "the play icon, an SVG drawn at 1em" },
    "web/web.css": {
      "body.phonebar .now #play": "the play icon, an SVG drawn at 1em",
    },
  };
  const files = [
    ...fs.readdirSync(R("src/renderer")).filter((f) => /\.(html|js)$/.test(f)).map((f) => `src/renderer/${f}`),
    ...fs.readdirSync(R("web")).filter((f) => /\.(css|js)$/.test(f)).map((f) => `web/${f}`),
  ];
  const SIZE = /font-size\s*:\s*([\d.]+)px|\bfont\s*:[^;}"'`]*?\b([\d.]+)px|fontSize\s*=\s*["'`]([\d.]+)px/g;
  const small = [], used = new Set();
  let seen = 0;
  for (const f of files) {
    // Comments are blanked, not cut, so a line number is still the file's.
    const src = fs.readFileSync(R(f), "utf8").replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "));
    for (const m of src.matchAll(SIZE)) {
      seen++;
      const px = Number(m[1] ?? m[2] ?? m[3]);
      if (!(px < MIN)) continue;
      const open = src.lastIndexOf("{", m.index);
      const from = Math.max(src.lastIndexOf("}", open), src.lastIndexOf("{", open - 1), src.lastIndexOf(";", open)) + 1;
      const sel = src.slice(from, open).replace(/\s+/g, " ").trim();
      if (NOT_WORDS[f]?.[sel]) { used.add(`${f} ${sel}`); continue; }
      small.push(`${f}:${src.slice(0, m.index).split("\n").length} ${px}px`);
    }
  }
  const stale = Object.entries(NOT_WORDS).flatMap(([f, sels]) => Object.keys(sels).map((s) => `${f} ${s}`)).filter((k) => !used.has(k));
  const gaps = [];
  if (seen < 100) gaps.push(`only ${seen} sizes found in ${files.length} files — this check is blind`);
  if (small.length) gaps.push(`${small.length} under ${MIN}px: ${small.slice(0, 12).join(", ")}${small.length > 12 ? `, and ${small.length - 12} more` : ""}`);
  if (stale.length) gaps.push(`excused as not words, and no longer under ${MIN}px or no longer there: ${stale.join("; ")}`);
  gaps.length ? fail(name, gaps.join("; "))
    : pass(`${seen} sizes in ${files.length} files, none under ${MIN}px but ${used.size} that are not words (two icons and a dot)`);
}

// ── gaps and lone paddings sit on even steps ────────────────────────────────
// 10 Oct 2026, counted for the design system file: the space between things
// was written as plain px in twelve different steps, 3, 5, 7, 9 and 11 among
// them, and nobody could say why a row of chips was 5 apart and a row of
// buttons 7. The steps are even now: 2, 4, 6, 8, 10, 12, 14, 16, 20.
//
// Only where a number stands alone: a gap, or a padding or margin of one value.
// A padding of several values is usually arithmetic (the play bar's right edge
// is a 7px gutter plus a row's 10px inset, and says so), and evening those out
// one by one would move edges that were lined up on purpose. Negative margins
// are nudges, not spacing. A padding that only gives back a negative margin of
// the same size, in the same rule, is the same arithmetic and is left alone.
{
  const name = "gaps and lone paddings sit on even steps";
  console.log(`\n${name}`);
  const sheets = [["src/renderer/explore.html", true], ["src/renderer/settings.html", true], ["src/renderer/popover.html", true],
                  ["src/renderer/splash.html", true], ["web/web.css", false]];
  const PROP = /(?<![-\w])(gap|row-gap|column-gap|padding|margin|(?:padding|margin)-(?:top|right|bottom|left|inline|block))\s*:\s*([^;}{]+)/g;
  const odd = [];
  let seen = 0;
  for (const [file, html] of sheets) {
    const raw = readSrc(file);
    const css = (html ? (raw.match(/<style[^>]*>[\s\S]*?<\/style>/g) || []).join("\n") : raw).replace(/\/\*[\s\S]*?\*\//g, "");
    for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const sel = rule[1].trim().replace(/\s+/g, " ").slice(-48), body = rule[2];
      for (const d of body.matchAll(PROP)) {
        const prop = d[1], val = d[2].trim();
        const lone = /gap/.test(prop) || val.split(/\s+/).length === 1;
        if (!lone) continue;
        seen++;
        for (const n of val.matchAll(/(?<![\w.-])(\d+(?:\.\d+)?)px/g)) {
          const px = Number(n[1]);
          if (px < 3 || px % 2 !== 1) continue;
          const side = (prop.match(/^padding-(\w+)$/) || [])[1];
          if (side && new RegExp(`margin-${side}\\s*:\\s*-${n[1]}px`).test(body)) continue;   // gives back its own negative margin
          odd.push(`${file.split("/").pop()}: ${sel} { ${prop}:${val} }`);
        }
      }
    }
  }
  const gaps = [];
  if (seen < 100) gaps.push(`only ${seen} gaps and lone paddings were found — this check is blind`);
  if (odd.length) gaps.push(`${odd.length} off the even steps: ${odd.slice(0, 6).join("; ")}${odd.length > 6 ? "; …" : ""}`);
  gaps.length ? fail(name, gaps.join("; "))
    : pass(`${seen} gaps and lone paddings, every one on an even step`);
}

// ── every distance follows the listener's units ─────────────────────────────
// A listener in the US was shown kilometres.
// The hop line under a place already asked src/geo.js, which asks the system
// (miles in the US and the UK, kilometres elsewhere) and honours the units
// preference. Six other lines wrote " km" straight into the page: how far the
// place is from what is playing, the towns within reach, the shortwave
// receivers nearby (twice), a propagation spot, the space station's height.
// The wind was km/h beside a temperature in Fahrenheit.
{
  const name = "every distance follows the listener's units";
  console.log(`\n${name}`);
  const dir = path.join(ROOT, "src", "renderer");
  const gaps = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".js"))) {
    const src = fs.readFileSync(path.join(dir, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    src.split("\n").forEach((line, i) => {
      // An interpolated number followed by a written unit: `${x} km`, `${x} km/h`.
      if (/\$\{[^}]*\}\s*km(?:\/h)?\b/.test(line) && !/function fmtKm|const fmtKph/.test(line)) gaps.push(`${f}:${i + 1} writes km whatever the listener uses`);
    });
  }
  const core = readSrc("src/renderer/explore-core.js");
  if (!/function fmtKm\s*\(/.test(core)) gaps.push("there is no fmtKm() for the page to write a distance with");
  else {
    const fn = (core.match(/function fmtKm\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/) || [])[1] || "";
    const geoFn = (readSrc("src/geo.js").match(/function format\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/) || [])[1] || "";
    const steps = (s) => (s.match(/Math\.round\(v(?: \/ \d+)?\)(?: \* \d+)?/g) || []).join("|");
    if (!steps(geoFn) || steps(fn) !== steps(geoFn)) gaps.push("fmtKm() rounds differently from src/geo.js, so two lines on one screen would disagree");
  }
  if (!/unit:\s*\(/.test(readSrc("src/preload.js"))) gaps.push("the page cannot ask which unit the listener uses (no unit() on the bridge)");
  if (!/unit:\s*async/.test(readSrc("web/bridge.js"))) gaps.push("the web build cannot ask which unit the listener uses");
  gaps.length ? fail(name, gaps.slice(0, 8).join("; "))
    : pass("no line writes km on its own; all of them ask the system, or the units preference");
}

// ── the reader's two buttons wear the palette ───────────────────────────────
// 13 Oct 2026. In the headline reader on a phone, "‹ Headlines" and "Open in
// browser" were the grey of a caption while every other thing to press wore the
// palette's colour, and each was 30pt tall in a sheet worked by a thumb.
{
  const name = "the reader's two buttons wear the palette";
  console.log(`\n${name}`);
  const css = readSrc("src/renderer/explore.html"), web = readSrc("web/web.css");
  const rule = (sel) => css.match(new RegExp(`\\n\\s*\\.${sel}\\{([^}]*)\\}`))?.[1] || "";
  const gaps = [];
  for (const sel of ["readback", "readopen"]) {
    const r = rule(sel);
    if (!r) gaps.push(`.${sel} has no rule — this check is blind`);
    else if (!/color:var\(--accent\)/.test(r)) gaps.push(`.${sel} is not the palette's colour`);
  }
  if (!/\.readback:focus-visible,\.readopen:focus-visible\{[^}]*outline/.test(css)) gaps.push("neither shows where the keyboard is");
  if (!/\.readback,\s*\.readopen\s*\{[^}]*min-height:\s*4[4-9]px/.test(web)) gaps.push("on a touch screen they are under 44px tall");
  gaps.length ? fail(name, gaps.join("; ")) : pass("the way back and the way out are the accent, focusable, and 44px to a thumb");
}

// ── what a tool or a screen reader finds is what is on screen ───────────────
// A Rams review of the web player (22 Oct 2026) read the launch screen's name
// as grey on white, 2.2:1: the screen is a gradient, which has no colour of its
// own, so anything that asks what is behind the text found the white body
// under the veil. The gradient now sits on a solid onyx. The same review found
// --ride registered twice in web/web.css (the second copy does nothing until
// someone edits only one), and the ticker's dots were read aloud as "black
// circle" between items.
{
  const name = "what a tool or a screen reader finds is what is on screen";
  console.log(`\n${name}`);
  const gaps = [];
  const css = fs.readFileSync(R("web/web.css"), "utf8");
  for (const [, p] of css.matchAll(/@property\s+(--[\w-]+)/g)) if ((css.match(new RegExp(`@property\\s+${p}\\b`, "g")) || []).length > 1) gaps.push(`web/web.css registers ${p} more than once`);
  const dot = css.match(/\.ticker li::before\s*\{[^}]*\}/)?.[0] || "";
  if (!/content:\s*""\s*;/.test(dot) && !/content:\s*"[^"]*"\s*\/\s*""/.test(dot)) gaps.push("the ticker's dots are characters with something to read aloud");
  const launch = fs.readFileSync(R("scripts/build-web.mjs"), "utf8").match(/#launch\{[^}]*\}/)?.[0] || "";
  if (!/background:#[0-9A-Fa-f]{6}\s+radial-gradient/.test(launch)) gaps.push("the launch screen's gradient has no solid colour under it");
  gaps.length ? fail(name, [...new Set(gaps)].join("; ")) : pass("the launch screen has a solid ground, each @property is registered once, the ticker's dots are silent");
}
