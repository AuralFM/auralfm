/**
 * Explore, part 8 of 17: The shortwave dial: Explore's own spectrum connection and the tuning controls.
 *
 * Explore is one page split across plain scripts that share a global scope, in
 * the order explore.html loads them. Declarations live here; anything that runs
 * at load — listeners, IPC subscriptions, one-off calls — is in wireDial(),
 * which explore.js calls once every part has loaded. That keeps the original
 * single-file behaviour: no handler can fire into a part that has not loaded.
 */

/**
 * The dial.
 *
 * Explore owns the picture and the controls; the popover owns the only socket in
 * the app that makes sound. So this window opens its *own* connection for the
 * spectrum — which costs the receiver nothing extra, because the Kiwi's own
 * client opens exactly these two sockets — and asks the popover to retune the
 * audio by message.
 *
 * That split is the point of moving it here. A menu-bar popover exists to show
 * what is playing; it had grown a spectrum display, four tuning buttons and
 * three filter buttons, which is a receiver front panel wearing a player's
 * clothes.
 */
let wfSession = null, tuneState = null;
/** Pending release of a paused receiver — see the player:state handler. */
let idleRelease = null;
const WF_H = 88;
let wfFloor = -120;

/**
 * dBm to colour, scaled to the band rather than to a constant.
 *
 * A fixed window looks reasonable and is nearly useless: a quiet evening sits
 * inside about fifteen decibels, so everything renders one flat blue and a
 * carrier ten dB above the noise is invisible. The floor tracks the tenth
 * percentile of recent rows — the noise — and the scale runs 45 dB above it, so
 * signals stand out by how far they rise above *their own* floor, which is the
 * only measure comparable between bands.
 */
function wfColour(db) {
  const t = Math.max(0, Math.min(1, (db - wfFloor) / 45));
  if (t < 0.35) { const k = t / 0.35; return [0, Math.round(20 * k), Math.round(60 + 90 * k)]; }
  if (t < 0.65) { const k = (t - 0.35) / 0.3; return [Math.round(30 * k), Math.round(20 + 180 * k), Math.round(150 - 60 * k)]; }
  const k = (t - 0.65) / 0.35;
  return [Math.round(30 + 225 * k), Math.round(200 + 40 * k), Math.round(90 - 90 * k)];
}

function tunerStart(rx, freq, mode, width) {
  tunerStop();
  tuneState = { host: rx.host, freq, mode, width: width || "normal" };
  syncTunerVisibility();
  paintDial();

  const cv = $("wf"), ctx = cv.getContext("2d");
  const W = cv.width;
  ctx.fillStyle = "#05070c";
  ctx.fillRect(0, 0, W, WF_H);
  const img = ctx.createImageData(W, 1);
  wfFloor = -120;                       // re-learn the floor for each receiver

  // Held until the first row lands. The receiver is somebody's BeagleBone at the
  // other end of a WebSocket, so this is seconds, not milliseconds.
  $("wfwrap")?.classList.add("waiting");
  wfSession = new Kiwi.KiwiWaterfall({
    host: rx.host, freq, zoom: 10,
    onRow: (row) => {
      $("wfwrap")?.classList.remove("waiting");
      const sorted = Array.from(row).sort((a, b) => a - b);
      wfFloor = wfFloor * 0.92 + (sorted[Math.floor(sorted.length * 0.1)] - 255) * 0.08;
      ctx.drawImage(cv, 0, 0, W, WF_H - 1, 0, 1, W, WF_H - 1);
      for (let x = 0; x < W; x++) {
        // 1024 bins into 512 pixels: take the stronger of each pair, because a
        // narrow carrier averaged with its neighbour disappears, and a carrier
        // that disappears is the one thing this display exists to show.
        const [r, g, b] = wfColour(Math.max(row[x * 2], row[x * 2 + 1]) - 255);
        img.data[x * 4] = r; img.data[x * 4 + 1] = g; img.data[x * 4 + 2] = b; img.data[x * 4 + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      ctx.fillStyle = "rgba(255,255,255,0.30)";
      ctx.fillRect(W / 2, 0, 1, 1);
    },
  });
  wfSession.connect();
}

function tunerStop() {
  clearTimeout(idleRelease); idleRelease = null;
  $("wfwrap")?.classList.remove("waiting");
  wfSession?.stop();
  wfSession = null;
  tuneState = null;
  if ($("tuner")) $("tuner").hidden = true;
}

/**
 * The dial belongs to the Shortwave tab.
 *
 * It used to appear whenever a receiver session existed, which meant it hung
 * above the *station* list too — a black spectrum panel and seven controls
 * pushing the stations down, describing a radio the Stations tab has nothing to
 * do with. Switching tabs is switching instruments; each one should show its
 * own.
 *
 * The session keeps running underneath. Going back to Stations hides the dial,
 * it does not hang up on the receiver.
 */
function syncTunerVisibility() {
  const el = $("tuner");
  // `sdrSel`, not `railMode`. The rail tabs are a *place's* two lists — its
  // stations, and the receivers near it — and they stay on "stations" even after
  // you open a receiver, because opening one replaces the whole rail. So the
  // question is not which tab is selected, it is whether a receiver is what you
  // are looking at.
  if (el) el.hidden = !(tuneState && sdrSel);
}

function paintDial() {
  if (!tuneState) return;
  $("tfreq").textContent =
    `${Number(tuneState.freq.toFixed(2))} kHz ${tuneState.mode.toUpperCase()}`;
  for (const b of $("bw").children) {
    b.setAttribute("aria-pressed", String(b.dataset.w === tuneState.width));
  }
  // The step is mode-dependent — 100 Hz on AM, 10 Hz on sideband — so the
  // tooltips have to be, or they describe a radio we are not tuning.
  const st = Kiwi.steps(tuneState.mode);
  for (const b of document.querySelectorAll(".tb")) {
    const hz = st[b.dataset.hz.slice(1)];
    b.title = `${b.dataset.hz[0] === "-" ? "Down" : "Up"} ` +
              `${Math.abs(hz) >= 1000 ? `${Math.abs(hz) / 1000} kHz` : `${Math.abs(hz)} Hz`}`;
    // The glyph is the content, so it would otherwise be the name: "«".
    b.setAttribute("aria-label", b.title);
  }
}

/** Retune both halves: the picture here, the audio over there. */
function retune(freq, width) {
  if (!tuneState) return;
  tuneState.freq = Math.min(30000, Math.max(1, +freq.toFixed(3)));
  if (width) tuneState.width = width;
  wfSession?.tune(tuneState.freq);
  window.auralfm.transport({ action: "retune",
    value: { freq: tuneState.freq, mode: tuneState.mode, width: tuneState.width } });
  paintDial();
}

function wireDial() {
  for (const b of document.querySelectorAll(".tb")) {
    b.onclick = () => {
      if (!tuneState) return;
      const hz = Kiwi.steps(tuneState.mode)[b.dataset.hz.slice(1)];
      retune(tuneState.freq + (b.dataset.hz[0] === "-" ? -hz : hz) / 1000);
    };
  }
  for (const b of $("bw").children) {
    b.onclick = () => { if (tuneState) retune(tuneState.freq, b.dataset.w); };
  }
}
