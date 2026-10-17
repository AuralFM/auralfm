/**
 * Your show: the studio. A prototype (26 Sept 2026).
 *
 * "Your own show", inside the app on all three platforms —
 * the desktop app, the web app and the iPhone app — never a separate program.
 * This is the studio's shape and its sound, working end to end on this
 * device: a microphone with its level, a track from the computer under it that
 * dips while you talk, your own ears on it if you want them, the show's name,
 * its vibe and the town it goes out from, and the two states a show has —
 * rehearsing (only you hear it) and live.
 *
 * What it does not do yet is send the sound anywhere. "Go live" says so, in
 * the panel and in the player, and marks your town on the globe the way a live
 * show will be marked. The mix is already one MediaStream (`mixStream`), which
 * is the thing a transport takes: WebRTC to listeners over Nostr signalling, or
 * an Icecast mount from the desktop (the plan: vault YOUR-OWN-SHOW.md).
 *
 * The desktop app's alone: Your show is a feature of the paid Mac app, so the
 * web build does not carry this file (scripts/build-web.mjs, DESKTOP_ONLY).
 * Until the release, only development and beta builds show it. (A page opened
 * with ?studio showed it on the web until 5 Oct 2026; a preview on this machine
 * did until 17 Oct 2026.)
 */
{
  const $s = (id) => document.getElementById(id);
  const btn = $s("studioBtn"), panel = $s("studiopanel"), body = $s("studiobody");
  const KEY = "auralfm.studio";
  const tt = (k, f) => (typeof t === "function" ? t(k, f) : f);

  // ── who may see it ───────────────────────────────────────────────────────
  async function allowed() {
    try {
      /**
       * The desktop beta only: the ?studio link on the web was too unfinished
       * to hand out; it is tested on the desktop until it is settled. A page opened with ?studio used to switch it
       * on and remember that in this browser; the memory is cleared here so a
       * browser that tried it once does not keep showing it.
       */
      try { localStorage.removeItem(`${KEY}.labs`); } catch {}
      // The desktop: a development build, or a beta build (npm run dist:beta)
      // — the private beta is where the studio is tried first. A release has no
      // channel and does not show it.
      if (location.protocol === "file:") { const v = await window.auralfm.version?.(); return !!(v?.dev || v?.channel); }
    } catch {}
    return false;
  }

  // ── what the show is (kept on this device) ────────────────────────────────
  const saved = (() => { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; } })();
  const show = {
    title: saved.title || "", about: saved.about || "", vibe: saved.vibe || "", explicit: !!saved.explicit,
    deviceId: saved.deviceId || "", lineId: saved.lineId || "", micVol: saved.micVol ?? 1, musicVol: saved.musicVol ?? 0.6,
    xfade: saved.xfade ?? 4, repeat: saved.repeat ?? true,
    duck: saved.duck ?? true, monitor: false, place: null, rights: false, adult: false,
  };
  const keep = () => {
    const { title, about, vibe, explicit, deviceId, lineId, micVol, musicVol, duck, xfade, repeat } = show;
    try { localStorage.setItem(KEY, JSON.stringify({ title, about, vibe, explicit, deviceId, lineId, micVol, musicVol, duck, xfade, repeat })); } catch {}
  };
  let phase = "off", startedAt = 0, clock = 0;

  // ── the sound ────────────────────────────────────────────────────────────
  // mic → micGain ─┬→ mix → mixAn → mixStream (what a transport will send)
  //                └→ micMon → speakers, only with "Hear yourself"
  // track → music ─┬→ mix
  //                └→ speakers, always: the host hears the music they play
  // input → line ───→ mix   (an interface, a DJ program, this computer's sound:
  //                          heard at its source, so never played back here)
  let ctx = null, micStream = null, micSrc = null, micCut = null, micGain = null, micAn = null, micMon = null;
  let lineStream = null, lineSrc = null, lineGain = null, lineAn = null, lineName = "", lineKind = "";
  let musicGain = null, musicAn = null, mix = null, mixAn = null, mixDest = null;
  let raf = 0, micError = "";
  const levelOf = (an, buf) => {
    an.getFloatTimeDomainData(buf);
    let sum = 0; for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    return Math.min(1, Math.sqrt(sum / buf.length) * 3.2);
  };
  function graph() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: "interactive" });
    /**
     * Headphones changing mode (a Bluetooth set going to call quality when its
     * microphone opens, or back) can stop the context under us. It resumes
     * itself, rather than leaving a panel with live meters and no sound.
     */
    ctx.onstatechange = () => { if (ctx.state !== "running" && ctx.state !== "closed" && phase !== "off") ctx.resume().catch(() => {}); };
    mix = ctx.createGain();
    mixAn = ctx.createAnalyser(); mixAn.fftSize = 1024;
    mixDest = ctx.createMediaStreamDestination();
    mix.connect(mixAn); mix.connect(mixDest);
    micGain = ctx.createGain(); micGain.gain.value = show.micVol;
    /**
     * A low cut on the voice, as on any broadcast desk: nothing under 80 Hz.
     * Mains hum (50 or 60 Hz, from a laptop on its charger, a USB interface, a
     * cable near a power lead) and handling noise live down there, and a voice
     * has nothing there worth keeping. The studio had none, and hosts heard a
     * hum from the first version on.
     */
    micCut = ctx.createBiquadFilter(); micCut.type = "highpass"; micCut.frequency.value = 80; micCut.Q.value = 0.707;
    micCut.connect(micGain);
    micAn = ctx.createAnalyser(); micAn.fftSize = 1024;
    micGain.connect(micAn); micGain.connect(mix);
    musicGain = ctx.createGain(); musicGain.gain.value = show.musicVol;
    musicAn = ctx.createAnalyser(); musicAn.fftSize = 1024;
    musicGain.connect(musicAn); musicGain.connect(mix);
    /**
     * What the host hears. The music always: a track that played into the show
     * and not into the room was a track that seemed never to load, because only "Hear yourself" sent anything to the speakers. Your own
     * voice only when you ask for it (micMon), since a microphone played back
     * through speakers howls.
     */
    musicGain.connect(ctx.destination);
    micMon = ctx.createGain(); micMon.gain.value = show.monitor ? 1 : 0;
    micGain.connect(micMon); micMon.connect(ctx.destination);
    // Music from an input (below). Into the show only: see openLine.
    lineGain = ctx.createGain(); lineGain.gain.value = show.musicVol;
    lineAn = ctx.createAnalyser(); lineAn.fftSize = 1024;
    lineGain.connect(lineAn); lineGain.connect(mix);
  }
  let asking = false;
  const getMic = (deviceId) => navigator.mediaDevices.getUserMedia({
    audio: { deviceId: deviceId ? { exact: deviceId } : undefined,
      echoCancellation: false, noiseSuppression: true, autoGainControl: false },
  });
  /**
   * What went wrong, in words someone can act on. It used to be "blocked" or
   * "No microphone was found" for everything, so a microphone busy in a call,
   * or headphones that had been unplugged since last time, read as having no
   * microphone at all (seen with a computer's built-in microphone and with
   * headphones).
   */
  const micTrouble = (name) =>
    name === "NotAllowedError" || name === "SecurityError" || name === "denied" || name === "restricted"
      ? tt("studio.micDenied", "The microphone is blocked. Allow AuralFM in your system's privacy settings.")
    : name === "NotFoundError" || name === "OverconstrainedError"
      ? tt("studio.micMissing", "No microphone found. Connect one, then try again.")
    : name === "NotReadableError" || name === "AbortError" || name === "TrackStartError"
      ? tt("studio.micBusy", "The microphone did not start. Close other apps that use it, or choose another.")
    : tt("studio.micFailed", "The microphone did not start. Try again, or choose another.");
  let micBlocked = false, micNote = "";
  async function openMic() {
    graph();
    await ctx.resume();
    micStream?.getTracks().forEach((tr) => tr.stop());
    micSrc?.disconnect();
    micError = ""; micNote = ""; micBlocked = false;
    // The system may take its time, or wait on a prompt the listener has not
    // seen: say so rather than sitting on a button that seems to do nothing.
    asking = true;
    const slow = setTimeout(() => { if (asking) { micError = tt("studio.micWaiting", "Waiting for permission. Look for your system's prompt."); paint(); } }, 2500);
    try {
      // The desktop asks macOS first (src/main/ipc-app.js): a microphone the
      // system has blocked otherwise opens as silence.
      const access = "micAccess" in window.auralfm ? await window.auralfm.micAccess() : null;
      if (access && access !== "granted") { const e = new Error(access); e.name = access; throw e; }
      try {
        micStream = await getMic(show.deviceId);
      } catch (e) {
        // The microphone chosen last time (headphones, an interface) is not
        // plugged in: use the system's own, and say so, rather than failing.
        if (!show.deviceId || !/^(OverconstrainedError|NotFoundError)$/.test(e?.name)) throw e;
        show.deviceId = ""; keep();
        micStream = await getMic("");
        micNote = tt("studio.micFellBack", "Your last microphone is not connected. This is the system default.");
      }
      micSrc = ctx.createMediaStreamSource(micStream);
      micSrc.connect(micCut);
      /**
       * A microphone can go away mid-show: headphones taken off or out of
       * range, a cable pulled. Its track ends and the stream carries silence,
       * while the panel went on showing it as on. Now the panel says so.
       */
      const mt = micStream.getAudioTracks()[0];
      if (mt) mt.onended = () => {
        if (micStream?.getAudioTracks()[0] !== mt) return;
        micStream = null;
        try { micSrc?.disconnect(); } catch {}
        micError = tt("studio.micEnded", "The microphone stopped. Turn it on again, or choose another.");
        listDevices().then(paint);
      };
    } catch (e) {
      micStream = null;
      micBlocked = /^(NotAllowedError|SecurityError|denied|restricted)$/.test(e?.name);
      micError = micTrouble(e?.name);
    } finally { asking = false; clearTimeout(slow); }
    await listDevices();
    paint();
    meters();
  }
  // Headphones plugged in or out while the studio is open: the list follows.
  navigator.mediaDevices?.addEventListener?.("devicechange", async () => { await listDevices(); paint(); });

  // ── music from an input, or from this computer ─────────────────────────────
  /**
   * The lesson from Mixcloud (vault: MIXCLOUD-STUDY-AND-THE-SHOW.md): a DJ does
   * not play music inside the broadcaster. They mix on decks or in a program
   * they already own, and the broadcaster takes that one sound. So the show's
   * music can be an input: an audio interface, a mixer or a DJ controller, or
   * a loopback device that carries this computer's own sound; and, where the
   * system allows it, this computer's sound taken directly (openComputer).
   *
   * Two things differ from the microphone, and both are the point:
   *
   *   - It is sent as it arrives, in stereo. The microphone's noise
   *     suppression is built for a voice and chews music to pieces.
   *   - It is never played back here. The host already hears it at its source
   *     (their mixer, their headphones, this computer's speakers), and a
   *     loopback device carries whatever this computer plays: play it back and
   *     it comes round again as a howl.
   */
  const LOOPBACK = /blackhole|loopback|soundflower|vb-?cable|stereo mix|background music/i;
  let lineNote = "", lineAsking = false;
  function closeLine() {
    lineStream?.getTracks().forEach((tr) => tr.stop());
    try { lineSrc?.disconnect(); } catch {}
    lineStream = null; lineSrc = null; lineName = ""; lineKind = "";
  }
  function useLine(stream, name, kind) {
    closeLine();
    lineStream = stream; lineName = name; lineKind = kind;
    lineSrc = ctx.createMediaStreamSource(stream);
    lineSrc.connect(lineGain);
    const at = stream.getAudioTracks()[0];
    if (at) at.onended = () => {
      if (lineStream !== stream) return;
      closeLine();
      lineNote = tt("studio.lineEnded", "The input stopped. Choose it again.");
      listDevices().then(paint);
    };
    meters();
  }
  async function openLine(deviceId) {
    lineNote = "";
    if (!deviceId) { closeLine(); show.lineId = ""; keep(); return paint(); }
    graph();
    await ctx.resume();
    try {
      const access = "micAccess" in window.auralfm ? await window.auralfm.micAccess() : null;
      if (access && access !== "granted") { const e = new Error(access); e.name = access; throw e; }
      const s = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId },
        echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 2 } } });
      await listDevices();
      useLine(s, devices.find((d) => d.deviceId === deviceId)?.label || tt("studio.lineInput", "An input"), "input");
      show.lineId = deviceId; keep();
    } catch (e) {
      closeLine();
      lineNote = /^(NotAllowedError|SecurityError|denied|restricted)$/.test(e?.name)
        ? tt("studio.micDenied", "The microphone is blocked. Allow AuralFM in your system's privacy settings.")
        : tt("studio.lineFailed", "The input did not start. Check the connection, then choose it again.");
    }
    paint();
  }
  /**
   * This computer's own sound: a DJ program, a browser tab, anything playing.
   *
   * Asked for the way a screen share is, because that is the only door the
   * system has: the picture is taken as small and as slow as it will go and
   * never looked at. Not every system gives sound through it (macOS asks for
   * its Screen & System Audio Recording permission; Safari gives none), so a
   * share that arrives silent, or does not arrive, says what to do instead.
   */
  const canComputer = () => !!navigator.mediaDevices?.getDisplayMedia && !matchMedia("(pointer: coarse)").matches;
  async function openComputer() {
    lineNote = "";
    graph();
    await ctx.resume();
    lineAsking = true; paint();
    let s = null;
    try {
      s = await Promise.race([
        navigator.mediaDevices.getDisplayMedia({ video: { width: 16, height: 16, frameRate: 1 },
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }),
        new Promise((_, no) => setTimeout(() => no(new Error("slow")), 60000)),
      ]);
    } catch { s = null; }
    lineAsking = false;
    const at = s?.getAudioTracks()[0];
    if (!at) {
      s?.getTracks().forEach((tr) => tr.stop());
      lineNote = "micAccess" in window.auralfm
        ? tt("studio.computerNoneApp", "No sound came through. Allow AuralFM in System Settings > Privacy & Security > Screen & System Audio Recording, then open AuralFM again. Or use a loopback device, such as BlackHole.")
        : tt("studio.computerNoneWeb", "No sound came with that. In Chrome or Edge, share a tab with its audio.");
      return paint();
    }
    // The picture rides along unseen; stopping it can end the sound with it.
    useLine(s, tt("studio.computer", "This computer's sound"), "computer");
    // A microphone played back through the speakers would come round again.
    if (show.monitor) setMonitor(false);
    paint();
  }

  function closeAudio() {
    cancelAnimationFrame(raf); raf = 0;
    micStream?.getTracks().forEach((tr) => tr.stop()); micStream = null;
    closeLine();
    stopTrack();
    // The names stay in the queue; the open files do not.
    dropPre(); { const old = deck; deck = null; closeDeck(old); }
    setMonitor(false);
  }
  function setMonitor(on) {
    show.monitor = on;
    if (micMon) micMon.gain.value = on ? 1 : 0;
  }
  // ── the queue ─────────────────────────────────────────────────────────────
  /**
   * The show's music, when it is played here: several tracks in order, each
   * fading into the next: one track under a microphone made playing music
   * hard work (the Mixcloud study's second step).
   *
   * Each track is streamed through its own element (studio-deck.js) and its own
   * gain, so two can sound at once for the length of a crossfade. Only the one
   * playing and, near its end, the one after it are open: a queue of forty
   * mixes is forty names, not forty files in memory.
   *
   * The fades are scheduled on the audio clock and the hand-over is driven by
   * the element's own timeupdate, not by animation frames: a show goes on with
   * the window behind another, and frames stop there.
   */
  let queue = [];            // [{ id, name, source, duration }], source a File/Blob or the desktop's own link address
  let deck = null;           // the track playing: { item, t, gain }
  let pre = null;            // the one after it, opened a few seconds early: { id, ready }
  let switching = false, queueSeq = 0;
  let trackLoading = false, trackNote = "";
  const curIndex = () => (deck ? queue.findIndex((q) => q.id === deck.item.id) : -1);
  const nextIndex = () => {
    const i = curIndex();
    if (i + 1 < queue.length) return i + 1;
    return show.repeat && queue.length ? 0 : -1;
  };
  const mmss = (sec) => (Number.isFinite(sec) && sec >= 0 ? `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}` : "–:––");
  // Equal power, so the two together stay as loud through the middle of a fade.
  const CURVE_IN = Float32Array.from({ length: 33 }, (_, k) => Math.sin((k / 32) * Math.PI / 2));
  const CURVE_OUT = Float32Array.from({ length: 33 }, (_, k) => Math.cos((k / 32) * Math.PI / 2));

  async function openDeck(item) {
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(musicGain);
    try {
      const t = await window.StudioDeck.load(ctx, gain, item.source, item.name);
      if (Number.isFinite(t.duration)) item.duration = t.duration;
      return { item, t, gain };
    } catch (e) { try { gain.disconnect(); } catch {} throw e; }
  }
  function closeDeck(d, after = 0) {
    if (!d) return;
    const end = () => { d.t.el.ontimeupdate = d.t.el.onended = null; d.t.release(); try { d.gain.disconnect(); } catch {} };
    after ? setTimeout(end, after * 1000 + 300) : end();
  }
  function dropPre() { const p = pre; pre = null; p?.ready.then((d) => closeDeck(d)).catch(() => {}); }
  /** The track's own clock: the time on the panel, the next one opened early, the hand-over. */
  function watch(d) {
    d.t.el.ontimeupdate = () => {
      if (deck !== d) return;
      const el = d.t.el, now = $s("stTime");
      if (now) now.textContent = `${mmss(el.currentTime)} / ${mmss(el.duration)}`;
      const left = el.duration - el.currentTime;
      const bar = $s("stNpBar"), rest = $s("stLeft");
      if (bar && Number.isFinite(el.duration) && el.duration > 0) bar.style.width = `${Math.min(100, (el.currentTime / el.duration) * 100)}%`;
      if (rest) rest.textContent = Number.isFinite(left) ? `−${mmss(left)}` : "";
      if (!Number.isFinite(left) || switching) return;
      const n = nextIndex();
      if (n < 0) return;
      const fade = fadeFor(d);
      if (left <= fade + 6 && (!pre || pre.id !== queue[n].id)) { dropPre(); const item = queue[n]; pre = { id: item.id, ready: openDeck(item) }; pre.ready.catch(() => {}); }
      if (left <= fade + 0.2) playAt(n, fade);
    };
    d.t.el.onended = () => {
      if (deck !== d || switching) return;
      const n = nextIndex();
      if (n >= 0) return playAt(n, 0);
      // The end of the queue: the deck is let go, so Play starts from the top.
      deck = null; closeDeck(d); paint();
    };
  }
  // Never longer than a third of the track: a twelve-second fade on a jingle would be all of it.
  const fadeFor = (d) => Math.max(0, Math.min(show.xfade, (Number.isFinite(d?.t.duration) ? d.t.duration : 600) / 3));
  /**
   * Take a gain from wherever it is to `to`, along an equal-power curve.
   *
   * A gain may be in the middle of another fade when this is asked (Next,
   * pressed twice): the fade under way is held where it has got to and the new
   * one starts from there. Scheduling a curve over one still running throws,
   * and a throw here once left the queue refusing every press after it.
   */
  function fadeTo(gain, to, at, dur) {
    const g = gain.gain;
    try { g.cancelAndHoldAtTime(at); } catch { try { g.cancelScheduledValues(at); } catch {} }
    const from = g.value;
    try {
      g.setValueCurveAtTime(to ? CURVE_IN.map((v) => from + (1 - from) * v) : CURVE_OUT.map((v) => from * v), at, dur);
    } catch {
      try { g.cancelScheduledValues(at); g.setValueAtTime(from, at); g.linearRampToValueAtTime(to, at + dur); } catch { g.value = to; }
    }
  }
  /** Go to track i, fading the one playing into it over `fade` seconds. */
  async function playAt(i, fade = fadeFor(deck)) {
    const item = queue[i];
    if (!item || switching) return;
    switching = true;
    try {
      graph();
      await ctx.resume().catch(() => {});
      const old = deck;
      let next = null;
      try {
        next = pre && pre.id === item.id ? await pre.ready : await openDeck(item);
      } catch {
        // Left out of the queue rather than left to fail again at the next turn.
        queue = queue.filter((q) => q.id !== item.id);
        trackNote = `${item.name}: ${tt("studio.trackBad", "That file did not play. Use MP3, M4A, WAV, FLAC or OGG.")}`;
      }
      if (pre && pre.id === item.id) pre = null; else dropPre();
      if (!next) return;
      const audible = !!old && !old.t.el.paused;
      const dur = audible ? Math.max(0.03, fade) : 0.03;
      try { next.t.el.currentTime = 0; } catch {}
      await next.t.el.play().catch(() => {});
      // Both fades start from the same moment, and only once the new track is
      // really sounding: started before it, the new one arrived already up.
      const at = ctx.currentTime;
      fadeTo(next.gain, 1, at, dur);
      if (old) { fadeTo(old.gain, 0, at, dur); closeDeck(old, dur); }
      deck = next;
      watch(next);
      if (phase !== "off") logTrack(next.item);
    } finally {
      switching = false; trackLoading = false;
      meters();
      paint();
    }
  }
  const playing = () => !!deck && !deck.t.el.paused;
  function playTrack() {
    if (deck) deck.t.el.play().catch(() => {});
    else if (queue.length) playAt(0, 0);
  }
  function stopTrack() { deck?.t.el.pause(); }
  function nextTrack() { const n = nextIndex(); if (n >= 0) playAt(n, Math.min(fadeFor(deck), 3)); }
  function prevTrack() {
    // Three seconds in, "previous" means the start of this one, as on any player.
    if (deck && deck.t.el.currentTime > 3) { deck.t.el.currentTime = 0; return; }
    const i = curIndex();
    if (i > 0) playAt(i - 1, Math.min(fadeFor(deck), 3));
    else if (deck) deck.t.el.currentTime = 0;
  }
  function removeTrack(id) {
    const i = queue.findIndex((q) => q.id === id);
    if (i < 0) return;
    const was = deck?.item.id === id;
    const wasPlaying = playing();
    const after = queue[i + 1] || null;
    queue = queue.filter((q) => q.id !== id);
    if (pre?.id === id) dropPre();
    if (was) {
      const old = deck; deck = null; closeDeck(old);
      if (after && wasPlaying) return playAt(queue.indexOf(after), 0);
    }
    paint();
  }
  function moveTrack(id, by) {
    const i = queue.findIndex((q) => q.id === id), j = i + by;
    if (i < 0 || j < 0 || j >= queue.length) return;
    [queue[i], queue[j]] = [queue[j], queue[i]];
    dropPre();                      // what comes next may have changed
    paint();
    $s(`stMove${by < 0 ? "Up" : "Down"}-${id}`)?.focus?.();
  }
  /** Add tracks to the end. The first one plays as soon as it is in, unless a show is live. */
  async function addTracks(list) {
    graph();
    trackNote = "";
    // A file's name without its ending: ".wav" tells a host nothing and costs the row five letters.
    const bare = (n) => String(n || "").replace(/\.(mp3|m4a|aac|wav|flac|ogg|oga|opus|webm|aiff?|wma|mp2)$/i, "") || String(n || "");
    const added = [...list].map((src) => ({ id: `q${++queueSeq}`, name: src.meta ? src.name : bare(src.name), source: src.source, duration: src.meta?.duration ?? null, meta: src.meta || null }));
    if (!added.length) return;
    const idle = !deck && !switching;
    queue.push(...added);
    for (const item of added) window.StudioDeck.probe(item.source).then((d) => { if (d) { item.duration = d; const cell = $s(`stDur-${item.id}`); if (cell) cell.textContent = mmss(d); } });
    // It plays as soon as it is in, so adding a track is hearing it. On air it
    // waits for Play: a track that starts by itself in the middle of a show is
    // not a favour.
    if (idle && phase !== "live") { trackLoading = true; paint(); await playAt(queue.indexOf(added[0]), 0); }
    else paint();
  }
  const loadFiles = (files) => addTracks([...files].map((f) => ({ name: f.name, source: f })));
  async function loadBlob(name, source, meta = null) { const before = queue.length; await addTracks([{ name, source, meta }]); return queue.length > before; }
  function clearQueue() { dropPre(); const old = deck; deck = null; closeDeck(old); queue = []; trackNote = ""; }
  /**
   * A track from a link (desktop: main opens it and passes it through as it
   * arrives, src/main/ipc-app.js, so it plays from the first second). The
   * request was "a link to stream from any platform". Mixcloud,
   * SoundCloud, YouTube and the rest do not give other apps their audio and
   * their terms forbid taking it, so a link to one of them is answered with how
   * to use your own show from there instead; a direct link to an audio file you
   * host works.
   */
  const PLATFORM = /(^|\.)(mixcloud\.com|soundcloud\.com|youtube\.com|youtu\.be|spotify\.com|music\.apple\.com|bandcamp\.com|twitch\.tv|tidal\.com|deezer\.com|audiomack\.com)$/i;
  let linking = false, linkNote = "";
  async function loadLink(url) {
    url = String(url || "").trim();
    linkNote = "";
    let host = "";
    try { host = new URL(url).hostname; } catch { linkNote = tt("studio.linkBad", "That is not a link. It must start with https://."); return paint(); }
    if (PLATFORM.test(host)) {
      linkNote = tt("studio.linkPlatform", "Mixcloud, SoundCloud and YouTube do not let other apps play their audio. Add the file, or use a direct link to it.");
      return paint();
    }
    linking = true; paint();
    const r = await window.auralfm.studioOpenTrack(url);
    linking = false;
    if (r?.src) {
      linkNote = "";
      const n = queue.length;
      await loadBlob(r.name, r.src);
      if (queue.length <= n && trackNote) { trackNote = ""; linkNote = tt("studio.linkFailed", "The link did not open. Check it in a browser, then try again."); paint(); }
      return;
    }
    linkNote = {
      https: tt("studio.linkBad", "That is not a link. It must start with https://."),
      page: tt("studio.linkPage", "That link is a web page. Use the link to the audio file (.mp3, .m4a, .wav)."),
      stream: tt("studio.linkStream", "That is a live stream. Use a link to a recording."),
      big: tt("studio.linkBig", "That file is over 300 MB."),
      slow: tt("studio.linkSlow", "The link took too long. Try again, or add the file."),
    }[r?.error] || tt("studio.linkFailed", "The link did not open. Check it in a browser, then try again.");
    paint();
  }
  // Every frame: the meters, and the music dipping under the voice.
  function meters() {
    if (raf || !ctx) return;
    const buf = new Float32Array(1024);
    let talking = 0, wanted = null;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      if (panel.hidden && phase === "off") { cancelAnimationFrame(raf); raf = 0; return; }
      const m = micStream ? levelOf(micAn, buf) : 0, u = levelOf(musicAn, buf), o = levelOf(mixAn, buf);
      for (const [id, v] of [["meterMic", m], ["meterMusic", u], ["meterOut", o]]) {
        const el = $s(id); if (!el) continue;
        el.firstChild.style[el.classList.contains("v") ? "height" : "width"] = `${Math.round(v * 100)}%`;
        el.classList.toggle("hot", v > 0.92);
      }
      // Talk over: down to a quarter while the voice is up, back after a beat.
      // The music's level (and its mute) is applied here too, every frame: with
      // the dip off, moving the music fader used to change only the input.
      // Scheduled only when the level it wants changes. It was asked for again on
      // every frame, sixty times a second on two gains, and each request is an
      // event the audio thread keeps: the studio grew slower the longer it ran.
      if (musicGain) {
        talking = show.duck && m > 0.12 ? 18 : Math.max(0, talking - 1);
        const want = show.duck && talking ? musicLevel() * 0.25 : musicLevel();
        if (want !== wanted) {
          const at = ctx.currentTime, tc = want < (wanted ?? want) ? 0.05 : 0.4;
          for (const g of [musicGain.gain, lineGain.gain]) { try { g.cancelScheduledValues(at); } catch {} g.setTargetAtTime(want, at, tc); }
          wanted = want;
        }
      }
      { const el = $s("meterLine"); if (el) { const v = lineStream ? levelOf(lineAn, buf) : 0; el.firstChild.style[el.classList.contains("v") ? "height" : "width"] = `${Math.round(v * 100)}%`; el.classList.toggle("hot", v > 0.92); } }
      if (phase !== "off") {
        const s = Math.floor((Date.now() - startedAt) / 1000);
        const el = $s("airclock");
        // Plain text, not the split-flap: this runs every frame, and a flap
        // restarted sixty times a second never settles into numbers.
        if (el) el.textContent = `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
      }
    };
    frame();
  }
  let devices = [];
  async function listDevices() {
    try { devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audioinput"); } catch { devices = []; }
  }

  // ── on air ───────────────────────────────────────────────────────────────
  // Rehearsing: only you. Live: in the prototype, still only you — but the
  // panel, the player's status and the globe show what listeners will see.
  // A voice, or a track: a set with no talking is a show too.
  const hasSound = () => !!micStream || queue.length > 0 || !!lineStream;
  const ready = () => hasSound() && !!show.title.trim() && show.rights && show.adult && !!show.place;
  async function go(to) {
    if (to !== "off" && !hasSound()) await openMic();
    // Live or announced, a show needs every confirmation, the 18 and over and
    // the rights among them; only rehearsing, which nobody else hears, does not.
    if ((to === "live" || to === "planned") && !ready()) return paint();
    // One sound at a time: the station you were playing would go out under
    // your voice through the microphone.
    if (to !== "off" && document.body.classList.contains("playing")) window.auralfm.transport?.({ action: "toggle" });
    if (to !== "off" && phase === "off") { startedAt = Date.now(); tracklist = []; if (deck && playing()) setTimeout(() => logTrack(deck.item), 0); }
    // Leaving the air: the people listening are told, and let go.
    if (phase === "live" && to !== "live") { closeListeners(); heardNote = ""; }
    phase = to;
    window.auralfm.studioNowPlaying?.(phase === "live" ? (tracklist.at(-1)?.text || "") : "");
    window.AuralStudio.live = phase === "live" && show.place ? { lat: show.place.lat, lon: show.place.lon, title: show.title } : null;
    if (typeof paintRings === "function") paintRings();
    if (phase === "live" && show.place && typeof flyTo === "function") flyTo(show.place.lat, show.place.lon);
    // Confirmed again each time: the 18 and over and the rights are asked
    // before every show, not remembered from the last one (docs/TERMS.md).
    if (phase === "off") { stopTrack(); setMonitor(false); show.rights = false; show.adult = false; setup = false; stage = "go"; }
    else setup = false;
    paint();
    meters();
  }

  // ── the tracklist ────────────────────────────────────────────────────────
  /**
   * Every show keeps a tracklist: each track as it starts, and any record the
   * host adds by hand (a vinyl played through the microphone or an input). It
   * is the honest record of what was played, it credits the artists, as the
   * cleared music's licences require, and its latest line goes to listeners
   * with the show (presence-nostr.js, setNowPlaying).
   */
  let tracklist = [];          // [{ at (s from the start), text, licence, page }]
  const credit = (item) => item.meta ? `${item.meta.artist ? `${item.meta.artist} — ` : ""}${item.meta.title}` : item.name;
  function logTrack(item, manual = "") {
    const text = String(manual || credit(item) || "").replace(/\s+/g, " ").trim().slice(0, 100);
    if (!text) return;
    const last = tracklist.at(-1);
    if (last && last.text === text && !manual) return;
    const entry = { at: Math.floor((Date.now() - startedAt) / 1000), text, licence: item?.meta?.licence || "", page: item?.meta?.page || "" };
    tracklist.push(entry);
    if (phase === "live") window.auralfm.studioNowPlaying?.(entry.licence ? `${text} (${entry.licence})` : text);
    paint();
  }
  const hhmmss = (s) => `${Math.floor(s / 3600) ? `${Math.floor(s / 3600)}:` : ""}${String(Math.floor(s / 60) % 60).padStart(Math.floor(s / 3600) ? 2 : 1, "0")}:${String(s % 60).padStart(2, "0")}`;
  const tracklistText = () => tracklist.map((t) => [hhmmss(t.at), t.text, t.licence && `(${t.licence}${t.page ? `, ${t.page}` : ""})`].filter(Boolean).join("  ")).join("\n");

  // ── music cleared for shows ──────────────────────────────────────────────
  /**
   * The studio's music starts here, not with "add files": a host is somebody
   * who loves music, not a broadcaster with licences, so the first music on
   * offer is music whose licence already lets anyone play it on the air
   * (src/main/ipc-cleared.js: CC BY, CC BY-SA, CC0, the public-domain mark).
   * The host's own files come second, for music they made or hold the rights to.
   */
  let picking = false, cleared = { words: "", tracks: [], busy: false, note: "" }, adding1 = "";
  async function searchCleared(words) {
    cleared = { words, tracks: [], busy: true, note: "" }; paint();
    const r = await Promise.resolve(window.auralfm.studioCleared?.(words)).catch(() => null);
    cleared = { words, tracks: r?.tracks || [], busy: false,
      note: !r || r.failed ? tt("studio.clearedFailed", "The music libraries did not answer. Try again.") : !r.tracks.length ? tt("studio.clearedNone", "Nothing cleared for shows matched. Try another word: a genre, a place, a mood.") : "" };
    paint();
    $s("stClearedList")?.querySelector("button")?.focus({ preventScroll: true });
  }
  async function addCleared(t) {
    adding1 = t.src; paint();
    const r = await window.auralfm.studioOpenTrack?.(t.src);
    adding1 = "";
    if (r?.src) await loadBlob(`${t.artist ? `${t.artist} — ` : ""}${t.title}`, r.src, t);
    else { trackNote = tt("studio.linkFailed", "The link did not open. Check it in a browser, then try again."); paint(); }
  }
  function clearedPicker(pick) {
    const box = el("div", { class: "cleared" });
    const words = el("input", { type: "search", id: "stClearedWords", value: cleared.words, placeholder: tt("studio.clearedPh", "Dub, cumbia, ambient, Lagos…"),
      "aria-label": tt("studio.clearedLabel", "Search music cleared for shows") });
    box.append(el("form", { class: "srcrow linkrow", role: "search", onsubmit: (e) => { e.preventDefault(); if (words.value.trim()) searchCleared(words.value.trim()); } },
      words, el("button", { class: "linkbtn", type: "submit", disabled: cleared.busy }, cleared.busy ? tt("studio.clearedBusy", "Searching…") : tt("studio.clearedGo", "Search"))));
    if (cleared.note) box.append(el("p", { class: "fine", role: "status", text: cleared.note }));
    if (cleared.tracks.length) {
      const list = el("ul", { class: "clearedlist", id: "stClearedList", "aria-label": tt("studio.clearedResults", "Music cleared for shows") });
      for (const t of cleared.tracks) {
        const inQueue = queue.some((q) => q.meta?.src === t.src);
        list.append(el("li", {},
          el("div", { class: "clname" }, el("b", { text: t.title, dir: "auto" }), el("span", { text: [t.artist, t.licence, Number.isFinite(t.duration) ? mmss(t.duration) : ""].filter(Boolean).join(" · "), dir: "auto" })),
          el("button", { class: "linkbtn", type: "button", disabled: inQueue || adding1 === t.src, "aria-label": `${tt("studio.clearedAdd", "Add")}: ${t.title}`,
            onclick: () => addCleared(t) }, inQueue ? tt("studio.clearedIn", "Added") : adding1 === t.src ? tt("studio.linkFetching", "Fetching…") : tt("studio.clearedAdd", "Add"))));
      }
      box.append(list);
      box.append(el("p", { class: "fine", text: tt("studio.clearedCredit", "From ccMixter and the Internet Archive's netlabels. Each one is credited in your tracklist, as its license asks.") }));
    } else if (!cleared.note && !cleared.busy) {
      box.append(el("p", { class: "fine", text: tt("studio.clearedHint", "Music whose license lets anyone play it on a show, with credit. Search a genre, a place or a mood.") }));
    }
    const own = el("p", { class: "fine ownfiles" });
    own.append(el("button", { class: "linkbtn", type: "button", id: "stAddOwn", onclick: () => pick.click() }, tt("studio.addOwn", "Add your own files")), " ",
      tt("studio.ownNote", "Only music you made, or have the rights to play."));
    box.append(own);
    return box;
  }
  /** The tracklist on screen: what has played, when, and the way to copy it. */
  function tracklistBox() {
    const box = el("section", { class: "tracklist", "aria-label": tt("studio.tracklist", "Tracklist") });
    box.append(el("div", { class: "striphead" }, el("b", { text: tt("studio.tracklist", "Tracklist") }),
      tracklist.length ? el("button", { class: "linkbtn", type: "button", id: "stCopyList", onclick: async () => {
        try { await navigator.clipboard.writeText(tracklistText()); trackNote = tt("studio.tracklistCopied", "Tracklist copied."); }
        catch { trackNote = tt("studio.tracklistNoCopy", "The tracklist could not be copied."); }
        paint(); setTimeout(() => { if (trackNote) { trackNote = ""; paint(); } }, 3000);
      } }, tt("studio.tracklistCopy", "Copy")) : null));
    if (tracklist.length) {
      const ol = el("ol", { class: "tl" });
      for (const t of tracklist) ol.append(el("li", {}, el("span", { class: "time", text: hhmmss(t.at) }), el("span", { class: "tltext", text: t.text, dir: "auto" }),
        t.licence ? el("span", { class: "tllic", text: t.licence }) : null));
      box.append(ol);
    } else box.append(el("p", { class: "fine", text: tt("studio.tracklistEmpty", "Each track goes here as it starts. Listeners see the latest one.") }));
    const rec = el("input", { type: "text", id: "stRecord", maxlength: "100", placeholder: tt("studio.recordPh", "Artist — Title"),
      "aria-label": tt("studio.recordLabel", "Playing a record? Add it to the tracklist") });
    box.append(el("form", { class: "srcrow linkrow", onsubmit: (e) => { e.preventDefault(); const v = rec.value.trim(); if (v) { logTrack(null, v); } } },
      rec, el("button", { class: "linkbtn", type: "submit" }, tt("studio.recordAdd", "Add a record"))));
    return box;
  }

  // ── the panel ────────────────────────────────────────────────────────────
  const el = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) n.setAttribute(k, v === true ? "" : v);
    }
    n.append(...kids.filter(Boolean));
    return n;
  };
  const head = (text) => el("div", { class: "layhead", text });
  const toggleRow = (label, on, onClick, hint) => el("button", { class: "layrow", type: "button", "aria-pressed": String(on), onclick: onClick },
    el("span", { class: "laydot" }), el("span", { text: label }), hint ? el("small", { text: hint }) : null);
  const meter = (id) => el("div", { class: "meter", id, role: "presentation" }, el("b"));

  /**
   * Three stages, one at a time (vault: STUDIO-REDESIGN-2026-10.md). It was one
   * long form: Go live at the top and greyed out, waiting on a sound that was
   * four sections down, past the name and seventeen vibes, and the music had no
   * place of its own on the screen.
   *
   *   Sound      a desk: one strip per source (voice, music, an input), each
   *              with its level, and what is going out under them all.
   *   Your show  the name, a line about it, the vibe, the town.
   *   Go live    what is still missing, which is also why the button waits;
   *              Sound check (only you hear it) and Go live.
   *
   * The bar above the stages says where the show is: off air, in a sound
   * check, or live, with the clock, who is listening and the way off air.
   */
  // "audio/" and an asterisk, written as an escape: the audit's scanner reads a
  // slash and an asterisk as the start of a comment, whatever surrounds them.
  const AUDIO_FILES = "audio/\u002A,.mp3,.m4a,.aac,.wav,.flac,.ogg,.oga,.opus,.webm";
  const STAGES = ["sound", "show", "go"];
  let stage = "sound", adding = false, setup = false;
  const muted = { voice: false, music: false };
  const voiceGain = () => (muted.voice ? 0 : show.micVol);
  const musicLevel = () => (muted.music ? 0 : show.musicVol);
  const checks = () => [
    { id: "sound", ok: hasSound(), stage: "sound", text: tt("studio.chkSound", "Sound is going out"), todo: tt("studio.needMic", "Turn on the microphone, or add a track.") },
    { id: "name", ok: !!show.title.trim(), stage: "show", text: tt("studio.chkName", "The show has a name"), todo: tt("studio.needTitle", "Name your show.") },
    { id: "place", ok: !!show.place, stage: "show", text: tt("studio.chkPlace", "The show has a town"), todo: tt("studio.needPlace", "Choose a town.") },
    { id: "rights", ok: show.rights, toggle: () => { show.rights = !show.rights; }, text: tt("studio.rights", "Everything I play is mine, or I have the rights to play it") },
    { id: "adult", ok: show.adult, toggle: () => { show.adult = !show.adult; }, text: tt("studio.adult", "I am 18 or older") },
  ];
  const toDo = () => checks().filter((c) => !c.ok).length;
  const goStage = (s) => { stage = s; paint(); $s(`stTab-${s}`)?.focus({ preventScroll: true }); };
  const muteBtn = (key, name) => {
    const b = el("button", { class: "qbtn mute", type: "button", id: `stMute-${key}`, "aria-pressed": String(muted[key]),
      "aria-label": `${tt("studio.mute", "Mute")}: ${name}`, title: tt("studio.mute", "Mute"),
      onclick: () => {
        muted[key] = !muted[key];
        if (key === "voice" && micGain) micGain.gain.value = voiceGain();
        paint();
      } });
    // It was an empty button: there, and invisible.
    if (typeof Icons !== "undefined") Icons.set(b, muted[key] ? "volumeOff" : "volumeHigh");
    return b;
  };
  const strip = (cls, name, detail, after, ...kids) => el("section", { class: `strip ${cls}`, "aria-label": name },
    el("div", { class: "striphead" }, el("b", { text: name }), detail ? el("span", { class: "stripsub", text: detail, dir: "auto" }) : null, after),
    ...kids);
  const fader = (label, value, max, onInput) => el("input", { type: "range", min: "0", max: String(max), step: "0.01", value: String(value), "aria-label": label, oninput: onInput });

  function paint() {
    panel.dataset.phase = phase;
    // Live shows on the toolbar too, so a closed panel still says you are on air.
    btn.classList.toggle("onair", phase === "live");
    btn.setAttribute("aria-label", phase === "live" ? `${tt("studio.open", "Your show")}: ${tt("studio.live", "Live")}` : tt("studio.open", "Your show"));
    const wasFocus = document.activeElement?.id;
    body.textContent = "";
    const live = phase === "live";

    // ── where the show is ──
    const air = el("div", { class: "sec sec-air" });
    const label = live ? tt("studio.live", "Live") : phase === "rehearsal" ? tt("studio.soundCheck", "Sound check") : phase === "planned" ? tt("studio.planned", "Planned") : tt("studio.off", "Off air");
    const bar = el("div", { class: "air" },
      el("span", { class: "airpill", role: "status" }, el("i"), el("span", { text: label }), phase !== "off" ? el("span", { id: "airclock", text: "00:00:00" }) : null),
      live ? el("span", { class: "time", id: "stHeard", role: "status", text: `${heardNow()} ${tt("studio.listening", "listening")}` }) : null);
    if (phase !== "off") {
      const ends = el("div", { class: "btns airbtns" });
      bar.append(el("button", { class: "linkbtn setupbtn", type: "button", id: "stSetup", "aria-pressed": String(setup),
        onclick: () => { setup = !setup; paint(); } }, setup ? tt("studio.backConsole", "Back to the console") : tt("studio.showSetup", "Setup")));
      if (phase !== "live") ends.append(el("button", { class: "sheetbtn primary", type: "button", id: "stLive", "aria-describedby": "stWhy", onclick: () => (ready() ? go("live") : goStage("go")) }, tt("studio.goLive", "Go live")));
      ends.append(el("button", { class: `sheetbtn${live ? " onair" : ""}`, type: "button", id: "stEnd", onclick: () => go("off") },
        live ? tt("studio.end", "End the show") : phase === "planned" ? tt("studio.cancel", "Cancel announcement") : tt("studio.stopCheck", "End sound check")));
      air.append(bar, ends);
    } else air.append(bar);
    if (live && heardNote) air.append(el("p", { class: "fine", role: "status", text: heardNote }));
    if (phase !== "off") air.append(el("p", { class: "airnote", id: "stWhy", text:
      live ? tt("studio.liveNote", "You are live. Up to 12 listeners connect direct to this computer.")
      : phase === "planned" ? tt("studio.plannedPrototype", "Your town shows as coming up. Nobody is told yet.")
      : ready() ? tt("studio.checkNote", "Only you hear this. Use headphones and turn on Hear yourself.")
      : `${tt("studio.checkNote", "Only you hear this. Use headphones and turn on Hear yourself.")} ${tt("studio.checkLeft", "Before going live:")} ${checks().find((c) => !c.ok)?.todo || checks().find((c) => !c.ok)?.text || ""}` }));
    body.append(air);
    if (phase !== "off" && !setup) {
      paintConsole(body, live);
      if (wasFocus && $s(wasFocus)) $s(wasFocus).focus({ preventScroll: true });
      syncHost();
      return;
    }

    // ── the three stages ──
    const left = toDo();
    const names = { sound: tt("studio.stageSound", "Sound"), show: tt("studio.stageShow", "Your show"), go: tt("studio.goLive", "Go live") };
    const tabs = el("div", { class: "sttabs", role: "tablist", "aria-label": tt("studio.stages", "Your show, step by step") });
    for (const s of STAGES) {
      const on = stage === s;
      const done = s === "sound" ? hasSound() : s === "show" ? !!show.title.trim() && !!show.place : left === 0;
      tabs.append(el("button", { class: "sttab", type: "button", role: "tab", id: `stTab-${s}`, "aria-selected": String(on), "aria-controls": "stStage", tabindex: on ? "0" : "-1",
        onclick: () => goStage(s),
        onkeydown: (e) => {
          const i = STAGES.indexOf(s), j = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? STAGES.length - 1 : -2;
          if (j === -2) return;
          e.preventDefault(); goStage(STAGES[(j + STAGES.length) % STAGES.length]);
        } },
        el("span", { class: "stnum", "aria-hidden": "true", text: done ? "✓" : String(STAGES.indexOf(s) + 1) }), el("span", { text: names[s] }),
        s === "go" && left ? el("span", { class: "stleft", text: String(left), "aria-label": `, ${left} ${tt("studio.toDo", "to do")}` }) : null));
    }
    body.append(tabs);
    const pane = el("div", { class: `ststage st-${stage}`, id: "stStage", role: "tabpanel", "aria-labelledby": `stTab-${stage}` });
    body.append(pane);

    if (stage === "sound") paintSound(pane, live);
    else if (stage === "show") paintShow(pane, live);
    else paintGo(pane);

    if (wasFocus && $s(wasFocus)) $s(wasFocus).focus({ preventScroll: true });
    syncHost();
  }

  // ── on air: the console ──
  /**
   * Once a sound check or a show has started, the panel is a console, not the
   * setup: what is playing and what comes next, the transport, and the faders
   * side by side as on a mixer, with what is going out beside them. Hosts had
   * to go back to the first stage to find the controls (17 Oct 2026). Setup is
   * one press away, and comes back to the console.
   */
  function paintConsole(root, live) {
    const c = el("div", { class: "console" });
    root.append(c);

    // What is playing.
    const np = el("section", { class: "np", "aria-label": tt("studio.nowPlaying", "Now playing") });
    const pick = el("input", { type: "file", multiple: true, accept: AUDIO_FILES, id: "stFile", hidden: true,
      onchange: (e) => { const fs = [...(e.target.files || [])]; e.target.value = ""; if (fs.length) loadFiles(fs); } });
    np.append(pick);
    if (queue.length) {
      const d = deck, n = nextIndex();
      const at = d ? d.t.el.currentTime : 0, dur = d ? d.t.el.duration : NaN;
      np.append(
        el("div", { class: "nphead" }, el("span", { class: "nplabel", text: playing() ? tt("studio.playingNow", "Playing") : tt("studio.paused", "Paused") }),
          el("button", { class: "linkbtn", type: "button", id: "stAdd", "aria-expanded": String(picking), onclick: () => { picking = !picking; paint(); } }, picking ? tt("studio.close", "Close") : tt("studio.addMusic", "Add music"))),
        picking ? clearedPicker(pick) : null,
        el("div", { class: "npname", id: "stNpName", dir: "auto", text: d ? d.item.name : queue[0].name }),
        el("div", { class: "npbar", role: "presentation" }, el("b", { id: "stNpBar", style: `width:${Number.isFinite(dur) && dur > 0 ? Math.min(100, at / dur * 100) : 0}%` })),
        el("div", { class: "nptimes" }, el("span", { class: "time", id: "stTime", text: d ? `${mmss(at)} / ${mmss(dur)}` : "" }),
          el("span", { class: "time", id: "stLeft", text: d && Number.isFinite(dur) ? `−${mmss(dur - at)}` : "" })),
        el("div", { class: "nptransport" },
          el("button", { class: "tbtn", type: "button", id: "stPrev", disabled: !d, onclick: prevTrack, "aria-label": tt("studio.prev", "Previous"), title: tt("studio.prev", "Previous") }),
          el("button", { class: "tbtn big", type: "button", id: "stPlay", "aria-label": playing() ? tt("studio.pause", "Pause") : tt("studio.play", "Play"),
            onclick: async () => { await ctx.resume(); playing() ? stopTrack() : playTrack(); meters(); setTimeout(paint, 60); } }),
          el("button", { class: "tbtn", type: "button", id: "stNext", disabled: n < 0 || switching, onclick: nextTrack, "aria-label": tt("studio.next", "Next"), title: tt("studio.next", "Next") })),
        el("p", { class: "fine npnext", role: "status", text: !d ? "" : n >= 0 && queue[n].id === d.item.id ? tt("studio.repeatsOne", "Plays again when it ends") : n >= 0 ? `${tt("studio.upNext", "Next")}: ${queue[n].name}` : tt("studio.lastTrack", "Last track in the queue") }));
    } else {
      np.append(el("div", { class: "nphead" }, el("span", { class: "nplabel", text: tt("studio.clearedHead", "Music cleared for shows") })), clearedPicker(pick));
    }
    // The app's own icons: these characters draw as colour emoji on a Mac.
    if (typeof Icons !== "undefined") {
      for (const [id, name] of [["stPrev", "skip"], ["stPlay", playing() ? "pause" : "play"], ["stNext", "skip"]]) { const b = np.querySelector(`#${id}`); if (b) Icons.set(b, name); }
    }
    if (trackNote) np.append(el("p", { class: "fine", role: "alert", text: trackNote }));
    np.addEventListener("dragover", (e) => { if ([...(e.dataTransfer?.types || [])].includes("Files")) { e.preventDefault(); np.classList.add("over"); } });
    np.addEventListener("dragleave", (e) => { if (!np.contains(e.relatedTarget)) np.classList.remove("over"); });
    np.addEventListener("drop", (e) => {
      e.preventDefault(); np.classList.remove("over");
      const fs = [...(e.dataTransfer?.files || [])].filter((f) => /^audio\//.test(f.type) || /\.(mp3|m4a|aac|wav|flac|ogg|oga|opus|webm|aiff?)$/i.test(f.name));
      if (fs.length) loadFiles(fs); else { trackNote = tt("studio.dropNotAudio", "Those are not audio files."); paint(); }
    });
    c.append(np);

    // The mixer: one channel per source, and what goes out.
    const chan = (name, meterId, fade, mute, extra) => el("div", { class: "chan" },
      el("div", { class: "chanbody" }, el("div", { class: "meter v", id: meterId, role: "presentation" }, el("b")), fade),
      mute || el("span", { class: "mutegap", "aria-hidden": "true" }),
      el("span", { class: "channame", text: name }), extra);
    const vfader = (label, value, max, onInput) => el("input", { type: "range", class: "vfader", min: "0", max: String(max), step: "0.01", value: String(value), "aria-label": label, oninput: onInput });
    const mixer = el("section", { class: "mixer", "aria-label": tt("studio.mixer", "Mixer") });
    mixer.append(micStream
      ? chan(tt("studio.voice", "Voice"), "meterMic", vfader(tt("studio.voiceLevel", "Voice level"), show.micVol, 2, (e) => { show.micVol = +e.target.value; if (micGain) micGain.gain.value = voiceGain(); keep(); }), muteBtn("voice", tt("studio.voice", "Voice")))
      : el("div", { class: "chan off" }, el("button", { class: "sheetbtn", type: "button", id: "stMic", disabled: asking || live, onclick: openMic }, tt("studio.micShort", "Mic on")),
          el("span", { class: "channame", text: tt("studio.voice", "Voice") })));
    if (queue.length) mixer.append(chan(tt("studio.music", "Music"), "meterMusic", vfader(tt("studio.musicLevel", "Music level"), show.musicVol, 1, (e) => { show.musicVol = +e.target.value; keep(); }), muteBtn("music", tt("studio.music", "Music"))));
    if (lineStream) mixer.append(chan(lineKind === "computer" ? tt("studio.computerShort", "Computer") : tt("studio.lineShort", "Input"), "meterLine",
      !queue.length ? vfader(tt("studio.musicLevel", "Music level"), show.musicVol, 1, (e) => { show.musicVol = +e.target.value; keep(); }) : null, null));
    mixer.append(chan(tt("studio.out", "Going out"), "meterOut", null, null));
    c.append(mixer);
    if (micError) c.append(el("p", { class: "fine", role: "alert", text: micError }));
    c.append(el("div", { class: "consoletoggles" },
      toggleRow(tt("studio.monitor", "Hear yourself"), show.monitor, () => {
        if (!show.monitor && lineKind === "computer") { lineNote = tt("studio.monitorLoop", "Hear yourself is off with this computer's sound. Your voice would go out twice."); return paint(); }
        setMonitor(!show.monitor); paint(); }, tt("studio.monitorHint", "Headphones only")),
      toggleRow(tt("studio.duck", "Music dips when you talk"), show.duck, () => { show.duck = !show.duck; keep(); paint(); })));
    if (lineNote) c.append(el("p", { class: "fine", role: "alert", text: lineNote }));

    c.append(tracklistBox());
    // The queue, compact: press a name to go to it.
    if (queue.length > 1) {
      const on = deck?.item.id;
      const list = el("ol", { class: "queue", "aria-label": tt("studio.queue", "Queue") });
      queue.forEach((q, k) => list.append(el("li", { class: q.id === on ? "on" : "", "aria-current": q.id === on ? "true" : false },
        el("button", { class: "qname", type: "button", title: q.name, onclick: () => { if (q.id !== on) playAt(queue.indexOf(q), Math.min(fadeFor(deck), 3)); },
          "aria-label": `${tt("studio.playTrack", "Play")} ${q.name}` }, el("span", { text: q.name, dir: "auto" })),
        el("span", { class: "qdur", id: `stDur-${q.id}`, text: mmss(q.duration) }),
        el("button", { class: "qbtn", type: "button", id: `stMoveUp-${q.id}`, disabled: k === 0, onclick: () => moveTrack(q.id, -1),
          "aria-label": `${tt("studio.moveUp", "Move up")}: ${q.name}`, title: tt("studio.moveUp", "Move up") }, "↑"),
        el("button", { class: "qbtn", type: "button", onclick: () => removeTrack(q.id),
          "aria-label": `${tt("studio.remove", "Remove")}: ${q.name}`, title: tt("studio.remove", "Remove") }, "×"))));
      c.append(el("div", { class: "consolequeue" }, el("div", { class: "layhead", text: tt("studio.queue", "Queue") }), list));
    }
    meters();
  }

  // ── stage 1: the desk ──
  function paintSound(pane, live) {
    const desk = el("div", { class: "desk" });
    pane.append(desk);

    // Voice: the microphone.
    if (!micStream) {
      desk.append(strip("strip-voice", tt("studio.voice", "Voice"), "", null,
        el("button", { class: "sheetbtn", type: "button", id: "stMic", disabled: asking, onclick: openMic },
          asking ? tt("studio.micAsking", "Asking for the microphone…") : tt("studio.micOn", "Turn on the microphone")),
        micError ? el("p", { class: "fine", role: "alert", text: micError }) : null,
        micBlocked && "micSettings" in window.auralfm ? el("button", { class: "linkbtn", type: "button", onclick: () => window.auralfm.micSettings() }, tt("studio.micSettings", "Open microphone settings")) : null));
    } else {
      const using = devices.find((d) => d.deviceId === micStream.getAudioTracks()[0]?.getSettings().deviceId)?.label || micStream.getAudioTracks()[0]?.label || "";
      const kids = [];
      if (micNote) kids.push(el("p", { class: "fine", role: "status", text: micNote }));
      if (devices.length > 1) {
        const sel = el("select", { id: "stDevice", "aria-label": tt("studio.micPick", "Microphone"), disabled: live,
          onchange: (e) => { show.deviceId = e.target.value; keep(); openMic(); } });
        for (const d of devices) sel.append(el("option", { value: d.deviceId, selected: d.deviceId === (show.deviceId || micStream.getAudioTracks()[0]?.getSettings().deviceId) }, d.label || tt("studio.micPick", "Microphone")));
        kids.push(sel);
      }
      // A headset's microphone switches it to call quality while it is on.
      if (/airpods|bluetooth|headset|buds|beats|hands-free/i.test(using)) {
        kids.push(el("p", { class: "fine", text: tt("studio.micHeadset", "Wireless headphones drop to call quality when their microphone is on. Use the computer's microphone.") }));
        /**
         * One tap to do what that says. With AirPods Max the headset's own
         * microphone is the system default once they connect, so every show
         * started on it — and at call quality, the
         * headphones dropped the station's sound to match.
         */
        const builtIn = devices.find((d) => d.deviceId !== "default" && /macbook|built-in|internal|imac|studio display/i.test(d.label));
        if (builtIn) kids.push(el("button", { class: "linkbtn", type: "button", id: "stBuiltIn", disabled: live,
          onclick: () => { show.deviceId = builtIn.deviceId; keep(); openMic(); } }, tt("studio.micUseBuiltIn", "Use the computer's microphone")));
      }
      kids.push(el("div", { class: "level" }, meter("meterMic"),
        fader(tt("studio.voiceLevel", "Voice level"), show.micVol, 2, (e) => { show.micVol = +e.target.value; if (micGain) micGain.gain.value = voiceGain(); keep(); })));
      desk.append(strip("strip-voice", tt("studio.voice", "Voice"), devices.length > 1 ? "" : using, muteBtn("voice", tt("studio.voice", "Voice")), ...kids));
    }

    // Music: the deck. Files are dropped on it, or added with the button.
    const pick = el("input", { type: "file", multiple: true, accept: AUDIO_FILES, id: "stFile", hidden: true,
      onchange: (e) => { const fs = [...(e.target.files || [])]; e.target.value = ""; if (fs.length) loadFiles(fs); } });
    const total = queue.reduce((s, q) => s + (Number.isFinite(q.duration) ? q.duration : 0), 0);
    const count = queue.length === 1 ? tt("studio.track", "track") : tt("studio.tracks", "tracks");
    const sub = queue.length ? [`${queue.length} ${count}`, total ? mmss(total) : ""].filter(Boolean).join(" · ") : "";
    const music = strip("strip-music", tt("studio.music", "Music"), sub, queue.length ? muteBtn("music", tt("studio.music", "Music")) : null, pick);
    if (!queue.length) {
      music.append(el("p", { class: "fine cleartitle", text: trackLoading ? tt("studio.trackLoading", "Opening the track…") : tt("studio.clearedHead", "Music cleared for shows") }), clearedPicker(pick));
    } else {
      const on = deck?.item.id;
      music.append(el("div", { class: "deck transport" },
        el("button", { class: "sheetbtn", type: "button", id: "stPlay", onclick: async () => { await ctx.resume(); playing() ? stopTrack() : playTrack(); meters(); setTimeout(paint, 60); } },
          playing() ? tt("studio.pause", "Pause") : tt("studio.play", "Play")),
        el("button", { class: "linkbtn", type: "button", id: "stPrev", disabled: !deck, onclick: prevTrack }, tt("studio.prev", "Previous")),
        el("button", { class: "linkbtn", type: "button", id: "stNext", disabled: nextIndex() < 0 || switching, onclick: nextTrack }, tt("studio.next", "Next")),
        el("span", { class: "time", id: "stTime", text: deck ? `${mmss(deck.t.el.currentTime)} / ${mmss(deck.t.el.duration)}` : "" })));
      const list = el("ol", { class: "queue", "aria-label": tt("studio.queue", "Queue") });
      queue.forEach((q, k) => list.append(el("li", { class: q.id === on ? "on" : "", "aria-current": q.id === on ? "true" : false },
        el("button", { class: "qname", type: "button", title: q.name, onclick: () => { if (q.id !== on) playAt(queue.indexOf(q), Math.min(fadeFor(deck), 3)); },
          "aria-label": `${tt("studio.playTrack", "Play")} ${q.name}` }, el("span", { text: q.name, dir: "auto" })),
        el("span", { class: "qdur", id: `stDur-${q.id}`, text: mmss(q.duration) }),
        el("button", { class: "qbtn", type: "button", id: `stMoveUp-${q.id}`, disabled: k === 0, onclick: () => moveTrack(q.id, -1),
          "aria-label": `${tt("studio.moveUp", "Move up")}: ${q.name}`, title: tt("studio.moveUp", "Move up") }, "↑"),
        el("button", { class: "qbtn", type: "button", id: `stMoveDown-${q.id}`, disabled: k === queue.length - 1, onclick: () => moveTrack(q.id, 1),
          "aria-label": `${tt("studio.moveDown", "Move down")}: ${q.name}`, title: tt("studio.moveDown", "Move down") }, "↓"),
        el("button", { class: "qbtn", type: "button", onclick: () => removeTrack(q.id),
          "aria-label": `${tt("studio.remove", "Remove")}: ${q.name}`, title: tt("studio.remove", "Remove") }, "×"))));
      music.append(list);
      const n = nextIndex(), at = curIndex();
      music.append(el("div", { class: "deck" }, el("span", { class: "name", role: "status",
        text: at >= 0 && n === at ? tt("studio.repeatsOne", "Plays again when it ends") : at >= 0 && n >= 0 ? `${tt("studio.upNext", "Next")}: ${queue[n].name}` : (at >= 0 ? tt("studio.lastTrack", "Last track in the queue") : "") }),
        el("button", { class: "linkbtn", type: "button", id: "stAdd", "aria-expanded": String(picking), onclick: () => { picking = !picking; paint(); } }, picking ? tt("studio.close", "Close") : tt("studio.addMusic", "Add music"))));
      if (picking) music.append(clearedPicker(pick));
      music.append(el("div", { class: "level" }, meter("meterMusic"),
        fader(tt("studio.musicLevel", "Music level"), show.musicVol, 1, (e) => { show.musicVol = +e.target.value; keep(); })));
      const secs = el("span", { class: "time", id: "stFadeSay", text: `${show.xfade} s` });
      music.append(el("div", { class: "srcrow" }, el("span", { text: tt("studio.crossfade", "Crossfade") }),
        el("input", { type: "range", min: "0", max: "12", step: "1", value: String(show.xfade), "aria-label": tt("studio.crossfadeLabel", "Crossfade between tracks, in seconds"),
          oninput: (e) => { show.xfade = +e.target.value; secs.textContent = `${show.xfade} s`; dropPre(); keep(); } }), secs));
      music.append(toggleRow(tt("studio.repeat", "Repeat the queue"), show.repeat, () => { show.repeat = !show.repeat; dropPre(); keep(); paint(); }));
    }
    if (trackNote) music.append(el("p", { class: "fine", role: "alert", text: trackNote }));
    // From a link: the desktop only, which can fetch it (on the web the page's
    // security rules forbid reaching an arbitrary address, so it is not offered).
    // `in`, not a truthy test: the web bridge answers any name it lacks with an
    // empty stand-in (web/bridge.js), so only `in` tells the desktop apart.
    if ("studioOpenTrack" in window.auralfm) {
      const url = el("input", { type: "url", id: "stLink", inputmode: "url", spellcheck: "false", autocapitalize: "off",
        placeholder: "https://…/show.mp3", "aria-label": tt("studio.linkLabel", "Link to an audio file") });
      music.append(el("form", { class: "srcrow linkrow", onsubmit: (e) => { e.preventDefault(); loadLink(url.value); } },
        url, el("button", { class: "linkbtn", type: "submit", disabled: linking },
          linking ? tt("studio.linkFetching", "Fetching…") : tt("studio.linkAdd", "Add from a link"))));
      if (linkNote) music.append(el("p", { class: "fine", role: "alert", text: linkNote }));
    }
    // Dropping files anywhere on the music strip adds them.
    music.addEventListener("dragover", (e) => { if ([...(e.dataTransfer?.types || [])].includes("Files")) { e.preventDefault(); music.classList.add("over"); } });
    music.addEventListener("dragleave", (e) => { if (!music.contains(e.relatedTarget)) music.classList.remove("over"); });
    music.addEventListener("drop", (e) => {
      e.preventDefault(); music.classList.remove("over");
      const fs = [...(e.dataTransfer?.files || [])].filter((f) => /^audio\//.test(f.type) || /\.(mp3|m4a|aac|wav|flac|ogg|oga|opus|webm|aiff?)$/i.test(f.name));
      if (fs.length) loadFiles(fs);
      else { trackNote = tt("studio.dropNotAudio", "Those are not audio files."); paint(); }
    });
    desk.append(music);

    // An input: what a DJ sends (openLine). Shown once there is one, or once asked for.
    if (lineStream) {
      const kids = [el("div", { class: "level" }, meter("meterLine"),
        !queue.length ? fader(tt("studio.musicLevel", "Music level"), show.musicVol, 1, (e) => { show.musicVol = +e.target.value; keep(); }) : null),
        el("p", { class: "fine", text: tt("studio.lineHeard", "Sent in stereo. Not played back here: you hear it at its source.") })];
      if (lineNote) kids.push(el("p", { class: "fine", role: "alert", text: lineNote }));
      desk.append(strip("strip-line", lineKind === "computer" ? tt("studio.computer", "This computer's sound") : tt("studio.lineInput", "An input"), lineKind === "computer" ? "" : lineName,
        el("button", { class: "linkbtn", type: "button", id: "stLineStop", disabled: live, "aria-label": tt("studio.lineStopLabel", "Stop this input"),
          onclick: () => { closeLine(); show.lineId = ""; keep(); paint(); } }, tt("studio.lineStop", "Stop")), ...kids));
    } else if (adding || lineNote || lineAsking) {
      const inputs = devices.filter((d) => d.label && d.deviceId && d.deviceId !== "default" && d.deviceId !== "communications");
      const kids = [];
      if (inputs.length) {
        const sel = el("select", { id: "stLine", "aria-label": tt("studio.lineHead", "Music from an input"), disabled: live, onchange: (e) => openLine(e.target.value) });
        sel.append(el("option", { value: "" }, tt("studio.lineNone", "Choose an input…")));
        for (const d of inputs) sel.append(el("option", { value: d.deviceId },
          LOOPBACK.test(d.label) ? `${d.label} · ${tt("studio.computer", "This computer's sound").toLowerCase()}` : d.label));
        kids.push(sel);
      } else {
        kids.push(el("button", { class: "linkbtn", type: "button", id: "stLineFind", disabled: live, onclick: async () => {
          // Inputs have no names until the system has been asked once.
          try { (await navigator.mediaDevices.getUserMedia({ audio: true })).getTracks().forEach((tr) => tr.stop()); } catch {}
          await listDevices();
          if (!devices.some((d) => d.label)) lineNote = tt("studio.lineNoInputs", "No inputs found. Connect one, or allow the microphone for AuralFM.");
          paint();
        } }, tt("studio.lineFind", "Show my inputs")));
      }
      if (canComputer()) kids.push(el("button", { class: "linkbtn", type: "button", id: "stComputer", disabled: live || lineAsking, onclick: openComputer },
        lineAsking ? tt("studio.computerAsking", "Waiting for your choice…") : tt("studio.computerUse", "Use this computer's sound")));
      kids.push(el("p", { class: "fine", text: tt("studio.lineHint", "An audio interface, a mixer, a controller, or this computer's sound: a DJ program such as Mixxx or Serato.") }));
      if (lineNote) kids.push(el("p", { class: "fine", role: "alert", text: lineNote }));
      desk.append(strip("strip-line", tt("studio.lineHead", "Music from an input"), "",
        el("button", { class: "qbtn", type: "button", id: "stAddClose", "aria-label": tt("studio.close", "Close"), title: tt("studio.close", "Close"), onclick: () => { adding = false; lineNote = ""; paint(); } }, "×"), ...kids));
    } else if (!live) {
      desk.append(el("button", { class: "addsrc", type: "button", id: "stAddSource", onclick: () => { adding = true; paint(); $s("stLine")?.focus() || $s("stLineFind")?.focus(); } },
        el("span", { class: "plus", "aria-hidden": "true", text: "+" }), tt("studio.addSource", "Add a source: an input, or this computer's sound")));
    }
    if (live) pane.append(el("p", { class: "fine", text: tt("studio.locked", "The microphone and the input are locked while you are live.") }));

    // What goes out: the sum of the strips, always on screen.
    pane.append(el("div", { class: "out" },
      el("div", { class: "striphead" }, el("b", { text: tt("studio.out", "Going out") })),
      meter("meterOut"),
      toggleRow(tt("studio.monitor", "Hear yourself"), show.monitor, () => {
        // With this computer's sound going out, your voice played back here would go out twice.
        if (!show.monitor && lineKind === "computer") { lineNote = tt("studio.monitorLoop", "Hear yourself is off with this computer's sound. Your voice would go out twice."); return paint(); }
        setMonitor(!show.monitor); paint(); }, tt("studio.monitorHint", "Headphones only")),
      toggleRow(tt("studio.duck", "Music dips when you talk"), show.duck, () => { show.duck = !show.duck; keep(); paint(); })));
    pane.append(el("div", { class: "stnext" }, el("button", { class: "sheetbtn", type: "button", onclick: () => goStage("show") }, `${tt("studio.nextStep", "Next")}: ${tt("studio.stageShow", "Your show")}`)));
    meters();
  }

  // ── stage 2: the show ──
  function paintShow(pane, live) {
    pane.append(
      el("label", { class: "field" }, el("span", { text: tt("studio.name", "Name") }),
        el("input", { type: "text", id: "stTitle", maxlength: "60", value: show.title, placeholder: tt("studio.namePh", "Late night in Oakland"),
          oninput: (e) => { show.title = e.target.value; keep(); syncGo(); } })),
      el("label", { class: "field" }, el("span", { text: tt("studio.about", "What it is, in a line or two") }),
        el("textarea", { id: "stAbout", maxlength: "240", placeholder: tt("studio.aboutPh", "Records from my crates and the people who made them."),
          oninput: (e) => { show.about = e.target.value; keep(); } }, show.about)));
    // The vibe: a menu, not seventeen chips on the screen at once.
    const vibe = el("select", { id: "stVibe", onchange: (e) => { show.vibe = e.target.value; keep(); } });
    vibe.append(el("option", { value: "" }, tt("studio.vibeNone", "Choose a vibe…")));
    for (const v of studioVibes) vibe.append(el("option", { value: v.id, selected: show.vibe === v.id }, v.name));
    pane.append(el("label", { class: "field" }, el("span", { text: tt("studio.vibe", "Vibe") }), vibe));
    pane.append(toggleRow(tt("studio.explicit", "Explicit language"), show.explicit, () => { show.explicit = !show.explicit; keep(); paint(); },
      tt("studio.explicitHint", "Labelled for listeners")));
    // Where it goes out from: a town, never a position.
    const where = el("div", { class: "field" }, el("span", { class: "fieldlabel", text: tt("studio.where", "Where") }));
    where.append(el("div", { class: "where" },
      el("span", { text: show.place ? `${show.place.title}, ${show.place.country}` : tt("studio.noPlace", "No town yet") }),
      // Not mid-show: a station does not move while it is on the air.
      live ? null : el("button", { class: "linkbtn", type: "button", id: "stPlace", onclick: usePlace }, selection?.place && !selection.place.nowhere ? `${tt("studio.use", "Use")} ${selection.place.title}` : tt("studio.pickPlace", "Pick a town on the globe"))));
    where.append(el("p", { class: "fine", text: tt("studio.whereNote", "Listeners see your town. Not your location.") }));
    pane.append(where);
    pane.append(el("div", { class: "stnext" }, el("button", { class: "sheetbtn", type: "button", onclick: () => goStage("go") }, `${tt("studio.nextStep", "Next")}: ${tt("studio.goLive", "Go live")}`)));
  }

  // ── stage 3: go live ──
  function paintGo(pane) {
    const list = el("ul", { class: "checks", "aria-label": tt("studio.before", "Before you go live") });
    for (const c of checks()) {
      if (c.toggle) {
        list.append(el("li", {}, toggleRow(c.text, c.ok, () => { c.toggle(); paint(); })));
      } else {
        list.append(el("li", { class: c.ok ? "ok" : "todo" },
          el("span", { class: "chk", "aria-hidden": "true", text: c.ok ? "✓" : "○" }),
          el("span", { class: "chktext", text: c.ok ? c.text : c.todo }),
          c.ok ? null : el("button", { class: "linkbtn", type: "button", onclick: () => goStage(c.stage) }, c.stage === "sound" ? tt("studio.stageSound", "Sound") : tt("studio.stageShow", "Your show"))));
      }
    }
    pane.append(list);
    const conduct = el("p", { class: "fine" });
    conduct.append(tt("studio.conduct", "Talk, your own music and music you are licensed to play. Shows follow the "),
      el("a", { href: "https://docs.auralfm.xyz/conduct/", target: "_blank", rel: "noopener noreferrer", class: "linkbtn" }, tt("studio.conductLink", "Code of Conduct")), ".");
    pane.append(conduct);
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (isIOS) pane.append(el("p", { class: "fine", text: tt("studio.iosWarning", "On an iPhone, the show stops when you leave the app or the screen turns off.") }));
    if (phase === "off") {
      const left = toDo();
      pane.append(el("div", { class: "btns gobtns" },
        // Once it is going out, back to the desk: the levels are what to watch.
        el("button", { class: "sheetbtn", type: "button", id: "stRehearse", onclick: () => go("rehearsal") }, tt("studio.soundCheck", "Sound check")),
        el("button", { class: "sheetbtn primary", type: "button", id: "stLive", "aria-describedby": "stWhy",
          onclick: () => { if (ready()) go("live"); else { const first = list.querySelector(".todo .linkbtn, .layrow[aria-pressed=false]"); first?.focus(); } } }, tt("studio.goLive", "Go live"))));
      pane.append(el("p", { class: "airnote", id: "stWhy", role: "status", text: left
        ? `${left} ${left === 1 ? tt("studio.oneLeft", "thing left before going live.") : tt("studio.manyLeft", "things left before going live.")} ${tt("studio.checkFirst", "Sound check works now: only you hear it.")}`
        : tt("studio.goNote", "Sound check: only you hear it. Go live: on the globe, in On air, and in your town's room.") }));
    }
  }

  // ── the show's room ──────────────────────────────────────────────────────
  /**
   * With the studio open, the app is a broadcast desk: the
   * stations card folds away, the town's messages take the whole column on the
   * right, the studio widens on the left and the globe sits between them
   * (explore.html, body.studio-open; explore-trackers.js, centreGlobe).
   *
   * The room is the town the show goes out from. While the studio is open, or
   * a show is rehearsing, announced or live, the host stands in that town the
   * way a listener stands in a station's (src/main.js, "studio:host"): the
   * place they picked on the globe, never where they are, and only with
   * "Show other listeners" on.
   */
  function syncHost() {
    const p = show.place;
    const on = (!panel.hidden || phase !== "off") && p && typeof p.lat === "number" && typeof p.lon === "number";
    // Live, the show's name goes out with the town: that is how it is found.
    const next = on ? { lat: p.lat, lon: p.lon, title: p.title, live: phase === "live", show: phase === "live" ? show.title.trim() : "" } : null;
    if (JSON.stringify(next) !== JSON.stringify(window.AuralStudio.hosting || null)) {
      window.AuralStudio.hosting = next;
      window.auralfm.studioHost?.(next ? next.lat : null, next ? next.lon : null, !!next?.live, next?.show || "");
      if (typeof syncChat === "function" && typeof prefs !== "undefined") syncChat(prefs);
    }
    room();
  }
  /** The card that stands where the messages will be, when there are none to show. */
  function room() {
    const card = $s("roomwait");
    if (!card) return;
    const waiting = !panel.hidden && !!$s("chat")?.hidden;
    card.hidden = !waiting;
    if (!waiting) return;
    const off = typeof prefs !== "undefined" && prefs?.presence !== true;
    $s("roomwaitsay").textContent = off
      ? tt("studio.roomOff", "Your town's messages show here. The room is public and unmoderated. Turn on Show other listeners to open it.")
      : tt("studio.roomTown", "Choose a town to open its room.");
    const go = $s("roomwaitgo");
    go.hidden = !off;
    go.textContent = tt("studio.roomOn", "Show other listeners");
    go.onclick = () => window.auralfm.setPrefs({ presence: true });
  }
  // The Go live button follows the name without repainting the field being typed in.
  // The checklist follows the name without repainting the field being typed in.
  const syncGo = () => {
    const tab = $s("stTab-show")?.querySelector(".stnum");
    if (tab) tab.textContent = show.title.trim() && show.place ? "✓" : "2";
  };
  function usePlace() {
    const p = selection?.place;
    if (!p || p.nowhere) return;
    show.place = { title: p.title, country: p.country, lat: p.lat, lon: p.lon };
    paint();
  }
  let studioVibes = [];

  // ── the people listening ──────────────────────────────────────────────────
  /**
   * Live, the show goes to whoever asks for it: each listener's device and
   * this one connect directly, and the mix (`mixDest`, the same sound the
   * "Going out" meter shows) is sent down each connection. explore-shows.js is
   * the other end and says how the two find each other.
   *
   * Twelve at most. Every listener is another copy of the sound leaving this
   * computer's connection at 128 kbps; past a dozen, a home upload starts to
   * break up for everybody. The thirteenth is told the show is full.
   */
  const MAX_LISTENERS = 12;
  const heard = new Map();         // the handshake's id → { pc, from }
  let heardNote = "";              // said when a listener asked and could not connect
  const heardNow = () => [...heard.values()].filter((l) => l.pc.connectionState === "connected").length;
  function paintHeard() {
    const n = $s("stHeard");
    if (n) n.textContent = `${heardNow()} ${tt("studio.listening", "listening")}`;
  }
  function dropListener(sid, missed = false) {
    const l = heard.get(sid);
    if (!l) return;
    heard.delete(sid);
    // They asked, this computer answered, and the two never met. On one Wi-Fi
    // that is nearly always macOS keeping AuralFM off the local network.
    if (missed && l.pc.connectionState !== "connected" && !heardNote) {
      heardNote = tt("studio.heardFail", "A listener could not connect. Same Wi-Fi? Allow AuralFM in System Settings > Privacy & Security > Local Network.");
      paint();
    }
    try { l.pc.onconnectionstatechange = null; l.pc.close(); } catch {}
    paintHeard();
  }
  function closeListeners() {
    for (const [sid, l] of [...heard]) { window.AuralRtc?.send(l.from, { t: "bye", sid }); dropListener(sid); }
  }
  window.AuralRtc?.onSignal(async (from, msg) => {
    if (msg.t === "bye") { if (heard.get(msg.sid)?.from === from) dropListener(msg.sid); return; }
    if (msg.t !== "offer" || typeof msg.sdp !== "string" || heard.has(msg.sid)) return;
    if (phase !== "live" || !mixDest) return;
    if (heard.size >= MAX_LISTENERS) return void window.AuralRtc.send(from, { t: "full", sid: msg.sid });
    const pc = new RTCPeerConnection({ iceServers: window.AuralRtc.ICE });
    const l0 = { pc, from, met: false };
    heard.set(msg.sid, l0);
    try {
      for (const tr of mixDest.stream.getAudioTracks()) pc.addTrack(tr, mixDest.stream);
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed") dropListener(msg.sid, !l0.met);
        else if (pc.connectionState === "closed") dropListener(msg.sid);
        else { if (pc.connectionState === "connected") { l0.met = true; if (heardNote) { heardNote = ""; paint(); } } paintHeard(); }
      };
      await pc.setRemoteDescription({ type: "offer", sdp: msg.sdp });
      await pc.setLocalDescription(await pc.createAnswer());
      await window.AuralRtc.gathered(pc);
      if (phase !== "live" || !heard.has(msg.sid)) return dropListener(msg.sid);
      const sent = await window.AuralRtc.send(from, { t: "answer", sid: msg.sid, sdp: window.AuralRtc.music(pc.localDescription.sdp) });
      if (!sent) dropListener(msg.sid);
      // A listener who never completes the connection does not hold a place.
      setTimeout(() => { if (heard.get(msg.sid)?.pc === pc && pc.connectionState !== "connected") dropListener(msg.sid, true); }, 45000);
    } catch { dropListener(msg.sid); }
  });

  // ── open and close ───────────────────────────────────────────────────────
  function setOpen(on) {
    panel.hidden = !on;
    btn.setAttribute("aria-pressed", String(on));
    document.body.classList.toggle("studio-open", on);
    syncHost();
    if (typeof sizeGlobe === "function") sizeGlobe();   // the planet, between the studio and the rail
    if (on) {
      // One panel on that side at a time: the headlines share it.
      if (typeof newsOpen !== "undefined" && newsOpen) $s("newsClose")?.click();
      if (!show.place && selection?.place && !selection.place.nowhere) usePlace();
      paint();
      if (micStream) meters();
      $s("studiotitle")?.focus?.();
    } else if (phase === "off") closeAudio();
  }

  window.AuralStudio = { live: null, hosting: null, room, open: () => setOpen(true) };
  allowed().then(async (ok) => {
    if (!ok || !btn || !panel) return;
    btn.hidden = false;
    // The listener's side (explore-shows.js) is on wherever the studio is.
    window.AuralStudio.on = true;
    window.AuralShows?.peers(typeof peers !== "undefined" ? peers : []);
    Icons.set(btn, "mic");
    btn.onclick = () => setOpen(panel.hidden);
    $s("studioClose").onclick = () => setOpen(false);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !panel.hidden && !e.target.closest?.("input, textarea, select")) setOpen(false); });
    const vibes = await Promise.resolve(window.auralfm.vibes?.()).catch(() => []) || [];
    studioVibes = [...vibes, { id: "talk-show", name: tt("studio.vibeTalk", "Talk") }].filter((v, i, a) => a.findIndex((x) => x.name === v.name) === i);
  });
}
