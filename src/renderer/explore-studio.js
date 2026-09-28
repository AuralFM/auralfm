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
 * Hidden unless this is a development or beta build of the desktop app, a web
 * preview on this machine, or a web page opened with ?studio — so publishing the web
 * app does not show anyone a studio that cannot yet reach them.
 */
{
  const $s = (id) => document.getElementById(id);
  const btn = $s("studioBtn"), panel = $s("studiopanel"), body = $s("studiobody");
  const KEY = "auralfm.studio";
  const tt = (k, f) => (typeof t === "function" ? t(k, f) : f);

  // ── who may see it ───────────────────────────────────────────────────────
  async function allowed() {
    try {
      const q = new URLSearchParams(location.search);
      if (q.has("studio")) { try { localStorage.setItem(`${KEY}.labs`, "1"); } catch {} return true; }
      try { if (localStorage.getItem(`${KEY}.labs`) === "1") return true; } catch {}
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
    deviceId: saved.deviceId || "", micVol: saved.micVol ?? 1, musicVol: saved.musicVol ?? 0.6,
    duck: saved.duck ?? true, monitor: false, place: null, rights: false, adult: false,
  };
  const keep = () => {
    const { title, about, vibe, explicit, deviceId, micVol, musicVol, duck } = show;
    try { localStorage.setItem(KEY, JSON.stringify({ title, about, vibe, explicit, deviceId, micVol, musicVol, duck })); } catch {}
  };
  let phase = "off", startedAt = 0, clock = 0;

  // ── the sound ────────────────────────────────────────────────────────────
  // mic → micGain ─┐
  //                ├→ mix → mixAn ─→ mixStream (what a transport will send)
  // track → music ─┘          └────→ speakers, only when monitoring
  let ctx = null, micStream = null, micSrc = null, micGain = null, micAn = null;
  let track = null, musicGain = null, musicAn = null, mix = null, mixAn = null, mixDest = null;
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
  function closeAudio() {
    cancelAnimationFrame(raf); raf = 0;
    micStream?.getTracks().forEach((tr) => tr.stop()); micStream = null;
    stopTrack();
    setMonitor(false);
  }
  function setMonitor(on) {
    show.monitor = on;
    if (!mix || !ctx) return;
    try { mix.disconnect(ctx.destination); } catch {}
    if (on) mix.connect(ctx.destination);
  }
  // A track from this device, under the voice: the station's music bed.
  // Streamed from the file as it plays, never decoded whole (studio-deck.js).
  let trackLoading = false, trackNote = "";
  async function loadTrack(file) { return loadBlob(file.name, file); }
  async function loadTrackData(name, data) { return loadBlob(name, new Blob([data])); }
  async function loadBlob(name, blob) {
    graph();
    stopTrack();
    track?.release();
    track = null;
    trackNote = "";
    trackLoading = true;
    paint();
    try {
      track = await window.StudioDeck.load(ctx, musicGain, blob, name);
    } catch {
      trackNote = tt("studio.trackBad", "That file could not be played. Try an MP3, M4A, WAV, FLAC or OGG file.");
    }
    trackLoading = false;
    paint();
  }
  /**
   * A track from a link (desktop: main fetches it, src/main/ipc-app.js). Melton,
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
    const r = await window.auralfm.studioFetchTrack(url);
    linking = false;
    if (r?.data) { linkNote = ""; await loadTrackData(r.name, r.data); return; }
    linkNote = {
      https: tt("studio.linkBad", "That is not a link. Paste one that starts with https://."),
      page: tt("studio.linkPage", "That link is a web page, not an audio file. Use the link to the file itself (it usually ends in .mp3, .m4a or .wav)."),
      stream: tt("studio.linkStream", "That is a live stream. A track has to be a file with an end: use a link to a recording."),
      big: tt("studio.linkBig", "That file is over 300 MB. Use a shorter or smaller file."),
      slow: tt("studio.linkSlow", "That took too long to download. Try again, or download it and add the file."),
    }[r?.error] || tt("studio.linkFailed", "That link could not be fetched. Check it opens in a browser, then try again.");
    paint();
  }
  const playing = () => !!track && !track.el.paused;
  function playTrack() { track?.el.play().catch(() => { trackNote = tt("studio.trackBad", "That file could not be played. Try an MP3, M4A, WAV, FLAC or OGG file."); paint(); }); }
  function stopTrack() { track?.el.pause(); }
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
      }
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
  const hasSound = () => !!micStream || !!track;
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
      el("span", { class: "airpill", role: "status" }, el("i"), el("span", { text: label }), (phase === "live" || phase === "rehearsal") ? el("span", { id: "airclock", text: "00:00:00" }) : null)));
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
      phase === "live" ? tt("studio.livePrototype", "This is a prototype: your town is marked live on the globe, but nobody can hear you yet. Sending the sound to listeners is the next step.")
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
        const sel = el("select", { id: "stDevice", "aria-label": tt("studio.micPick", "Microphone"),
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
        if (builtIn) sound.append(el("button", { class: "linkbtn", type: "button", id: "stBuiltIn",
          onclick: () => { show.deviceId = builtIn.deviceId; keep(); openMic(); } }, tt("studio.micUseBuiltIn", "Use the computer's microphone")));
      }
      sound.append(el("div", { class: "srcrow" }, el("span", { text: tt("studio.voice", "Voice") }),
        el("input", { type: "range", min: "0", max: "2", step: "0.01", value: String(show.micVol), "aria-label": tt("studio.voiceLevel", "Voice level"),
          oninput: (e) => { show.micVol = +e.target.value; micGain.gain.value = show.micVol; keep(); } })), meter("meterMic"));
    }
    const pick = el("input", { type: "file", accept: "audio/*,.mp3,.m4a,.aac,.wav,.flac,.ogg,.oga,.opus,.webm", id: "stFile", hidden: true,
      onchange: (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) loadTrack(f); } });
    sound.append(pick);
    if (!track) {
      sound.append(el("div", { class: "deck" }, el("span", { class: "name", role: "status",
        text: trackLoading ? tt("studio.trackLoading", "Opening the track…") : tt("studio.noTrack", "No music under you yet") }),
        el("button", { class: "linkbtn", type: "button", disabled: trackLoading, onclick: () => pick.click() }, tt("studio.addTrack", "Add a track"))));
    }
    if (trackNote) sound.append(el("p", { class: "fine", role: "alert", text: trackNote }));
    // From a link: the desktop only, which can fetch it (on the web the page's
    // security rules forbid reaching an arbitrary address, so it is not offered).
    // `in`, not a truthy test: the web bridge answers any name it lacks with an
    // empty stand-in (web/bridge.js), so only `in` tells the desktop apart.
    if ("studioFetchTrack" in window.auralfm) {
      const url = el("input", { type: "url", id: "stLink", inputmode: "url", spellcheck: "false", autocapitalize: "off",
        placeholder: "https://…/show.mp3", "aria-label": tt("studio.linkLabel", "Link to an audio file") });
      sound.append(el("form", { class: "srcrow linkrow", onsubmit: (e) => { e.preventDefault(); loadLink(url.value); } },
        url, el("button", { class: "linkbtn", type: "submit", disabled: linking },
          linking ? tt("studio.linkFetching", "Fetching…") : tt("studio.linkAdd", "Add from a link"))));
      if (linkNote) sound.append(el("p", { class: "fine", role: "alert", text: linkNote }));
    }
    if (track) {
      sound.append(el("div", { class: "deck" },
        el("button", { class: "sheetbtn", type: "button", id: "stPlay", onclick: async () => { await ctx.resume(); playing() ? stopTrack() : playTrack(); meters(); setTimeout(paint, 50); } },
          playing() ? tt("studio.pause", "Pause") : tt("studio.play", "Play")),
        el("span", { class: "name", text: track.name }),
        el("button", { class: "linkbtn", type: "button", onclick: () => pick.click() }, tt("studio.change", "Change"))));
      sound.append(el("div", { class: "srcrow" }, el("span", { text: tt("studio.music", "Music") }),
        el("input", { type: "range", min: "0", max: "1", step: "0.01", value: String(show.musicVol), "aria-label": tt("studio.musicLevel", "Music level"),
          oninput: (e) => { show.musicVol = +e.target.value; keep(); } })), meter("meterMusic"));
    }
    sound.append(toggleRow(tt("studio.duck", "Music dips when you talk"), show.duck, () => { show.duck = !show.duck; keep(); if (!show.duck && musicGain) musicGain.gain.value = show.musicVol; paint(); }));
    sound.append(toggleRow(tt("studio.monitor", "Hear yourself"), show.monitor, () => { setMonitor(!show.monitor); paint(); },
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

  // ── open and close ───────────────────────────────────────────────────────
  function setOpen(on) {
    panel.hidden = !on;
    btn.setAttribute("aria-pressed", String(on));
    document.body.classList.toggle("studio-open", on);
    if (on) {
      // One panel on that side at a time: the headlines share it.
      if (typeof newsOpen !== "undefined" && newsOpen) $s("newsClose")?.click();
      if (!show.place && selection?.place && !selection.place.nowhere) usePlace();
      paint();
      if (micStream) meters();
      $s("studiotitle")?.focus?.();
    } else if (phase === "off") closeAudio();
  }

  window.AuralStudio = { live: null, open: () => setOpen(true) };
  allowed().then(async (ok) => {
    if (!ok || !btn || !panel) return;
    btn.hidden = false;
    Icons.set(btn, "mic");
    btn.onclick = () => setOpen(panel.hidden);
    $s("studioClose").onclick = () => setOpen(false);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !panel.hidden && !e.target.closest?.("input, textarea, select")) setOpen(false); });
    const vibes = await Promise.resolve(window.auralfm.vibes?.()).catch(() => []) || [];
    studioVibes = [...vibes, { id: "talk-show", name: tt("studio.vibeTalk", "Talk") }].filter((v, i, a) => a.findIndex((x) => x.name === v.name) === i);
  });
}
