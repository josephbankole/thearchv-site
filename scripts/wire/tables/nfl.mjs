/* nfl.mjs: NFL standings (computed), next week's games and last completed week's results from
   nflverse's schedules release (CC BY 4.0, no key). Only the columns named below are read, so
   the file's moneyline, spread and odds columns never enter the pipeline. Standings are W-L-T
   records by division, not official seeding with tiebreaks, and the attribution says so. */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv, pct } from "./common.mjs";
import { wallToUtc } from "../lib/time.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const TEAMS = JSON.parse(readFileSync(join(HERE, "..", "data", "nfl-teams.json"), "utf8"));
const URL_CSV = "https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv";
const SOURCE = { name: "nflverse", attribution: "Data: nflverse. Standings computed by The ARCHV.", url: "https://github.com/nflverse/nflverse-data", licence: "CC BY 4.0", licenceUrl: "https://creativecommons.org/licenses/by/4.0/", adapted: true };
const COLUMNS = [
  { key: "team", label: "Team", labelKey: "tables.col.team", align: "start" },
  { key: "w", label: "W", labelKey: "tables.col.won", align: "end" },
  { key: "l", label: "L", labelKey: "tables.col.lost", align: "end" },
  { key: "t", label: "T", labelKey: "tables.col.tied", align: "end" },
  { key: "pct", label: "Pct", labelKey: "tables.col.pct", align: "end" },
];
const KEEP = ["season", "game_type", "week", "gameday", "gametime", "away_team", "away_score", "home_team", "home_score"];
const name = (abbr) => TEAMS.teams[abbr]?.[0] || abbr;

export const nflSeason = (today) => { const y = +today.slice(0, 4), m = +today.slice(5, 7); return m >= 3 ? y : y - 1; };

export function compute(csvText, today) {
  const season = String(nflSeason(today));
  const games = parseCsv(csvText)
    .map((r) => Object.fromEntries(KEEP.map((k) => [k, r[k]])))
    .filter((g) => g.season === season && g.game_type === "REG");
  const played = games.filter((g) => g.home_score !== "" && g.away_score !== "" && g.home_score !== "NA");
  const rec = Object.fromEntries(Object.keys(TEAMS.teams).map((a) => [a, { w: 0, l: 0, t: 0 }]));
  for (const g of played) {
    const hs = +g.home_score, as = +g.away_score;
    if (!rec[g.home_team] || !rec[g.away_team]) continue;
    if (hs > as) { rec[g.home_team].w++; rec[g.away_team].l++; }
    else if (hs < as) { rec[g.away_team].w++; rec[g.home_team].l++; }
    else { rec[g.home_team].t++; rec[g.away_team].t++; }
  }
  const rows = [];
  for (const div of TEAMS.divisionOrder) {
    const teams = Object.keys(TEAMS.teams).filter((a) => TEAMS.teams[a][2] === div)
      .map((a) => ({ a, ...rec[a], p: (rec[a].w + rec[a].t / 2) / Math.max(1, rec[a].w + rec[a].l + rec[a].t) }))
      .sort((x, y) => y.p - x.p || y.w - x.w || name(x.a).localeCompare(name(y.a)));
    for (const t of teams) rows.push({ name: name(t.a), group: div, cells: { w: t.w, l: t.l, t: t.t, pct: pct(t.w, t.l, t.t) } });
  }
  const kickoff = (g) => {
    if (!g.gametime) return null;
    const [y, mo, d] = g.gameday.split("-").map(Number), [h, mi] = g.gametime.split(":").map(Number);
    return new Date(wallToUtc(y, mo - 1, d, h, mi, 0, "America/New_York")).toISOString();
  };
  const fx = (g) => ({ date: g.gameday, kickoff: kickoff(g), home: name(g.home_team), away: name(g.away_team), competition: "NFL", round: `Week ${+g.week}` });
  // The last COMPLETED week: every game of it has a score. A week in progress stays in "next".
  const weeks = [...new Set(games.map((g) => +g.week))].sort((a, b) => a - b);
  const complete = weeks.filter((w) => games.filter((g) => +g.week === w).every((g) => played.includes(g)));
  const lastWeek = complete.length ? complete[complete.length - 1] : null;
  const results = lastWeek ? played.filter((g) => +g.week === lastWeek).sort((a, b) => (a.gameday + a.gametime).localeCompare(b.gameday + b.gametime)).map((g) => ({ ...fx(g), homeScore: +g.home_score, awayScore: +g.away_score })) : [];
  const upcoming = games.filter((g) => !played.includes(g) && g.gameday >= today).sort((a, b) => (a.gameday + a.gametime).localeCompare(b.gameday + b.gametime));
  const nextWeek = upcoming.length ? +upcoming[0].week : null;
  const next = nextWeek ? upcoming.filter((g) => +g.week === nextWeek).map(fx) : [];
  const asOf = played.map((g) => g.gameday).sort().pop() || today;
  // Sanity: a full regular season, and no team with more games than weeks played.
  let why = null;
  if (games.length !== 272) why = `regular-season rows ${games.length} != 272`;
  else if (played.length && Object.values(rec).some((r) => r.w + r.l + r.t > Math.max(...played.map((g) => +g.week)))) why = "games-exceed-weeks";
  return { rows, results, next, asOf, lastWeek, nextWeek, why };
}

export async function run({ get, today }) {
  const r = await get(URL_CSV, { offlineName: "nflverse-games.csv", text: true });
  const ids = ["nfl-standings", "nfl-week", "nfl-results"];
  if (!r.ok) return { blocks: [], failed: Object.fromEntries(ids.map((i) => [i, `fetch-failed:${r.status}`])) };
  const c = compute(r.body, today);
  if (c.why) return { blocks: [], failed: Object.fromEntries(ids.map((i) => [i, c.why])) };
  const blocks = [
    { id: "nfl-standings", kind: "standings", league: "nfl", title: "NFL standings", asOf: c.asOf, compactRows: 1, columns: COLUMNS, rows: c.rows, source: SOURCE, emptyText: null },
    { id: "nfl-week", kind: "fixtures", league: "nfl", title: c.nextWeek ? `NFL: week ${c.nextWeek}` : "NFL: next games", asOf: today, rows: c.next, source: SOURCE, emptyText: "No games scheduled." },
  ];
  if (c.results.length) blocks.push({ id: "nfl-results", kind: "results", league: "nfl", title: `NFL: week ${c.lastWeek} results`, asOf: c.asOf, rows: c.results, source: SOURCE, emptyText: null });
  return { blocks, failed: {} };
}
