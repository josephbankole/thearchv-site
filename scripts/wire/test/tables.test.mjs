import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fromOpenfootball, sanityTable, fromFootballData } from "../tables/football.mjs";
import { compute } from "../tables/nfl.mjs";
import { records } from "../tables/basketball.mjs";
import { mergeSport, hold, parseCsv } from "../tables/common.mjs";

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
