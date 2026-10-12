/* Football tables on football-data.org: the Champions League league phase, display names, match
   labels, and the openfootball staleness guard. Fixtures are trimmed football-data.org responses of
   12 October 2026 (fixtures/README.md); nothing here touches the network. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as football from "../tables/football.mjs";
import { fromFootballData, fromFootballDataCl, fromOpenfootball, sanityLeaguePhase, fdCompetition, fdRound, fdScore } from "../tables/football.mjs";
import { fresh, mergeSport } from "../tables/common.mjs";
import { sanitiseBlock } from "../lib/schema.mjs";
import { renderTableBlock } from "../lib/render.mjs";

const load = (name) => JSON.parse(readFileSync(new URL(`./fixtures/tables/${name}`, import.meta.url), "utf8"));
const TODAY = "2026-10-12";
const TOKEN = { FOOTBALL_DATA_TOKEN: "test-token" };

// Answers by offlineName from the fixtures; `over` replaces one (null = a failed fetch).
const stub = (over = {}) => async (url, { offlineName } = {}) => {
  if (offlineName in over) return over[offlineName] === null ? { ok: false, status: 503 } : { ok: true, status: 200, json: over[offlineName] };
  try { return { ok: true, status: 200, json: load(offlineName) }; } catch { return { ok: false, status: 404 }; }
};
const capture = async (fn) => {
  const lines = [], log = console.log;
  console.log = (...a) => lines.push(a.join(" "));
  try { return { result: await fn(), lines }; } finally { console.log = log; }
};
const byId = (r, id) => r.blocks.find((b) => b.id === id);

test("ucl-table: the 36-club league phase, compact 8, United highlighted, after matchday 1", async () => {
  const { result: r } = await capture(() => football.run({ get: stub(), today: TODAY, env: TOKEN }));
  assert.equal(r.provider, "football-data.org");
  assert.deepEqual(r.blocks.map((b) => b.id), ["pl-table", "ucl-table", "mu-next", "mu-results"]);
  assert.deepEqual(r.failed, {});
  const cl = byId(r, "ucl-table");
  assert.deepEqual([cl.kind, cl.league, cl.title, cl.compactRows, cl.throughLabel, cl.through], ["standings", "champions-league", "Champions League: league phase", 8, "After matchday 1", null]);
  assert.equal(cl.rows.length, 36);
  assert.deepEqual(cl.columns, byId(r, "pl-table").columns);
  assert.equal(cl.source.attribution, "Football data provided by the Football-Data.org API");
  assert.deepEqual(cl.rows.filter((x) => x.highlight).map((x) => [x.name, x.short, x.cells.pos]), [["Manchester United FC", "Man Utd", 4]]);
  assert.ok(cl.rows.every((x) => !("_w" in x) && !("_d" in x)));
  const html = renderTableBlock(sanitiseBlock(fresh(cl, { today: TODAY, fetchedAt: `${TODAY}T09:10:00.000Z` })), { compact: true, today: TODAY });
  assert.equal((html.match(/<tr[ >]/g) || []).length - 1, 8, "eight rows in the compact view (United is already in the top 8)");
  assert.match(html, /Updated 12 October 2026\. After matchday 1\./);
});

test("ucl-table: United outside the top 8 still shows in the compact view; United absent is no failure", () => {
  const json = load("football-data-cl-standings.json");
  const rows = json.standings[0].table;
  const moved = structuredClone(json);
  const t = moved.standings[0].table;
  const u = t.findIndex((x) => x.team.id === 66);
  [t[u].team, t[30].team] = [t[30].team, t[u].team];
  const b = sanitiseBlock(fresh(fromFootballDataCl(moved, TODAY).block, { today: TODAY, fetchedAt: `${TODAY}T09:10:00.000Z` }));
  const html = renderTableBlock(b, { compact: true, today: TODAY });
  assert.equal((html.match(/<tr[ >]/g) || []).length - 1, 9);
  assert.match(html, /<tr class="is-highlight">.*Man Utd/);
  const without = structuredClone(json);
  without.standings[0].table = rows.map((x) => (x.team.id === 66 ? { ...x, team: { id: 9999, name: "Fixture Club FC", shortName: "Fixture" } } : x));
  const r = fromFootballDataCl(without, TODAY);
  assert.equal(r.failed, undefined);
  assert.equal(r.block.rows.filter((x) => x.highlight).length, 0);
});

test("ucl-table sanity: 36 rows, points = 3W + D, played within two; a split matchday has no label", () => {
  const json = load("football-data-cl-standings.json");
  const set = (fn) => { const j = structuredClone(json); fn(j.standings[0].table); return fromFootballDataCl(j, TODAY); };
  assert.match(set((t) => t.pop()).failed, /^row-count 35 != 36$/);
  assert.match(set((t) => { t[5].points += 1; }).failed, /^points mismatch/);
  assert.equal(set((t) => { t[0].playedGames = 4; t[0].won = 4; t[0].points = 12; }).failed, "played-spread");
  const split = set((t) => { t[0].playedGames = 2; t[0].won = 2; t[0].points = 6; });
  assert.equal(split.failed, undefined);
  assert.equal(split.block.throughLabel, null, "clubs on different matchdays: no 'After matchday' line");
  const zero = set((t) => t.forEach((x) => Object.assign(x, { playedGames: 0, won: 0, draw: 0, points: 0 })));
  assert.equal(zero.block.throughLabel, null, "nothing played yet: no 'After matchday 0'");
  assert.equal(sanityLeaguePhase([]), "row-count 0 != 36");
});

test("ucl-table: no league phase (summer, qualifying, last season) fails with no-league-phase, never a crash", () => {
  const json = load("football-data-cl-standings.json");
  for (const j of [{ standings: [] }, {}, { standings: [{ stage: "QUALIFICATION_ROUND_3", type: "TOTAL", table: json.standings[0].table }] }, { standings: [{ stage: "LEAGUE_STAGE", type: "TOTAL", table: [] }] }]) {
    assert.deepEqual(fromFootballDataCl(j, "2026-08-01"), { failed: "no-league-phase" });
  }
  assert.deepEqual(fromFootballDataCl(json, "2027-07-20"), { failed: "no-league-phase" }, "last season's table is not this season's");
  assert.ok(fromFootballDataCl(json, "2027-05-20").block, "the final league phase stands through the spring");
});

test("a CL fetch failure holds ucl-table only; the PL blocks stay fresh", async () => {
  const yesterday = "2026-10-11";
  const { result: prevRun } = await capture(() => football.run({ get: stub(), today: yesterday, env: TOKEN }));
  const prev = prevRun.blocks.map((b) => fresh(b, { today: yesterday, fetchedAt: `${yesterday}T09:10:00.000Z` }));
  const { result: r, lines } = await capture(() => football.run({ get: stub({ "football-data-cl-standings.json": null }), today: TODAY, env: TOKEN }));
  assert.equal(r.provider, "football-data.org");
  assert.deepEqual(r.blocks.map((b) => b.id), ["pl-table", "mu-next", "mu-results"]);
  assert.deepEqual(r.failed, { "ucl-table": "fetch-failed:503" });
  assert.ok(lines.some((l) => /Champions League table not refreshed \(fetch-failed:503\)/.test(l)));
  const merged = mergeSport(prev, { ...r, blocks: r.blocks.map((b) => fresh(b, { today: TODAY, fetchedAt: `${TODAY}T09:10:00.000Z` })) }, TODAY);
  assert.deepEqual(merged.map((b) => `${b.id}:${b.status}`), ["pl-table:fresh", "mu-next:fresh", "mu-results:fresh", "ucl-table:held"]);
  assert.deepEqual([merged[3].heldReason, merged[3].heldDays, merged[3].rows.length], ["fetch-failed:503", 1, 36]);
});

test("a PL failure falls back to openfootball and keeps a good CL table", async () => {
  const { result: r } = await capture(() => football.run({ get: stub({ "football-data-standings.json": null }), today: TODAY, env: TOKEN }));
  assert.equal(r.provider, "openfootball");
  assert.deepEqual(r.blocks.map((b) => [b.id, b.source.name]), [["pl-table", "openfootball"], ["ucl-table", "football-data.org"], ["mu-next", "openfootball"], ["mu-results", "openfootball"]]);
});

test("without a token the log line is unchanged and ucl-table is held, not rebuilt", async () => {
  const { result: r, lines } = await capture(() => football.run({ get: stub(), today: TODAY, env: {} }));
  assert.ok(lines.includes("[tables:football] FOOTBALL_DATA_TOKEN not set: skipping football-data.org, using openfootball (CC0)"));
  assert.equal(r.failed["ucl-table"], "no-token");
  assert.ok(!byId(r, "ucl-table"));
});

test("display names: our short name, then football-data's, then the trimmed full name", () => {
  const standings = { standings: [{ type: "TOTAL", table: [
    { position: 1, team: { id: 66, name: "Manchester United FC", shortName: "Man United" }, playedGames: 1, won: 1, draw: 0, goalDifference: 1, points: 3 },
    { position: 2, team: { id: 397, name: "Brighton & Hove Albion FC", shortName: "Brighton Hove" }, playedGames: 1, won: 1, draw: 0, goalDifference: 1, points: 3 },
    { position: 3, team: { id: 78, name: "Club Atlético de Madrid", shortName: "Atleti" }, playedGames: 1, won: 1, draw: 0, goalDifference: 1, points: 3 },
    { position: 4, team: { id: 322, name: "Hull City AFC" }, playedGames: 1, won: 1, draw: 0, goalDifference: 1, points: 3 },
  ] }] };
  const r = fromFootballData(standings, { matches: [] }, TODAY);
  assert.deepEqual(r.rows.map((x) => [x.name, x.short]), [["Manchester United FC", "Man Utd"], ["Brighton & Hove Albion FC", "Brighton"], ["Club Atlético de Madrid", "Atleti"], ["Hull City AFC", "Hull City"]]);
  const fd = fromFootballData(load("football-data-standings.json"), load("football-data-matches.json"), TODAY);
  assert.deepEqual(fd.rows.filter((x) => x.highlight).map((x) => [x.name, x.short, x.cells.pos, x.cells.p, x.cells.pts]), [["Manchester United FC", "Man Utd", 13, 6, 6]]);
  assert.equal(fd.rows.find((x) => x.name === "Tottenham Hotspur FC").short, "Spurs");
  assert.deepEqual([fd.last[0].home, fd.last[0].away], ["Man Utd", "Spurs"]);
  assert.deepEqual([fd.next[0].home, fd.next[0].away], ["Atleti", "Man Utd"]);
  const cl = fromFootballDataCl(load("football-data-cl-standings.json"), TODAY).block;
  assert.equal(cl.rows.find((x) => x.name === "FK Shakhtar Donetsk").short, "Shakhtar", "football-data spells it Shaktar");
});

test("United's fixtures and results across PL and CL carry competition and round labels", () => {
  const fd = fromFootballData(load("football-data-standings.json"), load("football-data-matches.json"), TODAY);
  assert.deepEqual(fd.last[0], { date: "2026-10-10", kickoff: "2026-10-10T16:30:00Z", home: "Man Utd", away: "Spurs", competition: "Premier League", round: "Matchday 6", homeScore: 1, awayScore: 1 });
  assert.deepEqual(fd.next.map((m) => [m.date, m.home, m.away, m.competition, m.round]), [
    ["2026-10-13", "Atleti", "Man Utd", "Champions League", "League phase, matchday 2"],
    ["2026-10-18", "Leeds", "Man Utd", "Premier League", "Matchday 7"],
    ["2026-10-21", "Como 1907", "Man Utd", "Champions League", "League phase, matchday 3"],
  ]);
  assert.deepEqual(fd.last.map((m) => m.date), ["2026-10-10", "2026-09-20", "2026-09-13"]);
  const cl = (stage, matchday = null) => ({ competition: { code: "CL", name: "UEFA Champions League" }, stage, matchday });
  assert.deepEqual(
    [cl("LEAGUE_STAGE", 8), cl("LEAGUE_STAGE"), cl("PLAYOFFS"), cl("LAST_16"), cl("QUARTER_FINALS"), cl("SEMI_FINALS"), cl("FINAL"), cl("SOMETHING_NEW", 3), cl("SOMETHING_NEW")].map(fdRound),
    ["League phase, matchday 8", "League phase", "Knockout play-off", "Round of 16", "Quarter-final", "Semi-final", "Final", "Matchday 3", null],
  );
  assert.equal(fdRound({ competition: { code: "PL" }, stage: "REGULAR_SEASON", matchday: 6 }), "Matchday 6");
  assert.deepEqual([fdCompetition({ competition: { code: "PL", name: "Premier League" } }), fdCompetition({ competition: { code: "CL", name: "UEFA Champions League" } }), fdCompetition({ competition: { code: "FAC", name: "FA Cup" } }), fdCompetition({})], ["Premier League", "Champions League", "FA Cup", null]);
});

test("postponed, suspended and awarded matches; a shoot-out shows the score after extra time", () => {
  const m = (utcDate, status, score = {}) => ({ utcDate, status, matchday: 1, competition: { code: "PL", name: "Premier League" }, homeTeam: { name: "Manchester United FC" }, awayTeam: { name: "Fulham FC" }, score });
  const r = fromFootballData({ standings: [] }, { matches: [
    m("2026-10-14T19:00:00Z", "POSTPONED"),
    m("2026-10-15T19:00:00Z", "SUSPENDED", { fullTime: { home: 1, away: 0 } }),
    m("2026-10-01T19:00:00Z", "SCHEDULED"),
    m("2026-10-20T19:00:00Z", "TIMED"),
    m("2026-10-05T19:00:00Z", "AWARDED", { fullTime: { home: 3, away: 0 } }),
    m("2026-10-04T19:00:00Z", "AWARDED", { fullTime: { home: null, away: null } }),
    m("2026-10-03T19:00:00Z", "FINISHED", { fullTime: { home: null, away: null } }),
    m("2026-10-02T19:00:00Z", "FINISHED", { duration: "PENALTY_SHOOTOUT", fullTime: { home: 5, away: 4 }, regularTime: { home: 1, away: 1 }, extraTime: { home: 0, away: 0 }, penalties: { home: 4, away: 3 } }),
    { status: "TIMED" },
  ] }, TODAY);
  assert.deepEqual(r.next.map((x) => x.date), ["2026-10-20"], "no postponed match, and no SCHEDULED one left behind on a past date");
  assert.deepEqual(r.last.map((x) => [x.date, x.homeScore, x.awayScore]), [["2026-10-05", 3, 0], ["2026-10-02", 1, 1]]);
  assert.deepEqual(fdScore(null), [undefined, undefined]);
});

test("openfootball staleness: a missing round trips it, holding the table and results but not the fixtures", async () => {
  const of = load("openfootball-en1.json");
  const { result: r, lines } = await capture(() => football.run({ get: stub(), today: "2026-10-20", env: {} }));
  assert.deepEqual(r.failed, { "pl-table": "source-stale", "ucl-table": "no-token", "mu-results": "source-stale" });
  assert.deepEqual(r.blocks.map((b) => b.id), ["mu-next"]);
  assert.ok(byId(r, "mu-next").rows.every((x) => x.date >= "2026-10-20"));
  assert.ok(lines.includes("[tables:football] openfootball looks stale: newest result 2026-09-20, 10 matches overdue"), lines.join("\n"));
  // Synthetic: a ten-club season whose source stops after round 1 of 3.
  const clubs = Array.from({ length: 10 }, (_, i) => `Club ${i} FC`);
  const round = (r, date, scored) => clubs.slice(0, 5).map((c, i) => ({ round: `Matchday ${r}`, date, team1: c, team2: clubs[(i + r) % 5 + 5], ...(scored ? { score: { ft: [1, 0] } } : {}) }));
  const synth = { matches: [...round(1, "2026-09-05", true), ...round(2, "2026-09-12", false), ...round(3, "2026-09-19", false)] };
  assert.equal(fromOpenfootball(synth, "2026-09-18").overdue, 0, "six days on, round 2 is not yet overdue");
  assert.equal(fromOpenfootball(synth, "2026-09-19").overdue, 5);
  assert.equal(fromOpenfootball(synth, "2026-09-30").overdue, 10);
  assert.equal(fromOpenfootball(of, "2026-10-20").through, "2026-09-20");
});

test("openfootball staleness does not trip on the fixture's own dates, one postponement, or the season's start", async () => {
  for (const today of ["2026-09-27", TODAY]) {
    const { result: r, lines } = await capture(() => football.run({ get: stub(), today, env: {} }));
    assert.deepEqual(r.blocks.map((b) => b.id), ["pl-table", "mu-next", "mu-results"], today);
    assert.ok(!lines.some((l) => /looks stale/.test(l)), today);
  }
  // Round 6 played except the last match of it (12 October), which is postponed; round 7 not yet a week old.
  const of = load("openfootball-en1.json");
  const one = structuredClone(of);
  for (const m of one.matches) if (m.round === "Matchday 6" && m.date !== "2026-10-12") m.score = { ft: [1, 1] };
  const p = fromOpenfootball(one, "2026-10-21");
  assert.deepEqual([p.through, p.overdue], ["2026-10-11", 1]);
  const { result: r } = await capture(() => football.run({ get: stub({ "openfootball-en1.json": one }), today: "2026-10-21", env: {} }));
  assert.ok(byId(r, "pl-table") && byId(r, "mu-results"), "one postponed match is not a stale source");
  const blank = { matches: of.matches.map(({ score, ...m }) => m) };
  for (const today of ["2026-08-01", "2026-08-21", "2026-08-27"]) assert.equal(fromOpenfootball(blank, today).overdue, 0, today);
});

test("no crest, emblem, flag or logo in any football output, even when the source sends them", async () => {
  const dress = (o) => JSON.parse(JSON.stringify(o), (k, v) => (v && typeof v === "object" && !Array.isArray(v) && ("name" in v) ? { ...v, crest: "https://crests.example/1.png", emblem: "https://crests.example/2.svg", flag: "https://crests.example/3.svg" } : v));
  const over = Object.fromEntries(["football-data-standings.json", "football-data-matches.json", "football-data-cl-standings.json"].map((f) => [f, dress(load(f))]));
  assert.match(JSON.stringify(over), /crests\.example/);
  const { result: r } = await capture(() => football.run({ get: stub(over), today: TODAY, env: TOKEN }));
  const out = JSON.stringify(r.blocks.map((b) => sanitiseBlock(fresh(b, { today: TODAY, fetchedAt: `${TODAY}T09:10:00.000Z` }))));
  assert.equal(r.blocks.length, 4);
  assert.ok(!/crest|emblem|flag|logo|crests\.example/i.test(out));
  for (const f of Object.keys(over)) assert.ok(!/crest|emblem|flag|logo|https?:/i.test(readFileSync(new URL(`./fixtures/tables/${f}`, import.meta.url), "utf8")), `${f} carries no crest field or URL`);
});
