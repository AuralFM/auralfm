/**
 * A station's schedule: read from what the station wrote on the claim form, and
 * written out as a calendar file a listener can keep.
 *
 * "Tell me when it starts" without a server: the listener's own calendar does
 * the telling, in the listener's own time zone, and AuralFM keeps nothing. The
 * same file is read by scripts/claims.mjs (which turns the form's lines into
 * slots when a claim is approved) and by the station's page in the app (which
 * turns a slot into an .ics file), so the two can never disagree about what a
 * line means.
 *
 * A line on the form:   Morning Glory | Mon-Fri | 07:00-09:00 | Europe/London
 * A slot:               { name, days: ["MO",…], start: "07:00", end: "09:00", tz }
 *
 * The hours are the station's own wall clock, kept with its time zone, so a
 * show that moves an hour for the listener when the station's clocks change
 * moves in their calendar too.
 */
(function (root, make) {
  if (typeof module === "object" && module.exports) module.exports = make();
  else root.AuralSchedule = make();
})(typeof self !== "undefined" ? self : this, function () {
  const DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
  const WORD = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  const pad = (n) => String(n).padStart(2, "0");
  const validZone = (tz) => { try { new Intl.DateTimeFormat("en", { timeZone: tz }); return /\//.test(tz) || tz === "UTC"; } catch { return false; } };

  /** "Mon-Fri", "Mon Wed", "Sat & Sun", "daily", "weekdays", "weekends" → [1, 2, …], or null. */
  function days(text) {
    const s = String(text).toLowerCase().trim().replace(/\s*[-–—]\s*/g, "-");
    if (/^(daily|every ?day)$/.test(s)) return [0, 1, 2, 3, 4, 5, 6];
    if (s === "weekdays") return [1, 2, 3, 4, 5];
    if (s === "weekends") return [6, 0];
    const out = new Set();
    for (const part of s.split(/[\s,&]+/).filter(Boolean)) {
      const range = part.split("-").map((w) => WORD[w.slice(0, 3)]);
      if (range.length > 2 || range.some((d) => d === undefined)) return null;
      for (let d = range[0]; ; d = (d + 1) % 7) { out.add(d); if (d === range[range.length - 1]) break; }
    }
    return out.size ? [...out] : null;
  }

  /** The form's lines → { slots, bad }. A line that cannot be read is given back, never guessed at. */
  function parse(text) {
    const slots = [], bad = [];
    for (const line of String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
      const [name, d, hours, tz] = line.split("|").map((x) => x.trim());
      const day = d ? days(d) : null;
      const h = hours ? hours.match(/^(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})$/) : null;
      const ok = name && name.length <= 80 && day && h && +h[1] < 24 && +h[3] < 24 && +h[2] < 60 && +h[4] < 60 && tz && validZone(tz);
      if (!ok) { bad.push(line); continue; }
      slots.push({ name, days: day.map((i) => DAYS[i]), start: `${pad(h[1])}:${h[2]}`, end: `${pad(h[3])}:${h[4]}`, tz });
    }
    return { slots: slots.slice(0, 12), bad };
  }

  /** A slot as it comes out of a profile: only what parse() could have made. */
  const valid = (s) => !!s && typeof s.name === "string" && s.name.length > 0 && s.name.length <= 80
    && Array.isArray(s.days) && s.days.length > 0 && s.days.every((d) => DAYS.includes(d))
    && /^([01]\d|2[0-3]):[0-5]\d$/.test(s.start || "") && /^([01]\d|2[0-3]):[0-5]\d$/.test(s.end || "")
    && typeof s.tz === "string" && validZone(s.tz);

  /** The clock on the wall in a zone at an instant, as if it were UTC. */
  function wall(tz, ms) {
    const p = {};
    for (const part of new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(ms))) p[part.type] = +part.value;
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  }
  /** The instant at which a zone's wall clock reads y-m-d h:mi. */
  function instant(tz, y, m, d, h, mi) {
    const want = Date.UTC(y, m - 1, d, h, mi);
    let at = want - (wall(tz, want) - want);
    at = want - (wall(tz, at) - at);          // once more: the first guess can sit on the other side of a clock change
    return at;
  }

  /** The next time a slot starts after `now`: { y, m, d } in the station's zone, and `at`, the instant. */
  function next(slot, now) {
    const today = new Date(wall(slot.tz, now));
    const [h, mi] = slot.start.split(":").map(Number);
    for (let i = 0; i < 8; i++) {
      const day = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + i));
      if (!slot.days.includes(DAYS[day.getUTCDay()])) continue;
      const y = day.getUTCFullYear(), m = day.getUTCMonth() + 1, d = day.getUTCDate();
      const at = instant(slot.tz, y, m, d, h, mi);
      if (at > now) return { y, m, d, at };
    }
    return null;
  }

  const text = (s) => String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  /** Calendar files fold long lines; sixty characters stays under the limit even in scripts that take three bytes a letter. */
  const fold = (line) => line.length <= 60 ? line : line.match(/.{1,60}/gu).join("\r\n ");

  /** One slot as an .ics file: every week on its days, with a reminder ten minutes before. Null if it never comes round. */
  function ics(slot, station, now) {
    const n = next(slot, now);
    if (!n) return null;
    const [sh, sm] = slot.start.split(":").map(Number), [eh, em] = slot.end.split(":").map(Number);
    const over = eh * 60 + em <= sh * 60 + sm;                       // ends after midnight
    const end = new Date(Date.UTC(n.y, n.m - 1, n.d + (over ? 1 : 0)));
    const stamp = new Date(now).toISOString().replace(/[-:]|\.\d{3}/g, "");
    const url = `https://listen.auralfm.xyz/?station=${encodeURIComponent(station.id)}`;
    const slug = slot.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "show";
    return [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//AuralFM//Station schedule//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      `UID:${station.id}-${slug}-${slot.start.replace(":", "")}@auralfm.xyz`,
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=${slot.tz}:${n.y}${pad(n.m)}${pad(n.d)}T${pad(sh)}${pad(sm)}00`,
      `DTEND;TZID=${slot.tz}:${end.getUTCFullYear()}${pad(end.getUTCMonth() + 1)}${pad(end.getUTCDate())}T${pad(eh)}${pad(em)}00`,
      `RRULE:FREQ=WEEKLY;BYDAY=${slot.days.join(",")}`,
      `SUMMARY:${text(`${slot.name} · ${station.title}`)}`,
      `DESCRIPTION:${text(`${station.title} on AuralFM: ${url}`)}`,
      `URL:${url}`,
      "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${text(slot.name)}`, "TRIGGER:-PT10M", "END:VALARM",
      "END:VEVENT", "END:VCALENDAR", "",
    ].map(fold).join("\r\n");
  }

  return { DAYS, parse, valid, next, ics };
});
