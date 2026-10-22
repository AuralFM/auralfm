/**
 * The state file's version (src/main/store.js), and the steps that bring an
 * older file up to it.
 *
 * Every change so far has been additive, so a file with no version is version
 * 1 and needs nothing. A change that renames, moves or reshapes a field raises
 * STATE_VERSION and adds the step for that version to MIGRATIONS: a function
 * from the old shape to the new. load() runs the steps a file has not had, in
 * order, so a file from any earlier build arrives in today's shape.
 *
 * A file written by a newer build is read as it is and never stamped down:
 * an older app that saves it keeps the newer version, so the newer app does
 * not run its steps a second time.
 *
 * No Electron here, so the audit can run it.
 */

const STATE_VERSION = 1;

/** version → (state) => state. Version 1 is the first, and has no step. */
const MIGRATIONS = {};

function migrate(state) {
  let v = Number.isInteger(state.v) && state.v > 0 ? state.v : 1;
  if (v >= STATE_VERSION) return { ...state, v };
  let s = state;
  while (v < STATE_VERSION) {
    v++;
    s = MIGRATIONS[v](s);
  }
  return { ...s, v };
}

/** The version a save writes: today's, or the file's own when a newer build wrote it. */
const stamp = (state) => Math.max(Number.isInteger(state.v) ? state.v : 0, STATE_VERSION);

module.exports = { STATE_VERSION, MIGRATIONS, migrate, stamp };
