/**
 * KiwiSDR client — shortwave audio from someone else's antenna.
 *
 * A KiwiSDR is a BeagleBone with a wideband receiver on it, sitting in a few
 * hundred private gardens around the world, hung on the internet by its owner.
 * It speaks a small WebSocket protocol: text commands out, tagged binary frames
 * back. This is the subset needed to tune a frequency and hear the result — the
 * reference implementation is jks-prv/kiwiclient, which is Python; this is the
 * same protocol from a browser.
 *
 * Why this exists at all: every one of the 38,342 stations in the catalogue is
 * an Icecast endpoint on somebody's server. Shortwave is the one thing in this
 * app that isn't. The signal reaches that antenna off the ionosphere, with no
 * company anywhere in the middle. Borrowing the antenna is the only part that
 * needs the internet.
 *
 * Loaded as a plain script in the popover, and readable by Node for tests, so it
 * hangs itself off globalThis rather than using a module system either side
 * would have to special-case.
 */
(function (root) {
  "use strict";

  // ── IMA ADPCM ──────────────────────────────────────────────────────────────
  // 4 bits per sample, so the Kiwi ships audio at a quarter the size of PCM.
  // Tables are the IMA standard; the Kiwi uses them unmodified.
  const STEP = [
    7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45,
    50, 55, 60, 66, 73, 80, 88, 97, 107, 118, 130, 143, 157, 173, 190, 209, 230,
    253, 279, 307, 337, 371, 408, 449, 494, 544, 598, 658, 724, 796, 876, 963,
    1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066, 2272, 2499, 2749, 3024,
    3327, 3660, 4026, 4428, 4871, 5358, 5894, 6484, 7132, 7845, 8630, 9493,
    10442, 11487, 12635, 13899, 15289, 16818, 18500, 20350, 22385, 24623, 27086,
    29794, 32767,
  ];
  const INDEX_ADJUST = [-1, -1, -1, -1, 2, 4, 6, 8, -1, -1, -1, -1, 2, 4, 6, 8];

  /**
   * Decoder state is carried across frames, not reset per frame — the Kiwi
   * treats the whole session as one continuous ADPCM stream. Resetting per frame
   * produces a click at every boundary and a slow DC drift.
   */
  class AdpcmDecoder {
    constructor() { this.index = 0; this.prev = 0; }

    sample(code) {
      const step = STEP[this.index];
      this.index = Math.min(88, Math.max(0, this.index + INDEX_ADJUST[code]));
      let diff = step >> 3;
      if (code & 1) diff += step >> 2;
      if (code & 2) diff += step >> 1;
      if (code & 4) diff += step;
      if (code & 8) diff = -diff;
      this.prev = Math.min(32767, Math.max(-32768, this.prev + diff));
      return this.prev;
    }

    /** @param {Uint8Array} bytes @returns {Int16Array} two samples per byte, low nibble first */
    decode(bytes) {
      const out = new Int16Array(bytes.length * 2);
      for (let i = 0, j = 0; i < bytes.length; i++) {
        out[j++] = this.sample(bytes[i] & 0x0f);
        out[j++] = this.sample(bytes[i] >> 4);
      }
      return out;
    }
  }

  // ── frame parsing ──────────────────────────────────────────────────────────
  const TAG = (b) => String.fromCharCode(b[0], b[1], b[2]);

  /**
   * SND frame: "SND" | flags:u8 | seq:u32le | smeter:u16be | adpcm...
   * The S-meter is the receiver's signal strength in its own units; 0.1*v-127
   * gives dBm, which is what the Kiwi's own UI displays.
   */
  function parseSnd(buf) {
    const b = new Uint8Array(buf);
    const dv = new DataView(buf);
    return {
      seq: dv.getUint32(4, true),
      rssi: 0.1 * dv.getUint16(8, false) - 127,
      payload: b.subarray(10),
    };
  }

  /** MSG frames are "MSG" + space-separated key=value, values percent-encoded. */
  function parseMsg(buf) {
    const text = new TextDecoder().decode(new Uint8Array(buf).subarray(4));
    const out = {};
    for (const kv of text.split(" ")) {
      const i = kv.indexOf("=");
      if (i < 0) { if (kv) out[kv] = true; continue; }
      const k = kv.slice(0, i);
      try { out[k] = decodeURIComponent(kv.slice(i + 1)); }
      catch { out[k] = kv.slice(i + 1); }
    }
    return out;
  }

  // ── bands ──────────────────────────────────────────────────────────────────
  /**
   * Where there is reliably something to hear. Shortwave is not like FM: a band
   * that is full at midnight is empty at noon, because which frequencies bounce
   * off the ionosphere depends on whether the path is in daylight. The globe
   * already knows where the terminator is, so it can say which of these is
   * likely to be open for a given receiver.
   *
   * night/day is the broad rule of thumb — lower frequencies carry after dark,
   * higher ones during the day.
   */
  const BANDS = [
    { id: "wwv5",  label: "WWV 5 MHz",   freq: 5000,   mode: "am",  when: "night", hint: "US time signal" },
    { id: "wwv10", label: "WWV 10 MHz",  freq: 10000,  mode: "am",  when: "any",   hint: "US time signal" },
    { id: "wwv15", label: "WWV 15 MHz",  freq: 15000,  mode: "am",  when: "day",   hint: "US time signal" },
    { id: "b49",   label: "49 m",        freq: 6100,   mode: "am",  when: "night", hint: "international broadcast" },
    { id: "b41",   label: "41 m",        freq: 7300,   mode: "am",  when: "night", hint: "international broadcast" },
    { id: "b31",   label: "31 m",        freq: 9600,   mode: "am",  when: "any",   hint: "international broadcast" },
    { id: "b25",   label: "25 m",        freq: 11800,  mode: "am",  when: "day",   hint: "international broadcast" },
    { id: "b19",   label: "19 m",        freq: 15400,  mode: "am",  when: "day",   hint: "international broadcast" },
    /**
     * Amateur bands, chosen from where the activity actually is rather than from
     * a band plan. The WSPR figures in #27 measured it over ten minutes: 20m
     * 8,873 spots, 40m 7,529, 30m 4,164, 80m 2,528, 17m 1,247, 15m 724. 10m had
     * none at all, which the propagation outlook explains — at a solar flux of
     * 127 it does not open.
     *
     * Convention worth knowing if these look wrong: below 10 MHz amateurs use
     * lower sideband and above it upper, for no better reason than that is how
     * the equipment was built and everyone stuck with it.
     */
    { id: "ham80", label: "80 m amateur", freq: 3750,  mode: "lsb", when: "night", hint: "voice, regional at night" },
    { id: "ham40", label: "40 m amateur", freq: 7100,  mode: "lsb", when: "night", hint: "voice, operators" },
    { id: "ham30", label: "30 m amateur", freq: 10130, mode: "cw",  when: "any",   hint: "morse and digital only, no voice" },
    { id: "ham20", label: "20 m amateur", freq: 14200, mode: "usb", when: "day",   hint: "voice, operators" },
    { id: "ham17", label: "17 m amateur", freq: 18130, mode: "usb", when: "day",   hint: "voice, long haul" },
    { id: "ham15", label: "15 m amateur", freq: 21300, mode: "usb", when: "day",   hint: "voice, needs an active sun" },
    { id: "ham10", label: "10 m amateur", freq: 28400, mode: "usb", when: "day",   hint: "voice, only when the sun is loud" },

    /**
     * Morse. Still the most efficient thing on the band — it gets through when
     * voice cannot, which is why it never went away — and it sounds like nothing
     * else you will hear. Narrow filters, because the whole point is a signal
     * squeezed into a few hundred hertz.
     */
    { id: "cw40", label: "40 m morse", freq: 7030,  mode: "cw", when: "night", hint: "CW — hand-sent and machine" },
    { id: "cw20", label: "20 m morse", freq: 14030, mode: "cw", when: "day",   hint: "CW — hand-sent and machine" },

    /**
     * Aviation, on shortwave.
     *
     * Out over an ocean an aircraft is far beyond VHF range, so it talks to the
     * ground on HF — the same ionospheric bounce everything else here uses. Tune
     * one of these from a receiver under the North Atlantic tracks and you hear
     * transatlantic flights reading their position back to Shannon or Gander,
     * and the continuous weather broadcasts they are listening for.
     *
     * This is the honest version of "add flights to the globe": you cannot
     * listen to a dot on a flight tracker, and you can listen to this.
     */
    { id: "natA",   label: "Atlantic air · 5.6",  freq: 5598,  mode: "usb", when: "night", hint: "oceanic air-ground" },
    { id: "natB",   label: "Atlantic air · 8.9",  freq: 8906,  mode: "usb", when: "day",   hint: "oceanic air-ground" },
    { id: "volmetS",label: "Shannon VOLMET",      freq: 8957,  mode: "usb", when: "day",   hint: "aviation weather, continuous" },
    { id: "volmetN",label: "New York VOLMET",     freq: 6604,  mode: "usb", when: "night", hint: "aviation weather, continuous" },
  ];

  // ── propagation outlook ────────────────────────────────────────────────────
  /**
   * Whether a frequency is worth trying from a given receiver, right now.
   *
   * Three inputs, and the band list previously used only the first:
   *
   *  - **Daylight.** Low frequencies are absorbed by the D layer during the day
   *    and carry for thousands of miles once it decays after dark. High
   *    frequencies need the sun to sustain the F layer, so they close at night.
   *
   *  - **Solar flux (F10.7).** How hard the sun is driving the ionosphere, which
   *    sets the highest frequency that will still bend back to Earth instead of
   *    escaping. Below roughly 70 the upper bands simply do not return.
   *
   *  - **Geomagnetic activity (Kp).** A disturbed field degrades HF broadly and
   *    can black out paths crossing high latitudes entirely.
   *
   * This is the operator's rule of thumb, not a propagation model — it will not
   * predict a specific opening. It is enough to answer "is it worth tuning", and
   * it can say why, which is the part a greyed-out row could never do.
   */
  const FLUX_FLOOR = [
    { mhz: 8,  sfi: 0 },        // always returns; the low bands do not need the sun
    { mhz: 12, sfi: 70 },
    { mhz: 16, sfi: 90 },
    { mhz: 22, sfi: 110 },
    { mhz: 99, sfi: 140 },
  ];

  /**
   * Which half of the day a bare frequency belongs to.
   *
   * `outlook` needs a band's `when`. The 21 hand-written bands carry it as a
   * field; a schedule entry is just a frequency, so it is derived here by the
   * same rule of thumb the table was written with — and it lives next to
   * `outlook` so the two cannot drift apart.
   */
  const whenFor = (khz) => (khz < 8000 ? "night" : khz <= 11000 ? "any" : "day");

  function outlook(band, daylight, space) {
    const mhz = band.freq / 1000;
    const tier = FLUX_FLOOR.find((t) => mhz < t.mhz) || FLUX_FLOOR[FLUX_FLOOR.length - 1];
    const flux = space?.flux ?? null;
    const kp = space?.kpEstimated ?? space?.kp ?? null;

    // Time of day, which is the strongest single factor.
    const timeOk = band.when === "any" || (band.when === "day") === daylight;

    // Does the sun support this frequency at all today?
    const fluxOk = flux == null || flux >= tier.sfi;

    // A disturbed field degrades everything; a storm can close HF outright.
    const stormy = kp != null && kp >= 5;
    const unsettled = kp != null && kp >= 4 && kp < 5;

    let open = timeOk && fluxOk && !stormy;
    let why = null;
    if (!fluxOk) why = `solar flux ${Math.round(flux)} is too low for ${mhz.toFixed(1)} MHz`;
    else if (stormy) why = `geomagnetic storm, Kp ${kp.toFixed(1)}`;
    else if (!timeOk) why = band.when === "day" ? "needs daylight" : "better after dark";
    else if (unsettled) why = `unsettled, Kp ${kp.toFixed(1)}`;

    return { open, why, unsettled };
  }

  // ── session ────────────────────────────────────────────────────────────────
  /**
   * One connection to one receiver.
   *
   * Deliberately has no retry and no reconnect. These are volunteers' machines
   * on volunteers' bandwidth, and a client that reconnects on failure is how you
   * turn 849 hobbyists into 849 people who block you. If a receiver refuses,
   * that is an answer: offer a different receiver.
   */
  class KiwiSession {
    /**
     * @param {object} opts
     * @param {string} opts.host        "example.com:8073"
     * @param {number} opts.freq        kHz
     * @param {string} opts.mode        am | usb | lsb
     * @param {AudioContext} opts.audio
     * @param {(s:object)=>void} [opts.onState]
     */
    constructor(opts) {
      this.opts = opts;
      this.ws = null;
      this.dec = new AdpcmDecoder();
      // AR_IN is what we *ask* the receiver for, and it must be an integer. An
      // earlier version reused this field for the receiver's own reported rate
      // and then sent that back in `SET AR OK in=`; the Kiwi accepts the
      // fractional value without complaint and then never sends audio, which
      // looks exactly like an unreachable receiver and cost an afternoon.
      //
      // The reported rate (11998.902088 on one tested unit) is a 0.009%
      // correction — about 0.16s of drift across a full 30-minute session, which
      // the 0.25s scheduling lead in play() absorbs and self-corrects. It is
      // applied when offered because it is free, not because it is load-bearing.
      this.rate = KiwiSession.AR_IN;
      this.closed = false;
      this.playAt = 0;
      this.gain = null;
      this.rssi = null;
      this.frames = 0;
      this.keepalive = null;
    }

    /**
     * Once the session is closed it says nothing further. Closing a WebSocket
     * ourselves still fires onerror on some paths, and without this guard a
     * deliberate stop reported "connection refused" a moment after the user
     * pressed pause — blaming the receiver for something we did.
     */
    state(status, extra) {
      if (this.closed && status !== "stopped") return;
      this.opts.onState?.({ status, host: this.opts.host, freq: this.opts.freq,
                            mode: this.opts.mode, rssi: this.rssi, ...extra });
    }

    connect() {
      const { host, audio } = this.opts;
      this.gain = audio.createGain();
      this.gain.connect(audio.destination);

      // Cache-busting timestamp in the path is the Kiwi's own convention.
      const url = `ws://${host}/kiwi/${Math.floor(Date.now() / 1000)}/SND`;
      this.state("connecting");
      let ws;
      try { ws = new WebSocket(url); }
      catch (err) { return this.fail(err.message); }
      this.ws = ws;
      ws.binaryType = "arraybuffer";

      // A receiver that has not answered in 15 seconds is busy or gone. One
      // attempt, then move on.
      const guard = setTimeout(() => { if (!this.frames) this.fail("no response"); }, 15000);

      ws.onopen = () => {
        ws.send("SET auth t=kiwi p=");
        setTimeout(() => {
          if (this.closed) return;
          this.tune(this.opts.freq, this.opts.mode);
          ws.send("SET agc=1 hang=0 thresh=-90 slope=6 decay=1000 manGain=50");
          ws.send("SET compression=1");
          ws.send(`SET AR OK in=${KiwiSession.AR_IN} out=48000`);
        }, 600);
        // The Kiwi drops silent clients. This is the documented keepalive and is
        // NOT used to defeat the operator's inactivity timeout — when that fires
        // we let the session end.
        this.keepalive = setInterval(() => {
          if (ws.readyState === 1) ws.send("SET keepalive");
        }, 5000);
      };

      ws.onerror = () => this.fail("connection refused");
      ws.onclose = () => { clearTimeout(guard); this.stop("closed"); };
      ws.onmessage = (m) => {
        if (typeof m.data === "string") return;
        const b = new Uint8Array(m.data);
        const tag = TAG(b);
        if (tag === "MSG") return this.onMsg(parseMsg(m.data));
        if (tag !== "SND") return;
        clearTimeout(guard);
        const f = parseSnd(m.data);
        this.rssi = f.rssi;
        if (this.frames++ === 0) this.state("playing");
        else if (this.frames % 25 === 0) this.state("playing");
        this.play(this.dec.decode(f.payload));
      };
    }

    onMsg(kv) {
      // Refine the playback rate if the receiver volunteers its true one. Not
      // every firmware does, and nothing depends on it — see the constructor.
      const r = parseFloat(kv.sample_rate || kv.audio_rate);
      if (r > 1000) this.rate = r;
      if (kv.too_busy || kv.badp === "1") this.fail("receiver full");
      // Operators can close a session with a reason; surface it rather than
      // silently reconnecting.
      if (kv.status === "config_failed") this.fail("receiver unavailable");
    }

    /**
     * Filter widths.
     *
     * AM used to be ±4900 Hz, which is most of 10 kHz on a band where broadcast
     * channels are spaced 5 kHz apart. That let both neighbours in along with
     * their carriers, and two carriers 5 kHz apart beat against each other into
     * a whistle. It is the sound of a station that is *nearly* tuned, which is
     * exactly the complaint.
     *
     * ±3500 is the usual compromise: it stops short of the adjacent carrier
     * while keeping enough top end that speech and music still sound open. A
     * strong, uncrowded signal would justify more, and a crowded one less —
     * that is a control worth having, and it is not here yet.
     */
    tune(freq, mode) {
      if (!this.ws || this.ws.readyState !== 1) return;
      const cuts = mode === "usb" ? "low_cut=300 high_cut=2700"
                 : mode === "lsb" ? "low_cut=-2700 high_cut=-300"
                 // A CW signal occupies a few hundred hertz. Opening a voice-width
                 // filter around it just lets in every neighbour on the band.
                 : mode === "cw"  ? "low_cut=300 high_cut=800"
                 : "low_cut=-3500 high_cut=3500";
      this.opts.freq = freq;
      this.opts.mode = mode;
      this.ws.send(`SET mod=${mode} ${cuts} freq=${freq.toFixed(2)}`);
    }

    /**
     * Schedule decoded samples on the audio clock rather than firing them at
     * arrival time. Network frames land in bursts; the ear notices.
     */
    play(samples) {
      const { audio } = this.opts;
      if (!samples.length || this.closed) return;
      const buf = audio.createBuffer(1, samples.length, this.rate);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < samples.length; i++) ch[i] = samples[i] / 32768;
      const src = audio.createBufferSource();
      src.buffer = buf;
      src.connect(this.gain);
      // A small lead keeps a late frame from causing a gap; if we have fallen
      // behind entirely, restart the clock rather than piling up latency.
      const now = audio.currentTime;
      if (this.playAt < now + 0.02) this.playAt = now + 0.25;
      src.start(this.playAt);
      this.playAt += buf.duration;
    }

    setVolume(v) { if (this.gain) this.gain.gain.value = v; }

    fail(why) {
      if (this.closed) return;
      this.state("error", { error: why });
      this.stop(why);
    }

    stop(why) {
      if (this.closed) return;
      this.closed = true;
      clearInterval(this.keepalive);
      try { this.ws?.close(); } catch { /* already gone */ }
      try { this.gain?.disconnect(); } catch { /* never connected */ }
      this.state("stopped", why ? { reason: why } : undefined);
    }
  }

  // The rate the Kiwi's audio path is built around; it must be sent as an integer.
  KiwiSession.AR_IN = 12000;

  root.Kiwi = { AdpcmDecoder, KiwiSession, BANDS, outlook, whenFor, parseSnd, parseMsg };
})(typeof globalThis !== "undefined" ? globalThis : this);
