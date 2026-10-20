// Unit tests for the scores-poll mapping (map.ts), against real API-Football replies. Run: `deno test`
// from this dir. No network, no permissions.
import {
  COMPETITIONS,
  detailPath,
  hasKickedOff,
  isFinished,
  isLive,
  mapEvents,
  mapMatch,
  mapMatchFile,
  type Match,
  normaliseMatch,
  sortMatches,
  tidy,
} from "./map.ts";
import { assert, assertEquals, DETAIL_FIXTURES, fixtureById, IDS, SCHEDULES } from "./testkit.ts";

const NOW = "2026-10-13T20:10:00.000Z";
const matchOf = (id: number): Match => mapMatch(fixtureById(id))!;
const fileOf = (id: number) => mapMatchFile(fixtureById(id), matchOf(id), NOW);

Deno.test("mapMatch: a finished Premier League fixture maps to the contract", () => {
  const first = SCHEDULES["39"].response[0];
  assertEquals(mapMatch(first), {
    id: 1557417,
    competition: { key: "premier-league", name: "Premier League", round: "Regular Season - 6" },
    kickoff: "2026-10-10T11:30:00+00:00",
    status: { code: "FT", minute: 90, extra: null, live: false, finished: true },
    home: { id: 42, name: "Arsenal", goals: 2 },
    away: { id: 63, name: "Leeds", goals: 1 },
    penalties: null,
    venue: "Emirates Stadium",
    detail: null,
  });
});

Deno.test("mapMatch: every fixture in the recorded schedules maps, to its own competition", () => {
  for (const c of COMPETITIONS) {
    const rows = SCHEDULES[String(c.leagueId)].response;
    const mapped = rows.map(mapMatch);
    assert(mapped.every((m) => m !== null), `${c.key}: every fixture maps`);
    assert(mapped.every((m) => m!.competition.key === c.key && m!.competition.name === c.name), c.key);
  }
});

Deno.test("mapMatch: live and not-started fixtures carry the right flags and minutes", () => {
  const byId = new Map(SCHEDULES["2"].response.map((f) => [f.fixture.id, mapMatch(f)!]));
  const live = byId.get(IDS.uclLive)!;
  assertEquals(live.status.code, "2H");
  assert(live.status.live && !live.status.finished, "2H is live, not finished");
  assert(typeof live.status.minute === "number" && live.status.minute > 45, "a live match has a minute");
  const ns = byId.get(1635665)!; // Feyenoord v Como, NS
  assertEquals(ns.status, { code: "NS", minute: null, extra: null, live: false, finished: false });
  assertEquals([ns.home.goals, ns.away.goals], [null, null]);
});

Deno.test("status flags: live and finished follow the contract's code lists exactly", () => {
  const live = ["1H", "HT", "2H", "ET", "BT", "P", "SUSP", "INT", "LIVE"];
  const finished = ["FT", "AET", "PEN", "AWD", "WO"];
  const other = ["TBD", "NS", "PST", "CANC", "ABD"];
  for (const c of live) assert(isLive(c) && !isFinished(c), `${c} is live`);
  for (const c of finished) assert(isFinished(c) && !isLive(c), `${c} is finished`);
  for (const c of other) assert(!isLive(c) && !isFinished(c), `${c} is neither`);
  // Kicked off: everything except the four codes for a match that has not been played.
  for (const c of ["TBD", "NS", "PST", "CANC"]) assert(!hasKickedOff(c), `${c} has not kicked off`);
  for (const c of [...live, ...finished, "ABD"]) assert(hasKickedOff(c), `${c} has kicked off`);
});

Deno.test("mapMatch: a penalty shootout is carried on the match; a normal result has none", () => {
  const pens = matchOf(IDS.uclFinalPens);
  assertEquals(pens.status.code, "PEN");
  assert(pens.status.finished, "PEN is finished");
  assertEquals(pens.penalties, { home: 4, away: 3 });
  assertEquals([pens.home.goals, pens.away.goals], [1, 1]);
  assertEquals(matchOf(IDS.plFinished).penalties, null);
});

Deno.test("mapMatch: WSL team names lose the API's trailing ' W'; other competitions are left alone", () => {
  const wsl = matchOf(IDS.wslFinished);
  assertEquals([wsl.home.name, wsl.away.name], ["Manchester City", "Arsenal"]);
  const pl = matchOf(IDS.plFinished);
  assertEquals([pl.home.name, pl.away.name], ["Liverpool", "Manchester City"]);
  const odd = fixtureById(IDS.plFinished);
  odd.teams.home.name = "Team W";
  assertEquals(mapMatch(odd)!.home.name, "Team W");
});

Deno.test("mapMatch: refuses what it cannot stand behind", () => {
  const ok = fixtureById(IDS.plFinished);
  assert(mapMatch(ok) !== null, "control");
  const bad = (edit: (f: typeof ok) => void) => {
    const f = structuredClone(ok);
    edit(f);
    return mapMatch(f);
  };
  assertEquals(bad((f) => (f.league.id = 140)), null); // La Liga is not one of ours
  assertEquals(bad((f) => (f.fixture.id = null)), null);
  assertEquals(bad((f) => (f.fixture.date = "next week")), null);
  assertEquals(bad((f) => (f.fixture.status.short = null)), null);
  assertEquals(bad((f) => delete f.teams.away), null);
  assertEquals(bad((f) => (f.teams.home.name = "")), null);
  assertEquals(mapMatch(null), null);
  assertEquals(mapMatch("fixture"), null);
});

Deno.test("mapMatch: nothing from the API's logo, flag, photo or referee fields reaches the output", () => {
  const every = [...DETAIL_FIXTURES, ...Object.values(SCHEDULES).flatMap((e) => e.response)];
  for (const fx of every) {
    const m = mapMatch(fx)!;
    const text = JSON.stringify(m) + JSON.stringify(mapMatchFile(fx, m, NOW));
    assert(!/https?:|logo|photo|flag|referee|api-sports/i.test(text), `no URL or image field in ${m.id}`);
  }
  // And with the fields put back: the mapper must not copy them across.
  const fx = fixtureById(IDS.plFinished);
  fx.teams.home.logo = "https://media.api-sports.io/football/teams/40.png";
  fx.league.logo = "https://media.api-sports.io/football/leagues/39.png";
  fx.fixture.referee = "A. Referee";
  fx.lineups[0].team.logo = "https://media.api-sports.io/football/teams/40.png";
  fx.lineups[0].team.colors = { player: { primary: "https://media.api-sports.io/x.png" } };
  fx.lineups[0].coach.photo = "https://media.api-sports.io/football/coachs/1.png";
  fx.players[0].players[0].player.photo = "https://media.api-sports.io/football/players/1.png";
  fx.events[0].team.logo = "https://media.api-sports.io/football/teams/40.png";
  const text = JSON.stringify(mapMatchFile(fx, mapMatch(fx)!, NOW));
  assert(!/https?:|logo|photo|referee|A\. Referee/i.test(text), "image and referee fields are not copied");
});

Deno.test("sortMatches: kickoff, then Premier League before Champions League before WSL, then id", () => {
  const base = matchOf(IDS.plFinished);
  const at = (id: number, key: Match["competition"]["key"], kickoff: string): Match => ({
    ...base,
    id,
    kickoff,
    competition: { ...base.competition, key },
  });
  const t = "2026-10-13T19:00:00+00:00";
  const sorted = sortMatches([
    at(5, "wsl", t),
    at(4, "champions-league", t),
    at(3, "premier-league", "2026-10-13T19:00:01+00:00"),
    at(2, "premier-league", t),
    at(1, "premier-league", t),
    at(6, "wsl", "2026-10-13T14:00:00+00:00"),
  ]);
  assertEquals(sorted.map((m) => m.id), [6, 1, 2, 4, 5, 3]);
});

// ---------- events ----------

const side = (id: number) => ({ id, name: `T${id}`, goals: null });
const ev = (type: string, detail: string, teamId = 1, extra: Record<string, unknown> = {}) => ({
  time: { elapsed: 10, extra: null },
  team: { id: teamId, name: "x", logo: "https://x/y.png" },
  player: { id: 9, name: "Scorer" },
  assist: { id: 8, name: "Provider" },
  type,
  detail,
  comments: null,
  ...extra,
});

Deno.test("mapEvents: every API type and detail maps to the contract's type", () => {
  const table: [string, string, string | null][] = [
    ["Goal", "Normal Goal", "goal"],
    ["Goal", "Own Goal", "own-goal"],
    ["Goal", "Penalty", "penalty-goal"],
    ["Goal", "Missed Penalty", "missed-penalty"],
    ["Card", "Yellow Card", "yellow"],
    ["Card", "Red Card", "red"],
    ["Card", "Second Yellow card", "second-yellow"], // the API's own capitalisation
    ["subst", "Substitution 3", "sub"],
    ["Var", "Goal cancelled", "var"],
    ["Var", "Penalty confirmed", "var"],
    ["Goal", "Something New", null], // an unknown goal detail is not guessed at
    ["Card", "Green Card", null],
    ["Foo", "Bar", null],
  ];
  for (const [type, detail, want] of table) {
    const out = mapEvents([ev(type, detail)], side(1), side(2));
    assertEquals(out.length ? out[0].type : null, want, `${type} / ${detail}`);
  }
});

Deno.test("mapEvents: side, player, related and detail follow the API", () => {
  const [home, away] = mapEvents(
    [ev("Goal", "Penalty", 1), ev("Goal", "Normal Goal", 2, { assist: { id: null, name: null } })],
    side(1),
    side(2),
  );
  assertEquals(home, {
    minute: 10, extra: null, side: "home", type: "penalty-goal",
    player: "Scorer", related: "Provider", detail: "Penalty",
  });
  assertEquals([away.side, away.related], ["away", null]);
});

Deno.test("mapEvents: drops events for a team that is not in the match, and shootout kicks", () => {
  const out = mapEvents(
    [
      ev("Goal", "Normal Goal", 99),
      ev("Goal", "Penalty", 1, { comments: "Penalty Shootout" }),
      ev("Goal", "Missed Penalty", 2, { comments: "Penalty Shootout" }),
      ev("Goal", "Normal Goal", 1),
    ],
    side(1),
    side(2),
  );
  assertEquals(out.length, 1);
  assertEquals(mapEvents(undefined, side(1), side(2)), []);
  assertEquals(mapEvents("nope", side(1), side(2)), []);
});

Deno.test("mapEvents: sorted by minute then extra, ties keep the API's order", () => {
  const t = (elapsed: number, extra: number | null, name: string) =>
    ev("Card", "Yellow Card", 1, { time: { elapsed, extra }, player: { id: 1, name } });
  const out = mapEvents(
    [t(90, 2, "d"), t(45, null, "a"), t(90, 1, "c"), t(45, 3, "b"), t(90, null, "x"), t(90, null, "y")],
    side(1),
    side(2),
  );
  assertEquals(out.map((e) => e.player), ["a", "b", "x", "y", "c", "d"]);
});

Deno.test("match file: Liverpool v Manchester City events, sides and the red card", () => {
  const f = fileOf(IDS.plFinished);
  assertEquals(f.events.length, 19);
  const red = f.events.filter((e) => e.type === "red");
  assertEquals(red, [{
    minute: 62, extra: null, side: "home", type: "red",
    player: "Ryan Gravenberch", related: null, detail: "Red Card",
  }]);
  // Stoppage time is kept: a yellow card at 90+1.
  const late = f.events.find((e) => e.minute === 90 && e.extra === 1)!;
  assertEquals([late.type, late.side], ["yellow", "home"]);
  // The API's `player` on a substitution is the man coming off, `assist` the man coming on.
  const sub = f.events.find((e) => e.type === "sub")!;
  assertEquals([sub.minute, sub.side, sub.player, sub.related, sub.detail], [56, "away", "I. Ndiaye", "J. Doku", "Substitution 1"]);
  const sorted = [...f.events].sort((a, b) => a.minute - b.minute || (a.extra ?? 0) - (b.extra ?? 0));
  assertEquals(f.events, sorted);
  assertEquals(f.events.filter((e) => e.type === "goal").length, 3);
});

Deno.test("match file: a cancelled goal is a var event, and a live match has its events so far", () => {
  const f = fileOf(IDS.uclLive);
  const v = f.events.find((e) => e.type === "var")!;
  assertEquals([v.detail, v.side, v.player], ["Goal cancelled", "home", "Johnny Cardoso"]);
  assertEquals(f.match.status.live, true);
});

Deno.test("match file: a penalty-shootout final lists no shootout kicks as goals", () => {
  const f = fileOf(IDS.uclFinalPens);
  assertEquals(f.events.filter((e) => e.type === "goal" || e.type === "penalty-goal").length, 2);
  assert(f.events.every((e) => e.minute <= 120), "nothing past extra time");
  assertEquals(f.match.penalties, { home: 4, away: 3 });
});

// ---------- ratings ----------

Deno.test("ratings: rated players only, as numbers, best first, each team on its own side", () => {
  const raw = fixtureById(IDS.plFinished);
  const f = fileOf(IDS.plFinished);
  assert(f.ratings !== null, "ratings present");
  for (const team of ["home", "away"] as const) {
    const list = f.ratings![team];
    assert(list.length > 0, `${team} has ratings`);
    assert(list.every((r) => typeof r.rating === "number" && r.rating > 0), `${team}: numbers`);
    for (let i = 1; i < list.length; i++) assert(list[i - 1].rating >= list[i].rating, `${team}: sorted desc`);
  }
  // The count is what the API rated, nothing more: it leaves out the unused substitutes.
  const entry = (name: string) => raw.players.find((p: { team: { name: string } }) => p.team.name === name);
  const rated = (name: string) =>
    entry(name).players.filter((p: { statistics: { games: { rating: unknown } }[] }) => p.statistics[0].games.rating !== null).length;
  assertEquals(f.ratings!.home.length, rated("Liverpool"));
  assertEquals(f.ratings!.away.length, rated("Manchester City"));
  // One spot check against the raw reply: Alisson, minutes and shirt number carried over.
  const alisson = f.ratings!.home.find((r) => r.name === "Alisson")!;
  assertEquals(alisson, { name: "Alisson", number: 1, minutes: 90, rating: 5.5, id: 280 });
});

Deno.test("ratings: the API player id is carried, and an id of 0 means unknown", () => {
  const f = fileOf(IDS.wslFinished);
  const all = [...f.ratings!.home, ...f.ratings!.away];
  assert(all.every((r) => r.id === null || (Number.isInteger(r.id) && r.id > 0)), "positive ids or null");
  // The recorded WSL reply rates some players under id 0 with no shirt number.
  const unknown = all.filter((r) => r.id === null);
  assert(unknown.length > 0, "the fixture has id-0 players");
  assert(unknown.some((r) => r.name === "Olivia Smith" && r.number === null), "id 0 maps to null");
});

Deno.test("ratings: equal ratings keep the API's order; unparseable ones are left out", () => {
  const fx = fixtureById(IDS.plFinished);
  const home = fx.players.find((p: { team: { id: number } }) => p.team.id === 40);
  const games = (rating: unknown) => ({
    statistics: [{ games: { minutes: 90, number: 1, rating } }],
  });
  home.players = [
    { player: { id: 1, name: "A" }, ...games("7.0") },
    { player: { id: 2, name: "B" }, ...games("8.1") },
    { player: { id: 3, name: "C" }, ...games("7.0") },
    { player: { id: 4, name: "D" }, ...games(null) },
    { player: { id: 5, name: "E" }, ...games("n/a") },
    { player: { id: 6, name: "F" }, ...games(7.5) }, // a bare number is tolerated
    { player: { id: 7, name: "G" }, statistics: [] },
  ];
  const f = mapMatchFile(fx, mapMatch(fx)!, NOW);
  assertEquals(f.ratings!.home.map((r) => [r.name, r.rating]), [["B", 8.1], ["F", 7.5], ["A", 7], ["C", 7]]);
});

Deno.test("ratings: null when the API has rated nobody yet", () => {
  const fx = fixtureById(IDS.uclLive);
  for (const team of fx.players) {
    for (const p of team.players) p.statistics[0].games.rating = null;
  }
  assertEquals(mapMatchFile(fx, mapMatch(fx)!, NOW).ratings, null);
  delete fx.players;
  assertEquals(mapMatchFile(fx, mapMatch(fx)!, NOW).ratings, null);
});

// ---------- stats ----------

Deno.test("stats: possession, shots, cards and xg come across by name, per team", () => {
  const f = fileOf(IDS.plFinished);
  assertEquals(f.stats!.home, {
    possession: "35%", shots: 13, shotsOnTarget: 6, corners: 5, fouls: 19,
    offsides: 2, yellow: 4, red: 1, xg: "0.94", saves: 1, passes: 301, passAccuracy: "80%",
  });
  assertEquals(f.stats!.away.possession, "65%");
});

Deno.test("stats: saves, passes and pass accuracy are null when the API leaves them out", () => {
  const fx = fixtureById(IDS.plFinished);
  const liverpool = fx.statistics.find((s: { team: { id: number } }) => s.team.id === 40);
  liverpool.statistics = liverpool.statistics.filter((s: { type: string }) =>
    !["Goalkeeper Saves", "Total passes", "Passes %"].includes(s.type)
  );
  const f = mapMatchFile(fx, mapMatch(fx)!, NOW);
  assertEquals([f.stats!.home.saves, f.stats!.home.passes, f.stats!.home.passAccuracy], [null, null, null]);
  liverpool.statistics.push({ type: "Passes %", value: 77 }); // a bare number gets its sign
  assertEquals(mapMatchFile(fx, mapMatch(fx)!, NOW).stats!.home.passAccuracy, "77%");
});

Deno.test("stats: with no \"Passes %\", pass accuracy is accurate passes over total passes", () => {
  // The PL reply has all three: 240 of 301 is the API's own "80%".
  const fx = fixtureById(IDS.plFinished);
  const liverpool = fx.statistics.find((s: { team: { id: number } }) => s.team.id === 40);
  liverpool.statistics = liverpool.statistics.filter((s: { type: string }) => s.type !== "Passes %");
  assertEquals(mapMatchFile(fx, mapMatch(fx)!, NOW).stats!.home.passAccuracy, "80%");
  // Three recorded replies leave "Passes %" out altogether.
  assertEquals([fileOf(IDS.uclLive).stats!.home.passAccuracy, fileOf(IDS.uclLive).stats!.away.passAccuracy], ["89%", "82%"]);
  assertEquals(fileOf(IDS.wslFinished).stats!.home.passAccuracy, "84%");
  // No total, a zero total or more accurate passes than passes: null.
  for (const total of [null, 0, 100]) {
    const t = fixtureById(IDS.plFinished);
    const side = t.statistics.find((s: { team: { id: number } }) => s.team.id === 40);
    side.statistics = side.statistics.filter((s: { type: string }) => s.type !== "Passes %");
    side.statistics.find((s: { type: string }) => s.type === "Total passes").value = total;
    assertEquals(mapMatchFile(t, mapMatch(t)!, NOW).stats!.home.passAccuracy, null, String(total));
  }
});

Deno.test("stats: a missing stat is null, a numeric string becomes a number, and stats pair up or are null", () => {
  const fx = fixtureById(IDS.plFinished);
  const liverpool = fx.statistics.find((s: { team: { id: number } }) => s.team.id === 40);
  liverpool.statistics = liverpool.statistics.filter((s: { type: string }) => s.type !== "expected_goals");
  liverpool.statistics.find((s: { type: string }) => s.type === "Corner Kicks").value = "7";
  liverpool.statistics.find((s: { type: string }) => s.type === "Red Cards").value = null;
  const f = mapMatchFile(fx, mapMatch(fx)!, NOW);
  assertEquals([f.stats!.home.xg, f.stats!.home.corners, f.stats!.home.red], [null, 7, null]);

  fx.statistics = fx.statistics.slice(0, 1); // only one team's stats so far
  assertEquals(mapMatchFile(fx, mapMatch(fx)!, NOW).stats, null);
  fx.statistics = [];
  assertEquals(mapMatchFile(fx, mapMatch(fx)!, NOW).stats, null);
});

// ---------- lineups ----------

Deno.test("lineups: formation, coach, starters and subs, with a position only where it is G, D, M or F", () => {
  const f = fileOf(IDS.plFinished);
  const home = f.lineups!.home;
  assertEquals([home.formation, home.coach, home.startXI.length, home.subs.length], ["4-2-3-1", "Andoni Iraola", 11, 9]);
  assertEquals(home.startXI[0], { name: "Alisson", number: 1, pos: "G", id: 280, grid: "1:1" });
  assert([...home.startXI, ...home.subs].every((p) => p.pos === null || "GDMF".includes(p.pos)), "positions");
  assertEquals(f.lineups!.away.coach, "Enzo Maresca");
});

Deno.test("lineups: every starter keeps the API's grid in the API's order; substitutes have none", () => {
  for (const id of [IDS.plFinished, IDS.uclLive, IDS.uclFinished, IDS.wslFinished, IDS.uclFinalPens]) {
    const raw = fixtureById(id);
    const f = mapMatchFile(raw, matchOf(id), NOW);
    for (const side of ["home", "away"] as const) {
      const l = f.lineups![side];
      const teamId = f.match[side].id;
      const entry = raw.lineups.find((e: { team: { id: number } }) => e.team.id === teamId);
      assertEquals(l.startXI.map((p) => p.grid), entry.startXI.map((p: { player: { grid: string } }) => p.player.grid), `${id} ${side}`);
      assertEquals(l.startXI.map((p) => p.id), entry.startXI.map((p: { player: { id: number } }) => p.player.id), `${id} ${side} ids`);
      assert(l.startXI.every((p) => /^\d+:\d+$/.test(p.grid!)), `${id} ${side}: all eleven have a grid`);
      assert(l.subs.every((p) => p.grid === null), `${id} ${side}: no grid on the bench`);
    }
  }
});

Deno.test("lineups: a grid that is not row:col is dropped, an id of 0 is unknown, and a sub never gets a grid", () => {
  const fx = fixtureById(IDS.plFinished);
  const liverpool = fx.lineups.find((e: { team: { id: number } }) => e.team.id === 40);
  liverpool.startXI[0].player.grid = "1:1; color:red";
  liverpool.startXI[1].player.grid = "0:1";
  liverpool.startXI[2].player.id = 0;
  liverpool.substitutes[0].player.grid = "6:1";
  const l = mapMatchFile(fx, mapMatch(fx)!, NOW).lineups!.home;
  assertEquals([l.startXI[0].grid, l.startXI[1].grid, l.startXI[2].id, l.subs[0].grid], [null, null, null, null]);
});

Deno.test("lineups: shirt colours come across as #rrggbb, per shirt, and are null when the API has none", () => {
  // The recorded replies carry no team.colors (stripped with the logos), so the shape is injected.
  assertEquals(fileOf(IDS.plFinished).lineups!.home.colors, null);
  const fx = fixtureById(IDS.plFinished);
  const liverpool = fx.lineups.find((e: { team: { id: number } }) => e.team.id === 40);
  liverpool.team.colors = {
    player: { primary: "E41E2C", number: "FFFFFF", border: "e41e2c" },
    goalkeeper: { primary: "#1A1A1A", number: "ffffff", border: null },
  };
  const l = mapMatchFile(fx, mapMatch(fx)!, NOW).lineups!;
  assertEquals(l.home.colors, {
    player: { primary: "#e41e2c", number: "#ffffff", border: "#e41e2c" },
    goalkeeper: { primary: "#1a1a1a", number: "#ffffff", border: null },
  });
  assertEquals(l.away.colors, null);
  // Only one shirt known: the other is null.
  liverpool.team.colors = { player: null, goalkeeper: { primary: "00ff00" } };
  assertEquals(mapMatchFile(fx, mapMatch(fx)!, NOW).lineups!.home.colors, {
    player: null,
    goalkeeper: { primary: "#00ff00", number: null, border: null },
  });
});

Deno.test("lineups: anything that is not six hex digits is refused, so no colour field can carry a URL or CSS", () => {
  const fx = fixtureById(IDS.plFinished);
  const liverpool = fx.lineups.find((e: { team: { id: number } }) => e.team.id === 40);
  const bad = ["red", "#fff", "fff", "url(x)", "javascript:alert(1)", "ff0000; background:url(x)", " ff0000", "#ff00001", "", 0xff0000, null, {}];
  for (const v of bad) {
    liverpool.team.colors = { player: { primary: v, number: v, border: v }, goalkeeper: { primary: v } };
    assertEquals(mapMatchFile(fx, mapMatch(fx)!, NOW).lineups!.home.colors, null, JSON.stringify(v));
  }
  // A good primary with bad number and border keeps the shirt and drops the rest.
  liverpool.team.colors = { player: { primary: "123abc", number: "url(x)", border: "#12" } };
  assertEquals(mapMatchFile(fx, mapMatch(fx)!, NOW).lineups!.home.colors, {
    player: { primary: "#123abc", number: null, border: null },
    goalkeeper: null,
  });
  liverpool.team.colors = "e41e2c";
  assertEquals(mapMatchFile(fx, mapMatch(fx)!, NOW).lineups!.home.colors, null);
});

Deno.test("lineups: matched to the teams by id, not by position in the array; null until announced", () => {
  const fx = fixtureById(IDS.plFinished);
  const straight = mapMatchFile(fx, mapMatch(fx)!, NOW).lineups;
  fx.lineups.reverse();
  assertEquals(mapMatchFile(fx, mapMatch(fx)!, NOW).lineups, straight);

  fx.lineups[0].startXI = []; // one side not announced: show neither
  assertEquals(mapMatchFile(fx, mapMatch(fx)!, NOW).lineups, null);
  fx.lineups = [];
  assertEquals(mapMatchFile(fx, mapMatch(fx)!, NOW).lineups, null);
});

// ---------- the file ----------

Deno.test("match file: envelope, and the WSL file shows club names", () => {
  const m = matchOf(IDS.wslFinished);
  const f = mapMatchFile(fixtureById(IDS.wslFinished), { ...m, detail: detailPath(m.id) }, NOW);
  assertEquals(
    [f.schema, f.source, f.generatedAt, f.match.detail],
    ["archv-match/1", "API-Football", NOW, "match/1607697.json"],
  );
  assertEquals(Object.keys(f), ["schema", "generatedAt", "source", "match", "events", "lineups", "ratings", "stats"]);
  assertEquals([f.match.home.name, f.match.away.name], ["Manchester City", "Arsenal"]);
  assertEquals([f.match.home.goals, f.match.away.goals], [4, 2]);
  assert(f.lineups !== null && f.ratings !== null && f.stats !== null, "a finished WSL match has all three");
});

Deno.test("match file: a fixture with nothing but a score is still a valid file", () => {
  const fx = fixtureById(IDS.uclLive);
  const bare = { fixture: fx.fixture, league: fx.league, teams: fx.teams, goals: fx.goals, score: fx.score };
  const f = mapMatchFile(bare, mapMatch(bare)!, NOW);
  assertEquals([f.events, f.lineups, f.ratings, f.stats], [[], null, null, null]);
});

// ---------- text ----------

Deno.test("names: a double-encoded name from the API is repaired, and invisible characters are removed", () => {
  // The recorded reply has "Dani MartÃ" + U+00AD + "nez", the API's own mis-encoding of "Martínez".
  const f = fileOf(IDS.uclLive);
  const names = [f.lineups!.home, f.lineups!.away].flatMap((l) => [...l.startXI, ...l.subs].map((p) => p.name));
  assert(names.includes("Dani Martínez"), "repaired in the lineups");
  assert(!/[\u00ad\u00c3]/.test(JSON.stringify(f)), "no soft hyphen or mojibake left in the file");

  assertEquals(tidy("A\u200bB\ufeff\u00adC\u2060"), "ABC");
  // Real accents, and a stray Ã that is not part of a pair, are left alone.
  for (const ok of ["Müller", "Ñoño", "Hakan Çalhanoğlu", "Ã", "Zaïre-Emery", "Kvaratskhelia"]) {
    assertEquals(tidy(ok), ok);
  }
  assertEquals(tidy("  padded  "), "padded");
});

Deno.test("normaliseMatch: a stored match comes back exactly as mapMatch built it, keys in order", () => {
  const sorted = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sorted);
    if (v && typeof v === "object") {
      return Object.fromEntries(
        Object.entries(v).sort(([a], [b]) => a.length - b.length || (a < b ? -1 : 1)).map(([k, x]) => [k, sorted(x)]),
      );
    }
    return v;
  };
  for (const id of [IDS.plFinished, IDS.uclLive, IDS.wslFinished, IDS.uclFinalPens]) {
    const m = matchOf(id);
    assert(JSON.stringify(sorted(m)) !== JSON.stringify(m), "the test needs a reordering to undo");
    assertEquals(JSON.stringify(normaliseMatch(sorted(m))), JSON.stringify(m), String(id));
  }
  // Junk is refused, not repaired into something that looks like a match.
  for (const bad of [null, 7, "x", [], {}, { ...matchOf(IDS.plFinished), id: "abc" }, { ...matchOf(IDS.plFinished), kickoff: "soon" },
    { ...matchOf(IDS.plFinished), home: null }, { ...matchOf(IDS.plFinished), competition: { key: "la-liga" } }]) {
    assertEquals(normaliseMatch(bad), null, JSON.stringify(bad)?.slice(0, 60));
  }
});
