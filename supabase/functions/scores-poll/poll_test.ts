// Whole-run tests for scores-poll (poll.ts): runPoll against the recorded API replies, with a fake
// API that counts its requests and a fake store that keeps what was written. Each test plays a few
// minutes in a row and checks what was asked for, what was written, and what was left alone.
// Run: `deno test` from this dir. No network, no permissions.
import type { ApiGet } from "./api.ts";
import {
  EMPTY_STATE,
  type PollState,
  rowFromState,
  runPoll,
  SCORES_PATH,
  stateFromRow,
  type Summary,
} from "./poll.ts";
import { scheduleDue } from "./plan.ts";
import { assert, assertEquals, DETAIL_FIXTURES, fixtureById, IDS, SCHEDULES } from "./testkit.ts";

const MIN = 60_000;
const T0 = "2026-10-13T20:10:00Z"; // a Champions League night, seven matches in the second half
const at = (iso: string, plusMin = 0) => new Date(Date.parse(iso) + plusMin * MIN);

// deno-lint-ignore no-explicit-any
type Fx = any;

// The API: a schedule per league=, and for ids= every fixture we hold a details reply for, or else
// the schedule's own row for it (which has no events or lineups, as a quiet match would not).
function fakeApi(opts: { fail?: (path: string) => string | null; edit?: (fx: Fx) => void } = {}) {
  const calls: string[] = [];
  const api: ApiGet = (path) => {
    calls.push(path);
    const reason = opts.fail?.(path);
    if (reason) return Promise.resolve({ ok: false, reason, remaining: null });
    const q = new URLSearchParams(path.split("?")[1]);
    let fixtures: Fx[];
    if (q.has("ids")) {
      const scheduled = Object.values(SCHEDULES).flatMap((e) => e.response);
      fixtures = q.get("ids")!.split("-").map(Number).map((id) =>
        DETAIL_FIXTURES.some((f) => f.fixture.id === id)
          ? fixtureById(id)
          : structuredClone(scheduled.find((f) => f.fixture.id === id))
      ).filter(Boolean);
      fixtures.forEach((fx) => opts.edit?.(fx));
    } else {
      fixtures = structuredClone(SCHEDULES[q.get("league")!].response);
    }
    return Promise.resolve({ ok: true, fixtures, remaining: 7400 - calls.length });
  };
  return { api, calls };
}

function fakeStore(failOn: (path: string) => boolean = () => false) {
  const files = new Map<string, string>();
  const write = (path: string, text: string) => {
    if (failOn(path)) return Promise.reject(new Error("storage down"));
    files.set(path, text);
    return Promise.resolve();
  };
  return { files, write };
}

type Run = { summary: Summary; state: PollState; writeFailed: boolean; calls: string[] };
async function minute(
  state: PollState,
  now: Date,
  store: ReturnType<typeof fakeStore>,
  apiOpts: Parameters<typeof fakeApi>[0] = {},
): Promise<Run> {
  const { api, calls } = fakeApi(apiOpts);
  const out = await runPoll(state, { now, season: 2026, api, write: store.write });
  return { ...out, calls };
}
const scoresOf = (store: ReturnType<typeof fakeStore>) => JSON.parse(store.files.get(SCORES_PATH)!);
const scheduleCalls = (calls: string[]) => calls.filter((c) => c.includes("league="));
const detailCalls = (calls: string[]) => calls.filter((c) => c.includes("ids="));

Deno.test("cold start: the schedule for three leagues, one details call, and every file", async () => {
  const store = fakeStore();
  const r = await minute(EMPTY_STATE, at(T0), store);

  assertEquals(scheduleCalls(r.calls), [
    "/fixtures?league=39&season=2026&from=2026-10-12&to=2026-10-15",
    "/fixtures?league=2&season=2026&from=2026-10-12&to=2026-10-15",
    "/fixtures?league=44&season=2026&from=2026-10-12&to=2026-10-15",
  ]);
  assertEquals(detailCalls(r.calls).length, 1);
  assert(r.calls.every((c) => !/key|token/i.test(c)), "no credential in any request URL");
  // Seven live, two just finished, and Coventry v Newcastle (the 12th) which has no file yet.
  const ids = detailCalls(r.calls)[0].split("ids=")[1].split("-");
  assertEquals(ids.length, 10);
  assertEquals(ids.includes(String(IDS.uclLive)), true);

  assertEquals(r.summary, {
    ok: true, scheduleRefreshed: true, liveCount: 7, detailCalls: 1, filesWritten: 11, remaining: 7396,
  });
  assertEquals(r.writeFailed, false);

  const scores = scoresOf(store);
  assertEquals([scores.schema, scores.source, scores.generatedAt], ["archv-scores/1", "API-Football", at(T0).toISOString()]);
  assertEquals(scores.matches.length, 19); // 1 Premier League + 18 Champions League, WSL none
  const kickoffs = scores.matches.map((m: { kickoff: string }) => Date.parse(m.kickoff));
  assertEquals(kickoffs, [...kickoffs].sort((a, b) => a - b));
  // A pointer where a file exists and the match has kicked off; null for tomorrow's nine.
  for (const m of scores.matches) {
    const kicked = m.status.code !== "NS";
    assertEquals(m.detail, kicked ? `match/${m.id}.json` : null, String(m.id));
    assertEquals(store.files.has(`match/${m.id}.json`), kicked, `file for ${m.id}`);
  }
  assert(![...store.files.values()].some((t) => /https?:|logo|photo/i.test(t)), "no URL in anything written");
  assertEquals(r.state.backoffUntil, null);
  assertEquals(Object.keys(r.state.fileHashes).length, 11);
});

Deno.test("a quiet minute: one details call for the live matches, no schedule, no writes", async () => {
  const store = fakeStore();
  const a = await minute(EMPTY_STATE, at(T0), store);
  const before = new Map(store.files);
  const b = await minute(a.state, at(T0, 1), store);

  assertEquals(scheduleCalls(b.calls), []);
  assertEquals(detailCalls(b.calls).length, 1);
  assertEquals(detailCalls(b.calls)[0].split("ids=")[1].split("-").length, 9); // the PL match has its file now
  assertEquals(b.summary.filesWritten, 0);
  assertEquals(b.summary.scheduleRefreshed, false);
  assertEquals([...store.files], [...before], "every file is exactly as it was");
});

Deno.test("a goal rewrites that match's file and scores.json, and nothing else", async () => {
  const store = fakeStore();
  const a = await minute(EMPTY_STATE, at(T0), store);
  const before = new Map(store.files);
  const goal = (fx: Fx) => {
    if (fx.fixture.id === IDS.uclLive) {
      fx.goals.home = 2;
      fx.fixture.status.elapsed = 68;
    }
  };
  const b = await minute(a.state, at(T0, 1), store, { edit: goal });

  assertEquals(b.summary.filesWritten, 2);
  const changed = [...store.files].filter(([p, t]) => before.get(p) !== t).map(([p]) => p).sort();
  assertEquals(changed, [SCORES_PATH, `match/${IDS.uclLive}.json`].sort());
  const row = scoresOf(store).matches.find((m: { id: number }) => m.id === IDS.uclLive);
  assertEquals([row.home.goals, row.status.minute], [2, 68]);
  assertEquals(JSON.parse(store.files.get(`match/${IDS.uclLive}.json`)!).match.home.goals, 2);
});

Deno.test("an API error on the details call writes nothing, keeps the last files, and backs off", async () => {
  const store = fakeStore();
  const a = await minute(EMPTY_STATE, at(T0), store);
  const before = new Map(store.files);
  const down = (p: string) => p.includes("ids=") ? "HTTP 429" : null;

  const b = await minute(a.state, at(T0, 1), store, { fail: down });
  assertEquals(b.summary.ok, false);
  assertEquals(b.summary.error, "details: HTTP 429");
  assertEquals(b.summary.filesWritten, 0);
  assertEquals([...store.files], [...before], "the last good files are untouched");
  assertEquals(b.state.backoffUntil, at(T0, 3).toISOString());
  assertEquals(b.state.matches, a.state.matches, "the last good matches are kept");

  // One minute on, still backing off: the API is not called at all.
  const c = await minute(b.state, at(T0, 2), store);
  assertEquals(c.calls, []);
  assertEquals([c.summary.ok, c.summary.error], [false, "backing off after an API error"]);

  // Two minutes after the error it picks up again.
  const d = await minute(c.state, at(T0, 3), store);
  assertEquals(detailCalls(d.calls).length, 1);
  assertEquals(d.summary.ok, true);
  assertEquals(d.state.backoffUntil, null);
});

Deno.test("every schedule request failing writes nothing and leaves the API alone for two minutes", async () => {
  const store = fakeStore();
  const r = await minute(EMPTY_STATE, at(T0), store, { fail: () => "API error (requests)" });
  assertEquals(r.calls.length, 3, "no details call after a failed schedule");
  assertEquals(r.summary.ok, false);
  assertEquals(r.summary.scheduleRefreshed, false);
  assertEquals(store.files.size, 0);
  assertEquals(r.state.matches, []);
  assertEquals(r.state.backoffUntil, at(T0, 2).toISOString());
  assertEquals((await minute(r.state, at(T0, 1), store)).calls, []);
});

Deno.test("one competition failing keeps its matches and comes due again in five minutes", async () => {
  const store = fakeStore();
  const day = "2026-10-04T20:00:00Z"; // the WSL weekend: seven matches inside the window
  const a = await minute(EMPTY_STATE, at(day), store);
  assertEquals(a.state.matches.filter((m) => m.competition.key === "wsl").length, 7);
  assertEquals(a.summary.ok, true);

  const b = await minute(a.state, at(day, 31), store, { fail: (p) => p.includes("league=44") ? "HTTP 500" : null });
  assertEquals(b.summary.scheduleRefreshed, true);
  assertEquals(b.summary.ok, false);
  assertEquals(b.summary.error, "wsl: HTTP 500");
  assertEquals(b.state.matches.filter((m) => m.competition.key === "wsl").length, 7, "carried over");
  assertEquals(b.state.backoffUntil, null, "no blackout for the other leagues");
  assertEquals(scheduleDue(b.state, at(day, 35)), false);
  assertEquals(scheduleDue(b.state, at(day, 36)), true);
  assertEquals(scoresOf(store).matches.length, 7);
});

Deno.test("the Edmonton day rolling forces a schedule refresh, and the window moves with it", async () => {
  const store = fakeStore();
  const a = await minute(EMPTY_STATE, at("2026-10-13T05:50:00Z"), store); // 23:50 MDT on the 12th
  assertEquals(a.state.windowDay, "2026-10-12");
  const b = await minute(a.state, at("2026-10-13T06:05:00Z"), store); // 00:05 MDT on the 13th
  assertEquals(scheduleCalls(b.calls).length, 3);
  assertEquals(b.state.windowDay, "2026-10-13");
  assertEquals(b.state.matches.every((m) => Date.parse(m.kickoff) >= Date.parse("2026-10-12T06:00:00Z")), true);
});

Deno.test("no matches in the window is a valid, empty scores.json and no details call", async () => {
  const store = fakeStore();
  const r = await minute(EMPTY_STATE, at("2026-12-25T18:00:00Z"), store);
  assertEquals(detailCalls(r.calls), []);
  assertEquals(r.summary, { ok: true, scheduleRefreshed: true, liveCount: 0, detailCalls: 0, filesWritten: 1, remaining: 7397 });
  assertEquals(scoresOf(store).matches, []);
  // And it is not rewritten next minute.
  assertEquals((await minute(r.state, at("2026-12-25T18:01:00Z"), store)).summary.filesWritten, 0);
});

Deno.test("a failed upload is not recorded, so the next minute writes it again", async () => {
  const store = fakeStore((p) => p === SCORES_PATH);
  const a = await minute(EMPTY_STATE, at(T0), store);
  assertEquals(a.writeFailed, true);
  assertEquals(a.summary.ok, false);
  assertEquals(a.summary.error, "write scores.json failed");
  assertEquals(store.files.has(SCORES_PATH), false);
  assertEquals(SCORES_PATH in a.state.fileHashes, false);
  assertEquals(a.summary.filesWritten, 10, "the match files that did upload are counted");

  const healthy = fakeStore();
  for (const [p, t] of store.files) healthy.files.set(p, t);
  const b = await minute(a.state, at(T0, 1), healthy);
  assertEquals(b.writeFailed, false);
  assertEquals(b.summary.filesWritten, 1);
  assertEquals(healthy.files.has(SCORES_PATH), true);
});

Deno.test("scores.json never points at a match file whose upload failed", async () => {
  const bad = `match/${IDS.uclLive}.json`;
  const store = fakeStore((p) => p === bad);
  const a = await minute(EMPTY_STATE, at(T0), store);
  assertEquals(a.writeFailed, true);
  assertEquals(a.summary.error, `write ${bad} failed`);
  const row = scoresOf(store).matches.find((m: { id: number }) => m.id === IDS.uclLive);
  assertEquals(row.detail, null);
  assertEquals(scoresOf(store).matches.filter((m: { detail: string | null }) => m.detail).length, 9);
  // Next minute, storage is back: the file is written and the pointer follows.
  const healthy = fakeStore();
  for (const [p, x] of store.files) healthy.files.set(p, x);
  const b = await minute(a.state, at(T0, 1), healthy);
  assertEquals(b.summary.filesWritten, 2);
  assertEquals(scoresOf(healthy).matches.find((m: { id: number }) => m.id === IDS.uclLive).detail, bad);
});

Deno.test("a match that has left the window loses its recorded hash and finish time", async () => {
  const store = fakeStore();
  const a = await minute(EMPTY_STATE, at("2026-10-13T20:10:00Z"), store);
  assert(`match/${IDS.uclLive}.json` in a.state.fileHashes, "recorded");
  // Four days on the Champions League night is outside the window.
  const b = await minute(a.state, at("2026-10-17T20:10:00Z"), store);
  assertEquals(b.state.matches.some((m) => m.id === IDS.uclLive), false);
  assertEquals(Object.keys(b.state.fileHashes).sort(), Object.keys(b.state.fileHashes).filter((p) => p === SCORES_PATH || b.state.matches.some((m) => p === `match/${m.id}.json`)).sort());
  assertEquals(String(IDS.uclLive) in b.state.finishedAt, false);
});

Deno.test("the state row round-trips, and a damaged row reads as empty", () => {
  const state: PollState = {
    scheduleFetchedAt: "2026-10-13T20:10:00.000Z",
    windowDay: "2026-10-13",
    matches: [],
    finishedAt: { "1": "2026-10-13T18:40:00.000Z" },
    fileHashes: { "scores.json": "abc" },
    backoffUntil: null,
  };
  const row = rowFromState(state, at(T0));
  assertEquals(row.id, 1);
  assertEquals(stateFromRow(row), state);
  assertEquals(stateFromRow(null), EMPTY_STATE);
  assertEquals(
    stateFromRow({ schedule_fetched_at: 5, window_day: "", matches: "x", finished_at: [1], file_hashes: { a: 1, b: "ok" }, backoff_until: {} }),
    { ...EMPTY_STATE, fileHashes: { b: "ok" } },
  );
});
