// One scores-poll run, with its I/O handed in: the API client, the storage writer and the clock are
// parameters, so poll_test.ts can run whole minutes against recorded API replies and count the
// requests and writes. index.ts supplies the real ones and persists the state between runs.
import type { ApiGet, ApiResult } from "./api.ts";
import {
  buildDayFile,
  buildIndex,
  dayPath,
  groupByDay,
  INDEX_PATH,
  mergeIndex,
  parseIndex,
} from "./days.ts";
import {
  COMPETITIONS,
  detailPath,
  hasKickedOff,
  isNotStarted,
  mapMatch,
  mapMatchFile,
  type Match,
  normaliseMatch,
  SCORES_SCHEMA,
  SOURCE,
  sortMatches,
} from "./map.ts";
import {
  addDays,
  BACKOFF_MS,
  contentHash,
  detailTargets,
  inWindow,
  MAX_DETAIL_IDS,
  type OutFile,
  planWrites,
  SCHEDULE_EVERY_MS,
  scheduleDue,
  START_LEAD_MS,
  trackFinished,
  windowFor,
} from "./plan.ts";

export const SCORES_PATH = "scores.json";

// A recheck of held matches drops these: the match is not being played in the window.
const GONE_CODES: ReadonlySet<string> = new Set(["PST", "CANC", "ABD"]);

// What one run leaves for the next. Persisted in public.scores_poll_state.
export type PollState = {
  scheduleFetchedAt: string | null; // when the schedule was last fetched
  windowDay: string | null; // the Edmonton day that fetch was cut on
  matches: Match[]; // the last good match list, detail pointers left null
  finishedAt: Record<string, string>; // fixture id -> when it was first seen finished
  fileHashes: Record<string, string>; // storage path -> content hash last written
  backoffUntil: string | null; // no API calls before this
};

export const EMPTY_STATE: PollState = {
  scheduleFetchedAt: null,
  windowDay: null,
  matches: [],
  finishedAt: {},
  fileHashes: {},
  backoffUntil: null,
};

export type Deps = {
  now: Date;
  season: number;
  api: ApiGet;
  write: (path: string, text: string) => Promise<void>;
  // Supplying `archive` turns the day archive on: the run also keeps days/<date>.json for the days
  // in the window and merges them into days/index.json. `read` returns a stored file's text, null
  // when there is no such file, and throws when it cannot tell. Left out, the run writes exactly
  // what it wrote before the archive existed.
  archive?: { read: (path: string) => Promise<string | null> };
  // Whether match files carry per-player lines (map.ts `players`). index.ts reads PUBLISH_PLAYERS.
  publishPlayers?: boolean;
};

export type Summary = {
  ok: boolean;
  scheduleRefreshed: boolean;
  liveCount: number;
  detailCalls: number;
  filesWritten: number;
  dayFilesWritten?: number; // day files and the index written this run; there only when the archive is on
  remaining: number | null; // the API's own daily count left, from its last reply this run
  error?: string;
};

export async function runPoll(
  state: PollState,
  deps: Deps,
): Promise<{ summary: Summary; state: PollState; writeFailed: boolean; writesAttempted: boolean }> {
  const { now } = deps;
  const win = windowFor(now);
  const errors: string[] = [];
  let detailFailed = false; // only a failed details call backs the whole poll off
  let remaining: number | null = null;
  let detailCalls = 0;
  let filesWritten = 0;
  let dayFilesWritten = 0;
  let writeFailed = false; // a storage upload failed: the caller answers 500
  let writesAttempted = false; // the run reached the file stage (a backed-off run does not)
  const saw = (r: ApiResult) => {
    if (r.remaining !== null) remaining = r.remaining;
  };
  const done = (next: PollState, scheduleRefreshed: boolean) => ({
    summary: {
      ok: errors.length === 0,
      scheduleRefreshed,
      liveCount: next.matches.filter((m) => m.status.live).length,
      detailCalls,
      filesWritten,
      ...(deps.archive ? { dayFilesWritten } : {}),
      remaining,
      ...(errors.length ? { error: errors.join("; ").slice(0, 300) } : {}),
    },
    state: next,
    writeFailed,
    writesAttempted,
  });

  if (state.backoffUntil && Date.parse(state.backoffUntil) > now.getTime()) {
    errors.push("backing off after an API error");
    return done(state, false);
  }
  const backoff = new Date(now.getTime() + BACKOFF_MS).toISOString();

  let matches = state.matches.filter((m) => inWindow(m.kickoff, win));
  let scheduleFetchedAt = state.scheduleFetchedAt;
  let windowDay = state.windowDay;
  let scheduleRefreshed = false;
  // How many competitions this minute's schedule refresh got good answers for (hoisted: the archive
  // writes tomorrow's file only after a complete refresh).
  let good = 0;

  // 1. The schedule: one request a competition, for the three-day window.
  if (scheduleDue(state, now)) {
    const results = await Promise.all(COMPETITIONS.map((c) =>
      deps.api(`/fixtures?league=${c.leagueId}&season=${deps.season}&from=${win.from}&to=${win.to}`)
    ));
    results.forEach(saw);
    // A competition that failed keeps the matches we already had for it. So does one that answered
    // with nothing while we hold matches for it: a real competition does not empty out of a
    // three-day window, and believing it would drop the night's matches from scores.json (and stop
    // their details calls) until the next refresh. The exception is a competition whose held
    // matches have none of them started: those can really have left, moved to another week or
    // postponed. For those, one /fixtures?ids= call asks after the held matches themselves, and
    // when it answers for every one, the ones still in the window and still to be played are kept
    // and the competition counts as answered. Anything short of that is the old empty-reply error.
    const outcomes: { key: string; fresh: Match[] | null; held: Match[]; empty?: boolean }[] = COMPETITIONS.map(
      (c, i) => {
        const r = results[i];
        const held = matches.filter((m) => m.competition.key === c.key);
        if (!r.ok) {
          errors.push(`${c.key}: ${r.reason}`);
          return { key: c.key, fresh: null, held };
        }
        const fresh = r.fixtures.map(mapMatch).filter((m): m is Match =>
          m !== null && m.competition.key === c.key && inWindow(m.kickoff, win)
        );
        if (fresh.length === 0 && held.length > 0) return { key: c.key, fresh: null, held, empty: true };
        return { key: c.key, fresh, held };
      },
    );
    const recheck = outcomes.filter((o) => o.empty && o.held.every((m) => isNotStarted(m.status.code)));
    const recheckIds = recheck.flatMap((o) => o.held.map((m) => m.id));
    if (recheckIds.length > 0 && recheckIds.length <= MAX_DETAIL_IDS) {
      const r = await deps.api(`/fixtures?ids=${recheckIds.join("-")}`);
      saw(r);
      if (r.ok) {
        const answered = new Map<number, Match>();
        for (const fx of r.fixtures) {
          const m = mapMatch(fx);
          if (m) answered.set(m.id, m);
        }
        for (const o of recheck) {
          if (!o.held.every((m) => answered.has(m.id))) continue;
          o.fresh = o.held.map((m) => answered.get(m.id)!).filter((m) =>
            m.competition.key === o.key && inWindow(m.kickoff, win) && !GONE_CODES.has(m.status.code)
          );
          o.empty = false;
        }
      }
    }
    for (const o of outcomes) if (o.empty) errors.push(`${o.key}: empty schedule reply`);
    good = outcomes.filter((o) => o.fresh !== null).length;
    if (good === 0) {
      // Nothing came back we can use: keep the last good state and files, and leave the API alone
      // for a couple of minutes.
      return done({ ...state, backoffUntil: backoff }, false);
    }
    const merged = new Map<number, Match>();
    for (const o of outcomes) for (const m of o.fresh ?? o.held) merged.set(m.id, m);
    matches = sortMatches([...merged.values()]);
    scheduleRefreshed = true;
    // A partial refresh comes due again in five minutes instead of thirty.
    scheduleFetchedAt = new Date(now.getTime() - (good === COMPETITIONS.length ? 0 : SCHEDULE_EVERY_MS - 5 * 60_000))
      .toISOString();
    windowDay = win.today;
  }
  let finishedAt = trackFinished(state.matches, matches, state.finishedAt, now);

  // 2. The details: at most one request, for whoever needs it this minute.
  const hashes = { ...state.fileHashes };
  const targets = detailTargets(matches, {
    now,
    finishedAt,
    hasFile: (id) => detailPath(id) in hashes,
  });
  const fetched: { match: Match; fx: unknown }[] = [];
  if (targets.ids.length) {
    detailCalls = 1;
    const r = await deps.api(`/fixtures?ids=${targets.ids.join("-")}`);
    saw(r);
    if (r.ok) {
      const asked = new Set(targets.ids);
      const byId = new Map(matches.map((m) => [m.id, m]));
      for (const fx of r.fixtures) {
        const m = mapMatch(fx);
        if (!m || !asked.has(m.id) || !byId.has(m.id)) continue;
        byId.set(m.id, m);
        fetched.push({ match: m, fx });
      }
      const before = matches;
      matches = sortMatches([...byId.values()]);
      finishedAt = trackFinished(before, matches, finishedAt, now);
    } else {
      errors.push(`details: ${r.reason}`);
      detailFailed = true;
    }
  }

  // 3. The files. A match's own file goes up first, and scores.json points only at files that are
  //    there (a file whose upload failed is not); a file whose content is unchanged is not
  //    written again.
  writesAttempted = true;
  const stamp = now.toISOString();
  const willHave = new Set(fetched.map((f) => detailPath(f.match.id)));
  // A match points at its file once it has kicked off, or when it kicks off within the details
  // lead (the confirmed lineups are fetched then), and only when the file is there.
  const pointed = (m: Match, fileExists: (path: string) => boolean): Match => {
    const path = detailPath(m.id);
    const soon = isNotStarted(m.status.code) && Date.parse(m.kickoff) - now.getTime() <= START_LEAD_MS;
    return (hasKickedOff(m.status.code) || soon) && fileExists(path) ? { ...m, detail: path } : m;
  };
  // Writes the files whose content changed and answers how many went up.
  const upload = async (files: OutFile[]): Promise<number> => {
    const planned = await planWrites(files, hashes);
    const outcomes = await Promise.allSettled(planned.map((p) => deps.write(p.path, p.text)));
    let written = 0;
    outcomes.forEach((o, i) => {
      if (o.status === "fulfilled") {
        hashes[planned[i].path] = planned[i].hash;
        written++;
      } else {
        errors.push(`write ${planned[i].path} failed`);
        writeFailed = true;
      }
    });
    return written;
  };

  filesWritten += await upload(fetched.map(({ match, fx }) => ({
    path: detailPath(match.id),
    body: mapMatchFile(fx, pointed(match, (p) => p in hashes || willHave.has(p)), stamp, deps.publishPlayers ?? false),
  })));

  // The day archive: the window's days, and the index entries for them. After the match files, so
  // a day file points only at files that are there, and before scores.json, so a failure here
  // cannot hold the live file back.
  const archiveKeep: string[] = [];
  if (deps.archive) {
    const days = [addDays(win.today, -1), win.today, addDays(win.today, 1)];
    const byDay = groupByDay(matches.map((m) => pointed(m, (p) => p in hashes)));
    // A day with no matches gets a file only if it had one: a day emptied by a reschedule must not
    // keep showing its old matches. Tomorrow may have a file this run does not know about (season
    // mode writes days ahead), so it also gets one, empty if need be, after a COMPLETE schedule
    // refresh. After a partial one, the failed competition's matches come from the old window and
    // can lack tomorrow's, and writing then would wipe season mode's correct file.
    const tomorrow = addDays(win.today, 1);
    const files: OutFile[] = days
      .filter((d) =>
        byDay.has(d) || dayPath(d) in hashes ||
        (d === tomorrow && scheduleRefreshed && good === COMPETITIONS.length)
      )
      .map((d) => ({ path: dayPath(d), body: buildDayFile(d, byDay.get(d) ?? [], stamp) }));
    dayFilesWritten += await upload(files);
    archiveKeep.push(...days.map(dayPath), INDEX_PATH);

    // History is the days up to today; tomorrow's schedule is not history yet.
    const past = days.filter((d) => d <= win.today);
    const counts = new Map(past.map((d) => [d, byDay.get(d)?.length ?? 0]));
    const asked = { past, counts: past.map((d) => counts.get(d)) };
    const sig = await contentHash(asked);
    // The index is read and rewritten only when what these days say about themselves has changed,
    // so a quiet minute, and a live minute in which no match is added or removed, never touch it.
    if (hashes[INDEX_PATH] !== sig) {
      try {
        const existing = parseIndex(await deps.archive.read(INDEX_PATH));
        if (!existing) {
          errors.push(`${INDEX_PATH} is not readable, left alone`);
        } else {
          const merged = mergeIndex(existing, past, counts);
          if (await contentHash({ days: merged }) === await contentHash({ days: existing })) {
            hashes[INDEX_PATH] = sig;
          } else {
            try {
              await deps.write(INDEX_PATH, JSON.stringify(buildIndex(merged, stamp)));
              hashes[INDEX_PATH] = sig;
              dayFilesWritten++;
            } catch {
              errors.push(`write ${INDEX_PATH} failed`);
              writeFailed = true;
            }
          }
        }
      } catch {
        errors.push(`read ${INDEX_PATH} failed`);
      }
    }
  }

  filesWritten += await upload([{
    path: SCORES_PATH,
    body: { schema: SCORES_SCHEMA, generatedAt: stamp, source: SOURCE, matches: matches.map((m) => pointed(m, (p) => p in hashes)) },
  }]);

  // Hashes for matches that have left the window go with them.
  const keep = new Set([SCORES_PATH, ...matches.map((m) => detailPath(m.id)), ...archiveKeep]);
  for (const path of Object.keys(hashes)) if (!keep.has(path)) delete hashes[path];

  return done({
    scheduleFetchedAt,
    windowDay,
    matches,
    finishedAt,
    fileHashes: hashes,
    backoffUntil: detailFailed ? backoff : null,
  }, scheduleRefreshed);
}

// When the current run of failed uploads began, for scores_poll_state.write_failed_since. A failed
// upload keeps its old hash, so the file is tried again every minute until it lands; the first
// failure starts the clock and a run that reaches the files with no failure stops it. A run that
// never reached the files (backing off) leaves it as it was. health-probe alerts when the clock has
// run past WRITE_FAILED_ALERT_MS in its checks.ts: schedule_fetched_at keeps moving through a
// storage outage, so it cannot show a frozen scores.json.
export function nextWriteFailedSince(
  prev: string | null,
  run: { writeFailed: boolean; writesAttempted: boolean },
  now: Date,
): string | null {
  if (run.writeFailed) return prev ?? now.toISOString();
  return run.writesAttempted ? null : prev;
}

// ---------- the state row ----------

// public.scores_poll_state's single row <-> PollState. Read defensively: a column of the wrong
// shape reads as empty, which costs one schedule refresh and a few rewrites, never a crash. The
// matches are rebuilt in the mapper's key order (jsonb returns them in its own).
export function stateFromRow(row: Record<string, unknown> | null | undefined): PollState {
  if (!row) return EMPTY_STATE;
  const text = (v: unknown) => typeof v === "string" && v ? v : null;
  const map = (v: unknown): Record<string, string> => {
    const out: Record<string, string> = {};
    if (v && typeof v === "object" && !Array.isArray(v)) {
      for (const [k, x] of Object.entries(v)) if (typeof x === "string") out[k] = x;
    }
    return out;
  };
  return {
    scheduleFetchedAt: text(row.schedule_fetched_at),
    windowDay: text(row.window_day),
    matches: Array.isArray(row.matches)
      ? row.matches.map(normaliseMatch).filter((m): m is Match => m !== null)
      : [],
    finishedAt: map(row.finished_at),
    fileHashes: map(row.file_hashes),
    backoffUntil: text(row.backoff_until),
  };
}

export function rowFromState(s: PollState, now: Date): Record<string, unknown> {
  return {
    id: 1,
    schedule_fetched_at: s.scheduleFetchedAt,
    window_day: s.windowDay,
    matches: s.matches,
    finished_at: s.finishedAt,
    file_hashes: s.fileHashes,
    backoff_until: s.backoffUntil,
    updated_at: now.toISOString(),
  };
}

// How the state row is saved. pg_cron starts a run every minute whether or not the last one has
// finished, so two runs can overlap, and the slower one must not put back the older state over the
// newer one. The save is conditional on the row still carrying the updated_at this run read: if
// another run has saved since, this run's save is skipped ("stale") and the newer state stands.
// The cost of a skipped save is at most a rewrite or a schedule refresh next minute. With no row
// read (the very first run) there is nothing to compare, so the row is created as before.
export type StateStore = {
  create: (row: Record<string, unknown>) => Promise<{ error: string | null }>;
  updateIf: (row: Record<string, unknown>, readUpdatedAt: string) => Promise<{ error: string | null; matched: number }>;
};

export async function saveStateRow(
  store: StateStore,
  row: Record<string, unknown>,
  readUpdatedAt: string | null,
): Promise<"saved" | "stale" | { error: string }> {
  if (readUpdatedAt === null) {
    const { error } = await store.create(row);
    return error ? { error } : "saved";
  }
  const { error, matched } = await store.updateIf(row, readUpdatedAt);
  if (error) return { error };
  return matched > 0 ? "saved" : "stale";
}
