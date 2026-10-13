// scores-poll decisions: the three-day window, when the schedule is due, which matches need a
// details call, and which files are worth writing. Pure, no I/O, tested in plan_test.ts.
import { edmontonDay, EDITORIAL_TZ } from "../_shared/push_guard.ts";
import { hasKickedOff, isNotStarted, type Match } from "./map.ts";

export const SCHEDULE_EVERY_MS = 30 * 60_000;
// A details call starts this long before kickoff (the lineups are usually out by then).
export const START_LEAD_MS = 10 * 60_000;
// A finished match keeps being polled this long: ratings and stats settle after the whistle.
export const FINISHED_TAIL_MS = 2 * 3_600_000;
// A match the API still calls not-started this long after kickoff is stuck or off, not about to
// begin. The schedule refresh will say which; the details call stops guessing.
export const STUCK_AFTER_MS = 3 * 3_600_000;
// How long to leave the API alone after it errors.
export const BACKOFF_MS = 2 * 60_000;
// ids per details call, API-Football's cap.
export const MAX_DETAIL_IDS = 20;

// ---------- the season ----------

// API-Football numbers a season by the year it starts in: 2026 is 2026/27. It rolls over on 1 July,
// when the new qualifying rounds open. APIFOOTBALL_SEASON overrides it (see index.ts).
export function seasonFor(now: Date): number {
  return now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}

// ---------- the window ----------

// Edmonton's wall clock minus UTC at one instant, in ms (-6h in summer, -7h in winter). Same
// calculation as daily-push's leads.ts, which keeps it to itself.
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

// The calendar day n days from a YYYY-MM-DD day.
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// The instant an Edmonton day begins. Edmonton changes its clocks at 02:00, never at midnight, so
// the offset read near midnight is the one that applies; the second read only confirms it.
export function startOfEdmontonDay(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  const wall = Date.UTC(y, m - 1, d);
  const guess = wall - edmontonOffsetMs(new Date(wall + 6 * 3_600_000));
  return new Date(wall - edmontonOffsetMs(new Date(guess)));
}

export type Window = {
  today: string; // the Edmonton day the window was cut on
  startMs: number; // yesterday 00:00 Edmonton
  endMs: number; // the start of the day after tomorrow, exclusive: tomorrow 23:59 is inside
  from: string; // UTC dates to ask the API for. The API reads from/to as UTC days, which can
  to: string; //   spill past the window's edges; inWindow does the exact cut.
};

export function windowFor(now: Date): Window {
  const today = edmontonDay(now);
  const startMs = startOfEdmontonDay(addDays(today, -1)).getTime();
  const endMs = startOfEdmontonDay(addDays(today, 2)).getTime();
  return {
    today,
    startMs,
    endMs,
    from: new Date(startMs).toISOString().slice(0, 10),
    to: new Date(endMs - 1).toISOString().slice(0, 10),
  };
}

export function inWindow(kickoff: string, w: Window): boolean {
  const t = Date.parse(kickoff);
  return Number.isFinite(t) && t >= w.startMs && t < w.endMs;
}

// ---------- the schedule ----------

// The schedule is refetched every 30 minutes, or at once when the Edmonton day has rolled (the
// window moves with it) or there is no schedule yet.
export function scheduleDue(
  s: { scheduleFetchedAt: string | null; windowDay: string | null },
  now: Date,
): boolean {
  if (!s.scheduleFetchedAt || s.windowDay !== edmontonDay(now)) return true;
  const age = now.getTime() - Date.parse(s.scheduleFetchedAt);
  return !Number.isFinite(age) || age < 0 || age >= SCHEDULE_EVERY_MS;
}

// ---------- when a match finished ----------

// Record when each finished match finished, so the two-hour tail has a start. A match seen going
// from live to finished is stamped now. One first seen already finished (a cold start, a schedule
// refresh half an hour on) gets a kickoff-based estimate, never later than now. Entries for
// matches that have left the window go.
export function trackFinished(
  prev: readonly Match[],
  next: readonly Match[],
  finishedAt: Readonly<Record<string, string>>,
  now: Date,
): Record<string, string> {
  const before = new Map(prev.map((m) => [m.id, m]));
  const out: Record<string, string> = {};
  for (const m of next) {
    if (!m.status.finished) continue;
    const known = finishedAt[String(m.id)];
    if (known) {
      out[String(m.id)] = known;
    } else if (before.get(m.id)?.status.live) {
      out[String(m.id)] = now.toISOString();
    } else {
      const long = m.status.code === "AET" || m.status.code === "PEN";
      const estimate = Date.parse(m.kickoff) + (long ? 150 : 115) * 60_000;
      out[String(m.id)] = new Date(Math.min(estimate, now.getTime())).toISOString();
    }
  }
  return out;
}

// ---------- the details call ----------

// Which matches the next details call should ask for, most urgent first: live matches, then ones
// about to start (or just started and not yet marked live), then ones that finished under two
// hours ago, then any that have kicked off and have no file yet (a cold start, or a gap in the
// polling). Nothing else is worth a request. Capped at the API's 20 ids; `deferred` counts the
// rest, which wait for the next minute.
export function detailTargets(
  matches: readonly Match[],
  ctx: {
    now: Date;
    finishedAt: Readonly<Record<string, string>>;
    hasFile: (id: number) => boolean;
  },
): { ids: number[]; deferred: number } {
  const now = ctx.now.getTime();
  const ranked: { id: number; rank: number; kickoff: number }[] = [];
  for (const m of matches) {
    const kickoff = Date.parse(m.kickoff);
    const code = m.status.code;
    let rank = -1;
    if (m.status.live) {
      rank = 0;
    } else if (isNotStarted(code)) {
      if (kickoff - now <= START_LEAD_MS && now - kickoff < STUCK_AFTER_MS) rank = 1;
    } else if (m.status.finished) {
      const at = Date.parse(ctx.finishedAt[String(m.id)] ?? "");
      if (Number.isFinite(at) && now - at < FINISHED_TAIL_MS) rank = 2;
    }
    if (rank < 0 && hasKickedOff(code) && !ctx.hasFile(m.id)) rank = 3;
    if (rank >= 0) ranked.push({ id: m.id, rank, kickoff });
  }
  ranked.sort((a, b) => a.rank - b.rank || a.kickoff - b.kickoff || a.id - b.id);
  return {
    ids: ranked.slice(0, MAX_DETAIL_IDS).map((r) => r.id),
    deferred: Math.max(0, ranked.length - MAX_DETAIL_IDS),
  };
}

// ---------- writing ----------

export type OutFile = { path: string; body: { generatedAt: string } & Record<string, unknown> };
export type Planned = { path: string; text: string; hash: string };

// JSON with every object's keys sorted, so two documents that say the same thing compare equal
// whatever order their keys were built or read back in (Postgres jsonb reorders them). Arrays keep
// their order, which is meaningful here.
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    const parts = Object.keys(o).sort().filter((k) => o[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`);
    return `{${parts.join(",")}}`;
  }
  return JSON.stringify(v) ?? "null";
}

// The first 16 hex of the sha256 of a document with generatedAt left out. generatedAt moves every
// run, so it cannot be part of "has this changed". Keys are sorted first: the matches in a quiet
// minute come back from the state row in jsonb's key order, and an order change is not a change.
export async function contentHash(body: Record<string, unknown>): Promise<string> {
  const { generatedAt: _ignored, ...rest } = body;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalJson(rest)));
  let hex = "";
  for (const b of new Uint8Array(digest)) hex += b.toString(16).padStart(2, "0");
  return hex.slice(0, 16);
}

// Of the files a run built, the ones whose content differs from what was last written. A file
// whose hash matches is skipped, so a quiet minute writes nothing.
export async function planWrites(
  files: readonly OutFile[],
  written: Readonly<Record<string, string>>,
): Promise<Planned[]> {
  const out: Planned[] = [];
  for (const f of files) {
    const hash = await contentHash(f.body);
    if (written[f.path] !== hash) out.push({ path: f.path, text: JSON.stringify(f.body), hash });
  }
  return out;
}
