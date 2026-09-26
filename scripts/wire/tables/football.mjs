/* football.mjs: the Premier League table and Manchester United's fixtures and results.
   Primary when FOOTBALL_DATA_TOKEN is set: football-data.org v4 (attribution required word for
   word, clause 7.1). Otherwise openfootball (CC0), from which The ARCHV computes the table.
   No crest, emblem or logo field is ever read. */
import { wallToUtc } from "../lib/time.mjs";

const UNITED = "Manchester United FC";
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
};
export const shortName = (n) => SHORT[n] || n.replace(/^AFC\s+/, "").replace(/\s+(A?FC)$/, "");
const SEASON = (today) => { const y = +today.slice(0, 4), m = +today.slice(5, 7); const s = m >= 7 ? y : y - 1; return `${s}-${String((s + 1) % 100).padStart(2, "0")}`; };

export function sanityTable(rows) {
  if (rows.length !== 20) return `row-count ${rows.length} != 20`;
  const bad = rows.find((r) => r._w * 3 + r._d !== r.cells.pts);
  if (bad) return `points mismatch for ${bad.name}`;
  if (!rows.some((r) => r.name === UNITED || /manchester united/i.test(r.name))) return "united-missing";
  const played = rows.map((r) => r.cells.p);
  if (Math.max(...played) - Math.min(...played) > 2) return "played-spread";
  return null;
}

const strip = (rows) => rows.map(({ _w, _d, ...r }) => r);

/* ---------- openfootball ---------- */
export function fromOpenfootball(json, today) {
  const teams = new Map();
  const team = (n) => { if (!teams.has(n)) teams.set(n, { name: n, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 }); return teams.get(n); };
  let asOf = null;
  const united = [];
  for (const m of json.matches || []) {
    team(m.team1); team(m.team2);
    const ft = m.score?.ft;
    if (m.team1 === UNITED || m.team2 === UNITED) united.push(m);
    if (!Array.isArray(ft)) continue;
    const [a, b] = ft;
    const h = team(m.team1), aw = team(m.team2);
    h.p++; aw.p++; h.gf += a; h.ga += b; aw.gf += b; aw.ga += a;
    if (a > b) { h.w++; aw.l++; } else if (a < b) { aw.w++; h.l++; } else { h.d++; aw.d++; }
    if (!asOf || m.date > asOf) asOf = m.date;
  }
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
  const next = united.filter((m) => !Array.isArray(m.score?.ft) && m.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3).map(fx);
  const last = united.filter((m) => Array.isArray(m.score?.ft)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3)
    .map((m) => ({ ...fx(m), homeScore: m.score.ft[0], awayScore: m.score.ft[1] }));
  return { rows, next, last, asOf };
}

/* ---------- football-data.org ---------- */
export function fromFootballData(standingsJson, matchesJson, today) {
  const table = (standingsJson.standings || []).find((s) => s.type === "TOTAL")?.table || [];
  const rows = table.map((r) => {
    const name = r.team?.name || "";
    return { name, short: r.team?.shortName || shortName(name), group: null, ...(r.team?.id === 66 ? { highlight: true } : {}), cells: { pos: r.position, p: r.playedGames, gd: r.goalDifference, pts: r.points }, _w: r.won, _d: r.draw };
  });
  const ms = matchesJson.matches || [];
  const fx = (m) => ({ date: m.utcDate.slice(0, 10), kickoff: m.utcDate, home: m.homeTeam?.shortName || m.homeTeam?.name || "", away: m.awayTeam?.shortName || m.awayTeam?.name || "", competition: m.competition?.name || null, round: m.matchday ? `Matchday ${m.matchday}` : null });
  const next = ms.filter((m) => ["SCHEDULED", "TIMED"].includes(m.status) && m.utcDate.slice(0, 10) >= today).sort((a, b) => a.utcDate.localeCompare(b.utcDate)).slice(0, 3).map(fx);
  const last = ms.filter((m) => m.status === "FINISHED").sort((a, b) => b.utcDate.localeCompare(a.utcDate)).slice(0, 3)
    .map((m) => ({ ...fx(m), homeScore: m.score?.fullTime?.home, awayScore: m.score?.fullTime?.away }));
  const asOf = ms.filter((m) => m.status === "FINISHED").map((m) => m.utcDate.slice(0, 10)).sort().pop() || today;
  return { rows, next, last, asOf };
}

function blocks({ rows, next, last, asOf }, source, today) {
  const failed = {};
  const out = [];
  const why = sanityTable(rows);
  if (why) failed["pl-table"] = why;
  else out.push({ id: "pl-table", kind: "standings", league: "premier-league", title: "Premier League table", asOf, compactRows: 6, columns: COLUMNS, rows: strip(rows), source, emptyText: null });
  out.push({ id: "mu-next", kind: "fixtures", title: "Manchester United: next", asOf: today, rows: next, source, emptyText: "No fixture listed yet." });
  if (last.length) out.push({ id: "mu-results", kind: "results", title: "Manchester United: results", asOf, rows: last, source, emptyText: null });
  else failed["mu-results"] = "no-results";
  return { blocks: out, failed };
}

export async function run({ get, today, env }) {
  const token = env.FOOTBALL_DATA_TOKEN;
  if (token) {
    const headers = { "X-Auth-Token": token };
    const s = await get("https://api.football-data.org/v4/competitions/PL/standings", { headers, offlineName: "football-data-standings.json" });
    const m = await get(`https://api.football-data.org/v4/teams/66/matches?season=${SEASON(today).slice(0, 4)}`, { headers, offlineName: "football-data-matches.json" });
    if (s.ok && m.ok) return { provider: "football-data.org", ...blocks(fromFootballData(s.json, m.json, today), FD_ATTR, today) };
    console.log(`[tables:football] football-data.org failed (${s.status}/${m.status}); falling back to openfootball`);
  } else {
    console.log("[tables:football] FOOTBALL_DATA_TOKEN not set: skipping football-data.org, using openfootball (CC0)");
  }
  const url = `https://raw.githubusercontent.com/openfootball/football.json/master/${SEASON(today)}/en.1.json`;
  const r = await get(url, { offlineName: "openfootball-en1.json" });
  if (!r.ok) return { provider: "none", blocks: [], failed: { "pl-table": `fetch-failed:${r.status}`, "mu-next": `fetch-failed:${r.status}`, "mu-results": `fetch-failed:${r.status}` } };
  return { provider: "openfootball", ...blocks(fromOpenfootball(r.json, today), OF_ATTR, today) };
}
