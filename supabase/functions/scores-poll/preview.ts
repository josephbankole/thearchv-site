// scores-poll season mode, the match preview: head to head from API-Football's
// /fixtures/headtohead reply, and each side's last lineup from the match files already in the
// bucket. Pure, no I/O: season_run.ts does the reading, the requests and the writing, and
// preview_test.ts covers what is here.
//
// preview/<fixtureId>.json (archv-preview/1) is written for every in-scope match that has not kicked
// off and starts within 28 days. Head to head is filled only inside 7 days of kickoff and is fetched
// once, then refreshed only when a newer meeting shows up in the season listings or once inside 48
// hours of kickoff (shouldFetchH2h). The file in Storage is the memory: a run reads the previous
// file back and reuses its h2h block, so a lost state row never pays twice for the same request.
//
// As everywhere in this function, every object is built field by field: no logo, flag, photo,
// venue, round or referee from the API's rows reaches the file.
import {
  COMPETITIONS,
  type CompetitionKey,
  FINISHED_CODES,
  type Lineup,
  type Match,
  SOURCE,
  tidy,
} from "./map.ts";

export const PREVIEW_SCHEMA = "archv-preview/1";
export const previewPath = (id: number): string => `preview/${id}.json`;

// Head to head is fetched only this close to kickoff, and refreshed once inside the last 48 hours.
export const H2H_WINDOW_MS = 7 * 24 * 3_600_000;
export const H2H_REFRESH_MS = 48 * 3_600_000;
// Previews cover the same horizon as the fixtures rail.
export const PREVIEW_HORIZON_MS = 28 * 24 * 3_600_000;
// The meetings asked for, and kept.
export const H2H_LAST = 10;
// How many of a side's earlier matches are tried for its last lineup.
export const LINEUP_TRIES = 3;

// API-Football's league ids for friendlies: club friendlies (667), international friendlies (10)
// and women's friendlies (666). A row from any of them, or one whose league says "Friendly" by
// type or name, is not a meeting worth counting.
export const FRIENDLY_LEAGUE_IDS: ReadonlySet<number> = new Set([10, 666, 667]);

export type H2hSide = { id: number; name: string; goals: number | null };
export type H2hRow = {
  id: number;
  kickoff: string;
  competition: { id: number; name: string; key: CompetitionKey | null };
  status: { code: string; finished: boolean };
  home: H2hSide;
  away: H2hSide;
  penalties: { home: number | null; away: number | null } | null;
};
export type H2h = {
  fetchedAt: string;
  summary: { played: number; homeWins: number; draws: number; awayWins: number };
  matches: H2hRow[];
};
export type LastLineup = {
  fixtureId: number;
  kickoff: string;
  competition: { key: CompetitionKey; name: string };
  opponent: string;
  lineup: Lineup;
};
export type PreviewFile = {
  schema: typeof PREVIEW_SCHEMA;
  generatedAt: string;
  source: typeof SOURCE;
  match: Match;
  h2h: H2h | null;
  lastLineup: { home: LastLineup | null; away: LastLineup | null };
};

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => v && typeof v === "object" && !Array.isArray(v) ? v as Obj : null;
const list = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
const str = (v: unknown): string | null => {
  const t = typeof v === "string" ? tidy(v) : "";
  return t ? t : null;
};
function int(v: unknown): number | null {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? Math.trunc(n) : null;
}

// ---------- head to head ----------

// One row of the reply placed, or null when it cannot be: no teams, no date, no status, no league.
// `friendly` is said apart from the row so the caller can tell "they only ever met in friendlies"
// (an honest nothing) from "nothing in the reply could be read" (a failure).
function placeRow(fx: unknown, previewKey: CompetitionKey): { row: H2hRow; friendly: boolean } | null {
  const f = obj(fx);
  const fixture = obj(f?.fixture);
  const league = obj(f?.league);
  const teams = obj(f?.teams);
  const goals = obj(f?.goals);
  const id = int(fixture?.id);
  const kickoff = str(fixture?.date);
  const code = str(obj(fixture?.status)?.short);
  const leagueId = int(league?.id);
  const leagueName = str(league?.name);
  if (id === null || !kickoff || !Number.isFinite(Date.parse(kickoff)) || !code || leagueId === null || !leagueName) {
    return null;
  }
  // The WSL's " W" goes whenever the preview is a WSL one, whatever competition the row is from:
  // the same two women's sides meet in the League Cup and the FA Cup too.
  const name = (n: string) => previewKey === "wsl" ? n.replace(/\s+W$/, "") : n;
  const side = (t: unknown, g: unknown): H2hSide | null => {
    const o = obj(t);
    const tid = int(o?.id);
    const tname = str(o?.name);
    return tid === null || !tname ? null : { id: tid, name: name(tname), goals: int(g) };
  };
  const home = side(teams?.home, goals?.home);
  const away = side(teams?.away, goals?.away);
  if (!home || !away) return null;
  const pen = obj(obj(f?.score)?.penalty);
  const friendly = FRIENDLY_LEAGUE_IDS.has(leagueId) || str(league?.type) === "Friendly" ||
    /friendl/i.test(leagueName);
  return {
    friendly,
    row: {
      id,
      kickoff,
      competition: {
        id: leagueId,
        name: leagueName,
        key: COMPETITIONS.find((c) => c.leagueId === leagueId)?.key ?? null,
      },
      status: { code, finished: FINISHED_CODES.has(code) },
      home,
      away,
      penalties: int(pen?.home) === null && int(pen?.away) === null ? null : { home: int(pen?.home), away: int(pen?.away) },
    },
  };
}

// One head-to-head row for the file, or null for a row that cannot be placed or is a friendly.
export function mapH2hRow(fx: unknown, previewKey: CompetitionKey): H2hRow | null {
  const placed = placeRow(fx, previewKey);
  return placed && !placed.friendly ? placed.row : null;
}

// The h2h block for one fixture out of the raw `response` array, or null when the reply is a
// failure: a non-empty reply in which not one row could be placed is a shape we do not know, and
// caching it as "never met" would hide every meeting for a week. An empty reply is the honest
// "never met". Kept: finished, competitive meetings of exactly these two teams, the fixture itself
// left out, newest first, at most ten. The summary counts by team id from this fixture's point of
// view, wherever each meeting was played; a shootout is a draw on the score.
export function buildH2h(response: readonly unknown[], match: Match, fetchedAt: string): H2h | null {
  const key = match.competition.key;
  const placed = response.map((fx) => placeRow(fx, key));
  if (response.length > 0 && placed.every((p) => p === null)) return null;
  const pair = new Set([match.home.id, match.away.id]);
  const seen = new Set<number>();
  const rows = placed
    .flatMap((p) => p && !p.friendly ? [p.row] : [])
    .filter((r) =>
      r.status.finished && r.id !== match.id && r.home.id !== r.away.id && pair.has(r.home.id) && pair.has(r.away.id)
    )
    .filter((r) => !seen.has(r.id) && !!seen.add(r.id))
    .sort((a, b) => Date.parse(b.kickoff) - Date.parse(a.kickoff) || b.id - a.id)
    .slice(0, H2H_LAST);
  const summary = { played: rows.length, homeWins: 0, draws: 0, awayWins: 0 };
  for (const r of rows) {
    const hg = r.home.goals;
    const ag = r.away.goals;
    if (hg === null || ag === null || hg === ag) {
      summary.draws++;
      continue;
    }
    const winner = hg > ag ? r.home.id : r.away.id;
    if (winner === match.home.id) summary.homeWins++;
    else summary.awayWins++;
  }
  return { fetchedAt, summary, matches: rows };
}

// Whether a fixture's head to head should be requested this run. Not beyond 7 days (the block is
// null there). Inside them: when there is no fetched block yet; when the season listings show a
// finished meeting of the two sides that kicked off after the block was fetched (a second leg, a
// league game after a cup tie), which costs nothing to notice; and once inside 48 hours of kickoff,
// when the block is older than that mark, which also catches cup meetings outside our listings.
export function shouldFetchH2h(
  match: Match,
  previous: H2h | null,
  held: readonly Match[],
  now: Date,
): boolean {
  const kickoff = Date.parse(match.kickoff);
  if (kickoff - now.getTime() > H2H_WINDOW_MS) return false;
  const fetchedAt = Date.parse(previous?.fetchedAt ?? "");
  if (!previous || !Number.isFinite(fetchedAt)) return true;
  const pair = new Set([match.home.id, match.away.id]);
  const newer = held.some((m) =>
    m.id !== match.id && m.status.finished && pair.has(m.home.id) && pair.has(m.away.id) &&
    m.home.id !== m.away.id && Date.parse(m.kickoff) > fetchedAt
  );
  if (newer) return true;
  return kickoff - now.getTime() <= H2H_REFRESH_MS && fetchedAt < kickoff - H2H_REFRESH_MS;
}

// ---------- reading back ----------

// The h2h block of a stored preview, or null. Read leniently, but every row is rebuilt through the
// same field list, so a damaged or hand-edited file cannot carry anything else back out.
export function storedH2h(text: string | null): H2h | null {
  if (!text) return null;
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return null;
  }
  const o = obj(v);
  if (o?.schema !== PREVIEW_SCHEMA) return null;
  const h = obj(o.h2h);
  const fetchedAt = typeof h?.fetchedAt === "string" && Number.isFinite(Date.parse(h.fetchedAt)) ? h.fetchedAt : null;
  const s = obj(h?.summary);
  if (!h || !fetchedAt || !s) return null;
  const n = (x: unknown) => {
    const i = int(x);
    return i !== null && i >= 0 ? i : null;
  };
  const played = n(s.played), homeWins = n(s.homeWins), draws = n(s.draws), awayWins = n(s.awayWins);
  if (played === null || homeWins === null || draws === null || awayWins === null) return null;
  const matches: H2hRow[] = [];
  for (const raw of list(h.matches)) {
    const r = obj(raw);
    const c = obj(r?.competition);
    const st = obj(r?.status);
    const sideOf = (x: unknown): H2hSide | null => {
      const t = obj(x);
      const id = int(t?.id);
      return id !== null && typeof t?.name === "string" && t.name ? { id, name: t.name, goals: int(t.goals) } : null;
    };
    const home = sideOf(r?.home);
    const away = sideOf(r?.away);
    const id = int(r?.id);
    const cid = int(c?.id);
    if (id === null || typeof r?.kickoff !== "string" || cid === null || typeof c?.name !== "string" || !home || !away ||
      typeof st?.code !== "string") return null;
    const pen = obj(r?.penalties);
    matches.push({
      id,
      kickoff: r.kickoff,
      competition: { id: cid, name: c.name, key: COMPETITIONS.find((k) => k.key === c.key)?.key ?? null },
      status: { code: st.code, finished: FINISHED_CODES.has(st.code) },
      home,
      away,
      penalties: pen ? { home: int(pen.home), away: int(pen.away) } : null,
    });
  }
  if (matches.length !== played) return null;
  return { fetchedAt, summary: { played, homeWins, draws, awayWins }, matches };
}

// The lineup a stored match file holds for one team, by team id, exactly as the file has it. null
// for a file that is not a match file or has no lineups yet.
export function lineupFromMatchFile(text: string | null, teamId: number): Lineup | null {
  if (!text) return null;
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return null;
  }
  const o = obj(v);
  const m = obj(o?.match);
  const l = obj(o?.lineups);
  if (o?.schema !== "archv-match/1" || !m || !l) return null;
  const side = int(obj(m.home)?.id) === teamId ? "home" : int(obj(m.away)?.id) === teamId ? "away" : null;
  const lineup = side ? obj(l[side]) : null;
  return lineup && Array.isArray(lineup.startXI) && lineup.startXI.length ? lineup as unknown as Lineup : null;
}

// The earlier finished matches of one team that its last lineup is looked for in: before this
// fixture, newest first, at most three. Only our three competitions are in the listings, so a cup
// tie in between is not one of them, and the label the app shows names the date and competition.
export function lineupCandidates(match: Match, teamId: number, held: readonly Match[]): Match[] {
  const before = Date.parse(match.kickoff);
  return held
    .filter((m) =>
      m.id !== match.id && m.status.finished && (m.home.id === teamId || m.away.id === teamId) &&
      Date.parse(m.kickoff) < before
    )
    .sort((a, b) => Date.parse(b.kickoff) - Date.parse(a.kickoff) || b.id - a.id)
    .slice(0, LINEUP_TRIES);
}

export function lastLineupOf(from: Match, teamId: number, lineup: Lineup): LastLineup {
  const opponent = from.home.id === teamId ? from.away.name : from.home.name;
  return {
    fixtureId: from.id,
    kickoff: from.kickoff,
    competition: { key: from.competition.key, name: from.competition.name },
    opponent,
    lineup,
  };
}

export function buildPreview(
  match: Match,
  h2h: H2h | null,
  lastLineup: PreviewFile["lastLineup"],
  generatedAt: string,
): PreviewFile {
  return { schema: PREVIEW_SCHEMA, generatedAt, source: SOURCE, match, h2h, lastLineup };
}
