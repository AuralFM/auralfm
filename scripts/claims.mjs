#!/usr/bin/env node
/**
 * Stations claiming their pages: from the form to the app.
 *
 *   node scripts/claims.mjs              fetch new claims, write the review sheet
 *   node scripts/claims.mjs --import F   take the reviewed sheet: approved claims go live
 *
 * The form at docs.auralfm.xyz/claim stores each claim in that site's own data
 * (docs-site/.herenow/data.json, "claims": anyone can send, only the owner can
 * read). This reads them with the owner key that publishing already uses, and
 * writes claims-review.csv to the vault: who sent it, for which station, what
 * they want shown, and whether their email is at the station's own website — the
 * quickest proof that it is theirs. Fill in "approve" (yes or no) and import.
 *
 * Nothing goes on a station's page until it is approved here: otherwise anyone
 * could put their own tip address on somebody else's station. Approved claims
 * are kept in data/claims.json (not tracked: it holds names and emails), and
 * scripts/profiles.mjs publishes their description, links and Lightning
 * address — never the name or the email.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const R = (...p) => path.join(ROOT, ...p);
const VAULT = "/Users/mb3/Library/Mobile Documents/iCloud~md~obsidian/Documents/MB3Vault/04 Projects/AuralFM";
const SHEET = fs.existsSync(VAULT) ? path.join(VAULT, "claims-review.csv") : R("data/claims-review.csv");
const STORE = R("data/claims.json");
const SLUG = "rapid-ember-55ng";   // docs.auralfm.xyz
const argv = process.argv.slice(2);

// A claim sent from a page opened before 26 Sept 2026 names the station by
// radio.garden's old id; data/legacy-ids.json (scripts/own.mjs) says what it is now.
const LEGACY = R("data/legacy-ids.json");
const legacy = fs.existsSync(LEGACY) ? JSON.parse(fs.readFileSync(LEGACY, "utf8")) : {};
const store = fs.existsSync(STORE) ? JSON.parse(fs.readFileSync(STORE, "utf8")) : { approved: {}, seen: {} };
const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
function parseCsv(text) {
  const rows = []; let row = [], c = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { c += '"'; i++; } else if (ch === '"') q = false; else c += ch; }
    else if (ch === '"') q = true;
    else if (ch === ",") { row.push(c); c = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(c); rows.push(row); row = []; c = ""; }
    else c += ch;
  }
  if (c || row.length) { row.push(c); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

if (argv[0] === "--import") {
  const [head, ...rows] = parseCsv(fs.readFileSync(argv[1] || SHEET, "utf8"));
  const at = (name) => head.findIndex((h) => h.trim().toLowerCase() === name);
  const I = Object.fromEntries(["id", "approve", "station id", "station", "lightning", "nostr", "description", "links", "site"].map((k) => [k, at(k)]));
  let yes = 0, no = 0;
  for (const r of rows) {
    const verdict = (r[I.approve] || "").trim().toLowerCase();
    if (!verdict) continue;
    store.seen[r[I.id]] = verdict;
    if (!/^(y|yes|x|true|1)$/.test(verdict)) { no++; continue; }
    const sid = legacy[r[I["station id"]]?.trim()] || r[I["station id"]]?.trim();
    if (!sid) { console.log(`claims: "${r[I.station]}" has no station id; find it in the app and add it to the sheet`); continue; }
    store.approved[sid] = {
      claim: r[I.id], at: new Date().toISOString().slice(0, 10),
      ...(r[I.lightning]?.trim() ? { lightning: r[I.lightning].trim() } : {}),
      ...(r[I.nostr]?.trim() ? { nostr: r[I.nostr].trim() } : {}),
      ...(r[I.description]?.trim() ? { description: r[I.description].trim() } : {}),
      ...(r[I.links]?.trim() ? { links: r[I.links].trim().split(/\s*\n\s*|\s+(?=https?:)/).filter((l) => /^https?:\/\//i.test(l)) } : {}),
      ...(r[I.site]?.trim() ? { website: r[I.site].trim() } : {}),
    };
    yes++;
  }
  fs.writeFileSync(STORE, JSON.stringify(store, null, 2) + "\n");
  console.log(`claims: ${yes} approved, ${no} declined; ${Object.keys(store.approved).length} live after the next ` +
    "node scripts/profiles.mjs");
  process.exit(0);
}

// ── fetch and write the sheet ──────────────────────────────────────────────
const credFile = path.join(os.homedir(), ".herenow", "credentials");
const key = fs.existsSync(credFile) ? fs.readFileSync(credFile, "utf8").trim().split(/\s+/).pop() : "";
if (!key) { console.error("claims: no here.now key in ~/.herenow/credentials"); process.exit(1); }
const res = await fetch(`https://here.now/api/v1/publishes/${SLUG}/data/claims`, {
  headers: { Authorization: `Bearer ${key}`, "X-HereNow-Client": "claude-code/claims-review" },
});
if (!res.ok) { console.error(`claims: here.now answered ${res.status}`); process.exit(1); }
const body = await res.json();
const records = body.records || body.items || body.data || (Array.isArray(body) ? body : []);
const domainOf = (u) => { try { return new URL(/^https?:/i.test(u) ? u : `https://${u}`).hostname.replace(/^www\./, ""); } catch { return ""; } };
const fresh = records.filter((r) => !store.seen[r.id]);
const head = ["id", "sent", "station", "station id", "name", "email", "email at their site", "role", "site", "lightning",
  "nostr", "description", "links", "note", "approve"];
const npub = (t) => (String(t || "").match(/npub1[02-9ac-hj-np-z]{58}/) || [""])[0];
const out = [head.join(",")].concat(fresh.map((r) => {
  const d = r.data || r.fields || r;
  const site = domainOf(d.site), mail = String(d.email || "").split("@")[1] || "";
  const matches = site && mail && (mail === site || mail.endsWith(`.${site}`) || site.endsWith(`.${mail}`)) ? "yes" : "";
  return [r.id, (r.createdAt || r.created_at || "").slice(0, 10), d.station, d.station_id, d.name, d.email, matches, d.role,
    d.site, d.lightning, npub(d.links), d.description, d.links, d.note, ""].map(cell).join(",");
}));
fs.writeFileSync(SHEET, out.join("\n") + "\n");
console.log(`claims: ${records.length} sent in all, ${fresh.length} to review → ${SHEET}`);
