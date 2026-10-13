// Whole-run tests for the day archive inside the live poll: runPoll with `archive` supplied, against
// the recorded API replies. What is checked is which day files and index entries a run writes, that
// a quiet minute writes none, and that an archive problem never holds scores.json back.
// Run: `deno test` from this dir. No network, no permissions.
import type { ApiGet } from "./api.ts";
import { EMPTY_STATE, type PollState, runPoll, SCORES_PATH, type Summary } from "./poll.ts";
import { INDEX_PATH } from "./days.ts";
import { runBackfill } from "./backfill.ts";
import { assert, assertEquals, DETAIL_FIXTURES, fixtureById, memoryStore, SCHEDULES } from "./testkit.ts";

const MIN = 60_000;
const T0 = "2026-10-13T20:10:00Z"; // 14:10 on the 13th in Edmonton; the window is the 12th to the 14th
const at = (iso: string, plusMin = 0) => new Date(Date.parse(iso) + plusMin * MIN);

// deno-lint-ignore no-explicit-any
type Fx = any;

function fakeApi(edit?: (fx: Fx) => void) {
  const calls: string[] = [];
  const api: ApiGet = (path) => {
    calls.push(path);
    const q = new URLSearchParams(path.split("?")[1]);
    let fixtures: Fx[];
    if (q.has("ids")) {
      const scheduled = Object.values(SCHEDULES).flatMap((e) => e.response);
      fixtures = q.get("ids")!.split("-").map(Number).map((id) =>
        DETAIL_FIXTURES.some((f) => f.fixture.id === id)
          ? fixtureById(id)
          : structuredClone(scheduled.find((f) => f.fixture.id === id))
      ).filter(Boolean);
      fixtures.forEach((fx) => edit?.(fx));
    } else {
      fixtures = structuredClone(SCHEDULES[q.get("league")!].response);
    }
    return Promise.resolve({ ok: true as const, fixtures, remaining: 7000 });
  };
  return { api, calls };
}

type Run = { summary: Summary; state: PollState; writeFailed: boolean; calls: string[] };
async function minute(
  state: PollState,
  now: Date,
  store: ReturnType<typeof memoryStore>,
  opts: { edit?: (fx: Fx) => void; archive?: boolean } = {},
): Promise<Run> {
  const { api, calls } = fakeApi(opts.edit);
  const out = await runPoll(state, {
    now,
    season: 2026,
    api,
    write: store.write,
    ...(opts.archive === false ? {} : { archive: { read: store.read } }),
  });
  return { ...out, calls };
}
const json = (store: ReturnType<typeof memoryStore>, path: string) => JSON.parse(store.files.get(path)!);

Deno.test("cold start: a day file for each day of the window, and an index of the days up to today", async () => {
  const store = memoryStore();
  const r = await minute(EMPTY_STATE, at(T0), store);

  // The match files and scores.json are as they were; the day files and the index count apart.
  assertEquals(r.summary, {
    ok: true, scheduleRefreshed: true, liveCount: 7, detailCalls: 1, filesWritten: 11, dayFilesWritten: 4, remaining: 7000,
  });
  assertEquals(r.writeFailed, false);

  const d12 = json(store, "days/2026-10-12.json");
  const d13 = json(store, "days/2026-10-13.json");
  const d14 = json(store, "days/2026-10-14.json");
  assertEquals([d13.schema, d13.date, d13.source, d13.generatedAt], ["archv-day/1", "2026-10-13", "API-Football", at(T0).toISOString()]);
  assertEquals([d12.matches.length, d13.matches.length, d14.matches.length], [1, 9, 9]);

  // The same matches as scores.json, in the same order, with the same pointers.
  const all = [...d12.matches, ...d13.matches, ...d14.matches];
  assertEquals(all, json(store, SCORES_PATH).matches);
  assert(d13.matches.some((m: { detail: string | null }) => m.detail?.startsWith("match/")), "a played match points at its file");
  assert(d14.matches.every((m: { detail: string | null }) => m.detail === null), "tomorrow's matches have no file");

  // Tomorrow is a schedule, not history: the index stops at today.
  assertEquals(json(store, INDEX_PATH), {
    schema: "archv-days/1",
    generatedAt: at(T0).toISOString(),
    days: [{ date: "2026-10-13", count: 9 }, { date: "2026-10-12", count: 1 }],
  });
});

Deno.test("with no archive supplied a run writes exactly what it wrote before", async () => {
  const store = memoryStore();
  const r = await minute(EMPTY_STATE, at(T0), store, { archive: false });
  assertEquals(r.summary.filesWritten, 11);
  assertEquals("dayFilesWritten" in r.summary, false);
  assertEquals([...store.files.keys()].filter((p) => p.startsWith("days/")), []);
});

Deno.test("a quiet minute writes no day file and does not read the index", async () => {
  const store = memoryStore();
  const first = await minute(EMPTY_STATE, at(T0), store);
  const reads = store.reads.length;
  const writes = store.writes.length;
  const second = await minute(first.state, at(T0, 1), store);
  assertEquals(second.summary.dayFilesWritten, 0);
  assertEquals(second.summary.filesWritten, 0);
  assertEquals(store.writes.length, writes);
  assertEquals(store.reads.length, reads, "the index is not read when nothing about the days changed");
});

Deno.test("a goal rewrites that day's file and nothing else in the archive", async () => {
  const store = memoryStore();
  const first = await minute(EMPTY_STATE, at(T0), store);
  const reads = store.reads.length;
  const before = store.files.get("days/2026-10-12.json");
  const second = await minute(first.state, at(T0, 1), store, {
    edit: (fx) => {
      if (fx.fixture.id === 1635623) fx.goals.home = (fx.goals.home ?? 0) + 1;
    },
  });
  assertEquals(second.summary.dayFilesWritten, 1);
  assertEquals(store.files.get("days/2026-10-12.json"), before);
  const day13 = json(store, "days/2026-10-13.json");
  assertEquals(day13.matches.find((m: { id: number }) => m.id === 1635623).home.goals, first.state.matches.find((m) => m.id === 1635623)!.home.goals! + 1);
  assertEquals(store.reads.length, reads, "no match was added or removed, so the index was not read");
});

Deno.test("the index keeps the days older than the window", async () => {
  const store = memoryStore();
  store.files.set(INDEX_PATH, JSON.stringify({
    schema: "archv-days/1",
    generatedAt: "2026-10-12T00:00:00.000Z",
    days: [{ date: "2026-10-12", count: 7 }, { date: "2026-10-05", count: 10 }, { date: "2026-08-22", count: 12 }],
  }));
  await minute(EMPTY_STATE, at(T0), store);
  assertEquals(json(store, INDEX_PATH).days, [
    { date: "2026-10-13", count: 9 },
    { date: "2026-10-12", count: 1 }, // the window is the authority for its own days
    { date: "2026-10-05", count: 10 },
    { date: "2026-08-22", count: 12 },
  ]);
});

Deno.test("an index that is already right is not rewritten, though the run records that it checked", async () => {
  const store = memoryStore();
  store.files.set(INDEX_PATH, JSON.stringify({
    schema: "archv-days/1",
    generatedAt: "2026-10-12T00:00:00.000Z",
    days: [{ date: "2026-10-13", count: 9 }, { date: "2026-10-12", count: 1 }],
  }));
  const r = await minute(EMPTY_STATE, at(T0), store);
  assertEquals(r.summary.dayFilesWritten, 3); // the three day files, not the index
  assertEquals(store.writes.includes(INDEX_PATH), false);
  assertEquals(typeof r.state.fileHashes[INDEX_PATH], "string");
});

Deno.test("the Edmonton day rolling adds the new day and leaves the older ones", async () => {
  const store = memoryStore();
  const first = await minute(EMPTY_STATE, at(T0), store);
  // 07:00 on the 14th in Edmonton. The window is now the 13th to the 15th.
  const next = await minute(first.state, new Date("2026-10-14T13:00:00Z"), store);
  assertEquals(next.summary.scheduleRefreshed, true);
  assertEquals(json(store, INDEX_PATH).days.map((d: { date: string }) => d.date), [
    "2026-10-14", "2026-10-13", "2026-10-12",
  ]);
  // The 12th has left the window; its file stays as it was last written.
  assert(store.files.has("days/2026-10-12.json"), "a day file is never deleted");
  // Its hash goes with it; the window's days and the index keep theirs. The 15th has no matches
  // and never had a file, so it has none.
  assertEquals(Object.keys(next.state.fileHashes).filter((p) => p.startsWith("days/")).sort(), [
    "days/2026-10-13.json", "days/2026-10-14.json", INDEX_PATH,
  ]);
});

Deno.test("an unreadable index is left alone and scores.json still goes up", async () => {
  const store = memoryStore();
  store.files.set(INDEX_PATH, "{ this is not an index");
  const r = await minute(EMPTY_STATE, at(T0), store);
  assertEquals(r.summary.ok, false);
  assert(String(r.summary.error).includes("not readable"), "the error says why");
  assertEquals(r.writeFailed, false);
  assertEquals(store.files.get(INDEX_PATH), "{ this is not an index");
  assertEquals(r.summary.dayFilesWritten, 3);
  assert(store.files.has(SCORES_PATH), "scores.json written");
  // It tries again next minute, and the other files are not rewritten meanwhile.
  const again = await minute(r.state, at(T0, 1), store);
  assertEquals(again.summary.filesWritten, 0);
  assertEquals(again.summary.dayFilesWritten, 0);
  assertEquals(again.summary.ok, false);
});

Deno.test("a storage read error leaves the index alone, is retried, and is not a failed write", async () => {
  let broken = true;
  const store = memoryStore({ unreadable: (p) => broken && p === INDEX_PATH });
  const r = await minute(EMPTY_STATE, at(T0), store);
  assertEquals(r.summary.ok, false);
  assertEquals(r.writeFailed, false);
  assert(!store.files.has(INDEX_PATH), "nothing was written over the index it could not read");
  assert(store.files.has(SCORES_PATH), "scores.json written");
  broken = false;
  const fixed = await minute(r.state, at(T0, 1), store);
  assertEquals(fixed.summary.ok, true);
  assertEquals(fixed.summary.dayFilesWritten, 1);
  assertEquals(json(store, INDEX_PATH).days.length, 2);
});

Deno.test("a failed day-file upload is reported, retried, and does not stop scores.json", async () => {
  let down = true;
  const store = memoryStore({ failOn: (p) => down && p === "days/2026-10-13.json" });
  const r = await minute(EMPTY_STATE, at(T0), store);
  assertEquals(r.writeFailed, true);
  assert(store.files.has(SCORES_PATH), "scores.json written");
  assertEquals(r.summary.dayFilesWritten, 3); // two day files and the index
  assert(!("days/2026-10-13.json" in r.state.fileHashes), "a failed write is not recorded");
  down = false;
  const retry = await minute(r.state, at(T0, 1), store);
  assertEquals(retry.writeFailed, false);
  assertEquals(retry.summary.dayFilesWritten, 1);
  assert(store.files.has("days/2026-10-13.json"), "the day file went up on the retry");
});

Deno.test("a failed index upload is retried next minute", async () => {
  let down = true;
  const store = memoryStore({ failOn: (p) => down && p === INDEX_PATH });
  const r = await minute(EMPTY_STATE, at(T0), store);
  assertEquals(r.writeFailed, true);
  assert(!(INDEX_PATH in r.state.fileHashes), "a failed index write is not recorded");
  down = false;
  const retry = await minute(r.state, at(T0, 1), store);
  assertEquals(retry.summary.dayFilesWritten, 1);
  assertEquals(json(store, INDEX_PATH).days.length, 2);
});

Deno.test("a day emptied by a reschedule gets an empty file, so it stops showing its old matches", async () => {
  const store = memoryStore();
  const first = await minute(EMPTY_STATE, at(T0), store);
  assertEquals(json(store, "days/2026-10-14.json").matches.length, 9);
  // Every match on the 14th moves two weeks on. The schedule is refetched half an hour later.
  // (A competition whose whole window empties out is held, not believed; see poll_test.ts. The
  // Champions League keeps the 13th, so this reply is believed.)
  const { api } = fakeApi();
  const moved: typeof api = async (path) => {
    const r = await api(path);
    if (r.ok) {
      for (const fx of r.fixtures as Fx[]) {
        if (String(fx.fixture.date).startsWith("2026-10-14")) fx.fixture.date = "2026-10-28T19:00:00+00:00";
      }
    }
    return r;
  };
  const out = await runPoll(first.state, { now: at(T0, 31), season: 2026, api: moved, write: store.write, archive: { read: store.read } });
  assertEquals(json(store, "days/2026-10-14.json").matches, []);
  assertEquals(json(store, "days/2026-10-13.json").matches.length, 9);
  assertEquals(json(store, INDEX_PATH).days, [{ date: "2026-10-13", count: 9 }, { date: "2026-10-12", count: 1 }]);
  assertEquals(out.writeFailed, false);
});

Deno.test("a backfill over a day the live poll already archived rewrites nothing", async () => {
  // The two writers build the same bytes: same key order, same pointers, same match objects.
  const store = memoryStore();
  await minute(EMPTY_STATE, at(T0), store);
  const writes = store.writes.length;
  const rows = Object.values(SCHEDULES).flatMap((e) => e.response);
  const api: ApiGet = (path) => {
    const q = new URLSearchParams(path.split("?")[1]);
    const ids = q.has("ids") ? q.get("ids")!.split("-").map(Number) : null;
    const league = Number(q.get("league"));
    const hit = rows.filter((f: Fx) => ids ? ids.includes(f.fixture.id) : f.league.id === league);
    return Promise.resolve({ ok: true as const, fixtures: structuredClone(hit), remaining: 7000 });
  };
  // 12:00 on the 13th in Edmonton, so yesterday is the 12th: one match, Coventry v Newcastle.
  const r = await runBackfill("2026-10-12", {
    now: new Date("2026-10-13T18:00:00Z"), season: 2026, api, read: store.read, write: store.write,
  });
  assertEquals([r.ok, r.done, r.days, r.matches], [true, true, 1, 1]);
  assertEquals([r.daysUnchanged, r.matchFilesUnchanged, r.daysWritten, r.matchFilesWritten], [1, 1, 0, 0]);
  assertEquals(store.writes.length, writes);
});
