// Tests for the season backfill (backfill.ts): day bucketing across the season, batching of the
// details calls, an index that only grows, idempotence, and resuming after the time budget runs out
// or a call fails. The season is synthetic: the recorded finished Champions League match cloned
// under new ids and dates, so a real details reply (events, lineups, ratings, stats) backs each one.
// Run: `deno test` from this dir. No network, no permissions.
import type { ApiGet } from "./api.ts";
import { BUDGET_MS, runBackfill } from "./backfill.ts";
import { INDEX_PATH } from "./days.ts";
import { assert, assertEquals, fixtureById, IDS, memoryStore } from "./testkit.ts";

// deno-lint-ignore no-explicit-any
type Fx = any;

const NOW = new Date("2026-10-14T18:00:00Z"); // noon on the 14th in Edmonton: yesterday is the 13th
const LEAGUES: Record<string, { id: number; name: string }> = {
  "39": { id: 39, name: "Premier League" },
  "2": { id: 2, name: "UEFA Champions League" },
  "44": { id: 44, name: "FA WSL" },
};

// A fixture on `date` (an ISO instant) in a league, with the recorded finished match behind it.
function fixture(id: number, date: string, league: string, status = "FT"): Fx {
  const fx = fixtureById(IDS.uclFinished);
  fx.fixture.id = id;
  fx.fixture.date = date;
  fx.fixture.status = { long: status === "FT" ? "Match Finished" : status, short: status, elapsed: status === "FT" ? 90 : null, extra: null };
  fx.league.id = LEAGUES[league].id;
  fx.league.name = LEAGUES[league].name;
  if (status === "PST" || status === "NS") {
    fx.goals = { home: null, away: null };
    delete fx.events;
    delete fx.lineups;
    delete fx.statistics;
    delete fx.players;
  }
  return fx;
}

// The list endpoint answers with the fixtures themselves, the ids= endpoint with the same fixtures
// (this is what the real API does: one shape for both).
function fakeApi(
  season: Fx[],
  opts: { fail?: (path: string) => string | null; omit?: (id: number) => boolean } = {},
) {
  const calls: string[] = [];
  const api: ApiGet = (path) => {
    calls.push(path);
    const reason = opts.fail?.(path);
    if (reason) return Promise.resolve({ ok: false as const, reason, remaining: null });
    const q = new URLSearchParams(path.split("?")[1]);
    let fixtures: Fx[];
    if (q.has("ids")) {
      const ids = q.get("ids")!.split("-").map(Number);
      fixtures = season.filter((f) => ids.includes(f.fixture.id) && !opts.omit?.(f.fixture.id));
    } else {
      fixtures = season.filter((f) => f.league.id === Number(q.get("league")));
    }
    return Promise.resolve({ ok: true as const, fixtures: structuredClone(fixtures), remaining: 7000 - calls.length });
  };
  return { api, calls };
}

// `perDay` finished matches on each of `days` consecutive days from `first`, spread across the
// leagues, kicking off at 15:00Z, 17:30Z and so on.
function seasonOf(first: string, days: number, perDay: number, idBase = 1000): Fx[] {
  const out: Fx[] = [];
  const start = Date.parse(`${first}T00:00:00Z`);
  const leagues = ["39", "2", "44"];
  for (let d = 0; d < days; d++) {
    for (let k = 0; k < perDay; k++) {
      const at = new Date(start + d * 86_400_000 + (15 * 60 + k * 15) * 60_000).toISOString();
      out.push(fixture(idBase + d * 100 + k, at, leagues[k % 3]));
    }
  }
  return out;
}

const json = (store: ReturnType<typeof memoryStore>, path: string) => JSON.parse(store.files.get(path)!);
const run = (
  from: string,
  season: Fx[],
  store: ReturnType<typeof memoryStore>,
  extra: { clock?: () => number; budgetMs?: number; api?: ReturnType<typeof fakeApi> } = {},
) => {
  const fake = extra.api ?? fakeApi(season);
  return runBackfill(from, {
    now: NOW,
    season: 2026,
    api: fake.api,
    read: store.read,
    write: store.write,
    clock: extra.clock,
    budgetMs: extra.budgetMs,
  }).then((summary) => ({ summary, calls: fake.calls }));
};

Deno.test("a backfill writes every match file, a file per day, and the index, in 3 + n/20 requests", async () => {
  // Six days of 7 matches: 42 finished matches, so three details calls of 20, 20 and 2.
  const season = seasonOf("2026-10-08", 6, 7);
  const store = memoryStore();
  const { summary, calls } = await run("2026-10-08", season, store);

  assertEquals(calls.filter((c) => c.includes("league=")), [
    "/fixtures?league=39&season=2026",
    "/fixtures?league=2&season=2026",
    "/fixtures?league=44&season=2026",
  ]);
  const detail = calls.filter((c) => c.includes("ids="));
  assertEquals(detail.map((c) => c.split("ids=")[1].split("-").length), [20, 20, 2]);
  assertEquals(summary, {
    ok: true, done: true, from: "2026-10-08", to: "2026-10-13", next: null, requests: 6, remaining: 6994,
    days: 6, daysWritten: 6, daysUnchanged: 0, matches: 42, matchFilesWritten: 42, matchFilesUnchanged: 0, noDetails: 0,
  });

  assertEquals(json(store, INDEX_PATH).days, [
    { date: "2026-10-13", count: 7 }, { date: "2026-10-12", count: 7 }, { date: "2026-10-11", count: 7 },
    { date: "2026-10-10", count: 7 }, { date: "2026-10-09", count: 7 }, { date: "2026-10-08", count: 7 },
  ]);
  const day = json(store, "days/2026-10-11.json");
  assertEquals([day.schema, day.date, day.source], ["archv-day/1", "2026-10-11", "API-Football"]);
  assertEquals(day.matches.length, 7);
  for (const m of day.matches) {
    assertEquals(m.detail, `match/${m.id}.json`);
    const file = json(store, m.detail);
    assertEquals(file.schema, "archv-match/1");
    assertEquals(file.match.detail, m.detail);
    assert(file.events.length > 0 && file.ratings !== null, "a real details reply backs the file");
  }
  // Matches from the three leagues all landed, grouped as scores.json would have them.
  assertEquals(new Set(day.matches.map((m: { competition: { key: string } }) => m.competition.key)).size, 3);
});

Deno.test("a second run changes nothing: same requests, no writes", async () => {
  const season = seasonOf("2026-10-08", 6, 7);
  const store = memoryStore();
  await run("2026-10-08", season, store);
  const files = new Map(store.files);
  const writes = store.writes.length;

  const again = await run("2026-10-08", season, store);
  assertEquals(again.summary.requests, 6);
  assertEquals(
    [again.summary.done, again.summary.daysWritten, again.summary.daysUnchanged, again.summary.matchFilesWritten, again.summary.matchFilesUnchanged],
    [true, 0, 6, 0, 42],
  );
  assertEquals(store.writes.length, writes);
  assertEquals([...store.files.entries()], [...files.entries()]);
});

Deno.test("the range is from..yesterday: earlier days, today and tomorrow are left out", async () => {
  const season = [
    ...seasonOf("2026-10-09", 6, 2), // the 9th to the 14th
    fixture(9001, "2026-10-15T19:00:00Z", "2", "NS"), // tomorrow
  ];
  const store = memoryStore();
  const { summary } = await run("2026-10-11", season, store);
  assertEquals([summary.days, summary.matches, summary.done], [3, 6, true]); // the 11th, 12th and 13th
  assertEquals(json(store, INDEX_PATH).days.map((d: { date: string }) => d.date), ["2026-10-13", "2026-10-12", "2026-10-11"]);
  assertEquals([...store.files.keys()].filter((p) => p.startsWith("days/")).sort(), [
    "days/2026-10-11.json", "days/2026-10-12.json", "days/2026-10-13.json", INDEX_PATH,
  ]);
});

Deno.test("days are cut on the Edmonton calendar, not the UTC one", async () => {
  const season = [
    fixture(1, "2026-10-12T21:30:00Z", "39"), // 15:30 on the 12th
    fixture(2, "2026-10-13T03:30:00Z", "2"), // 21:30 on the 12th in Edmonton, the 13th in London
    fixture(3, "2026-10-13T06:00:00Z", "2"), // exactly midnight: the 13th starts here
    fixture(4, "2026-10-14T05:59:00Z", "2"), // 23:59 on the 13th
    fixture(5, "2026-10-14T06:00:00Z", "2"), // the 14th: today, out of range
  ];
  const store = memoryStore();
  const { summary } = await run("2026-10-12", season, store);
  assertEquals(summary.matches, 4);
  assertEquals(json(store, "days/2026-10-12.json").matches.map((m: { id: number }) => m.id), [1, 2]);
  assertEquals(json(store, "days/2026-10-13.json").matches.map((m: { id: number }) => m.id), [3, 4]);
});

Deno.test("postponed and cancelled fixtures are in their day's file with their status, and have no file of their own", async () => {
  const season = [
    ...seasonOf("2026-10-12", 1, 2),
    fixture(7001, "2026-10-12T19:00:00Z", "39", "PST"),
    fixture(7002, "2026-10-13T19:00:00Z", "2", "CANC"),
    fixture(7003, "2026-10-13T20:00:00Z", "2", "NS"), // overdue and unplayed: shown as the API says
  ];
  const store = memoryStore();
  const { summary, calls } = await run("2026-10-12", season, store);
  assertEquals(summary.done, true);
  // Only the two finished matches are asked for.
  assertEquals(calls.filter((c) => c.includes("ids=")).map((c) => c.split("ids=")[1]).join("-").split("-").length, 2);
  const d12 = json(store, "days/2026-10-12.json").matches;
  const pst = d12.find((m: { id: number }) => m.id === 7001);
  assertEquals([pst.status.code, pst.status.finished, pst.detail], ["PST", false, null]);
  assertEquals(d12.length, 3);
  const d13 = json(store, "days/2026-10-13.json").matches;
  assertEquals(d13.map((m: { status: { code: string } }) => m.status.code), ["CANC", "NS"]);
  assert(!store.files.has("match/7001.json") && !store.files.has("match/7002.json"));
  assertEquals(json(store, INDEX_PATH).days, [{ date: "2026-10-13", count: 2 }, { date: "2026-10-12", count: 3 }]);
});

Deno.test("a day of only postponed fixtures is written without any details call for it", async () => {
  const season = [fixture(7001, "2026-10-12T19:00:00Z", "39", "PST")];
  const store = memoryStore();
  const { summary, calls } = await run("2026-10-12", season, store);
  assertEquals([summary.done, summary.requests, calls.some((c) => c.includes("ids="))], [true, 3, false]);
  assertEquals(json(store, INDEX_PATH).days, [{ date: "2026-10-12", count: 1 }]);
});

// The clock moves a minute on for every details call made, so a budget of 100 s lets the first
// group of three calls through and stops before the next.
function jumpingClock(api: ReturnType<typeof fakeApi>) {
  return { clock: () => api.calls.filter((c) => c.includes("ids=")).length * 60_000 };
}

Deno.test("out of time: it stops cleanly, says where to carry on, and the next call finishes the job", async () => {
  // Ten days of 10: 100 finished matches, five details calls, run three at a time.
  const season = seasonOf("2026-10-02", 10, 10);
  const store = memoryStore();
  const api = fakeApi(season);
  const first = await run("2026-10-02", season, store, { api, ...jumpingClock(api), budgetMs: BUDGET_MS });

  assertEquals(first.summary.ok, true, "a spent budget is not an error");
  assertEquals(first.summary.done, false);
  // The first group of three calls covered 60 matches, which is the first six days.
  assertEquals(first.summary.next, "2026-10-08");
  assertEquals(first.summary.requests, 3 + 3);
  assertEquals(json(store, INDEX_PATH).days.map((d: { date: string }) => d.date), [
    "2026-10-07", "2026-10-06", "2026-10-05", "2026-10-04", "2026-10-03", "2026-10-02",
  ]);
  assert(!store.files.has("days/2026-10-08.json"), "a day not reached has no file");

  // Carry on from `next`: only what is left is asked for.
  const api2 = fakeApi(season);
  const second = await run(first.summary.next!, season, store, { api: api2 });
  assertEquals(second.summary.done, true);
  assertEquals(second.summary.next, null);
  assertEquals(second.summary.requests, 3 + 2); // 40 matches left: two details calls
  assertEquals(api2.calls.filter((c) => c.includes("ids=")).map((c) => c.split("ids=")[1].split("-").length), [20, 20]);
  assertEquals(second.summary.matchFilesWritten, 40);

  // And what is stored is exactly what one uninterrupted run stores.
  const whole = memoryStore();
  await run("2026-10-02", season, whole);
  assertEquals(
    [...store.files.entries()].map(([p, t]) => [p, t.replace(/"generatedAt":"[^"]*"/g, "")]).sort(),
    [...whole.files.entries()].map(([p, t]) => [p, t.replace(/"generatedAt":"[^"]*"/g, "")]).sort(),
  );
});

Deno.test("the index only grows: older days are kept, and the days it rebuilds are replaced", async () => {
  const season = seasonOf("2026-10-12", 2, 3);
  const store = memoryStore();
  store.files.set(INDEX_PATH, JSON.stringify({
    schema: "archv-days/1",
    generatedAt: "2026-10-10T00:00:00.000Z",
    days: [{ date: "2026-10-13", count: 99 }, { date: "2026-10-01", count: 8 }, { date: "2026-08-15", count: 10 }],
  }));
  await run("2026-10-12", season, store);
  assertEquals(json(store, INDEX_PATH).days, [
    { date: "2026-10-13", count: 3 }, // corrected
    { date: "2026-10-12", count: 3 },
    { date: "2026-10-01", count: 8 }, // kept
    { date: "2026-08-15", count: 10 }, // kept
  ]);
});

Deno.test("an index it cannot read stops the run before any request or write", async () => {
  const season = seasonOf("2026-10-12", 2, 3);
  const bad = memoryStore();
  bad.files.set(INDEX_PATH, "garbage");
  const r1 = await run("2026-10-12", season, bad);
  assertEquals([r1.summary.ok, r1.summary.done, r1.summary.requests, r1.calls.length, bad.writes.length], [false, false, 0, 0, 0]);
  assert(String(r1.summary.error).includes("not readable"));
  assertEquals(bad.files.get(INDEX_PATH), "garbage");

  const down = memoryStore({ unreadable: (p) => p === INDEX_PATH });
  const r2 = await run("2026-10-12", season, down);
  assertEquals([r2.summary.ok, r2.summary.requests, down.writes.length], [false, 0, 0]);
});

Deno.test("a league that will not list stops the run with nothing written", async () => {
  const season = seasonOf("2026-10-12", 2, 3);
  const store = memoryStore();
  const api = fakeApi(season, { fail: (p) => (p.includes("league=44") ? "HTTP 500" : null) });
  const r = await run("2026-10-12", season, store, { api });
  assertEquals([r.summary.ok, r.summary.done, r.summary.next, r.summary.requests], [false, false, "2026-10-12", 3]);
  assert(String(r.summary.error).includes("wsl: HTTP 500"));
  assertEquals(store.writes, []);
});

Deno.test("a failed details call leaves its days open, reports the first of them, and a retry finishes", async () => {
  const season = seasonOf("2026-10-08", 6, 7); // 42 matches, calls of 20, 20, 2
  const store = memoryStore();
  let broken = true;
  const flaky = fakeApi(season, {
    fail: (p) => (broken && p.includes("ids=") && p.includes(String(1000 + 3 * 100)) ? "HTTP 429" : null),
  });
  const r = await run("2026-10-08", season, store, { api: flaky });
  assertEquals(r.summary.ok, false);
  assertEquals(r.summary.done, false);
  assert(String(r.summary.error).includes("details: HTTP 429"));
  // Days 8 and 9 (14 matches) were in the first call and are in place; the rest are not.
  assert(store.files.has("days/2026-10-08.json") && store.files.has("days/2026-10-09.json"));
  assert(!store.files.has("days/2026-10-13.json"));
  const next = r.summary.next!;
  assert(next > "2026-10-09", "next is the first day still open");

  broken = false;
  const again = await run(next, season, store);
  assertEquals([again.summary.ok, again.summary.done], [true, true]);
  assertEquals(json(store, INDEX_PATH).days.length, 6);
});

Deno.test("an upload that fails holds its day back; the day and its index entry arrive on the retry", async () => {
  const season = seasonOf("2026-10-12", 2, 3);
  let down = true;
  const store = memoryStore({ failOn: (p) => down && p === "match/1101.json" });
  const r = await run("2026-10-12", season, store);
  assertEquals([r.summary.ok, r.summary.done, r.summary.next], [false, false, "2026-10-13"]);
  assert(String(r.summary.error).includes("match/1101.json"));
  assert(store.files.has("days/2026-10-12.json"));
  assert(!store.files.has("days/2026-10-13.json"), "a day with a missing match file is not written");
  assertEquals(json(store, INDEX_PATH).days, [{ date: "2026-10-12", count: 3 }]);

  down = false;
  const again = await run("2026-10-12", season, store);
  assertEquals([again.summary.ok, again.summary.done, again.summary.matchFilesWritten, again.summary.daysWritten], [true, true, 1, 1]);
  assertEquals(json(store, INDEX_PATH).days.length, 2);
});

Deno.test("a match the API has no details for is listed without a pointer and does not block its day", async () => {
  const season = seasonOf("2026-10-12", 1, 3);
  const store = memoryStore();
  const api = fakeApi(season, { omit: (id) => id === 1001 });
  const r = await run("2026-10-12", season, store, { api });
  assertEquals([r.summary.ok, r.summary.done, r.summary.noDetails, r.summary.matchFilesWritten], [true, true, 1, 2]);
  const d = json(store, "days/2026-10-12.json").matches;
  assertEquals(d.map((m: { id: number; detail: string | null }) => [m.id, m.detail]), [
    [1000, "match/1000.json"], [1001, null], [1002, "match/1002.json"],
  ]);
  assert(!store.files.has("match/1001.json"));
});

Deno.test("a from that is not a date, or is after yesterday, does no work", async () => {
  const store = memoryStore();
  const bad = await run("2026-13-45", [], store);
  assertEquals([bad.summary.ok, bad.summary.requests, bad.summary.done, bad.calls.length], [false, 0, false, 0]);
  assert(String(bad.summary.error).includes("YYYY-MM-DD"));
  const missing = await run("", [], store);
  assertEquals(missing.summary.ok, false);

  const future = await run("2026-10-14", seasonOf("2026-10-14", 1, 2), store); // today
  assertEquals([future.summary.ok, future.summary.done, future.summary.requests, future.calls.length, store.writes.length], [true, true, 0, 0, 0]);
});

Deno.test("a season with nothing in the range is done, and writes no index", async () => {
  const store = memoryStore();
  const r = await run("2026-10-01", [], store);
  assertEquals([r.summary.ok, r.summary.done, r.summary.days, r.summary.requests, store.writes.length], [true, true, 0, 3, 0]);
});

Deno.test("it never touches the poll's state: its only I/O is the API and the bucket", async () => {
  // runBackfill's deps are the API, read and write; there is no state parameter to reach. What this
  // pins down is that the files it writes are only the three kinds the archive owns.
  const season = seasonOf("2026-10-12", 2, 3);
  const store = memoryStore();
  await run("2026-10-12", season, store);
  for (const p of store.files.keys()) assert(/^(days\/\d{4}-\d{2}-\d{2}|days\/index|match\/\d+)\.json$/.test(p), p);
  assert(!store.files.has("scores.json"), "scores.json belongs to the live poll");
});
