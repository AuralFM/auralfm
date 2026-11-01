/** The audit: What is drawn on the globe and what moves with it. */
import path from "node:path";
import vm from "node:vm";
import { fail, pass, readSrc } from "./lib.mjs";

// ── a station starting does not rebuild the globe ───────────────────────────
// Timed on an Intel MacBook with the app's own profiler:
// the first press on a station froze the window for over a second. The play
// bar comes in under the globe, the globe's pane loses the bar's 44px, the
// pane's observer calls sizeGlobe(), and one WebGLRenderer.setSize() for that
// took 1,402 ms in a single task. Nothing else in the press cost a tenth of it.
//
// The canvas keeps its height now when the pane only loses a strip at the
// bottom: the mount clips what hangs below, and the camera is centred in the
// pane rather than in the canvas, the same way it already allows for a panel.
{
  const name = "a station starting does not rebuild the globe";
  console.log(`\n${name}`);
  const src = readSrc("src/renderer/explore-trackers.js");
  const body = (fn) => (src.match(new RegExp(`function ${fn}\\s*\\([^)]*\\)\\s*\\{([\\s\\S]*?)\\n\\}`)) || [])[1];
  const size = body("sizeGlobe"), centre = body("centreGlobe");
  const css = readSrc("src/renderer/explore.html").replace(/\/\*[\s\S]*?\*\//g, "");
  const mount = (css.match(/#globe\{([^}]*)\}/) || [])[1];
  const gaps = [];
  if (!size || !centre || mount === undefined) gaps.push("sizeGlobe, centreGlobe or the #globe rule is gone — this check is blind");
  else {
    const calls = size.match(/globe\.width\([^)]+\)\.height\([^)]+\)/g) || [];
    const guarded = /if\s*\([^{]*SPARE_HEIGHT[^{]*\)\s*\{[^}]*globe\.width\(/.test(size.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, ""));
    if (!calls.length) gaps.push("sizeGlobe no longer sizes the globe at all");
    else if (!guarded) gaps.push("the canvas is rebuilt for any change in the pane's height, the play bar's 44px included (1.4 s on an Intel Mac)");
    if (/const css\s*=\s*w\.clientWidth\s*\*\s*w\.clientHeight/.test(size)) gaps.push("the pixel ratio is worked out from the pane, so on a large window the bar's 44px still changes it and rebuilds the canvas");
    if (!/globe\.height\(\)/.test(centre)) gaps.push("the planet is centred in the pane's height, not allowing for a canvas left taller than it");
    if (!/overflow:\s*hidden/.test(mount)) gaps.push("the canvas is not clipped to its pane, so what hangs below would show under the play bar");
  }
  gaps.length ? fail(name, gaps.join("; "))
    : pass("the canvas keeps its size when the play bar takes a strip from the pane, and the planet is centred in what shows");
}

// ── the list of places follows a hand on the globe ──────────────────────────
// 13 Oct 2026. On a phone Explore opens on the list of places, and it stood
// still while the globe turned: Paris and London on top with Lagos in the
// middle of the screen. It re-sorts to "Near here" now, and only for a hand:
// the idle drift or a flight must not reshuffle a list somebody is about to
// press. Drawing 400 rows took 120ms, so a moving globe gets a short list and a
// resting one gets the whole of it.
{
  const name = "the list of places follows a hand on the globe";
  console.log(`\n${name}`);
  const view = readSrc("src/renderer/explore-view.js"), core = readSrc("src/renderer/explore-core.js");
  const fn = view.slice(view.indexOf("function followBrowse("), view.indexOf("function followBrowse(") + 1400);
  const gaps = [];
  if (fn.length < 200) gaps.push("followBrowse is gone — this check is blind");
  else {
    if (!/!browsingPlaces/.test(fn)) gaps.push("it does not stop when the list is not the browse list");
    if (!/handOn/.test(fn) || !/handUntil/.test(fn)) gaps.push("anything that moves the camera re-sorts the list, not only a hand");
    if (!/flying/.test(fn) || !/locked/.test(fn)) gaps.push("a flight or a locked station still re-sorts it");
    if (!/qEl\.value/.test(fn)) gaps.push("a search's results are replaced by it");
    if (!/povApart\(pov,\s*handFrom\)/.test(fn)) gaps.push("a tap that turned nothing re-sorts it");
    if (!/placeOrder\s*=\s*"near"/.test(fn)) gaps.push("it does not sort by nearness");
    if (!/atRest\s*\?\s*400\s*:\s*MOVING_ROWS/.test(fn)) gaps.push("it draws the whole list on every move, or never draws it whole");
  }
  if (!/addEventListener\("start",[^\n]*handOn = true/.test(view)) gaps.push("nothing marks a hand going on the globe");
  if (!/addEventListener\("end",[^\n]*handOn = false/.test(view)) gaps.push("nothing marks the hand coming off");
  if (!/!globe\.controls\(\)\.autoRotate/.test(view.slice(view.indexOf("function onCameraChange"), view.indexOf("function restSoon")))) gaps.push("the idle drift keeps the hand's window open");
  if (!/async function loadPlaces\(query = "", limit = 400\)/.test(core)) gaps.push("loadPlaces cannot be asked for a short list");
  gaps.length ? fail(name, gaps.join("; ")) : pass("nearest first while a hand turns it: forty rows moving, the whole list at rest; not for drift, a flight, a lock, a search or a tap");
}

// ── the globe's read-out rides the sheet ────────────────────────────────────
// 13 Oct 2026. On a phone the read-out was anchored to where the station sheet
// rests, so Explore, Headlines, Chat and Settings each rose straight over it.
// It sits on the top edge of whichever sheet is up, and when the station sheet
// settles it makes the same move in the same time. That last part is two CSS
// transitions that have to agree, which is exactly what drifts.
{
  const name = "the globe's read-out rides the sheet";
  console.log(`\n${name}`);
  const css = readSrc("web/web.css"), sheet = readSrc("web/sheet.js"), rail = readSrc("web/rail-sheet.js");
  const gaps = [];
  if (!/@property --ride\s*\{[^}]*syntax:\s*"<length>"/.test(css)) gaps.push("--ride is not a length the browser can animate");
  const bar = css.match(/\.globebar\s*\{[^}]*\}/g)?.find((r) => /--ride/.test(r)) || "";
  if (!bar) gaps.push("the read-out does not use --ride");
  else if (/--peek\)\s*\+/.test(bar)) gaps.push("the read-out is anchored to the sheet's rest again");
  const timing = (sel) => css.match(new RegExp(`\\.${sel}\\.settling\\s*\\{\\s*transition:\\s*[\\w-]+\\s+([\\d.]+s\\s+cubic-bezier\\([^)]*\\))`))?.[1];
  const a = timing("railcol"), b = timing("globebar");
  if (!a || !b) gaps.push("the sheet or the read-out has no settling transition to compare");
  else if (a !== b) gaps.push(`the sheet settles in ${a} and the read-out in ${b}`);
  if (!/\.globebar\.tucked/.test(css)) gaps.push("it is never put away when the sheet reaches the top");
  if (!/AuralSheet\?\.ride\?\.\(rail,\s*rail\.offsetHeight - v,\s*rail\.classList\.contains\("settling"\)\)/.test(rail)) gaps.push("the station sheet does not say where it is going");
  if (!/const moveTo = [^\n]*ride\(/.test(sheet)) gaps.push("a panel on a spring does not move it");
  if (!/const place = [^\n]*ride\(/.test(sheet)) gaps.push("Settings does not move it");
  if (!/if \(settling !== undefined\)/.test(sheet)) gaps.push("a re-check cuts a running transition short");
  if (!/MutationObserver\(\(\) => ride\(\)\)/.test(sheet)) gaps.push("a panel hidden without a spring leaves it where it was");
  gaps.length ? fail(name, gaps.join("; ")) : pass("on the edge of whichever sheet is up, in step with the station sheet, away when there is no globe left");
}

// ── the day/night switch and the globe agree ────────────────────────────────
// The web opens with day/night off. The shader was compiled with it on, and
// the setting, arriving before the globe existed, never reached it: the switch
// read off over a globe shading night, and pressing it changed nothing.
{
  const name = "the day and night switch and the globe agree from the first frame";
  console.log(`\n${name}`);
  const g = readSrc("src/renderer/explore-globe.js");
  /shader\.uniforms\.dayNightOn = \{ value: [^}]*layers\.dayNight/.test(g)
    ? pass("the shader starts from the layer's own setting")
    : fail(name, "explore-globe.js compiles day/night on whatever the layer says");
}

// ── a ring stays the same ring ──────────────────────────────────────────────
// three-globe keys a ring by its object, gives a new object a ring at once and
// keeps a dropped one in the scene for 30 s. Fresh objects on each flush held
// the scene above 90,000 objects with about 1,200 listeners on live relays.
{
  const name = "a ring stays the same ring";
  console.log(`\n${name}`);
  const gaps = [];
  try {
    const drawn = [];
    const globe = new Proxy({}, { get: (_, k) => (k === "pointOfView" ? () => ({ lat: 0, lng: 0, altitude: 2.5 })
      : k === "ringsData" ? (d) => { drawn.push(d); return globe; } : () => globe) });
    const box = { globe, layers: { listeners: true }, peers: [], window: {}, palette: null, document: {}, hexA: () => "", matchMedia: () => ({ matches: false }) };
    vm.runInNewContext(readSrc("src/renderer/explore-trackers.js"), box);
    const paint = (list) => { box.peers = list; vm.runInNewContext("paintRings()", box); return drawn.at(-1); };
    const peer = (i, geohash, lat, lon) => ({ pubkey: String(i), lat, lon, geohash, live: false, label: "" });
    const three = () => [peer(1, "eyck", 10, 10), peer(2, "gcpv", 20, 20), peer(3, "9q8y", 30, 30)];
    const a = paint(three()), b = paint(three());
    if (a.length !== 3 || b.some((r) => !a.includes(r))) gaps.push("the same listeners were handed to the globe as new objects");
    const town = paint([1, 2, 3, 4, 5].map((i) => peer(i, "eyck", 10, 10)));
    if (town.length !== 1) gaps.push(`five listeners in one town drew ${town.length} rings`);
    const base32 = "0123456789bcdefghjkmnpqrstuvwxyz";
    const world = Array.from({ length: 1000 }, (_, i) => peer(i, `${base32[i % 32]}${base32[(i >> 5) & 31]}zz`, 80 - i * 0.16, 160 - i * 0.32));
    world[900] = peer(900, "s000", 0, 0);
    const cut = paint(world);
    if (cut.length > 200) gaps.push(`a thousand towns drew ${cut.length} rings`);
    if (!cut.some((r) => r.lat === 0 && r.lng === 0)) gaps.push("the town under the camera lost its ring to the budget");
    gaps.length ? fail(name, gaps.join("; ")) : pass("a listener keeps their ring between flushes, a town draws one, the world draws 200 at most");
  } catch (e) {
    fail(name, `could not run paintRings: ${e.message}`);
  }
}

// ── a still ring stands still ───────────────────────────────────────────────
// Nothing in the globe code read prefers-reduced-motion, so the rings pulsed for
// everybody. The rings layer has no still mode: in three-globe 2.45.2 a speed of
// 0 adds a line of radius 0 every period and never removes one, and a period of
// 0 fires a single ring that spreads and is gone. So the same places are drawn
// on the particles layer, which the vibes also use, and neither may wipe the other.
{
  const name = "with reduced motion on, the rings stand still";
  console.log(`\n${name}`);
  const gaps = [];
  try {
    let still = true, ringed = [], marked = [];
    const changed = [], groups = [{ __globeObjType: "ring", visible: true }, { __globeObjType: "path", visible: true }];
    const globe = new Proxy({}, { get: (_, k) => (k === "pointOfView" ? () => ({ lat: 0, lng: 0, altitude: 2.5 })
      : k === "globeMaterial" ? () => ({ map: new (class Tex {})() })
      : k === "scene" ? () => ({ traverse: (fn) => groups.forEach(fn) })
      : k === "ringsData" ? (d) => { ringed = d; return globe; }
      : k === "particlesData" ? (d) => { marked = d; return globe; } : () => globe) });
    const pen = new Proxy({}, { get: () => () => {}, set: () => true });
    const box = {
      globe, peers: [], palette: null, hexA: () => "", css: () => "#E5484D", mayDrift: () => false,
      layers: { listeners: true, iss: true, onAir: true },
      window: { AuralShows: { on: true }, AuralStudio: { live: { lat: 5, lon: 6 } }, addEventListener() {} },
      document: { addEventListener() {}, createElement: () => ({ getContext: () => pen }) },
      matchMedia: (q) => ({
        matches: q.includes("reduced-motion") && still,
        addEventListener: (_, fn) => { if (q.includes("reduced-motion")) changed.push(fn); },
      }),
    };
    vm.runInNewContext(readSrc("src/renderer/explore-trackers.js"), box);
    vm.runInNewContext("issAt = { lat: 40, lng: 50 }", box);
    const peer = (i, geohash, lat, lon, live = false) => ({ pubkey: String(i), lat, lon, geohash, live, label: "" });
    box.peers = [peer(1, "eyck", 10, 20), peer(2, "gcpv", 30, 40), peer(3, "9q8y", -30, -40, true)];
    const paint = () => vm.runInNewContext("paintRings()", box);
    const held = () => marked.flat().filter((p) => p.kind);
    const kinds = () => held().map((p) => p.kind).sort().join();

    paint();
    if (ringed.length) gaps.push(`${ringed.length} rings still pulse with reduced motion on`);
    if (kinds() !== "iss,live,live,peer,peer") gaps.push(`the still marks are [${kinds()}], not the listeners, the shows and the ISS`);
    if (marked.some((set) => !(set.size > 0) || !set.tex)) gaps.push("a set of still marks has no size or no picture");
    const first = [...marked];
    paint();
    if (marked.some((set, i) => set !== first[i])) gaps.push("a flush handed the globe new sets of marks, which builds new objects");

    box.layers.listeners = false;
    paint();
    if (kinds() !== "iss,live,live") gaps.push("the Listeners layer turned off left its marks up");
    box.layers.listeners = true;

    vm.runInNewContext("vibeMarks = [{ lat: 1, lng: 2 }]", box);
    paint();
    if (!marked.some((set) => set[0]?.lat === 1 && !set[0].kind)) gaps.push("the still marks wiped a vibe off the globe");
    if (held().length !== 5) gaps.push("a vibe wiped the still marks off the globe");
    if (/globe\s*\.\s*particlesData/.test(readSrc("src/renderer/explore-brand.js"))) gaps.push("explore-brand.js writes the shared particles layer itself");

    still = false;
    vm.runInNewContext("wireTrackers()", box);
    if (!changed.length) throw new Error("nothing listens for the setting changing");
    changed[0]({ matches: false });
    if (ringed.length !== 5) gaps.push("turning reduced motion off did not bring the rings back");
    if (held().length) gaps.push("turning reduced motion off left the still marks up");
    if (!marked.some((set) => set[0]?.lat === 1)) gaps.push("the rings coming back wiped a vibe off the globe");

    still = true;
    changed[0]({ matches: true });
    if (ringed.length || held().length !== 5) gaps.push("turning reduced motion on while running did not stand the rings still");
    if (groups[0].visible || !groups[1].visible) gaps.push("rings already spreading were left to finish");
    gaps.length ? fail(name, gaps.join("; "))
      : pass("reduced motion draws every listener, show and the ISS as marks that stay, on the same objects, beside a vibe, and follows the setting live");
  } catch (e) {
    fail(name, `could not run paintRings: ${e.message}`);
  }
}

// ── a still camera stays where it is put ────────────────────────────────────
// The rings stood still and the camera did not: every pick flew for 800ms, the
// layers panel swung the planet for 420ms, and the drift came back by itself
// after a touch. Slow Rotation is switched by hand and starts off at every
// launch, so reduced motion holds it only until somebody turns it on after that.
{
  const name = "with reduced motion on, the camera does not travel";
  console.log(`\n${name}`);
  const gaps = [];
  try {
    let still = true, durations = [], timers = [];
    const changed = [];
    const controls = { autoRotate: false };
    const globe = new Proxy({}, { get: (_, k) => (k === "controls" ? () => controls
      : k === "pointOfView" ? (at, ms) => { if (at) durations.push(ms); return { lat: 0, lng: 0, altitude: 2.5 }; }
      : k === "scene" ? () => ({ traverse() {} }) : () => globe) });
    const box = {
      globe, peers: [], palette: null, hexA: () => "", css: () => "", console,
      $: () => null, t: (k) => k, globePts: null, syncWsprTimer() {}, withShader() {}, drawSky() {},
      startLiveImagery() {}, paintOrbits() {}, fitMarkets() {}, sizeGlobe() {},
      setTimeout: (fn) => { timers.push(fn); return timers.length; }, clearTimeout() {},
      window: { addEventListener() {}, auralfm: {} },
      document: { addEventListener() {}, createElement: () => ({ getContext: () => new Proxy({}, { get: () => () => {}, set: () => true }) }) },
      matchMedia: (q) => ({
        matches: q.includes("reduced-motion") && still,
        addEventListener: (_, fn) => { if (q.includes("reduced-motion")) changed.push(fn); },
      }),
    };
    for (const f of ["explore-layers", "explore-trackers", "explore-view"]) vm.runInNewContext(readSrc(`src/renderer/${f}.js`), box);
    vm.runInNewContext("wireTrackers(); applyLod = () => {}", box);
    const run = (code) => vm.runInNewContext(code, box);
    const settle = () => { const due = timers; timers = []; due.forEach((fn) => fn()); };

    run("flyTo(10, 20)");
    if (durations.join() !== "0") gaps.push(`a fly-to took ${durations.join()}ms, not 0`);
    if (!run("flying")) gaps.push("a jump dropped the flying guard, so the list would follow the camera mid-move");
    settle();
    if (run("flying")) gaps.push("the flying guard never came down after a jump");

    durations = [];
    run("shiftForPanel(true)");
    if (durations.join() !== "0") gaps.push(`opening the layers panel swung the planet for ${durations.join()}ms`);

    // Slow Rotation already on when the window opened: the read at start-up, not a hand.
    run("layers = { ...layers, drift: true }");
    run("pauseDrift()");
    settle();
    if (controls.autoRotate) gaps.push("a touch started a drift nobody asked for after reduced motion was on");
    run("applyLayers({ clouds: false })");
    if (controls.autoRotate) gaps.push("changing another layer started the drift");

    run("applyLayers({ drift: false })");
    run("applyLayers({ drift: true })");
    if (!controls.autoRotate) gaps.push("switching Slow Rotation on by hand was ignored");
    controls.autoRotate = false;
    run("pauseDrift()");
    settle();
    if (!controls.autoRotate) gaps.push("a drift switched on by hand did not resume after a touch");

    changed[0]?.({ matches: true });
    if (!changed.length) gaps.push("nothing listens for the setting changing");
    if (controls.autoRotate) gaps.push("turning reduced motion on left the globe drifting");
    still = false;
    changed[0]?.({ matches: false });
    if (!controls.autoRotate) gaps.push("turning reduced motion off did not give the drift back");

    durations = []; settle();
    run("flyTo(10, 20)");
    if (durations.join() !== "800") gaps.push(`without reduced motion a fly-to took ${durations.join()}ms, not 800`);
    durations = []; settle();
    run("shiftForPanel(false)");
    if (durations.join() !== "420") gaps.push(`without reduced motion the panel shift took ${durations.join()}ms, not 420`);

    const view = readSrc("src/renderer/explore-view.js");
    const rogue = view.match(/autoRotate\s*=(?!\s*(?:false\b|mayDrift\(\)))[^;]*/g) || [];
    if (rogue.length) gaps.push(`the drift is started without mayDrift(): ${rogue.join(" | ")}`);
    if (!/layers = \(await window\.auralfm\.layers\(\)\) \|\| layers;\s*driftChosen = false;/.test(view)) {
      gaps.push("the layers read at start-up can pass for a hand on the switch");
    }
    gaps.length ? fail(name, gaps.join("; "))
      : pass("reduced motion makes a fly-to and the panel shift a jump, keeps the flying guard, and holds the drift until it is switched on by hand");
  } catch (e) {
    fail(name, `could not run the camera: ${e.message}`);
  }
}
