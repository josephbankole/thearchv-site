// Tests for the day archive helpers (days.ts): which day a match belongs to, the day file, and the
// index and its merge. Run: `deno test` from this dir. No network, no permissions.
import {
  buildDayFile,
  buildIndex,
  DAY_SCHEMA,
  DAYS_SCHEMA,
  dayOf,
  dayPath,
  groupByDay,
  isDay,
  mergeIndex,
  parseIndex,
} from "./days.ts";
import { mapMatch, type Match, sortMatches } from "./map.ts";
import { assert, assertEquals, fixtureById, IDS, SCHEDULES } from "./testkit.ts";

const scheduled = (): Match[] =>
  Object.values(SCHEDULES).flatMap((e) => e.response).map((fx) => mapMatch(fx)!);

Deno.test("isDay accepts real calendar days and nothing else", () => {
  assertEquals(["2026-10-13", "2024-02-29", "2026-12-31"].map(isDay), [true, true, true]);
  assertEquals(
    ["2026-02-30", "2025-02-29", "2026-13-01", "2026-10-1", "20261013", "", "2026-10-13T00:00:00Z"].map(isDay),
    [false, false, false, false, false, false, false],
  );
  assertEquals([isDay(null), isDay(20261013), isDay(undefined)], [false, false, false]);
});

Deno.test("a match belongs to the Edmonton day it kicks off on, summer and winter", () => {
  // Summer (MDT, UTC-6): Edmonton midnight is 06:00Z.
  assertEquals(dayOf("2026-10-13T16:45:00+00:00"), "2026-10-13");
  assertEquals(dayOf("2026-10-14T03:30:00+00:00"), "2026-10-13"); // 21:30 in Edmonton
  assertEquals(dayOf("2026-10-14T05:59:59+00:00"), "2026-10-13");
  assertEquals(dayOf("2026-10-14T06:00:00+00:00"), "2026-10-14");
  // Winter (MST, UTC-7): midnight is 07:00Z. The clocks went back on 1 November.
  assertEquals(dayOf("2026-11-02T06:59:59+00:00"), "2026-11-01");
  assertEquals(dayOf("2026-11-02T07:00:00+00:00"), "2026-11-02");
  // An offset in the string is honoured, not read as UTC.
  assertEquals(dayOf("2026-10-14T00:30:00+01:00"), "2026-10-13"); // 23:30Z on the 13th
});

Deno.test("groupByDay buckets by Edmonton day, each day in scores.json order", () => {
  const byDay = groupByDay(scheduled());
  assertEquals([...byDay.keys()].sort(), [
    "2026-10-03", "2026-10-04", "2026-10-10", "2026-10-11", "2026-10-12", "2026-10-13", "2026-10-14",
  ]);
  assertEquals(byDay.get("2026-10-12")!.map((m) => m.id), [1557420]);
  const day13 = byDay.get("2026-10-13")!;
  assertEquals(day13.length, 9); // 2 finished at 16:45Z, 7 in play from 19:00Z
  const kickoffs = day13.map((m) => Date.parse(m.kickoff));
  assertEquals(kickoffs, [...kickoffs].sort((a, b) => a - b));
  assertEquals(byDay.get("2026-10-14")!.length, 9);
  // Same input in another order, same buckets.
  const reversed = groupByDay([...scheduled()].reverse());
  assertEquals(JSON.stringify([...reversed.entries()].sort()), JSON.stringify([...byDay.entries()].sort()));
});

Deno.test("a late kickoff stays on the day it was played in Edmonton", () => {
  const fx = fixtureById(IDS.uclFinished);
  fx.fixture.date = "2026-10-14T03:30:00+00:00";
  const m = mapMatch(fx)!;
  assertEquals([...groupByDay([m]).keys()], ["2026-10-13"]);
});

Deno.test("the day file carries the schema, the date, and the matches sorted", () => {
  const ms = scheduled().filter((m) => dayOf(m.kickoff) === "2026-10-13");
  const file = buildDayFile("2026-10-13", [...ms].reverse(), "2026-10-14T00:00:00.000Z");
  assertEquals(
    [file.schema, file.date, file.generatedAt, file.source],
    [DAY_SCHEMA, "2026-10-13", "2026-10-14T00:00:00.000Z", "API-Football"],
  );
  assertEquals(DAY_SCHEMA, "archv-day/1");
  assertEquals(file.matches.map((m) => m.id), sortMatches(ms).map((m) => m.id));
  assertEquals(buildDayFile("2026-10-13", ms, "t").matches.map((m) => m.id), file.matches.map((m) => m.id));
  assertEquals(dayPath("2026-10-13"), "days/2026-10-13.json");
});

Deno.test("parseIndex: no file is an empty index, a damaged one is refused", () => {
  assertEquals(parseIndex(null), []);
  const good = JSON.stringify(buildIndex([{ date: "2026-10-13", count: 9 }, { date: "2026-10-12", count: 1 }], "t"));
  assertEquals(parseIndex(good), [{ date: "2026-10-13", count: 9 }, { date: "2026-10-12", count: 1 }]);
  assertEquals(DAYS_SCHEMA, "archv-days/1");
  const bad = [
    "", "not json", "[]", "null", "{}",
    JSON.stringify({ schema: "archv-days/2", days: [] }),
    JSON.stringify({ schema: DAYS_SCHEMA, days: "x" }),
    JSON.stringify({ schema: DAYS_SCHEMA, days: [{ date: "2026-02-30", count: 1 }] }),
    JSON.stringify({ schema: DAYS_SCHEMA, days: [{ date: "2026-10-13", count: -1 }] }),
    JSON.stringify({ schema: DAYS_SCHEMA, days: [{ date: "2026-10-13", count: 1.5 }] }),
    JSON.stringify({ schema: DAYS_SCHEMA, days: [null] }),
  ];
  for (const text of bad) assertEquals(parseIndex(text), null, text.slice(0, 40));
});

Deno.test("mergeIndex replaces the rebuilt days, drops an emptied one, keeps the rest, newest first", () => {
  const existing = [
    { date: "2026-10-12", count: 4 },
    { date: "2026-10-05", count: 3 },
    { date: "2026-09-20", count: 11 },
  ];
  const merged = mergeIndex(
    existing,
    ["2026-10-11", "2026-10-12", "2026-10-13"],
    new Map([["2026-10-11", 6], ["2026-10-12", 5], ["2026-10-13", 0]]),
  );
  assertEquals(merged, [
    { date: "2026-10-12", count: 5 }, // replaced
    { date: "2026-10-11", count: 6 }, // added
    { date: "2026-10-05", count: 3 }, // untouched
    { date: "2026-09-20", count: 11 }, // untouched
  ]);
  // A rebuilt day that has emptied leaves the index.
  assertEquals(mergeIndex(existing, ["2026-10-12"], new Map()), [
    { date: "2026-10-05", count: 3 },
    { date: "2026-09-20", count: 11 },
  ]);
  // Merging the same thing twice changes nothing, and a duplicate in the input collapses.
  const once = mergeIndex(existing, ["2026-10-12"], new Map([["2026-10-12", 5]]));
  assertEquals(mergeIndex(once, ["2026-10-12"], new Map([["2026-10-12", 5]])), once);
  assertEquals(
    mergeIndex([{ date: "2026-10-01", count: 1 }, { date: "2026-10-01", count: 2 }], [], new Map()).length,
    1,
  );
  assert(mergeIndex([], [], new Map()).length === 0, "empty stays empty");
});
