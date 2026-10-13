// scores-poll mapping: API-Football's fixture JSON -> the archv-scores/1 and archv-match/1 contract
// the app reads. Pulled out of index.ts like daily-push's leads.ts, so map_test.ts can run it under
// a bare `deno test` with no network and no database. Nothing here does I/O.
//
// Every object is built field by field from what the contract names, never copied across, so a
// logo, a photo or any other URL in the API's reply cannot reach a file we publish (founder rule:
// no crests, no team logos, no player photos). The same goes for referees and coach photos.

export type CompetitionKey = "premier-league" | "champions-league" | "wsl";

// The three competitions, in the order the contract sorts them. leagueId is API-Football's.
export const COMPETITIONS: readonly { key: CompetitionKey; leagueId: number; name: string }[] = [
  { key: "premier-league", leagueId: 39, name: "Premier League" },
  { key: "champions-league", leagueId: 2, name: "UEFA Champions League" },
  { key: "wsl", leagueId: 44, name: "FA WSL" },
];

// API-Football short status codes, as the contract lists them. LIVE is the API's own catch-all.
export const LIVE_CODES: ReadonlySet<string> = new Set([
  "1H", "HT", "2H", "ET", "BT", "P", "SUSP", "INT", "LIVE",
]);
export const FINISHED_CODES: ReadonlySet<string> = new Set(["FT", "AET", "PEN", "AWD", "WO"]);
// Codes for a match that has not been played, and may never be. Everything else has kicked off.
const NOT_PLAYED_CODES: ReadonlySet<string> = new Set(["TBD", "NS", "PST", "CANC"]);

export const SCORES_SCHEMA = "archv-scores/1";
export const MATCH_SCHEMA = "archv-match/1";
export const SOURCE = "API-Football";

export type Side = { id: number; name: string; goals: number | null };
export type Match = {
  id: number;
  competition: { key: CompetitionKey; name: string; round: string | null };
  kickoff: string;
  status: {
    code: string;
    minute: number | null;
    extra: number | null;
    live: boolean;
    finished: boolean;
  };
  home: Side;
  away: Side;
  penalties: { home: number | null; away: number | null } | null;
  venue: string | null;
  detail: string | null;
};

export type EventType =
  | "goal"
  | "own-goal"
  | "penalty-goal"
  | "missed-penalty"
  | "yellow"
  | "red"
  | "second-yellow"
  | "sub"
  | "var";
export type MatchEvent = {
  minute: number;
  extra: number | null;
  side: "home" | "away";
  type: EventType;
  player: string | null;
  related: string | null;
  detail: string | null;
};
export type LineupPlayer = { name: string; number: number | null; pos: "G" | "D" | "M" | "F" | null };
export type Lineup = {
  formation: string | null;
  coach: string | null;
  startXI: LineupPlayer[];
  subs: LineupPlayer[];
};
export type Rating = { name: string; number: number | null; minutes: number | null; rating: number };
export type Stats = {
  possession: string | null;
  shots: number | null;
  shotsOnTarget: number | null;
  corners: number | null;
  fouls: number | null;
  offsides: number | null;
  yellow: number | null;
  red: number | null;
  xg: string | null;
};
export type MatchFile = {
  schema: typeof MATCH_SCHEMA;
  generatedAt: string;
  source: typeof SOURCE;
  match: Match;
  events: MatchEvent[];
  lineups: { home: Lineup; away: Lineup } | null;
  ratings: { home: Rating[]; away: Rating[] } | null;
  stats: { home: Stats; away: Stats } | null;
};

// ---------- small readers ----------

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => v && typeof v === "object" && !Array.isArray(v) ? v as Obj : null;
const list = (v: unknown): unknown[] => Array.isArray(v) ? v : [];

// Some names reach us double-encoded: UTF-8 bytes read as Latin-1, so "Martínez" arrives as
// "MartÃ" + U+00AD + "nez" (seen in a live Champions League reply, 2026-10-13). When every
// character is a single byte, a mojibake pair is present and the bytes decode as UTF-8, decode
// them. Anything else is left as it came.
function repairEncoding(s: string): string {
  if (!/[\u00c2-\u00f4][\u0080-\u00bf]/.test(s)) return s;
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c > 0xff) return s;
    bytes[i] = c;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return s;
  }
}

// Text for a published file: encoding repaired, then soft hyphens, zero-width characters and byte
// order marks removed, which have no business in a name or a venue.
export function tidy(s: string): string {
  return repairEncoding(s).replace(/[\u00ad\u200b-\u200f\u2060\ufeff]/g, "").trim();
}

const str = (v: unknown): string | null => {
  const t = typeof v === "string" ? tidy(v) : "";
  return t ? t : null;
};

// A whole number out of a number or a numeric string. The API sends counts both ways.
function int(v: unknown): number | null {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? Math.trunc(n) : null;
}

// ---------- statuses ----------

export const isLive = (code: string): boolean => LIVE_CODES.has(code);
export const isFinished = (code: string): boolean => FINISHED_CODES.has(code);
export const hasKickedOff = (code: string): boolean => !NOT_PLAYED_CODES.has(code);
export const isNotStarted = (code: string): boolean => code === "TBD" || code === "NS";

export const detailPath = (id: number): string => `match/${id}.json`;

// ---------- matches ----------

// WSL team names come from the API with a trailing " W" ("Arsenal W"). The competition already says
// it is the women's league, so the app gets the club's name.
function teamName(name: string, key: CompetitionKey): string {
  return key === "wsl" ? name.replace(/\s+W$/, "") : name;
}

function side(t: unknown, goals: unknown, key: CompetitionKey): Side | null {
  const o = obj(t);
  const id = int(o?.id);
  const name = str(o?.name);
  if (id === null || !name) return null;
  return { id, name: teamName(name, key), goals: int(goals) };
}

// One fixture object, from the schedule or from the details call (they share this shape), as a
// MATCH. null for anything we cannot stand behind: an unknown league, a missing team, no kickoff.
// `detail` is always null here; poll.ts sets it once the match's own file exists.
export function mapMatch(fx: unknown): Match | null {
  const f = obj(fx);
  const fixture = obj(f?.fixture);
  const league = obj(f?.league);
  const teams = obj(f?.teams);
  const goals = obj(f?.goals);
  const status = obj(fixture?.status);
  const comp = COMPETITIONS.find((c) => c.leagueId === int(league?.id));
  const id = int(fixture?.id);
  const kickoff = str(fixture?.date);
  const code = str(status?.short);
  if (!comp || id === null || !kickoff || !Number.isFinite(Date.parse(kickoff)) || !code) return null;
  const home = side(teams?.home, goals?.home, comp.key);
  const away = side(teams?.away, goals?.away, comp.key);
  if (!home || !away) return null;

  const pen = obj(obj(f?.score)?.penalty);
  const penalties = int(pen?.home) === null && int(pen?.away) === null
    ? null
    : { home: int(pen?.home), away: int(pen?.away) };

  return {
    id,
    competition: { key: comp.key, name: comp.name, round: str(league?.round) },
    kickoff,
    status: {
      code,
      minute: int(status?.elapsed),
      extra: int(status?.extra),
      live: isLive(code),
      finished: isFinished(code),
    },
    home,
    away,
    penalties,
    venue: str(obj(fixture?.venue)?.name),
    detail: null,
  };
}

// A MATCH read back from storage, rebuilt field by field in the order mapMatch builds it. Postgres
// jsonb hands an object's keys back shortest first, not in the order they went in, so a match
// that has been through the state row would otherwise be written out with its keys in a different
// order. Strings are taken as stored (they were tidied on the way in). null for anything that is
// not a match, so one damaged entry costs that match, not the run.
export function normaliseMatch(v: unknown): Match | null {
  const m = obj(v);
  const comp = obj(m?.competition);
  const status = obj(m?.status);
  const key = COMPETITIONS.find((c) => c.key === comp?.key);
  const id = int(m?.id);
  const kickoff = typeof m?.kickoff === "string" ? m.kickoff : null;
  const code = typeof status?.code === "string" ? status.code : null;
  const home = storedSide(m?.home);
  const away = storedSide(m?.away);
  if (!key || id === null || !kickoff || !Number.isFinite(Date.parse(kickoff)) || !code || !home || !away) {
    return null;
  }
  const pen = obj(m?.penalties);
  const text = (x: unknown) => typeof x === "string" ? x : null;
  return {
    id,
    competition: { key: key.key, name: key.name, round: text(comp?.round) },
    kickoff,
    status: {
      code,
      minute: int(status?.minute),
      extra: int(status?.extra),
      live: isLive(code),
      finished: isFinished(code),
    },
    home,
    away,
    penalties: pen ? { home: int(pen.home), away: int(pen.away) } : null,
    venue: text(m?.venue),
    detail: text(m?.detail),
  };
}

function storedSide(v: unknown): Side | null {
  const o = obj(v);
  const id = int(o?.id);
  return id !== null && typeof o?.name === "string" && o.name ? { id, name: o.name, goals: int(o.goals) } : null;
}

// Kickoff, then competition order, then id, so the file is byte-stable between runs.
export function sortMatches<T extends Match>(matches: readonly T[]): T[] {
  const order = (m: Match) => COMPETITIONS.findIndex((c) => c.key === m.competition.key);
  return [...matches].sort((a, b) =>
    Date.parse(a.kickoff) - Date.parse(b.kickoff) || order(a) - order(b) || a.id - b.id
  );
}

// ---------- events ----------

function eventType(type: unknown, detail: unknown): EventType | null {
  const t = String(type ?? "").toLowerCase();
  const d = String(detail ?? "").toLowerCase();
  if (t === "goal") {
    if (d === "normal goal") return "goal";
    if (d === "own goal") return "own-goal";
    if (d === "penalty") return "penalty-goal";
    if (d === "missed penalty") return "missed-penalty";
    return null;
  }
  if (t === "card") {
    if (d === "yellow card") return "yellow";
    if (d === "red card") return "red";
    if (d === "second yellow card") return "second-yellow";
    return null;
  }
  if (t === "subst") return "sub";
  if (t === "var") return "var";
  return null;
}

// The timeline, minute then extra. `side` is the API's team on the event, matched by team id. For a
// substitution the API's `player` is the man coming off and `assist` the man coming on, so
// player/related follow it: related is the player coming on. An event we cannot place on a side or
// a type we do not know is dropped, and so is a penalty-shootout kick (a goal event at 120 that the
// score does not count; the shootout total is match.penalties).
export function mapEvents(events: unknown, home: Side, away: Side): MatchEvent[] {
  const out: MatchEvent[] = [];
  for (const raw of list(events)) {
    const e = obj(raw);
    const type = eventType(e?.type, e?.detail);
    const teamId = int(obj(e?.team)?.id);
    const minute = int(obj(e?.time)?.elapsed);
    if (!type || minute === null) continue;
    if (/shootout/i.test(String(e?.comments ?? ""))) continue;
    const s = teamId === home.id ? "home" : teamId === away.id ? "away" : null;
    if (!s) continue;
    out.push({
      minute,
      extra: int(obj(e?.time)?.extra),
      side: s,
      type,
      player: str(obj(e?.player)?.name),
      related: str(obj(e?.assist)?.name),
      detail: str(e?.detail),
    });
  }
  // Array.prototype.sort is stable, so events in the same minute keep the API's order.
  return out.sort((a, b) => a.minute - b.minute || (a.extra ?? 0) - (b.extra ?? 0));
}

// ---------- lineups ----------

function lineupPlayers(v: unknown): LineupPlayer[] {
  const out: LineupPlayer[] = [];
  for (const raw of list(v)) {
    const p = obj(obj(raw)?.player);
    const name = str(p?.name);
    if (!name) continue;
    const pos = str(p?.pos);
    out.push({
      name,
      number: int(p?.number),
      pos: pos === "G" || pos === "D" || pos === "M" || pos === "F" ? pos : null,
    });
  }
  return out;
}

// The entry for one team out of an array the API keys by team.id. Never by position in the array.
function forTeam(entries: unknown, teamId: number): Obj | null {
  for (const raw of list(entries)) {
    const e = obj(raw);
    if (int(obj(e?.team)?.id) === teamId) return e;
  }
  return null;
}

function lineupFor(entries: unknown, teamId: number): Lineup | null {
  const e = forTeam(entries, teamId);
  if (!e) return null;
  const startXI = lineupPlayers(e.startXI);
  // A lineup with no starters is one that has not been announced yet.
  if (!startXI.length) return null;
  return {
    formation: str(e.formation),
    coach: str(obj(e.coach)?.name),
    startXI,
    subs: lineupPlayers(e.substitutes),
  };
}

// ---------- ratings ----------

// API-Football's player ratings, as it sends them (a string like "7.3"; null for a player who has
// not been rated). Only rated players are listed, best first. Equal ratings keep the API's order.
function ratingsFor(entries: unknown, teamId: number): Rating[] {
  const e = forTeam(entries, teamId);
  const out: Rating[] = [];
  for (const raw of list(e?.players)) {
    const p = obj(raw);
    const name = str(obj(p?.player)?.name);
    const games = obj(obj(list(p?.statistics)[0])?.games);
    const rating = typeof games?.rating === "string" || typeof games?.rating === "number"
      ? Number(games.rating)
      : NaN;
    if (!name || !Number.isFinite(rating) || rating <= 0) continue;
    out.push({ name, number: int(games?.number), minutes: int(games?.minutes), rating });
  }
  return out.sort((a, b) => b.rating - a.rating);
}

// ---------- stats ----------

function statValue(stats: unknown, type: string): unknown {
  for (const raw of list(stats)) {
    const s = obj(raw);
    if (s?.type === type) return s.value;
  }
  return null;
}

function statsFor(entries: unknown, teamId: number): Stats | null {
  const e = forTeam(entries, teamId);
  if (!e) return null;
  const s = e.statistics;
  const possession = statValue(s, "Ball Possession");
  const xg = statValue(s, "expected_goals");
  return {
    possession: typeof possession === "string" && possession ? possession
      : typeof possession === "number" ? `${possession}%` : null,
    shots: int(statValue(s, "Total Shots")),
    shotsOnTarget: int(statValue(s, "Shots on Goal")),
    corners: int(statValue(s, "Corner Kicks")),
    fouls: int(statValue(s, "Fouls")),
    offsides: int(statValue(s, "Offsides")),
    yellow: int(statValue(s, "Yellow Cards")),
    red: int(statValue(s, "Red Cards")),
    xg: typeof xg === "string" && xg ? xg : typeof xg === "number" ? String(xg) : null,
  };
}

// ---------- the match file ----------

// One fixture from the details call as a match/<id>.json document. `match` is the MATCH as it
// appears in scores.json (with its detail pointer). Lineups, ratings and stats are null until the
// API has them, and a half-filled pair is null too: the app shows both teams or neither.
export function mapMatchFile(fx: unknown, match: Match, generatedAt: string): MatchFile {
  const f = obj(fx);
  const { home, away } = match;

  const lh = lineupFor(f?.lineups, home.id);
  const la = lineupFor(f?.lineups, away.id);

  const rh = ratingsFor(f?.players, home.id);
  const ra = ratingsFor(f?.players, away.id);

  const sh = statsFor(f?.statistics, home.id);
  const sa = statsFor(f?.statistics, away.id);

  return {
    schema: MATCH_SCHEMA,
    generatedAt,
    source: SOURCE,
    match,
    events: mapEvents(f?.events, home, away),
    lineups: lh && la ? { home: lh, away: la } : null,
    ratings: rh.length || ra.length ? { home: rh, away: ra } : null,
    stats: sh && sa ? { home: sh, away: sa } : null,
  };
}
