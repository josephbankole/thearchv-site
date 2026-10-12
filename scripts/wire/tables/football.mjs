/* football.mjs: the Premier League table, the Champions League league phase and Manchester
   United's fixtures and results.
   Primary when FOOTBALL_DATA_TOKEN is set: football-data.org v4 (attribution required word for
   word, clause 7.1), which covers the PL and the CL. Otherwise openfootball (CC0), from which The
   ARCHV computes the PL table; it has no Champions League. No crest, emblem or logo field is ever read. */
import { wallToUtc } from "../lib/time.mjs";
import { daysBetween } from "../lib/schema.mjs";

const UNITED = "Manchester United FC";
const UNITED_ID = 66;
const FD_ATTR = { name: "football-data.org", attribution: "Football data provided by the Football-Data.org API", url: "https://www.football-data.org/", licence: null, licenceUrl: null, adapted: false };
const OF_ATTR = { name: "openfootball", attribution: "Fixtures and results: openfootball. Table computed by The ARCHV.", url: "https://github.com/openfootball/football.json", licence: "CC0 1.0", licenceUrl: "https://creativecommons.org/publicdomain/zero/1.0/", adapted: true };
const COLUMNS = [
  { key: "pos", label: "#", labelKey: "tables.col.position", align: "end" },
  { key: "team", label: "Team", labelKey: "tables.col.team", align: "start" },
  { key: "p", label: "P", labelKey: "tables.col.played", align: "end" },
  { key: "gd", label: "GD", labelKey: "tables.col.goal_difference", align: "end" },
  { key: "pts", label: "Pts", labelKey: "tables.col.points", align: "end" },
];
const SHORT = {
  "Manchester United FC": "Man Utd", "Manchester City FC": "Man City", "Tottenham Hotspur FC": "Spurs",
  "Wolverhampton Wanderers FC": "Wolves", "Brighton & Hove Albion FC": "Brighton", "Nottingham Forest FC": "Nott'm Forest",
  "West Ham United FC": "West Ham", "Newcastle United FC": "Newcastle", "Leeds United FC": "Leeds", "AFC Bournemouth": "Bournemouth",
  "Crystal Palace FC": "Palace", "Coventry City FC": "Coventry", "Sheffield United FC": "Sheff Utd", "Leicester City FC": "Leicester",
  "FK Shakhtar Donetsk": "Shakhtar", "Como 1907": "Como", "PAE AEK": "AEK Athens", "Sabah FK": "Sabah",
  "\u0160K Slovan Bratislava": "Slovan Bratislava",
};
export const shortName = (n) => SHORT[n] || n.replace(/^AFC\s+/, "").replace(/\s+(A?FC)$/, "");
const SEASON = (today) => { const y = +today.slice(0, 4), m = +today.slice(5, 7); const s = m >= 7 ? y : y - 1; return `${s}-${String((s + 1) % 100).padStart(2, "0")}`; };
// openfootball is stale when this many matches after its newest result are a week overdue: one
// postponement is not a dead source, half a round is.
const STALE_OVERDUE = 5, STALE_DAYS = 7;
// Feed order. mergeSport puts held blocks after fresh ones; fetch-tables restores this order.
export const ORDER = ["pl-table", "ucl-table", "mu-next", "mu-results"];

export function sanityTable(rows) {
  if (rows.length !== 20) return `row-count ${rows.length} != 20`;
  const bad = rows.find((r) => r._w * 3 + r._d !== r.cells.pts);
  if (bad) return `points mismatch for ${bad.name}`;
  if (!rows.some((r) => r.name === UNITED || /manchester united/i.test(r.name))) return "united-missing";
  const played = rows.map((r) => r.cells.p);
  if (Math.max(...played) - Math.min(...played) > 2) return "played-spread";
  return null;
}

// The CL league phase: 36 clubs, the top 8 straight to the round of 16. United need not be in it.
export function sanityLeaguePhase(rows) {
  if (rows.length !== 36) return `row-count ${rows.length} != 36`;
  const bad = rows.find((r) => r._w * 3 + r._d !== r.cells.pts);
  if (bad) return `points mismatch for ${bad.name}`;
  const played = rows.map((r) => r.cells.p);
  if (Math.max(...played) - Math.min(...played) > 2) return "played-spread";
  return null;
}

const strip = (rows) => rows.map(({ _w, _d, ...r }) => r);

/* ---------- openfootball ---------- */
// Full time is { ft: [h, a] } for most results, but openfootball writes a 0-0 as a bare [0, 0].
const fullTime = (m) => (Array.isArray(m.score) ? m.score : m.score?.ft);

export function fromOpenfootball(json, today) {
  const teams = new Map();
  const team = (n) => { if (!teams.has(n)) teams.set(n, { name: n, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 }); return teams.get(n); };
  let through = null;
  const united = [];
  for (const m of json.matches || []) {
    team(m.team1); team(m.team2);
    const ft = fullTime(m);
    if (m.team1 === UNITED || m.team2 === UNITED) united.push(m);
    if (!Array.isArray(ft)) continue;
    const [a, b] = ft;
    const h = team(m.team1), aw = team(m.team2);
    h.p++; aw.p++; h.gf += a; h.ga += b; aw.gf += b; aw.ga += a;
    if (a > b) { h.w++; aw.l++; } else if (a < b) { aw.w++; h.l++; } else { h.d++; aw.d++; }
    if (!through || m.date > through) through = m.date;
  }
  // The source can stop updating mid-season: matches after the newest result, a week gone, unscored.
  const overdue = (json.matches || []).filter((m) => !Array.isArray(fullTime(m)) && (!through || m.date > through) && daysBetween(m.date, today) >= STALE_DAYS).length;
  const rows = [...teams.values()]
    .map((t) => ({ ...t, pts: t.w * 3 + t.d, gd: t.gf - t.ga }))
    .sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || x.name.localeCompare(y.name))
    .map((t, i) => ({ name: t.name, short: shortName(t.name), group: null, ...(t.name === UNITED ? { highlight: true } : {}), cells: { pos: i + 1, p: t.p, gd: t.gd, pts: t.pts }, _w: t.w, _d: t.d }));
  const kickoff = (m) => {
    if (!m.time) return null;
    const [y, mo, d] = m.date.split("-").map(Number), [h, mi] = m.time.split(":").map(Number);
    return new Date(wallToUtc(y, mo - 1, d, h, mi, 0, "Europe/London")).toISOString();
  };
  const fx = (m) => ({ date: m.date, kickoff: kickoff(m), home: shortName(m.team1), away: shortName(m.team2), competition: "Premier League", round: m.round || null });
  const next = united.filter((m) => !Array.isArray(fullTime(m)) && m.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3).map(fx);
  const last = united.filter((m) => Array.isArray(fullTime(m))).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3)
    .map((m) => ({ ...fx(m), homeScore: fullTime(m)[0], awayScore: fullTime(m)[1] }));
  return { rows, next, last, through, overdue };
}

/* ---------- football-data.org ---------- */
// Display names: ours first ("Man Utd", not "Man United"), then football-data's, then the full name
// trimmed. The full name stays in row.name.
const fdShort = (t) => SHORT[t?.name] || t?.shortName || shortName(t?.name || "");
const fdRow = (r) => ({ name: r.team?.name || "", short: fdShort(r.team), group: null, ...(r.team?.id === UNITED_ID ? { highlight: true } : {}), cells: { pos: r.position, p: r.playedGames, gd: r.goalDifference, pts: r.points }, _w: r.won, _d: r.draw });

const COMPETITION = { PL: "Premier League", CL: "Champions League" };
const CL_STAGE = { PLAYOFFS: "Knockout play-off", LAST_16: "Round of 16", QUARTER_FINALS: "Quarter-final", SEMI_FINALS: "Semi-final", FINAL: "Final" };
export const fdCompetition = (m) => COMPETITION[m.competition?.code] || m.competition?.name || null;
export function fdRound(m) {
  const md = m.matchday ? `Matchday ${m.matchday}` : null;
  if (m.competition?.code !== "CL") return md;
  if (m.stage === "LEAGUE_STAGE") return m.matchday ? `League phase, matchday ${m.matchday}` : "League phase";
  return CL_STAGE[m.stage] || md;
}
// After a shoot-out fullTime can carry the penalties; the score is the one after extra time.
export function fdScore(s) {
  const rt = s?.regularTime;
  if (s?.duration === "PENALTY_SHOOTOUT" && Number.isFinite(rt?.home) && Number.isFinite(rt?.away)) return [rt.home + (s.extraTime?.home ?? 0), rt.away + (s.extraTime?.away ?? 0)];
  return [s?.fullTime?.home, s?.fullTime?.away];
}

export function fromFootballData(standingsJson, matchesJson, today) {
  const table = (standingsJson.standings || []).find((s) => s.type === "TOTAL")?.table || [];
  const rows = table.map(fdRow);
  const ms = (matchesJson.matches || []).filter((m) => typeof m.utcDate === "string");
  const fx = (m) => ({ date: m.utcDate.slice(0, 10), kickoff: m.utcDate, home: fdShort(m.homeTeam), away: fdShort(m.awayTeam), competition: fdCompetition(m), round: fdRound(m) });
  // Next: dated and still to play (a POSTPONED or SUSPENDED match has no date worth showing).
  // Results: FINISHED, or AWARDED, and only with a full score.
  const next = ms.filter((m) => ["SCHEDULED", "TIMED"].includes(m.status) && m.utcDate.slice(0, 10) >= today).sort((a, b) => a.utcDate.localeCompare(b.utcDate)).slice(0, 3).map(fx);
  const last = ms.filter((m) => ["FINISHED", "AWARDED"].includes(m.status) && fdScore(m.score).every(Number.isFinite)).sort((a, b) => b.utcDate.localeCompare(a.utcDate)).slice(0, 3)
    .map((m) => { const [homeScore, awayScore] = fdScore(m.score); return { ...fx(m), homeScore, awayScore }; });
  // The standings carry no date of their own; they are live, so the fetch day (asOf) is their date.
  // United's matches (every competition) never label the league table.
  return { rows, next, last, through: null };
}

// { block } or { failed }. Summer and qualifying have no league phase, and last season's table is
// not this season's.
export function fromFootballDataCl(json, today) {
  const season = json.season?.startDate?.slice(0, 4);
  const table = (json.standings || []).find((s) => s.stage === "LEAGUE_STAGE" && s.type === "TOTAL")?.table;
  if (!table?.length || (season && season !== SEASON(today).slice(0, 4))) return { failed: "no-league-phase" };
  const rows = table.map(fdRow);
  const why = sanityLeaguePhase(rows);
  if (why) return { failed: why };
  const n = rows[0].cells.p;
  const throughLabel = n > 0 && rows.every((r) => r.cells.p === n) ? `After matchday ${n}` : null;
  return { block: { id: "ucl-table", kind: "standings", league: "champions-league", title: "Champions League: league phase", asOf: today, through: null, throughLabel, compactRows: 8, columns: COLUMNS, rows: strip(rows), source: FD_ATTR, emptyText: null } };
}

function blocks({ rows, next, last, through }, source, today, { ucl = null, stale = null } = {}) {
  const failed = {};
  const out = [];
  const why = stale || sanityTable(rows);
  if (why) failed["pl-table"] = why;
  else out.push({ id: "pl-table", kind: "standings", league: "premier-league", title: "Premier League table", asOf: today, through, compactRows: 6, columns: COLUMNS, rows: strip(rows), source, emptyText: null });
  if (ucl?.block) out.push(ucl.block);
  else if (ucl?.failed) failed["ucl-table"] = ucl.failed;
  // Fixtures still to come stay good from a stale source; its results and table do not.
  out.push({ id: "mu-next", kind: "fixtures", title: "Manchester United: next", asOf: today, rows: next, source, emptyText: "No fixture listed yet." });
  if (stale) failed["mu-results"] = stale;
  else if (last.length) out.push({ id: "mu-results", kind: "results", title: "Manchester United: results", asOf: today, through: last[0]?.date ?? null, rows: last, source, emptyText: null });
  else failed["mu-results"] = "no-results";
  return { blocks: out, failed };
}

// A body that is JSON but not the expected shape fails its own blocks; it never throws out of run(),
// which would hold every football block, good ones included.
const read = (what, fn) => {
  try { return fn(); } catch (err) { console.log(`[tables:football] ${what} unreadable (${err.message})`); return null; }
};

export async function run({ get, today, env }) {
  const token = env.FOOTBALL_DATA_TOKEN;
  let ucl;
  if (token) {
    const headers = { "X-Auth-Token": token };
    const s = await get("https://api.football-data.org/v4/competitions/PL/standings", { headers, offlineName: "football-data-standings.json" });
    const m = await get(`https://api.football-data.org/v4/teams/66/matches?season=${SEASON(today).slice(0, 4)}`, { headers, offlineName: "football-data-matches.json" });
    // The CL table is its own block: a failure here holds ucl-table and nothing else.
    const c = await get("https://api.football-data.org/v4/competitions/CL/standings", { headers, offlineName: "football-data-cl-standings.json" });
    ucl = c.ok ? (read("Champions League standings", () => fromFootballDataCl(c.json, today)) || { failed: "parse-error" }) : { failed: `fetch-failed:${c.status}` };
    if (ucl.failed) console.log(`[tables:football] Champions League table not refreshed (${ucl.failed}); ucl-table holds`);
    const fd = s.ok && m.ok ? read("football-data.org", () => blocks(fromFootballData(s.json, m.json, today), FD_ATTR, today, { ucl })) : null;
    if (fd) return { provider: "football-data.org", ...fd };
    console.log(`[tables:football] football-data.org failed (${s.ok && m.ok ? "parse-error" : `${s.status}/${m.status}`}); falling back to openfootball`);
  } else {
    console.log("[tables:football] FOOTBALL_DATA_TOKEN not set: skipping football-data.org, using openfootball (CC0)");
    ucl = { failed: "no-token" };
  }
  const none = (f) => ({ provider: "none", blocks: ucl.block ? [ucl.block] : [], failed: { "pl-table": f, ...(ucl.failed ? { "ucl-table": ucl.failed } : {}), "mu-next": f, "mu-results": f } });
  const url = `https://raw.githubusercontent.com/openfootball/football.json/master/${SEASON(today)}/en.1.json`;
  const r = await get(url, { offlineName: "openfootball-en1.json" });
  if (!r.ok) return none(`fetch-failed:${r.status}`);
  const of = read("openfootball", () => fromOpenfootball(r.json, today));
  if (!of) return none("parse-error");
  let stale = null;
  if (of.overdue >= STALE_OVERDUE) {
    stale = "source-stale";
    console.log(`[tables:football] openfootball looks stale: newest result ${of.through ?? "none"}, ${of.overdue} matches overdue`);
  }
  return { provider: "openfootball", ...blocks(of, OF_ATTR, today, { ucl, stale }) };
}
