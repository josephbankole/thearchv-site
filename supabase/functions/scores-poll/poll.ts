// One scores-poll run, with its I/O handed in: the API client, the storage writer and the clock are
// parameters, so poll_test.ts can run whole minutes against recorded API replies and count the
// requests and writes. index.ts supplies the real ones and persists the state between runs.
import type { ApiGet, ApiResult } from "./api.ts";
import {
  COMPETITIONS,
  detailPath,
  hasKickedOff,
  mapMatch,
  mapMatchFile,
  type Match,
  normaliseMatch,
  SCORES_SCHEMA,
  SOURCE,
  sortMatches,
} from "./map.ts";
import {
  BACKOFF_MS,
  detailTargets,
  inWindow,
  type OutFile,
  planWrites,
  SCHEDULE_EVERY_MS,
  scheduleDue,
  trackFinished,
  windowFor,
} from "./plan.ts";

export const SCORES_PATH = "scores.json";

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
};

export type Summary = {
  ok: boolean;
  scheduleRefreshed: boolean;
  liveCount: number;
  detailCalls: number;
  filesWritten: number;
  remaining: number | null; // the API's own daily count left, from its last reply this run
  error?: string;
};

export async function runPoll(
  state: PollState,
  deps: Deps,
): Promise<{ summary: Summary; state: PollState; writeFailed: boolean }> {
  const { now } = deps;
  const win = windowFor(now);
  const errors: string[] = [];
  let detailFailed = false; // only a failed details call backs the whole poll off
  let remaining: number | null = null;
  let detailCalls = 0;
  let filesWritten = 0;
  let writeFailed = false; // a storage upload failed: the caller answers 500
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
      remaining,
      ...(errors.length ? { error: errors.join("; ").slice(0, 300) } : {}),
    },
    state: next,
    writeFailed,
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

  // 1. The schedule: one request a competition, for the three-day window.
  if (scheduleDue(state, now)) {
    const results = await Promise.all(COMPETITIONS.map((c) =>
      deps.api(`/fixtures?league=${c.leagueId}&season=${deps.season}&from=${win.from}&to=${win.to}`)
    ));
    results.forEach(saw);
    // A competition that failed keeps the matches we already had for it. So does one that answered
    // with nothing while we hold matches for it: a real competition does not empty out of a
    // three-day window, and believing it would drop the night's matches from scores.json (and stop
    // their details calls) until the next refresh.
    const outcomes = COMPETITIONS.map((c, i) => {
      const r = results[i];
      const held = matches.filter((m) => m.competition.key === c.key);
      if (!r.ok) {
        errors.push(`${c.key}: ${r.reason}`);
        return { fresh: null, held };
      }
      const fresh = r.fixtures.map(mapMatch).filter((m): m is Match =>
        m !== null && m.competition.key === c.key && inWindow(m.kickoff, win)
      );
      if (fresh.length === 0 && held.length > 0) {
        errors.push(`${c.key}: empty schedule reply`);
        return { fresh: null, held };
      }
      return { fresh, held };
    });
    const good = outcomes.filter((o) => o.fresh !== null).length;
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
  const stamp = now.toISOString();
  const willHave = new Set(fetched.map((f) => detailPath(f.match.id)));
  const pointed = (m: Match, fileExists: (path: string) => boolean): Match => {
    const path = detailPath(m.id);
    return hasKickedOff(m.status.code) && fileExists(path) ? { ...m, detail: path } : m;
  };
  const upload = async (files: OutFile[]) => {
    const planned = await planWrites(files, hashes);
    const outcomes = await Promise.allSettled(planned.map((p) => deps.write(p.path, p.text)));
    outcomes.forEach((o, i) => {
      if (o.status === "fulfilled") {
        hashes[planned[i].path] = planned[i].hash;
        filesWritten++;
      } else {
        errors.push(`write ${planned[i].path} failed`);
        writeFailed = true;
      }
    });
  };

  await upload(fetched.map(({ match, fx }) => ({
    path: detailPath(match.id),
    body: mapMatchFile(fx, pointed(match, (p) => p in hashes || willHave.has(p)), stamp),
  })));
  await upload([{
    path: SCORES_PATH,
    body: { schema: SCORES_SCHEMA, generatedAt: stamp, source: SOURCE, matches: matches.map((m) => pointed(m, (p) => p in hashes)) },
  }]);

  // Hashes for matches that have left the window go with them.
  const keep = new Set([SCORES_PATH, ...matches.map((m) => detailPath(m.id))]);
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
