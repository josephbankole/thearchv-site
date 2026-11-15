// The daily push's once-a-day guard, shared by daily-push (which decides whether to send a
// sport's lead) and health-probe (which asks the same question to tell a stuck push from a quiet
// week). Pure, no I/O, so both functions' tests run it under a bare `deno test`.

export type Lead = { headline?: string; section?: string; date?: string; image?: string; url?: string };

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

// ---------- the editorial day ----------

export const EDITORIAL_TZ = "America/Edmonton";

// The "already sent today" check uses the ARCHV editorial day, not the UTC day: the desk
// operates out of America/Edmonton, and a UTC-based check would flip to a new "day" hours
// before (winter, UTC-7) or after (summer, UTC-6) the desk's own midnight, letting a second
// push slip through, or blocking a legitimate one, right at the boundary. en-CA formats as
// YYYY-MM-DD.
export const edmontonDay = (d: Date): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: EDITORIAL_TZ }).format(d);

// ---------- the send window ----------

// Pushes go out only between 07:00 and 21:00 Edmonton time (the editorial clock). The once-a-day
// guard alone let a lead that arrived after the day's push wait for the first hourly tick after
// Edmonton midnight, which pushed it to every reader of that sport at 00:00 Edmonton, 02:00
// Toronto. Outside the window a sport skips WITHOUT recording anything, so the lead goes at the
// first tick inside it (07:00), when it is still new. The hours are a default the founder can change.
export const SEND_WINDOW = { startHour: 7, endHour: 21 } as const;

// The hour (0-23) on the Edmonton clock.
export function edmontonHour(d: Date): number {
  const h = new Intl.DateTimeFormat("en-CA", { timeZone: EDITORIAL_TZ, hour: "numeric", hourCycle: "h23" })
    .formatToParts(d)
    .find((p) => p.type === "hour")?.value;
  return Number(h);
}

// True from startHour:00 up to, not including, endHour:00 Edmonton time.
export function inSendWindow(d: Date): boolean {
  const h = edmontonHour(d);
  return h >= SEND_WINDOW.startHour && h < SEND_WINDOW.endHour;
}

// ---------- the lead's identity, and the guard ----------

// What makes a lead the same lead (C115). The guard used to compare the whole today.json
// hash, and that file carries a lastUpdated taken across every lane, so a leagues or NFL
// publish changed the hash and pushed yesterday's football headline again. The key is the
// lead's own date, section and url: the url names the article, so a later headline correction
// does not push the same story twice. The headline stands in only where an entry has no url.
// The date leads the key so the guard can read it back (leadKeyDate). No date, or nothing to
// name the story by, gives no key, and no key means no send.
export function leadKey(lead: Lead | null): string | null {
  if (!lead) return null;
  const date = typeof lead.date === "string" ? lead.date : "";
  if (!ISO_DAY.test(date)) return null;
  const section = typeof lead.section === "string" ? lead.section : "";
  const name = typeof lead.url === "string" && lead.url
    ? lead.url
    : typeof lead.headline === "string" ? lead.headline : "";
  if (!name) return null;
  return `${date}|${section}|${name}`;
}

// The date a stored key was made from, or null for anything that is not a lead key. That
// includes the today-feed hash push_state.last_build_hash held before this change, which is
// how decideSend tells a legacy football row from a new one.
export function leadKeyDate(key: string | null | undefined): string | null {
  if (!key || key[10] !== "|") return null;
  const day = key.slice(0, 10);
  return ISO_DAY.test(day) ? day : null;
}

export type SportState = { lastLeadKey: string | null; lastSentAt: string | null };
export type Decision = { send: true; key: string } | { send: false; skipped: string };

// One sport's once-a-day guard, pure. In order: no dated lead, the same lead as last time, a
// push already sent today for this sport, a lead older than the last one pushed (the newest
// entry was pulled and the feed fell back to one readers already had), and, on a legacy
// football row that holds a hash rather than a key, a lead dated on or before the day of that
// last push. The legacy rule fails toward NOT sending: a hash cannot say which lead it was, and
// a lead dated on or before the last push day was almost certainly the one pushed. It clears
// itself the first time a newer lead sends and the row gets a real key. A last_sent_at that
// does not parse is a state we cannot trust, so it refuses too.
export function decideSend(state: SportState | null, lead: Lead | null, today: string): Decision {
  const key = leadKey(lead);
  if (!key) return { send: false, skipped: "no dated lead" };
  if (state?.lastLeadKey === key) return { send: false, skipped: "lead unchanged" };

  let lastDay: string | null = null;
  if (state?.lastSentAt) {
    const at = new Date(state.lastSentAt);
    if (Number.isNaN(at.getTime())) return { send: false, skipped: "push state unreadable" };
    lastDay = edmontonDay(at);
    if (lastDay === today) return { send: false, skipped: "already sent today" };
  }

  const leadDate = key.slice(0, 10);
  const lastLeadDate = leadKeyDate(state?.lastLeadKey);
  if (lastLeadDate) {
    if (leadDate < lastLeadDate) return { send: false, skipped: "lead older than the last one pushed" };
  } else if (lastDay && leadDate <= lastDay) {
    return { send: false, skipped: "lead predates the last push" };
  }
  return { send: true, key };
}
