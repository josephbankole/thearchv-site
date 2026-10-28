// scores-poll season mode: the decisions and the builders, pure, no I/O. season_run.ts does the
// requests and the writes; season_test.ts covers what is here.
//
// Season mode is a second job on the same function, called every 15 minutes by its own pg_cron job
// with the body {"mode":"season"} (index.ts routes it). It keeps its own one-row state,
// public.scores_season_state, and never reads or writes the minute poll's. Each call does at most
// ONE step:
//
//   list:<key>      one request, the competition's whole season (/fixtures?league=&season=)
//   build:days      days/<date>.json for the days +2 to +28 (Edmonton), and days/ahead.json
//   build:teams     teams/index.json and teams/<id>.json for every in-scope team
//   build:previews  preview/<fixtureId>.json for every not-started match within 28 days
//
// The listings run in fixed cron slots (:07, :22 and :37 past 00, 06, 12 and 18 UTC, one competition
// each), so they cost 12 requests a day whatever the state row says. Only build:previews makes any
// other request (head to head, at most 40 a call); the two other builds cost none.
import { edmontonDay } from "../_shared/push_guard.ts";
import clubsTable from "../_shared/clubs.json" with { type: "json" };
import { buildDayFile, type DayFile, dayPath, groupByDay } from "./days.ts";
import {
  COMPETITIONS,
  type CompetitionKey,
  detailPath,
  isNotStarted,
  type Match,
  normaliseMatch,
  SOURCE,
  sortMatches,
} from "./map.ts";
import { addDays } from "./plan.ts";
import { PREVIEW_HORIZON_MS, previewPath } from "./preview.ts";

export const AHEAD_SCHEMA = "archv-days-ahead/1";
export const TEAM_SCHEMA = "archv-team/1";
export const TEAMS_SCHEMA = "archv-teams/1";
export const AHEAD_PATH = "days/ahead.json";
export const TEAMS_INDEX_PATH = "teams/index.json";
export const teamPath = (id: number): string => `teams/${id}.json`;

// The cron slots (minutes past the hour) and the hours the listings run in, UTC.
export const LISTING_HOURS: ReadonlySet<number> = new Set([0, 6, 12, 18]);
export const LISTING_SLOTS: readonly { minute: number; key: CompetitionKey }[] = [
  { minute: 7, key: "premier-league" },
  { minute: 22, key: "champions-league" },
  { minute: 37, key: "wsl" },
];
// pg_cron fires on the minute; a call can start a few seconds late. A hand call between slots (at
// :12, say) is never read as a listing slot.
const SLOT_GRACE_MIN = 4;

// A build is due when a listing is newer than it, or when it is this old.
export const BUILD_EVERY_MS = 6 * 3_600_000;
// A healthy row is written at least every 5.5 hours (the listings). Older than this, the last state
// write is taken to have failed, and the call makes no request until a write lands again.
export const STALE_ROW_MS = 6 * 3_600_000;
// Season mode leaves this many of the day's API-Football requests for the minute poll.
export const QUOTA_RESERVE = 1_500;
// How long to leave the API alone after a request fails.
export const SEASON_BACKOFF_MS = 30 * 60_000;
// Head-to-head requests per call, and in flight at once.
export const MAX_H2H_REQUESTS = 40;
export const H2H_PARALLEL = 3;
// The days this mode owns: the poll owns yesterday, today and tomorrow.
export const AHEAD_FIRST = 2;
export const AHEAD_LAST = 28;

// Qualifying rounds are not a team's season: a side that only played in July and August gets no
// team file and no club entry.
const QUALIFYING = /Qualifying|Preliminary|Play-offs/i;
export const isQualifying = (m: Match): boolean => QUALIFYING.test(m.competition.round ?? "");

export type BuildStep = "build:days" | "build:teams" | "build:previews";
export type Step = `list:${CompetitionKey}` | BuildStep;
export const BUILD_STEPS: readonly BuildStep[] = ["build:days", "build:teams", "build:previews"];
export const isStep = (v: unknown): v is Step =>
  typeof v === "string" &&
  ((BUILD_STEPS as readonly string[]).includes(v) || COMPETITIONS.some((c) => v === `list:${c.key}`));

// ---------- the state row ----------

export const BUILT_KEYS = ["days", "teams", "previews", "teamsFailed", "previewsFailed"] as const;
export type BuiltKey = typeof BUILT_KEYS[number];

export type SeasonState = {
  season: number | null; // the season the held matches belong to
  listedAt: Partial<Record<CompetitionKey, string>>;
  matches: Partial<Record<CompetitionKey, Match[]>>;
  // A build's last full run, plus, for teams and previews, the last run that failed part way (a
  // failed storage listing, a failed write or an unreadable file), so a failure waits for the next
  // listing or six hours like a success does instead of being due again on every call.
  builtAt: Partial<Record<BuiltKey, string>>;
  fileHashes: Record<string, string>;
  remaining: number | null;
  remainingAt: string | null;
  backoffUntil: string | null;
  updatedAt: string | null;
};

export const EMPTY_SEASON_STATE: SeasonState = {
  season: null,
  listedAt: {},
  matches: {},
  builtAt: {},
  fileHashes: {},
  remaining: null,
  remainingAt: null,
  backoffUntil: null,
  updatedAt: null,
};

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const iso = (v: unknown): string | null => typeof v === "string" && Number.isFinite(Date.parse(v)) ? v : null;
const whole = (v: unknown): number | null => typeof v === "number" && Number.isInteger(v) ? v : null;

// public.scores_season_state's one row -> SeasonState, read as defensively as the poll's: a
// column of the wrong shape reads as empty, and every held match is rebuilt through normaliseMatch
// (jsonb hands keys back in its own order), so one damaged entry costs that match.
export function seasonStateFromRow(row: Record<string, unknown> | null | undefined): SeasonState {
  if (!row) return EMPTY_SEASON_STATE;
  const stamps = <K extends string>(v: unknown, keys: readonly K[]): Partial<Record<K, string>> => {
    const out: Partial<Record<K, string>> = {};
    if (isObj(v)) for (const k of keys) {
      const t = iso(v[k]);
      if (t) out[k] = t;
    }
    return out;
  };
  const keys = COMPETITIONS.map((c) => c.key);
  const matches: SeasonState["matches"] = {};
  if (isObj(row.matches)) {
    for (const k of keys) {
      const raw = row.matches[k];
      if (Array.isArray(raw)) {
        matches[k] = sortMatches(raw.map(normaliseMatch).filter((m): m is Match => m !== null && m.competition.key === k));
      }
    }
  }
  const hashes: Record<string, string> = {};
  if (isObj(row.file_hashes)) {
    for (const [k, x] of Object.entries(row.file_hashes)) if (typeof x === "string") hashes[k] = x;
  }
  return {
    season: whole(row.season),
    listedAt: stamps(row.listed_at, keys),
    matches,
    builtAt: stamps(row.built_at, BUILT_KEYS),
    fileHashes: hashes,
    remaining: whole(row.remaining),
    remainingAt: iso(row.remaining_at),
    backoffUntil: iso(row.backoff_until),
    updatedAt: iso(row.updated_at),
  };
}

export function rowFromSeasonState(s: SeasonState, now: Date): Record<string, unknown> {
  return {
    id: 1,
    season: s.season,
    listed_at: s.listedAt,
    matches: s.matches,
    built_at: s.builtAt,
    file_hashes: s.fileHashes,
    remaining: s.remaining,
    remaining_at: s.remainingAt,
    backoff_until: s.backoffUntil,
    updated_at: now.toISOString(),
  };
}

// A new season clears what is held, so an empty new-season listing is believed and last season's
// fixtures leave the team files and the picker. File hashes stay: they say what is in the bucket.
export function rollover(s: SeasonState, season: number): SeasonState {
  return s.season === season ? s : { ...s, season, matches: {}, listedAt: {} };
}

export const heldMatches = (s: SeasonState): Match[] =>
  sortMatches(COMPETITIONS.flatMap((c) => s.matches[c.key] ?? []));

// ---------- choosing the step ----------

export type Guards = { apiAllowed: boolean; reason: string | null };

// Whether this call may make API requests, in the spec's order: a backoff in force; a quota
// reserve recorded TODAY (UTC; a value read yesterday says nothing about today's count); and the
// last state write having failed (the row's updated_at older than a stamp it holds, or older than
// six hours), because then nothing this call learns is remembered and every call would pay again.
// The six-hour half needs a row the cron has used: the migration's insert stamps updated_at with
// no listing or build behind it, so a first deploy more than six hours later must still list.
export function apiGuards(s: SeasonState, now: Date): Guards {
  const t = now.getTime();
  if (s.backoffUntil && Date.parse(s.backoffUntil) > t) return { apiAllowed: false, reason: "backing off" };
  if (
    s.remaining !== null && s.remainingAt && s.remainingAt.slice(0, 10) === now.toISOString().slice(0, 10) &&
    s.remaining < QUOTA_RESERVE
  ) {
    return { apiAllowed: false, reason: "quota-reserve" };
  }
  if (s.updatedAt) {
    const updated = Date.parse(s.updatedAt);
    const stamps = [...Object.values(s.listedAt), ...Object.values(s.builtAt)].map((v) => Date.parse(v ?? ""));
    const used = stamps.length > 0;
    if (stamps.some((x) => x > updated) || (used && t - updated > STALE_ROW_MS)) {
      return { apiAllowed: false, reason: "state write failed earlier" };
    }
  }
  return { apiAllowed: true, reason: null };
}

// The competition this call's cron slot lists, or null for a build slot.
export function listingSlot(now: Date): CompetitionKey | null {
  if (!LISTING_HOURS.has(now.getUTCHours())) return null;
  const min = now.getUTCMinutes();
  return LISTING_SLOTS.find((s) => min >= s.minute && min <= s.minute + SLOT_GRACE_MIN)?.key ?? null;
}

const newest = (stamps: readonly (string | undefined)[]): number =>
  Math.max(-Infinity, ...stamps.map((v) => Date.parse(v ?? "")).filter(Number.isFinite));

// The first build step that is due, or null. Days and teams are due when a listing is newer than
// their last build, or every six hours; previews every six hours, or when the days were rebuilt
// after them (a new listing reached the days first). For teams and previews a failed run counts
// as the last build here, so a failure retries on that cadence and never starves the steps after.
export function dueBuild(s: SeasonState, now: Date): BuildStep | null {
  const t = now.getTime();
  const listed = newest(Object.values(s.listedAt));
  const at = (k: BuiltKey) => Date.parse(s.builtAt[k] ?? "");
  const last = (k: "days" | "teams" | "previews") =>
    k === "days" ? at(k) : newest([s.builtAt[k], s.builtAt[`${k}Failed`]]);
  const stale = (k: "days" | "teams" | "previews") => !Number.isFinite(last(k)) || t - last(k) >= BUILD_EVERY_MS;
  if (stale("days") || listed > last("days")) return "build:days";
  if (stale("teams") || listed > last("teams")) return "build:teams";
  if (stale("previews") || at("days") > last("previews")) return "build:previews";
  return null;
}

export type Choice = { step: Step | null; skipped: string | null };

// What this call does. A forced step (a hand call with the push secret) is honoured, but a listing
// still needs the API guards to pass. Otherwise a listing slot lists, unless the guards say no, in
// which case the call falls through to a build: the builds cost no request.
export function chooseStep(s: SeasonState, now: Date, forced: Step | null = null): Choice {
  const g = apiGuards(s, now);
  if (forced) {
    if (forced.startsWith("list:") && !g.apiAllowed) return { step: null, skipped: g.reason };
    return { step: forced, skipped: null };
  }
  const slot = listingSlot(now);
  if (slot && g.apiAllowed) return { step: `list:${slot}`, skipped: null };
  return { step: dueBuild(s, now), skipped: slot ? g.reason : null };
}

// ---------- build:days ----------

export type AheadFile = {
  schema: typeof AHEAD_SCHEMA;
  generatedAt: string;
  days: { date: string; count: number }[];
};
export type DaysOut = { files: { path: string; body: DayFile | AheadFile }[]; owned: string[] };

// The future day files and days/ahead.json. Only days +2 to +28 are written: the poll owns
// yesterday, today and tomorrow, and days/index.json (history) is never touched here. An owned day
// that had a file and has lost its matches gets an empty one, so a rescheduled fixture does not
// linger. ahead.json lists tomorrow to +28, ascending, days with matches only; tomorrow's count is
// this step's own, its file is the poll's. Nothing in these days has kicked off, so no detail.
export function buildAhead(
  held: readonly Match[],
  now: Date,
  hashes: Readonly<Record<string, string>>,
  stamp: string,
): DaysOut {
  const today = edmontonDay(now);
  const byDay = groupByDay(held.map((m) => ({ ...m, detail: null })));
  const files: DaysOut["files"] = [];
  const owned: string[] = [];
  for (let n = AHEAD_FIRST; n <= AHEAD_LAST; n++) {
    const d = addDays(today, n);
    owned.push(dayPath(d));
    const list = byDay.get(d);
    if (list || dayPath(d) in hashes) files.push({ path: dayPath(d), body: buildDayFile(d, list ?? [], stamp) });
  }
  const days: AheadFile["days"] = [];
  for (let n = 1; n <= AHEAD_LAST; n++) {
    const d = addDays(today, n);
    const count = byDay.get(d)?.length ?? 0;
    if (count > 0) days.push({ date: d, count });
  }
  files.push({ path: AHEAD_PATH, body: { schema: AHEAD_SCHEMA, generatedAt: stamp, days } });
  owned.push(AHEAD_PATH);
  return { files, owned };
}

// ---------- build:teams ----------

export type ClubEntry = {
  key: string;
  name: string;
  aliases: string[];
  notWith: string[];
  formerKeys: string[];
  teamIds: number[];
};
export const CLUBS: readonly ClubEntry[] = (clubsTable as { clubs: ClubEntry[] }).clubs;

export type TeamRef = {
  id: number;
  name: string;
  club: string | null;
  women: boolean;
  competitions: CompetitionKey[];
};
export type TeamFile = {
  schema: typeof TEAM_SCHEMA;
  generatedAt: string;
  source: typeof SOURCE;
  team: TeamRef;
  matches: Match[];
};
export type ClubRow = {
  key: string;
  name: string;
  aliases: string[];
  notWith: string[];
  formerKeys: string[];
  auto: boolean;
  teams: { id: number; women: boolean; competitions: CompetitionKey[] }[];
};
export type TeamsIndex = {
  schema: typeof TEAMS_SCHEMA;
  generatedAt: string;
  season: number;
  clubs: ClubRow[];
};
export type TeamsOut = {
  files: { path: string; body: TeamFile | TeamsIndex }[];
  owned: string[];
  autoKeys: string[]; // in-scope team ids clubs.json does not cover: fix the table
};

// Every team file and the index. In scope: every team id in a held match that is not a qualifying
// round. A team's file holds every held match it played or will play, across the three
// competitions, kickoff ascending, each with its detail pointer when the match file is in the
// bucket (`files` is the set of match ids the storage listing found; null when the listing failed,
// and then no match gets a pointer this run). The index lists every club in clubs.json, sorted by
// name, each with the in-scope teams it covers, plus an auto entry for each in-scope team the table
// misses, so its matches still show; the app never offers an auto entry in the picker.
export function buildTeams(
  held: readonly Match[],
  files: ReadonlySet<number> | null,
  season: number,
  stamp: string,
  clubs: readonly ClubEntry[] = CLUBS,
): TeamsOut {
  const pointed = (m: Match): Match => ({ ...m, detail: files?.has(m.id) ? detailPath(m.id) : null });
  const scope = new Map<number, { name: string; comps: Set<CompetitionKey>; women: boolean; last: number }>();
  for (const m of held) {
    if (isQualifying(m)) continue;
    for (const t of [m.home, m.away]) {
      const at = Date.parse(m.kickoff);
      const e = scope.get(t.id) ?? { name: t.name, comps: new Set(), women: false, last: -Infinity };
      if (at >= e.last) {
        e.name = t.name; // the newest spelling the API used
        e.last = at;
      }
      scope.set(t.id, e);
    }
  }
  // Competitions and the women flag come from every held match of the team, qualifiers included.
  for (const m of held) {
    for (const t of [m.home, m.away]) {
      const e = scope.get(t.id);
      if (!e) continue;
      e.comps.add(m.competition.key);
      if (m.competition.key === "wsl") e.women = true;
    }
  }
  const order = (cs: Set<CompetitionKey>) => COMPETITIONS.map((c) => c.key).filter((k) => cs.has(k));
  const clubOf = new Map<number, string>();
  for (const c of clubs) for (const id of c.teamIds) clubOf.set(id, c.key);

  const out: TeamsOut["files"] = [];
  const owned: string[] = [];
  const ids = [...scope.keys()].sort((a, b) => a - b);
  for (const id of ids) {
    const e = scope.get(id)!;
    out.push({
      path: teamPath(id),
      body: {
        schema: TEAM_SCHEMA,
        generatedAt: stamp,
        source: SOURCE,
        team: { id, name: e.name, club: clubOf.get(id) ?? null, women: e.women, competitions: order(e.comps) },
        matches: sortMatches(held.filter((m) => m.home.id === id || m.away.id === id)).map(pointed),
      },
    });
    owned.push(teamPath(id));
  }

  const teamRow = (id: number) => {
    const e = scope.get(id)!;
    return { id, women: e.women, competitions: order(e.comps) };
  };
  const rows: ClubRow[] = clubs.map((c) => ({
    key: c.key,
    name: c.name,
    aliases: [...c.aliases],
    notWith: [...c.notWith],
    formerKeys: [...c.formerKeys],
    auto: false,
    teams: c.teamIds.filter((id) => scope.has(id)).map(teamRow),
  }));
  const autoKeys: string[] = [];
  for (const id of ids) {
    if (clubOf.has(id)) continue;
    const key = `team-${id}`;
    autoKeys.push(key);
    rows.push({ key, name: scope.get(id)!.name, aliases: [], notWith: [], formerKeys: [], auto: true, teams: [teamRow(id)] });
  }
  rows.sort((a, b) => a.name.localeCompare(b.name, "en") || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  out.push({ path: TEAMS_INDEX_PATH, body: { schema: TEAMS_SCHEMA, generatedAt: stamp, season, clubs: rows } });
  owned.push(TEAMS_INDEX_PATH);
  return { files: out, owned, autoKeys };
}

// ---------- build:previews ----------

// The fixtures that get a preview, in kickoff order: not started, kicking off from now to 28 days on.
export function previewTargets(held: readonly Match[], now: Date): Match[] {
  const t = now.getTime();
  return sortMatches(held.filter((m) => {
    const k = Date.parse(m.kickoff);
    return isNotStarted(m.status.code) && k >= t && k <= t + PREVIEW_HORIZON_MS;
  }));
}

// ---------- file hashes ----------

// The hashes this mode keeps: the day paths it owns this run (+2 to +28) and ahead.json, the
// current team paths (and the index) and the previews of fixtures that have not kicked off, all
// worked out from the held matches, whichever step ran. Everything else goes, so the record cannot
// grow without end: a day that has become the poll's, a preview whose match has kicked off.
export function pruneHashes(
  hashes: Readonly<Record<string, string>>,
  keep: { now: Date; teamPaths: ReadonlySet<string>; previewPaths: ReadonlySet<string> },
): Record<string, string> {
  const today = edmontonDay(keep.now);
  const dayPaths = new Set<string>([AHEAD_PATH]);
  for (let n = AHEAD_FIRST; n <= AHEAD_LAST; n++) dayPaths.add(dayPath(addDays(today, n)));
  const out: Record<string, string> = {};
  for (const [path, hash] of Object.entries(hashes)) {
    const isTeam = path.startsWith("teams/");
    const ok = dayPaths.has(path) ||
      (isTeam && keep.teamPaths.has(path)) ||
      (path.startsWith("preview/") && keep.previewPaths.has(path));
    if (ok) out[path] = hash;
  }
  return out;
}

export const previewPathsFor = (held: readonly Match[], now: Date): Set<string> =>
  new Set(held.filter((m) => isNotStarted(m.status.code) && Date.parse(m.kickoff) >= now.getTime()).map((m) => previewPath(m.id)));

// The team paths the held matches give (the same in-scope rule as buildTeams), and the index.
export function teamPathsFor(held: readonly Match[]): Set<string> {
  const out = new Set<string>([TEAMS_INDEX_PATH]);
  for (const m of held) if (!isQualifying(m)) for (const t of [m.home, m.away]) out.add(teamPath(t.id));
  return out;
}
