// The daily push's once-a-day guard, shared by daily-push (which decides whether to send a
// sport's lead) and health-probe (which asks the same question to tell a stuck push from a quiet
// week). Pure, no I/O, so both functions' tests run it under a bare `deno test`.
import { DEFAULT_SPORT, SPORT_KEYS, type SportKey } from "./sports.ts";

export type Lead = { headline?: string; section?: string; date?: string; image?: string; url?: string };

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

// ---------- the editorial day ----------

export const EDITORIAL_TZ = "America/Edmonton";

// The "already sent today" check uses the ARCHV editorial day, not the UTC day: the desk
// operates out of America/Edmonton, and a UTC-based check would flip to a new "day" hours
// before (winter, UTC-7) or after (summer, UTC-6) the desk's own midnight, letting a second
// push slip through, or blocking a legitimate one, right at the boundary. The day is built from
// formatToParts (year, month, day) rather than from a locale's short-date pattern, so it does not
// depend on how the runtime's ICU prints en-CA. A result that is not YYYY-MM-DD throws, so callers
// (the push claim, the day file paths, the scores window) fail closed.
const DAY_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: EDITORIAL_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function isoDayFromParts(parts: Intl.DateTimeFormatPart[]): string {
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const day = `${get("year")}-${get("month")}-${get("day")}`;
  if (!ISO_DAY.test(day)) throw new Error(`edmontonDay: could not build a YYYY-MM-DD day (got "${day}")`);
  return day;
}

export const edmontonDay = (d: Date): string => isoDayFromParts(DAY_FORMAT.formatToParts(d));

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

// ---------- which feed carries a sport's lead ----------

// The feed file that carries a sport's lead, by the name index.json lists it under. Football's
// lead is today.json's `lead`, the transfer and World Cup pool that every token got before
// per-sport pushes. Every other sport publishes one file named after its key, and its newest
// entry is its lead. Same rule as the widget (ARCHVWidget fetchLead) and index.json's
// sports[].feed, so a reader's push and their widget agree on the day's story.
export function feedName(sport: SportKey): string {
  return sport === DEFAULT_SPORT ? "today" : sport;
}

// The lead out of one parsed feed document: today.json's `lead` for football, `days[0]` for a
// sport feed (build-feed.mjs writes days newest first). Anything else, an empty sport or a
// document of the wrong shape, is no lead at all.
export function leadFromFeed(sport: SportKey, doc: unknown): Lead | null {
  if (!doc || typeof doc !== "object") return null;
  const d = doc as { lead?: unknown; days?: unknown };
  const raw = sport === DEFAULT_SPORT ? d.lead : Array.isArray(d.days) ? d.days[0] : undefined;
  return raw && typeof raw === "object" ? raw as Lead : null;
}

// Every sport's state from the two tables daily-push reads. Football keeps the original
// push_state singleton (last_build_hash now holds the football lead key; health-probe reads
// both columns), and the other sports have a row each in push_sport_state. A
// push_sport_state row for football or an unknown sport is ignored rather than trusted, so
// there is one football state and only one.
export function statesFrom(
  legacy: { last_build_hash?: unknown; last_sent_at?: unknown } | null | undefined,
  sportRows: readonly { sport?: unknown; last_lead_key?: unknown; last_sent_at?: unknown }[],
): Map<SportKey, SportState> {
  const str = (v: unknown) => typeof v === "string" && v ? v : null;
  const states = new Map<SportKey, SportState>();
  if (legacy) {
    states.set(DEFAULT_SPORT, { lastLeadKey: str(legacy.last_build_hash), lastSentAt: str(legacy.last_sent_at) });
  }
  for (const r of sportRows) {
    const sport = r.sport;
    if (typeof sport !== "string" || sport === DEFAULT_SPORT) continue;
    if (!(SPORT_KEYS as readonly string[]).includes(sport)) continue;
    states.set(sport as SportKey, { lastLeadKey: str(r.last_lead_key), lastSentAt: str(r.last_sent_at) });
  }
  return states;
}
