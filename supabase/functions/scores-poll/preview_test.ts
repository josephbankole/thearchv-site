// Unit tests for the match preview (preview.ts): head to head out of the synthetic headtohead reply,
// when to ask for it again, and which earlier match a side's last lineup is read from. Run:
// `deno test` from this dir. No network, no permissions.
import { mapMatch, mapMatchFile, type Match } from "./map.ts";
import {
  buildH2h,
  buildPreview,
  H2H_REFRESH_MS,
  lineupCandidates,
  lineupFromMatchFile,
  mapH2hRow,
  shouldFetchH2h,
  storedH2h,
} from "./preview.ts";
import { assert, assertEquals, fixtureById, IDS } from "./testkit.ts";
import { type Fx, h2hReply, kickoffIn, NOW } from "./season_testkit.ts";

// Liverpool v Manchester City, not started, three days out. 1557600 is also a row in the synthetic
// reply, which must be left out of its own head to head.
function upcoming(id = 1557600, days = 3, key: Match["competition"]["key"] = "premier-league"): Match {
  const wsl = key === "wsl";
  return {
    id,
    competition: {
      key,
      name: wsl ? "FA WSL" : "Premier League",
      round: "Regular Season - 10",
    },
    kickoff: kickoffIn(NOW, days),
    status: { code: "NS", minute: null, extra: null, live: false, finished: false },
    home: { id: wsl ? 1854 : 40, name: wsl ? "Manchester City" : "Liverpool", goals: null },
    away: { id: wsl ? 1850 : 50, name: wsl ? "Arsenal" : "Manchester City", goals: null },
    penalties: null,
    venue: null,
    detail: null,
  };
}

const FETCHED = "2026-10-27T12:00:00.000Z";

Deno.test("h2h: competitive finished meetings of the two sides, newest first, counted from the fixture's side", () => {
  const h = buildH2h(h2hReply().response, upcoming(), FETCHED)!;
  assertEquals(h.matches.map((r) => r.id), [1208001, 1208002, 1208004, 1208003, 1208005, 1208008]);
  // Liverpool (this fixture's home side) won 1208002 away and 1208004 at home; City won 1208001;
  // the League Cup shootout (1-1, 5-4 on penalties) counts as a draw.
  assertEquals(h.summary, { played: 6, homeWins: 2, draws: 3, awayWins: 1 });
  assertEquals(h.fetchedAt, FETCHED);
  const cup = h.matches.find((r) => r.id === 1208005)!;
  assertEquals(cup.penalties, { home: 5, away: 4 });
  assertEquals(cup.competition, { id: 48, name: "League Cup", key: null });
  assertEquals(h.matches[0].competition, { id: 39, name: "Premier League", key: "premier-league" });
  assertEquals(h.matches[0], {
    id: 1208001,
    kickoff: "2025-11-09T16:30:00+00:00",
    competition: { id: 39, name: "Premier League", key: "premier-league" },
    status: { code: "FT", finished: true },
    home: { id: 50, name: "Manchester City", goals: 3 },
    away: { id: 40, name: "Liverpool", goals: 0 },
    penalties: null,
  });
});

Deno.test("h2h: friendlies, unfinished rows, the fixture itself and a row with no league are dropped", () => {
  const rows = h2hReply().response;
  const byId = (id: number) => rows.find((r: Fx) => r.fixture.id === id);
  assertEquals(mapH2hRow(byId(1208006), "premier-league"), null); // league 667, type Friendly
  assertEquals(mapH2hRow(byId(1208009), "premier-league"), null); // no league
  // A friendly by id alone, or by name alone, is a friendly too.
  const byIdOnly = structuredClone(byId(1208001));
  byIdOnly.league = { id: 10, name: "Friendlies" };
  assertEquals(mapH2hRow(byIdOnly, "premier-league"), null);
  const byName = structuredClone(byId(1208001));
  byName.league = { id: 9999, name: "Club Friendlies" };
  assertEquals(mapH2hRow(byName, "premier-league"), null);
  const ids = buildH2h(rows, upcoming(), FETCHED)!.matches.map((r) => r.id);
  for (const gone of [1208006, 1208007, 1557600, 1208009, 1208010]) assert(!ids.includes(gone), String(gone));
});

Deno.test("h2h: nothing from a row's logo, flag, photo, venue, round or referee reaches the file", () => {
  const text = JSON.stringify(buildH2h(h2hReply().response, upcoming(), FETCHED));
  assert(text.includes("1208008"), "the row carrying the URLs is kept");
  assert(!/http|logo|photo|flag|referee|venue|round|Stadium/i.test(text), "no URL or extra field");
});

Deno.test("h2h: in a WSL preview, \"Arsenal W\" reads \"Arsenal\", whatever competition the row is from", () => {
  const h = buildH2h(h2hReply().response, upcoming(1607800, 3, "wsl"), FETCHED)!;
  assertEquals(h.matches.length, 1);
  const r = h.matches[0];
  assertEquals([r.home.name, r.away.name, r.competition.name, r.competition.key], ["Arsenal", "Manchester City", "FA WSL Cup", null]);
  assertEquals(h.summary, { played: 1, homeWins: 0, draws: 0, awayWins: 1 });
  // Outside a WSL preview the name is left alone.
  assertEquals(mapH2hRow(h2hReply().response.find((x: Fx) => x.fixture.id === 1208010), "premier-league")!.home.name, "Arsenal W");
});

Deno.test("h2h: an empty reply is \"never met\"; a reply where nothing can be placed is a failure", () => {
  assertEquals(buildH2h([], upcoming(), FETCHED), {
    fetchedAt: FETCHED,
    summary: { played: 0, homeWins: 0, draws: 0, awayWins: 0 },
    matches: [],
  });
  assertEquals(buildH2h([{}, { fixture: { id: 1 } }, null, "x"], upcoming(), FETCHED), null);
  // Only friendlies is an honest nothing, not a failure.
  const friendly = h2hReply().response.filter((r: Fx) => r.fixture.id === 1208006);
  assertEquals(buildH2h(friendly, upcoming(), FETCHED)!.summary.played, 0);
});

Deno.test("h2h: at most ten meetings", () => {
  const base = h2hReply().response.find((r: Fx) => r.fixture.id === 1208001);
  const many = Array.from({ length: 14 }, (_, i) => {
    const r = structuredClone(base);
    r.fixture.id = 1300000 + i;
    r.fixture.date = `20${10 + i}-01-01T15:00:00+00:00`;
    return r;
  });
  const h = buildH2h(many, upcoming(), FETCHED)!;
  assertEquals([h.summary.played, h.matches[0].id, h.matches[9].id], [10, 1300013, 1300004]);
});

Deno.test("h2h refresh: none beyond 7 days, first fetch inside them, then only on a newer meeting or once inside 48 h", () => {
  const far = upcoming(1557600, 8);
  assertEquals(shouldFetchH2h(far, null, [], NOW), false);
  const m = upcoming(1557600, 3);
  assertEquals(shouldFetchH2h(m, null, [], NOW), true);
  const held = buildH2h(h2hReply().response, m, NOW.toISOString())!;
  assertEquals(shouldFetchH2h(m, held, [], NOW), false);

  // A finished meeting in the listings that kicked off after the block was fetched.
  const later = new Date(NOW.getTime() + 12 * 3_600_000); // still more than 48 h before kickoff
  const meeting: Match = {
    ...m,
    id: 1635999,
    kickoff: new Date(NOW.getTime() + 2 * 3_600_000).toISOString(),
    status: { code: "FT", minute: 90, extra: null, live: false, finished: true },
  };
  assertEquals(shouldFetchH2h(m, held, [meeting], later), true);
  // One between other teams, or one before the fetch, changes nothing.
  assertEquals(shouldFetchH2h(m, held, [{ ...meeting, away: { id: 33, name: "Manchester United", goals: 1 } }], later), false);
  assertEquals(shouldFetchH2h(m, held, [{ ...meeting, kickoff: "2026-10-01T15:00:00+00:00" }], later), false);

  // Inside 48 hours: once, when the block predates the 48-hour mark.
  const kickoff = Date.parse(m.kickoff);
  const inside = new Date(kickoff - H2H_REFRESH_MS + 3_600_000);
  assertEquals(shouldFetchH2h(m, held, [], inside), true);
  const refreshed = { ...held, fetchedAt: inside.toISOString() };
  assertEquals(shouldFetchH2h(m, refreshed, [], new Date(inside.getTime() + 3_600_000)), false);
});

Deno.test("stored previews: the h2h block reads back exactly, and anything damaged reads as none", () => {
  const m = upcoming();
  const h = buildH2h(h2hReply().response, m, FETCHED)!;
  const file = buildPreview(m, h, { home: null, away: null }, FETCHED);
  assertEquals(storedH2h(JSON.stringify(file)), h);
  assertEquals(storedH2h(JSON.stringify({ ...file, h2h: null })), null);
  assertEquals(storedH2h(JSON.stringify({ ...file, schema: "archv-match/1" })), null);
  assertEquals(storedH2h(JSON.stringify({ ...file, h2h: { ...h, fetchedAt: "soon" } })), null);
  assertEquals(storedH2h(JSON.stringify({ ...file, h2h: { ...h, summary: { ...h.summary, played: 9 } } })), null);
  assertEquals(storedH2h("{ not json"), null);
  assertEquals(storedH2h(null), null);
  // A stored row carrying an extra field comes back without it.
  const tampered = structuredClone(file);
  (tampered.h2h!.matches[0] as unknown as Record<string, unknown>).logo = "https://x";
  assert(!JSON.stringify(storedH2h(JSON.stringify(tampered))).includes("logo"), "rebuilt field by field");
});

Deno.test("last lineup: the side's newest earlier finished matches, at most three, read by team id", () => {
  const fx = fixtureById(IDS.plFinished);
  const done = mapMatch(fx)!; // Liverpool 0-3 Manchester City
  const file = JSON.stringify(mapMatchFile(fx, done, FETCHED));
  assertEquals(lineupFromMatchFile(file, 40)!.coach, "Andoni Iraola");
  assertEquals(lineupFromMatchFile(file, 50)!.coach, "Enzo Maresca");
  assertEquals(lineupFromMatchFile(file, 33), null);
  assertEquals(lineupFromMatchFile(null, 40), null);
  assertEquals(lineupFromMatchFile("{}", 40), null);

  const m = upcoming();
  const past = (id: number, days: number, finished = true): Match => ({
    ...done,
    id,
    kickoff: kickoffIn(NOW, days),
    status: finished ? done.status : { code: "NS", minute: null, extra: null, live: false, finished: false },
  });
  const held = [past(1, -30), past(2, -20), past(3, -10), past(4, -5), past(5, 1, false), past(6, 10)];
  assertEquals(lineupCandidates(m, 40, held).map((x) => x.id), [4, 3, 2]);
  assertEquals(lineupCandidates(m, 33, held), []);
});
