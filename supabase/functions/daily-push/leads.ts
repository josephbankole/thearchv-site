// daily-push lead helpers: which feed carries each sport's lead, the sport states, the token
// grouping and the APNs headers. Pulled out of index.ts like fanout.ts, so leads_test.ts can run
// them under a bare `deno test` with no network and no database. Nothing here does I/O;
// feedHash only hashes the text it is handed. What identifies a lead, and the once-a-day guard,
// live in ../_shared/push_guard.ts, because health-probe asks the guard the same question.
import { DEFAULT_SPORT, resolveSport, SPORT_KEYS, type SportKey } from "../_shared/sports.ts";
import { EDITORIAL_TZ, edmontonDay, type Lead, type SportState } from "../_shared/push_guard.ts";

export {
  decideSend,
  type Decision,
  edmontonDay,
  type Lead,
  leadKey,
  leadKeyDate,
  type SportState,
} from "../_shared/push_guard.ts";

export const SITE = "https://thearchv.ca";

// ---------- feeds ----------

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

// name -> per-feed hash out of index.json. build-feed.mjs hashes each feed file as the first 12
// hex of its sha256, and that is what the served body hashes to (checked live 2026-10-12).
export function feedHashesFrom(index: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  const feeds = (index as { feeds?: unknown })?.feeds;
  if (!Array.isArray(feeds)) return out;
  for (const f of feeds) {
    const name = (f as { name?: unknown })?.name;
    const hash = (f as { hash?: unknown })?.hash;
    if (typeof name === "string" && typeof hash === "string" && hash) out[name] = hash;
  }
  return out;
}

// The same short hash build-feed.mjs writes into the manifest, over the exact body we fetched.
export async function feedHash(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  let hex = "";
  for (const b of new Uint8Array(digest)) hex += b.toString(16).padStart(2, "0");
  return hex.slice(0, 12);
}

// ---------- sport states ----------

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

// ---------- tokens ----------

// Opted-in tokens by the sport each reader picked. Every known sport gets an entry, empty or
// not, so a sport with no readers yet still has its lead recorded and its first reader is never
// handed a weeks-old story. A null sport (every build shipped before the column), "all" and
// anything unknown land in football. A token appears once, whatever the rows say.
export function groupTokensBySport(
  rows: readonly { token?: unknown; sport?: unknown }[],
): Map<SportKey, string[]> {
  const groups = new Map<SportKey, string[]>(SPORT_KEYS.map((s) => [s, []]));
  const seen = new Set<string>();
  for (const r of rows) {
    if (typeof r.token !== "string" || !r.token || seen.has(r.token)) continue;
    seen.add(r.token);
    groups.get(resolveSport(r.sport))!.push(r.token);
  }
  return groups;
}

// ---------- APNs ----------

// Edmonton's wall clock minus UTC at one instant, in ms (-6h in summer, -7h in winter).
function edmontonOffsetMs(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: EDITORIAL_TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const wall = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second"));
  return wall - Math.floor(at.getTime() / 1000) * 1000;
}

// The end of the editorial day `now` falls in, as epoch seconds: the next Edmonton midnight.
// Edmonton changes its clocks at 02:00, never at midnight, so the offset read near midnight is
// the one that applies; the second read only confirms it.
export function endOfEdmontonDay(now: Date): number {
  const [y, m, d] = edmontonDay(now).split("-").map(Number);
  const midnightWall = Date.UTC(y, m - 1, d + 1);
  let instant = midnightWall - edmontonOffsetMs(new Date(midnightWall));
  instant = midnightWall - edmontonOffsetMs(new Date(instant));
  return Math.floor(instant / 1000);
}

// One collapse id per sport per editorial day (C126). Two notifications with the same id show
// as one on the lock screen, so a retried send for the same sport and day can never stack.
export function collapseId(sport: SportKey, day: string): string {
  return `daily-${sport}-${day}`;
}

// The headers for one sport's sends. apns-expiration (C126) is the end of the editorial day:
// without it APNs holds an undelivered push for a phone that is off and hands it over days
// later, next to that day's own push. After midnight the story is not the day's story, so
// APNs drops it instead.
export function apnsHeaders(
  jwt: string,
  bundleId: string,
  sport: SportKey,
  day: string,
  now: Date,
): Record<string, string> {
  return {
    authorization: `bearer ${jwt}`,
    "apns-topic": bundleId,
    "apns-push-type": "alert",
    "apns-priority": "5",
    "apns-expiration": String(endOfEdmontonDay(now)),
    "apns-collapse-id": collapseId(sport, day),
    "content-type": "application/json",
  };
}

// The deep link the app's Router follows: the entry's own section (its feed key, by the
// section=feed-key contract) and date. Router.parse drops anything that is not a feed-key shape,
// and a payload with no route opens the Today tab.
export function routeFor(lead: Lead): { section?: string; date?: string } {
  const section = typeof lead.section === "string" ? lead.section : "";
  const date = typeof lead.date === "string" ? lead.date : "";
  return section && date ? { section, date } : {};
}
