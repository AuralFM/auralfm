/**
 * Explore, part 9 of 17: The layer inspector.
 *
 * Explore is one page split across plain scripts that share a global scope, in
 * the order explore.html loads them. Declarations live here; anything that runs
 * at load — listeners, IPC subscriptions, one-off calls — is in wireLayers(),
 * which explore.js calls once every part has loaded. That keeps the original
 * single-file behaviour: no handler can fire into a part that has not loaded.
 */

/**
 * The first run.
 *
 * Radio is not obvious any more. Most people have never turned a dial, shortwave
 * is a rumour, and "borrowing somebody's antenna in New Zealand" sounds like a
 * figure of speech until you have done it. An interface that assumes otherwise
 * is a large part of why this technology reads as inaccessible rather than
 * merely old.
 *
 * Four cards, and the rules they follow are Apple's rather than mine: explain
 * only what is *not* discoverable, never explain a button that explains itself,
 * stay skippable at every step, and never come back. A tour that reappears has
 * learned to interrupt people.
 *
 * So there is nothing here about play or volume. What is here: that the globe is
 * the control, that the two colours of dot are two different technologies, what
 * shortwave actually is, and that nothing is being collected — which is the one
 * promise worth making before someone starts rather than after.
 */



/** Real-time factor of the last measurement, for the audit and for #30. */
let capRtf = null;

/**
 * The layer inspector.
 *
 * Built from whatever `globe:layers` reports rather than from a list written
 * here, so adding a layer in main.js puts it in this panel automatically. The
 * alternative — a second list to keep in step — is how the menu ended up with
 * ten items nobody could see the state of.
 *
 * Labels come from the same i18n keys the menu uses, so the two can never
 * disagree about what a layer is called.
 */
let layersOpen = false;

const LAYER_ORDER = [
  "stations", "shortwave", "dayNight", "clouds",
  "constellations", "iss", "wspr", "listeners", "onAir", "drift", "statusBar",
];

function paintLayers() {
  const panel = $("layers"), list = $("laylist");
  if (!panel || !list) return;
  panel.hidden = !layersOpen;
  $("layersBtn").setAttribute("aria-pressed", String(layersOpen));
  if (!layersOpen) return;

  // Known order first so the list does not reshuffle, then anything new.
  const ids = [...LAYER_ORDER.filter((k) => k in layers),
               ...Object.keys(layers).filter((k) => !LAYER_ORDER.includes(k))]
    // "On Air" is listed only where shows can be heard (explore-shows.js): a
    // switch for something this build cannot show is a switch that does nothing.
    .filter((k) => k !== "onAir" || window.AuralShows?.on);
  list.innerHTML = "";
  for (const id of ids) {
    const b = document.createElement("button");
    b.className = "layrow";
    b.setAttribute("aria-pressed", String(!!layers[id]));
    const dot = document.createElement("span");
    dot.className = "laydot";
    const label = document.createElement("span");
    label.textContent = t(`layer.${id}`, id);
    b.append(dot, label);
    b.onclick = () => {
      /**
       * Acknowledge instantly, commit optimistically, let the echo correct it.
       *
       * Still painted from main's echo — main owns this state and a panel that
       * lied about a failed write would be worse than a slow one. But the echo
       * can be 100ms away and the work behind it another 120, and for that
       * quarter second the row looked like it had ignored the click. It had not;
       * it was waiting to be told what it already knew.
       *
       * So the dot moves now and `paintLayers` overwrites it a moment later with
       * whatever actually happened. If the write fails the row flips back, which
       * is the honest outcome and is visible rather than silent.
       */
      b.setAttribute("aria-pressed", String(!layers[id]));
      b.classList.add("pending");
      window.auralfm.setLayers({ [id]: !layers[id] });
    };
    list.append(b);
  }
}

/**
 * Move the planet, not the panel.
 *
 * The inspector sits over the top-right of the globe, which is where the Earth
 * usually is. Shrinking the panel would make it cramped and shrinking the globe
 * would make the whole window lurch; nudging the *camera* costs nothing and is
 * the thing a person would do themselves — lean the world away from the thing
 * they just opened.
 *
 * A rotation rather than a pan, because three-globe's camera orbits a fixed
 * centre: panning would fight the controls, where a few degrees of longitude
 * and a little altitude simply slides the planet down and left and keeps every
 * layer — constellations included — in the same frame.
 */
function shiftForPanel(open) {
  if (!globe || flying) return;
  const pov = globe.pointOfView();
  const dLng = open ? -22 : 22;
  const dAlt = open ? 0.18 : -0.18;
  globe.pointOfView({
    lat: pov.lat,
    lng: pov.lng + dLng,
    altitude: Math.max(0.32, Math.min(4, pov.altitude + dAlt)),
  }, 420);
}

function wireLayers() {
  $("layersBtn").onclick = () => {
    layersOpen = !layersOpen;
    if (layersOpen) window.Tip?.donate("layersOpened");
    paintLayers();
    shiftForPanel(layersOpen);
  };

  // Click anywhere else on the globe to dismiss, the way an inspector should.
  document.addEventListener("pointerdown", (e) => {
    if (!layersOpen) return;
    if ($("layers").contains(e.target) || $("layersBtn").contains(e.target)) return;
    layersOpen = false;
    paintLayers();
    shiftForPanel(false);
  }, true);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && layersOpen) { layersOpen = false; paintLayers(); shiftForPanel(false); }
  });
}
