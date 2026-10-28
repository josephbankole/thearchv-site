// scores-poll's season backfill: fills in the match history (days/<date>.json, days/index.json and
// match/<id>.json) for every day from a chosen date up to yesterday, from three schedule requests
// and one details request per 20 finished matches. It is a one-off the founder triggers with a
// POST body of {"mode":"backfill","from":"YYYY-MM-DD"}; index.ts routes it here.
//
// It never touches the state row, so the live poll's memory is exactly what it was. What it has
// already stored is read back from Storage itself: a file whose content (generatedAt aside) matches
// what would be written is left alone, so running it again costs the API requests and the reads
// and writes nothing. It works through the season in kickoff order, writes a day's file as soon as
// all of that day's finished matches have theirs, and stops starting new work once its time budget
// is spent. `next` in the answer is the first day not yet written; calling again with that date as
// `from` carries on without repeating the days before it.
import type { ApiGet, ApiResult } from "./api.ts";
import {
  buildDayFile,
  buildIndex,
  type DayEntry,
  dayOf,
  dayPath,
  groupByDay,
  INDEX_PATH,
  isDay,
  mergeIndex,
  parseIndex,
} from "./days.ts";
import { COMPETITIONS, detailPath, mapMatch, mapMatchFile, type Match, sortMatches } from "./map.ts";
import { addDays, contentHash, MAX_DETAIL_IDS } from "./plan.ts";
import { edmontonDay } from "../_shared/push_guard.ts";

// Stop starting new work after this long. An edge function is cut off at 150 s of wall time; the
// slowest thing already in flight when the budget runs out is a details call (15 s timeout) and
// the uploads behind it.
export const BUDGET_MS = 100_000;
// Details calls in flight at once, and storage reads/writes in flight at once.
const PARALLEL_CALLS = 3;
const PARALLEL_FILES = 12;

export type BackfillDeps = {
  now: Date;
  season: number;
  api: ApiGet;
  read: (path: string) => Promise<string | null>;
  write: (path: string, text: string) => Promise<void>;
  clock?: () => number; // ms; tests pass their own
  budgetMs?: number;
  publishPlayers?: boolean; // per-player lines in the match files (PUBLISH_PLAYERS, index.ts)
};

export type BackfillSummary = {
  ok: boolean;
  done: boolean;
  from: string;
  to: string; // yesterday, Edmonton
  next: string | null; // the `from` for the next call; null when done
  requests: number; // API-Football requests this call made
  remaining: number | null; // the API's own daily count left, from its last reply
  days: number; // days with matches in from..to
  daysWritten: number; // day files that were new or changed
  daysUnchanged: number; // day files already in place
  matches: number; // matches in from..to
  matchFilesWritten: number;
  matchFilesUnchanged: number;
  noDetails: number; // finished matches the API had no details for: no file, no pointer
  error?: string;
};

type Outcome = "written" | "unchanged";

// Runs `tasks` with at most `limit` in flight.
async function pool(tasks: readonly (() => Promise<void>)[], limit: number): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) await tasks[next++]();
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
}

export async function runBackfill(from: string, deps: BackfillDeps): Promise<BackfillSummary> {
  const clock = deps.clock ?? Date.now;
  const started = clock();
  const budget = deps.budgetMs ?? BUDGET_MS;
  const to = addDays(edmontonDay(deps.now), -1);
  const stamp = deps.now.toISOString();
  const errors: string[] = [];
  let requests = 0;
  let remaining: number | null = null;
  const counts = { daysWritten: 0, daysUnchanged: 0, matchFilesWritten: 0, matchFilesUnchanged: 0, noDetails: 0 };

  const call = async (path: string): Promise<ApiResult> => {
    requests++;
    const r = await deps.api(path);
    if (r.remaining !== null) remaining = r.remaining;
    return r;
  };
  const summary = (
    over: { done: boolean; next: string | null; days: number; matches: number },
  ): BackfillSummary => ({
    ok: errors.length === 0,
    done: over.done,
    from,
    to,
    next: over.next,
    requests,
    remaining,
    days: over.days,
    daysWritten: counts.daysWritten,
    daysUnchanged: counts.daysUnchanged,
    matches: over.matches,
    matchFilesWritten: counts.matchFilesWritten,
    matchFilesUnchanged: counts.matchFilesUnchanged,
    noDetails: counts.noDetails,
    ...(errors.length ? { error: errors.join("; ").slice(0, 300) } : {}),
  });
  const stop = (reason: string) => {
    errors.push(reason);
    return summary({ done: false, next: isDay(from) ? from : null, days: 0, matches: 0 });
  };

  if (!isDay(from)) return stop("from must be a date written YYYY-MM-DD");
  if (from > to) return summary({ done: true, next: null, days: 0, matches: 0 });

  // Writes a document unless an identical one is already stored. "Identical" is the same text apart
  // from generatedAt: files this function writes are always serialised the same way, so a plain
  // string comparison is enough, and it is much cheaper than parsing every file back, which matters
  // to an edge function's CPU allowance. A stored file that differs in any other way is rewritten.
  const sansStamp = (t: string) => t.replace(/"generatedAt":"[^"]*"/, "");
  const putIfChanged = async (path: string, body: { generatedAt: string } & Record<string, unknown>): Promise<Outcome> => {
    const text = JSON.stringify(body);
    let stored: string | null = null;
    try {
      stored = await deps.read(path);
    } catch {
      // Cannot tell what is there: write it.
    }
    if (stored !== null && sansStamp(stored) === sansStamp(text)) return "unchanged";
    await deps.write(path, text);
    return "written";
  };

  // The index first. One that is there and unreadable stops the run before it writes anything,
  // because replacing it would drop whatever days it held.
  let entries: DayEntry[];
  try {
    const parsed = parseIndex(await deps.read(INDEX_PATH));
    if (!parsed) return stop(`${INDEX_PATH} is not readable, left alone; delete it to rebuild`);
    entries = parsed;
  } catch {
    return stop(`read ${INDEX_PATH} failed`);
  }
  let indexHash = await contentHash({ days: entries });

  // 1. The whole season, a request a competition. A day file with one league's matches missing
  //    would be wrong, so any failure here stops the run with nothing written.
  const lists = await Promise.all(
    COMPETITIONS.map((c) => call(`/fixtures?league=${c.leagueId}&season=${deps.season}`)),
  );
  const failed = lists.flatMap((r, i) => (r.ok ? [] : [`${COMPETITIONS[i].key}: ${r.reason}`]));
  if (failed.length) return stop(failed.join("; "));

  const known = new Map<number, Match>();
  lists.forEach((r, i) => {
    if (!r.ok) return;
    for (const fx of r.fixtures) {
      const m = mapMatch(fx);
      if (!m || m.competition.key !== COMPETITIONS[i].key) continue;
      const day = dayOf(m.kickoff);
      if (day >= from && day <= to) known.set(m.id, m);
    }
  });
  const byDay = groupByDay([...known.values()]);
  const dates = [...byDay.keys()].sort();
  const base = { days: dates.length, matches: known.size };

  // 2. Which matches need details: the finished ones, in kickoff order, 20 to a call.
  const finished = sortMatches([...known.values()]).filter((m) => m.status.finished).map((m) => m.id);
  const batches: number[][] = [];
  for (let i = 0; i < finished.length; i += MAX_DETAIL_IDS) batches.push(finished.slice(i, i + MAX_DETAIL_IDS));

  const stored = new Set<number>(); // match files in place (written now or already identical)
  const settled = new Set<number>(); // finished matches whose details are decided: stored, or the API had none
  const written = new Set<string>(); // days whose file is in place
  const dayFailed = new Set<string>();

  // A day's file goes up once every finished match in it is settled. A match points at its file
  // only if the file is in place; a match that has not finished never does.
  const settleDays = async () => {
    const ready = dates.filter((d) =>
      !written.has(d) && !dayFailed.has(d) && byDay.get(d)!.every((m) => !m.status.finished || settled.has(m.id))
    );
    if (!ready.length) return;
    const rebuilt: string[] = [];
    await pool(ready.map((d) => async () => {
      const list = byDay.get(d)!.map((m) => stored.has(m.id) ? { ...m, detail: detailPath(m.id) } : m);
      try {
        const out = await putIfChanged(dayPath(d), buildDayFile(d, list, stamp));
        if (out === "written") counts.daysWritten++;
        else counts.daysUnchanged++;
        written.add(d);
        rebuilt.push(d);
      } catch {
        dayFailed.add(d);
        errors.push(`write ${dayPath(d)} failed`);
      }
    }), PARALLEL_FILES);
    if (!rebuilt.length) return;
    // The index follows the files: only days whose file is in place are ever listed.
    entries = mergeIndex(entries, rebuilt, new Map(rebuilt.map((d) => [d, byDay.get(d)!.length])));
    const hash = await contentHash({ days: entries });
    if (hash === indexHash) return;
    try {
      await deps.write(INDEX_PATH, JSON.stringify(buildIndex(entries, stamp)));
      indexHash = hash;
    } catch {
      errors.push(`write ${INDEX_PATH} failed`);
    }
  };

  await settleDays(); // days with nothing to fetch, such as one with only postponed fixtures

  // 3. The details, a few calls at a time, each call's files written before the next group starts.
  for (let i = 0; i < batches.length; i += PARALLEL_CALLS) {
    if (clock() - started >= budget) break;
    const group = batches.slice(i, i + PARALLEL_CALLS);
    const replies = await Promise.all(group.map((ids) => call(`/fixtures?ids=${ids.join("-")}`)));
    const jobs: (() => Promise<void>)[] = [];
    replies.forEach((r, k) => {
      if (!r.ok) {
        errors.push(`details: ${r.reason}`);
        return;
      }
      const returned = new Set<number>();
      for (const fx of r.fixtures) {
        const m = mapMatch(fx);
        const own = m ? known.get(m.id) : undefined;
        if (!m || !own || !group[k].includes(m.id) || returned.has(m.id)) continue;
        returned.add(m.id);
        jobs.push(async () => {
          try {
            const body = mapMatchFile(fx, { ...own, detail: detailPath(own.id) }, stamp, deps.publishPlayers ?? false);
            const out = await putIfChanged(detailPath(own.id), body);
            if (out === "written") counts.matchFilesWritten++;
            else counts.matchFilesUnchanged++;
            stored.add(own.id);
            settled.add(own.id);
          } catch {
            errors.push(`write ${detailPath(own.id)} failed`);
          }
        });
      }
      // A good answer that leaves a match out has no details for it, and holding its whole day
      // back for that would stop the backfill ever finishing.
      for (const id of group[k]) {
        if (!returned.has(id)) {
          settled.add(id);
          counts.noDetails++;
        }
      }
    });
    await pool(jobs, PARALLEL_FILES);
    await settleDays();
  }

  // A spent time budget is not an error: the answer says done: false and where to carry on from.
  const open = dates.filter((d) => !written.has(d));
  return summary({ ...base, done: open.length === 0, next: open.length ? open[0] : null });
}
