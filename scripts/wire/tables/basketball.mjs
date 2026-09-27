/* basketball.mjs: NBA and WNBA record tables and recent results from BALLDONTLIE (free key,
   commercial use allowed, no attribution required; shown as a courtesy). The free tier has no
   standings endpoint, so The ARCHV computes W, L, Pct and games behind by conference from final
   regular-season games, and labels the table as records, not official standings.
   Needs BALLDONTLIE_API_KEY; without it the module logs and skips. Free tier: 5 requests a
   minute, so requests are spaced 13 s apart and pagination is capped at 40 pages.
   The two leagues' game shapes differ, per BALLDONTLIE's docs (docs.balldontlie.io and
   wnba.balldontlie.io, read 2026-09-27): NBA /v1 has `status: "Final"`, `home_team_score`,
   `visitor_team_score`, a date-only `date` and conferences "East"/"West"; WNBA has `status: "post"`
   with `status_state: "final"`, `home_score`/`away_score`, `date` as a UTC instant and conferences
   "Eastern Conference"/"Western Conference". Both carry `status_state` and `postseason`.
   Records count final regular-season games only (no postseason, no NBA Cup Championship, which
   is outside the standings); "latest results" takes every final game, playoffs included, on the
   newest New York calendar day. */
import { pct } from "./common.mjs";
import { dateInZone } from "../lib/time.mjs";

const SOURCE = { name: "BALLDONTLIE", attribution: "Data: BALLDONTLIE. Records computed by The ARCHV; not official standings.", url: "https://www.balldontlie.io/", licence: null, licenceUrl: null, adapted: true };
const COLUMNS = [
  { key: "team", label: "Team", labelKey: "tables.col.team", align: "start" },
  { key: "w", label: "W", labelKey: "tables.col.won", align: "end" },
  { key: "l", label: "L", labelKey: "tables.col.lost", align: "end" },
  { key: "pct", label: "Pct", labelKey: "tables.col.pct", align: "end" },
  { key: "gb", label: "GB", labelKey: "tables.col.games_behind", align: "end" },
];
const LEAGUES = [
  // maxGames: a team past it means a non-regular game (a play-in, say) was counted; refuse the table.
  { key: "nba", label: "NBA", base: "https://api.balldontlie.io/v1", season: (t) => (+t.slice(5, 7) >= 10 ? +t.slice(0, 4) : +t.slice(0, 4) - 1), maxGames: 82, offseasonText: "The NBA regular season has not started yet." },
  { key: "wnba", label: "WNBA", base: "https://api.balldontlie.io/wnba/v1", season: (t) => +t.slice(0, 4), offseasonText: "The WNBA regular season has not started yet." },
];
const MAX_PAGES = 40;

const isFinal = (g) => (g.status_state ? g.status_state === "final" : /final/i.test(g.status || ""));
const regular = (g) => isFinal(g) && !g.postseason && g.ist_stage !== "Championship";
const away = (g) => g.visitor_team || g.away_team;
const homeScore = (g) => g.home_team_score ?? g.home_score;
const awayScore = (g) => g.visitor_team_score ?? g.away_team_score ?? g.away_score;
// The game's calendar day in New York: NBA `date` is already a day; WNBA `date` is a UTC instant.
const gameDay = (g) => (/^\d{4}-\d{2}-\d{2}$/.test(String(g.date)) ? g.date : dateInZone(Date.parse(g.date), "America/New_York"));
const conferenceName = (c) => (/Conference$/.test(c) ? c : `${c}ern Conference`.replace("ernern", "ern"));
const winPct = (r) => (r.w + r.l ? r.w / (r.w + r.l) : 0);

export function records(teams, games, maxGames = null) {
  const rec = new Map(teams.map((t) => [t.id, { t, w: 0, l: 0 }]));
  const counted = games.filter(regular);
  for (const g of counted) {
    const h = rec.get(g.home_team?.id), a = rec.get(away(g)?.id);
    if (!h || !a) continue;
    if (homeScore(g) > awayScore(g)) { h.w++; a.l++; } else { a.w++; h.l++; }
  }
  const rows = [];
  const confs = [...new Set(teams.map((t) => t.conference).filter(Boolean))].sort();
  for (const conf of confs) {
    // Ordered by win percentage; games behind is measured from the best W-L differential, so it
    // is never negative.
    const list = [...rec.values()].filter((r) => r.t.conference === conf)
      .sort((x, y) => winPct(y) - winPct(x) || (y.w - y.l) - (x.w - x.l) || y.w - x.w || x.t.full_name.localeCompare(y.t.full_name));
    const lead = list.reduce((best, r) => ((r.w - r.l) > (best.w - best.l) ? r : best), list[0]);
    for (const r of list) {
      const gb = ((lead.w - r.w) + (r.l - lead.l)) / 2;
      rows.push({ name: r.t.full_name || r.t.name, short: r.t.abbreviation, group: conferenceName(conf), cells: { w: r.w, l: r.l, pct: pct(r.w, r.l), gb: gb === 0 ? "-" : gb.toFixed(1) } });
    }
  }
  const sum = [...rec.values()].reduce((s, r) => s + r.w + r.l, 0);
  if (sum !== counted.length * 2) return { rows, why: "w-plus-l-mismatch" };
  if (maxGames && [...rec.values()].some((r) => r.w + r.l > maxGames)) return { rows, why: "games-exceed-season" };
  return { rows, why: null };
}

export async function run({ get, today, env, pause = 13000 }) {
  const key = env.BALLDONTLIE_API_KEY;
  if (!key) {
    console.log("[tables:basketball] BALLDONTLIE_API_KEY not set: skipping basketball tables");
    return { blocks: [], failed: {}, skipped: "key-absent" };
  }
  const headers = { Authorization: key };
  const wait = () => new Promise((r) => setTimeout(r, pause));
  const blocks = [], failed = {};
  for (const lg of LEAGUES) {
    const season = lg.season(today);
    const t = await get(`${lg.base}/teams`, { headers, offlineName: `balldontlie-${lg.key}-teams.json` });
    if (!t.ok) { failed[`${lg.key}-table`] = `fetch-failed:${t.status}`; failed[`${lg.key}-games`] = `fetch-failed:${t.status}`; continue; }
    const teams = (t.json.data || []).filter((x) => x.conference && x.full_name);
    const games = [];
    let cursor = null, pages = 0, ok = true;
    do {
      await wait();
      const q = `${lg.base}/games?seasons[]=${season}&per_page=100${cursor ? `&cursor=${cursor}` : ""}`;
      const g = await get(q, { headers, offlineName: `balldontlie-${lg.key}-games-${pages}.json` });
      if (!g.ok) { ok = false; failed[`${lg.key}-table`] = `fetch-failed:${g.status}`; break; }
      games.push(...(g.json.data || []));
      cursor = g.json.meta?.next_cursor ?? null;
      pages++;
    } while (cursor && pages < MAX_PAGES);
    if (!ok) continue;
    const played = games.filter(regular);
    if (!played.length) {
      blocks.push({ id: `${lg.key}-table`, kind: "standings", league: lg.key, title: `${lg.label} records`, asOf: today, columns: COLUMNS, rows: [], source: SOURCE, emptyText: lg.offseasonText });
      continue;
    }
    const { rows, why } = records(teams, games, lg.maxGames);
    const through = played.map(gameDay).sort().pop();
    if (why) failed[`${lg.key}-table`] = why;
    else blocks.push({ id: `${lg.key}-table`, kind: "standings", league: lg.key, title: `${lg.label} records`, asOf: today, through, compactRows: 3, columns: COLUMNS, rows, source: SOURCE, emptyText: null });
    const finals = games.filter(isFinal);
    const lastDay = finals.map(gameDay).sort().pop();
    const results = finals.filter((g) => gameDay(g) === lastDay).map((g) => ({ date: lastDay, home: g.home_team.full_name, away: away(g).full_name, homeScore: homeScore(g), awayScore: awayScore(g), competition: lg.label, round: g.postseason ? "Playoffs" : null }));
    blocks.push({ id: `${lg.key}-games`, kind: "results", league: lg.key, title: `${lg.label}: latest results`, asOf: today, through: lastDay, rows: results, source: SOURCE, emptyText: null });
  }
  return { blocks, failed };
}
