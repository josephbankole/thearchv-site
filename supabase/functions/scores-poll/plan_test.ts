// Unit tests for scores-poll's decisions (plan.ts): the window, when the schedule is due, which
// matches need a details call, and which files are worth writing. Run: `deno test` from this dir.
import { mapMatch, type Match } from "./map.ts";
import {
  addDays,
  canonicalJson,
  contentHash,
  detailTargets,
  FINISHED_TAIL_MS,
  inWindow,
  MAX_DETAIL_IDS,
  planWrites,
  SCHEDULE_EVERY_MS,
  scheduleDue,
  seasonFor,
  startOfEdmontonDay,
  trackFinished,
  windowFor,
} from "./plan.ts";
import { assert, assertEquals, IDS, SCHEDULES } from "./testkit.ts";

const at = (iso: string) => new Date(iso);
const MIN = 60_000;

// ---------- the window ----------

Deno.test("windowFor: yesterday 00:00 to tomorrow 23:59 in Edmonton, in summer time", () => {
  const w = windowFor(at("2026-10-13T19:50:00Z")); // 13:50 MDT
  assertEquals(w.today, "2026-10-13");
  assertEquals(new Date(w.startMs).toISOString(), "2026-10-12T06:00:00.000Z"); // 12 Oct 00:00 MDT
  assertEquals(new Date(w.endMs).toISOString(), "2026-10-15T06:00:00.000Z"); // 15 Oct 00:00 MDT
  assertEquals([w.from, w.to], ["2026-10-12", "2026-10-15"]);
});

Deno.test("windowFor: the Edmonton day, not the UTC day, sets today", () => {
  const w = windowFor(at("2026-10-13T03:00:00Z")); // 21:00 MDT on the 12th
  assertEquals(w.today, "2026-10-12");
  assertEquals(new Date(w.startMs).toISOString(), "2026-10-11T06:00:00.000Z");
});

Deno.test("windowFor: the clocks going back (1 Nov 2026) and forward (14 Mar 2027)", () => {
  // 2 Nov 03:00 MST. Yesterday, 1 Nov, is the 25-hour day and began at 00:00 MDT; the day after
  // tomorrow, 4 Nov, begins at 00:00 MST.
  const fall = windowFor(at("2026-11-02T10:00:00Z"));
  assertEquals(fall.today, "2026-11-02");
  assertEquals(new Date(fall.startMs).toISOString(), "2026-11-01T06:00:00.000Z");
  assertEquals(new Date(fall.endMs).toISOString(), "2026-11-04T07:00:00.000Z");
  assertEquals([fall.from, fall.to], ["2026-11-01", "2026-11-04"]);
  // 15 Mar 2027 06:00 MDT. Yesterday, 14 Mar, began at 00:00 MST; 17 Mar begins at 00:00 MDT.
  const spring = windowFor(at("2027-03-15T12:00:00Z"));
  assertEquals(spring.today, "2027-03-15");
  assertEquals(new Date(spring.startMs).toISOString(), "2027-03-14T07:00:00.000Z");
  assertEquals(new Date(spring.endMs).toISOString(), "2027-03-17T06:00:00.000Z");
});

Deno.test("startOfEdmontonDay and addDays", () => {
  assertEquals(startOfEdmontonDay("2026-01-15").toISOString(), "2026-01-15T07:00:00.000Z");
  assertEquals(startOfEdmontonDay("2026-07-15").toISOString(), "2026-07-15T06:00:00.000Z");
  assertEquals(addDays("2026-12-31", 1), "2027-01-01");
  assertEquals(addDays("2026-03-01", -1), "2026-02-28");
});

Deno.test("inWindow: the first instant of yesterday is in, the first of the day after tomorrow is out", () => {
  const w = windowFor(at("2026-10-13T19:50:00Z"));
  const iso = (ms: number) => new Date(ms).toISOString();
  assert(inWindow(iso(w.startMs), w), "start is in");
  assert(!inWindow(iso(w.startMs - 1), w), "a millisecond before is out");
  assert(inWindow(iso(w.endMs - 1), w), "tomorrow 23:59:59.999 is in");
  assert(!inWindow(iso(w.endMs), w), "the end is exclusive");
  assert(!inWindow("not a date", w), "garbage is out");
});

Deno.test("inWindow on the recorded schedules: only the matches inside the three days", () => {
  const w = windowFor(at("2026-10-13T19:50:00Z"));
  const inside = (k: string) =>
    SCHEDULES[k].response.map(mapMatch).filter((m) => m && inWindow(m.kickoff, w)).map((m) => m!.id);
  assertEquals(inside("39"), [1557420]); // Coventry v Newcastle, the 12th; the 10th and 11th are out
  assertEquals(inside("2").length, 18);
  assertEquals(inside("44"), []);
});

Deno.test("seasonFor: the year the season starts in, rolling over on 1 July", () => {
  assertEquals(seasonFor(at("2026-10-13T00:00:00Z")), 2026);
  assertEquals(seasonFor(at("2027-03-01T00:00:00Z")), 2026);
  assertEquals(seasonFor(at("2027-06-30T23:59:59Z")), 2026);
  assertEquals(seasonFor(at("2027-07-01T00:00:00Z")), 2027);
});

// ---------- the schedule ----------

Deno.test("scheduleDue: every 30 minutes, at once on a new Edmonton day, and with no schedule yet", () => {
  const now = at("2026-10-13T19:50:00Z");
  const ago = (ms: number, day = "2026-10-13") => ({
    scheduleFetchedAt: new Date(now.getTime() - ms).toISOString(),
    windowDay: day,
  });
  assertEquals(scheduleDue({ scheduleFetchedAt: null, windowDay: null }, now), true);
  assertEquals(scheduleDue(ago(0), now), false);
  assertEquals(scheduleDue(ago(SCHEDULE_EVERY_MS - 1), now), false);
  assertEquals(scheduleDue(ago(SCHEDULE_EVERY_MS), now), true);
  assertEquals(scheduleDue(ago(5 * MIN, "2026-10-12"), now), true); // the day rolled
  assertEquals(scheduleDue(ago(-5 * MIN), now), true); // a fetch time in the future is not trusted
  assertEquals(scheduleDue({ scheduleFetchedAt: "garbage", windowDay: "2026-10-13" }, now), true);
  // 23:59 and 00:01 in Edmonton, two minutes apart: the day rolls and the schedule is due.
  const before = { scheduleFetchedAt: "2026-10-13T05:59:00Z", windowDay: "2026-10-12" };
  assertEquals(scheduleDue(before, at("2026-10-13T06:01:00Z")), true);
  assertEquals(scheduleDue({ ...before, windowDay: "2026-10-13" }, at("2026-10-13T06:01:00Z")), false);
});

// ---------- when a match finished ----------

const base = mapMatch(SCHEDULES["2"].response[0])!; // Lens v Sporting, FT
const make = (over: Partial<Match> & { code?: string }): Match => {
  const code = over.code ?? "NS";
  return {
    ...base,
    id: over.id ?? 1,
    kickoff: over.kickoff ?? "2026-10-13T19:00:00+00:00",
    status: {
      code,
      minute: null,
      extra: null,
      live: ["1H", "HT", "2H", "ET", "BT", "P", "SUSP", "INT", "LIVE"].includes(code),
      finished: ["FT", "AET", "PEN", "AWD", "WO"].includes(code),
    },
  };
};

Deno.test("trackFinished: stamped now on a live-to-finished change, estimated when first seen finished", () => {
  const now = at("2026-10-13T21:00:00Z");
  const live = make({ id: 1, code: "2H", kickoff: "2026-10-13T19:00:00+00:00" });
  const done = make({ id: 1, code: "FT", kickoff: "2026-10-13T19:00:00+00:00" });
  assertEquals(trackFinished([live], [done], {}, now), { "1": now.toISOString() });

  // First seen finished: kickoff + 115 minutes (150 after extra time), never later than now.
  const cold = make({ id: 2, code: "FT", kickoff: "2026-10-13T16:45:00+00:00" });
  const aet = make({ id: 3, code: "AET", kickoff: "2026-10-13T16:45:00+00:00" });
  const recent = make({ id: 4, code: "FT", kickoff: "2026-10-13T20:30:00+00:00" });
  assertEquals(trackFinished([], [cold, aet, recent], {}, now), {
    "2": "2026-10-13T18:40:00.000Z",
    "3": "2026-10-13T19:15:00.000Z",
    "4": now.toISOString(),
  });

  // A time already recorded is kept; matches that are not finished, or have left, are not listed.
  const kept = { "2": "2026-10-13T18:00:00.000Z", "99": "2026-10-01T00:00:00.000Z" };
  assertEquals(trackFinished([], [cold, live], kept, now), { "2": "2026-10-13T18:00:00.000Z" });
});

// ---------- the details call ----------

const NOW = at("2026-10-13T20:00:00Z");
const targets = (
  ms: Match[],
  finishedAt: Record<string, string> = {},
  hasFile: (id: number) => boolean = () => true,
) =>
  detailTargets(ms, { now: NOW, finishedAt, hasFile });
const kickoffIn = (min: number) => new Date(NOW.getTime() + min * MIN).toISOString();

Deno.test("detailTargets: nothing to do means no call", () => {
  assertEquals(targets([]), { ids: [], deferred: 0 });
  const quiet = [
    make({ id: 1, code: "NS", kickoff: kickoffIn(11) }), // not yet
    make({ id: 2, code: "NS", kickoff: kickoffIn(24 * 60) }),
    make({ id: 3, code: "PST", kickoff: kickoffIn(-30) }),
    make({ id: 4, code: "CANC", kickoff: kickoffIn(-30) }),
    make({ id: 5, code: "FT", kickoff: kickoffIn(-600) }), // long finished, file already written
  ];
  assertEquals(targets(quiet, { "5": new Date(NOW.getTime() - 5 * 3_600_000).toISOString() }), { ids: [], deferred: 0 });
});

Deno.test("detailTargets: a live match is polled every minute, whatever its code", () => {
  for (const code of ["1H", "HT", "2H", "ET", "BT", "P", "SUSP", "INT", "LIVE"]) {
    assertEquals(targets([make({ id: 7, code })]).ids, [7], code);
  }
});

Deno.test("detailTargets: ten minutes before kickoff, and after it until the API says live", () => {
  assertEquals(targets([make({ id: 1, kickoff: kickoffIn(10) })]).ids, [1]); // exactly ten minutes
  assertEquals(targets([make({ id: 2, kickoff: kickoffIn(10.01) })]).ids, []);
  assertEquals(targets([make({ id: 3, code: "TBD", kickoff: kickoffIn(5) })]).ids, [3]);
  assertEquals(targets([make({ id: 4, kickoff: kickoffIn(-20) })]).ids, [4]); // late flip to 1H
  assertEquals(targets([make({ id: 5, kickoff: kickoffIn(-179) })]).ids, [5]);
  assertEquals(targets([make({ id: 6, kickoff: kickoffIn(-181) })]).ids, []); // stuck: leave it
});

Deno.test("detailTargets: a finished match is polled for two hours after the whistle, then left", () => {
  const m = make({ id: 1, code: "FT", kickoff: kickoffIn(-200) });
  const finished = (minAgo: number) => ({ "1": new Date(NOW.getTime() - minAgo * MIN).toISOString() });
  assertEquals(targets([m], finished(1)).ids, [1]);
  assertEquals(targets([m], finished(119)).ids, [1]);
  assertEquals(FINISHED_TAIL_MS, 120 * MIN);
  assertEquals(targets([m], finished(120)).ids, []);
  assertEquals(targets([m], finished(300)).ids, []);
  // No record of when it finished and a file already written: nothing to fetch.
  assertEquals(targets([m], {}).ids, []);
});

Deno.test("detailTargets: a match that has kicked off with no file yet is fetched once (cold start)", () => {
  const old = make({ id: 1, code: "FT", kickoff: kickoffIn(-30 * 60) });
  assertEquals(targets([old], {}, () => false).ids, [1]);
  assertEquals(targets([old], {}, () => true).ids, []);
  // Postponed and cancelled matches never kicked off, so there is nothing to backfill.
  const off = [make({ id: 2, code: "PST", kickoff: kickoffIn(-600) }), make({ id: 3, code: "CANC", kickoff: kickoffIn(-600) })];
  assertEquals(targets(off, {}, () => false).ids, []);
});

Deno.test("detailTargets: live first, then starting, then just finished, then backfill; capped at 20", () => {
  const finishedAt = { "3": new Date(NOW.getTime() - 10 * MIN).toISOString() };
  const ms = [
    make({ id: 4, code: "FT", kickoff: kickoffIn(-3000) }), // backfill (no file)
    make({ id: 3, code: "FT", kickoff: kickoffIn(-130) }), // just finished
    make({ id: 2, code: "NS", kickoff: kickoffIn(5) }), // starting
    make({ id: 1, code: "2H", kickoff: kickoffIn(-60) }), // live
  ];
  assertEquals(targets(ms, finishedAt, (id) => id !== 4).ids, [1, 2, 3, 4]);

  const many = Array.from({ length: 25 }, (_, i) => make({ id: 100 + i, code: "2H", kickoff: kickoffIn(-60 + i) }));
  const t = targets([...many, make({ id: 1, code: "NS", kickoff: kickoffIn(5) })]);
  assertEquals(t.ids.length, MAX_DETAIL_IDS);
  assertEquals(t.deferred, 6);
  assert(!t.ids.includes(1), "the match about to start waits behind twenty live ones");
});

Deno.test("detailTargets on the recorded Champions League night", () => {
  // 20:10 UTC on the 13th: seven matches in the second half, two finished at about 18:40, and the
  // nine on the 14th are tomorrow.
  const now = at("2026-10-13T20:10:00Z");
  const ms = SCHEDULES["2"].response.map(mapMatch).map((m) => m!);
  const finishedAt = trackFinished([], ms, {}, now);
  const t = detailTargets(ms, { now, finishedAt, hasFile: () => true });
  const live = ms.filter((m) => m.status.live).map((m) => m.id).sort();
  const done = ms.filter((m) => m.status.finished).map((m) => m.id).sort();
  assertEquals(live.length, 7);
  assertEquals(done.length, 2);
  assertEquals([...t.ids].sort(), [...live, ...done].sort());
  assert(t.ids.includes(IDS.uclLive), "Atletico Madrid v Manchester United is in");
  // Three hours later nothing is live and the two finished matches are out of the tail.
  const late = at("2026-10-13T23:10:00Z");
  const allDone = ms.map((m) => m.status.live ? { ...m, status: { ...m.status, code: "FT", live: false, finished: true } } : m);
  const later = detailTargets(allDone, { now: late, finishedAt: trackFinished(ms, allDone, finishedAt, at("2026-10-13T21:00:00Z")), hasFile: () => true });
  assertEquals(later.ids, []);
});

// ---------- writing ----------

Deno.test("contentHash: ignores generatedAt, sees every other change", async () => {
  const a = { schema: "x", generatedAt: "2026-10-13T20:00:00Z", matches: [{ id: 1, goals: 0 }] };
  const same = await contentHash({ ...a, generatedAt: "2030-01-01T00:00:00Z" });
  assertEquals(await contentHash(a), same);
  assertEquals((await contentHash(a)).length, 16);
  const changed = await contentHash({ ...a, matches: [{ id: 1, goals: 1 }] });
  assert(changed !== same, "a different score is a different hash");
});

Deno.test("planWrites: only new or changed files are written", async () => {
  const f = (path: string, goals: number, generatedAt = "t1") => ({ path, body: { generatedAt, goals } });
  const first = await planWrites([f("scores.json", 0), f("match/1.json", 0)], {});
  assertEquals(first.map((p) => p.path), ["scores.json", "match/1.json"]);
  const written = Object.fromEntries(first.map((p) => [p.path, p.hash]));

  // The next minute: same content, later generatedAt. Nothing to write.
  assertEquals(await planWrites([f("scores.json", 0, "t2"), f("match/1.json", 0, "t2")], written), []);

  // A goal in match 1: its file and nothing else is planned, with the text to upload.
  const goal = await planWrites([f("scores.json", 0, "t3"), f("match/1.json", 1, "t3")], written);
  assertEquals(goal.map((p) => p.path), ["match/1.json"]);
  assertEquals(JSON.parse(goal[0].text), { generatedAt: "t3", goals: 1 });

  // A file the state has never heard of is written even though the others are not.
  const extra = await planWrites([f("scores.json", 0), f("match/2.json", 0)], written);
  assertEquals(extra.map((p) => p.path), ["match/2.json"]);
});

Deno.test("contentHash: the order keys were built or read back in is not a change", async () => {
  const a = { schema: "x", generatedAt: "t", matches: [{ id: 1, home: { id: 2, goals: null }, venue: "A" }] };
  const jsonb = { matches: [{ id: 1, home: { id: 2, goals: null }, venue: "A" }], schema: "x" };
  const reordered = { schema: "x", matches: [{ venue: "A", home: { goals: null, id: 2 }, id: 1 }] };
  assertEquals(await contentHash(jsonb), await contentHash(a));
  assertEquals(await contentHash(reordered), await contentHash(a));
  // Array order is meaningful, and a null is not a missing key.
  assertEquals((await contentHash({ matches: [{ id: 2 }, { id: 1 }] })) === (await contentHash({ matches: [{ id: 1 }, { id: 2 }] })), false);
  assertEquals((await contentHash({ m: { goals: null } })) === (await contentHash({ m: {} })), false);
  assertEquals(canonicalJson({ b: [1, { d: 1, c: undefined }], a: "x" }), '{"a":"x","b":[1,{"d":1}]}');
});
