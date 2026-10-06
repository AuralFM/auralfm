/**
 * Explore, part 11 of 17: The chat panel: presence peers, the log, notes, syncing to a cell, the composer.
 *
 * Explore is one page split across plain scripts that share a global scope, in
 * the order explore.html loads them. Declarations live here; anything that runs
 * at load — listeners, IPC subscriptions, one-off calls — is in wireChat(),
 * which explore.js calls once every part has loaded. That keeps the original
 * single-file behaviour: no handler can fire into a part that has not loaded.
 */

/**
 * Other listeners, if presence is switched on.
 *
 * Drawn as slow pulsing rings rather than dots, because a different *shape*
 * reads as a different kind of thing far more reliably than a different colour —
 * and on a globe that already carries station dots, receiver dots, orbit
 * trails and propagation arcs, one more coloured dot would just be noise.
 *
 * A ring is also the honest picture: these are not points, they are geohash
 * cells about twenty kilometres across. Somebody is listening near there.
 */
let peers = [];

/**
 * The conversation in the cell you are listening to.
 *
 * This is a *public* square about twenty kilometres across, not a private
 * message, and the interface should never let anyone forget it: no encryption
 * badge, no lock, no direct-message affordance, and a placeholder that says
 * "this place" rather than a person's name.
 *
 * It appears only when presence is on and something is playing, because those
 * are the same two conditions under which we announce at all — a chat box that
 * cannot send is worse than no chat box.
 */
let chatOn = false;
let myCell = null;

/** Same test the main process uses: one cell contains the other, at any zoom. */
const sameCell = (a, b) => a.startsWith(b) || b.startsWith(a);

function paintChatHead() {
  const where = $("chatwhere"), who = $("chatpeers");
  if (!where || !who) return;
  /**
   * Only the people in *this* cell.
   *
   * `peers` is everyone the relays have shown us anywhere on Earth, which is
   * right for the rings on the globe and wrong here: the first version of this
   * header read "Near Lisbon · 11 listening" while the eleven were in Toronto,
   * Tehran and Prague. A true number under a false label is worse than no
   * number.
   */
  const cell = viewingCell || myCell;
  const near = cell ? peers.filter((p) => p.geohash && sameCell(p.geohash, cell)).length : 0;
  // Name the room actually on screen. While browsing that is the place under the
  // globe, not the station playing in your ears, and labelling it wrong is worse
  // than showing nothing — it would attribute strangers to a city they are not in.
  const browsedPlace = viewingCell && selection.place ? selection.place.title : null;
  where.textContent = browsedPlace
    ? `${t("chat.near", "Near")} ${browsedPlace}`
    : window.AuralStudio?.hosting?.title
      ? `${t("chat.near", "Near")} ${window.AuralStudio.hosting.title}`
    : window.AuralShow
      ? `${t("shows.room", "The show's town")}`
    : playing?.place
      ? `${t("chat.near", "Near")} ${playing.place}`
      : t("chat.here", "Around here");
  who.textContent = near
    ? `${near} ${near === 1 ? t("chat.listener", "listening") : t("chat.listeners", "listening")}`
    : t("chat.alone", "nobody else yet");

  /**
   * Say what the number is not.
   *
   * "3 listening" invites the obvious wrong reading — that three people are
   * using AuralFM. The relays can see far more than that, everywhere on Earth,
   * and the difference between the two numbers is the whole shape of the
   * network. It does not belong in the header, where it would compete with the
   * count that actually describes this place, but leaving it unexplained is why
   * the question keeps getting asked.
   */
  const everywhere = peers.length;
  // No tag. This was two sentences explaining a number that is already on
  // screen — a readout wearing a help tag, and the longest one in the app. Help
  // tags describe how to use a control; this describes data.
  who.setAttribute("aria-label", everywhere > near
    ? `${near} here, ${everywhere} worldwide`
    : `${near} here`);
}

/**
 * One timeline, three sources.
 *
 * Public messages, location notes and private messages all belong to the place
 * you are looking at, and they arrive on three separate channels. The first
 * version of this gave each one its own panel, which was wrong for a reason
 * worth keeping: they are the same conversation. A note left this morning and a
 * reply whispered privately an hour later read as one exchange, and splitting
 * them into tabs makes the reader reassemble the order by hand.
 *
 * So they are held separately — each channel repaints its own cache — and merged
 * by time on the way to the screen. Styling carries the difference, because the
 * difference matters enormously: a note is public and permanent, a private
 * message is neither.
 */
let noteCache = [];
let dmCache = [];
/** The hub we are in, and what has been said in it. */
let hubIn = null;          // { name, tag } or null
let hubCache = [];
/**
 * Profiles looked up so far, by pubkey.
 *
 * Only ever filled by somebody running /whois. Nothing populates this in the
 * background, because the background version is the bulk fetch that would tell a
 * relay who is in your cell.
 */
let knownProfiles = {};

/** Their own nickname first — it travels with the message and is more current. */
const displayName = (m) => m.nick || knownProfiles[m.pubkey]?.name || m.from;
/** Everything main knows about the people here, keyed by pubkey. */
let contacts = new Map();

function paintChat(list) {
  // Kept so /mute can turn a name somebody typed into the key it belongs to.
  chatCache = Array.isArray(list) ? list.slice(-200) : [];
  repaintLog();
}

function paintNotes(list) {
  noteCache = Array.isArray(list) ? list.slice(0, 200) : [];
  repaintLog();
}

function paintDms(list) {
  dmCache = Array.isArray(list) ? list.slice(-200) : [];
  paintDmButton();
  if (convosOpen) paintConvos();
  repaintLog();
}

function repaintLog() {
  const log = $("chatlog");
  if (!log) return;
  // Only stick to the bottom if the reader is already there — yanking someone
  // away from a line they are reading is the classic chat-window sin.
  const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
  log.innerHTML = "";

  // In a private conversation the log *is* that conversation. Leaving the public
  // room's messages underneath would put a twenty-kilometre square and a private
  // thread in one column, which is the confusion this whole change exists to end.
  /**
   * Two scopes, never in one column.
   *
   * A room is a place: its messages and its notes belong to a twenty-kilometre
   * cell and stop meaning anything the moment you tune somewhere else. A private
   * conversation is a person: it belongs to them and follows you everywhere.
   *
   * Merging them put a message meant for one person into every room's log and
   * carried it from city to city — Melton sent a screenshot of exactly that, a
   * PRIVATE line sitting above a public composer in a city it had nothing to do
   * with. So the room shows the room, a conversation shows the conversation, and
   * neither one borrows the other's column.
   *
   * What the app said appears in both, because it is addressed to you rather
   * than to a room, and walking into a conversation should not silence it.
   */
  const said = systemCache.map((m) => ({ ...m, sort: m.at || 0 }));
  const merged = (hubIn
    ? [...said, ...hubCache.map((m) => ({ ...m, kind: "hub", sort: m.at || 0 }))]
    : dmWith
    ? [...said, ...dmCache.filter((m) => m.with === dmWith.pubkey)
        .map((m) => ({ ...m, kind: "dm", sort: m.at || 0 }))]
    : [
        ...said,
        ...chatCache.map((m) => ({ ...m, sort: m.at || 0 })),
        ...noteCache.map((m) => ({ ...m, kind: "note", sort: m.at || 0 })),
      ]).sort((a, b) => a.sort - b.sort);

  for (const m of merged) {
    const el = document.createElement("div");
    el.className = "msg" + (m.mine ? " mine" : "") + (m.kind ? ` ${m.kind}` : "");

    // The app talking. No name, no mute control, no mention handling — there is
    // nobody on the other end of it.
    if (m.kind === "system") {
      el.textContent = m.text;
      log.append(el);
      continue;
    }

    const who = document.createElement("span");
    who.className = "who";
    // No nickname is the common case, and a truncated pubkey is at least true.
    who.textContent = (m.mine ? t("chat.you", "you") : displayName(m)) + "  ";
    // The name is the mute control. Nothing else in a chat line identifies a
    // person, so there is nowhere better to put it, and a separate button on
    // every message would be a column of buttons nobody wants.
    if (!m.mine && m.pubkey) {
      who.classList.add("mutable");
      who.tabIndex = 0;
      who.setAttribute("role", "button");
      who.title = t("chat.mute", "Mute or report this person");
      /**
       * Click a name: mute, or mute and report.
       *
       * Two choices rather than one, because they are not the same act. Muting is
       * about your window and takes effect now. Reporting is about the message
       * and goes to a person who will read it later — and since there is no
       * server, "later" is genuinely later. Reporting always mutes as well: a
       * report that leaves somebody on screen has done nothing for the person who
       * filed it.
       */
      const act = async () => {
        const label = m.nick || m.from;
        // Two questions rather than one dialog with three meanings. The first
        // Cancel stops everything and the second declines the extra step —
        // neither one does something on the way out, which a single confirm
        // offering "OK reports, Cancel mutes" would.
        if (!confirm(t("chat.muteAsk", `Mute ${label}?`).replace("{who}", label))) return;
        await guard("muteAdd", () => window.auralfm.muteAdd(m.pubkey));
        if (!confirm(t("chat.reportAsk", "Report it too? Opens an email."))) return;
        await guard("chatReport", () => window.auralfm.chatReport({
          pubkey: m.pubkey, text: m.text, at: m.at, geohash: m.geohash,
        }));
        systemLine(t("chat.reported", "Muted. Report draft opened."));
      };
      who.onclick = act;
      who.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); act(); } };
    }
    // Mentions. BitChat uses @nickname to notify a specific person; here it only
    // marks the line, because there are no notifications to raise and a chat that
    // pings is a chat that interrupts listening.
    const mine = (prefs.nickname || "").trim();
    if (mine && new RegExp(`@${mine.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(m.text)) {
      el.classList.add("mention");
    }
    /**
     * What kind of line this is, said in words.
     *
     * A pin glyph and a padlock glyph would be quicker to scan and would tell a
     * screen reader nothing, and the distinction being marked here is the whole
     * safety property: public and permanent, versus encrypted to one person. So
     * it is a short word, in the text, that every reader gets.
     */
    if (m.kind === "note" || m.kind === "dm") {
      const tag = document.createElement("span");
      tag.className = `msgkind ${m.kind}`;
      tag.textContent = m.kind === "note"
        ? t("chat.note", "note") : t("chat.private", "private");
      el.prepend(tag);
    }

    // Contacts. A tick for somebody whose fingerprint you checked yourself, a
    // star for somebody you keep. Both after the name, both with a real label —
    // a bare glyph claiming "verified" would be the least honest thing here.
    const c = m.pubkey && contacts.get(m.pubkey);
    if (c?.verified) who.append(badge("✓", t("chat.verifiedWho", "fingerprint verified by you")));
    if (c?.favorite) who.append(badge("★", c.mutual
      ? t("chat.mutualWho", "kept, and they keep you") : t("chat.favWho", "kept by you")));

    el.append(who, document.createTextNode(m.text));
    // Everyone here from AuralFM is tuned in rather than standing there, and
    // some bitchat users are too. Say so, quietly.
    if (m.teleport) {
      const far = document.createElement("span");
      far.className = "who tuned";         // quieter than the name: see .who.tuned
      far.textContent = `  ${t("chat.tuned", "tuned in")}`;
      el.append(far);
    }
    /**
     * What they are using, when they say and it is not us.
     *
     * On the name's tooltip rather than in the line. The first question anyone
     * asks about this room is who these people are, and the client answers a lot
     * of it — but it is not what the sentence is about, and a second grey word
     * after every message would be a column of noise. Absent for AuralFM,
     * because "you are talking to someone using the app you are using" is not
     * information.
     */
    if (!m.mine && m.client && m.client !== "auralfm") {
      const via = `${m.nick || m.from} — ${m.client}`;
      who.title = who.title ? `${via}\n${who.title}` : via;
    }
    log.append(el);
  }
  if (atBottom) log.scrollTop = log.scrollHeight;
}

/** A small mark after a name, with the words behind it available to everyone. */
function badge(glyph, label) {
  const b = document.createElement("span");
  b.className = "badge";
  b.textContent = ` ${glyph}`;
  b.title = label;
  b.setAttribute("aria-label", label);
  b.setAttribute("role", "img");
  return b;
}

/**
 * Show or hide the whole panel.
 *
 * Shortwave was excluded here on the argument that a receiver is somewhere you
 * listen *from* rather than a place you are in. That does not survive the
 * obvious comparison: tuning a stream from Rio while sitting in Houston puts you
 * in Rio's cell, and tuning a receiver in Wellington is the same act. Both are
 * somewhere you are not. The only real difference was that the SDR session was
 * never given coordinates, which made a missing field look like a decision.
 *
 * The condition is now simply: presence is on, something is playing, and it has
 * a location.
 */
let viewingCell = null;      // set while browsing a cell we are not listening to

let chatHost = false;        // the room on screen is a show's town, not a station's
async function syncChat(prefs) {
  // A host is in their show's town (explore-studio.js), whatever was playing.
  const host = window.AuralStudio?.hosting || window.AuralShow || null;
  const at = host || playing;
  const want = !!(prefs?.presence === true && at
                  && typeof at.lat === "number" && typeof at.lon === "number");
  $("chat").hidden = !want;
  window.AuralStudio?.room?.();
  window.AuralShows?.layer();   // "Show other listeners" decides whether shows are looked for
  // Moving between a station's room and the show's is a new room even though
  // the card stays up: its log, its head and its composer all change.
  if (want === chatOn && !!host === chatHost) return;
  chatOn = want;
  chatHost = !!host;
  if (want) {
    try {
      // Contacts first, so the very first repaint already knows who is verified.
      // Painting the log and then learning about badges makes them appear a beat
      // late, which reads as a glitch on the one signal that must look solid.
      contacts = new Map((await window.auralfm.socialList() || []).map((c) => [c.pubkey, c]));
      noteCache = await window.auralfm.notesHistory() || [];
      dmCache = await window.auralfm.dmHistory() || [];
      paintChat(await window.auralfm.chatHistory());
      const st = await window.auralfm.presenceStats();
      myCell = st?.cell || null;
      viewingCell = st?.viewing || null;
    } catch { /* not up yet */ }
    paintChatHead();
    // The composer names the room too, and it was not repainting here. Tuning
    // from Rio to Los Angeles moved the header and left the line under the input
    // still promising Rio — two cities on screen at once, one of them a lie
    // about who was going to read the next thing typed.
    paintComposer();
    chatNotice();
  } else {
    myCell = null;
    viewingCell = null;
    // Notes belong to the place. Leaving it should not leave them on screen
    // under whatever place comes next.
    noteCache = [];
  }
}

/**
 * Point the conversation at whatever the globe is pointed at.
 *
 * With the lock off, sweeping the world already moves the place and the station
 * list. This moves the room too, which is the scanning metaphor finished — but
 * reading only. `presenceView` never announces and `say()` still guards on the
 * cell we are actually listening to, so browsing cannot broadcast a location
 * trail and cannot post into a room we are not standing in.
 *
 * Locking, or having nothing selected, hands the chat back to the station.
 */
async function syncChatView() {
  if (!chatOn) return;
  const p = (!locked && selection.place) ? selection.place : null;
  window.auralfm.presenceView(p ? p.lat : null, p ? p.lon : null);
  // Re-read rather than assume: main ignores the call entirely when presence is
  // off, and the renderer should reflect what actually happened.
  try {
    const st = await window.auralfm.presenceStats();
    viewingCell = st?.viewing || null;
  } catch { /* leave the last known state */ }
  paintChatHead();
  paintComposer();
}

/**
 * What this channel is, said once, the first time somebody sees it.
 *
 * Not a disclaimer and not a gate. Every other chat app a person has used has
 * somebody behind it who can remove a message and suspend an account, so arriving
 * here with that expectation is the reasonable thing to do — and it is wrong. The
 * sentence is short and it says the true thing: nobody moderates this, and the
 * tools are yours.
 *
 * In the log rather than in a modal, because a modal in front of a globe is an
 * interruption and this is information, not a decision. It sits at the top of the
 * conversation where somebody reading the room will read it.
 */
function chatNotice() {
  if (prefs?.chatNoticeSeen) return;
  // Short on purpose: every line in chat stays around 30 characters. The rest
  // of what this used to say lives where it acts — a name mutes or reports, and
  // Settings holds the filter and the erase.
  systemLine(t("chat.notice", "Public, unmoderated, permanent."));
  window.auralfm.setPrefs({ chatNoticeSeen: true });
}

/** A room you are only looking at cannot be spoken into, and should say so. */
function paintComposer() {
  const input = $("chatinput");
  if (!input) return;
  const browsing = !!viewingCell;
  input.disabled = browsing;
  input.placeholder = dmWith
    ? t("chat.dmPlaceholder", "Private message")
    : browsing
      ? t("chat.browsing", "Listen here to reply")
      : t("chat.placeholder", "Say something to this place");
  describeMode();
}

function wireChat() {
  window.auralfm.onPeers((list) => {
    peers = Array.isArray(list) ? list : [];
    window.AuralShows?.peers(peers);
    paintRings();
    paintChatHead();
  });
  window.auralfm.profilesKnown?.().then((p) => { knownProfiles = p || {}; }).catch(() => {});

  window.auralfm.onChat(paintChat);
  window.auralfm.onHubMessages((list) => { hubCache = Array.isArray(list) ? list : []; repaintLog(); });
  window.auralfm.onNotes(paintNotes);
  window.auralfm.onDms((list) => {
    paintDms(list);
    /**
     * Marking read on arrival, because the panel being open is what "read" means
     * here. There is no notification and no badge to chase — the unread flag exists
     * so the menu bar can show a count while the panel is shut, and the moment the
     * log repaints with the message in it, that count is a lie.
     */
    if (!$("chat")?.hidden) {
      for (const m of list) if (m.unread && !m.mine) window.auralfm.dmRead(m.with);
    }
  });
  window.auralfm.onSocial((list) => {
    contacts = new Map((list || []).map((c) => [c.pubkey, c]));
    repaintLog();
  });
}
