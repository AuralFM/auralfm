/**
 * Explore, part 16 of 17: Frequencies and receivers: typing a frequency, nearby receivers, tuning one.
 *
 * Explore is one page split across plain scripts that share a global scope, in
 * the order explore.html loads them. Declarations live here; anything that runs
 * at load — listeners, IPC subscriptions, one-off calls — is in wireShortwave(),
 * which explore.js calls once every part has loaded. That keeps the original
 * single-file behaviour: no handler can fire into a part that has not loaded.
 */

/** Select a place and take the globe there — the two always happen together. */
/**
 * ─── Tuning by frequency ─────────────────────────────────────────────────────
 *
 * A frequency is shortwave's address. People arrange to meet on one — nets,
 * roundtables, DX gatherings — and the culture is organised around numbers
 * rather than around places. The app modelled only the geography half:
 * receivers near a city, and no way to say "take me to 7850".
 *
 * Two rules this must not break, both learned the hard way and both in
 * docs/DECENTRALIZATION.md:
 *
 *   **It is not a scanner.** Typing a number never probes a receiver to find one
 *   that works. This project has already knocked three receivers offline, and a
 *   frequency box is exactly the feature that invites automated sweeping. The
 *   answer is assembled from data already on this machine — the schedule, the
 *   space weather, the receiver list — and exactly one connection is made, when
 *   somebody picks a receiver.
 *
 *   **It does not promise audio.** A frequency with nothing scheduled on it, or
 *   on a band that is shut, says so before anything is dialled. Connecting and
 *   delivering silence would be worse than saying "there is probably nothing
 *   there", because silence is indistinguishable from a broken app.
 */

/**
 * What somebody typed, in kHz.
 *
 * Forgiving on purpose: `7850`, `7850.0`, `7,850`, `7.850` and `7.850 MHz` are
 * all the same request. The one genuine ambiguity is a bare small number — `7`
 * is 7 MHz to every shortwave listener alive and 7 kHz to nobody, so anything at
 * or under 30 is read as MHz. Above that it is kHz, which is how the bands are
 * spoken and how the schedule stores them.
 */
function parseKHz(input) {
  let s = String(input || "").trim().toLowerCase();
  if (!s) return null;
  const mhzSaid = /\bmhz\b/.test(s);
  const khzSaid = /\bkhz\b/.test(s);
  s = s.replace(/(khz|mhz|hz)/g, "").replace(/[\s,]/g, "").replace(/,/g, ".");
  if (!/^\d*\.?\d+$/.test(s)) return null;
  let n = parseFloat(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (mhzSaid || (!khzSaid && n <= 30)) n *= 1000;
  n = Math.round(n * 100) / 100;
  // The tuner clamps to this anyway; refusing here says why instead of silently
  // moving somebody to the edge of the spectrum.
  return n >= 1 && n <= 30000 ? n : null;
}

/**
 * The frequency being looked at, if any.
 *
 * Held rather than drawn, because the rail is rebuilt by anything that touches
 * the selection — the globe settling, the player changing, a prefs broadcast.
 * The first version wrote the result straight into the list and it survived
 * about four seconds: you typed a frequency, read one line of it, and watched it
 * turn back into the receiver list on its own. Same defect as system lines
 * appended to a log that gets rebuilt, and the same fix — the renderer asks what
 * mode it is in rather than remembering what it last drew.
 */
let freqView = null;          // { khz } while a frequency is on screen
/**
 * Why the lookup and the drawing are separate.
 *
 * The first version did both in one async function and the renderer called it on
 * every repaint. Two of them overlapping each emptied the list and each filled
 * it, so eight receivers drew as sixteen. Guarding that with a sequence token
 * then made it worse in a way that looked like nothing at all: the rail repaints
 * faster than the schedule query resolves, so every render was overtaken by the
 * next and the list stayed empty forever.
 *
 * Both are the same mistake — asking a repaint to do work that can be in flight.
 * The lookup happens once, when somebody types a frequency, and what it found is
 * kept. Drawing is synchronous and can happen as often as it likes.
 */

/**
 * How many receivers are in the list, said once, where somebody is already
 * looking at receivers.
 *
 * The docs stopped quoting a figure because any figure drifts — the catalogue
 * holds 837, 744 answered one morning in August, next month it could be 900. But
 * the app knows the real number at load, and showing it is more honest than any
 * sentence we could write and better than none: it is always right, it needs no
 * maintenance, and the drift is the point rather than the problem.
 *
 * Phrased as plain reporting rather than as a boast. The number goes down as
 * often as up, and a line that only ever reads "look how many" becomes a lie the
 * week it drops.
 */
let receiverTotal = null;

const receiverCountLine = () => `${receiverTotal.toLocaleString()} `
  + (receiverTotal === 1
      ? t("sdr.receiverOne", "receiver volunteered worldwide")
      : t("sdr.receiverMany", "receivers volunteered worldwide"));

/** The box you type a frequency into, above the receivers near here. */
function frequencyRow(nearby) {
  const wrap = document.createElement("div");
  wrap.className = "freqrow";
  const input = document.createElement("input");
  input.type = "text";
  input.id = "freqinput";
  input.setAttribute("inputmode", "decimal");
  input.maxLength = 12;
  input.spellcheck = false;
  input.autocomplete = "off";
  input.placeholder = t("sdr.freqPlaceholder", "Go to a frequency — 7850, or 7.850");
  input.setAttribute("aria-label", t("sdr.freqLabel", "Tune to a frequency"));

  const go = async () => {
    const khz = parseKHz(input.value);
    if (!khz) {
      // An emptied box is a way back to the receiver list, not an error.
      if (!input.value.trim() && freqView) {
        freqView = null;
        renderNearbyReceivers(nearby);
        $("freqinput")?.focus();
        return;
      }
      if (input.value.trim()) {
        input.setAttribute("aria-invalid", "true");
        setTimeout(() => input.removeAttribute("aria-invalid"), 2500);
      }
      return;
    }
    input.removeAttribute("aria-invalid");
    await showFrequency(khz, nearby);
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); go(); }
  });
  wrap.append(input);

  // Underneath the box, quietly. Somebody typing a frequency is already thinking
  // about the whole network rather than about this city.
  const total = document.createElement("div");
  total.id = "rxtotal";
  total.className = "rxtotal";
  if (receiverTotal) total.textContent = receiverCountLine();
  wrap.append(total);
  return wrap;
}

/**
 * What is on a frequency, and who could hear it — answered without touching a
 * receiver.
 */
async function showFrequency(khz, nearby) {
  /**
   * A window rather than an exact match. Schedules and dials disagree by a
   * kilohertz or two all the time, and a listener asking for 7850 means "that
   * broadcast", not "that float".
   */
  const TOL = 5;
  let air = [];
  try {
    air = await window.auralfm.sdrOnAir({ minKHz: khz - TOL, maxKHz: khz + TOL }) || [];
  } catch { air = []; }
  freqView = { khz, air };
  paintFrequency(nearby);
}

/** Draw what the lookup found. Synchronous, so a repaint can never race it. */
function paintFrequency(nearby) {
  const { khz, air } = freqView;
  const list = stationListEl;
  list.innerHTML = "";
  list.append(frequencyRow(nearby));
  const freqInput = $("freqinput");
  if (freqInput) freqInput.value = String(khz);

  const line = (text, strong = false) => {
    const d = document.createElement("div");
    d.className = strong ? "empty swline strong" : "empty swline";
    d.textContent = text;
    list.append(d);
    return d;
  };

  const band = { freq: khz, when: Kiwi.whenFor(khz) };
  line(`${khz.toLocaleString()} kHz`, true);

  if (air.length) {
    const names = air.slice(0, 4).map((e) => e.station).filter(Boolean);
    line(names.length
      ? `${t("sdr.onNow", "Scheduled now")}: ${names.join(", ")}`
      : t("sdr.onNowUnnamed", "Something is scheduled here now."));
  } else {
    // Said plainly, and not treated as a dead end: the schedule covers
    // broadcasters and known utility stations, not amateurs, pirates or anything
    // unlisted, and those are some of the best listening there is.
    line(t("sdr.nothingScheduled",
      "Nothing in the schedule here right now. That does not mean it is empty — amateurs, pirates and unlisted stations are not in it."));
  }

  /**
   * Rank the receivers by whether the path is likely open *at that receiver*,
   * which is a different question for each one: a band shut over Wellington can
   * be wide open over Warsaw at the same moment.
   */
  const { lat: sunLat, lng: sunLng } = subsolarPoint();
  const rad = Math.PI / 180;
  const daylightAt = (rx) =>
    Math.sin(rx.lat * rad) * Math.sin(sunLat * rad) +
    Math.cos(rx.lat * rad) * Math.cos(sunLat * rad) * Math.cos((rx.lng - sunLng) * rad) > 0;

  const candidates = (nearby || []).map((rx) => {
    const o = Kiwi.outlook(band, daylightAt(rx), spaceWx);
    return { rx, o };
  }).sort((a, b) => (b.o.open ? 1 : 0) - (a.o.open ? 1 : 0) || a.rx.km - b.rx.km);

  if (!candidates.length) {
    line(t("sdr.noReceivers", "No receivers near this place. Pick somewhere else on the globe."));
    return;
  }
  const anyOpen = candidates.some((c) => c.o.open);
  if (!anyOpen) {
    line(t("sdr.bandShut",
      "This band looks shut from every receiver near here. You can still listen — it is a forecast, not a measurement."));
  }

  for (const { rx, o } of candidates) {
    const el = document.createElement("div");
    el.className = "st";
    el.innerHTML = `<span class="smeta"><div class="sn"></div><div class="stags"></div></span>`;
    el.querySelector(".sn").textContent = rx.loc || rx.name;
    el.querySelector(".stags").textContent =
      `${rx.km < 1 ? "here" : `${rx.km.toLocaleString()} km`} · ${o.open
        ? t("sdr.pathLikely", "path likely open") : t("sdr.pathUnlikely", "path unlikely")}`
      + (o.why ? ` · ${o.why}` : "");

    /**
     * One connection, and only because somebody chose this receiver — nothing
     * above this line has touched a radio.
     *
     * Handed to `selectReceiver` rather than tuned here. Calling `tunerStart`
     * directly did start the waterfall and then lost it seconds later: the dial
     * is shown only when a receiver is what you are looking at (`sdrSel`), and
     * tuning behind the app's back left it believing a *place* was selected — so
     * the next repaint through `goToPlace` stopped the tuner and hid the dial.
     * The receiver's own interface is the thing that was wanted anyway; this
     * just arrives at it already on the right frequency.
     */
    activatable(el, () => selectReceiver(rx, { tuneTo: khz }));
    list.append(el);
  }
}

/** Receivers near the selected place, with how far away each one is. */
function renderNearbyReceivers(nearby) {
  // A frequency on screen is a mode, and a repaint must not silently leave it.
  if (freqView) { paintFrequency(nearby); return; }
  stationListEl.innerHTML = "";
  stationListEl.append(frequencyRow(nearby));
  const dist = (km) => km < 1 ? "here" : `${km.toLocaleString()} km`;
  for (const rx of nearby) {
    const el = document.createElement("div");
    el.className = "st";
    el.innerHTML = `<span class="smeta"><div class="sn"></div><div class="stags"></div></span>`;
    el.querySelector(".sn").textContent = rx.loc || rx.name;
    el.querySelector(".stags").textContent =
      `${dist(rx.km)} away · ${rx.slots} ${rx.slots === 1
        ? t("sdr.slot", "listener slot") : t("sdr.slots", "listener slots")}`;
    activatable(el, () => selectReceiver(rx));
    stationListEl.append(el);
  }
}

/**
 * Click a receiver: put its bands in the rail where a place's stations would go.
 *
 * Bands, not stations, because that is what a receiver actually offers — it is
 * an antenna, and what you hear depends on which slice of the spectrum you point
 * it at and whether that path is in daylight. The day/night data the globe
 * already computes is exactly what tells you which bands are worth trying, so
 * the rail says so rather than making you know it.
 */
/**
 * @param {object} rx
 * @param {{tuneTo?: number}} [opts]  a frequency to land on, from the frequency box
 */
async function selectReceiver(rx, { tuneTo = null } = {}) {
  freqView = null;                     // its bands replace the frequency view
  setTimeout(updateSun, 0);            // same reason as renderStations()
  sdrSel = rx;
  railMode = "stations";                 // its bands, not the nearby-receiver list
  selection.placeIndex = null;
  showingFavorites = false;
  $("favBtn").setAttribute("aria-pressed", "false");
  qEl.value = "";
  placeListEl.hidden = true;
  stationListEl.hidden = false;
  placeHeadEl.textContent = "";
  $("chips").innerHTML = "";
  $("wx").textContent = "";

  const head = $("head");
  head.hidden = false;
  head.querySelector("h2").textContent = rx.loc || rx.name;
  const asl = rx.asl ? ` · ${rx.asl} m` : "";
  head.querySelector("p").textContent =
    `${t("sdr.receiver", "Shortwave receiver")}${asl} · ${rx.slots} ${rx.slots === 1
      ? t("sdr.slot", "listener slot") : t("sdr.slots", "listener slots")}`;

  // Is this receiver in daylight? Same sub-solar point the terminator uses.
  const { lat: sunLat, lng: sunLng } = subsolarPoint();
  const rad = Math.PI / 180;
  const cosSun =
    Math.sin(rx.lat * rad) * Math.sin(sunLat * rad) +
    Math.cos(rx.lat * rad) * Math.cos(sunLat * rad) * Math.cos((rx.lng - sunLng) * rad);
  const daylight = cosSun > 0;

  // Was: daylight alone. Now the operator's actual rule of thumb — daylight,
  // solar flux, and whether the field is disturbed — and it can say why.
  const look = (b) => Kiwi.outlook(b, daylight, spaceWx);
  const bands = [...Kiwi.BANDS].sort((a, b) => (look(b).open ? 1 : 0) - (look(a).open ? 1 : 0));

  // What is actually transmitting, this minute, in UTC. Until now this list was
  // 21 band centres, so "49 m" tuned 6100 kHz whether or not anything was there.
  let air = [];
  try { air = await window.auralfm.sdrOnAir({ lat: rx.lat, lng: rx.lng }); } catch { air = []; }

  stationListEl.innerHTML = "";
  const note = document.createElement("div");
  note.className = "empty swnote";
  const base = daylight
    ? t("sdr.day", "In daylight — the higher bands carry furthest right now.")
    : t("sdr.night", "In darkness — the lower bands carry furthest right now.");
  // The conditions that decide it, stated rather than implied.
  const wx = [];
  if (spaceWx?.flux != null) wx.push(`${t("sdr.flux", "solar flux")} ${Math.round(spaceWx.flux)}`);
  const kpNow = spaceWx?.kpEstimated ?? spaceWx?.kp;
  if (kpNow != null) wx.push(`Kp ${kpNow.toFixed(1)}`);
  // A storm outranks the time of day. Saying "the lower bands carry furthest"
  // during a geomagnetic storm is true in general and wrong right now.
  const lead = (kpNow != null && kpNow >= 5)
    ? t("sdr.storm", "Geomagnetic storm — HF is degraded everywhere, and high-latitude paths worst.")
    : base;
  note.textContent = wx.length ? `${lead}  ·  ${wx.join(" · ")}` : lead;
  stationListEl.append(note);

  /**
   * Tune something and mark the row.
   *
   * Frequency and mode come from the caller because a schedule entry knows both
   * exactly, where a band only ever knew a centre.
   */
  const tuneRow = (el, { freq, mode, label, width }) => {
    const go = () => {
      // lat/lng travel with the receiver: the popover publishes the playing
      // channel, and without a position a shortwave session was the only kind
      // that could not say where it was — so presence and chat quietly did
      // nothing for it.
      window.Tip?.donate("shortwaveTuned");
      window.auralfm.tuneSdr({ host: rx.host, name: rx.name, loc: rx.loc,
                               lat: rx.lat, lng: rx.lng, freq, mode, band: label, width });
      tunerStart(rx, freq, mode, width);
      for (const sib of stationListEl.querySelectorAll(".st")) sib.setAttribute("aria-current", "false");
      el.setAttribute("aria-current", "true");
    };
    activatable(el, go);
  };

  const heading = (text) => {
    const h = document.createElement("div");
    h.className = "empty swhead";
    h.textContent = text;
    stationListEl.append(h);
  };

  if (air.length) {
    /**
     * Rank what is worth trying from *this* receiver.
     *
     * Frequency order alone put Norwegian coastal stations at the top of a
     * Wellington list, so the first question is where a broadcast is aimed:
     * inside the target area beats a band merely being open, because a signal
     * pointed elsewhere is faint even on a good band. Then the band, then
     * broadcasts ahead of morse and telemetry.
     *
     * Nothing here predicts an opening. It orders the guesses.
     */
    const NEAR = 5000, WIDE = 9000;      // km from the middle of the target area
    // Broadcasters outrank everything, because that is what "a station" means.
    // Coastal radio, oceanic air-ground and VOLMET are still listed — they are
    // some of the best listening on the bands — just underneath.
    const score = (e, o) => (e.utility ? 0 : 8)
                          + (e.beamKm == null ? 0 : e.beamKm < NEAR ? 4 : e.beamKm < WIDE ? 2 : 0)
                          + (o.open ? 3 : 0);
    const scored = air.map((e) => {
      const o = look({ freq: e.khz, when: Kiwi.whenFor(e.khz) });
      return { e, o, s: score(e, o) };
    });
    scored.sort((a, b) => b.s - a.s
                       || (a.e.beamKm ?? 1e9) - (b.e.beamKm ?? 1e9)
                       || a.e.khz - b.e.khz);

    const SHOW = 80;
    const open = scored.filter((x) => x.o.open).length;
    heading(t("sdr.onair", "On air now") +
            ` · ${open} ${t("sdr.ofN", "of")} ${scored.length} ${t("sdr.onOpen", "on open bands")}`);

    for (const { e, o } of scored.slice(0, SHOW)) {
      const el = document.createElement("div");
      el.className = "st";
      el.innerHTML = `<span class="smeta"><div class="sn"></div><div class="stags"></div></span>`;
      el.querySelector(".sn").textContent = e.station;
      // kHz, to match the tuner readout and the schedule this came from.
      const bits = [`${Number(e.khz.toFixed(2))} kHz ${e.mode.toUpperCase()}`];
      if (e.lang) bits.push(e.lang);
      if (e.target) bits.push(`→ ${e.target}`);
      // Under an hour left is worth knowing before you settle in.
      if (e.until <= 60) bits.push(`${e.until} min ${t("sdr.left", "left")}`);
      if (e.note) bits.push(e.note);
      if (!o.open) { bits.push(o.why || t("sdr.unlikely", "likely quiet now")); el.style.opacity = ".55"; }
      el.querySelector(".stags").textContent = bits.join(" · ");
      tuneRow(el, { freq: e.khz, mode: e.mode, label: e.station });
      stationListEl.append(el);
    }
    // Never let a cap read as "that is all there is".
    if (scored.length > SHOW) {
      const more = document.createElement("div");
      more.className = "empty swmore";
      more.textContent =
        `${scored.length - SHOW} ${t("sdr.more", "more are on air; the bands below tune anywhere.")}`;
      stationListEl.append(more);
    }
    heading(t("sdr.bands", "Browse the bands"));
  }

  for (const b of bands) {
    const el = document.createElement("div");
    el.className = "st";
    const o = look(b);
    const open = o.open;
    // Same markup as a station row — this is the station list, and a band is
    // what a receiver offers in place of a station.
    el.innerHTML = `<span class="smeta"><div class="sn"></div><div class="stags"></div></span>`;
    el.querySelector(".sn").textContent = b.label;
    el.querySelector(".stags").textContent =
      `${b.freq} kHz ${b.mode.toUpperCase()} · ${b.hint}` +
      // The reason, not just the verdict. A greyed-out row that cannot say why
      // is indistinguishable from a broken one.
      (open ? (o.why ? ` · ${o.why}` : "") : ` · ${o.why || t("sdr.unlikely", "likely quiet now")}`);
    if (!open) el.style.opacity = ".55";
    // A band may ask for a filter it needs — the digital modes occupy the whole
    // 3 kHz above the dial and are half silenced at the normal width.
    tuneRow(el, { freq: b.freq, mode: b.mode, label: b.label, width: b.width });
    stationListEl.append(el);
  }

  /**
   * Asked for by frequency: land on it, now that this receiver is properly the
   * thing being looked at and the dial will stay.
   *
   * AM at normal width, because a bare frequency says nothing about mode — and
   * guessing SSB for somebody who typed a broadcast frequency is worse than
   * being plainly wrong in the common case. The mode buttons are right there.
   */
  if (tuneTo) {
    window.Tip?.donate("shortwaveTuned");
    window.auralfm.tuneSdr({ host: rx.host, name: rx.name, loc: rx.loc,
                             lat: rx.lat, lng: rx.lng, freq: tuneTo, mode: "am",
                             band: `${tuneTo} kHz`, width: "normal" });
    tunerStart(rx, tuneTo, "am", "normal");
  }

  flyTo(rx.lat, rx.lng);
  refreshGlobeSelection();
}

async function goToPlace(i, { play = false, fly = true } = {}) {
  sdrSel = null;                       // a place and a receiver are never both selected
  tunerStop();                         // and a place has nothing to tune
  qEl.value = "";
  showingFavorites = false;
  $("favBtn").setAttribute("aria-pressed", "false");
  placeListEl.hidden = true;
  stationListEl.hidden = false;
  placeHeadEl.textContent = "";      // the search summary no longer applies
  await selectPlace(i);
  if (fly && selection.place) flyTo(selection.place.lat, selection.place.lon);
  // Prefer a station the directory believes is alive.
  if (play && !locked && selection.channels.length) {
    const pick = selection.channels.find((c) => c.ok !== false) || selection.channels[0];
    window.auralfm.tune(pick);
  }
}

function wireShortwave() {
  window.auralfm.sdrStats?.().then((s) => {
    receiverTotal = s?.count ?? null;
    // Repaint only if receivers are what is on screen, so this never disturbs
    // somebody in the middle of something else.
    if (railMode === "shortwave") {
      const el = $("rxtotal");
      if (el && receiverTotal) el.textContent = receiverCountLine();
    }
  }).catch(() => {});
}
