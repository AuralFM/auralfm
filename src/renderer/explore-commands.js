/**
 * Explore, part 13 of 17: Slash commands, system lines, and sending.
 *
 * Explore is one page split across plain scripts that share a global scope, in
 * the order explore.html loads them. Declarations live here; anything that runs
 * at load — listeners, IPC subscriptions, one-off calls — is in wireCommands(),
 * which explore.js calls once every part has loaded. That keeps the original
 * single-file behaviour: no handler can fire into a part that has not loaded.
 */

/**
 * Say what Enter will do.
 *
 * Every branch here answers one question — who is about to read this — because
 * that is the question the old composer could not answer.
 */
function describeMode() {
  const input = $("chatinput"), bar = $("chatmode");
  if (!input || !bar) return;
  const text = input.value;
  const set = (html, cls) => { bar.innerHTML = html; bar.className = `cmdmode${cls ? ` ${cls}` : ""}`; };
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  input.classList.remove("cmdok", "cmdbad");

  if (viewingCell) { hideNames(); return set(t("chat.onlyLooking", "You are looking at this room, not listening to it.")); }

  if (text.startsWith("/")) {
    const sp = text.indexOf(" ");
    const word = (sp < 0 ? text : text.slice(0, sp)).toLowerCase();
    const rest = sp < 0 ? "" : text.slice(sp + 1);
    const cmd = COMMANDS[word];

    // Still typing the command itself: show what it could become.
    if (sp < 0 && !cmd) {
      const near = Object.keys(COMMANDS).filter((k) => k.startsWith(word));
      hideNames();
      input.classList.add(near.length ? "cmdok" : "cmdbad");
      // Say when the list is cut short. A truncated list that looks complete is
      // how somebody concludes a command does not exist.
      return near.length
        ? set(esc(near.slice(0, 8).join("  ")) + (near.length > 8 ? ` +${near.length - 8}` : ""))
        : set(`<b>${esc(word)}</b> ${t("chat.notACommand", "is not a command. Type / to see them.")}`, "warn");
    }
    if (!cmd) {
      hideNames();
      input.classList.add("cmdbad");
      return set(`<b>${esc(word)}</b> ${t("chat.notACommand", "is not a command. Type / to see them.")}`, "warn");
    }

    if (cmd.needsName) {
      const frag = rest.split(" ")[0] || "";
      const one = matchOne(frag);
      if (one) {
        hideNames();
        input.classList.add("cmdok");
        return set(`<b>${esc(word)}</b> → <b>${esc(one.nick || one.from)}</b>`
                 + (cmd.privately ? ` — ${t("chat.privateOnly", "nobody else in this room sees it")}` : ""),
                   cmd.privately ? "priv" : "");
      }
      showNames(word, frag);
      // A command typed correctly but not yet finished is incomplete, not wrong.
      // Marking it red the moment somebody types `/msg` tells them they made a
      // mistake when all they did was not finish the sentence — which is exactly
      // the sort of false alarm that teaches people to ignore the signal.
      if (!frag) {
        return set(`<b>${esc(word)}</b> ${esc(cmd.hint.replace(word, "").replace(/^\s*—\s*/, "").trim())}`);
      }
      input.classList.add("cmdbad");
      return set(`${t("chat.nobodyCalled", "Nobody here called")} <b>${esc(frag)}</b>`, "warn");
    }

    hideNames();
    input.classList.add("cmdok");
    return set(esc(cmd.hint));
  }

  hideNames();
  if (hubIn) {
    input.classList.add("cmdok");
    return set(`${t("chat.hubTo", "To the hub")} <b>${esc(hubIn.name)}</b> — `
             + t("chat.hubOnly", "only people who know its name and password can read this"), "priv");
  }
  if (dmWith) {
    input.classList.add("cmdok");
    return set(`${t("chat.privateTo", "Private to")} <b>${esc(dmWith.nick)}</b> — `
             + t("chat.privateOnly", "nobody else in this room sees it"), "priv");
  }
  const where = myPlaceName();
  return set(where
    ? `${t("chat.everyoneNear", "Everyone near")} <b>${esc(where)}</b> ${t("chat.willSee", "will see this")}`
    : t("chat.everyoneHere", "Everyone in this room will see this"));
}

/**
 * Slash commands.
 *
 * BitChat's own instructions end with "type / for commands", and it is the right
 * shape for this: a chat box with one text field and no room for buttons, in an
 * app whose users are shortwave listeners already comfortable with terse syntax.
 *
 * Four of these reach a relay — /drop, /msg, /fav and /me. The rest are local,
 * and that is the point: the useful commands in a room you cannot moderate are
 * the ones that change what *you* see.
 */
const COMMANDS = {
  "/help": {
    hint: "list these commands",
    run: () => systemLine(Object.entries(COMMANDS)
      .map(([k, v]) => `${k} — ${v.hint}`).join("\n")),
  },
  "/who": {
    hint: "who else is here",
    run: () => {
      const n = peers.length;
      systemLine(n
        ? `${n} ${n === 1 ? "person" : "people"} visible on the relays right now.`
        : "Nobody else is visible on the relays right now.");
    },
  },
  "/clear": {
    hint: "clear this log (local only)",
    /**
     * Clearing has to empty what the app said as well as what the log showed.
     * Emptying the element alone left `systemCache` holding every line, and the
     * next repaint put them all straight back — a Clear that cleared nothing.
     */
    run: () => {
      clearSystemLines();
      chatCache = []; noteCache = []; dmCache = [];
      $("chatlog").textContent = "";
      systemLine("Cleared. Only here — the relays still have it.");
    },
  },
  "/me": {
    hint: "/me is listening — sends as an action",
    run: (rest) => rest ? { send: `* ${rest}` } : systemLine("Say what you are doing: /me is tuning around."),
  },
  "/mute": {
    hint: "/mute <name> — stop seeing somebody",
    needsName: true,
    run: async (rest) => {
      const who = findPerson(rest, "/mute");
      if (!who) return;
      await guard("muteAdd", () => window.auralfm.muteAdd(who.pubkey));
      systemLine(`Muted ${name(who)}. Settings can undo it.`);
    },
  },

  /**
   * Leave a note at this place — bitchat's /drop, and the only command here that
   * publishes something relays keep.
   *
   * The warning is not decoration. Everything else this app sends is an
   * ephemeral kind that relays are asked to forward and forget; a note is an
   * ordinary kind-1 text note, stored and served to anyone who asks. It is
   * signed by a key that will not exist after quit, so there is no way to
   * publish the deletion request that would ask relays to drop it. "A day" is
   * what the note asks for, not what anyone can enforce.
   */
  "/drop": {
    hint: "/drop <note> — leave a note here for a day (public, permanent)",
    run: async (rest) => {
      const body = (rest || "").trim();
      if (!body) return systemLine("Write the note: /drop the 40m band is busy after dark.");
      if (!confirm(t("notes.ask",
        "Leave this note on the relays?\n\nUnlike everything else AuralFM sends, a note is stored and public. "
        + "It asks to expire in a day, but relays are not required to honour that, and it cannot be unsent."))) return;
      const ok = await guard("noteDrop", () => window.auralfm.noteDrop(body), false);
      systemLine(ok
        ? "Note left here. Anyone tuning to this place will see it for a day."
        : "Nothing was sent — no relay is connected, or nothing is playing.");
    },
  },
  "/notes": {
    hint: "notes left at this place",
    run: async () => {
      const list = await guard("notesHistory", () => window.auralfm.notesHistory(), []);
      if (!list.length) return systemLine("No notes here. /drop leaves one.");
      systemLine(list.map((n) => `${n.nick || n.from}: ${n.text}`).join("\n"));
    },
  },

  /**
   * A private message.
   *
   * Reaches whoever is visible in the room right now with no setup at all: their
   * announced key is already on screen, and it is a perfectly good address for
   * as long as they are there. It only reaches somebody *later* if both sides
   * have switched on the durable identity in Settings — which is the honest
   * shape of a system with no accounts in it.
   */
  /**
   * Words are optional, because this opens a conversation rather than posting
   * one line. `/msg gal` walks in; `/msg gal hello` walks in and says hello.
   * Same as bitchat, whose users are in these rooms and already know it.
   */
  "/msg": {
    hint: "/msg <name> — open a private conversation",
    needsName: true,
    privately: true,
    run: async (rest) => {
      const [first, ...words] = (rest || "").trim().split(" ");
      const who = findPerson(first, "/msg");
      if (!who) return;
      await enterDm(who);
      const body = words.join(" ").trim();
      if (!body) {
        return systemLine(`Private with ${name(who)}. Everything you type now goes only to them. `
          + "Esc, or Back to the room, to leave.");
      }
      const ok = await guard("dmSend", () => window.auralfm.dmSend(who.pubkey, body), false);
      if (!ok) return systemLine("Not sent — no relay is connected, or they are muted.");
    },
  },
  /**
   * Favorites, and the honest condition on them.
   *
   * bitchat refuses this outright in a geohash channel — "favorites are only for
   * mesh peers in #mesh" — and every room in AuralFM is a geohash channel. The
   * reason is not arbitrary: a favorite is a note about a person, and a per-area
   * key is thrown away at quit, so keeping one is keeping a note about somebody
   * who will not exist tomorrow.
   *
   * Rather than refuse it, this requires the thing that makes it true. With the
   * durable identity on, a favorite can survive; without it, saying so up front
   * is better than succeeding and then explaining.
   */
  /**
   * A private room reached by knowing a name and a password.
   *
   * Both on one line, so it can be handed to somebody in one line. The password
   * is whatever follows the first space after the name, spaces included — a
   * passphrase is a better password than a word and the syntax should not
   * discourage one.
   */
  "/hub": {
    hint: '/hub <name> <password> — a private room. Quote a name with spaces: /hub "radio club" <password>',
    run: async (rest) => {
      const body = (rest || "").trim();
      if (!body) {
        if (!hubIn) return systemLine('Which hub? /hub radioclub shortwave2026 — or quote a name with spaces: /hub "radio club" shortwave2026');
        await leaveHub();
        return;
      }
      /**
       * Where the name ends and the password begins.
       *
       * A passphrase makes a better password than a word, so the password is
       * everything after the name rather than the last token. That leaves
       * multi-word *names* with nowhere to go — typing `/hub radio club pw`
       * created a room called "radio" whose password was "club pw", which works
       * and looks broken. Quotes settle it, and the unquoted form still does the
       * obvious thing for the common case of a one-word name.
       */
      let name, password;
      const quoted = body.match(/^"([^"]+)"\s+(.+)$/) || body.match(/^'([^']+)'\s+(.+)$/);
      if (quoted) { name = quoted[1]; password = quoted[2].trim(); }
      else {
        const sp = body.indexOf(" ");
        if (sp < 0) return systemLine(`A hub needs a password too: /hub ${body} <password>`);
        name = body.slice(0, sp); password = body.slice(sp + 1).trim();
      }
      if (!password) return systemLine("A hub needs a password too: /hub " + name + " <password>");
      const got = await guard("hubJoin", () => window.auralfm.hubJoin(name, password), null);
      if (!got) return systemLine("That did not work — a hub needs both a name and a password.");
      await enterHub(got);
      systemLine(`In "${got.name}". Everything you type goes only to people who typed the same name and password. `
        + "Nobody else can read it, including the relays carrying it — but anyone who learns the pair can, "
        + "including what was said before they knew it.");
    },
  },
  /**
   * Who is this?
   *
   * Deliberately a command rather than something the app does for you. Fetching
   * everyone's profile would mean handing a relay the list of people in your
   * cell, which is the one thing the whole subscription design avoids. Asking
   * about one person says only that somebody looked that person up, and you are
   * the one who decided to.
   */
  "/whois": {
    hint: "/whois <name> — look someone up, if they published a profile",
    needsName: true,
    run: async (rest) => {
      const who = findPerson(rest, "/whois");
      if (!who) return;
      systemLine(`Asking the relays about ${name(who)}…`);
      const p = await guard("profileGet", () => window.auralfm.profileGet(who.pubkey), null);
      if (!p || (!p.name && !p.about && !p.nip05)) {
        return systemLine(`Nothing published for ${name(who)}. Most people here have no profile — `
          + "the key is the whole identity, and that is the normal case rather than a gap.");
      }
      knownProfiles[who.pubkey] = p;
      const lines = [`${p.name || name(who)}`];
      // "claims", not "verified": checking a NIP-05 means asking that domain
      // about this person, which is a request we have not made.
      if (p.nip05) lines.push(`claims ${p.nip05} — unverified, and checking it would ask that domain about them`);
      if (p.about) lines.push(p.about);
      systemLine(lines.join("\n"));
      repaintLog();
    },
  },
  "/fav": {
    hint: "/fav <name> — keep somebody, and tell them",
    needsName: true,
    run: (rest) => setFavorite(rest, true),
  },
  "/unfav": {
    hint: "/unfav <name> — stop keeping somebody",
    needsName: true,
    run: (rest) => setFavorite(rest, false),
  },

  /**
   * Fingerprints, and the one thing in this app that means something about a
   * person rather than a key.
   *
   * Printing both fingerprints and stopping is the whole design. The app cannot
   * verify anybody — only two people looking at the same sixteen characters can
   * do that, out loud, in person or on a call they already trust. Marking it
   * verified afterwards is a separate deliberate act in Settings, because a
   * confirm dialog in the middle of a chat is not a security practice.
   */
  "/verify": {
    hint: "/verify <name> — compare fingerprints in person",
    needsName: true,
    run: async (rest) => {
      const who = findPerson(rest, "/verify");
      if (!who) return;
      const theirs = await guard("fp", () => window.auralfm.socialFingerprint(who.pubkey), null);
      const mine = await guard("stats", () => window.auralfm.presenceStats(), null);
      if (!theirs) return systemLine("No key to check.");
      systemLine([
        `${name(who)}: ${theirs.readable}`,
        mine?.fingerprint ? `you: ${mine.fingerprint}` : null,
        "Read these to each other. If they match, mark them verified in Settings.",
        "A fingerprint sent over this chat proves nothing — anyone can type one.",
      ].filter(Boolean).join("\n"));
    },
  },
  /**
   * Report the last thing somebody said.
   *
   * There is nowhere to send a report to — no server, by design — so this
   * composes an email to a published address with the evidence in it, mutes
   * them, and lets the person press send or not. That is the whole mechanism,
   * and it is deliberately not dressed up as more than it is.
   */
  "/report": {
    hint: "/report <name> — mute them and draft a report",
    run: async (rest) => {
      const who = findPerson(rest, "/report");
      if (!who) return;
      await guard("muteAdd", () => window.auralfm.muteAdd(who.pubkey));
      await guard("chatReport", () => window.auralfm.chatReport({
        pubkey: who.pubkey, text: who.text, at: who.at, geohash: who.geohash,
      }));
      systemLine(`Muted ${name(who)}, and an email draft is open. Nothing was sent automatically.`);
    },
  },
  "/wipe": {
    hint: "erase everything, now",
    run: () => { panicWipe(); },
  },
};

/** What to call somebody: their nickname if they chose one, else their key stub. */
const name = (p) => p.nick || p.from || String(p.pubkey || "").slice(0, 8);

/**
 * Find the person a command is about.
 *
 * Matches a nickname exactly or a key stub by prefix, over everyone who has
 * spoken here. Reports its own failure and returns null, so every caller is one
 * line rather than five identical ones.
 */
/**
 * Turn what somebody typed into a person.
 *
 * This used to search only the message log, which meant the set of people you
 * could address was the set who had spoken — while the header counted everybody
 * present. Both statements were true at once, so the app could say "57
 * listening" and "nobody called gal has said anything here" in the same breath,
 * and it read as broken because it was.
 *
 * [roster] resolves against presence as well, so somebody who is here and quiet
 * can still be messaged, favorited or muted. Muting matters most: the person
 * worth muting may well be one you have not heard from yet.
 */
function findPerson(rest, cmd) {
  const want = String(rest || "").trim();
  if (!want) {
    const all = roster();
    systemLine(all.length
      ? `Who? ${cmd} <name>. Here now: ${all.slice(0, 8).map((p) => p.nick || p.from).join(", ")}`
      : `Who? ${cmd} followed by a name — but there is nobody here yet.`);
    return null;
  }
  const hits = matchPeople(want);
  if (!hits.length) {
    const all = roster();
    systemLine(all.length
      ? `Nobody here called "${want}". Here now: ${all.slice(0, 8).map((p) => p.nick || p.from).join(", ")}`
      : `Nobody here called "${want}" — the room is empty.`);
    return null;
  }
  // Ambiguity is not a match. Picking one on somebody's behalf is how a private
  // message reaches the wrong person.
  if (hits.length > 1) {
    systemLine(`"${want}" could be ${hits.slice(0, 6).map((p) => p.nick || p.from).join(", ")}. Be more specific.`);
    return null;
  }
  return hits[0];
}

async function setFavorite(rest, on) {
  const who = findPerson(rest, on ? "/fav" : "/unfav");
  if (!who) return;
  // Ask before doing it, not after. The old order kept the person and *then*
  // explained that keeping them probably would not last, which is a receipt for
  // something that did not happen rather than a choice.
  if (on) {
    const st = await guard("stats", () => window.auralfm.presenceStats(), null);
    if (!st?.durable && !confirm(
      `Keep ${name(who)}?\n\nYour key is thrown away when AuralFM quits, so this will not survive `
      + "a restart — and neither will theirs unless they have switched on a durable identity too. "
      + "Settings → Privacy turns yours on.\n\nKeep them for this session anyway?")) return;
  }
  const ok = await guard("socialFavorite", () => window.auralfm.socialFavorite(who.pubkey, on), false);
  if (!ok) return systemLine("That did not work — they may be muted.");
  systemLine(on
    ? `Keeping ${name(who)}. They have been told, privately. It becomes mutual if they keep you back.`
    : `No longer keeping ${name(who)}.`);
}

/**
 * Erase everything, from here.
 *
 * BitChat's triple-tap. Confirmed rather than instant, because on a desktop a
 * stray triple-click on a panel is far likelier than on a phone logo, and an
 * unrecoverable action that fires on a mis-click is a worse bug than not having
 * the gesture.
 */
async function panicWipe() {
  if (!confirm(t("chat.wipeAsk",
    "Erase favorites, listening history, the mute list and every key this session used? This cannot be undone."))) return;
  const done = await guard("panicWipe", () => window.auralfm.panicWipe(), []);
  leaveDm();
  clearSystemLines();
  chatCache = []; noteCache = []; dmCache = [];
  $("chatlog").textContent = "";
  systemLine(t("chat.wiped", "Erased.") + " " + (done || []).join(", "));
}

/**
 * A line in the log from the app rather than from a person.
 *
 * Held in a list rather than appended straight to the DOM, because [repaintLog]
 * empties the log and rebuilds it from the caches — so anything written directly
 * survived only until the next message arrived. The app would explain that a
 * name did not resolve, a relay would deliver something a second later, and the
 * explanation was gone. Every `systemLine` in the file was that fragile, which
 * made the app least articulate at exactly the moments it had most to say.
 *
 * Capped, and local: none of this was ever sent anywhere, and none of it
 * survives a restart.
 */
const systemCache = [];
const MAX_SYSTEM = 40;

function systemLine(text) {
  systemCache.push({ at: Date.now(), text: String(text), kind: "system" });
  if (systemCache.length > MAX_SYSTEM) systemCache.splice(0, systemCache.length - MAX_SYSTEM);
  repaintLog();
}

/** Forget what the app said. Paired with clearing the log it was written into. */
function clearSystemLines() { systemCache.length = 0; }

/** Newest messages, kept so /mute can resolve a name to a key. */
let chatCache = [];

/** The relay took nothing. Say so without taking the words away. */
function sendFailed(input, msg) {
  input.placeholder = msg;
  setTimeout(paintComposer, 4000);
}

function wireCommands() {
  /**
   * Triple-click the log to wipe, which is BitChat's triple-tap.
   *
   * `detail` counts clicks in a native multi-click sequence, so this needs no
   * timers of its own and matches whatever the system considers a triple-click.
   */
  $("chatlog").addEventListener("click", (e) => { if (e.detail === 3) panicWipe(); });

  $("chatform").onsubmit = async (e) => {
    e.preventDefault();
    const input = $("chatinput");
    let text = input.value.trim();
    if (!text) return;

    /**
     * Inside a private conversation, ordinary words go to that person and only to
     * them. A command is still a command — being in a thread should not stop you
     * typing /help — and that is the one ambiguity worth keeping, because a
     * message beginning with a slash is a command everywhere else in the app too.
     */
    // In a hub, ordinary words go to the hub and nowhere else. A command is still
    // a command, so /hub can get you out of one.
    if (hubIn && !text.startsWith("/")) {
      input.disabled = true;
      const ok = await guard("hubSay", () => window.auralfm.hubSay(text), false);
      input.disabled = false;
      input.focus();
      if (ok) input.value = "";
      else sendFailed(input, t("chat.hubFailed", "Not sent — no relay took it."));
      describeMode();
      return;
    }

    if (dmWith && !text.startsWith("/")) {
      input.disabled = true;
      const ok = await guard("dmSend", () => window.auralfm.dmSend(dmWith.pubkey, text), false);
      input.disabled = false;
      input.focus();
      if (ok) input.value = "";
      else sendFailed(input, t("chat.dmFailed", "Not sent — no relay took it, or they are muted."));
      describeMode();
      return;
    }

    if (text.startsWith("/")) {
      const [word, ...rest] = text.split(" ");
      const cmd = COMMANDS[word.toLowerCase()];
      // Everything below deliberately leaves `input.value` alone until something
      // has actually happened. Clearing it first is what threw away a long message
      // every time a nickname failed to resolve — the single most annoying way
      // this composer could fail, and the one that happened most.
      if (!cmd) { describeMode(); return systemLine(`${word} is not a command. Try /help.`); }
      // The name is the part that fails, so it is checked before anything is lost.
      if (cmd.needsName && !matchOne((rest[0] || ""))) {
        describeMode();                    // the mode line and picker already say why
        return findPerson(rest[0] || "", word) && undefined;
      }
      const out = await cmd.run(rest.join(" "));
      if (!out || !out.send) { input.value = ""; describeMode(); return; }
      text = out.send;                     // /me rewrites rather than intercepts
    }

    input.disabled = true;
    const sent = await window.auralfm.chatSay(text, null).catch(() => false);
    input.disabled = false;
    input.focus();
    if (sent) input.value = "";
    // Never silently swallow it. If no relay took the message, the text stays
    // where the person typed it.
    else sendFailed(input, t("chat.failed", "AuralFM cannot reach a relay. It did not send your message."));
    describeMode();
  };

  // The mode line is only honest if it keeps up with the typing.
  $("chatinput").addEventListener("input", describeMode);
  $("chatdmout").onclick = leaveDm;
  /**
   * Escape leaves the conversation.
   *
   * Only while the composer has focus and only while there is a thread to leave,
   * so it never competes with Escape elsewhere — the tour listens on capture, and
   * a key that closes two things at once closes the wrong one.
   */
  $("chatdms").onclick = toggleConvos;
  $("chatinput").addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (convosOpen) { e.preventDefault(); e.stopPropagation(); return closeConvos(); }
    if (hubIn) { e.preventDefault(); e.stopPropagation(); return void leaveHub(); }
    if (!dmWith) return;
    e.preventDefault();
    e.stopPropagation();
    leaveDm();
  });
}
