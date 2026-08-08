/**
 * Rule-based tips, on TipKit's model.
 *
 * The tour teaches the three things nobody would find on their own. This is the
 * other half: tips that wait until somebody has used the app enough for the tip
 * to mean something, and then never appear again once they have done the thing.
 *
 * Four ideas, all borrowed:
 *
 *   **Events are donated.** Nothing infers behaviour. The renderer says
 *   "stationPlayed" when a station played, and that is the only way a count
 *   moves. A rule can then ask a real question — has this person ever saved a
 *   favourite, and have they played enough stations to want to?
 *
 *   **Rules decide, not code paths.** A tip declares what has to be true. It is
 *   never shown because it happened to be somebody's turn.
 *
 *   **Invalidation is permanent.** Dismissing a tip retires it. So does doing the
 *   thing it teaches — which is the important half: a tip for a feature you
 *   already use is an accusation, not help.
 *
 *   **One at a time.** Five tips racing to be first is a worse experience than
 *   any one of them alone. A tip needs the app to have been open a while, and a
 *   day since the last one.
 *
 * The store is its own file, and that is not tidiness.
 *
 * It began inside state.json, and the counts kept vanishing. The renderer reads
 * the whole state object and writes the whole thing back — `getState()` then
 * `setState({ ...st, favorites })` — so anything main added in between was
 * overwritten by a copy that predated it. Three plays recorded as one.
 *
 * A separate file removes the contention rather than trying to win it. Nothing
 * else writes here, so read-modify-write is safe with a single writer.
 *
 * Timestamps rather than counters, because two rules need "how long ago" and a
 * counter cannot answer that.
 */

const fs = require("node:fs");
const path = require("node:path");

const DAY = 86400_000;

let FILE = null;

/** Called once from main, which is the only thing that knows userData. */
function init(userDataPath) {
  FILE = path.join(userDataPath, "tips.json");
}

function read() {
  if (!FILE) return empty();
  try {
    const j = JSON.parse(fs.readFileSync(FILE, "utf8"));
    return {
      events: j.events && typeof j.events === "object" ? j.events : {},
      retired: j.retired && typeof j.retired === "object" ? j.retired : {},
      lastShown: Number.isFinite(j.lastShown) ? j.lastShown : 0,
    };
  } catch { return empty(); }
}

function write(s) {
  if (!FILE) return;
  try { fs.writeFileSync(FILE, JSON.stringify(s)); }
  catch (err) { console.error("tips: save failed —", err.message); }
}

/** Everything that can be donated. Anything not on this list is rejected. */
const EVENTS = [
  "appOpened",
  "stationPlayed",
  "placeSelected",
  "favoriteAdded",
  "layersOpened",
  "newsOpened",
  "shortwaveTuned",
  "lockUsed",
];

/**
 * The tips themselves.
 *
 * `after` is the earliest point in a session a tip may appear, so one never
 * lands while the globe is still assembling. `rules` is every condition that has
 * to hold. `retiredBy` is the event that means the person found it without help.
 */
const TIPS = [
  {
    id: "favorites",
    anchor: "#favBtn",
    title: "Keep a station",
    body: "The star beside any station saves it here, and to the menu bar.",
    retiredBy: "favoriteAdded",
    after: 20_000,
    // Three stations in means they are listening, not just looking.
    rules: (n) => n("favoriteAdded") === 0 && n("stationPlayed") >= 3,
  },
  {
    id: "layers",
    anchor: "#layersBtn",
    title: "There is more on the globe",
    body: "Live weather, the day and night line, the ISS, shortwave receivers.",
    retiredBy: "layersOpened",
    after: 45_000,
    // A second visit, so it is not competing with the introduction.
    rules: (n) => n("layersOpened") === 0 && n("appOpened") >= 2,
  },
  {
    id: "shortwave",
    anchor: "#layersBtn",
    title: "The amber dots are real antennas",
    body: "Someone's own receiver, somewhere. Click one and you are listening through it.",
    retiredBy: "shortwaveTuned",
    after: 60_000,
    rules: (n) => n("shortwaveTuned") === 0 && n("stationPlayed") >= 5,
  },
  {
    id: "lock",
    anchor: "#lock",
    title: "Keep listening while you wander",
    body: "Lock holds the station, so moving around the globe will not change it.",
    retiredBy: "lockUsed",
    after: 40_000,
    // Someone who has browsed this much is the person the padlock is for.
    rules: (n) => n("lockUsed") === 0 && n("placeSelected") >= 8,
  },
];

const empty = () => ({ events: {}, retired: {}, lastShown: 0 });



/**
 * Record that something happened.
 *
 * Capped at fifty per event: the rules only ever ask whether a count has passed
 * a small threshold, and an unbounded array in a file that is written on every
 * change is a slow leak nobody would notice.
 */
function donate(id, now = Date.now()) {
  if (!EVENTS.includes(id)) return;
  const s = read();
  const list = Array.isArray(s.events[id]) ? s.events[id] : [];
  s.events[id] = [...list, now].slice(-50);
  write(s);
}

/** Retire a tip for good. */
function retire(id, reason = "dismissed", now = Date.now()) {
  if (!TIPS.some((t) => t.id === id)) return;
  const s = read();
  s.retired[id] = { reason, at: now };
  write(s);
}

/** Note that a tip was shown, which starts the clock on the next one. */
function shown(now = Date.now()) {
  const s = read();
  s.lastShown = now;
  write(s);
}

/**
 * Which tip, if any, should be offered right now.
 *
 * Retires anything whose `retiredBy` event has since been donated, so a tip for
 * something already discovered can never surface — that check happens here
 * rather than at donation time so it also covers events donated before a tip
 * existed.
 */
function next({ uptime = 0, now = Date.now(), frequency = DAY } = {}) {
  const s = read();
  const n = (id) => (Array.isArray(s.events[id]) ? s.events[id].length : 0);

  if (now - s.lastShown < frequency) return null;

  for (const tip of TIPS) {
    if (s.retired[tip.id]) continue;
    if (n(tip.retiredBy) > 0) continue;      // found it unaided
    if (uptime < tip.after) continue;
    if (!tip.rules(n)) continue;
    return { id: tip.id, anchor: tip.anchor, title: tip.title, body: tip.body };
  }
  return null;
}

/** For the audit and for tests. */
function describe() {
  const s = read();
  const n = (id) => (Array.isArray(s.events[id]) ? s.events[id].length : 0);
  return {
    counts: Object.fromEntries(EVENTS.map((e) => [e, n(e)])),
    retired: Object.keys(s.retired),
    eligible: TIPS.filter((t) => !s.retired[t.id] && n(t.retiredBy) === 0 && t.rules(n)).map((t) => t.id),
  };
}

module.exports = { EVENTS, TIPS, init, read, write, donate, retire, shown, next, describe, empty, DAY };
