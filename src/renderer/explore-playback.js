/**
 * Explore, part 3 of 17: Playback as Explore sees it — observed, never performed here — plus outputs, the share sheet, transport and the station lock.
 *
 * Explore is one page split across plain scripts that share a global scope, in
 * the order explore.html loads them. Declarations live here; anything that runs
 * at load — listeners, IPC subscriptions, one-off calls — is in wirePlayback(),
 * which explore.js calls once every part has loaded. That keeps the original
 * single-file behaviour: no handler can fire into a part that has not loaded.
 */

// ── playback (observed, never performed here) ────────────────────────────────
/**
 * Point the on-air dot at the signal.
 *
 * dBm in, a 0..1 quality out. The window is −105 to −55: below −105 a broadcast
 * is in the noise and above −55 it is as good as it gets on shortwave, so
 * anything outside that range has nothing left to say. Clamped rather than
 * scaled, because the interesting resolution is all in the middle.
 *
 * The two outputs are deliberately linked. `--pulse-min` is how far the dot
 * falls — near 1 it barely moves. `--pulse-dur` is how fast — a fading signal
 * hurries. Together they read as "struggling" without anyone being told.
 */
function paintSignal(rssi) {
  const dot = $("dot");
  if (!dot) return;
  if (rssi == null || !Number.isFinite(rssi)) {
    // An internet stream. Steady, and no invented number.
    dot.classList.remove("sig");
    dot.style.removeProperty("--pulse-min");
    dot.style.removeProperty("--pulse-dur");
    return;
  }
  const q = Math.max(0, Math.min(1, (rssi + 105) / 50));
  dot.classList.add("sig");
  // Strong -> falls only to 0.88 and takes 2.6s. Weak -> falls to 0.12, 0.55s.
  dot.style.setProperty("--pulse-min", (0.12 + q * 0.76).toFixed(3));
  dot.style.setProperty("--pulse-dur", (0.55 + q * 2.05).toFixed(2) + "s");
  // The dot already shows signal strength by how it breathes; a number in a
  // help tag is a second, worse version of the same thing.
}

/**
 * The star beside the transport.
 *
 * Favouriting already existed in every list, but not where you are most likely
 * to want it: you hear something good, and the thing you are looking at is the
 * player, not the row you clicked three minutes ago.
 *
 * Hidden for shortwave, because a favourite is a station you can return to and a
 * band on one receiver is a place plus a frequency plus whether the ionosphere
 * is cooperating. Pretending otherwise would save something that does not come
 * back.
 */
function paintNowStar() {
  const b = $("nowStar");
  if (!b) return;
  // Paused counts: a station you stopped is still one you can save and share.
  const ch = inPlayer;
  // Sharing works for shortwave too — a frequency and a receiver is exactly the
  // kind of thing worth posting — so it follows `playing`, not `canFav`.
  const share = $("nowShare");
  if (share) share.hidden = !ch;
  const canFav = !!(ch && ch.id && !ch.sdr);
  b.hidden = !canFav;
  if (!canFav) return;
  const on = isFav(ch.id);
  Icons.set(b, on ? "starFill" : "star");
  b.classList.toggle("on", on);
  b.setAttribute("aria-pressed", String(on));
}

/**
 * Copy a card of what is playing.
 *
 * The image is what a paste into a post will take, so the image is what goes on
 * the clipboard. The `auralfm://` link is offered in the confirmation rather than
 * pushed there as well — putting a URL nobody asked for onto somebody's
 * clipboard is how a share button becomes a thing people stop trusting.
 */
/**
 * Where the sound comes out, from this window.
 *
 * The list is read here — any renderer can enumerate outputs — but the choice is
 * written as a preference rather than applied, because the audio element lives
 * in the menu bar panel. One place makes sound; this is a remote control for it.
 */
/**
 * Where the sound comes out.
 *
 * One button that opens a menu, rather than a button beside a menu that is
 * always open. The permanent picker sat in the transport reading "System
 * output" — a label for a thing nobody is changing, in the one bar that also
 * carries live prices and has nowhere to put them when it runs out of room.
 *
 * The device list is read fresh each time it opens, because between one press
 * and the next somebody's headphones can arrive or leave, and a cached list
 * would offer a speaker that is not there.
 */
let outDevices = [];

async function readOutputs() {
  try {
    const all = await navigator.mediaDevices.enumerateDevices();
    return all.filter((d) => d.kind === "audiooutput" && !/^default$/i.test(d.deviceId));
  } catch { return []; }
}

async function renderOutputs() {
  const wrap = $("outwrap");
  if (!wrap) return;
  outDevices = await readOutputs();
  /**
   * The button stays put.
   *
   * It used to hide whenever fewer than two outputs were listed — inherited from
   * when this was a dropdown, where one option really is furniture. But macOS
   * reports `default` plus the built-in speakers and nothing else the moment a
   * bluetooth speaker disconnects, so that rule made the control vanish exactly
   * when somebody had just lost the device they were listening on, and reflowed
   * the transport bar while doing it.
   *
   * A control that comes and goes is worse than one with few options: you cannot
   * learn where it lives, and you go looking for it at the one moment you need
   * it. It hides only when there is genuinely nothing to show.
   */
  wrap.hidden = outDevices.length === 0;
  if (wrap.hidden) { closeOutMenu(); return; }
  const chosen = prefs?.audioOutput || "";
  paintOutputIcon(outDevices, chosen, !chosen || outDevices.some((d) => d.deviceId === chosen));
  if (!$("outmenu").hidden) paintOutMenu();
}

/**
 * Which mark sits on the output button, and why.
 *
 * Three states, and the third is the one worth having. A wireless speaker that
 * has wandered off is not the same as no preference — the app is playing out of
 * the laptop when you asked it not to, and silently falling back to the built-in
 * speakers is how somebody ends up broadcasting a shortwave station to a room
 * they thought was quiet.
 *
 * Bluetooth is detected from the device label, the only signal the web audio API
 * exposes — there is no "is this wireless" flag. macOS puts the transport in the
 * name for AirPods, Beats and most headsets; when it does not, this shows a
 * speaker, which is not wrong, only less specific. Guessing wireless from a name
 * that merely looks like a person's would be worse than saying nothing.
 */
let outputWasGone = false;

/**
 * One glyph: rings over a point (was a speaker, which read as volume).
 *
 * It briefly showed a bluetooth mark for wireless devices and a red warning mark
 * when the chosen one had gone. Both were wrong here. The warning fired on
 * launch, before the device list had finished enumerating, so the very first
 * thing the app said was that something had failed when nothing had — an alarm
 * that cries on startup is an alarm nobody reads. And detecting "wireless" from
 * a device *label* was always a guess dressed as a fact.
 *
 * The disappearance is still worth saying, so it is still said — in the log,
 * once, in words. It is just not a third icon on a button that has one job.
 */
function paintOutputIcon(devs, chosen, present) {
  const btn = $("outbtn");
  if (!btn) return;
  Icons.set(btn, "route");
  const dev = chosen ? devs.find((d) => d.deviceId === chosen) : null;
  btn.title = dev?.label || t("ctl.output", "Where the sound comes out");

  /**
   * Only once the device list is real.
   *
   * `present` is false both when the speaker has genuinely gone and when nothing
   * has been enumerated yet, and those are not the same thing. Requiring a
   * non-empty list is what stops a cold start from reporting a failure.
   */
  const gone = !!chosen && !present && devs.length > 0;
  if (gone !== outputWasGone) {
    outputWasGone = gone;
    if (gone) systemLine(t("ctl.outputGone", "The speaker you chose is not here — playing out of this Mac"));
  }
}

/**
 * The play button's glyph and its name, together.
 *
 * Flagged by a design review as announcing only "button", and confirmed in the
 * running app — this and the menu-bar panel's toggle and the mute button were
 * all nameless. Set in one place so the picture and the announcement cannot
 * disagree.
 */
function setPlayName(playing) {
  Icons.set($("play"), playing ? "pause" : "play");
  const label = playing ? t("ctl.pause", "Pause") : t("ctl.play", "Play");
  $("play").setAttribute("aria-label", label);
  $("play").title = label;
}

function paintOutMenu() {
  const menu = $("outmenu");
  const chosen = prefs?.audioOutput || "";
  menu.textContent = "";
  const add = (value, label) => {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("role", "option");
    b.setAttribute("aria-selected", String(value === chosen));
    const tick = document.createElement("span");
    tick.className = "tick";
    tick.textContent = "\u2713";
    tick.setAttribute("aria-hidden", "true");   // the name is the device, not "✓ device"
    const name = document.createElement("span");
    name.className = "devname";
    name.textContent = label;
    b.append(tick, name);
    b.onclick = () => {
      window.auralfm.setPrefs({ audioOutput: value });
      closeOutMenu();
    };
    menu.append(b);
  };
  add("", t("ctl.outputSystem", "System output"));
  for (const d of outDevices) add(d.deviceId, d.label || t("ctl.outputUnnamed", "Speaker"));
}

function placeOutMenu() {
  const btn = $("outbtn"), menu = $("outmenu");
  const r = btn.getBoundingClientRect();
  const m = menu.getBoundingClientRect();
  // Above the button, because the transport is at the bottom of the window and
  // a menu dropped downward would open off-screen.
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
  if (menu.hidden) return;
  menu.hidden = true;
  $("outbtn").setAttribute("aria-expanded", "false");
  if (refocus) $("outbtn").focus();
}

/**
 * Show the card before it goes anywhere.
 *
 * It used to be copied straight to the clipboard, which is indistinguishable
 * from nothing having happened — Melton pressed it and reported that the card
 * never came up, which was exactly right. Something you are about to publish
 * under your own name should be looked at first.
 */
let sheetPng = null;

// Everything under the sheet. aria-modal only tells a screen reader; Tab walked
// straight out of the card into the toolbar behind it.
const behindSheet = () => [document.querySelector(".toolbar"), document.querySelector(".cols"), $("now")];

/**
 * Draw the card for whatever is playing, and hand back the PNG.
 *
 * Separate from the sheet because the sheet is one way of offering it: on a
 * phone the card goes straight into the system's own share sheet (see
 * web/phone-bar.js), where copying and saving are the operating system's job
 * rather than four buttons of our own.
 */
async function buildCard() {
  const ch = inPlayer;
  if (!ch) return null;
  {
    const levels = await guard("cardLevels", () => window.auralfm.cardLevels(), null);
    /**
     * Find the coordinates if what is playing does not carry them.
     *
     * Favourites were saved as a name and a place-string with no point, so a
     * station played from favourites — which is most of them — produced a card
     * with a city printed on it and no globe. Melton's screenshot was exactly
     * that. The shape is fixed above, but 27 favourites were already on disk
     * and a stored file does not fix itself, so this looks the station up by id
     * rather than making people re-save anything.
     */
    let { lat, lon } = ch;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      const found = await guard("cardWhere", () => window.auralfm.stationById(ch.id), null);
      if (found) { lat = found.lat; lon = found.lon; }
    }
    /**
     * And if the station has left the catalogue, its city has not.
     *
     * A re-crawl drops stations that stopped answering, and a favourite saved
     * before that still plays from its stored stream — so the lookup by id comes
     * back empty and the card lost its globe ("Deeper Shades Of House", Los
     * Angeles). The place is on the favourite, and a place is enough to put the
     * Earth under the words.
     */
    if ((!Number.isFinite(lat) || !Number.isFinite(lon)) && ch.place) {
      const q = [ch.place, ch.country].filter(Boolean).join(" ");
      const hit = (await guard("cardPlace", () => window.auralfm.places(q, 1), null))?.places?.[0]
        || (await guard("cardPlace", () => window.auralfm.places(ch.place, 1), null))?.places?.[0];
      if (hit) { lat = hit.lat; lon = hit.lon; }
    }
    sheetPng = await window.Card.make({
      title: ch.title || "",
      place: ch.place || "",
      country: ch.country || "",
      sdr: !!ch.sdr,
      freq: tuneState?.freq ?? null,
      when: new Date(),
      lat: Number.isFinite(lat) ? lat : null,
      lon: Number.isFinite(lon) ? lon : null,
      // The same subsolar point the globe's terminator uses, so the card shows
      // the Earth as it was at the moment somebody was listening.
      sun: subsolarPoint(),
      levels,
      /**
       * What the code points at: the station itself, on listen.auralfm.xyz,
       * which opens it cued and paused (web/bridge.js, ?station=). A receiver
       * or a station you added yourself has no page there, so those reach the
       * globe instead.
       */
      qr: ch.sdr || String(ch.id || "").startsWith("my:") || !ch.id
        ? "https://listen.auralfm.xyz/"
        : `https://listen.auralfm.xyz/?station=${encodeURIComponent(ch.id)}`,
    });
    return sheetPng;
  }
}

async function openShareSheet() {
  if (!inPlayer) return;
  const sheet = $("sheet"), said = $("sheetsaid");
  said.textContent = "";
  $("sheetimg").removeAttribute("src");
  sheet.hidden = false;
  for (const el of behindSheet()) if (el) el.inert = true;
  $("sheetclose").focus();
  try {
    $("sheetimg").src = await buildCard();
    // No waveform is now the normal case, not a symptom of anything, so the
    // sheet no longer tells people to wait for sound that is already playing.
  } catch {
    said.textContent = t("ctl.shareFailed", "Could not make the card");
  }
}

function closeShareSheet() {
  $("sheet").hidden = true;
  for (const el of behindSheet()) if (el) el.inert = false;
  sheetPng = null;
  $("nowShare")?.focus();
}

let preMute = 0.8;
function paintVolume(v) {
  $("vol").value = v;
  // The filled part of the track (explore.html, #vol) is drawn from this.
  $("vol").style.setProperty("--vol", `${Math.round(v * 100)}%`);
  Icons.set($("mute"), v === 0 ? "volumeOff" : v < 0.5 ? "volumeLow" : "volumeHigh");
  // Muted or not is the whole meaning of this control, and it was carried by the
  // glyph alone — which the design system already forbids in words.
  const mlabel = v === 0 ? t("ctl.unmute", "Unmute") : t("ctl.mute", "Mute");
  $("mute").setAttribute("aria-label", mlabel);
  $("mute").title = mlabel;
}

// ── station lock ─────────────────────────────────────────────────────────────
/**
 * Lock keeps what you're hearing fixed while you wander the globe.
 *
 * It blocks *incidental* changes only — clicking a dot, or the list following
 * the map. Explicitly clicking a station name still plays it, because that is an
 * unambiguous "play this", and it re-locks onto the new station rather than
 * silently unlocking.
 */
let locked = false;

function setLocked(on) {
  locked = on;
  // Locking means the station owns everything again, including the room.
  syncChatView();
  const b = $("lock");
  b.setAttribute("aria-pressed", on);
  Icons.set(b, on ? "lock" : "unlock");
  b.title = on ? "Locked while you browse" : "Lock this station";
  window.auralfm.getState().then((st) => window.auralfm.setState({ ...(st || {}), locked: on }));
}

function wirePlayback() {
  window.auralfm.onPlayerState((s) => {
    paintSignal(s?.rssi);
    /**
     * When the dial goes away.
     *
     * Not simply "whenever the state is not a receiver" — that was the first
     * version and it hid the dial instantly, because the popover publishes a
     * cleared state while it is still connecting. The dial appeared and vanished
     * before the first audio frame.
     *
     * The second attempt keyed on `playing`, which is worse in a quieter way: a
     * weak receiver reports not-playing while the session is perfectly alive, so
     * the dial vanished exactly when someone would reach for it.
     *
     * The signal that actually means "this session is over" is the channel no
     * longer being a receiver — after one has been seen.
     */
    if (tuneState) {
      if (s.channel?.sdr) tuneState.wasLive = true;
      else if (tuneState.wasLive) tunerStop();
    }
    // Pausing is not the same as leaving, but holding a receiver while paused is
    // the same as squatting it. The Kiwi's own limit would free the slot after
    // thirty minutes; for those thirty minutes someone else is told the receiver
    // is full while we sit on it playing nothing.
    //
    // A grace period rather than an instant release, because reconnecting is also
    // load and a quick pause-and-resume should not cost the operator a second
    // handshake. Ninety seconds is long enough to answer the door.
    if (tuneState && s.channel?.sdr) {
      if (s.playing) { clearTimeout(idleRelease); idleRelease = null; }
      else if (!idleRelease) {
        idleRelease = setTimeout(() => {
          idleRelease = null;
          if (!playing) tunerStop();   // still paused — give the slot back
        }, 90_000);
      }
    }
    playing = s.playing ? s.channel : null;
    inPlayer = s.channel || null;
    document.body.classList.toggle("playing", !!s.playing);
    const bar = $("now");
    if (!s.channel) {
      bar.hidden = true;
      clearPending();
      loadNews(null);
    } else {
      bar.hidden = false;
      $("nowName").textContent = s.channel.title;
      $("nowStatus").textContent = s.status || "";
      $("nowStatus").classList.toggle("err", !!s.error);
      const spoken = [s.channel.title, s.status].filter(Boolean).join(", ");
      if ($("nowSpoken").textContent !== spoken) $("nowSpoken").textContent = spoken;
      // Pending is over the moment there is an answer, either way.
      if (s.playing || s.error) clearPending(); else markPending(s.channel.id);
      $("dot").style.display = s.playing ? "" : "none";
      // Glyph and name in one call: a pause glyph announcing "Play" is worse than
      // no name at all, because it is confidently wrong.
      setPlayName(s.playing);
      if (typeof s.volume === "number") paintVolume(s.volume);
      // Headlines from wherever the station is broadcasting from. loadNews
      // repaints the panel itself when the country changes; repainting here
      // too did it on every status message — buffering, metadata, volume —
      // flashing the list back to placeholders and asking again each time.
      // Paused keeps its country: a station you stopped is still "Now playing".
      loadNews(s.channel.country || null);
    }
    for (const el of stationListEl.children) {
      if (!el.dataset?.id) continue;
      el.setAttribute("aria-current", playing?.id === el.dataset.id);
    }
    paintNowStar();
    syncChat(prefs);          // presence follows what is playing
    // Tuning across the world moves us to a different cell; re-read it rather than
    // keep counting against the last one.
    window.auralfm.presenceStats()
      .then((st) => { myCell = st?.cell || null; paintChatHead(); paintComposer(); })
      .catch(() => { paintChatHead(); paintComposer(); });
  });

  $("nowStar").onclick = async () => {
    if (!inPlayer || !inPlayer.id || inPlayer.sdr) return;
    await toggleFav(inPlayer);          // it reloads `favorites` from disk; paint after
    paintNowStar();
  };

  $("outbtn").onclick = () => {
    if ($("outmenu").hidden) openOutMenu(); else closeOutMenu({ refocus: true });
  };

  // Anywhere else closes it, including on the button itself — that click is
  // handled above and must not immediately reopen what it just closed.
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
    const next = e.key === "ArrowDown"
      ? (at + 1) % items.length
      : (at <= 0 ? items.length - 1 : at - 1);
    items[next]?.focus();
  });

  // A menu placed from a rectangle has to be replaced when the rectangle moves.
  window.addEventListener("resize", () => { if (!$("outmenu").hidden) placeOutMenu(); });

  navigator.mediaDevices.addEventListener?.("devicechange", () => renderOutputs());

  $("nowShare").onclick = openShareSheet;
  $("sheetclose").onclick = closeShareSheet;
  $("sheet").addEventListener("click", (e) => { if (e.target === $("sheet")) closeShareSheet(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("sheet").hidden) { e.preventDefault(); closeShareSheet(); }
  }, true);

  $("sheetcopy").onclick = async () => {
    if (!sheetPng) return;
    const ok = await guard("cardCopy", () => window.auralfm.cardCopy(sheetPng), false);
    $("sheetsaid").textContent = ok
      ? t("ctl.shareDone", "Copied — paste it into a post")
      : t("ctl.shareFailed", "Could not copy the card");
  };
  $("sheetsave").onclick = async () => {
    if (!sheetPng) return;
    const where = await guard("cardSave", () => window.auralfm.cardSave(sheetPng), null);
    // A cancelled save is a decision, not a failure, and should not be reported
    // as one.
    if (where) $("sheetsaid").textContent = t("ctl.savedTo", "Saved");
  };
  $("sheetlink").onclick = async () => {
    const link = await guard("cardLink", () => window.auralfm.cardLink(playing?.title), null);
    $("sheetsaid").textContent = link
      ? t("ctl.linkCopied", "Link copied — it opens AuralFM for anyone who has it")
      : t("ctl.shareFailed", "Could not copy the link");
  };


  // ── transport ────────────────────────────────────────────────────────────────
  // Explore has no audio element — these drive the one player in the popover, so
  // there is still exactly one stream no matter which window you touch.
  $("play").onclick = () => window.auralfm.transport({ action: "toggle" });
  $("vol").oninput = () => {
    const v = +$("vol").value;
    paintVolume(v);
    window.auralfm.transport({ action: "volume", value: v });
  };
  $("mute").onclick = () => {
    const cur = +$("vol").value;
    const next = cur > 0 ? 0 : (preMute || 0.8);
    if (cur > 0) preMute = cur;
    paintVolume(next);
    window.auralfm.transport({ action: "volume", value: next });
  };
  $("lock").onclick = () => { setLocked(!locked); window.Tip?.donate("lockUsed"); };
}
