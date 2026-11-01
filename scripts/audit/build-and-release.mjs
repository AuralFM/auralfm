/** The audit: Dependencies, licences, packaging, secrets, repository paperwork and mail. */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { ROOT, R, fail, pass, RELEASE, skip, main, readSrc, strings, en, pkg } from "./lib.mjs";

// ── every data file the app reads is actually shipped ────────────────────────
// `build.files` is an allowlist, so a new data file is absent from the package
// unless somebody remembers to add it. filter-default.json was: the word filter
// shipped reading a file that was not there, `defaults()` fell back to an empty
// list, and the switch still said On. A safety feature that silently does
// nothing is worse than one that is obviously missing.
//
// This checks the whole class rather than that one file — anything under data/
// referenced from src/ has to be in the allowlist.
{
  console.log("\nevery data file src/ reads is in the build allowlist");
  const pkg = JSON.parse(fs.readFileSync(R("package.json"), "utf8"));
  const allow = new Set((pkg.build?.files || []).filter((f) => !f.startsWith("!")));
  const wanted = new Set();
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { walk(full); continue; }
      if (!/\.(js|mjs|cjs)$/.test(e.name)) continue;
      const src = fs.readFileSync(full, "utf8");
      for (const m of src.matchAll(/["'`](?:\.\.\/)*data["'`]\s*,\s*["'`]([\w.-]+\.json)["'`]/g)) {
        wanted.add(`data/${m[1]}`);
      }
      for (const m of src.matchAll(/["'`]data\/([\w.-]+\.json)["'`]/g)) wanted.add(`data/${m[1]}`);
    }
  };
  walk(R("src"));
  const missing = [...wanted].filter((f) => {
    if (allow.has(f)) return false;
    // The catalogue ships gzipped under data/packed/ (scripts/pack-data.mjs),
    // and a later check holds that it is there and current.
    if (f === "data/stations.min.json" && allow.has("data/packed/**/*")) return false;
    // A directory glob covering it counts too.
    return ![...allow].some((a) => a === "data/**/*" || a === "data/*");
  });
  missing.length
    ? fail("data files", missing.map((f) => `${f} is read but not in build.files`).join("; "))
    : pass(`all ${wanted.size} data files read by src/ are in build.files`);

  /**
   * Whether the files are actually *there* is a separate question, and it is only
   * answerable on a machine that has run the crawl.
   *
   * The first version of this check tested both halves together and so passed
   * locally and failed on CI for three commits running — data/stations.min.json
   * and friends are generated and gitignored, so a fresh clone legitimately does
   * not have them. Which also means: verifying locally is not verifying. The
   * allowlist half above runs everywhere; this half stands aside where the inputs
   * cannot exist.
   */
  const tracked = [...wanted].filter((f) => fs.existsSync(R(f)));
  if (tracked.length !== wanted.size) {
    skip("data files exist", "some data/ files are generated and gitignored — runs locally");
  } else {
    pass(`all ${wanted.size} are present on disk`);
  }
}

// ── every module src/ imports is declared, and credited ──────────────────────
// Two separate omissions from one commit, both silent.
//
// `@noble/hashes` was required directly by src/nostr-private.js and never added
// to `dependencies`. It resolved anyway, because @noble/curves depends on it and
// npm hoists — so the crypto worked on this machine and would keep working right
// up until curves bumped and dropped it, at which point private messages break
// at runtime inside a packaged app.
//
// And `@noble/ciphers` shipped without a THIRD-PARTY-NOTICES entry, because that
// list is curated by hand. MIT requires the notice to travel with the code.
{
  console.log("\nevery module src/ imports is declared and credited");
  const pkg = JSON.parse(fs.readFileSync(R("package.json"), "utf8"));
  const deps = new Set(Object.keys(pkg.dependencies || {}));
  const notices = fs.readFileSync(R("scripts/notices.mjs"), "utf8");

  const imported = new Set();
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { if (!/vendor/.test(full)) walk(full); continue; }
      if (!/\.js$/.test(e.name) || /\.min\./.test(e.name)) continue;
      const src = fs.readFileSync(full, "utf8");
      for (const m of src.matchAll(/require\("([^"]+)"\)/g)) {
        const id = m[1];
        if (id.startsWith("node:") || id.startsWith(".")) continue;
        if (id === "electron") continue;                 // provided by the runtime
        // Scoped packages keep two segments; everything else keeps one.
        imported.add(id.startsWith("@") ? id.split("/").slice(0, 2).join("/") : id.split("/")[0]);
      }
    }
  };
  walk(R("src"));

  const problems = [
    ...[...imported].filter((d) => !deps.has(d))
      .map((d) => `${d} is required by src/ but not in dependencies`),
    // Credited by name in the curated SHIPPED list, which is what generates the
    // notices file. Checking the source list rather than the output keeps this
    // honest when the output is regenerated.
    ...[...deps].filter((d) => !notices.includes(`"${d}"`))
      .map((d) => `${d} ships but has no THIRD-PARTY-NOTICES entry`),
  ];
  problems.length
    ? fail("dependencies", problems.join("; "))
    : pass(`all ${imported.size} imports declared, all ${deps.size} runtime deps credited`);
}

// ── the licence says one thing ────────────────────────────────────────────────
// LICENSE carried the MIT grant — "permission is hereby granted... to deal in
// the Software without restriction... distribute, sublicense, and/or sell" —
// while docs/TERMS.md, which ships to every user, said the software is not open
// source and may not be redistributed. Two shipped documents granting and
// withholding the same rights, and THIRD-PARTY-NOTICES.md (also shipped) sided
// with the MIT one. Resolved in favour of the licence on 8 August 2026.
//
// Since 13 Oct 2026 the licence is the Apache License 2.0 (MIT
// before). Five statements now, and a new way to be wrong: an Apache LICENSE
// is the licence's own text and nothing else, so it is compared with the
// published text by its hash, and what the project has to say for itself lives
// in NOTICE, which the licence requires to travel with the code.
{
  console.log("\nthe project states one licence for itself");
  const problems = [];
  const licence = fs.readFileSync(R("LICENSE"), "utf8");
  const terms = fs.readFileSync(R("docs/TERMS.md"), "utf8");
  // Only the preamble: the rest of the notices file is third-party licence text.
  const notices = fs.readFileSync(R("THIRD-PARTY-NOTICES.md"), "utf8").split("\n---")[0];

  // https://www.apache.org/licenses/LICENSE-2.0.txt, SHA-256.
  const APACHE_2 = "cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30";
  if (createHash("sha256").update(fs.readFileSync(R("LICENSE"))).digest("hex") !== APACHE_2) {
    problems.push(/Apache License/.test(licence) ? "LICENSE is not the Apache License 2.0 as published — it has been edited"
                                                 : "LICENSE is not the Apache License 2.0");
  }
  if (!fs.existsSync(R("NOTICE"))) problems.push("there is no NOTICE file, which the licence requires to travel with the code");
  else {
    const notice = fs.readFileSync(R("NOTICE"), "utf8");
    if (!/^AuralFM\nCopyright \d{4} Melton Bell III$/m.test(notice)) problems.push("NOTICE does not open with the name and the copyright");
    if (!/Apache License, Version 2\.0/.test(notice)) problems.push("NOTICE does not name the licence");
    if (/\bMIT\b/.test(notice)) problems.push("NOTICE still speaks of MIT");
  }
  // The two documents that ship must not contradict the grant. This is the exact
  // failure that ran for months in the other direction: LICENSE granted rights
  // while docs/TERMS.md forbade redistribution, and both reached every user.
  if (/not open source/i.test(terms)) {
    problems.push("docs/TERMS.md still says the software is not open source");
  }
  if (/you may not redistribute/i.test(terms)) {
    problems.push("docs/TERMS.md still forbids redistribution");
  }
  if (!/Apache License, version 2\.0|Apache 2\.0 licen[cs]e/i.test(terms)) problems.push("docs/TERMS.md does not name the Apache 2.0 licence");
  if (/under the MIT licen[cs]e\.\*\*|narrowing the MIT/i.test(terms)) problems.push("docs/TERMS.md still grants the MIT licence");
  if (/is proprietary/i.test(notices)) problems.push("THIRD-PARTY-NOTICES preamble calls AuralFM proprietary");
  if (!/open source/i.test(notices)) {
    problems.push("THIRD-PARTY-NOTICES preamble does not say AuralFM is open source");
  }
  if (!/Apache License 2\.0/.test(notices)) problems.push("THIRD-PARTY-NOTICES preamble does not say Apache 2.0 (npm run notices)");
  const pkgLicence = JSON.parse(fs.readFileSync(R("package.json"), "utf8")).license || "";
  if (pkgLicence !== "Apache-2.0") problems.push(`package.json license is "${pkgLicence}", not Apache-2.0`);
  if (!/Apache 2\.0 licensed/.test(fs.readFileSync(R("README.md"), "utf8"))) problems.push("the README does not say Apache 2.0");
  // "Give any other recipients of the Work a copy of this License" (4a), and
  // the NOTICE with it (4d): they have to be inside the app that is handed out.
  const shipped = JSON.parse(fs.readFileSync(R("package.json"), "utf8")).build?.files || [];
  for (const f of ["LICENSE", "NOTICE"]) if (!shipped.includes(f)) problems.push(`${f} is not packed into the app`);

  problems.length
    ? fail("licence", problems.join("; "))
    : pass("LICENSE (the published text, unedited), NOTICE, TERMS, the notices preamble, package.json and the README all say Apache 2.0");
}

// ── every licence that ships is one we can ship ───────────────────────────────
// AuralFM is proprietary. Bundling a copyleft dependency would either force the
// source open or make distribution unlawful, and until now nothing checked:
// GPL-3.0 was refused once (Meshtastic, #28) on somebody remembering to look.
// That is not a control, it is a habit — and habits do not survive a late night
// and an `npm install` that fixes the bug.
//
// An allowlist rather than a denylist, deliberately. A new licence nobody has
// considered should stop the build and get a decision, not sail through because
// it was not on a list of known-bad ones.
{
  console.log("\nevery licence that ships is on the allowlist");

  // Permissive and proprietary-compatible. Anything else needs an exception with
  // a reason, below.
  const ALLOW = new Set([
    "MIT", "MIT-0", "ISC", "BSD-2-Clause", "BSD-3-Clause", "Apache-2.0",
    "0BSD", "CC0-1.0", "Unlicense", "BlueOak-1.0.0", "Python-2.0",
  ]);

  /**
   * Deliberate acceptances, each with the reason it is safe here.
   *
   * Empty today, and that is the point: it should stay short, and every entry
   * should be a decision somebody made on purpose rather than a hole.
   */
  const EXCEPTIONS = {
    // "some-package": "MPL-2.0 — file-level copyleft, and we do not modify it",
  };

  /** SPDX expressions: OR needs one allowed operand, AND needs all of them. */
  const allowed = (expr) => {
    if (!expr || typeof expr !== "string") return false;
    const e = expr.trim().replace(/^\((.*)\)$/, "$1").trim();
    if (ALLOW.has(e)) return true;
    if (/\sOR\s/i.test(e)) return e.split(/\s+OR\s+/i).some((x) => allowed(x));
    if (/\sAND\s/i.test(e)) return e.split(/\s+AND\s+/i).every((x) => allowed(x));
    return false;
  };

  /** Node's own resolution: nearest node_modules first, then upward. */
  const findPkg = (name, fromDir) => {
    let dir = fromDir;
    for (let hops = 0; hops < 20; hops++) {
      const p = path.join(dir, "node_modules", ...name.split("/"), "package.json");
      if (fs.existsSync(p)) return p;
      const up = path.dirname(dir);
      if (up === dir || !dir.startsWith(ROOT)) break;
      dir = up;
    }
    return null;
  };

  const shipped = new Map();      // "name@version" -> record
  const problems = [];

  const walk = (name, fromDir, why, deep = true) => {
    const p = findPkg(name, fromDir);
    if (!p) { problems.push(`${name} (${why}) is not installed, so its licence cannot be read`); return; }
    let j;
    try { j = JSON.parse(fs.readFileSync(p, "utf8")); }
    catch { problems.push(`${name}: package.json unreadable`); return; }
    const key = `${name}@${j.version}`;
    if (shipped.has(key)) return;
    shipped.set(key, { name, version: j.version, licence: j.license, why });
    if (!deep) return;
    // Transitive dependencies are packaged too, so they count.
    for (const dep of Object.keys(j.dependencies || {})) {
      walk(dep, path.dirname(p), `via ${name}`);
    }
  };

  const pkg = JSON.parse(fs.readFileSync(R("package.json"), "utf8"));
  // 1. the production tree — electron-builder packages all of it into the asar
  for (const dep of Object.keys(pkg.dependencies || {})) walk(dep, ROOT, "runtime dependency");
  // 2. the vendored libraries. globe.gl ships as a UMD bundle with its
  //    dependencies inlined, so the whole subtree is in the app whether or not it
  //    appears in the production tree.
  for (const dep of ["globe.gl", "three", "three-globe"]) walk(dep, ROOT, "vendored");
  // 3. Electron itself, whose runtime *is* the app.
  //
  //    Not recursed: @electron/get, sumchecker and the rest are download helpers
  //    that run at install time and are never packaged. Walking into them would
  //    let the pass message claim they ship, which is the kind of small
  //    overstatement this file exists to prevent.
  walk("electron", ROOT, "the runtime is bundled into the app", false);

  for (const rec of shipped.values()) {
    if (EXCEPTIONS[rec.name]) continue;
    if (!rec.licence) {
      problems.push(`${rec.name}@${rec.version} declares no licence (${rec.why})`);
    } else if (!allowed(rec.licence)) {
      problems.push(`${rec.name}@${rec.version} is ${rec.licence} — not on the allowlist (${rec.why})`);
    }
  }

  problems.length
    ? fail("dependency licences", problems.join("; "))
    : pass(`all ${shipped.size} shipped packages are permissively licensed`);
}

// ── the Chromium notice matches the Electron that ships ──────────────────────
// Chromium's BSD-3-Clause notice is shipped verbatim with a version and a link to
// the full third-party set, because that set is 19 MB. Both go stale the moment
// Electron is upgraded — a new Electron means a new Chromium, and a notice naming
// the old one is worse than no notice, because it looks done.
//
// Checkable offline: the recorded Electron version must match the installed one.
{
  console.log("\nthe Chromium notice matches the Electron that ships");
  const problems = [];
  let meta = null;
  try { meta = JSON.parse(fs.readFileSync(R("assets/licenses/chromium-notice.json"), "utf8")); }
  catch { problems.push("assets/licenses/chromium-notice.json is missing or unreadable"); }

  let text = null;
  try { text = fs.readFileSync(R("assets/licenses/chromium-LICENSE.txt"), "utf8"); }
  catch { problems.push("assets/licenses/chromium-LICENSE.txt is missing"); }

  if (meta && text) {
    const installed = (() => {
      try { return JSON.parse(fs.readFileSync(R("node_modules/electron/package.json"), "utf8")).version; }
      catch { return null; }
    })();
    if (!installed) skip("chromium notice", "electron is not installed");
    else if (meta.electron !== installed) {
      problems.push(`notice records Electron ${meta.electron}, but ${installed} is installed `
        + `— refresh the Chromium notice (see the _comment in chromium-notice.json)`);
    }
    // The text must actually be the notice, not a placeholder somebody pasted.
    for (const need of ["Redistributions in binary form", "Neither the name of Google LLC",
                        "THE COPYRIGHT HOLDERS AND CONTRIBUTORS"]) {
      if (!text.includes(need)) problems.push(`chromium-LICENSE.txt is missing "${need}"`);
    }
    // And it must reach the shipped file verbatim.
    const notices = fs.readFileSync(R("THIRD-PARTY-NOTICES.md"), "utf8");
    if (!notices.includes(text.trim())) {
      problems.push("THIRD-PARTY-NOTICES.md does not contain the Chromium notice verbatim");
    }
    if (!notices.includes(String(meta.chromium))) {
      problems.push(`THIRD-PARTY-NOTICES.md does not name Chromium ${meta.chromium}`);
    }
  }

  problems.length
    ? fail("chromium notice", problems.join("; "))
    : pass(`Chromium ${meta?.chromium} notice ships verbatim and matches Electron ${meta?.electron}`);
}

// ── every require of package.json finds one ────────────────────────────────
// src/main/ipc-app.js read the build channel with require("../package.json"),
// written when it lived in src/main.js. After the split into src/main/ that
// named src/package.json, which does not exist; the try/catch around it made
// the failure silent, so every build reported no channel — no "beta" in About,
// and the studio (shown in beta builds) never appeared in an installed app.
{
  console.log("\nevery require of package.json finds one");
  const bad = [];
  const walk = (dir) => fs.readdirSync(R(dir), { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? (d.name === "vendor" ? [] : walk(`${dir}/${d.name}`)) : d.name.endsWith(".js") ? [`${dir}/${d.name}`] : []);
  for (const f of walk("src")) {
    for (const m of fs.readFileSync(R(f), "utf8").matchAll(/require\(\s*["'](\.{1,2}\/[^"']*package\.json)["']\s*\)/g)) {
      if (!fs.existsSync(path.resolve(path.dirname(R(f)), m[1]))) bad.push(`${f} requires ${m[1]}, which is not there`);
    }
  }
  bad.length ? fail("every require of package.json finds one", bad.join("; "))
    : pass("each relative require of package.json names a file that exists");
}

// ── nothing secret is ever in a published folder ───────────────────────────
// Scanners ask every site for /.env, /.env.production, /.git/config (here.now's
// analytics, 27 Sept: dozens a day). here.now refuses hidden files, but the only
// sure defence is that no such file is ever in dist-web/ (the sites hold the
// same check in AuralFM/site). Keys live in ~/.herenow and ~/.resend, outside
// the repo.
{
  const name = "nothing secret is ever in a published folder";
  console.log(`\n${name}`);
  const SECRET = /^(\.env(\..*)?|\.git|\.npmrc|id_rsa.*|.*\.pem|.*\.key|credentials(\..*)?|\.netrc)$/i;
  const bad = [];
  const walk = (dir) => { for (const e of fs.readdirSync(R(dir), { withFileTypes: true })) {
    if (SECRET.test(e.name)) bad.push(`${dir}/${e.name}`);
    else if (e.isDirectory() && e.name !== "node_modules") walk(`${dir}/${e.name}`);
  } };
  if (fs.existsSync(R("dist-web"))) walk("dist-web");
  bad.length ? fail(name, bad.join(", ")) : pass("no .env, .git, keys or credentials in the published folder");
}

// ── the Mac app carries the catalogue once, packed ───────────────────────────
// 38 MB of the app was the catalogue as plain JSON. `npm run dist` gzips it
// into data/packed/ (scripts/pack-data.mjs) and src/packed.js reads either
// form. Three ways that goes wrong: a release built before packing opens to
// an empty globe (as on 18 September, when the list was missing); both forms
// ship and nothing is saved; or a stale data/packed/ shadows a rebuilt
// catalogue on the machine that built it.
{
  console.log("\nthe Mac app carries the catalogue once, packed");
  const gaps = [];
  const files = pkg.build.files;
  if (!files.includes("data/packed/**/*")) gaps.push("the build does not carry data/packed/");
  if (files.some((f) => /^data\/(stations\.min\.json|profiles\/)/.test(f))) gaps.push("the build still carries the plain catalogue beside the packed one");
  if (!/pack-data\.mjs && node scripts\/audit\.mjs --release/.test(pkg.scripts.dist)) gaps.push("npm run dist does not pack the catalogue before its checks");
  const reader = readSrc("src/packed.js");
  if (!(reader.indexOf("fs.existsSync(plain)") > 0 && reader.indexOf("fs.existsSync(plain)") < reader.indexOf("fs.existsSync(gz)"))) gaps.push("src/packed.js does not read the plain file first");
  if (!/readPacked\("stations\.min\.json"\)/.test(readSrc("src/catalog.js")) || !/catalog\.usePacked\(require\("\.\/packed"\)\.read\)/.test(readSrc("src/main.js"))) gaps.push("the catalogue is not read through src/packed.js");
  // The web build wraps catalog.js and has no zlib (it stopped the build on 8 Oct).
  if (/require\("\.\/packed"\)|node:zlib/.test(readSrc("src/catalog.js"))) gaps.push("src/catalog.js reaches for zlib itself, which the web build cannot wrap");
  if (!/packed\.read\(`profiles\/\$\{s\}\.json`\)/.test(readSrc("src/profiles.js"))) gaps.push("profiles are not read through src/packed.js");
  if (RELEASE || fs.existsSync(R("data/packed"))) {
    const r = spawnSync(process.execPath, [R("scripts/pack-data.mjs"), "--check"], { encoding: "utf8" });
    if (r.status !== 0 && RELEASE) gaps.push((r.stderr || "data/packed/ is behind").trim());
  }
  gaps.length ? fail("the Mac app carries the catalogue once, packed", gaps.join("; "))
    : pass("packed in the build, plain in a checkout, and a release is checked against the catalogue it was built from");
}

// ── the Mac app does not grow by itself ──────────────────────────────────────
// electron-builder 26.17 began shipping LICENSES.chromium.html (19 MB) and 24
// gendered language folders (7 MB) that earlier versions left out. It arrived
// with a routine dependency update, and the first build after it was no
// smaller for having had 28 MB of catalogue packed. scripts/after-pack.cjs
// takes both back out; this runs it on a made-up app.
{
  console.log("\nthe Mac app does not grow by itself");
  const gaps = [];
  if (pkg.build.afterPack !== "scripts/after-pack.cjs") gaps.push("the build does not run scripts/after-pack.cjs");
  const { createRequire } = await import("node:module");
  const os = await import("node:os");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "auralfm-pack-"));
  try {
    const app = path.join(tmp, "AuralFM.app");
    const res = path.join(app, "Contents", "Frameworks", "Electron Framework.framework", "Versions", "A", "Resources");
    for (const d of ["en.lproj", "en_GB.lproj", "es_419.lproj", "en_FEMININE.lproj", "es_419_NEUTER.lproj", "de_MASCULINE.lproj"]) fs.mkdirSync(path.join(res, d), { recursive: true });
    fs.mkdirSync(path.join(app, "Contents", "Resources"), { recursive: true });
    fs.writeFileSync(path.join(app, "Contents", "Resources", "LICENSES.chromium.html"), "x");
    fs.writeFileSync(path.join(app, "Contents", "Resources", "app.asar"), "x");
    createRequire(import.meta.url)(R("scripts/after-pack.cjs")).trim(app);
    const left = fs.readdirSync(res).sort().join(",");
    if (left !== "en.lproj,en_GB.lproj,es_419.lproj") gaps.push(`the language folders left are ${left}`);
    if (fs.existsSync(path.join(app, "Contents", "Resources", "LICENSES.chromium.html"))) gaps.push("the 19 MB Chromium licence page is still in the app");
    if (!fs.existsSync(path.join(app, "Contents", "Resources", "app.asar"))) gaps.push("it removed the app itself");
  } catch (e) { gaps.push(`could not run scripts/after-pack.cjs: ${e.message}`); }
  finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  if (!/LICENSES\.chromium\.html/.test(readSrc("THIRD-PARTY-NOTICES.md"))) gaps.push("the notices no longer say where Chromium's full licences are");
  gaps.length ? fail("the Mac app does not grow by itself", gaps.join("; "))
    : pass("the Chromium licence page and the gendered language folders are taken out after packing, and the notices say where the licences are");
}

// ── the newsletter goes to the people who asked for it ──────────────────────
// 9 Oct 2026. The newsletter list holds two kinds of asking (the newsletter, and
// "tell me when the shop opens"), and it sits beside the beta and sponsor lists.
// The Privacy Policy promises that joining one list does not put you on another,
// and that nobody gets the same email twice. An issue is written as a note, so
// what a note may put into an email has to stay narrow: links to https, bold,
// and nothing else as markup. scripts/mail.mjs is run here on made-up lists,
// with no network, and never with --send.
{
  const name = "the newsletter goes to the people who asked for it";
  console.log(`\n${name}`);
  const gaps = [];
  const tmp = fs.mkdtempSync(path.join((await import("node:os")).tmpdir(), "auralfm-mail-"));
  try {
    const row = (id, topic) => ({ id, name: `${id} Person`, email: `${id}@example.com`, topic });
    fs.writeFileSync(path.join(tmp, "lists.json"), JSON.stringify({
      newsletter: [row("ann", "letter"), row("bo", "letter"), row("cy", "shop")],
      beta: [{ id: "dee", name: "Dee", email: "dee@example.com", platform: "mac" }], members: [], claims: [],
    }));
    fs.writeFileSync(path.join(tmp, "sent.json"), JSON.stringify({ "issue:issue-9": { bo: "2026-10-09T00:00:00Z" }, letter: { ann: "x" }, beta: { dee: "x" } }));
    fs.writeFileSync(path.join(tmp, "Issue 9.md"), "---\nkind: letter\n---\n# Seven stations\n\nHi {name},\n\n1. [One FM](https://listen.auralfm.xyz/?station=af-1) · Here\n2. [Bad](javascript:alert(1)) <script>x</script>\n\n**Picked** by people.\n\n[All seven](https://auralfm.xyz/links/)\n");
    const env = { ...process.env, MAIL_RECORDS: path.join(tmp, "lists.json"), MAIL_SENT: path.join(tmp, "sent.json"), MAIL_PREVIEWS: path.join(tmp, "previews"), MAIL_POSTAL_ADDRESS: "1 Test Street, Testville" };
    const run = (...args) => { const r = spawnSync(process.execPath, [R("scripts/mail.mjs"), ...args], { env, encoding: "utf8" }); return (r.stdout || "") + (r.stderr || ""); };
    // An issue: ann asked for the newsletter and has not had it. bo has had it. cy only asked about the shop. dee is on another list.
    const issue = run("--issue", path.join(tmp, "Issue 9.md"));
    if (!/mail: 1 to send: 1 issue:issue-9;/.test(issue)) gaps.push(`an issue for one reader out of four people is queued as: ${issue.split("\n")[0]}`);
    if (!/nothing sent/.test(issue)) gaps.push("it does not say nothing was sent");
    const page = fs.existsSync(path.join(tmp, "previews", "issue-issue-9.html")) ? fs.readFileSync(path.join(tmp, "previews", "issue-issue-9.html"), "utf8") : "";
    if (!page) gaps.push("an issue writes no preview");
    else {
      if (!page.includes('<a href="https://listen.auralfm.xyz/?station=af-1"')) gaps.push("a link in an issue is not a link in the email");
      if (/<script>x|href="javascript:/i.test(page)) gaps.push("an issue can put a script or a javascript: link into the email");
      if (!page.includes("<strong>Picked</strong>")) gaps.push("bold is lost");
      if (!/>All seven<\/a><\/p>/.test(page) || /\[All seven\]/.test(page)) gaps.push("the last link standing alone is not the button");
      if (!page.includes("1 Test Street, Testville") || !/Unsubscribe/.test(page)) gaps.push("an issue has no postal address or no way off the list");
      if (/kind: letter/.test(page)) gaps.push("the note's front matter is in the email");
      if (/\{name\}/.test(page)) gaps.push("{name} is not filled in");
    }
    // The everyday run: bo and cy have not had their welcome; ann and dee have had theirs.
    const daily = run();
    if (!/mail: 2 to send: 1 letter, 1 shop;/.test(daily)) gaps.push(`the welcomes are queued as: ${daily.split("\n")[0]}`);
  } catch (e) { gaps.push(`could not run scripts/mail.mjs: ${e.message}`); }
  finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  gaps.length ? fail(name, gaps.join("; "))
    : pass("an issue reaches only newsletter readers who have not had it, a note cannot put a script in an email, and each email carries the address and the way off");
}

// ── the repository's own paperwork holds together ───────────────────────────
// 13 Oct 2026. Four things that fail silently on GitHub. The issue chooser had
// a link with no address, which GitHub answers by ignoring the whole file. A
// branch rule names the check that must pass, and a job renamed later is a
// rule nothing can ever satisfy. Code scanning on a private repository fails
// at its last step on every push. And a page of links is only as good as the
// files it points at.
{
  const name = "the repository's own paperwork holds together";
  console.log(`\n${name}`);
  const { createRequire } = await import("node:module");
  let yaml = null;
  try { yaml = createRequire(import.meta.url)("js-yaml"); } catch { /* not installed here */ }
  if (!yaml) skip(name, "js-yaml is not installed (npm ci)");
  else {
    const gaps = [];
    const y = (f) => yaml.load(fs.readFileSync(R(f), "utf8"));
    for (const l of y(".github/ISSUE_TEMPLATE/config.yml").contact_links || []) {
      if (!l.name || !l.about || !/^https:\/\//.test(l.url || "")) gaps.push(`the issue chooser's "${l.name || "?"}" has no address or no description, so GitHub ignores the whole file`);
      const local = (l.url || "").match(/\/blob\/main\/(.+)$/)?.[1];
      if (local && !fs.existsSync(R(local))) gaps.push(`the issue chooser links to ${local}, which is not here`);
    }
    const flows = fs.readdirSync(R(".github/workflows")).filter((f) => f.endsWith(".yml"));
    const jobs = new Set();
    for (const f of flows) {
      const w = y(`.github/workflows/${f}`);
      if (!w.permissions) gaps.push(`${f} does not say what its token may do`);
      const on = w.on || w[true] || {};          // YAML reads a bare `on` as true
      if ("pull_request_target" in on) gaps.push(`${f} runs with secrets on a stranger's pull request`);
      for (const j of Object.keys(w.jobs || {})) jobs.add(j);
    }
    const rule = JSON.parse(fs.readFileSync(R(".github/rulesets/main.json"), "utf8"));
    const need = rule.rules.find((r) => r.type === "required_status_checks")?.parameters.required_status_checks.map((c) => c.context) || [];
    if (!need.length) gaps.push("the rule for main requires no check");
    for (const c of need) if (!jobs.has(c)) gaps.push(`the rule for main waits for a check called "${c}", and no workflow has that job`);
    const scan = y(".github/workflows/codeql.yml").jobs.analyze;
    if (!/repository\.private/.test(scan.if || "")) gaps.push("code scanning is not held back on a private repository, where it fails on every push");
    for (const page of ["README.md", "docs/README.md"]) {
      const dir = path.dirname(R(page));
      for (const [, to] of fs.readFileSync(R(page), "utf8").matchAll(/\]\((?!https?:|#|mailto:)([^)#]+)(?:#[^)]*)?\)/g))
        if (!fs.existsSync(path.resolve(dir, to))) gaps.push(`${page} links to ${to}, which is not here`);
    }
    gaps.length ? fail(name, gaps.join("; "))
      : pass(`the issue chooser's links have addresses, ${flows.length} workflows say what their token may do, the rule for main waits for a job that exists, and every link in the two READMEs lands`);
  }
}

// ── the mailing list is read to its last page ───────────────────────────────
// here.now hands Site Data back a page at a time, with nextCursor. mail.mjs
// read only the first page: past it, everyone who signed up would have been
// left off every newsletter without a word. records() is lifted out of the
// script (which must not run here: it sends mail) and fed two fake pages.
{
  const name = "the mailing list is read to its last page";
  console.log(`\n${name}`);
  const src = readSrc("scripts/mail.mjs");
  const at = src.indexOf("async function records(");
  const fn = at < 0 ? "" : src.slice(at, src.indexOf("\n}\n", at) + 2);
  const gaps = [];
  if (!fn) gaps.push("scripts/mail.mjs has no records() — this check is blind");
  else {
    const pages = { "": { records: [{ id: "1", data: { email: "a@x" } }, { id: "2", data: { email: "b@x" } }], nextCursor: "p2" },
                    "p2": { records: [{ id: "3", data: { email: "c@x" } }], nextCursor: null } };
    const fakeFetch = async (url) => {
      const c = new URL(url).searchParams.get("cursor") || "";
      return { ok: true, json: async () => pages[c] || { records: [], nextCursor: null } };
    };
    try {
      const records = new Function("fetch", "fixture", "key", `${fn}; return records;`)(fakeFetch, null, "k");
      const got = await records("site", "newsletter");
      if (got.length !== 3) gaps.push(`two pages of three sign-ups came back as ${got.length}`);
    } catch (e) { gaps.push(`records() could not be run: ${e.message}`); }
  }
  gaps.length ? fail(name, gaps.join("; ")) : pass("records() follows nextCursor to the end of a list");
}

// ── an error report leaves a phone only when asked, and says nothing about anyone ──
// The web version can send its errors (there is no local file to keep them in)
// only with "Send error reports" on, which is off by default. What goes is
// scrubbed: no outside address (a stream's address names the station), no key,
// nothing a caller adds. This lifts redactReport() out of web/bridge.js and runs it.
{
  const name = "an error report leaves a phone only when asked, and says nothing about anyone";
  console.log(`\n${name}`);
  const { createRequire } = await import("node:module");
  const req = createRequire(import.meta.url);
  const gaps = [];
  if (req(R("src/prefs.js")).DEFAULTS.errorReports !== false) gaps.push("error reports are not off by default");
  const bridge = readSrc("web/bridge.js");
  const send = bridge.slice(bridge.indexOf("function sendReport("), bridge.indexOf("function sendReport(") + 400);
  if (!/getPrefs\(\)\.errorReports !== true\) return|getPrefs\(\)\.errorReports !== true \|\|/.test(send)) gaps.push("sendReport() does not stop when the switch is off");
  const at = bridge.indexOf("function redactReport(");
  const fn = at < 0 ? "" : bridge.slice(at, bridge.indexOf("\n  }\n", at) + 4);
  if (!fn) gaps.push("web/bridge.js has no redactReport() — this check is blind");
  else {
    const redact = new Function(`${fn}; return redactReport;`)();
    const key = "ab".repeat(32);
    const out = redact({ where: "uncaught", message: `failed to load https://stream.example.com/live.mp3?id=9 for ${key}`,
      stack: "Error\n at play (https://listen.auralfm.xyz/explore-playback.js?v=abc:12:3)\n at wss://relay.example/:1",
      page: "index.html", repeat: 2, station: "Secret FM", lat: 51.5 }, "0.1.0", "ios");
    const all = JSON.stringify(out);
    if (/stream\.example|relay\.example/.test(all)) gaps.push("an outside address went out in a report");
    if (all.includes(key)) gaps.push("a key went out in a report");
    if ("station" in out || "lat" in out) gaps.push("a field the caller added went out in a report");
    if (!/explore-playback\.js:12:3/.test(out.stack || "")) gaps.push("the app's own line numbers were lost, so a report says nothing useful");
  }
  const build = readSrc("scripts/build-web.mjs");
  const block = build.slice(build.indexOf('"data.json"'), build.indexOf("}, null, 2)", build.indexOf('"data.json"')));
  if (!/errors:\s*\{/.test(block)) gaps.push("scripts/build-web.mjs does not declare the errors collection");
  else if (!/read:\s*"owner"/.test(block)) gaps.push("the error reports can be read by someone other than AuralFM");
  if (!/id="errorReportsCard" hidden/.test(readSrc("src/renderer/settings.html"))) gaps.push("the switch shows on the desktop, which never sends");
  if (!/\*\*Error reports\*\*/.test(readSrc("docs/PRIVACY.md"))) gaps.push("docs/PRIVACY.md does not say what an error report carries");
  gaps.length ? fail(name, gaps.join("; ")) : pass("off by default; on, a report carries no outside address, no key and nothing a caller adds, and only AuralFM can read it");
}

// ── a script run from a folder with a space or a "#" still runs ─────────────
// crawl-sdr.mjs decided whether it had been run (rather than imported) with
// import.meta.url compared with "file://" + process.argv[1]. In a folder like
// "HARD DRIVE #2" the left side is escaped and the right is not: the two never
// matched, `npm run crawl:sdr` exited 0 having done nothing, and the receiver
// list went two months without a refresh. Compare as URLs (pathToFileURL).
{
  const name = "a script run from a folder with a space or a \"#\" still runs";
  console.log(`\n${name}`);
  const bad = fs.readdirSync(R("scripts")).filter((f) => /\.m?js$/.test(f))
    .filter((f) => /import\.meta\.url\s*===\s*`file:\/\/\$\{process\.argv\[1\]\}`/.test(fs.readFileSync(R(`scripts/${f}`), "utf8")));
  bad.length ? fail(name, `${bad.join(", ")} compare import.meta.url with a plain "file://" + argv; use pathToFileURL(process.argv[1]).href`)
    : pass("every script that checks whether it was run compares URLs, not strings");
}

// ── the line is written one way ─────────────────────────────────────────────
// "Less algorithms. More humans." is two sentences on the cards, the decks and
// the site's band. The web app's splash and its ticker said "Less algorithms,
// more humans." (#59): one line, two spellings, and the splash is the first
// thing a listener reads.
{
  const name = "the line is written one way";
  console.log(`\n${name}`);
  const files = ["scripts/build-web.mjs", ...fs.readdirSync(R("web")).filter((f) => f.endsWith(".js")).map((f) => `web/${f}`),
    ...fs.readdirSync(R("src/renderer")).filter((f) => /\.(js|html)$/.test(f)).map((f) => `src/renderer/${f}`)];
  const off = files.filter((f) => /less algorithms,\s*more humans/i.test(fs.readFileSync(R(f), "utf8")));
  off.length ? fail(name, `"Less algorithms, more humans" in ${off.join(", ")}; it is "Less algorithms. More humans."`)
    : pass(`${files.length} files say "Less algorithms. More humans." or nothing`);
}
