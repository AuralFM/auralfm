/**
 * The desktop messaging modules keep small JSON files (mutes, contacts, the word
 * list) in the app's data folder. Here the "folder" is this browser's
 * localStorage, one key per file, so clearing the site's data clears all of it —
 * the same reset the desktop's "Erase everything" performs.
 *
 * Files the app ships (the relay list, the starter word list) are bundled in and
 * read-only. Every storage access is guarded: a private window may refuse it,
 * and the app must still run, with memory only.
 */
import relays from "../../data/relays.json";
import filterDefault from "../../data/filter-default.json";

const SHIPPED = {
  "relays.json": JSON.stringify(relays),
  "filter-default.json": JSON.stringify(filterDefault),
};
const PREFIX = "auralfm.web.fs:";
const base = (p) => String(p).split("/").pop();
const memory = {};

function get(p) {
  const b = base(p);
  if (b in SHIPPED) return SHIPPED[b];
  try { const v = localStorage.getItem(PREFIX + b); if (v !== null) return v; } catch { /* fall through */ }
  return memory[b] ?? null;
}
function put(p, text) {
  const b = base(p);
  memory[b] = String(text);
  try { localStorage.setItem(PREFIX + b, String(text)); } catch { /* memory only */ }
}
function drop(p) {
  const b = base(p);
  delete memory[b];
  try { localStorage.removeItem(PREFIX + b); } catch { /* nothing stored */ }
}
const missing = (p) => Object.assign(new Error(`ENOENT: ${p}`), { code: "ENOENT" });

export function readFileSync(p) {
  const v = get(p);
  if (v === null) throw missing(p);
  return v;
}
// A number here is the "descriptor" openSync returned, which is the path itself.
export function writeFileSync(p, text) { put(p, text); }
export function existsSync(p) { return get(p) !== null; }
export function statSync(p) {
  if (get(p) === null) throw missing(p);
  return { isFile: () => true };
}
export function rmSync(p) { drop(p); }
export function openSync(p) { return p; }
export function closeSync() {}
export function mkdirSync() {}
export function renameSync(from, to) { const v = get(from); if (v !== null) { put(to, v); drop(from); } }

export default { readFileSync, writeFileSync, existsSync, statSync, rmSync, openSync, closeSync, mkdirSync, renameSync };
