// One season-mode call (see season.ts for what the mode is), with its I/O handed in: the API
// client, the storage reader, writer and lister, the state row's loader and saver, and the clock
// are parameters, so season_run_test.ts can run whole calls against recorded replies and count the
// requests and writes. index.ts supplies the real ones.
//
// The order of the guards is the point of this file. The state row is read before anything else,
// and a call that cannot read it makes no request at all. A backoff, a quota reserve recorded today
// or a state write that failed earlier stops every API request but not the builds, which cost none.
// Every reply refreshes the quota count, and the head-to-head loop stops the moment a reply shows
// fewer than 1,500 left, so a stale stored value can never carry a call past the reserve.
import type { ApiGet, ApiResult } from "./api.ts";
import { COMPETITIONS, detailPath, type Match, mapMatch, sortMatches } from "./map.ts";
import { canonicalJson, type OutFile, planWrites } from "./plan.ts";
import {
  buildH2h,
  buildPreview,
  type H2h,
  H2H_WINDOW_MS,
  lastLineupOf,
  type LastLineup,
  lineupCandidates,
  lineupFromMatchFile,
  previewPath,
  shouldFetchH2h,
  storedH2h,
} from "./preview.ts";
import {
  apiGuards,
  buildAhead,
  buildTeams,
  chooseStep,
  H2H_PARALLEL,
  heldMatches,
  MAX_H2H_REQUESTS,
  previewPathsFor,
  previewTargets,
  pruneHashes,
  QUOTA_RESERVE,
  rollover,
  rowFromSeasonState,
  SEASON_BACKOFF_MS,
  type SeasonState,
  seasonStateFromRow,
  type Step,
  teamPathsFor,
} from "./season.ts";

// Stop starting new work after this long, as the backfill does.
export const SEASON_BUDGET_MS = 100_000;
const PARALLEL_FILES = 12;

export type SeasonDeps = {
  now: Date;
  season: number;
  api: ApiGet;
  read: (path: string) => Promise<string | null>; // null: no such file; throws: could not tell
  write: (path: string, text: string) => Promise<void>;
  listMatchFiles: () => Promise<Set<number>>; // the ids with a match/<id>.json; throws on failure
  loadState: () => Promise<Record<string, unknown> | null>; // throws when the row cannot be read
  saveState: (row: Record<string, unknown>) => Promise<void>;
  step?: Step | null; // a hand call's forced step
  clock?: () => number;
  budgetMs?: number;
};

export type SeasonSummary = {
  ok: boolean;
  step: Step | null;
  skipped?: string; // why a listing slot did not list
  requests: number;
  remaining: number | null;
  filesWritten: number;
  writeFailed: boolean;
  h2hRequests?: number;
  previews?: number;
  autoClubs?: string[];
  error?: string;
};

async function pool(tasks: readonly (() => Promise<void>)[], limit: number): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) await tasks[next++]();
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
}

export async function runSeasonStep(deps: SeasonDeps): Promise<SeasonSummary> {
  const { now } = deps;
  const clock = deps.clock ?? Date.now;
  const started = clock();
  const budget = deps.budgetMs ?? SEASON_BUDGET_MS;
  const stamp = now.toISOString();
  const errors: string[] = [];
  let requests = 0;
  let remaining: number | null = null;
  let filesWritten = 0;
  let writeFailed = false;
  const extra: Partial<SeasonSummary> = {};

  // 1. The state, before anything else. Unreadable: no request, no write.
  let before: SeasonState;
  try {
    before = seasonStateFromRow(await deps.loadState());
  } catch (e) {
    return {
      ok: false,
      step: null,
      requests: 0,
      remaining: null,
      filesWritten: 0,
      writeFailed: false,
      error: `state unreadable: ${String((e as Error)?.message ?? e).slice(0, 120)}`,
    };
  }
  // A copy: the steps below change it, and it is compared with `before` at the end.
  const state: SeasonState = { ...rollover(before, deps.season) };
  const guards = apiGuards(state, now);
  const choice = chooseStep(state, now, deps.step ?? null);
  const hashes = { ...state.fileHashes };

  const call = async (path: string): Promise<ApiResult> => {
    requests++;
    const r = await deps.api(path);
    if (r.remaining !== null) {
      remaining = r.remaining;
      state.remaining = r.remaining;
      state.remainingAt = stamp;
    }
    return r;
  };
  const backOff = () => {
    state.backoffUntil = new Date(now.getTime() + SEASON_BACKOFF_MS).toISOString();
  };
  // Writes the files whose content changed (hash-gated against what this mode last wrote) and
  // answers whether every upload went up.
  const upload = async (files: readonly OutFile[]): Promise<boolean> => {
    const planned = await planWrites(files, hashes);
    let ok = true;
    await pool(planned.map((p) => async () => {
      try {
        await deps.write(p.path, p.text);
        hashes[p.path] = p.hash;
        filesWritten++;
      } catch {
        errors.push(`write ${p.path} failed`);
        writeFailed = true;
        ok = false;
      }
    }), PARALLEL_FILES);
    return ok;
  };

  const step = choice.step;
  const held = heldMatches(state);
  // Before any listing has landed, an empty held set says nothing about the season: a build would
  // publish an ahead.json with no days and a teams index with no teams over whatever is there.
  const nothingListed = held.length === 0 && Object.keys(state.listedAt).length === 0;

  if (step && !step.startsWith("list:") && nothingListed) {
    extra.skipped = "nothing listed yet";
  } else if (step?.startsWith("list:")) {
    // 2a. A listing: one request for the competition's whole season.
    const key = step.slice(5);
    const comp = COMPETITIONS.find((c) => c.key === key)!;
    const r = await call(`/fixtures?league=${comp.leagueId}&season=${deps.season}`);
    if (!r.ok) {
      errors.push(`${comp.key}: ${r.reason}`);
      backOff();
    } else {
      const fresh = r.fixtures.map(mapMatch).filter((m): m is Match => m !== null && m.competition.key === comp.key);
      const holding = state.matches[comp.key] ?? [];
      // A real competition does not empty out mid-season. Same rule as the poll: an empty reply
      // while we hold this season's matches is refused, and what we hold stays.
      if (fresh.length === 0 && holding.length > 0) {
        errors.push(`${comp.key}: empty season listing refused`);
      } else {
        state.matches = { ...state.matches, [comp.key]: sortMatches(fresh) };
        state.listedAt = { ...state.listedAt, [comp.key]: stamp };
      }
    }
  } else if (step === "build:days") {
    // 2b. The future day files and days/ahead.json. 0 requests.
    const out = buildAhead(held, now, hashes, stamp);
    if (await upload(out.files)) state.builtAt = { ...state.builtAt, days: stamp };
  } else if (step === "build:teams") {
    // 2c. The team files and teams/index.json. 0 requests, one paginated storage listing for the
    //     detail pointers. A failed listing writes nothing (rebuilt without it, every file would
    //     lose its pointers) and stamps teamsFailed, so the step retries on the build cadence and
    //     build:previews behind it still runs.
    let files: Set<number> | null = null;
    try {
      files = await deps.listMatchFiles();
    } catch {
      errors.push("listing match/ failed, team files left as they were");
    }
    if (files) {
      const out = buildTeams(held, files, deps.season, stamp);
      if (out.autoKeys.length) {
        extra.autoClubs = out.autoKeys;
        console.log(`scores-poll: season teams not in clubs.json: ${out.autoKeys.join(", ")}`);
      }
      if (await upload(out.files)) state.builtAt = { ...state.builtAt, teams: stamp };
      else state.builtAt = { ...state.builtAt, teamsFailed: stamp };
    } else {
      state.builtAt = { ...state.builtAt, teamsFailed: stamp };
    }
  } else if (step === "build:previews") {
    // 2d. The previews. Head to head is the only request, inside 7 days of kickoff, at most 40 a
    //     call and 3 at once; the loop stops asking on the first failed reply and on a reply with
    //     under 1,500 left, and stops altogether on the first failed write. A fixture whose stored
    //     preview or lineup source cannot be read is left as it is: rebuilt blind, it would write
    //     h2h or lastLineup null over a good file, or pay again for an h2h already held. A failed
    //     write or a skipped fixture stamps previewsFailed, so the retry waits for the cadence.
    const targets = previewTargets(held, now);
    let asking = guards.apiAllowed;
    let h2hRequests = 0;
    let complete = true;
    let failed = false;
    // Reads keep their errors (null means no such file), and one read serves both sides.
    const reads = new Map<string, Promise<string | null>>();
    const readOnce = (path: string) => {
      if (!reads.has(path)) reads.set(path, deps.read(path));
      return reads.get(path)!;
    };
    const lastLineup = async (m: Match, teamId: number): Promise<LastLineup | null> => {
      for (const from of lineupCandidates(m, teamId, held)) {
        const lineup = lineupFromMatchFile(await readOnce(detailPath(from.id)), teamId);
        if (lineup) return lastLineupOf(from, teamId, lineup);
      }
      return null;
    };
    // The fixture's preview, or null when something it needs could not be read.
    const previewOf = async (m: Match): Promise<OutFile | null> => {
      const near = Date.parse(m.kickoff) - now.getTime() <= H2H_WINDOW_MS;
      let prev: H2h | null = null;
      let home: LastLineup | null;
      let away: LastLineup | null;
      try {
        if (near) prev = storedH2h(await deps.read(previewPath(m.id)));
        [home, away] = await Promise.all([lastLineup(m, m.home.id), lastLineup(m, m.away.id)]);
      } catch {
        errors.push(`preview ${m.id}: storage read failed, left as it was`);
        return null;
      }
      let h2h: H2h | null = prev;
      if (near && shouldFetchH2h(m, prev, held, now) && asking && h2hRequests < MAX_H2H_REQUESTS) {
        h2hRequests++;
        const r = await call(`/fixtures/headtohead?h2h=${m.home.id}-${m.away.id}&last=10`);
        if (!r.ok) {
          if (asking) errors.push(`h2h: ${r.reason}`);
          asking = false;
          backOff();
        } else {
          if (r.remaining !== null && r.remaining < QUOTA_RESERVE) asking = false;
          const built = buildH2h(r.fixtures, m, stamp);
          if (built) h2h = built;
          else errors.push(`h2h-unmapped ${m.id}`);
        }
      }
      return { path: previewPath(m.id), body: buildPreview({ ...m, detail: null }, h2h, { home, away }, stamp) };
    };
    for (let i = 0; i < targets.length; i += H2H_PARALLEL) {
      if (clock() - started >= budget) {
        complete = false;
        break;
      }
      const made = await Promise.all(targets.slice(i, i + H2H_PARALLEL).map(previewOf));
      const group = made.filter((f): f is OutFile => f !== null);
      if (group.length < made.length) failed = true;
      if (!await upload(group)) {
        failed = true;
        break;
      }
    }
    if (!asking && guards.apiAllowed && !errors.some((e) => e.startsWith("h2h:"))) {
      // Stopped by the reserve, read live off a reply.
      extra.skipped = "quota-reserve";
    }
    extra.h2hRequests = h2hRequests;
    extra.previews = targets.length;
    if (failed) state.builtAt = { ...state.builtAt, previewsFailed: stamp };
    else if (complete) state.builtAt = { ...state.builtAt, previews: stamp };
  }

  // 3. The hashes, pruned to what this mode owns now, and the state, saved only when it changed.
  const nowHeld = heldMatches(state);
  state.fileHashes = pruneHashes(hashes, {
    now,
    teamPaths: teamPathsFor(nowHeld),
    previewPaths: previewPathsFor(nowHeld, now),
  });
  const sansStamp = (s: SeasonState) => canonicalJson({ ...s, updatedAt: null });
  if (sansStamp(state) !== sansStamp(before)) {
    try {
      await deps.saveState(rowFromSeasonState(state, now));
    } catch (e) {
      writeFailed = true;
      errors.push("state write failed");
      console.error(`scores-poll: season state write failed: ${String((e as Error)?.message ?? e).slice(0, 120)}`);
    }
  }

  const skipped = extra.skipped ?? choice.skipped;
  return {
    ok: errors.length === 0,
    step,
    ...(skipped ? { skipped } : {}),
    requests,
    remaining,
    filesWritten,
    writeFailed,
    ...(extra.h2hRequests !== undefined ? { h2hRequests: extra.h2hRequests, previews: extra.previews } : {}),
    ...(extra.autoClubs ? { autoClubs: extra.autoClubs } : {}),
    ...(errors.length ? { error: errors.join("; ").slice(0, 300) } : {}),
  };
}
