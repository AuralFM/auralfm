/**
 * The safety tools, and an honest account of what they can and cannot do.
 *
 * ## There are no moderators, and there is nobody to appeal to
 *
 * This has to be said first because it is the thing people assume is untrue.
 * bitchat has no moderation of any kind — searching their entire source and
 * documentation for "moderat" returns nothing, and the only "abuse" their
 * whitepaper discusses is flooding, handled with rate limits. That is not an
 * oversight. A system with no servers has no authority: nobody can delete a
 * message from a relay they do not own, and there is no account to suspend
 * because there are no accounts.
 *
 * So the honest framing is not "moderation with extra steps". It is: **you get
 * complete control over your own window, and no control over anyone else's.**
 * Everything in this file is the first half. The second half does not exist and
 * cannot be built without becoming the thing this app refuses to be.
 *
 * ## What is here
 *
 *   **A word filter.** Hides messages containing terms you do not want to see.
 *   Ships with a default list and is fully editable, because a filter somebody
 *   else controls is somebody else's opinion about your window.
 *
 *   **Only people you keep.** The strongest lever available in a design with no
 *   server: show nothing from anyone who is not a mutual contact. Not a filter on
 *   content — a filter on strangers, which is the only category that reliably
 *   predicts the problem.
 *
 * ## The limitation Apple's guideline 1.2 will care about
 *
 * Guideline 1.2 asks for "a method for filtering objectionable material from
 * being posted to the app". Ours filters material on the way *in*, not on the way
 * *out*, and the difference is not cosmetic: the messages come from relays this
 * app does not own, sent by clients it did not write. Nothing here can stop
 * somebody posting. It can only stop it arriving.
 *
 * That gap is real and it is architectural. It is written down here rather than
 * papered over, because the person who has to answer for it at review should
 * know the shape of the answer before the question arrives.
 *
 * ## Where it runs, and why that matters
 *
 * In main, on the way to a renderer — same as [muted.js], for the same reason. A
 * filtered message never crosses the bridge, so it is not hidden by CSS and not
 * skipped by a paint function. There is nothing in the DOM to inspect and
 * nothing to render by accident later.
 */

const fs = require("node:fs");
const path = require("node:path");

/** Long enough to be thorough, short enough that matching stays cheap. */
const MAX_TERMS = 400;
const MAX_TERM = 40;

let FILE = null;
let cache = null;              // { added: string[], removed: string[] }
let DEFAULTS = null;
let matcher = null;            // rebuilt whenever the list changes

function init(userDataPath) {
  FILE = path.join(userDataPath, "filter.json");
  cache = null;
  matcher = null;
}

/**
 * The starter list, in a data file rather than in code.
 *
 * Two reasons. It is editable without a rebuild, which matters because a
 * blocklist is never finished. And it keeps a list of slurs out of the logic,
 * where it would be read as part of the algorithm rather than as data somebody
 * chose.
 */
function defaults() {
  if (DEFAULTS) return DEFAULTS;
  try {
    const j = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "filter-default.json"), "utf8"));
    DEFAULTS = Array.isArray(j.terms) ? j.terms.filter(ok) : [];
  } catch { DEFAULTS = []; }
  return DEFAULTS;
}

const ok = (t) => typeof t === "string" && t.length > 1 && t.length <= MAX_TERM;
const norm = (t) => String(t || "").trim().toLowerCase();

function load() {
  if (cache) return cache;
  cache = { added: [], removed: [] };
  if (!FILE) return cache;
  try {
    const j = JSON.parse(fs.readFileSync(FILE, "utf8"));
    cache.added = (Array.isArray(j.added) ? j.added : []).map(norm).filter(ok).slice(0, MAX_TERMS);
    cache.removed = (Array.isArray(j.removed) ? j.removed : []).map(norm).filter(ok).slice(0, MAX_TERMS);
  } catch { /* absent is the same as untouched */ }
  return cache;
}

function save() {
  if (!FILE || !cache) return;
  matcher = null;
  try { fs.writeFileSync(FILE, JSON.stringify(cache)); }
  catch (err) { console.error("safety: save failed —", err.message); }
}

/** The list actually in force: defaults, minus what was removed, plus what was added. */
function terms() {
  const c = load();
  const gone = new Set(c.removed);
  return [...new Set([...defaults().filter((t) => !gone.has(t)), ...c.added])];
}

/**
 * One regular expression for the whole list.
 *
 * Word-bounded, so "assist" is not caught by a three-letter term — the classic
 * filter bug, and the reason naive substring matching makes a filter useless
 * within a day of somebody noticing.
 *
 * Deliberately does *not* try to defeat obfuscation. Matching l33tspeak, spaced
 * letters and homoglyphs is an arms race a word list cannot win, and pretending
 * otherwise would misrepresent how much protection this offers. It catches the
 * careless, which is most of it, and "only people you keep" is the answer to the
 * determined.
 */
function build() {
  if (matcher !== null) return matcher;
  const list = terms();
  if (!list.length) return (matcher = false);
  const esc = list.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  try { matcher = new RegExp(`(?:^|[^a-z0-9])(?:${esc})(?:[^a-z0-9]|$)`, "i"); }
  catch { matcher = false; }
  return matcher;
}

/** Does this text hit the list? */
function hits(text) {
  const m = build();
  return !!m && m.test(String(text || ""));
}

function add(term) {
  const t = norm(term);
  if (!ok(t)) return false;
  const c = load();
  c.removed = c.removed.filter((x) => x !== t);
  if (!c.added.includes(t) && !defaults().includes(t)) {
    if (c.added.length >= MAX_TERMS) return false;
    c.added.push(t);
  }
  save();
  return true;
}

function remove(term) {
  const t = norm(term);
  if (!ok(t)) return false;
  const c = load();
  c.added = c.added.filter((x) => x !== t);
  if (defaults().includes(t) && !c.removed.includes(t)) c.removed.push(t);
  save();
  return true;
}

/** Back to the shipped list. */
function reset() {
  cache = { added: [], removed: [] };
  save();
}

/**
 * Apply everything to a list on its way to a renderer.
 *
 * @param {Array} list      messages, notes or private messages
 * @param {object} opts
 * @param {boolean} opts.filter    hide anything matching the word list
 * @param {boolean} opts.onlyKept  hide anyone who is not a mutual contact
 * @param {(pubkey:string)=>boolean} [opts.kept]  is this person mutual
 */
function apply(list, { filter = true, onlyKept = false, kept = () => false } = {}) {
  if (!Array.isArray(list)) return list;
  if (!filter && !onlyKept) return list;
  return list.filter((m) => {
    if (!m) return false;
    // Never hide your own words from you. A filter that swallows what you just
    // typed reads as the app being broken, and you are not the person you are
    // being protected from.
    if (m.mine) return true;
    if (onlyKept && !kept(m.pubkey)) return false;
    if (filter && hits(m.text)) return false;
    return true;
  });
}

module.exports = { init, terms, defaults, hits, add, remove, reset, apply, MAX_TERMS, MAX_TERM };
