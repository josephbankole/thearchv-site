// scores-poll's match history: one file per Edmonton day (days/<YYYY-MM-DD>.json, archv-day/1) and
// an index of the days that have one (days/index.json, archv-days/1). Pure, no I/O: poll.ts keeps
// the days in the live window up to date and backfill.ts fills in the rest of the season, both
// through the helpers here, and days_test.ts covers them.
//
// A day file holds the same MATCH objects scores.json does, for the matches that kicked off on
// that Edmonton day, with the same `detail` pointer to match/<id>.json. The index lists each day
// with its match count, newest first. It only ever grows or changes in place: a run replaces the
// entries for the days it has just rebuilt and leaves every other entry alone.
import { edmontonDay } from "../_shared/push_guard.ts";
import { type Match, SOURCE, sortMatches } from "./map.ts";

export const DAY_SCHEMA = "archv-day/1";
export const DAYS_SCHEMA = "archv-days/1";
export const INDEX_PATH = "days/index.json";
export const dayPath = (date: string): string => `days/${date}.json`;

export type DayFile = {
  schema: typeof DAY_SCHEMA;
  date: string;
  generatedAt: string;
  source: typeof SOURCE;
  matches: Match[];
};
export type DayEntry = { date: string; count: number };
export type DaysIndex = {
  schema: typeof DAYS_SCHEMA;
  generatedAt: string;
  days: DayEntry[];
};

// A real calendar day written YYYY-MM-DD ("2026-02-30" is not one).
export function isDay(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10) === s;
}

// The Edmonton day a match kicked off on. This is the bucket a match lives in, whatever the
// reader's own time zone says.
export const dayOf = (kickoff: string): string => edmontonDay(new Date(kickoff));

// Matches grouped by their Edmonton day, each list in scores.json order.
export function groupByDay<T extends Match>(matches: readonly T[]): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const m of sortMatches(matches)) {
    const d = dayOf(m.kickoff);
    const list = out.get(d);
    if (list) list.push(m);
    else out.set(d, [m]);
  }
  return out;
}

export function buildDayFile(date: string, matches: readonly Match[], generatedAt: string): DayFile {
  return { schema: DAY_SCHEMA, date, generatedAt, source: SOURCE, matches: sortMatches(matches) };
}

// ---------- the index ----------

// The index as stored, or why not. null for `text` means there is no file yet, which is an empty
// index; null in the result means a file that is there and is not an index we can read, which the
// caller must not overwrite (it would drop every older day).
export function parseIndex(text: string | null): DayEntry[] | null {
  if (text === null) return [];
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return null;
  }
  const o = v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
  if (!o || o.schema !== DAYS_SCHEMA || !Array.isArray(o.days)) return null;
  const out: DayEntry[] = [];
  for (const raw of o.days) {
    const e = raw && typeof raw === "object" ? raw as Record<string, unknown> : null;
    if (!e || !isDay(e.date) || typeof e.count !== "number" || !Number.isInteger(e.count) || e.count < 0) {
      return null;
    }
    out.push({ date: e.date, count: e.count });
  }
  return out;
}

// The index after a run has rebuilt `rebuilt` days: an entry for each of those days that has
// matches replaces whatever was there, a rebuilt day with none is taken out, and every other entry
// stays exactly as it was. Newest first, one entry a date.
export function mergeIndex(
  existing: readonly DayEntry[],
  rebuilt: readonly string[],
  counts: ReadonlyMap<string, number>,
): DayEntry[] {
  const replaced = new Set(rebuilt);
  const byDate = new Map<string, number>();
  for (const e of existing) if (!replaced.has(e.date)) byDate.set(e.date, e.count);
  for (const d of rebuilt) {
    const n = counts.get(d) ?? 0;
    if (n > 0) byDate.set(d, n);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([date, count]) => ({ date, count }));
}

export function buildIndex(days: readonly DayEntry[], generatedAt: string): DaysIndex {
  return { schema: DAYS_SCHEMA, generatedAt, days: [...days] };
}
