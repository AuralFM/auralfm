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
 * preview on this machine. Nowhere else yet.
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

  // ── listening ────────────────────────────────────────────────────────────
  let show = null;                 // { peer, sid, pc, state, why, timer }
  let live = [];                   // the shows on air, from the peers the relays have shown us
  const audio = new Audio();
  audio.autoplay = true;

  const WHY = () => ({
    unsent: tl("shows.unsent", "Could not reach the show's town. Check your connection and try again."),
    noanswer: tl("shows.noAnswer", "The host did not answer. They may have gone off air, or one of your two networks does not allow a direct connection."),
    full: tl("shows.full", "This show has all the listeners it can carry. Try again in a while."),
    ended: tl("shows.ended", "The show has ended."),
    lost: tl("shows.lost", "The connection to the show was lost."),
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
    show = why ? { peer: s.peer, sid: null, pc: null, state: "failed", why } : null;
    stand(null);
    paint();
  }
  async function stop() {
    if (show?.pc && show.sid) window.AuralRtc.send(show.peer.pubkey, { t: "bye", sid: show.sid });
    end();
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
      else if (pc.connectionState === "failed" || pc.connectionState === "closed") end(show.state === "on" ? "lost" : "noanswer");
    };
    try {
      await pc.setLocalDescription(await pc.createOffer());
      await gathered(pc);
    } catch { return end("noanswer"); }
    if (show?.sid !== sid) return;
    const sent = await window.AuralRtc.send(peer.pubkey, { t: "offer", sid, sdp: music(pc.localDescription.sdp) });
    if (show?.sid !== sid) return;
    if (!sent) return end("unsent");
    show.timer = setTimeout(() => { if (show?.sid === sid && show.state === "connecting") end("noanswer"); }, 30000);
  }
  // The host's reply. Matched by the id only the two of us know: it travelled
  // sealed, and a host with a lasting identity answers from a different key
  // than the one their presence shows.
  window.AuralRtc.onSignal(async (_from, msg) => {
    if (!show?.pc || msg.sid !== show.sid) return;
    if (msg.t === "answer" && typeof msg.sdp === "string" && show.pc.signalingState === "have-local-offer") {
      try { await show.pc.setRemoteDescription({ type: "answer", sdp: msg.sdp }); } catch { end("noanswer"); }
    } else if (msg.t === "full") end("full");
    else if (msg.t === "bye") end("ended");
  });
  // Pressing play on a station is choosing it over the show.
  new MutationObserver(() => { if (show?.state === "on" && document.body.classList.contains("playing")) stop(); })
    .observe(document.body, { attributes: true, attributeFilter: ["class"] });

  // ── the list ─────────────────────────────────────────────────────────────
  function paint() {
    const card = $l("livenow"), list = $l("livelist");
    if (!card || !list) return;
    const rows = live.slice();
    // The show being heard stays listed while its ring is between heartbeats.
    if (show && !rows.some((p) => p.pubkey === show.peer.pubkey)) rows.unshift(show.peer);
    card.hidden = !(window.AuralStudio?.on && rows.length);
    list.textContent = "";
    if (card.hidden) return;
    for (const p of rows) {
      const mine = show?.peer.pubkey === p.pubkey ? show : null;
      const row = document.createElement("div");
      row.className = `liverow${mine?.state === "on" ? " on" : ""}`;
      const name = document.createElement("button");
      name.type = "button"; name.className = "livename";
      name.textContent = p.label || tl("shows.aShow", "A show");
      name.title = tl("shows.find", "Show it on the globe");
      name.setAttribute("aria-label", `${name.textContent}: ${name.title}`);
      name.onclick = () => { if (typeof flyTo === "function") flyTo(p.lat, p.lon); };
      const act = document.createElement("button");
      act.type = "button"; act.className = "linkbtn";
      const busy = mine && (mine.state === "connecting" || mine.state === "on");
      act.textContent = busy ? tl("shows.stop", "Stop") : tl("shows.listen", "Listen");
      act.setAttribute("aria-label", `${act.textContent}: ${name.textContent}`);
      act.onclick = () => (busy ? stop() : listen(p));
      row.append(name, act);
      list.append(row);
      if (mine) {
        const say = document.createElement("p");
        say.className = "livesay";
        say.setAttribute("role", mine.state === "failed" ? "alert" : "status");
        say.textContent = mine.state === "connecting" ? tl("shows.connecting", "Connecting to the host…")
          : mine.state === "on" ? tl("shows.on", "Listening, straight from the host's device.")
          : WHY()[mine.why] || WHY().noanswer;
        list.append(say);
      }
    }
    const note = document.createElement("p");
    note.className = "livesay";
    note.textContent = tl("shows.note", "A show comes straight from the host's device to yours, so each can see the other's network address, as a station's server does when you play it.");
    list.append(note);
  }
  /** Called with the peers each time they change (explore-chat.js). */
  window.AuralShows = {
    peers(list) {
      live = (Array.isArray(list) ? list : []).filter((p) => p.live);
      // The host has stopped saying the show is on.
      paint();
    },
    listen, stop,
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
