/**
 * Which private messages are worth a notification, and what one says.
 *
 * Off unless the listener turns it on (prefs.notify), and for private messages
 * only. The public room does not notify and neither does a mention: a chat
 * that pings is a chat that interrupts listening, and that has not changed.
 * A private message is one person writing to you, and the only way to know it
 * came was to have the chat open.
 *
 * It is the app that notifies, while it is running. Nothing is sent to a push
 * service, so no server learns that this device exists or when it is awake;
 * the price is that a closed app says nothing.
 *
 * Shared by the two places messages arrive: main.js on the Mac and
 * web/messaging.js in a browser.
 */
"use strict";

// A relay can hand back an old message when it reconnects. News is recent.
const RECENT_MS = 5 * 60 * 1000;

/**
 * Tell new from old. Give it the messages already here when it is made, then
 * every list as it arrives; it returns the ones that are new, inbound, unread
 * and recent. Each message is returned once.
 */
function tracker(already = [], now = () => Date.now()) {
  const seen = new Set((already || []).map((m) => m && m.id).filter(Boolean));
  return (list) => {
    const out = [];
    for (const m of list || []) {
      if (!m || !m.id || seen.has(m.id)) continue;
      seen.add(m.id);
      if (!m.mine && m.unread && now() - (m.at || 0) < RECENT_MS) out.push(m);
    }
    return out;
  };
}

/**
 * What the notification says. With "Hide message text until opened" on it
 * names nobody and quotes nothing: it is on a lock screen, which is the
 * shoulder that setting is about.
 */
function words(m, { hidePreviews = false, name = "" } = {}, t = (_k, d) => d) {
  const title = t("notify.dm", "Private message");
  if (hidePreviews) return { title, body: t("notify.hidden", "Open AuralFM to read it.") };
  const who = name || m.nick || m.from || "";
  const text = String(m.text || "").replace(/\s+/g, " ").trim().slice(0, 140);
  return { title: who ? `${title} · ${who}` : title, body: text };
}

module.exports = { tracker, words, RECENT_MS };
