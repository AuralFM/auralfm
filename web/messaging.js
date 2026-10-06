/**
 * Messaging for AuralFM on the web: the desktop's own Nostr code, in a browser.
 *
 * presence-nostr, the private-message envelope, hubs, mutes, contacts and the
 * word filter are the desktop's files, bundled by scripts/build-web.mjs with
 * browser stand-ins for node:crypto, node:fs and Buffer (web/shims/). What this
 * file adds is only what src/main/ipc-chat.js and main.js do on the desktop:
 * the calls the page makes, and the one rule that sits between the relays and
 * the page — a muted person or a listed word never reaches it (`visible`).
 *
 * Identity is ephemeral, always. The durable identity the desktop offers is not
 * initialised here, so there is no lasting key to lose: a new tab after clearing
 * site data is a new person, which is what "no account" means.
 */
const nostr = require("../src/presence-nostr.js");
const muted = require("../src/muted.js");
const social = require("../src/social.js");
const safety = require("../src/safety.js");
const identity = require("../src/identity.js");

// "Files" live under this name in localStorage; see web/shims/fs.js.
const HOME = "/auralfm-web";
muted.init(HOME);
social.init(HOME);
safety.init(HOME);
// identity.init() is deliberately never called: without it there is no durable key.

window.AuralChat = function create({ getPrefs, emit }) {
  const visible = (list) => {
    const p = getPrefs();
    return safety.apply(muted.filter(list), {
      filter: p.filterChat !== false,
      onlyKept: p.onlyKept === true,
      kept: (pk) => social.isMutual(pk),
    });
  };
  const refresh = () => {
    emit("chat", visible(nostr.history()));
    emit("notes", visible(nostr.noteHistory()));
    emit("dms", visible(nostr.dmHistory()));
  };

  nostr.onPeers((list) => emit("peers", list));
  nostr.onMessages((list) => emit("chat", visible(list)));
  nostr.onNotes((list) => emit("notes", visible(list)));
  nostr.onHub((list) => emit("hub", visible(list)));
  nostr.onDms((list) => emit("dms", visible(list)));
  nostr.onSignal((from, payload, at) => { if (!muted.has(from)) emit("rtc", [from, payload, at]); });
  nostr.onFavorited((pubkey, on) => {
    if (muted.has(pubkey)) return;
    social.noteMutual(pubkey, on);
    emit("social", social.list());
  });

  /** Where the station is, blurred to a ~20 km cell — never where the listener is. */
  // Your show: a host stands in the town the show goes out from, as on the
  // desktop (src/main.js, "studio:host"): the place they chose, and no label.
  let hosting = null, lastPlayer = null, watching = false;
  function sync(player) {
    lastPlayer = player;
    const p = getPrefs();
    nostr.setExtraRelays(p.relays || []);
    nostr.setPowFloor(p.powFloor || 0);
    const ch = hosting || (player?.playing ? player.channel : null);
    if (p.presence !== true || !ch || typeof ch.lat !== "number" || typeof ch.lon !== "number") {
      nostr.leave();
      // Nothing playing, but the page is looking for shows on air: read only.
      if (p.presence === true && watching) nostr.watch();
      return;
    }
    nostr.join(ch.lat, ch.lon, hosting ? (hosting.live ? hosting.title : "") : ch.title || "", !!hosting?.live);
  }
  function host(lat, lon, live, title) {
    const next = typeof lat === "number" && typeof lon === "number" && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
      ? { lat, lon, live: live === true, title: live === true ? String(title || "").slice(0, 60) : "" } : null;
    if (JSON.stringify(next) === JSON.stringify(hosting)) return;
    hosting = next;
    sync(lastPlayer);
  }

  function report(payload) {
    const p = payload && typeof payload === "object" ? payload : {};
    const key = String(p.pubkey || "");
    if (muted.isKey(key)) muted.add(key);
    refresh();
    const lines = [
      p.show ? "Reporting a live show heard in AuralFM (web version)." : "Reporting a message seen in AuralFM's place chat (web version).", "",
      `Sender key: ${key || "(unknown)"}`,
      `Place cell: ${String(p.geohash || "(unknown)")}`,
      `Seen at:    ${new Date(Number(p.at) || Date.now()).toISOString()}`, "",
      p.show ? "Show:" : "Message:", String(p.text || "").slice(0, 1000), "", "--",
      "Composed in the browser and sent by hand. AuralFM has no server and cannot",
      "delete this message from the relays that carry it; the sender is now muted",
      "in this browser.",
    ];
    location.href = ("mailto:hello@auralfm.xyz?subject=" + encodeURIComponent(p.show ? "AuralFM — reported live show" : "AuralFM — reported chat message")
      + "&body=" + encodeURIComponent(lines.join("\n"))).slice(0, 8000);
    return true;
  }

  function wipe() {
    const done = [];
    try { nostr.leave(); nostr.forgetIdentities(); done.push("presence identities"); } catch {}
    try { muted.clear(); done.push("mute list"); } catch {}
    try { social.clear(); done.push("contacts"); } catch {}
    try { nostr.forgetDms(); done.push("private messages"); } catch {}
    try { safety.reset(); done.push("word list changes"); } catch {}
    return done;
  }

  return {
    sync, refresh, wipe,
    api: {
      presenceStats: async () => nostr.stats(),
      studioHost: (lat, lon, live, title) => host(lat, lon, live, title),
      showsWatch: (on) => { if (watching === (on === true)) return; watching = on === true; sync(lastPlayer); },
      rtcSignal: async (to, payload) => nostr.signal(String(to || ""), payload),
      presenceView: (lat, lon) => { if (getPrefs().presence === true) nostr.view(lat, lon); },
      chatHistory: async () => visible(nostr.history()),
      chatSay: async (text, nick) => nostr.say(text, nick ?? getPrefs().nickname),
      notesHistory: async () => visible(nostr.noteHistory()),
      noteDrop: async (text) => nostr.drop(text, getPrefs().nickname),
      dmHistory: async () => visible(nostr.dmHistory()),
      dmThread: async (pk) => visible(nostr.thread(String(pk || ""))),
      dmSend: async (pk, text) => (muted.has(String(pk || "")) ? false : nostr.dm(String(pk || ""), text)),
      dmRead: async (pk) => nostr.markRead(String(pk || "")),
      hubJoin: async (name, password) => nostr.joinHub(name, password),
      hubLeave: async () => { nostr.leaveHub(); return true; },
      hubState: async () => nostr.hubState(),
      hubSay: async (text) => nostr.sayHub(text, getPrefs().nickname),
      hubHistory: async () => visible(nostr.hubHistory()),
      profileGet: async (pk) => nostr.lookupProfile(String(pk || "")),
      profilesKnown: async () => nostr.knownProfiles(),
      muteList: async () => muted.list(),
      muteAdd: async (pk) => { const ok = muted.add(String(pk || "")); if (ok) refresh(); return ok; },
      muteRemove: async (pk) => { const ok = muted.remove(String(pk || "")); if (ok) refresh(); return ok; },
      filterList: async () => ({ terms: safety.terms(), shipped: safety.defaults() }),
      filterAdd: async (term) => { const ok = safety.add(String(term || "")); if (ok) refresh(); return ok; },
      filterRemove: async (term) => { const ok = safety.remove(String(term || "")); if (ok) refresh(); return ok; },
      filterReset: async () => { safety.reset(); refresh(); return safety.terms(); },
      chatReport: async (payload) => report(payload),
      socialList: async () => social.list(),
      socialGet: async (pk) => social.get(String(pk || "")),
      socialFavorite: async (pk, on) => {
        const key = String(pk || "");
        if (muted.has(key)) return false;
        const ok = social.set(key, { favorite: !!on });
        if (ok) { nostr.dm(key, "", [["fav", on ? "1" : "0"]]); emit("social", social.list()); }
        return ok;
      },
      socialVerify: async (pk, on) => { const ok = social.set(String(pk || ""), { verified: !!on }); if (ok) emit("social", social.list()); return ok; },
      socialLabel: async (pk, label) => { const ok = social.set(String(pk || ""), { label: String(label || "") }); if (ok) emit("social", social.list()); return ok; },
      socialFingerprint: async (pk) => {
        const key = String(pk || "");
        if (!social.isKey(key)) return null;
        const fp = identity.fingerprint(key);
        return { fingerprint: fp, readable: identity.readable(fp) };
      },
    },
  };
};
