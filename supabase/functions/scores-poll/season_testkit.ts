// Shared by the season-mode tests (season_test.ts, preview_test.ts, season_run_test.ts). Not deployed.
//
// fixtures/season-*.json are copies of the three recorded schedule replies (the real API shape, the
// parameters of a season listing). `seasonReply` re-dates them around a test's clock into a spread
// of past and future kickoffs: a past kickoff is finished with its recorded score, a future one is
// not started with no score. Only dates, statuses and goals are edited.
// fixtures/h2h-synthetic.json is SYNTHETIC (see its _synthetic line and the README).
import type { ApiGet } from "./api.ts";
import plSeason from "./fixtures/season-premier-league.json" with { type: "json" };
import uclSeason from "./fixtures/season-champions-league.json" with { type: "json" };
import wslSeason from "./fixtures/season-wsl.json" with { type: "json" };
import h2hSynthetic from "./fixtures/h2h-synthetic.json" with { type: "json" };
import { type CompetitionKey, mapMatch, type Match, sortMatches } from "./map.ts";
import { EMPTY_SEASON_STATE, type SeasonState } from "./season.ts";

// deno-lint-ignore no-explicit-any
export type Fx = any;
type Envelope = { response: Fx[] };

// 12:12 UTC: between cron slots, and 06:12 on 28 October in Edmonton (still on summer time).
export const NOW = new Date("2026-10-28T12:12:00Z");
export const DAY = 24 * 3_600_000;

// Days from the test's clock, per row, in the order the recorded reply lists them. Index 8 of the
// Premier League is Liverpool v Manchester City (1557424), whose details reply is recorded, so it
// is put in the past: it is where Liverpool's and City's last lineups come from.
export const OFFSETS: Record<CompetitionKey, number[]> = {
  "premier-league": [-21, -14, -7, -3, 1, 3, 5, 10, -1, 35],
  "champions-league": [-30, -25, -20, -15, -10, -5, -2, 2, 4, 6, 8, 12, 16, 21, 27, 29, 40, 50],
  "wsl": [-14, -7, -2, 3, 6, 13, 30],
};
const RAW: Record<CompetitionKey, Envelope> = {
  "premier-league": plSeason,
  "champions-league": uclSeason,
  "wsl": wslSeason,
};
export const LEAGUE_OF: Record<string, CompetitionKey> = { "39": "premier-league", "2": "champions-league", "44": "wsl" };

// A kickoff n days from `now`, at 15:00 UTC on that date.
export function kickoffIn(now: Date, n: number): string {
  const d = new Date(now.getTime() + n * DAY);
  return `${d.toISOString().slice(0, 10)}T15:00:00+00:00`;
}

export function seasonReply(key: CompetitionKey, now: Date = NOW): Envelope {
  const env = structuredClone(RAW[key]);
  env.response.forEach((fx: Fx, i: number) => {
    const n = OFFSETS[key][i];
    fx.fixture.date = kickoffIn(now, n);
    fx.fixture.timestamp = Math.floor(Date.parse(fx.fixture.date) / 1000);
    if (n < 0) {
      fx.fixture.status = { long: "Match Finished", short: "FT", elapsed: 90, extra: null };
      if (fx.goals.home === null) fx.goals = { home: 1, away: 1 };
    } else {
      fx.fixture.status = { long: "Not Started", short: "NS", elapsed: null, extra: null };
      fx.goals = { home: null, away: null };
    }
  });
  return env;
}

export const seasonMatches = (key: CompetitionKey, now: Date = NOW): Match[] =>
  sortMatches(seasonReply(key, now).response.map(mapMatch).filter((m): m is Match => m !== null));

// A healthy state row holding all three listings, written an hour ago.
export function heldState(now: Date = NOW, edit?: (s: SeasonState) => void): SeasonState {
  const hourAgo = new Date(now.getTime() - 3_600_000).toISOString();
  const s: SeasonState = {
    ...EMPTY_SEASON_STATE,
    season: 2026,
    listedAt: { "premier-league": hourAgo, "champions-league": hourAgo, "wsl": hourAgo },
    matches: {
      "premier-league": seasonMatches("premier-league", now),
      "champions-league": seasonMatches("champions-league", now),
      "wsl": seasonMatches("wsl", now),
    },
    builtAt: {},
    updatedAt: hourAgo,
  };
  edit?.(s);
  return s;
}

export const h2hReply = (): Envelope => structuredClone(h2hSynthetic as Envelope);

// The API: a season listing per league=, and a head to head per h2h= from `h2h` (default: the
// synthetic reply). `fail` makes a path fail; `remaining` sets the quota each reply reports.
export function seasonApi(
  opts: {
    fail?: (path: string, n: number) => string | null;
    remaining?: (n: number) => number | null;
    listing?: (key: CompetitionKey) => Envelope;
    h2h?: (pair: string) => Fx[];
    delayMs?: number;
  } = {},
) {
  const calls: string[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const api: ApiGet = async (path) => {
    calls.push(path);
    const n = calls.length;
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((r) => setTimeout(r, opts.delayMs ?? 0));
    inFlight--;
    const remaining = opts.remaining ? opts.remaining(n) : 7000 - n;
    const reason = opts.fail?.(path, n);
    if (reason) return { ok: false, reason, remaining };
    const q = new URLSearchParams(path.split("?")[1]);
    if (q.has("h2h")) {
      return { ok: true, fixtures: opts.h2h ? opts.h2h(q.get("h2h")!) : h2hReply().response, remaining };
    }
    const key = LEAGUE_OF[q.get("league")!];
    const env = opts.listing ? opts.listing(key) : seasonReply(key);
    return { ok: true, fixtures: env.response, remaining };
  };
  return { api, calls, maxInFlight: () => maxInFlight };
}
