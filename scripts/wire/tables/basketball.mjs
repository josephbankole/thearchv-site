/* basketball.mjs: NBA and WNBA record tables and recent results from BALLDONTLIE (free key,
   commercial use allowed, no attribution required; shown as a courtesy). The free tier has no
   standings endpoint, so The ARCHV computes W, L, Pct and games behind by conference from final
   regular-season games, and labels the table as records, not official standings.
   Needs BALLDONTLIE_API_KEY; without it the module logs and skips. Free tier: 5 requests a
   minute, so requests are spaced 13 s apart and pagination is capped at 40 pages. */
import { pct } from "./common.mjs";

const SOURCE = { name: "BALLDONTLIE", attribution: "Data: BALLDONTLIE. Records computed by The ARCHV; not official standings.", url: "https://www.balldontlie.io/", licence: null, licenceUrl: null, adapted: true };
const COLUMNS = [
  { key: "team", label: "Team", labelKey: "tables.col.team", align: "start" },
  { key: "w", label: "W", labelKey: "tables.col.won", align: "end" },
  { key: "l", label: "L", labelKey: "tables.col.lost", align: "end" },
  { key: "pct", label: "Pct", labelKey: "tables.col.pct", align: "end" },
  { key: "gb", label: "GB", labelKey: "tables.col.games_behind", align: "end" },
];
const LEAGUES = [
  { key: "nba", label: "NBA", base: "https://api.balldontlie.io/v1", season: (t) => (+t.slice(5, 7) >= 10 ? +t.slice(0, 4) : +t.slice(0, 4) - 1), offseasonText: "The NBA regular season has not started yet." },
  { key: "wnba", label: "WNBA", base: "https://api.balldontlie.io/wnba/v1", season: (t) => +t.slice(0, 4), offseasonText: "The WNBA regular season has not started yet." },
];
const MAX_PAGES = 40;

const final = (g) => /final/i.test(g.status || "") && !g.postseason;
const away = (g) => g.visitor_team || g.away_team;
const awayScore = (g) => g.visitor_team_score ?? g.away_team_score;

export function records(teams, games) {
  const rec = new Map(teams.map((t) => [t.id, { t, w: 0, l: 0 }]));
  for (const g of games.filter(final)) {
    const h = rec.get(g.home_team?.id), a = rec.get(away(g)?.id);
    if (!h || !a) continue;
    if (g.home_team_score > awayScore(g)) { h.w++; a.l++; } else { a.w++; h.l++; }
  }
  const rows = [];
  const confs = [...new Set(teams.map((t) => t.conference).filter(Boolean))].sort();
  for (const conf of confs) {
    const list = [...rec.values()].filter((r) => r.t.conference === conf)
      .sort((x, y) => (y.w - y.l) - (x.w - x.l) || y.w - x.w || x.t.full_name.localeCompare(y.t.full_name));
    const lead = list[0];
    for (const r of list) {
      const gb = ((lead.w - r.w) + (r.l - lead.l)) / 2;
      rows.push({ name: r.t.full_name || r.t.name, short: r.t.abbreviation, group: `${conf}ern Conference`.replace("ernern", "ern"), cells: { w: r.w, l: r.l, pct: pct(r.w, r.l), gb: gb === 0 ? "-" : gb.toFixed(1) } });
    }
  }
  const counted = games.filter(final).length;
  const sum = [...rec.values()].reduce((s, r) => s + r.w + r.l, 0);
  return { rows, why: sum !== counted * 2 ? "w-plus-l-mismatch" : null };
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
    const played = games.filter(final);
    if (!played.length) {
      blocks.push({ id: `${lg.key}-table`, kind: "standings", league: lg.key, title: `${lg.label} records`, asOf: today, columns: COLUMNS, rows: [], source: SOURCE, emptyText: lg.offseasonText });
      continue;
    }
    const { rows, why } = records(teams, games);
    const asOf = played.map((g) => String(g.date).slice(0, 10)).sort().pop();
    if (why) failed[`${lg.key}-table`] = why;
    else blocks.push({ id: `${lg.key}-table`, kind: "standings", league: lg.key, title: `${lg.label} records`, asOf, compactRows: 3, columns: COLUMNS, rows, source: SOURCE, emptyText: null });
    const lastDay = asOf;
    const results = played.filter((g) => String(g.date).slice(0, 10) === lastDay).map((g) => ({ date: lastDay, home: g.home_team.full_name, away: away(g).full_name, homeScore: g.home_team_score, awayScore: awayScore(g), competition: lg.label, round: null }));
    blocks.push({ id: `${lg.key}-games`, kind: "results", league: lg.key, title: `${lg.label}: latest results`, asOf, rows: results, source: SOURCE, emptyText: null });
  }
  return { blocks, failed };
}
