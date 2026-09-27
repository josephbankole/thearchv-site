import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fromOpenfootball, sanityTable, fromFootballData } from "../tables/football.mjs";
import * as football from "../tables/football.mjs";
import { compute } from "../tables/nfl.mjs";
import * as nfl from "../tables/nfl.mjs";
import { records } from "../tables/basketball.mjs";
import * as basketball from "../tables/basketball.mjs";
import { fromJolpica } from "../tables/f1.mjs";
import { mergeSport, hold, parseCsv, fresh } from "../tables/common.mjs";
import { blockVisible, sanitiseBlock } from "../lib/schema.mjs";
import { renderTableBlock } from "../lib/render.mjs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

test("openfootball: a 20-team table with points equal to 3W + D and United highlighted", () => {
  const r = fromOpenfootball(JSON.parse(read("./fixtures/tables/openfootball-en1.json")), "2026-09-27");
  assert.equal(r.rows.length, 20);
  assert.equal(sanityTable(r.rows), null);
  assert.equal(r.rows.filter((x) => x.highlight).map((x) => x.name).join(), "Manchester United FC");
  assert.ok(r.next.every((m) => m.date >= "2026-09-27"));
  assert.equal(r.last[0].date, "2026-09-20");
  assert.deepEqual([r.last[0].homeScore, r.last[0].awayScore], [1, 1]);
});

test("football sanity refuses a broken table", () => {
  const r = fromOpenfootball(JSON.parse(read("./fixtures/tables/openfootball-en1.json")), "2026-09-27");
  assert.match(sanityTable(r.rows.slice(0, 19)), /row-count/);
  const bent = r.rows.map((x, i) => (i === 3 ? { ...x, cells: { ...x.cells, pts: x.cells.pts + 1 } } : x));
  assert.match(sanityTable(bent), /points mismatch/);
});

test("football-data.org shape maps without reading crests", () => {
  const standings = { standings: [{ type: "TOTAL", table: [{ position: 1, team: { id: 66, name: "Manchester United FC", shortName: "Man United", crest: "https://crests.example/66.png" }, playedGames: 6, won: 4, draw: 1, lost: 1, goalDifference: 5, points: 13 }] }] };
  const matches = { matches: [{ utcDate: "2026-10-10T14:00:00Z", status: "TIMED", homeTeam: { name: "Manchester United FC", crest: "x" }, awayTeam: { name: "Tottenham Hotspur FC" }, competition: { name: "Premier League", emblem: "y" }, matchday: 7, score: { fullTime: {} } }] };
  const r = fromFootballData(standings, matches, "2026-09-27");
  assert.equal(r.rows[0].highlight, true);
  assert.equal(r.next[0].competition, "Premier League");
  assert.ok(!/crest|emblem/.test(JSON.stringify(r)));
});

test("nflverse: 272 regular-season games, 32 teams by division, odds columns never read", () => {
  const csv = read("./fixtures/tables/nflverse-games.csv");
  const c = compute(csv, "2026-09-27");
  assert.equal(c.why, null);
  assert.equal(c.rows.length, 32);
  assert.equal(new Set(c.rows.map((r) => r.group)).size, 8);
  assert.ok(c.results.length > 0 && c.results.every((g) => typeof g.homeScore === "number"));
  assert.ok(c.next.every((g) => g.date >= "2026-09-27"));
  assert.ok(!/moneyline|spread|odds/i.test(JSON.stringify(c)));
  assert.equal(parseCsv('a,b\n"x, y",2\n')[0].a, "x, y");
});

test("basketball records: W + L balance and games behind", () => {
  const teams = JSON.parse(read("./fixtures/tables/balldontlie-wnba-teams.json")).data;
  const games = JSON.parse(read("./fixtures/tables/balldontlie-wnba-games-0.json")).data;
  const { rows, why } = records(teams, games);
  assert.equal(why, null);
  const lynx = rows.find((r) => r.name === "Fixture Lynx");
  assert.deepEqual([lynx.cells.w, lynx.cells.l, lynx.cells.gb, lynx.group], [2, 0, "-", "Western Conference"]);
  assert.equal(rows.find((r) => r.name === "Sample Aces").cells.gb, "2.0");
});

test("holds count from the last fresh value, so a held block cannot ratchet", () => {
  const prevFresh = { id: "pl-table", asOf: "2026-09-20", lastFreshAsOf: "2026-09-20", status: "fresh", heldDays: 0, rows: [] };
  const h1 = hold(prevFresh, "row-count", "2026-09-22");
  assert.deepEqual([h1.status, h1.heldDays, h1.lastFreshAsOf], ["held", 2, "2026-09-20"]);
  const h2 = hold(h1, "row-count", "2026-09-25");
  assert.equal(h2.heldDays, 5, "measured from the last fresh value, not from the held copy");
  const merged = mergeSport([prevFresh, { id: "mu-next", asOf: "2026-09-20", status: "fresh", rows: [] }], { blocks: [{ id: "mu-next", asOf: "2026-09-27", status: "fresh", rows: [] }], failed: { "pl-table": "united-missing" } }, "2026-09-27");
  assert.deepEqual(merged.map((b) => `${b.id}:${b.status}`), ["mu-next:fresh", "pl-table:held"]);
});

/* ---------- regression tests for the PR #18 review (tables group) ---------- */

// An offline `get` for the modules' run(): answers from the fixture files by offlineName, never the network.
const stubGet = (extra = {}) => async (url, { offlineName, text = false } = {}) => {
  if (extra[offlineName] !== undefined) return { ok: true, status: 200, json: extra[offlineName], body: JSON.stringify(extra[offlineName]) };
  try {
    const body = read(`./fixtures/tables/${offlineName}`);
    return text ? { ok: true, status: 200, body } : { ok: true, status: 200, body, json: JSON.parse(body) };
  } catch { return { ok: false, status: 404 }; }
};
const quietly = async (fn) => { const log = console.log; console.log = () => {}; try { return await fn(); } finally { console.log = log; } };

test("tables-1: an openfootball 0-0 (a bare score array) counts as a played draw", () => {
  const r = fromOpenfootball(JSON.parse(read("./fixtures/tables/openfootball-en1.json")), "2026-09-27");
  const spurs = r.rows.find((x) => x.name === "Tottenham Hotspur FC");
  assert.deepEqual([spurs.cells.p, spurs.cells.pts], [5, 2]);
  assert.ok(r.rows.every((x) => x.cells.p === 5), "every club has played five after matchday 5");
  assert.equal(sanityTable(r.rows), null);
  const mini = { matches: [
    { date: "2026-09-20", team1: "Manchester United FC", team2: "Fulham FC", score: [0, 0] },
    { date: "2026-10-10", team1: "Manchester United FC", team2: "Tottenham Hotspur FC" },
  ] };
  const m = fromOpenfootball(mini, "2026-09-27");
  assert.deepEqual(m.last.map((x) => [x.date, x.homeScore, x.awayScore]), [["2026-09-20", 0, 0]]);
  assert.deepEqual(m.next.map((x) => x.date), ["2026-10-10"]);
});

test("tables-2 / ux-1: a table fetched today stays visible through an international break", async () => {
  for (const today of ["2026-10-05", "2026-10-12"]) {
    const r = await quietly(() => football.run({ get: stubGet(), today, env: {} }));
    const blocks = r.blocks.map((b) => fresh(b, { today, fetchedAt: `${today}T09:10:00.000Z` }));
    for (const id of ["pl-table", "mu-results"]) {
      const b = blocks.find((x) => x.id === id);
      assert.equal(b.asOf, today, `${id} is as of the day it was fetched`);
      assert.equal(b.through, "2026-09-20", `${id} says the data runs to the newest result`);
      assert.equal(blockVisible(b, today), true, `${id} visible on ${today}`);
    }
  }
});

test("tables-3: one failed fetch the day after a fresh one holds the block for one day, still visible", async () => {
  const r = await quietly(() => football.run({ get: stubGet(), today: "2026-09-27", env: {} }));
  const prev = r.blocks.map((b) => fresh(b, { today: "2026-09-27", fetchedAt: "2026-09-27T09:10:00.000Z" }));
  const merged = mergeSport(prev, { blocks: [], failed: { "pl-table": "fetch-failed:503", "mu-next": "fetch-failed:503", "mu-results": "fetch-failed:503" } }, "2026-09-28");
  const pl = merged.find((b) => b.id === "pl-table");
  assert.deepEqual([pl.status, pl.heldDays], ["held", 1]);
  assert.equal(blockVisible(pl, "2026-09-28"), true);
  assert.match(renderTableBlock(sanitiseBlock(pl), { today: "2026-09-28" }), /Last updated 27 September 2026\. Results to 20 September 2026\./);
  const later = mergeSport(merged, { blocks: [], failed: { "pl-table": "fetch-failed:503" } }, "2026-10-01");
  assert.equal(later.find((b) => b.id === "pl-table").heldDays, 4, "still counted from the last fresh fetch, never the held copy");
  assert.equal(blockVisible(later.find((b) => b.id === "pl-table"), "2026-10-01"), false);
});

test("ux-1: a fresh block's footer says when it was fetched and what the data runs to; sanitise keeps both", async () => {
  const r = await quietly(() => football.run({ get: stubGet(), today: "2026-09-27", env: {} }));
  const pl = sanitiseBlock(fresh(r.blocks.find((b) => b.id === "pl-table"), { today: "2026-09-27", fetchedAt: "2026-09-27T09:10:00.000Z" }));
  assert.deepEqual([pl.asOf, pl.lastFreshAsOf, pl.through], ["2026-09-27", "2026-09-27", "2026-09-20"]);
  assert.match(renderTableBlock(pl, { today: "2026-09-27" }), /Updated 27 September 2026\. Results to 20 September 2026\./);
  assert.equal(sanitiseBlock({ ...pl, through: "20 Sept", throughLabel: 7 }).through, null, "a bad through is dropped, the block kept");
});

test("tables-7: on football-data.org the table is dated by the fetch, not by United's last match", async () => {
  const names = Array.from({ length: 20 }, (_, i) => (i === 0 ? "Manchester United FC" : `Club ${i} FC`));
  const standings = { standings: [{ type: "TOTAL", table: names.map((name, i) => ({ position: i + 1, team: { id: i === 0 ? 66 : 1000 + i, name }, playedGames: 5, won: 5 - (i % 3), draw: i % 3, lost: 0, goalDifference: 0, points: (5 - (i % 3)) * 3 + (i % 3) })) }] };
  const matches = { matches: [
    { utcDate: "2026-09-20T15:30:00Z", status: "FINISHED", homeTeam: { name: "Fulham FC" }, awayTeam: { name: "Manchester United FC" }, competition: { name: "Premier League" }, matchday: 5, score: { fullTime: { home: 1, away: 1 } } },
    { utcDate: "2026-09-24T19:45:00Z", status: "FINISHED", homeTeam: { name: "Manchester United FC" }, awayTeam: { name: "Burnley FC" }, competition: { name: "Carabao Cup" }, score: { fullTime: { home: 2, away: 0 } } },
  ] };
  const r = await football.run({ get: stubGet({ "football-data-standings.json": standings, "football-data-matches.json": matches }), today: "2026-09-27", env: { FOOTBALL_DATA_TOKEN: "test-token" } });
  const pl = r.blocks.find((b) => b.id === "pl-table");
  assert.equal(r.provider, "football-data.org");
  assert.equal(pl.asOf, "2026-09-27");
  assert.equal(pl.through ?? null, null, "United's cup date never labels the league table");
  assert.equal(r.blocks.find((b) => b.id === "mu-results").through, "2026-09-24");
});

test("tables-8: F1 standings say which round they reflect", () => {
  const drivers = { MRData: { StandingsTable: { season: "2026", round: "15", StandingsLists: [{ season: "2026", round: "15", DriverStandings: Array.from({ length: 20 }, (_, i) => ({ position: String(i + 1), points: String(300 - i * 10), wins: "0", Driver: { givenName: "Driver", familyName: `Number${i + 1}` }, Constructors: [{ name: "Team" }] })) }] } } };
  const constructors = { MRData: { StandingsTable: { season: "2026", round: "15", StandingsLists: [{ season: "2026", round: "15", ConstructorStandings: Array.from({ length: 10 }, (_, i) => ({ position: String(i + 1), points: String(500 - i * 20), wins: "0", Constructor: { name: `Team ${i + 1}` } })) }] } } };
  const r = fromJolpica(drivers, constructors, null, "2026-09-27");
  assert.deepEqual(r.blocks.map((b) => [b.id, b.asOf, b.throughLabel]), [["f1-drivers", "2026-09-27", "After round 15"], ["f1-constructors", "2026-09-27", "After round 15"]]);
  assert.match(renderTableBlock(sanitiseBlock(fresh(r.blocks[0], { today: "2026-09-27", fetchedAt: "2026-09-27T09:10:00.000Z" })), { today: "2026-09-27" }), /Updated 27 September 2026\. After round 15\./);
});

test("tables-4 / tables-5: WNBA in BALLDONTLIE's documented shape: records, conferences, playoffs and the New York day", async () => {
  const r = await basketball.run({ get: stubGet(), today: "2026-09-27", env: { BALLDONTLIE_API_KEY: "test-key" }, pause: 0 });
  const table = r.blocks.find((b) => b.id === "wnba-table");
  assert.equal(table.emptyText, null);
  const row = (n) => table.rows.find((x) => x.name === n);
  assert.deepEqual([row("Fixture Lynx").cells.w, row("Fixture Lynx").cells.l, row("Fixture Lynx").group], [2, 0, "Western Conference"]);
  assert.deepEqual([row("Placeholder Liberty").cells.w, row("Placeholder Liberty").cells.l, row("Example Sun").cells.w], [0, 1, 1], "home_score/away_score read, playoff game not counted");
  assert.ok(table.rows.every((x) => /^(Eastern|Western) Conference$/.test(x.group)));
  assert.equal(table.through, "2026-09-02", "an 8pm ET tip is dated in New York, not UTC");
  const games = r.blocks.find((b) => b.id === "wnba-games");
  assert.deepEqual(games.rows.map((g) => [g.date, g.home, g.homeScore, g.awayScore]), [["2026-09-26", "Fixture Lynx", 88, 80]], "latest results include the playoffs");
  assert.equal(games.through, "2026-09-26");
});

test("tables-5: an NBA Cup final does not count in records, and a team past 82 games is refused", () => {
  const teams = [{ id: 1, full_name: "Fixture Bulls", abbreviation: "FXB", conference: "East" }, { id: 2, full_name: "Placeholder Kings", abbreviation: "PLK", conference: "West" }];
  const g = (id, home, away, hs, as, extra = {}) => ({ id, date: "2026-12-10", status: "Final", status_state: "final", postseason: false, ist_stage: null, home_team: { id: home }, visitor_team: { id: away }, home_team_score: hs, visitor_team_score: as, ...extra });
  const { rows, why } = records(teams, [g(1, 1, 2, 100, 90), g(2, 1, 2, 90, 100, { ist_stage: "Championship" })]);
  assert.equal(why, null);
  assert.deepEqual(rows.map((x) => [x.name, x.cells.w, x.cells.l]), [["Fixture Bulls", 1, 0], ["Placeholder Kings", 0, 1]]);
  assert.equal(records(teams, Array.from({ length: 83 }, (_, i) => g(i, 1, 2, 100, 90)), 82).why, "games-exceed-season");
});

test("tables-6: basketball conferences are ordered by win percentage", () => {
  const teams = [{ id: 1, full_name: "A Team", conference: "East" }, { id: 2, full_name: "B Team", conference: "East" }, { id: 3, full_name: "C Team", conference: "West" }];
  const g = (id, home, away, homeWins) => ({ id, date: "2026-11-01", status: "Final", postseason: false, home_team: { id: home }, visitor_team: { id: away }, home_team_score: homeWins ? 100 : 90, visitor_team_score: homeWins ? 90 : 100 });
  const games = [
    ...Array.from({ length: 12 }, (_, i) => g(i, 1, 3, true)), ...Array.from({ length: 8 }, (_, i) => g(20 + i, 1, 3, false)),
    ...Array.from({ length: 3 }, (_, i) => g(40 + i, 2, 3, true)),
  ];
  const east = records(teams, games).rows.filter((x) => x.group === "Eastern Conference");
  assert.deepEqual(east.map((x) => [x.name, x.cells.pct]), [["B Team", "1.000"], ["A Team", ".600"]]);
  assert.ok(east.every((x) => x.cells.gb === "-" || +x.cells.gb >= 0), "games behind is never negative");
});

test("ux-1: NFL blocks are dated by the fetch; a week's results run to that week's last game, not the next Thursday", async () => {
  const r = await nfl.run({ get: stubGet(), today: "2026-09-27" });
  const standings = r.blocks.find((b) => b.id === "nfl-standings"), results = r.blocks.find((b) => b.id === "nfl-results");
  assert.deepEqual([standings.asOf, results.asOf], ["2026-09-27", "2026-09-27"]);
  assert.equal(results.through, results.rows.map((g) => g.date).sort().pop());
  assert.ok(results.through <= standings.through);
});
