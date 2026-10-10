#!/usr/bin/env node
/**
 * The emails AuralFM sends: to the people who asked for one, and nobody else.
 *
 *   node scripts/mail.mjs                  who would get what; previews written, nothing sent
 *   node scripts/mail.mjs --send           send them (Melton runs this: it writes as him)
 *   node scripts/mail.mjs --test ADDRESS   every email once, to ADDRESS, marked TEST
 *
 *   node scripts/mail.mjs --issue NOTE.md           one issue of the newsletter: who would get it, and a preview
 *   node scripts/mail.mjs --issue NOTE.md --send    send it to the newsletter list
 *   node scripts/mail.mjs --issue NOTE.md --test ADDRESS
 *
 * Six, each an answer to something the person did:
 *
 *   beta       they joined the desktop beta list (auralfm.xyz/beta)
 *   sponsor    they joined the sponsorship waitlist (auralfm.xyz/support)
 *   claim      they claimed their station's page (docs.auralfm.xyz/claim)
 *   approved   Melton approved that claim (scripts/claims.mjs --import)
 *   letter     they signed up for the newsletter (auralfm.xyz/newsletter)
 *   shop       they asked to be told when the shop opens (auralfm.xyz/shop)
 *
 * And the newsletter itself. An issue is a note: its first line, "# …", is the
 * subject; the paragraphs under it are the email. A link is [words](https://…),
 * **bold** is bold, {name} is the reader's first name, and a paragraph that is
 * one link and nothing else becomes the button. It goes to the people on the
 * newsletter list who asked for the newsletter: not to the beta or sponsor
 * lists, and not to those who only asked about the shop (the Privacy Policy
 * says joining one list does not put you on another). Nobody gets an issue
 * twice.
 *
 * The lists live in each site's own data on here.now (read with the owner key
 * publishing already uses, ~/.herenow/credentials); sending goes through Resend
 * from hello@auralfm.xyz (the key in ~/.resend/credentials, or RESEND_API_KEY),
 * and replies come back to hello@. data/mail-sent.json (not tracked: it holds
 * addresses) remembers who has had which email, so nobody gets one twice.
 *
 * There is no server here to send the moment somebody signs up; this is run
 * by hand, like the claims review. Every email says why it came and how to be
 * taken off the list (a reply that says "remove", or the Unsubscribe link),
 * carries List-Unsubscribe, and ends with a postal address (see POSTAL).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const R = (...p) => path.join(ROOT, ...p);
const VAULT = "/Users/mb3/Library/Mobile Documents/iCloud~md~obsidian/Documents/MB3Vault/04 Projects/AuralFM";
// MAIL_PREVIEWS, MAIL_SENT and MAIL_RECORDS (a file of { collection: [rows] } read in
// place of here.now) are for the audit, which runs this without a network or a list.
const PREVIEWS = process.env.MAIL_PREVIEWS || (fs.existsSync(VAULT) ? path.join(VAULT, "Email previews") : R("data/email-previews"));
const SENT = process.env.MAIL_SENT || R("data/mail-sent.json");
const FROM = "AuralFM <hello@auralfm.xyz>";
const REPLY = "hello@auralfm.xyz";
/**
 * A postal address in every email. US law on commercial email (CAN-SPAM)
 * requires a valid physical postal address in each one (a PO box or a
 * registered agent's address counts), and the beta and sponsor emails invite
 * people to pay, so they count. Melton puts his in ~/.resend/postal-address, one
 * line; it is kept out of the repo like the key. --send refuses without it;
 * previews and --test show where it goes.
 */
const postalFile = path.join(os.homedir(), ".resend", "postal-address");
const POSTAL = process.env.MAIL_POSTAL_ADDRESS || (fs.existsSync(postalFile) ? fs.readFileSync(postalFile, "utf8").trim().split("\n")[0] : "");
const argv = process.argv.slice(2);
const send = argv.includes("--send");
const testTo = argv.includes("--test") ? argv[argv.indexOf("--test") + 1] : null;
const issueFile = argv.includes("--issue") ? argv[argv.indexOf("--issue") + 1] : null;

// ── the words ──────────────────────────────────────────────────────────────
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const first = (name) => String(name || "").trim().split(/\s+/)[0] || "there";
const TIERS = { listener: "Listener · $5 a month", supporter: "Supporter · $12 a month", patron: "Patron · $30 a month",
  undecided: "not sure yet — that is fine" };
const PLATFORMS = { mac: "a Mac", windows: "Windows", linux: "Linux" };

/** Each email: subject, a label, paragraphs (plain strings; **bold** allowed), an optional button, and why it came. */
const EMAILS = {
  beta: (d) => ({
    subject: "You're on the AuralFM desktop beta list",
    label: "Desktop beta",
    body: [
      `Hi ${first(d.name)},`,
      `You're on the list for the AuralFM desktop app${PLATFORMS[d.platform] ? `, for ${PLATFORMS[d.platform]}` : ""}. It is the fullest version of the globe: shortwave, stations you add yourself, a player in the menu bar, and soon a studio to go live from your own town.`,
      "The beta opens a few people at a time, Mac first and Windows next. When your turn comes, you'll get an email from me with the download.",
      "Until then, the globe works in any browser and on iPhone, no account needed.",
    ],
    button: ["Listen now", "https://listen.auralfm.xyz"],
    why: "You're getting this because you joined the desktop beta list at auralfm.xyz.",
  }),
  sponsor: (d) => ({
    subject: "You're on the AuralFM sponsor waitlist",
    label: "Sponsorship",
    body: [
      `Hi ${first(d.name)},`,
      `Thank you. You're on the sponsor waitlist${TIERS[d.tier] ? `, as **${TIERS[d.tier]}**` : ""}.`,
      "Sponsors are how AuralFM gets built: no ads, no investors, and nobody paying to be heard. Every station stays free for everyone to hear, forever; sponsors get the newsletter, the Discord, a discount in the shop, and first go at what we build next.",
      "Sponsorship opens soon. You'll be first in, at the price you signed up for, and nothing is charged until you choose to start.",
    ],
    button: ["What sponsors get", "https://auralfm.xyz/support/"],
    why: "You're getting this because you joined the sponsor waitlist at auralfm.xyz.",
  }),
  claim: (d) => ({
    subject: `We got your claim for ${d.station || "your station"}`,
    label: "Station claim",
    body: [
      `Hi ${first(d.name)},`,
      `Thanks for claiming **${d.station || "your station"}** on AuralFM. We check every claim by hand before anything changes on a station's page, so nobody can put their own tip address on someone else's station.`,
      "The quickest way to prove it's yours: write from an address at the station's own website, or put one small file on the website, /.well-known/auralfm.json. The how-to takes two minutes.",
      "Once it's approved, your page shows your description, your links and, if you gave one, a Tip button that sends listeners' tips straight to your own Lightning wallet. AuralFM never holds the money.",
    ],
    button: ["How claiming works", "https://docs.auralfm.xyz/stations/"],
    why: "You're getting this because you claimed a station's page at docs.auralfm.xyz.",
  }),
  approved: (d) => ({
    subject: `${d.station || "Your station"}'s page is live on AuralFM`,
    label: "Claim approved",
    body: [
      `Hi ${first(d.name)},`,
      `Your claim is approved: **${d.station || "your station"}**'s page on AuralFM now shows what you sent us.`,
      d.lightning ? "Your Tip button is live. Listeners' tips go wallet to wallet, straight to the Lightning address you gave; AuralFM never touches the money and takes nothing." : "If you'd like a Tip button, reply with a Lightning address and we'll add it. Tips go wallet to wallet, straight to you; AuralFM takes nothing.",
      "Anything wrong on the page, or anything you'd like changed, just reply.",
    ],
    button: ["Find your station", "https://listen.auralfm.xyz"],
    why: "You're getting this because you claimed a station's page at docs.auralfm.xyz.",
  }),
  letter: (d) => ({
    subject: "You're on the AuralFM list",
    label: "Newsletter",
    body: [
      `Hi ${first(d.name)},`,
      "You're on the list. Seven stations a week, picked by people, east to west. Sometimes a story, or something new on the globe.",
      "No more than one email a week, and nothing in them tracks you.",
    ],
    button: ["This week's stations", "https://auralfm.xyz/links/"],
    why: "You're getting this because you signed up for the newsletter at auralfm.xyz.",
  }),
  shop: (d) => ({
    subject: "We'll tell you when the AuralFM shop opens",
    label: "Shop",
    body: [
      `Hi ${first(d.name)},`,
      "The shop isn't open yet. You'll get one email from me when it is, and nothing else from this list.",
      "Until then, every station is free to hear, and stays free.",
    ],
    button: ["Listen now", "https://listen.auralfm.xyz"],
    why: "You're getting this because you asked to be told when the shop opens, at auralfm.xyz.",
  }),
};

/** One issue of the newsletter, from a note: see the top of this file for how it is written. */
function issue(file) {
  if (!file || !fs.existsSync(file)) { console.error(`mail: no issue at ${file || "(no file given)"}`); process.exit(1); }
  const src = fs.readFileSync(file, "utf8").replace(/^---\n[\s\S]*?\n---\n/, "");      // a note's front matter is not part of the letter
  const blocks = src.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  if (!/^#\s+\S/.test(blocks[0] || "")) { console.error(`mail: ${path.basename(file)} must begin with "# " and the subject`); process.exit(1); }
  const only = /^\[([^\]]+)\]\((https:\/\/[^\s)]+)\)$/;
  const rest = blocks.slice(1), at = rest.findLastIndex((b) => only.test(b));
  const button = at >= 0 ? rest[at].match(only).slice(1, 3) : null;
  const body = rest.filter((_, i) => i !== at);
  if (!body.length) { console.error(`mail: ${path.basename(file)} has a subject and nothing under it`); process.exit(1); }
  const slug = path.basename(file).replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return { kind: `issue:${slug}`, slug, make: (d) => ({
    subject: blocks[0].replace(/^#\s+/, ""), label: "Newsletter",
    body: body.map((p) => p.replace(/\{name\}/g, first(d.name))), button,
    why: "You're getting this because you signed up for the newsletter at auralfm.xyz.",
  }) };
}
const ISSUE = issueFile ? issue(issueFile) : null;
const compose = (kind, d) => (ISSUE && kind === ISSUE.kind ? ISSUE.make(d) : EMAILS[kind](d));

// ── the look ───────────────────────────────────────────────────────────────
// The site's palette (home/aural.css), light, because mail apps flip dark
// designs unpredictably. Tables and inline styles, because mail apps are.
const ONYX = "#0C0B0B", BONE = "#F7F4EE", MUTED = "#5A5752", RULE = "#02E8CD";
const FONT = "'Space Grotesk', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";
const MONO = "'Space Mono', ui-monospace, Menlo, Consolas, monospace";
// What a paragraph may hold: **bold**, [words](https://…) and line breaks. Everything else is text.
const bold = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
  .replace(/\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g, `<a href="$2" style="color:${ONYX}">$1</a>`).replace(/\n/g, "<br>");
function html(e, test) {
  const ps = e.body.map((p) => `<p style="margin:0 0 16px;font:16px/1.55 ${FONT};color:${ONYX}">${bold(p)}</p>`).join("");
  const btn = e.button ? `<p style="margin:24px 0 8px"><a href="${esc(e.button[1])}" style="display:inline-block;background:${ONYX};color:${BONE};font:600 15px/1 ${FONT};text-decoration:none;padding:14px 20px;border-radius:999px">${esc(e.button[0])}</a></p>` : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light"><title>${esc(e.subject)}</title></head>
<body style="margin:0;padding:0;background:${BONE}">
<div style="display:none;max-height:0;overflow:hidden">${esc((e.body[1] || "").replace(/\*\*/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")).slice(0, 140)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BONE}"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td style="padding:0 0 24px;border-bottom:2px solid ${RULE}">
<span style="font:700 15px/1 ${MONO};letter-spacing:.08em;color:${ONYX}">AURAL.FM</span>
<span style="float:right;font:12px/1.4 ${MONO};color:${MUTED}">[ ${esc(test ? `TEST · ${e.label}` : e.label)} ]</span></td></tr>
<tr><td style="padding:28px 0 8px">${ps}${btn}
<p style="margin:24px 0 0;font:16px/1.55 ${FONT};color:${ONYX}">— Melton, AuralFM</p></td></tr>
<tr><td style="padding:28px 0 0;border-top:1px solid #D9D4CB">
<p style="margin:0 0 8px;font:12px/1.5 ${FONT};color:${MUTED}">${esc(e.why)} Reply with “remove” and you’re off the list; reply with anything else and it reaches a person.</p>
<p style="margin:0 0 8px;font:12px/1.5 ${FONT};color:${MUTED}"><a href="mailto:${REPLY}?subject=remove" style="color:${MUTED}">Unsubscribe</a> · AuralFM · ${esc(POSTAL || "[postal address goes here]")}</p>
<p style="margin:0;font:12px/1.5 ${MONO};color:${MUTED}">A globe you listen to · <a href="https://auralfm.xyz" style="color:${MUTED}">auralfm.xyz</a> · <a href="https://docs.auralfm.xyz/privacy/" style="color:${MUTED}">Privacy</a></p>
</td></tr></table></td></tr></table></body></html>`;
}
const text = (e) => [...e.body.map((p) => p.replace(/\*\*/g, "").replace(/\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g, "$1 ($2)")), ...(e.button ? [`${e.button[0]}: ${e.button[1]}`] : []), "— Melton, AuralFM", "",
  `${e.why} Reply with "remove" and you're off the list, or write to ${REPLY} with "remove" in the subject.`,
  `AuralFM · ${POSTAL || "[postal address goes here]"}`, "auralfm.xyz"].join("\n\n");

// ── who ────────────────────────────────────────────────────────────────────
const key = (() => { const f = path.join(os.homedir(), ".herenow", "credentials"); return fs.existsSync(f) ? fs.readFileSync(f, "utf8").trim().split(/\s+/).pop() : ""; })();
const fixture = process.env.MAIL_RECORDS ? JSON.parse(fs.readFileSync(process.env.MAIL_RECORDS, "utf8")) : null;
async function records(slug, collection) {
  if (fixture) return fixture[collection] || [];
  if (!key) throw new Error("no here.now key in ~/.herenow/credentials");
  const res = await fetch(`https://here.now/api/v1/publishes/${slug}/data/${collection}`, {
    headers: { Authorization: `Bearer ${key}`, "X-HereNow-Client": "claude-code/mail" } });
  if (!res.ok) throw new Error(`here.now answered ${res.status} for ${collection}`);
  const b = await res.json();
  return (b.records || b.items || b.data || (Array.isArray(b) ? b : [])).map((r) => ({ id: r.id, ...(r.data || r.fields || r) }));
}
const sent = fs.existsSync(SENT) ? JSON.parse(fs.readFileSync(SENT, "utf8")) : {};
const had = (kind, id) => !!sent[kind]?.[id];

// The newsletter list holds two kinds of asking: the newsletter, and "tell me when the shop opens".
const wantsLetter = (r) => r.topic !== "shop";
const queue = [];
if (ISSUE) {
  if (testTo) queue.push([ISSUE.kind, { id: "test", name: "Melton Bell", email: testTo }]);
  else for (const r of await records("mantra-portal-hsqy", "newsletter")) if (wantsLetter(r) && !had(ISSUE.kind, r.id)) queue.push([ISSUE.kind, r]);
} else if (!testTo) {
  for (const r of await records("mantra-portal-hsqy", "newsletter")) { const k = wantsLetter(r) ? "letter" : "shop"; if (!had(k, r.id)) queue.push([k, r]); }
  for (const r of await records("mantra-portal-hsqy", "beta")) if (!had("beta", r.id)) queue.push(["beta", r]);
  for (const r of await records("mantra-portal-hsqy", "members")) if (!had("sponsor", r.id)) queue.push(["sponsor", r]);
  const claims = await records("rapid-ember-55ng", "claims");
  for (const r of claims) if (!had("claim", r.id)) queue.push(["claim", r]);
  // Approved claims (scripts/claims.mjs --import keeps them, with the claim's id).
  const store = fs.existsSync(R("data/claims.json")) ? JSON.parse(fs.readFileSync(R("data/claims.json"), "utf8")).approved || {} : {};
  const byClaim = new Map(claims.map((r) => [r.id, r]));
  for (const a of Object.values(store)) {
    const r = byClaim.get(a.claim);
    if (r && !had("approved", r.id)) queue.push(["approved", { ...r, lightning: a.lightning }]);
  }
} else {
  const sample = { id: "test", name: "Melton Bell", email: testTo, platform: "mac", tier: "supporter", station: "Radio Princesa FM 99.1", lightning: "tips@example.com" };
  for (const k of Object.keys(EMAILS)) queue.push([k, sample]);
}

// ── previews, always ───────────────────────────────────────────────────────
fs.mkdirSync(PREVIEWS, { recursive: true });
const demo = { name: "Ada Okafor", platform: "mac", tier: "supporter", station: "Radio Princesa FM 99.1", lightning: "tips@example.com" };
for (const [k, make] of Object.entries(EMAILS)) fs.writeFileSync(path.join(PREVIEWS, `${k}.html`), html(make(demo), false));
if (ISSUE) fs.writeFileSync(path.join(PREVIEWS, `issue-${ISSUE.slug}.html`), html(ISSUE.make(demo), false));

console.log(`mail: ${queue.length} to send` + (queue.length ? `: ${Object.entries(queue.reduce((a, [k]) => ((a[k] = (a[k] || 0) + 1), a), {})).map(([k, n]) => `${n} ${k}`).join(", ")}` : "") +
  `; previews in ${PREVIEWS}`);
if (!send && !testTo) { if (queue.length) console.log("nothing sent — run with --send to send them"); process.exit(0); }
if (send && !POSTAL) {
  console.error("mail: no postal address — put one line in ~/.resend/postal-address (a PO box or registered agent is fine); every email must carry one (CAN-SPAM)");
  process.exit(1);
}

// ── send ───────────────────────────────────────────────────────────────────
const rkeyFile = path.join(os.homedir(), ".resend", "credentials");
const rkey = process.env.RESEND_API_KEY || (fs.existsSync(rkeyFile) ? fs.readFileSync(rkeyFile, "utf8").trim() : "");
if (!rkey) { console.error("mail: no Resend key — put it in ~/.resend/credentials (just the key), or RESEND_API_KEY"); process.exit(1); }
let ok = 0, bad = 0;
for (const [kind, r] of queue) {
  if (!r.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email)) { bad++; continue; }
  const e = compose(kind, r);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${rkey}`, "Content-Type": "application/json", "Idempotency-Key": `${kind.replace(/[^\w-]/g, "-")}-${r.id}${testTo ? `-test-${Date.now()}` : ""}` },
    body: JSON.stringify({
      from: FROM, to: [r.email], reply_to: REPLY, subject: testTo ? `[TEST] ${e.subject}` : e.subject,
      html: html(e, !!testTo), text: text(e),
      headers: { "List-Unsubscribe": `<mailto:${REPLY}?subject=remove>` },
      tags: [{ name: "kind", value: kind.replace(/[^\w-]/g, "-") }],
    }),
  });
  if (!res.ok) { bad++; console.error(`mail: ${kind} to ${r.email.replace(/(.).*@/, "$1…@")} failed: ${res.status} ${(await res.text()).slice(0, 160)}`); continue; }
  ok++;
  if (!testTo) { (sent[kind] ||= {})[r.id] = new Date().toISOString(); fs.writeFileSync(SENT, JSON.stringify(sent, null, 2) + "\n"); }
  await new Promise((w) => setTimeout(w, 600));          // Resend's default limit is 2 a second
}
console.log(`mail: ${ok} sent${bad ? `, ${bad} not sent` : ""}`);
