/**
 * Shows you can hear: a listener's side of "Your show" (6 Oct 2026).
 *
 * A host goes live from the studio (explore-studio.js) and their town's ring
 * on the globe turns into a show's. This file is what happens when somebody
 * else presses Listen: the two devices agree to connect, and the host's sound
 * arrives straight from the host's computer. No server of ours carries it, and
 * there is none that could.
 *
 * ## How the two find each other
 *
 * The host's presence already says "someone is in this town" once a minute
 * (src/presence-nostr.js). Live, the label that travels with it is the show's
 * name, marked as a show. That is the whole announcement, and it stops being
 * made the moment the host goes off air.
 *
 * To connect, the listener writes a description of how their device can be
 * reached (WebRTC calls it an offer) and sends it to the host inside the same
 * private envelope a direct message uses: sealed to the host's key, unreadable
 * to every relay it passes through. The host answers the same way. From then
 * on the relays are out of it: the sound goes device to device.
 *
 * ## What that costs, said plainly
 *
 * A direct connection means each side can see the other's network address, as
 * a station's own server sees a listener's when its stream is played. The
 * panel says so before anybody presses Listen. And a share of networks will
 * not allow a direct connection at all (the plan's estimate is one in five or
 * ten): those listeners get "the host did not answer", not silence.
 *
 * ## Where it is on
 *
 * Where the studio is: the desktop's development and beta builds, and a
 * preview on this machine. And, for listening only, in a browser that has
 * opened the app once with ?ears (Melton, 6 Oct 2026: a private link, so a
 * host with one computer can hear their own show on their phone). ?ears=off
 * takes it away again. The studio itself has no such link
 * (explore-studio.js, and the audit holds that).
 */
{
  const $l = (id) => document.getElementById(id);
  const tl = (k, f) => (typeof t === "function" ? t(k, f) : f);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // ── what the host and the listener share ─────────────────────────────────
  // Where a device learns its own public address, to tell the other side.
  // Nothing passes through these but that one question.
  const ICE = [{ urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"] }];
  /** A handshake older than this was kept by a relay and handed back: not a live one. */
  const MAX_AGE_MS = 90_000;
  /**
   * Music, not a phone call. Left alone, the sound is encoded as one voice: in
   * mono, at a rate that is fine for speech. Asking for stereo at 128 kbps is a
   * line in the description each side sends the other.
   */
  const music = (sdp) => String(sdp || "").replace(/(a=fmtp:\d+ [^\r\n]*useinbandfec=1)/g, "$1;stereo=1;sprop-stereo=1;maxaveragebitrate=128000");
  /** The whole description in one message: wait until the device has found its addresses. */
  const gathered = (pc, ms = 4000) => new Promise((done) => {
    if (pc.iceGatheringState === "complete") return done();
    const timer = setTimeout(done, ms);
    pc.addEventListener("icegatheringstatechange", () => { if (pc.iceGatheringState === "complete") { clearTimeout(timer); done(); } });
  });
  const handlers = new Set();
  window.auralfm.onRtcSignal?.((from, payload, at) => {
    if (!payload || typeof payload !== "object" || typeof payload.sid !== "string") return;
    if (Math.abs(Date.now() - Number(at)) > MAX_AGE_MS) return;
    for (const h of handlers) { try { h(from, payload); } catch { /* one bad handshake is not the others' problem */ } }
  });
  window.AuralRtc = {
    ICE, music, gathered,
    onSignal: (h) => handlers.add(h),
    send: async (to, payload) => { try { return !!(await window.auralfm.rtcSignal?.(to, payload)); } catch { return false; } },
  };

  // ── where it is on ───────────────────────────────────────────────────────
  const EARS = "auralfm.shows.ears";
  let ears = false;
  try {
    const q = new URLSearchParams(location.search);
    if (q.has("ears")) { if (q.get("ears") === "off") localStorage.removeItem(EARS); else localStorage.setItem(EARS, "1"); }
    ears = localStorage.getItem(EARS) === "1";
  } catch { /* no storage: the link works for this visit only */ ears = new URLSearchParams(location.search).has("ears"); }
  const on = () => !!window.AuralStudio?.on || ears;

  // ── listening ────────────────────────────────────────────────────────────
  let show = null;                 // { peer, sid, pc, state, why, timer }
  let live = [];                   // the shows on air, from the peers the relays have shown us
  const gone = new Set();          // hosts reported or muted: their shows are not listed here again
  let said = "";                   // one line under the list, for a few seconds
  Promise.resolve(window.auralfm.muteList?.()).then((list) => { for (const k of list || []) gone.add(typeof k === "string" ? k : k?.pubkey); paint(); }).catch(() => {});
  const audio = new Audio();
  audio.autoplay = true;
  audio.setAttribute("playsinline", "");
  /**
   * A phone plays sound only from a tap, and the show's sound arrives seconds
   * after the tap, at the end of the handshake. So the player is started on
   * the tap itself, on an empty stream; the phone then lets it carry on when
   * the real one is put in its place.
   */
  function prime() {
    try { if (!audio.srcObject) audio.srcObject = new MediaStream(); audio.play().catch(() => {}); } catch { /* an older browser: it will ask, or stay silent */ }
  }

  const WHY = () => ({
    unsent: tl("shows.unsent", "No connection. Try again."),
    noanswer: tl("shows.noAnswer", "No answer from the host."),
    full: tl("shows.full", "The show is full."),
    blocked: tl("shows.blocked", "The host answered. The two devices could not connect."),
    ended: tl("shows.ended", "The show ended."),
    lost: tl("shows.lost", "Connection lost."),
  });

  /** Stand in the show's town (its room, and the relays the handshake travels on), or leave it. */
  function stand(peer) {
    window.AuralShow = peer ? { lat: peer.lat, lon: peer.lon, title: peer.label || tl("shows.aShow", "A show"), pubkey: peer.pubkey } : null;
    // A host in their own studio is already standing somewhere: leave that alone.
    if (!window.AuralStudio?.hosting) window.auralfm.studioHost?.(peer ? peer.lat : null, peer ? peer.lon : null, false, "");
    if (typeof syncChat === "function" && typeof prefs !== "undefined") syncChat(prefs);
  }
  function end(why) {
    const s = show;
    if (!s) return;
    clearTimeout(s.timer);
    try { if (s.pc) { s.pc.ontrack = s.pc.onconnectionstatechange = null; s.pc.close(); } } catch {}
    audio.pause(); audio.srcObject = null;
    // A failure stays on the beacon for a few seconds: on a phone the list is
    // in the sheet, and the beacon is the only thing in view.
    show = why ? { peer: s.peer, sid: null, pc: null, state: "failed", why, until: Date.now() + 7000 } : null;
    if (why) setTimeout(paint, 7100);
    stand(null);
    paint();
  }
  async function stop() {
    if (show?.pc && show.sid) window.AuralRtc.send(show.peer.pubkey, { t: "bye", sid: show.sid });
    end();
  }
  /**
   * Report a show. As in the chat (src/main/ipc-chat.js): the host is muted on
   * this device at once, which is the part that takes effect, and a draft of
   * an email to AuralFM opens with the show's name and the host's key in it,
   * which nothing sends but the person. There is no server to take a report.
   */
  async function report(peer) {
    gone.add(peer.pubkey);
    if (show?.peer.pubkey === peer.pubkey) await stop();
    live = live.filter((p) => p.pubkey !== peer.pubkey);
    said = tl("shows.reported", "Hidden. A report draft opened in your mail app.");
    setTimeout(() => { said = ""; paint(); }, 8000);
    paint();
    try { await window.auralfm.chatReport?.({ show: true, pubkey: peer.pubkey, geohash: peer.geohash || "", at: Date.now(), text: peer.label || "" }); } catch { /* muted all the same */ }
  }
  async function listen(peer) {
    if (window.AuralStudio?.live) return;             // on air yourself: one sound at a time
    if (show) await stop();
    const sid = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, "0")).join("");
    show = { peer, sid, pc: null, state: "connecting" };
    paint();
    // One sound at a time: the station playing stops, as it does for a host.
    if (document.body.classList.contains("playing")) window.auralfm.transport?.({ action: "toggle" });
    stand(peer);
    // The town's relays, before anything can be sent through them.
    for (let i = 0; i < 30 && show?.sid === sid; i++) {
      const st = await Promise.resolve(window.auralfm.presenceStats?.()).catch(() => null);
      if (st?.cell && st.connected > 0) break;
      await wait(300);
    }
    if (show?.sid !== sid) return;
    const pc = new RTCPeerConnection({ iceServers: ICE });
    show.pc = pc;
    pc.addTransceiver("audio", { direction: "recvonly" });
    pc.ontrack = (e) => { audio.srcObject = e.streams[0] || new MediaStream([e.track]); audio.play().catch(() => {}); };
    pc.onconnectionstatechange = () => {
      if (show?.pc !== pc) return;
      if (pc.connectionState === "connected") { show.state = "on"; clearTimeout(show.timer); paint(); }
      // Three different failures, and a host with a tester needs to know which:
      // it was playing and dropped; the host replied but the two devices could
      // not reach each other; or nothing came back at all.
      else if (pc.connectionState === "failed" || pc.connectionState === "closed") end(show.state === "on" ? "lost" : show.answered ? "blocked" : "noanswer");
    };
    try {
      await pc.setLocalDescription(await pc.createOffer());
      await gathered(pc);
    } catch { return end("noanswer"); }
    if (show?.sid !== sid) return;
    const sent = await window.AuralRtc.send(peer.pubkey, { t: "offer", sid, sdp: music(pc.localDescription.sdp) });
    if (show?.sid !== sid) return;
    if (!sent) return end("unsent");
    show.timer = setTimeout(() => { if (show?.sid === sid && show.state === "connecting") end(show.answered ? "blocked" : "noanswer"); }, 30000);
  }
  // The host's reply. Matched by the id only the two of us know: it travelled
  // sealed, and a host with a lasting identity answers from a different key
  // than the one their presence shows.
  window.AuralRtc.onSignal(async (_from, msg) => {
    if (!show?.pc || msg.sid !== show.sid) return;
    if (msg.t === "answer" && typeof msg.sdp === "string" && show.pc.signalingState === "have-local-offer") {
      show.answered = true;
      try { await show.pc.setRemoteDescription({ type: "answer", sdp: msg.sdp }); } catch { end("blocked"); }
    } else if (msg.t === "full") end("full");
    else if (msg.t === "bye") end("ended");
  });
  // Pressing play on a station is choosing it over the show.
  new MutationObserver(() => { if (show?.state === "on" && document.body.classList.contains("playing")) stop(); })
    .observe(document.body, { attributes: true, attributeFilter: ["class"] });

  // ── the player row ───────────────────────────────────────────────────────
  /**
   * While a show is being heard, the row at the bottom is the show's: its
   * name, "On air", and a button that stops it. It went on naming the last
   * station (and offering to play it) with a show in your ears. The station's
   * own controls (lock, favourite, share, its card) step back: they act on a
   * station, and this is not one.
   */
  let rowWas = null;               // what the row said before the show took it
  function now() {
    const bar = $l("now"), name = $l("nowName"), status = $l("nowStatus");
    if (!bar || !name || !status) return;
    const mine = show && (show.state === "connecting" || show.state === "on");
    document.body.classList.toggle("onshow", !!mine);
    if (mine) {
      if (!rowWas) rowWas = { hidden: bar.hidden };
      bar.hidden = false;
      name.textContent = show.peer.label || tl("shows.aShow", "A show");
      status.textContent = show.state === "on" ? tl("shows.onAir", "On air") : tl("shows.connecting", "Connecting…");
      status.classList.remove("err");
      const spoken = `${name.textContent}, ${status.textContent}`;
      if ($l("nowSpoken") && $l("nowSpoken").textContent !== spoken) $l("nowSpoken").textContent = spoken;
      if (typeof Icons !== "undefined") Icons.set($l("play"), "pause");
      const label = tl("shows.stop", "Stop");
      $l("play")?.setAttribute("aria-label", `${label}: ${name.textContent}`);
      if ($l("play")) $l("play").title = label;
    } else if (rowWas) {
      const was = rowWas; rowWas = null;
      // Back to the station: its name and state as the player last gave them.
      const s = window.AuralPlayerSeen;
      if (s?.channel) {
        name.textContent = s.channel.title;
        status.textContent = s.status || "";
        status.classList.toggle("err", !!s.error);
        if (typeof setPlayName === "function") setPlayName(!!s.playing);
      } else bar.hidden = was.hidden;
    }
  }
  // The row's button stops the show, before the player hears the press.
  document.addEventListener("click", (e) => {
    if (!document.body.classList.contains("onshow") || !e.target.closest?.("#play")) return;
    e.preventDefault(); e.stopImmediatePropagation();
    stop();
  }, true);

  // ── the list, and the beacons ────────────────────────────────────────────
  const shown = () => on() && (typeof layers === "undefined" || layers.onAir !== false);
  const WORDS = () => ({
    connecting: tl("shows.connecting", "Connecting…"),
    on: tl("shows.on", "Listening."),
  });
  // Looking for shows with nothing playing (src/presence-nostr.js, watch): only
  // where shows are on, with the On Air layer, and with "Show other listeners".
  let watching = null;
  function sync() {
    const want = shown() && typeof prefs !== "undefined" && prefs?.presence === true;
    if (want !== watching) { watching = want; window.auralfm.showsWatch?.(want); }
  }
  function paint() {
    sync();
    now();
    pins();
    const card = $l("livenow"), list = $l("livelist");
    if (!card || !list) return;
    const rows = live.filter((p) => !gone.has(p.pubkey));
    // The show being heard stays listed while its ring is between heartbeats.
    if (show && !rows.some((p) => p.pubkey === show.peer.pubkey)) rows.unshift(show.peer);
    card.hidden = !(shown() && (rows.length || said));
    list.textContent = "";
    if (card.hidden) return;
    for (const p of rows) {
      const mine = show?.peer.pubkey === p.pubkey ? show : null;
      const busy = !!mine && (mine.state === "connecting" || mine.state === "on");
      const title = p.label || tl("shows.aShow", "A show");
      const row = document.createElement("div");
      row.className = `liverow${busy ? " on" : ""}`;
      const name = document.createElement("button");
      name.type = "button"; name.className = "livename";
      name.textContent = title;
      name.title = tl("shows.find", "Show on the globe");
      name.setAttribute("aria-label", `${title}: ${name.title}`);
      name.onclick = () => { if (typeof flyTo === "function") flyTo(p.lat, p.lon); };
      const act = document.createElement("button");
      act.type = "button"; act.className = "linkbtn";
      act.textContent = busy ? tl("shows.stop", "Stop") : tl("shows.listen", "Listen");
      act.setAttribute("aria-label", `${act.textContent}: ${title}`);
      act.onclick = () => { if (busy) return stop(); prime(); listen(p); };
      row.append(name, act);
      list.append(row);
      if (mine) {
        const say = document.createElement("p");
        say.className = "livesay";
        say.setAttribute("role", mine.state === "failed" ? "alert" : "status");
        say.textContent = WORDS()[mine.state] || WHY()[mine.why] || WHY().noanswer;
        // Report sits with the show it is about, once it has been tried.
        const rep = document.createElement("button");
        rep.type = "button"; rep.className = "livereport";
        rep.textContent = tl("shows.report", "Report");
        rep.setAttribute("aria-label", `${rep.textContent}: ${title}`);
        rep.onclick = () => report(p);
        say.append(" ", rep);
        list.append(say);
      }
    }
    if (said) { const p = document.createElement("p"); p.className = "livesay"; p.setAttribute("role", "status"); p.textContent = said; list.append(p); }
    const note = document.createElement("p");
    note.className = "livesay fine";
    note.textContent = tl("shows.note", "Direct from the host. Each side sees the other's network address.");
    list.append(note);
  }
  /**
   * A show's beacon on the globe: a pill at its town with the show's name and a
   * halo that breathes, and a button (press it to listen). Melton, 6 Oct 2026:
   * the ring alone was easy to miss. One element per show, kept between paints
   * so the halo does not restart every time a heartbeat arrives.
   */
  const pinOf = new Map();
  function pins() {
    if (typeof globe === "undefined" || !globe || !globe.htmlElementsData) return;
    const rows = shown() ? live.filter((p) => !gone.has(p.pubkey)) : [];
    const told = (s) => s?.state === "failed" && Date.now() < s.until;
    if (shown() && show && (show.state === "connecting" || show.state === "on" || told(show)) && !rows.some((p) => p.pubkey === show.peer.pubkey)) rows.push(show.peer);
    for (const k of [...pinOf.keys()]) if (!rows.some((p) => p.pubkey === k)) pinOf.delete(k);
    for (const p of rows) {
      let b = pinOf.get(p.pubkey);
      if (!b) {
        b = document.createElement("button");
        b.type = "button"; b.className = "onair-pin";
        b.append(document.createElement("i"), document.createElement("span"));
        // Read at press time: the peer under this pin is replaced by each heartbeat.
        b.onclick = (e) => {
          e.stopPropagation();
          const now = live.find((x) => x.pubkey === p.pubkey) || p;
          if (show?.peer.pubkey === p.pubkey && (show.state === "connecting" || show.state === "on")) return stop();
          prime(); listen(now);
        };
        // The globe centres whatever it is given on the town. A holder of no
        // size goes there, and the pill hangs from it by its dot, so the dot
        // and its halo sit on the town and the name runs off to the right.
        const at = document.createElement("div");
        at.className = "onair-at";
        at.append(b);
        b.holder = at;
        pinOf.set(p.pubkey, b);
      }
      const title = p.label || tl("shows.aShow", "A show");
      const own = show?.peer.pubkey === p.pubkey ? show : null;
      const mine = !!own && (own.state === "connecting" || own.state === "on");
      // The beacon says what is happening to it: connecting, playing (its dot
      // becomes a stop square), or, for a few seconds, why it did not connect.
      b.lastChild.textContent = own?.state === "connecting" ? WORDS().connecting : told(own) ? (WHY()[own.why] || WHY().noanswer) : title;
      b.classList.toggle("on", mine);
      b.classList.toggle("playing", own?.state === "on");
      b.classList.toggle("say", told(own));
      b.setAttribute("aria-label", `${mine ? tl("shows.stop", "Stop") : tl("shows.listenTo", "Listen to")} ${title}`);
    }
    globe.htmlElementsData(rows.map((p) => ({ lat: p.lat, lng: p.lon, key: p.pubkey })))
      .htmlLat("lat").htmlLng("lng").htmlAltitude(0.07)
      .htmlElement((d) => pinOf.get(d.key).holder);
    // Behind the planet a beacon is not a thing to press.
    globe.htmlElementVisibilityModifier?.((el, visible) => { el.style.opacity = visible ? "1" : "0"; if (el.firstChild) el.firstChild.style.pointerEvents = visible ? "auto" : "none"; });
  }
  /** Called with the peers each time they change (explore-chat.js). */
  window.AuralShows = {
    peers(list) {
      live = (Array.isArray(list) ? list : []).filter((p) => p.live);
      // The host has stopped saying the show is on.
      paint();
    },
    listen, stop, report,
    /** The On Air layer was switched (explore-view.js), or a preference (explore-chat.js). */
    layer() { paint(); },
    /** The player painted its row (explore-playback.js): a show being heard takes it back. */
    now,
    get on() { return on(); },
    get state() { return show ? { state: show.state, why: show.why || null, title: show.peer.label } : null; },
    /** What has arrived, for telling a connection that carries sound from one that only says it is up. */
    async heard() {
      if (!show?.pc) return null;
      for (const r of (await show.pc.getStats()).values()) {
        if (r.type === "inbound-rtp" && r.kind === "audio") return { bytes: r.bytesReceived || 0, packets: r.packetsReceived || 0, energy: r.totalAudioEnergy || 0 };
      }
      return null;
    },
  };
}
