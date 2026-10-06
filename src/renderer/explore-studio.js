/**
 * Your show: the studio. A prototype (26 Sept 2026).
 *
 * Melton, 26 Sept: "your own show", inside the app on all three platforms —
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
 * Hidden unless this is a development or beta build of the desktop app, or a
 * web preview on this machine — so publishing the web app does not show anyone
 * a studio that cannot yet reach them. (A page opened with ?studio showed it
 * until 5 Oct 2026.)
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
       * The desktop beta only (Melton, 5 Oct 2026: the ?studio link on the web
       * was too buggy to hand out; test on the desktop until the bugs and the
       * experience are settled). A page opened with ?studio used to switch it
       * on and remember that in this browser; the memory is cleared here so a
       * browser that tried it once does not keep showing it.
       */
      try { localStorage.removeItem(`${KEY}.labs`); } catch {}
      // A preview on this machine, for building it.
      if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) return true;
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
  let ctx = null, micStream = null, micSrc = null, micGain = null, micAn = null, micMon = null;
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
    micAn = ctx.createAnalyser(); micAn.fftSize = 1024;
    micGain.connect(micAn); micGain.connect(mix);
    musicGain = ctx.createGain(); musicGain.gain.value = show.musicVol;
    musicAn = ctx.createAnalyser(); musicAn.fftSize = 1024;
    musicGain.connect(musicAn); musicGain.connect(mix);
    /**
     * What the host hears. The music always: a track that played into the show
     * and not into the room was a track that seemed never to load (Melton, 5
     * Oct), because only "Hear yourself" sent anything to the speakers. Your own
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
   * microphone at all (Melton, 27 Sept: it struggled with the computer's and
   * with headphones).
   */
  const micTrouble = (name) =>
    name === "NotAllowedError" || name === "SecurityError" || name === "denied" || name === "restricted"
      ? tt("studio.micDenied", "The microphone is blocked. Allow it for AuralFM in your system's privacy settings, then try again.")
    : name === "NotFoundError" || name === "OverconstrainedError"
      ? tt("studio.micMissing", "No microphone was found. Plug one in, or connect headphones that have one, then try again.")
    : name === "NotReadableError" || name === "AbortError" || name === "TrackStartError"
      ? tt("studio.micBusy", "The microphone could not start. Another app may be using it (a call, a recorder): close it, or pick another microphone, then try again.")
    : tt("studio.micFailed", "The microphone could not start. Try again, or pick another one.");
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
    const slow = setTimeout(() => { if (asking) { micError = tt("studio.micWaiting", "Waiting for permission to use the microphone. Look for your system's prompt."); paint(); } }, 2500);
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
        micNote = tt("studio.micFellBack", "The microphone you used last time is not connected, so this is your system's default. Pick another below.");
      }
      micSrc = ctx.createMediaStreamSource(micStream);
      micSrc.connect(micGain);
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
        micError = tt("studio.micEnded", "The microphone stopped. It may have been disconnected: turn it on again, or pick another.");
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
      lineNote = tt("studio.lineEnded", "That input stopped. It may have been disconnected: choose it again, or pick another.");
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
        ? tt("studio.micDenied", "The microphone is blocked. Allow it for AuralFM in your system's privacy settings, then try again.")
        : tt("studio.lineFailed", "That input could not start. Check it is connected and not in use by another app, then choose it again.");
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
        ? tt("studio.computerNoneApp", "This computer's sound did not come through. In System Settings, under Privacy & Security, allow AuralFM in Screen & System Audio Recording, then open AuralFM again. Or send it through a loopback device (BlackHole is a free one) and choose that as the input.")
        : tt("studio.computerNoneWeb", "No sound came with that. In Chrome or Edge, choose a tab and switch on \"Also share tab audio\". Safari and Firefox do not share sound: use a loopback device, or the desktop app.");
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
   * fading into the next (Melton, 5 Oct 2026: one track under a microphone made
   * playing music "difficult and strenuous"; the Mixcloud study's second step).
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
        trackNote = `${item.name}: ${tt("studio.trackBad", "That file could not be played. Try an MP3, M4A, WAV, FLAC or OGG file.")}`;
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
    const added = [...list].map((src) => ({ id: `q${++queueSeq}`, name: bare(src.name), source: src.source, duration: null }));
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
  async function loadBlob(name, source) { const before = queue.length; await addTracks([{ name, source }]); return queue.length > before; }
  function clearQueue() { dropPre(); const old = deck; deck = null; closeDeck(old); queue = []; trackNote = ""; }
  /**
   * A track from a link (desktop: main opens it and passes it through as it
   * arrives, src/main/ipc-app.js, so it plays from the first second). Melton,
   * 27 Sept, asked for "a link to stream from any platform". Mixcloud,
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
    try { host = new URL(url).hostname; } catch { linkNote = tt("studio.linkBad", "That is not a link. Paste one that starts with https://."); return paint(); }
    if (PLATFORM.test(host)) {
      linkNote = tt("studio.linkPlatform", "Mixcloud, SoundCloud, YouTube and services like them don't let other apps play their audio, and their terms don't allow it. If the show is yours, download it from there and add the file, or use a direct link to the audio file.");
      return paint();
    }
    linking = true; paint();
    const r = await window.auralfm.studioOpenTrack(url);
    linking = false;
    if (r?.src) {
      linkNote = "";
      const n = queue.length;
      await loadBlob(r.name, r.src);
      if (queue.length <= n && trackNote) { trackNote = ""; linkNote = tt("studio.linkFailed", "That link could not be fetched. Check it opens in a browser, then try again."); paint(); }
      return;
    }
    linkNote = {
      https: tt("studio.linkBad", "That is not a link. Paste one that starts with https://."),
      page: tt("studio.linkPage", "That link is a web page, not an audio file. Use the link to the file itself (it usually ends in .mp3, .m4a or .wav)."),
      stream: tt("studio.linkStream", "That is a live stream. A track has to be a file with an end: use a link to a recording."),
      big: tt("studio.linkBig", "That file is over 300 MB. Use a shorter or smaller file."),
      slow: tt("studio.linkSlow", "That took too long to download. Try again, or download it and add the file."),
    }[r?.error] || tt("studio.linkFailed", "That link could not be fetched. Check it opens in a browser, then try again.");
    paint();
  }
  // Every frame: the meters, and the music dipping under the voice.
  function meters() {
    if (raf || !ctx) return;
    const buf = new Float32Array(1024);
    let talking = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      if (panel.hidden && phase === "off") { cancelAnimationFrame(raf); raf = 0; return; }
      const m = micStream ? levelOf(micAn, buf) : 0, u = levelOf(musicAn, buf), o = levelOf(mixAn, buf);
      for (const [id, v] of [["meterMic", m], ["meterMusic", u], ["meterOut", o]]) {
        const el = $s(id); if (!el) continue;
        el.firstChild.style.width = `${Math.round(v * 100)}%`;
        el.classList.toggle("hot", v > 0.92);
      }
      // Talk over: down to a quarter while the voice is up, back after a beat.
      if (show.duck && musicGain) {
        talking = m > 0.12 ? 18 : Math.max(0, talking - 1);
        const want = talking ? show.musicVol * 0.25 : show.musicVol;
        musicGain.gain.setTargetAtTime(want, ctx.currentTime, talking ? 0.05 : 0.4);
        lineGain.gain.setTargetAtTime(want, ctx.currentTime, talking ? 0.05 : 0.4);
      } else if (lineGain) lineGain.gain.value = show.musicVol;
      { const el = $s("meterLine"); if (el) { const v = lineStream ? levelOf(lineAn, buf) : 0; el.firstChild.style.width = `${Math.round(v * 100)}%`; el.classList.toggle("hot", v > 0.92); } }
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
    if (to !== "off" && phase === "off") startedAt = Date.now();
    // Leaving the air: the people listening are told, and let go.
    if (phase === "live" && to !== "live") closeListeners();
    phase = to;
    window.AuralStudio.live = phase === "live" && show.place ? { lat: show.place.lat, lon: show.place.lon, title: show.title } : null;
    if (typeof paintRings === "function") paintRings();
    if (phase === "live" && show.place && typeof flyTo === "function") flyTo(show.place.lat, show.place.lon);
    // Confirmed again each time: the 18 and over and the rights are asked
    // before every show, not remembered from the last one (docs/TERMS.md).
    if (phase === "off") { stopTrack(); setMonitor(false); show.rights = false; show.adult = false; }
    paint();
    meters();
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

  function paint() {
    panel.dataset.phase = phase;
    // Live shows on the toolbar too, so a closed panel still says you are on air.
    btn.classList.toggle("onair", phase === "live");
    btn.setAttribute("aria-label", phase === "live" ? `${tt("studio.open", "Your show")}: ${tt("studio.live", "Live")}` : tt("studio.open", "Your show"));
    const wasFocus = document.activeElement?.id;
    body.textContent = "";

    // On air, first: it is what the panel is for.
    const air = el("div", { class: "sec" }, head(tt("studio.onAir", "On air")));
    const label = phase === "live" ? tt("studio.live", "Live") : phase === "rehearsal" ? tt("studio.rehearsing", "Rehearsing") : phase === "planned" ? tt("studio.planned", "Planned") : tt("studio.off", "Off air");
    air.append(el("div", { class: "air" },
      el("span", { class: "airpill", role: "status" }, el("i"), el("span", { text: label }), (phase === "live" || phase === "rehearsal") ? el("span", { id: "airclock", text: "00:00:00" }) : null),
      phase === "live" ? el("span", { class: "time", id: "stHeard", role: "status", text: `${heardNow()} ${tt("studio.listening", "listening")}` }) : null));
    const why = !hasSound() ? tt("studio.needMic", "Turn on your microphone, or add a track, below.")
      : !show.title.trim() ? tt("studio.needTitle", "Give your show a name.")
      : !show.place ? tt("studio.needPlace", "Choose the town you go out from.")
      : (!show.rights || !show.adult) ? tt("studio.needRights", "Confirm what you will play is yours to play and you are 18 or older.") : "";
    const btns = el("div", { class: "btns" });
    if (phase === "off") {
      btns.append(
        el("button", { class: "sheetbtn", type: "button", id: "stRehearse", onclick: () => go("rehearsal") }, tt("studio.rehearse", "Rehearse")),
        el("button", { class: "sheetbtn", type: "button", id: "stPlan", disabled: !ready(), onclick: () => go("planned") }, tt("studio.plan", "Announce")),
        el("button", { class: "sheetbtn primary", type: "button", id: "stLive", disabled: !ready(), "aria-describedby": "stWhy", onclick: () => go("live") }, tt("studio.goLive", "Go live")));
    } else {
      if (phase === "rehearsal" || phase === "planned") btns.append(el("button", { class: "sheetbtn primary", type: "button", id: "stLive", disabled: !ready(), "aria-describedby": "stWhy", onclick: () => go("live") }, tt("studio.goLive", "Go live")));
      btns.append(el("button", { class: `sheetbtn${phase === "live" ? " onair" : ""}`, type: "button", id: "stEnd", onclick: () => go("off") },
        phase === "live" ? tt("studio.end", "End the show") : phase === "planned" ? tt("studio.cancel", "Cancel announcement") : tt("studio.stop", "Stop rehearsing")));
    }
    air.append(btns);
    air.append(el("p", { class: "airnote", id: "stWhy", text:
      phase === "live" ? tt("studio.liveNote", "You are live. People on AuralFM's beta can find your show and hear it, straight from this computer: twelve at a time, with Show other listeners on. Each connection shows the other's network address, as a station's stream does.")
      : phase === "planned" ? tt("studio.plannedPrototype", "This is a prototype: your town is marked on the globe as planned.")
      : phase === "rehearsal" ? tt("studio.rehearsalNote", "Only you can hear this. Put on headphones and turn on “Hear yourself” to check your mix.")
      : why || tt("studio.readyNote", "Ready. Rehearse first: only you will hear it.") }));
    body.append(air);

    // The show.
    const about = el("div", { class: "sec" }, head(tt("studio.theShow", "The show")));
    about.append(
      el("label", { class: "field" }, el("span", { text: tt("studio.name", "Name") }),
        el("input", { type: "text", id: "stTitle", maxlength: "60", value: show.title, placeholder: tt("studio.namePh", "Late night in Oakland"),
          oninput: (e) => { show.title = e.target.value; keep(); syncGo(); } })),
      el("label", { class: "field" }, el("span", { text: tt("studio.about", "What it is, in a line or two") }),
        el("textarea", { id: "stAbout", maxlength: "240", placeholder: tt("studio.aboutPh", "Records from my crates and the people who made them."),
          oninput: (e) => { show.about = e.target.value; keep(); } }, show.about)));
    const vibes = el("div", { class: "chips", role: "group", "aria-label": tt("studio.vibe", "Vibe") });
    for (const v of studioVibes) vibes.append(el("button", { type: "button", "aria-pressed": String(show.vibe === v.id),
      onclick: () => { show.vibe = show.vibe === v.id ? "" : v.id; keep(); paint(); } }, v.name));
    about.append(el("span", { class: "layhead", text: tt("studio.vibe", "Vibe") }), vibes);
    about.append(toggleRow(tt("studio.explicit", "Explicit language"), show.explicit, () => { show.explicit = !show.explicit; keep(); paint(); },
      tt("studio.explicitHint", "Labelled for listeners")));
    body.append(about);

    // Where it goes out from: a town, never a position.
    const where = el("div", { class: "sec" }, head(tt("studio.where", "Where")));
    where.append(el("div", { class: "where" },
      el("span", { text: show.place ? `${show.place.title}, ${show.place.country}` : tt("studio.noPlace", "No town yet") }),
      // Not mid-show: a station does not move while it is on the air.
      phase === "live" ? null : el("button", { class: "linkbtn", type: "button", id: "stPlace", onclick: usePlace }, selection?.place && !selection.place.nowhere ? `${tt("studio.use", "Use")} ${selection.place.title}` : tt("studio.pickPlace", "Pick a town on the globe"))));
    where.append(el("p", { class: "fine", text: tt("studio.whereNote", "Listeners see your town, the way they see every station's. Never where you are within it.") }));
    body.append(where);

    // Sound.
    const sound = el("div", { class: "sec" }, head(tt("studio.sound", "Sound")));
    if (!micStream) {
      sound.append(el("button", { class: "sheetbtn", type: "button", id: "stMic", disabled: asking, onclick: openMic },
        asking ? tt("studio.micAsking", "Asking for the microphone…") : tt("studio.micOn", "Turn on the microphone")));
      if (micError) sound.append(el("p", { class: "fine", role: "alert", text: micError }));
      if (micBlocked && "micSettings" in window.auralfm) sound.append(el("button", { class: "linkbtn", type: "button", onclick: () => window.auralfm.micSettings() },
        tt("studio.micSettings", "Open microphone settings")));
    } else {
      if (micNote) sound.append(el("p", { class: "fine", role: "status", text: micNote }));
      if (devices.length > 1) {
        const sel = el("select", { id: "stDevice", "aria-label": tt("studio.micPick", "Microphone"), disabled: phase === "live",
          onchange: (e) => { show.deviceId = e.target.value; keep(); openMic(); } });
        for (const d of devices) sel.append(el("option", { value: d.deviceId, selected: d.deviceId === (show.deviceId || micStream.getAudioTracks()[0]?.getSettings().deviceId) }, d.label || tt("studio.micPick", "Microphone")));
        sound.append(el("label", { class: "field" }, el("span", { text: tt("studio.micPick", "Microphone") }), sel));
      }
      // A headset's microphone switches it to call quality while it is on.
      const using = devices.find((d) => d.deviceId === micStream.getAudioTracks()[0]?.getSettings().deviceId)?.label || micStream.getAudioTracks()[0]?.label || "";
      if (/airpods|bluetooth|headset|buds|beats|hands-free/i.test(using)) {
        sound.append(el("p", { class: "fine", text:
          tt("studio.micHeadset", "Wireless headphones play at call quality while their microphone is on. For a better sound, use the computer's microphone or a wired one, and keep the headphones to listen.") }));
        /**
         * One tap to do what that says. With AirPods Max the headset's own
         * microphone is the system default once they connect, so every show
         * started on it (Melton, 28 Sept) — and at call quality, the
         * headphones dropped the station's sound to match.
         */
        const builtIn = devices.find((d) => d.deviceId !== "default" && /macbook|built-in|internal|imac|studio display/i.test(d.label));
        if (builtIn) sound.append(el("button", { class: "linkbtn", type: "button", id: "stBuiltIn", disabled: phase === "live",
          onclick: () => { show.deviceId = builtIn.deviceId; keep(); openMic(); } }, tt("studio.micUseBuiltIn", "Use the computer's microphone")));
      }
      sound.append(el("div", { class: "srcrow" }, el("span", { text: tt("studio.voice", "Voice") }),
        el("input", { type: "range", min: "0", max: "2", step: "0.01", value: String(show.micVol), "aria-label": tt("studio.voiceLevel", "Voice level"),
          oninput: (e) => { show.micVol = +e.target.value; micGain.gain.value = show.micVol; keep(); } })), meter("meterMic"));
    }
    // The queue: the show's music, when it is played here.
    const pick = el("input", { type: "file", multiple: true, accept: "audio/*,.mp3,.m4a,.aac,.wav,.flac,.ogg,.oga,.opus,.webm", id: "stFile", hidden: true,
      onchange: (e) => { const fs = [...(e.target.files || [])]; e.target.value = ""; if (fs.length) loadFiles(fs); } });
    sound.append(pick);
    if (!queue.length) {
      sound.append(el("div", { class: "deck" }, el("span", { class: "name", role: "status",
        text: trackLoading ? tt("studio.trackLoading", "Opening the track…") : tt("studio.noTrack", "No music under you yet") }),
        el("button", { class: "linkbtn", type: "button", id: "stAdd", disabled: trackLoading, onclick: () => pick.click() }, tt("studio.addTracks", "Add tracks"))));
    } else {
      const on = deck?.item.id, at = curIndex();
      sound.append(el("div", { class: "deck transport" },
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
      sound.append(list);
      sound.append(el("div", { class: "deck" }, el("span", { class: "name", role: "status",
        text: at >= 0 && nextIndex() >= 0 ? `${tt("studio.upNext", "Next")}: ${queue[nextIndex()].name}` : (at >= 0 ? tt("studio.lastTrack", "Last track in the queue") : "") }),
        el("button", { class: "linkbtn", type: "button", id: "stAdd", onclick: () => pick.click() }, tt("studio.addTracks", "Add tracks"))));
    }
    if (trackNote) sound.append(el("p", { class: "fine", role: "alert", text: trackNote }));
    // From a link: the desktop only, which can fetch it (on the web the page's
    // security rules forbid reaching an arbitrary address, so it is not offered).
    // `in`, not a truthy test: the web bridge answers any name it lacks with an
    // empty stand-in (web/bridge.js), so only `in` tells the desktop apart.
    if ("studioOpenTrack" in window.auralfm) {
      const url = el("input", { type: "url", id: "stLink", inputmode: "url", spellcheck: "false", autocapitalize: "off",
        placeholder: "https://…/show.mp3", "aria-label": tt("studio.linkLabel", "Link to an audio file") });
      sound.append(el("form", { class: "srcrow linkrow", onsubmit: (e) => { e.preventDefault(); loadLink(url.value); } },
        url, el("button", { class: "linkbtn", type: "submit", disabled: linking },
          linking ? tt("studio.linkFetching", "Fetching…") : tt("studio.linkAdd", "Add from a link"))));
      if (linkNote) sound.append(el("p", { class: "fine", role: "alert", text: linkNote }));
    }
    if (queue.length) {
      sound.append(el("div", { class: "srcrow" }, el("span", { text: tt("studio.music", "Music") }),
        el("input", { type: "range", min: "0", max: "1", step: "0.01", value: String(show.musicVol), "aria-label": tt("studio.musicLevel", "Music level"),
          oninput: (e) => { show.musicVol = +e.target.value; keep(); } })), meter("meterMusic"));
      const secs = el("span", { class: "time", id: "stFadeSay", text: `${show.xfade} s` });
      sound.append(el("div", { class: "srcrow" }, el("span", { text: tt("studio.crossfade", "Crossfade") }),
        el("input", { type: "range", min: "0", max: "12", step: "1", value: String(show.xfade), "aria-label": tt("studio.crossfadeLabel", "Crossfade between tracks, in seconds"),
          oninput: (e) => { show.xfade = +e.target.value; secs.textContent = `${show.xfade} s`; dropPre(); keep(); } }), secs));
      sound.append(toggleRow(tt("studio.repeat", "Repeat the queue"), show.repeat, () => { show.repeat = !show.repeat; dropPre(); keep(); paint(); }));
    }
    // Music from an input, or from this computer: what a DJ sends (openLine).
    {
      const live = phase === "live";
      const inputs = devices.filter((d) => d.label && d.deviceId && d.deviceId !== "default" && d.deviceId !== "communications");
      sound.append(el("span", { class: "layhead linehead", text: tt("studio.lineHead", "Music from an input") }));
      if (lineStream) {
        sound.append(el("div", { class: "deck" }, el("span", { class: "name", role: "status", text: lineName }),
          el("button", { class: "linkbtn", type: "button", id: "stLineStop", disabled: live, "aria-label": tt("studio.lineStopLabel", "Stop this input"),
            onclick: () => { closeLine(); show.lineId = ""; keep(); paint(); } }, tt("studio.lineStop", "Stop"))));
        if (!queue.length) sound.append(el("div", { class: "srcrow" }, el("span", { text: tt("studio.music", "Music") }),
          el("input", { type: "range", min: "0", max: "1", step: "0.01", value: String(show.musicVol), "aria-label": tt("studio.musicLevel", "Music level"),
            oninput: (e) => { show.musicVol = +e.target.value; keep(); } })));
        sound.append(meter("meterLine"));
        sound.append(el("p", { class: "fine", text: tt("studio.lineHeard", "Sent as it arrives, in stereo. You hear it at its source, so it is not played back here.") }));
      } else {
        if (inputs.length) {
          const sel = el("select", { id: "stLine", "aria-label": tt("studio.lineHead", "Music from an input"), disabled: live,
            onchange: (e) => openLine(e.target.value) });
          sel.append(el("option", { value: "" }, tt("studio.lineNone", "Choose an input…")));
          for (const d of inputs) sel.append(el("option", { value: d.deviceId },
            LOOPBACK.test(d.label) ? `${d.label} · ${tt("studio.computer", "This computer's sound").toLowerCase()}` : d.label));
          sound.append(sel);
        } else {
          sound.append(el("button", { class: "linkbtn", type: "button", id: "stLineFind", disabled: live, onclick: async () => {
            // Inputs have no names until the system has been asked once.
            try { (await navigator.mediaDevices.getUserMedia({ audio: true })).getTracks().forEach((tr) => tr.stop()); } catch {}
            await listDevices();
            if (!devices.some((d) => d.label)) lineNote = tt("studio.lineNoInputs", "No inputs were found. Connect an audio interface or a mixer, or allow the microphone for AuralFM, then try again.");
            paint();
          } }, tt("studio.lineFind", "Show my inputs")));
        }
        if (canComputer()) sound.append(el("button", { class: "linkbtn", type: "button", id: "stComputer", disabled: live || lineAsking, onclick: openComputer },
          lineAsking ? tt("studio.computerAsking", "Waiting for your choice…") : tt("studio.computerUse", "Use this computer's sound")));
        sound.append(el("p", { class: "fine", text: tt("studio.lineHint", "For a DJ: an audio interface, a mixer or a controller, or this computer's own sound from the program you mix in.") }));
      }
      if (lineNote) sound.append(el("p", { class: "fine", role: "alert", text: lineNote }));
      if (live) sound.append(el("p", { class: "fine", text: tt("studio.locked", "Your microphone and input are locked while you are live.") }));
    }
    sound.append(toggleRow(tt("studio.duck", "Music dips when you talk"), show.duck, () => { show.duck = !show.duck; keep(); if (!show.duck && musicGain) musicGain.gain.value = show.musicVol; paint(); }));
    sound.append(toggleRow(tt("studio.monitor", "Hear yourself"), show.monitor, () => {
      // With this computer's sound going out, your voice played back here would go out twice.
      if (!show.monitor && lineKind === "computer") { lineNote = tt("studio.monitorLoop", "Hear yourself is off while this computer's sound is going out: your voice would go out twice."); return paint(); }
      setMonitor(!show.monitor); paint(); },
      tt("studio.monitorHint", "Headphones only")));
    sound.append(el("div", { class: "srcrow" }, el("span", { text: tt("studio.out", "Going out") }), el("span", { class: "fine", text: "" })), meter("meterOut"));
    body.append(sound);

    // Before it goes out.
    const rights = el("div", { class: "sec" }, head(tt("studio.before", "Before you go live")));
    rights.append(toggleRow(tt("studio.rights", "Everything I play is mine, or I have the rights to play it"), show.rights, () => { show.rights = !show.rights; paint(); }));
    rights.append(toggleRow(tt("studio.adult", "I am 18 or older"), show.adult, () => { show.adult = !show.adult; paint(); }));
    const conduct = el("p", { class: "fine" });
    conduct.append(tt("studio.conduct", "Talk, your own music and music you are licensed to play. Shows follow the "),
      el("a", { href: "https://docs.auralfm.xyz/conduct/", target: "_blank", rel: "noopener noreferrer", class: "linkbtn" }, tt("studio.conductLink", "Code of Conduct")), ".");
    rights.append(conduct);
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (isIOS) {
      rights.append(el("p", { class: "fine", text: tt("studio.iosWarning", "On an iPhone, your show lasts as long as the app stays open and the screen stays on. If you switch to another app, the broadcast will pause.") }));
    }
    body.append(rights);

    if (wasFocus && $s(wasFocus)) $s(wasFocus).focus({ preventScroll: true });
    syncHost();
  }

  // ── the show's room ──────────────────────────────────────────────────────
  /**
   * With the studio open, the app is a broadcast desk (Melton, 5 Oct 2026): the
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
      ? tt("studio.roomOff", "Messages from people in your town's room appear here, and you can answer them. The room is public and nobody moderates it. It opens when Show other listeners is on.")
      : tt("studio.roomTown", "Choose the town you go out from, and its room opens here.");
    const go = $s("roomwaitgo");
    go.hidden = !off;
    go.textContent = tt("studio.roomOn", "Show other listeners");
    go.onclick = () => window.auralfm.setPrefs({ presence: true });
  }
  // The Go live button follows the name without repainting the field being typed in.
  const syncGo = () => { const b = $s("stLive"); if (b) b.disabled = !ready(); };
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
  const heardNow = () => [...heard.values()].filter((l) => l.pc.connectionState === "connected").length;
  function paintHeard() {
    const n = $s("stHeard");
    if (n) n.textContent = `${heardNow()} ${tt("studio.listening", "listening")}`;
  }
  function dropListener(sid) {
    const l = heard.get(sid);
    if (!l) return;
    heard.delete(sid);
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
    heard.set(msg.sid, { pc, from });
    try {
      for (const tr of mixDest.stream.getAudioTracks()) pc.addTrack(tr, mixDest.stream);
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "closed") dropListener(msg.sid);
        else paintHeard();
      };
      await pc.setRemoteDescription({ type: "offer", sdp: msg.sdp });
      await pc.setLocalDescription(await pc.createAnswer());
      await window.AuralRtc.gathered(pc);
      if (phase !== "live" || !heard.has(msg.sid)) return dropListener(msg.sid);
      const sent = await window.AuralRtc.send(from, { t: "answer", sid: msg.sid, sdp: window.AuralRtc.music(pc.localDescription.sdp) });
      if (!sent) dropListener(msg.sid);
      // A listener who never completes the connection does not hold a place.
      setTimeout(() => { if (heard.get(msg.sid)?.pc === pc && pc.connectionState !== "connected") dropListener(msg.sid); }, 45000);
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
