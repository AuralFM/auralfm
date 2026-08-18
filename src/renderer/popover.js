const $ = (id) => document.getElementById(id);
const listEl=$("list"), qEl=$("q"), headEl=$("secthead"), toggle=$("toggle"),
      nowName=$("nowName"), statusEl=$("status"), vol=$("vol");

const audio = new Audio();
let lastRssi = null;      // most recent S-meter reading, receivers only
audio.preload = "none";

let state = { favorites: [], vol: 0.8 };
let rows = [];          // what's currently rendered
let current = null;     // the channel object playing
let live = false;       // true only once audio really starts — audio.paused is
                        // false during connect too, so it can't stand in for this
let tried = [];         // ids attempted in the current auto-skip chain
let skipping = false;   // guards against re-entering the skip while one is running
let gen = 0, watchdog = null, searchSeq = 0, debounce = null;

/**
 * Shortwave lives in this window for the same reason everything else audible
 * does: there is exactly one thing in AuralFM that makes sound, so play/pause,
 * volume, the media keys and Now Playing all work without knowing which kind of
 * radio is playing. Explore asks; this window plays.
 */
let sdrSession = null, audioCtx = null, sdrRx = null;

/**
 * ─── Where the sound comes out ───────────────────────────────────────────────
 *
 * macOS sends every app to one system output, so listening in the kitchen meant
 * moving the whole Mac's audio there and moving it back afterwards. The browser
 * engine can route a single element instead, which is the thing a radio wants:
 * the radio goes to the kitchen speaker and everything else stays put.
 *
 * Measured in this app before building it, because two of the three assumptions
 * I had were wrong:
 *
 *   `setSinkId` on the audio element        works
 *   `setSinkId` on the AudioContext         works — so shortwave follows too,
 *                                           and this is not a half feature
 *   device *names* without a microphone     visible. In a browser the labels are
 *                                           gated behind microphone permission;
 *                                           in Electron they are not, so nothing
 *                                           has to ask for a microphone to name
 *                                           a speaker. That would have been an
 *                                           unacceptable price here.
 *
 * What this cannot do, and the interface should not imply: **pair** a Bluetooth
 * device. Pairing is the operating system's, and Web Bluetooth — which does
 * exist here — is for low-energy data devices, not for audio routing. A speaker
 * has to be paired and connected in macOS first; then it appears in this list
 * like any other output, and the app can send the radio to it.
 */
let outputId = "";                      // "" means whatever macOS is using

/**
 * ─── Why there is no waveform ────────────────────────────────────────────────
 *
 * A share card can name a station, and naming is not hearing, so a picture of
 * the real sound was worth having. It cost too much.
 *
 * The measurement that justified it was true and misleading. An AnalyserNode on
 * a live cross-origin stream did return real data here — 119 of 256 bins
 * non-zero on KEXP, peak 192 — but KEXP answers cross-origin requests. Most
 * stations do not. `createMediaElementSource` permanently redirects an element's
 * audio into the Web Audio graph, and for media the browser will not let through
 * that graph, the output is silence: the stream still arrives, the clock still
 * advances, the status still names the station, and nothing comes out.
 *
 * About one station in six, scattered anywhere in the world, because the
 * variable is what the *server* says and not what the audio is. Confirmed by
 * comparing `webkitAudioDecodedByteCount` against the analyser: the silent ones
 * decode at exactly the rate of the ones you can hear.
 *
 * One test station on one continent is not a sample. A decoration on a picture
 * is not worth a one-in-six chance of silencing a radio.
 */

/**
 * Deliberately absent: an AnalyserNode on the playing element.
 *
 * There was one here. It called `createMediaElementSource`, which permanently
 * redirects the element's audio into the Web Audio graph, and for cross-origin
 * media the browser passes silence through that graph. About one station in six
 * went quiet while still reporting that it was playing.
 *
 * If levels are ever wanted again, they cannot come from this element. Anything
 * that reintroduces `createMediaElementSource` here reintroduces the silence,
 * so the audit fails on the call by name.
 */
function levelHistory() {
  return null;
}

async function applyOutput(id) {
  outputId = String(id || "");
  const target = outputId || undefined;
  // Both paths, or shortwave would keep coming out of the built-in speakers
  // while the streams moved — which reads as a broken feature rather than a
  // partial one.
  try { await audio.setSinkId?.(target ?? ""); } catch { /* device went away */ }
  try { if (audioCtx) await audioCtx.setSinkId?.(target ?? ""); } catch { /* same */ }
}

/**
 * Where the sound goes.
 *
 * One button that opens a menu, matching Explore. The picker used to sit open
 * beside the speaker, spending this panel's scarcest resource — width — on a
 * label for something nobody is currently changing.
 *
 * This window is the one that actually makes noise, so it both shows the choice
 * and applies it; Explore only writes the preference.
 */
let outDevices = [];

async function readOutputs() {
  try {
    const all = await navigator.mediaDevices.enumerateDevices();
    return all.filter((d) => d.kind === "audiooutput" && !/^default$/i.test(d.deviceId));
  } catch { return []; }
}

/**
 * One glyph: a speaker. See the note in Explore — the bluetooth and warning
 * marks fired on a cold start, before the device list existed, so the first
 * thing the app said was that something had failed when nothing had.
 */
function paintOutputIcon() {
  const btn = $("outbtn");
  if (!btn) return;
  Icons.set(btn, "speakers");
  const dev = outputId ? outDevices.find((d) => d.deviceId === outputId) : null;
  btn.title = dev?.label || t("ctl.output", "Where the sound comes out");
}

async function renderOutputs() {
  const wrap = $("outwrap");
  if (!wrap) return;
  outDevices = await readOutputs();
  // Stays put; see the note in Explore. Hiding below two outputs made the button
  // disappear the moment a bluetooth speaker disconnected — which is precisely
  // when somebody goes looking for it.
  wrap.hidden = outDevices.length === 0;
  if (wrap.hidden) { closeOutMenu(); return; }
  // A remembered device that has since been unplugged falls back to the system
  // output rather than leaving the control pointing at nothing.
  if (outputId && !outDevices.some((d) => d.deviceId === outputId)) {
    outputId = "";
    await applyOutput("");
  }
  paintOutputIcon();
  if (!$("outmenu").hidden) paintOutMenu();
}

function paintOutMenu() {
  const menu = $("outmenu");
  menu.textContent = "";
  const add = (value, label) => {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("role", "option");
    b.setAttribute("aria-selected", String(value === outputId));
    const tick = document.createElement("span");
    tick.className = "tick";
    tick.textContent = "\u2713";
    const name = document.createElement("span");
    name.className = "devname";
    name.textContent = label;
    b.append(tick, name);
    b.onclick = async () => {
      await applyOutput(value);
      window.auralfm.setPrefs({ audioOutput: outputId });
      closeOutMenu();
      paintOutputIcon();
    };
    menu.append(b);
  };
  add("", t("ctl.outputSystem", "System output"));
  for (const d of outDevices) add(d.deviceId, d.label || t("ctl.outputUnnamed", "Speaker"));
}

function placeOutMenu() {
  const r = $("outbtn").getBoundingClientRect();
  const menu = $("outmenu");
  const m = menu.getBoundingClientRect();
  const top = Math.max(8, r.top - m.height - 8);
  const left = Math.min(Math.max(8, r.right - m.width), window.innerWidth - m.width - 8);
  menu.style.top = `${Math.round(top)}px`;
  menu.style.left = `${Math.round(left)}px`;
}

async function openOutMenu() {
  outDevices = await readOutputs();
  paintOutMenu();
  const menu = $("outmenu");
  menu.hidden = false;
  placeOutMenu();
  $("outbtn").setAttribute("aria-expanded", "true");
  menu.querySelector('button[aria-selected="true"]')?.focus();
}

function closeOutMenu({ refocus = false } = {}) {
  const menu = $("outmenu");
  if (!menu || menu.hidden) return;
  menu.hidden = true;
  $("outbtn").setAttribute("aria-expanded", "false");
  if (refocus) $("outbtn").focus();
}

/**
 * End a shortwave session.
 *
 * The callback is detached first, deliberately. Stopping fires onState, and if
 * we are stopping because the user just picked a station, that callback would
 * overwrite "Finding stream…" with "Receiver disconnected" — reporting the thing
 * we did as though something went wrong.
 */
/**
 * Frequency, in kHz — the unit shortwave is spoken and published in, and the
 * only one that can show a hundred-hertz nudge (MHz to three decimals cannot).
 */
const fmtHz = (khz) => `${Number(khz.toFixed(2))} kHz`;

function sdrStop() {
  if (!sdrSession) return;
  sdrSession.opts.onState = null;
  sdrSession.stop();
  sdrSession = null;
  sdrRx = null;
}

function setStatus(m,c=""){ statusEl.textContent=m; statusEl.className=c; publish(); }
function publish(){
  // A shortwave session is described in the same shape as a station, so Explore
  // and the tray need no special case for it.
  const ch = sdrRx
    // The receiver's coordinates travel with it. Without them a shortwave
    // session had no place attached, so presence and the geohash chat silently
    // did nothing — the only kind of session in the app that could not say
    // where it was. `lng` here, `lon` there: the SDR list and the catalogue
    // spell it differently, and the mismatch is why this looked like a design
    // decision rather than a missing field.
    ? { id: "sdr:" + sdrRx.host, title: sdrRx.label, place: sdrRx.loc, country: "",
        lat: sdrRx.lat, lon: sdrRx.lng, sdr: true }
    : current ? {id:current.id, title:current.title, place:current.place,
                 country:current.country, lat:current.lat, lon:current.lon} : null;
  window.auralfm.publishState({
    channel: ch,
    status: statusEl.textContent,
    /**
     * Did it fail, or is it still trying?
     *
     * `playing` is false for both, which is why Explore could not tell them
     * apart and had to treat an eleven-second connection and a dead stream as
     * the same silence. The popover already knows: `fail` is the only caller
     * that passes the "err" class.
     */
    error: statusEl.className === "err",
    playing: live,
    volume: audio.volume,
    /**
     * Signal strength, in dBm, and only ever for a receiver.
     *
     * Null for an internet stream on purpose. A stream either arrives or it does
     * not; there is no analogue signal behind it to measure, and inventing a
     * number so the indicator had something to do would be a lie in an app that
     * does not tell them. The absence is the honest value.
     */
    rssi: sdrRx ? lastRssi : null,
  });
}
/**
 * Save one thing, not everything.
 *
 * This used to send the whole `state` object, which this window read once at
 * launch and never refreshed. So every volume change wrote a boot-time copy of
 * `favorites` over whatever Explore had saved since — silently, and only
 * sometimes, depending on which window wrote last.
 */
const persist=(patch)=> window.auralfm.setState({ ...patch });

// Explore draws the card; this window is the one that can hear.
window.auralfm.onLevelsWanted?.(() => window.auralfm.levelsAre(levelHistory()));

/** Main is the truth. Anything it saves lands here before the next patch. */
window.auralfm.onStateChanged?.((s)=>{
  if (!s || typeof s !== "object") return;
  state = { ...state, ...s };
  if (!Array.isArray(state.favorites)) state.favorites = [];
  // Repaint only if the favorites list is what is on screen, so this never
  // yanks a search result out from under somebody mid-type.
  if (!qEl.value.trim()) showFavorites();
});
const isFav=(id)=> state.favorites.some(f=>f.id===id);

// The way back to the globe, in the open rather than behind ⌘G or a right-click
// on a menu bar icon. Main already had the door; this window had no handle on it.
$("openglobe").onclick = () => window.auralfm.openExplore();
Icons.set($("openglobe"), "external");

// ── rendering ────────────────────────────────────────────────────────────────
function render(items, {numbered=false, empty="", showTags=false}={}) {
  rows = items;
  listEl.innerHTML = "";
  if (!items.length) {
    listEl.innerHTML = `<div class="empty">${empty}</div>`;
    fitHeight();
    return;
  }
  items.forEach((ch, i) => {
    const el = document.createElement("div");
    el.className = "row";
    el.setAttribute("aria-current", current?.id === ch.id);
    el.innerHTML =
      // Empty chips read as broken placeholders; reserve the width without the fill.
      /**
       * Every favourite is numbered, not only the first nine.
       *
       * The cap was there because 1–9 are the keyboard shortcuts and there is no
       * tenth key. But the effect was a list that counted to nine and then went
       * blank, which reads as the app losing track rather than as a keyboard
       * running out — Melton has more than nine and saw exactly that.
       *
       * So the number is a position now and the *key cap* is the shortcut. Past
       * nine the number is still there, without the cap around it, because
       * drawing a key that cannot be pressed would be the dishonest version of
       * fixing this.
       */
      (numbered
        ? `<span class="key${i < 9 ? "" : " plain"}">${i+1}</span>`
        : `<span class="key blank"></span>`) +
      `<span class="meta"><span class="nm"></span><div class="sub"></div></span>` +
      `<button class="star${isFav(ch.id)?" on":""}" title="${t('ctl.favorite', 'Favorite')}">${Icons.svg(isFav(ch.id)?"starFill":"star")}</button>` +
      `<span class="bars"><i></i><i></i><i></i></span>`;
    el.querySelector(".nm").textContent = ch.title;
    const tags = showTags && ch.tags?.length ? ch.tags.slice(0, 2).join(", ") : null;
    el.querySelector(".sub").textContent =
      [ch.place, tags || ch.country].filter(Boolean).join(" · ");
    el.onclick = (e) => {
      if (e.target.closest(".star")) return;
      if (current?.id === ch.id && !audio.paused) stop(); else tune(ch);
    };
    el.querySelector(".star").onclick = (e) => { e.stopPropagation(); toggleFav(ch); };
    listEl.appendChild(el);
  });
  fitHeight();
}

/**
 * Ask main to size the window to the content, the way an AppKit popover does.
 *
 * Every part of the chrome is summed by selector, and a missing selector used to
 * take the whole function with it: this read
 * `document.querySelector("header").offsetHeight` and the header was removed when
 * the "Explore the world" button went. `null.offsetHeight` threw on every call,
 * so the window kept whatever height it last had and left 138px of dead space
 * under the last favourite. Nothing surfaced -- the throw was inside a render
 * path nobody was watching.
 *
 * So the parts are summed defensively now, and anything missing is reported once
 * rather than silently costing the panel its sizing.
 */
const missingChrome = new Set();
function fitHeight() {
  const partOf = (sel) => {
    const el = document.querySelector(sel);
    if (el) return el.offsetHeight;
    if (!missingChrome.has(sel)) {
      missingChrome.add(sel);
      console.warn(`fitHeight: no ${sel} — the panel will size as if it were 0px tall`);
    }
    return 0;
  };
  const chrome = partOf(".searchwrap") + (headEl?.offsetHeight ?? 0) + partOf(".bar");
  // Sum the rows rather than reading listEl.scrollHeight: the list is flex-grown,
  // and scrollHeight never reports less than the box itself, so it would just
  // echo the current window height back and the panel would never shrink.
  let content = 0;
  for (const el of listEl.children) content += el.offsetHeight;
  window.auralfm.setHeight(chrome + content + 12);
}

function showFavorites() {
  headEl.textContent = t("app.favorites", "Favorites");
  render(state.favorites, {
    numbered: true,
    empty: `${t("empty.favorites", "No favorites yet.")}<br>${t("empty.favoritesHint", "Tap the star beside a station to save it.")}`,
  });
}

function toggleFav(ch) {
  const i = state.favorites.findIndex(f => f.id === ch.id);
  if (i >= 0) state.favorites.splice(i, 1);
  else state.favorites.push({ id:ch.id, title:ch.title, place:ch.place, country:ch.country, secure:ch.secure,
                       // Coordinates too. Without them a favourite is a name and a
                       // place-string, and everything downstream that needs a point on
                       // the globe — the share card most visibly — had nothing to draw.
                       lat:ch.lat, lon:ch.lon });
  persist({ favorites: state.favorites });
  qEl.value.trim() ? render(rows, {numbered:false}) : showFavorites();
}

// ── search ───────────────────────────────────────────────────────────────────
qEl.addEventListener("input", () => {
  clearTimeout(debounce);
  const q = qEl.value.trim();
  if (!q) { showFavorites(); return; }
  debounce = setTimeout(async () => {
    const seq = ++searchSeq;
    const results = await window.auralfm.search(q, 60);
    if (seq !== searchSeq) return;              // a newer keystroke already won
    headEl.textContent = `${results.length} result${results.length===1?"":"s"}`;
    render(results, { showTags: true, empty: "Nothing found.<br>Try a city, country, or genre." });
  }, 120);
});

// ── playback ─────────────────────────────────────────────────────────────────
/** Always resolves and plays `ch`. Toggle logic lives at the call sites. */
async function tune(ch, { chained = false } = {}) {
  if (!chained) tried = [];
  // A station and a receiver are never both playing. This was missing, so
  // picking a station left the shortwave audio running underneath it — and
  // publish() reads sdrRx first, so Now Playing went on naming the receiver.
  sdrStop();
  current = ch;
  nowName.textContent = ch.title;
  toggle.disabled = false;
  state.lastChannel = ch; persist({ lastChannel: ch });
  [...listEl.children].forEach((el,i)=> el.setAttribute?.("aria-current", rows[i]?.id === ch.id));

  const my = ++gen;
  live = false;
  setStatus("Finding stream…");
  document.body.classList.remove("playing");

  const res = await window.auralfm.resolve(ch);
  if (my !== gen) return;
  if (!res) { fail("No stream available"); return; }
  start(res.url, my);
}

function start(url, my) {
  audio.src = url + (url.includes("?") ? "&" : "?") + "_=" + Date.now();
  audio.load();
  setStatus("Connecting…");
  audio.play().catch(err => {
    if (my !== gen || err.name === "AbortError") return;
    fail("Could not connect");
  });
  clearTimeout(watchdog);
  // Streams routinely take 8-11s to hand over first audio; 15s is the real ceiling.
  watchdog = setTimeout(() => {
    if (my === gen && (audio.paused || !audio.currentTime)) fail("Stream not responding");
  }, 15000);
}

/**
 * Every play/pause affordance goes through here — the button, the space bar, the
 * media keys and Explore's transport — so none of them has to know which kind of
 * radio is playing.
 *
 * Shortwave has no resume. Pausing would mean holding a volunteer's receiver
 * slot open while not listening to it, and resuming would mean a fresh
 * connection, which the etiquette rules forbid doing automatically. So for a
 * shortwave session, pause means stop, and that is the honest behaviour.
 */
function togglePlay() {
  if (sdrSession) return stop();
  if (current) audio.paused ? tune(current) : stop();
}

/**
 * Glyph and name together, always.
 *
 * A design review flagged this button as announcing only "button" — no text, no
 * label, nothing. Verified in the running app: true here, and true of Explore's
 * play and mute buttons too. It is the control the whole panel exists for.
 *
 * The name is set in the same call as the icon so the two cannot drift: a button
 * showing a pause glyph while announcing "Play" is worse than one that says
 * nothing, because it is confidently wrong.
 */
function setToggle(state) {
  Icons.set(toggle, state);
  /**
   * The English word, not `t()`.
   *
   * `t` is a const declared far below this, and this function is called once at
   * module scope to draw the initial glyph — reaching for `t` there is a
   * temporal-dead-zone ReferenceError that kills the entire panel script before
   * anything renders. I shipped exactly that for one build and caught it by
   * checking the button in the running app rather than re-reading the diff.
   *
   * The translated name arrives a moment later anyway: the markup carries
   * `data-i18n-title`, and the i18n pass turns it into an `aria-label`. This
   * keeps the name correct in the gap, and correct in English thereafter.
   */
  const label = state === "pause" ? "Pause" : "Play";
  toggle.setAttribute("aria-label", label);
  toggle.title = label;
}

function stop(){
  clearTimeout(watchdog); gen++; live = false;
  clearMediaSession();
  window.auralfm.mediaKeys(false);
  sdrStop();
  audio.pause(); audio.removeAttribute("src"); audio.load();
  setToggle("play");
  document.body.classList.remove("playing");
  setStatus("Stopped");
}

function fail(msg){
  clearTimeout(watchdog); live = false;
  document.body.classList.remove("playing");
  setToggle("play");
  setStatus(msg, "err");
  autoSkip(msg);
}

/**
 * Around 5% of streams are down or geo-blocked at any moment, so a dead stream
 * has to be a hiccup rather than a dead end: fall through to the next station in
 * the same city. Capped at 3 attempts — past that it is the city that's the
 * problem, not the station, and silently cycling forever would be worse than
 * showing the error.
 */
async function autoSkip(reason) {
  if (!current || skipping || tried.length >= 3) return;
  const dead = current;
  window.auralfm.reportFailed(dead.id);
  tried.push(dead.id);
  skipping = true;

  const next = await window.auralfm.nextStation(dead, tried);
  if (!next) { skipping = false; setStatus(`${reason} — no alternative here`, "err"); return; }

  setStatus(`${dead.title} unavailable · trying ${next.title}`, "err");
  await tune(next, { chained: true });
}

audio.addEventListener("playing", () => {
  clearTimeout(watchdog);
  live = true;
  /**
   * The analyser does NOT go here, and must not.
   *
   * `createMediaElementSource` permanently redirects an element's audio into the
   * Web Audio graph — and for cross-origin media the browser will not let that
   * audio through. The stream keeps arriving, the clock keeps advancing, the
   * status keeps saying the station's name, and the graph emits silence.
   *
   * Roughly one station in six is affected. Not a codec or a region: whether the
   * *server* answers a cross-origin request. streamtheworld replies with an ACAO
   * of `file://` after its redirect, and zeno.fm answers the redirect target with
   * `500 CORS Rejected - Invalid origin` outright. Both decode audio at the same
   * rate as a station that works — measured with webkitAudioDecodedByteCount,
   * which was the thing that showed this was ours and not theirs.
   *
   * It was attached here to sample levels for the share card's waveform. A
   * decoration on a picture is not worth a one-in-six chance of silencing the
   * radio, so the waveform is gone until there is a way to sample that cannot
   * mute anything.
   */
  skipping = false;
  window.auralfm.reportOk(current?.id);
  updateMediaSession();
  window.auralfm.mediaKeys(true);
  setToggle("pause");
  document.body.classList.add("playing");
  setStatus([current?.place, current?.country].filter(Boolean).join(" · ") || "Live", "live");
});
audio.addEventListener("waiting", () => { if (!audio.paused) setStatus("Buffering…"); });
audio.addEventListener("error", () => {
  if (!current || !audio.error || audio.error.code === 1) return;
  fail("Stream unavailable");
});

toggle.onclick = () => {
  // `current` is null during a shortwave session — guard on "is anything on".
  if (!current && !sdrSession) return;
  togglePlay();
};
function applyVolume(v) {
  audio.volume = v;
  sdrSession?.setVolume(v);
  vol.value = v;
  Icons.set($("mute"), v === 0 ? "volumeOff" : v < 0.5 ? "volumeLow" : "volumeHigh");
  state.vol = +v; persist({ vol: +v });
  // Tell Explore. Volume was the one control that moved in only one direction:
  // Explore's slider arrives here as a transport message and is applied, but a
  // drag on *this* slider changed the audio and never said so, leaving Explore
  // showing whatever it last knew. Every other change in this window reaches
  // Explore because it passes through setStatus, which publishes; this one does
  // not touch the status line.
  publish();
}
vol.oninput = () => applyVolume(+vol.value);

/* The transport button starts as a play triangle.
   Icons.set(toggle, ...) only ran from tune, stop and fail, so before anything
   had ever played the button was an empty circle of accent colour with no glyph
   in it at all -- which is what Melton saw on a fresh launch. */
setToggle("play");
let preMute = 0.8;
$("mute").onclick = () => {
  if (audio.volume > 0) { preMute = audio.volume; applyVolume(0); }
  else applyVolume(preMute || 0.8);
};

// ── keys ─────────────────────────────────────────────────────────────────────
document.addEventListener("keydown", e => {
  const typing = e.target === qEl;
  if (e.key === "Escape") {
    if (typing && qEl.value) { qEl.value=""; showFavorites(); qEl.blur(); }
    else window.auralfm.hide();
    return;
  }
  if (e.key === "Enter" && typing && rows.length) { tune(rows[0]); return; }
  if (typing) return;                       // don't steal keys while searching
  if (e.code === "Space") { e.preventDefault(); togglePlay(); }
  else if (/^[1-9]$/.test(e.key)) {
    const f = state.favorites[+e.key - 1];
    if (f) tune(f);
  }
});

/**
 * macOS Now Playing + media keys, via the MediaSession API.
 *
 * Chromium wires MediaSession into the system Now Playing widget and the
 * hardware media keys, so this covers both without a native module. Handlers are
 * only meaningful while something is playing, which is also what stops AuralFM
 * hijacking F8 from Music or Spotify when it is idle — see clearMediaSession().
 */
function updateMediaSession() {
  if (!("mediaSession" in navigator)) return;
  if (!current || !live) return clearMediaSession();

  navigator.mediaSession.metadata = new MediaMetadata({
    title: current.title,
    artist: [current.place, current.country].filter(Boolean).join(" · "),
    album: "AuralFM",
    artwork: [
      { src: "../../assets/generated/favicon.png", sizes: "64x64", type: "image/png" },
      { src: "../../assets/generated/app-512.png", sizes: "512x512", type: "image/png" },
    ],
  });
  navigator.mediaSession.playbackState = "playing";

  navigator.mediaSession.setActionHandler("play", () => { if (current) tune(current); });
  navigator.mediaSession.setActionHandler("pause", () => stop());
  navigator.mediaSession.setActionHandler("stop", () => stop());
  // Next/previous walk your favorites — the only ordered list the player has.
  navigator.mediaSession.setActionHandler("nexttrack", () => stepFavorite(1));
  navigator.mediaSession.setActionHandler("previoustrack", () => stepFavorite(-1));
  // Live radio has no timeline; declaring these off keeps scrubbers from appearing.
  navigator.mediaSession.setActionHandler("seekto", null);
  navigator.mediaSession.setActionHandler("seekbackward", null);
  navigator.mediaSession.setActionHandler("seekforward", null);
}

function clearMediaSession() {
  if (!("mediaSession" in navigator)) return;
  navigator.mediaSession.playbackState = "none";
  navigator.mediaSession.metadata = null;
}

function stepFavorite(delta) {
  if (!state.favorites.length) return;
  const at = state.favorites.findIndex((f) => f.id === current?.id);
  const next = state.favorites[((at < 0 ? 0 : at + delta) + state.favorites.length) % state.favorites.length];
  if (next) tune(next);
}

// Explore has no audio element of its own — it asks us to play.
window.auralfm.onTune((ch) => { tune(ch); });

/**
 * Tune a shortwave receiver.
 *
 * @param {{host,name,loc,freq,mode,band}} rx
 *
 * Note what this does NOT do: retry, reconnect, or try a second receiver. These
 * are volunteers' machines on volunteers' bandwidth, and a client that retries
 * on failure is how 838 hobbyists become 838 people who block you. A refusal is
 * an answer — Explore offers a different receiver instead.
 */
window.auralfm.onTuneSdr((rx) => {
  stop();                                   // one source of sound, always
  audioCtx = audioCtx || new AudioContext();
  audioCtx.resume?.();
  // A context created after the choice was made has to be told about it.
  if (outputId) { try { audioCtx.setSinkId?.(outputId); } catch { /* device went away */ } }

  sdrRx = { ...rx, label: `${rx.band} · ${rx.loc || rx.name}` };
  setStatus("Connecting to receiver…");

  sdrSession = new Kiwi.KiwiSession({
    host: rx.host,
    freq: rx.freq,
    mode: rx.mode,
    // The band may specify one; otherwise the default that clears the adjacent
    // carrier. Either way the buttons can still override it.
    width: rx.width || "normal",
    audio: audioCtx,
    onState: (s) => {
      // A session that ended for any reason must not leave the UI claiming to play.
      if (s.status === "playing") {
        if (!live) {
          live = true;
          document.body.classList.add("playing");
          setToggle("pause");
          window.auralfm.mediaKeys(true);
        }
        // Kept so the globe window's on-air dot can breathe with the signal —
        // see publishState. The receiver sends this in every audio frame, so it
        // is real measurement rather than anything inferred from the stream.
        lastRssi = s.rssi;
        const sig = s.rssi == null ? "" : ` · ${Math.round(s.rssi)} dBm`;
        // s.freq, not rx.freq: after a nudge the two differ, and the status line
        // claiming the frequency you started on is worse than no readout at all.
        setStatus(`${fmtHz(s.freq ?? rx.freq)} ${(s.mode || rx.mode).toUpperCase()}${sig}`);
      } else if (s.status === "error") {
        sdrEnded(`Receiver ${s.error}`, "err");
      } else if (s.status === "stopped" && sdrSession) {
        sdrEnded("Receiver disconnected");
      }
    },
  });
  sdrSession.setVolume(audio.volume);
  sdrSession.connect();
  nowName.textContent = sdrRx.label;
});


// Hardware media keys, forwarded from main.
// Listener count, when a presence server is configured. Silent otherwise.
window.auralfm.onListeners((n) => {
  const el = $("status");
  if (!n || !live) return;
  el.textContent = `${el.textContent} · ${n} listening`;
});

// Explore's transport talks to this player; there is still only one <audio>.
window.auralfm.onTransport(({ action, value }) => {
  if (action === "toggle") togglePlay();
  else if (action === "volume") applyVolume(Math.max(0, Math.min(1, value)));
  // The dial lives in Explore now; this window still owns the only socket that
  // makes sound, so retuning arrives as a message rather than a button press.
  else if (action === "retune" && sdrSession) {
    sdrSession.tune(value.freq, value.mode || sdrSession.opts.mode, value.width);
    if (sdrRx) {
      // Once you tune off the band you arrived on, the band's name is no longer
      // true — the transport read "FT8 · 40 m" while the status line underneath
      // it read 567 kHz AM. The frequency is already on the status line, so the
      // name falls back to the receiver, which stays true wherever you go.
      const moved = Math.abs(sdrSession.opts.freq - (sdrRx.freq ?? value.freq)) > 0.001;
      const where = sdrRx.loc || sdrRx.name;
      sdrRx = { ...sdrRx, freq: sdrSession.opts.freq,
                label: moved ? where : sdrRx.label };
      nowName.textContent = sdrRx.label;
    }
    publish();
  }
});

window.auralfm.onMediaKey((action) => {
  if (action === "playpause") togglePlay();
  else if (action === "next") stepFavorite(1);
  else if (action === "prev") stepFavorite(-1);
});

// Replay the entrance each time the popover is shown (the window is reused).
// ── preferences and language ─────────────────────────────────────────────────
/**
 * Pushed from main whenever Settings changes, so both windows stay in step.
 * "system" clears the attribute rather than setting data-theme="system": an
 * explicit value would permanently outrank prefers-color-scheme.
 */
/** The popover only needs the accent — it has no globe to colour. */
async function applyPalette() {
  const pal = await window.auralfm.palette();
  if (!pal) return;
  const r = document.documentElement;
  const light = r.getAttribute("data-theme") === "light" ||
    (r.getAttribute("data-theme") !== "dark" && !matchMedia("(prefers-color-scheme: dark)").matches);
  r.style.setProperty("--accent", light ? pal.accentLight : pal.accent);
  // In light theme the star follows the accent, not `palette.star`.
  // Every palette's star is a near-white or a pale tint -- #F5F0E4, #DCE7FF,
  // #FFE9B0 -- because it was chosen to sit on the night side of a globe. On the
  // light background those measure 1.01 to 1.40:1, which is invisible: Melton
  // could not find the favourite stars at all. accentLight is already designed
  // for this background and clears the 3:1 floor WCAG sets for non-text UI in all
  // nine palettes. Dark theme keeps the pale star, where it measures 12 to 18:1.
  r.style.setProperty("--star", light ? pal.accentLight : pal.star);
}

function applyPrefs(p) {
  // Help tags follow the pref, and adopt() migrates any title= that arrived
  // with a freshly rendered row.
  window.Tips?.setEnabled(p?.tips !== false);
  window.Tips?.adopt();
  const r = document.documentElement;
  if (!p.theme || p.theme === "system") r.removeAttribute("data-theme");
  else r.setAttribute("data-theme", p.theme);
  r.setAttribute("data-contrast", p.contrast === "more" ? "more" : "normal");
}

let T = {};
const t = (key, fallback) => T[key] || fallback;

/**
 * Re-name the toggle in the current language, for whichever state it is in.
 *
 * `data-i18n-title` names it once at load, which is right until the button
 * changes state — after that the markup's key is stale and only the state knows
 * the answer.
 */
function retranslateToggle() {
  const playing = document.body.classList.contains("playing");
  const label = playing ? t("ctl.pause", "Pause") : t("ctl.play", "Play");
  toggle.setAttribute("aria-label", label);
  toggle.title = label;
}

async function applyStrings() {
  T = (await window.auralfm.strings()) || {};
  for (const el of document.querySelectorAll("[data-i18n]")) {
    const v = T[el.dataset.i18n];
    if (v) el.textContent = v;
  }
  for (const el of document.querySelectorAll("[data-i18n-title]")) {
    const v = T[el.dataset.i18nTitle];
    if (v) { el.title = v; el.setAttribute("aria-label", v); }
  }
  // The toggle's markup key names it for the state it starts in; once it has
  // changed state only the state knows which word is right.
  retranslateToggle();
  // After translation, not before. adopt() moves `title` onto `data-tip` and
  // removes it, and running it first captured the untranslated literal that the
  // markup ships as a fallback — the Layers button showed "Layers" instead of
  // "Choose what the globe shows".
  window.Tips?.adopt();
  for (const el of document.querySelectorAll("[data-i18n-ph]")) {
    const v = T[el.dataset.i18nPh];
    if (v) el.placeholder = v;
  }
}

window.auralfm.onPrefs(async (p) => {
  applyPrefs(p);
  // Explore has the same control and no audio element of its own, so it writes
  // the preference and this window is what actually moves the sound.
  if ((p.audioOutput || "") !== outputId) { applyOutput(p.audioOutput || ""); renderOutputs(); }
  await applyPalette();
  await applyStrings();
  // Rows carry translated titles, so redraw whatever list is on screen.
  if (!qEl.value.trim()) showFavorites();
});

window.auralfm.onShown(() => {
  document.body.classList.remove("entering");
  void document.body.offsetWidth;          // force reflow so the animation restarts
  document.body.classList.add("entering");
  qEl.focus({ preventScroll: true });
});

// ── boot ─────────────────────────────────────────────────────────────────────
(async () => {
  applyPrefs((await window.auralfm.getPrefs()) || {});
  await applyPalette();
  await applyStrings();

  // Where the sound goes, restored before anything plays.
  const p0 = (await window.auralfm.getPrefs()) || {};
  await applyOutput(p0.audioOutput || "");
  await renderOutputs();
  $("outbtn").onclick = () => {
    if ($("outmenu").hidden) openOutMenu(); else closeOutMenu({ refocus: true });
  };
  document.addEventListener("pointerdown", (e) => {
    if ($("outmenu").hidden) return;
    if ($("outmenu").contains(e.target) || $("outbtn").contains(e.target)) return;
    closeOutMenu();
  }, true);
  document.addEventListener("keydown", (e) => {
    const menu = $("outmenu");
    if (menu.hidden) return;
    if (e.key === "Escape") { e.preventDefault(); closeOutMenu({ refocus: true }); return; }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = [...menu.querySelectorAll("button")];
    const at = items.indexOf(document.activeElement);
    items[e.key === "ArrowDown" ? (at + 1) % items.length
                                : (at <= 0 ? items.length - 1 : at - 1)]?.focus();
  });
  window.addEventListener("resize", () => { if (!$("outmenu").hidden) placeOutMenu(); });
  // A speaker connecting or disconnecting changes what is on offer.
  navigator.mediaDevices.addEventListener?.("devicechange", () => renderOutputs());

  const saved = await window.auralfm.getState();
  state = { favorites: [], vol: 0.8, ...(saved || {}) };
  if (!Array.isArray(state.favorites)) state.favorites = [];
  applyVolume(state.vol ?? 0.8);

  if (state.lastChannel) {
    current = state.lastChannel;
    nowName.textContent = current.title;
    toggle.disabled = false;
    setStatus("Press play");
  }
  showFavorites();

  const s = await window.auralfm.stats();
  if (!s.channels) {
    headEl.textContent = t("app.noCatalog", "No catalog");
    render([], { empty: "No station data yet.<br>Run <b>npm run crawl</b> to build it." });
  } else {
    qEl.placeholder = `Search ${s.channels.toLocaleString()} stations`;
  }
})();
