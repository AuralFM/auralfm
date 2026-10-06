/**
 * IPC: Chat and the people in it: presence, notes, private messages, hubs, profiles, muting, the word filter, reports, favorites and verification, and the panic wipe.
 *
 * Registered once, from main.js, which passes `ctx`: the helpers these
 * handlers share with the rest of the main process, and getters for the windows
 * — getters, because the windows are created and destroyed after registration.
 */

const { app, ipcMain, shell } = require("electron");
const durable = require("../identity");
const fs = require("node:fs");
const muted = require("../muted");
const nostr = require("../presence-nostr");
const path = require("node:path");
const safety = require("../safety");
const social = require("../social");

module.exports = function register(ctx) {
  const { broadcast, getPrefs, load, refreshChat, save, visible } = ctx;

  /**
   * The mute list.
   *
   * Muting takes the eight-character label the renderer shows and resolves it to a
   * full key through the messages main already has, because the renderer never
   * holds a whole pubkey and should not have to.
   */
  /**
   * Panic wipe.
   *
   * BitChat's triple-tap, which throws everything away at once. Worth having for
   * the same reason it has one: somebody may need this app to stop describing them
   * immediately, and hunting through a settings panel is not that.
   *
   * What it clears, and it is deliberately everything: favourites and listening
   * history, the presence identities for every place visited (in memory only —
   * they were never written), the mute list, the tip bookkeeping, and the error
   * log. Preferences survive, because appearance is not a record of anybody.
   *
   * Presence is left off afterwards. Turning it back on is a decision, and a wipe
   * is not the moment to make it on somebody's behalf.
   */
  ipcMain.handle("panic:wipe", () => {
    const done = [];
    try { nostr.leave(); nostr.forgetIdentities(); done.push("presence identities"); } catch {}
    try { muted.clear(); done.push("mute list"); } catch {}
    try { social.clear(); done.push("contacts"); } catch {}
    try { nostr.forgetDms(); done.push("private messages"); } catch {}
    // The one key in this app that outlives a session, so the one the wipe has to
    // reach. Nothing to revoke and nobody to notify — anyone holding the
    // fingerprint simply finds that nothing answers to it any more.
    try { durable.forget(); done.push("durable identity"); } catch {}
    // The added terms are a record of what somebody was trying not to see, which
    // is personal even though the shipped list is not. "Erase everything" has to
    // mean it.
    try { safety.reset(); done.push("word list changes"); } catch {}

    const userData = app.getPath("userData");
    for (const f of ["tips.json", "muted.json", "contacts.json", "identity.json",
                     "filter.json", "errors.log"]) {
      try { fs.rmSync(path.join(userData, f), { force: true }); done.push(f); } catch {}
    }

    // The state file is rewritten rather than deleted, so preferences survive and
    // the app does not restart into a first run it did not earn.
    try {
      const keep = load();
      // durableIdentity goes false with it: the key has just been destroyed, and a
      // preference still claiming to be on would silently mint a new one on the
      // next launch — a fresh permanent identity nobody asked for, created by a
      // wipe.
      save({ prefs: { ...(keep.prefs || {}), presence: false, durableIdentity: false },
             layers: keep.layers || {} });
      done.push("favourites and history");
    } catch {}

    broadcast("panic:wiped");
    return done;
  });

  ipcMain.handle("mute:list", () => muted.list());

  ipcMain.handle("mute:add", (_e, pubkey) => {
    const ok = muted.add(String(pubkey || ""));
    // Repaint at once so the muted messages leave the window in the same gesture.
    if (ok) broadcast("presence:messages", visible(nostr.history()));
    return ok;
  });

  ipcMain.handle("mute:remove", (_e, pubkey) => {
    const ok = muted.remove(String(pubkey || ""));
    if (ok) broadcast("presence:messages", visible(nostr.history()));
    return ok;
  });

  /**
   * Location notes, private messages, contacts.
   *
   * All of it goes through here rather than being reachable from a renderer,
   * because all of it needs a private key and a renderer must never hold one.
   */
  ipcMain.handle("notes:history", () => visible(nostr.noteHistory()));
  ipcMain.handle("notes:drop", (_e, text) => nostr.drop(text, getPrefs().nickname));

  ipcMain.handle("dm:history", () => visible(nostr.dmHistory()));
  ipcMain.handle("dm:thread", (_e, pubkey) => visible(nostr.thread(String(pubkey || ""))));
  ipcMain.handle("dm:send", (_e, pubkey, text) => {
    const to = String(pubkey || "");
    // Refusing to write to somebody you have muted. Not a technical limit — it is
    // that a mute is a decision about a person, and a UI that lets you message
    // someone whose replies you cannot see is a trap for the person who muted.
    if (muted.has(to)) return false;
    return nostr.dm(to, text);
  });
  ipcMain.handle("dm:read", (_e, pubkey) => nostr.markRead(String(pubkey || "")));

  /**
   * The word filter.
   *
   * Every term is removable, including the shipped ones. A filter whose list you
   * cannot see or change is a stranger's opinion about your window, and the whole
   * argument of this app is that the window is yours.
   */
  ipcMain.handle("filter:list", () => ({
    terms: safety.terms(),
    shipped: safety.defaults(),
  }));
  ipcMain.handle("filter:add", (_e, term) => {
    const ok = safety.add(String(term || ""));
    if (ok) refreshChat();
    return ok;
  });
  ipcMain.handle("filter:remove", (_e, term) => {
    const ok = safety.remove(String(term || ""));
    if (ok) refreshChat();
    return ok;
  });
  ipcMain.handle("filter:reset", () => { safety.reset(); refreshChat(); return safety.terms(); });

  /**
   * Report somebody.
   *
   * With no server there is nothing to POST to, and standing one up to receive
   * reports would be the backend this project exists without. So the report is an
   * email the person chooses to send, composed for them with the evidence already
   * in it, going to a published address — which is what guideline 1.2 asks for and
   * is the only mechanism here that does not require becoming a host.
   *
   * Two things it deliberately does:
   *
   *   **It mutes them first.** A report that leaves somebody visible while you wait
   *   for a reply has done nothing for the person who filed it. The mute is the
   *   part that takes effect immediately; the email is the part that might matter
   *   later.
   *
   *   **It sends nothing on its own.** It opens a draft. Nothing leaves this Mac
   *   unless the person presses send, and they can read and cut every line of it
   *   first — including the key and the quoted message.
   */
  ipcMain.handle("chat:report", (_e, payload) => {
    const p = payload && typeof payload === "object" ? payload : {};
    const key = String(p.pubkey || "");
    if (muted.isKey(key)) muted.add(key);
    refreshChat();

    const lines = [
      p.show ? "Reporting a live show heard in AuralFM." : "Reporting a message seen in AuralFM's place chat.",
      "",
      `Sender key: ${key || "(unknown)"}`,
      `Place cell: ${String(p.geohash || "(unknown)")}`,
      `Seen at:    ${new Date(Number(p.at) || Date.now()).toISOString()}`,
      "",
      p.show ? "Show:" : "Message:",
      String(p.text || "").slice(0, 1000),
      "",
      "--",
      "Sent from AuralFM. Nothing was transmitted automatically — this draft was",
      "composed locally and sent by hand. AuralFM has no server and cannot delete",
      "this message from the relays that carry it; the sender is now muted on this",
      "Mac.",
    ];
    const url = "mailto:hello@auralfm.xyz"
      + "?subject=" + encodeURIComponent(p.show ? "AuralFM — reported live show" : "AuralFM — reported chat message")
      + "&body=" + encodeURIComponent(lines.join("\n"));
    // mailto has practical length limits in some clients; the quote is already
    // capped, and this is the belt to that braces.
    shell.openExternal(url.slice(0, 8000));
    return true;
  });

  ipcMain.handle("social:list", () => social.list());
  ipcMain.handle("social:get", (_e, pubkey) => social.get(String(pubkey || "")));

  /**
   * Favorite somebody, and tell them.
   *
   * The signal is a private message with an empty body and a `fav` tag, so it
   * arrives as a fact rather than as a line of chat. It only reaches them if
   * something is connected — a favorite still records locally when it does not,
   * because your own list should not depend on a relay being up.
   */
  ipcMain.handle("social:favorite", (_e, pubkey, on) => {
    const key = String(pubkey || "");
    if (muted.has(key)) return false;
    const ok = social.set(key, { favorite: !!on });
    if (ok) {
      nostr.dm(key, "", [["fav", on ? "1" : "0"]]);
      broadcast("social:changed", social.list());
    }
    return ok;
  });

  /**
   * Mark a key as verified, or not.
   *
   * Deliberately a plain setter with no cleverness behind it. This is the only
   * claim in the app that means something about a human being — that you compared
   * fingerprints with them and they matched — and the app inferring it from
   * anything at all would make it worthless.
   */
  ipcMain.handle("social:verify", (_e, pubkey, on) => {
    const ok = social.set(String(pubkey || ""), { verified: !!on });
    if (ok) broadcast("social:changed", social.list());
    return ok;
  });

  ipcMain.handle("social:label", (_e, pubkey, label) => {
    const ok = social.set(String(pubkey || ""), { label: String(label || "") });
    if (ok) broadcast("social:changed", social.list());
    return ok;
  });

  /** The fingerprint of any key, for reading aloud. Pure function, no state. */
  ipcMain.handle("social:fingerprint", (_e, pubkey) => {
    const key = String(pubkey || "");
    if (!social.isKey(key)) return null;
    return { fingerprint: durable.fingerprint(key), readable: durable.readable(durable.fingerprint(key)) };
  });
  ipcMain.handle("presence:history", () => visible(nostr.history()));
  /**
   * Hubs. A private room reached by knowing a name and a password.
   *
   * The password crosses the bridge once, on the way in, and is never stored or
   * echoed back — `hubState()` returns the name and the public tag, never the key.
   * Messages go through `visible()` like every other channel, because muting and
   * the word filter are about your window and a private room is still your window.
   */
  ipcMain.handle("hub:join", (_e, name, password) => nostr.joinHub(name, password));
  ipcMain.handle("hub:leave", () => { nostr.leaveHub(); return true; });
  ipcMain.handle("hub:state", () => nostr.hubState());
  ipcMain.handle("hub:say", (_e, text) => nostr.sayHub(text, getPrefs().nickname));
  ipcMain.handle("hub:history", () => visible(nostr.hubHistory()));
  /**
   * Look one person up. Reads only, one at a time, and never in bulk — see the
   * note in presence-nostr: a list of authors is a list of who is in your cell.
   */
  ipcMain.handle("profile:get", (_e, pubkey) => nostr.lookupProfile(String(pubkey || "")));
  ipcMain.handle("profile:known", () => nostr.knownProfiles());
  // Returns false when there is nowhere to say it — nothing playing, presence off,
  // or no relay up. The renderer needs to know rather than assume it landed.
  // The nickname comes from prefs unless the caller overrides it, so there is one
  // authoritative answer to "who am I" rather than a renderer remembering to pass
  // one. It was passing null, so the nickname pref had no effect at all.
  ipcMain.handle("presence:say", (_e, text, nick) =>
    nostr.say(text, nick ?? getPrefs().nickname));
  ipcMain.handle("presence:stats", () => nostr.stats());

  /**
   * Look at a cell without joining it.
   *
   * Only ever a read. `nostr.say` still guards on the *listening* cell, so this
   * cannot be turned into a way to post somewhere you are not, and nothing is
   * announced — which is the point, because a presence beacon that followed the
   * globe would publish a location trail while somebody browsed.
   *
   * Ignored entirely when presence is off, so browsing never quietly starts
   * talking to relays for someone who switched the feature off.
   */
  ipcMain.on("presence:view", (_e, lat, lon) => {
    if (getPrefs().presence !== true) return;
    nostr.view(lat, lon);
  });
};
