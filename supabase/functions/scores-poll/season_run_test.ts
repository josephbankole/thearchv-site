// Whole-call tests for season mode (season_run.ts): runSeasonStep against the re-dated season
// listings and the synthetic head-to-head reply, with a fake API that counts its requests, a store in
// memory and a state row in memory. Run: `deno test` from this dir. No network, no permissions.
import { INDEX_PATH } from "./days.ts";
import { detailPath, mapMatch, mapMatchFile, type Match } from "./map.ts";
import { previewPath } from "./preview.ts";
import {
  AHEAD_PATH,
  EMPTY_SEASON_STATE,
  heldMatches,
  rowFromSeasonState,
  type SeasonState,
  seasonStateFromRow,
  type Step,
  TEAMS_INDEX_PATH,
} from "./season.ts";
import { runSeasonStep, type SeasonSummary } from "./season_run.ts";
import { assert, assertEquals, fixtureById, IDS, memoryStore } from "./testkit.ts";
import { DAY, type Fx, h2hReply, heldState, kickoffIn, NOW, seasonApi, seasonMatches } from "./season_testkit.ts";

const H = 3_600_000;
const SLOT_PL = new Date("2026-10-28T12:07:00Z");

type Row = Record<string, unknown> | null;
type Setup = {
  state?: SeasonState | null; // null: an empty row
  now?: Date;
  step?: Step | null;
  api?: Parameters<typeof seasonApi>[0];
  store?: ReturnType<typeof memoryStore>;
  unreadableState?: boolean;
  failSave?: boolean;
  listFails?: boolean;
  clock?: () => number;
};

async function call(s: Setup = {}) {
  const store = s.store ?? memoryStore();
  const fake = seasonApi(s.api);
  const st = s.state === undefined ? heldState() : s.state;
  const row: Row = st ? { ...rowFromSeasonState(st, NOW), updated_at: st.updatedAt } : null;
  const saved: Row[] = [];
  const summary: SeasonSummary = await runSeasonStep({
    now: s.now ?? NOW,
    season: 2026,
    api: fake.api,
    read: store.read,
    write: store.write,
    listMatchFiles: () => {
      if (s.listFails) return Promise.reject(new Error("storage down"));
      const ids = [...store.files.keys()].flatMap((p) => /^match\/(\d+)\.json$/.exec(p)?.[1] ?? []).map(Number);
      return Promise.resolve(new Set(ids));
    },
    loadState: () => s.unreadableState ? Promise.reject(new Error("db down")) : Promise.resolve(row),
    saveState: (r) => {
      if (s.failSave) return Promise.reject(new Error("read-only"));
      saved.push(JSON.parse(JSON.stringify(r)));
      return Promise.resolve();
    },
    step: s.step ?? null,
    clock: s.clock,
  });
  const after = saved.length ? seasonStateFromRow(saved[saved.length - 1]) : null;
  return { summary, store, calls: fake.calls, maxInFlight: fake.maxInFlight(), saved, after };
}

// A held state with every build fresh, so a non-slot call has nothing to do unless told.
const built = (edit?: (s: SeasonState) => void) =>
  heldState(NOW, (s) => {
    const t = new Date(NOW.getTime() - 30 * 60_000).toISOString();
    s.builtAt = { days: t, teams: t, previews: t };
    s.updatedAt = t;
    edit?.(s);
  });

const json = (store: ReturnType<typeof memoryStore>, path: string) => JSON.parse(store.files.get(path)!);

// ---------- the guards ----------

Deno.test("an unreadable state row means no request and no write at all", async () => {
  const r = await call({ unreadableState: true, now: SLOT_PL });
  assertEquals([r.calls.length, r.store.writes.length, r.saved.length], [0, 0, 0]);
  assertEquals(r.summary.ok, false);
  assert(/state unreadable/.test(r.summary.error!), r.summary.error);
});

Deno.test("nothing due: one state read, no request, no write", async () => {
  const r = await call({ state: built() });
  assertEquals(r.summary, { ok: true, step: null, requests: 0, remaining: null, filesWritten: 0, writeFailed: false });
  assertEquals([r.calls.length, r.store.writes.length, r.saved.length], [0, 0, 0]);
});

Deno.test("a quota reserve recorded today turns a listing slot into a build; yesterday's does not", async () => {
  const low = built((s) => {
    s.remaining = 1400;
    s.remainingAt = new Date(NOW.getTime() - H).toISOString();
  });
  const r = await call({ state: low, now: SLOT_PL });
  assertEquals([r.calls.length, r.summary.step, r.summary.skipped], [0, null, "quota-reserve"]);
  const old = built((s) => {
    s.remaining = 1400;
    s.remainingAt = "2026-10-27T20:00:00.000Z";
  });
  const r2 = await call({ state: old, now: SLOT_PL });
  assertEquals([r2.calls.length, r2.summary.step], [1, "list:premier-league"]);
});

Deno.test("a backoff blocks the listing but the builds still run", async () => {
  const s = heldState(NOW, (x) => (x.backoffUntil = new Date(NOW.getTime() + 10 * 60_000).toISOString()));
  const r = await call({ state: s, now: SLOT_PL });
  assertEquals([r.calls.length, r.summary.step, r.summary.skipped], [0, "build:days", "backing off"]);
  assert(r.store.writes.includes(AHEAD_PATH), "the build ran");
});

Deno.test("an earlier failed state write: no request, a build only; a failed write now answers writeFailed", async () => {
  const stale = heldState(NOW, (x) => (x.updatedAt = new Date(NOW.getTime() - 7 * H).toISOString()));
  const r = await call({ state: stale, now: SLOT_PL });
  assertEquals([r.calls.length, r.summary.step], [0, "build:days"]);
  const f = await call({ now: SLOT_PL, failSave: true });
  assertEquals([f.summary.writeFailed, f.summary.ok], [true, false]);
  assert(/state write failed/.test(f.summary.error!), f.summary.error);
});

// ---------- listings ----------

Deno.test("a listing slot: one request, the competition's matches replaced and stamped", async () => {
  const r = await call({ state: EMPTY_SEASON_STATE, now: SLOT_PL });
  assertEquals(r.calls, ["/fixtures?league=39&season=2026"]);
  assertEquals([r.summary.step, r.summary.requests, r.summary.remaining], ["list:premier-league", 1, 6999]);
  assertEquals(r.after!.season, 2026);
  assertEquals(r.after!.matches["premier-league"]!.length, 10);
  assertEquals(r.after!.listedAt["premier-league"], SLOT_PL.toISOString());
  assertEquals([r.after!.remaining, r.after!.remainingAt], [6999, SLOT_PL.toISOString()]);
  assertEquals(r.store.writes, []); // a listing writes no file
});

Deno.test("an empty listing while holding this season's matches is refused; after a rollover it is believed", async () => {
  const empty = { listing: () => ({ response: [] }) };
  const r = await call({ now: SLOT_PL, api: empty });
  assertEquals(r.summary.ok, false);
  assert(/empty season listing refused/.test(r.summary.error!), r.summary.error);
  assertEquals(heldMatches(r.after ?? heldState()).length, heldMatches(heldState()).length);
  // Last season's matches held: the new season's empty listing replaces them.
  const last = heldState(NOW, (s) => (s.season = 2025));
  const r2 = await call({ state: last, now: SLOT_PL, api: empty });
  assertEquals(r2.summary.ok, true);
  assertEquals([r2.after!.season, r2.after!.matches["premier-league"], r2.after!.matches.wsl], [2026, [], undefined]);
});

Deno.test("a failed listing backs off for 30 minutes and changes nothing else", async () => {
  const r = await call({ now: SLOT_PL, api: { fail: () => "HTTP 500" } });
  assertEquals(r.after!.backoffUntil, new Date(SLOT_PL.getTime() + 30 * 60_000).toISOString());
  assertEquals(r.after!.matches, heldState().matches);
  assertEquals(r.after!.listedAt, heldState().listedAt);
  // The next slot inside the backoff makes no request.
  const next = await call({ state: { ...r.after! }, now: new Date(SLOT_PL.getTime() + 15 * 60_000), step: "list:champions-league" });
  assertEquals(next.calls.length, 0);
});

// ---------- build:days and build:teams ----------

Deno.test("build:days: the forward files and ahead.json, never days/index.json; a second run writes nothing", async () => {
  const store = memoryStore();
  const r = await call({ store, step: "build:days" });
  assertEquals(r.calls.length, 0);
  assert(r.store.writes.includes(AHEAD_PATH), "ahead.json");
  assert(!store.reads.includes(INDEX_PATH) && !store.writes.includes(INDEX_PATH), "the index is not read or written");
  assert(!store.writes.some((p) => ["days/2026-10-27.json", "days/2026-10-28.json", "days/2026-10-29.json"].includes(p)), "the poll's days");
  assertEquals(json(store, AHEAD_PATH).schema, "archv-days-ahead/1");
  assertEquals(r.after!.builtAt.days, NOW.toISOString());
  const again = await call({ store, step: "build:days", state: r.after! });
  assertEquals(again.summary.filesWritten, 0);
});

Deno.test("build:teams: team files with pointers from the storage listing; a second run writes nothing", async () => {
  const store = memoryStore();
  store.files.set(detailPath(1557425), "{}");
  const r = await call({ store, step: "build:teams" });
  assertEquals(r.calls.length, 0);
  const mu = json(store, "teams/33.json");
  assertEquals([mu.schema, mu.team.club], ["archv-team/1", "manchester-united"]);
  assertEquals(mu.matches.find((m: Match) => m.id === 1557425).detail, detailPath(1557425));
  assertEquals(json(store, TEAMS_INDEX_PATH).schema, "archv-teams/1");
  assertEquals(r.summary.filesWritten, 66);
  const again = await call({ store, step: "build:teams", state: r.after! });
  assertEquals(again.summary.filesWritten, 0);
  // A failed listing still writes the files, with no pointers, and the step is not stamped.
  const blind = await call({ step: "build:teams", listFails: true });
  assertEquals(blind.after!.builtAt.teams, undefined);
  assert(/listing match\/ failed/.test(blind.summary.error!), blind.summary.error);
});

// ---------- build:previews ----------

// Liverpool v Manchester City in three days, added to the held Premier League listing, with the
// recorded Liverpool 0-3 City details stored as the finished match it was (1557424, a day ago).
function withDerby(extra: Match[] = []) {
  const derby: Match = {
    ...seasonMatches("premier-league").find((m) => m.id === 1557424)!,
    id: 1557600,
    kickoff: kickoffIn(NOW, 3),
    status: { code: "NS", minute: null, extra: null, live: false, finished: false },
    home: { id: 40, name: "Liverpool", goals: null },
    away: { id: 50, name: "Manchester City", goals: null },
  };
  const state = built((s) => {
    s.matches = { ...s.matches, "premier-league": [...s.matches["premier-league"]!, derby, ...extra] };
    s.builtAt = { ...s.builtAt, previews: undefined };
  });
  const store = memoryStore();
  const done = state.matches["premier-league"]!.find((m) => m.id === 1557424)!;
  store.files.set(detailPath(1557424), JSON.stringify(mapMatchFile(fixtureById(IDS.plFinished), done, NOW.toISOString())));
  return { state, store, derby };
}

Deno.test("build:previews: a file per fixture within 28 days, h2h only inside 7, and reused with no request", async () => {
  const { state, store } = withDerby();
  const r = await call({ state, store });
  assertEquals(r.summary.step, "build:previews");
  assertEquals(r.summary.previews, 16);
  const previews = store.writes.filter((p) => p.startsWith("preview/"));
  assertEquals(previews.length, 16);
  // Inside 7 days: 3 PL (and the derby), 3 UCL, 2 WSL.
  assertEquals(r.summary.h2hRequests, 9);
  assert(r.calls.every((c) => c.startsWith("/fixtures/headtohead?h2h=") && c.endsWith("&last=10")), "only h2h requests");
  assert(r.maxInFlight <= 3, `at most 3 in flight, saw ${r.maxInFlight}`);
  const derby = json(store, previewPath(1557600));
  assertEquals(derby.schema, "archv-preview/1");
  assertEquals(derby.h2h.summary, { played: 6, homeWins: 2, draws: 3, awayWins: 1 });
  assertEquals(derby.h2h.fetchedAt, NOW.toISOString());
  // Beyond 7 days: no h2h.
  const far = heldMatches(state).find((m) => m.status.code === "NS" && Date.parse(m.kickoff) - NOW.getTime() > 7 * DAY && Date.parse(m.kickoff) - NOW.getTime() < 28 * DAY)!;
  assertEquals(json(store, previewPath(far.id)).h2h, null);

  // An hour on, nothing new and no fixture crossing its 48-hour mark: every block is reused, no request.
  const later = new Date(NOW.getTime() + H);
  const again = await call({ state: { ...r.after!, updatedAt: NOW.toISOString() }, store, now: later, step: "build:previews" });
  assertEquals(again.calls, []);
});

Deno.test("build:previews: the last lineup skips a missing file and a file with no lineups", async () => {
  const before = (id: number, hours: number): Match => ({
    ...seasonMatches("premier-league").find((m) => m.id === 1557424)!,
    id,
    kickoff: new Date(NOW.getTime() - hours * H).toISOString(),
  });
  // Two Liverpool v City finishes newer than 1557424: one with no file, one whose file has no lineups.
  const { state, store } = withDerby([before(1599001, 2), before(1599002, 4)]);
  const bare = fixtureById(IDS.plFinished);
  delete bare.lineups;
  store.files.set(detailPath(1599002), JSON.stringify(mapMatchFile(bare, mapMatch(bare)!, NOW.toISOString())));
  await call({ state, store, step: "build:previews" });
  const p = json(store, previewPath(1557600));
  assertEquals([p.lastLineup.home.fixtureId, p.lastLineup.home.opponent, p.lastLineup.home.competition.key], [1557424, "Manchester City", "premier-league"]);
  assertEquals(p.lastLineup.home.lineup.coach, "Andoni Iraola");
  assertEquals(p.lastLineup.away.lineup.coach, "Enzo Maresca");

  // Three bad tries in a row: no lineup, the fourth is never read.
  const { state: s2, store: st2 } = withDerby([before(1599001, 2), before(1599002, 4), before(1599003, 6)]);
  st2.files.set(detailPath(1599002), JSON.stringify(mapMatchFile(bare, mapMatch(bare)!, NOW.toISOString())));
  await call({ state: s2, store: st2, step: "build:previews" });
  assertEquals(json(st2, previewPath(1557600)).lastLineup, { home: null, away: null });
});

Deno.test("build:previews: a newer meeting in the listings refetches; so does the first call inside 48 hours", async () => {
  const { state, store } = withDerby();
  const first = await call({ state, store, step: "build:previews" });
  const fetched = first.calls.filter((c) => c.includes("h2h=40-50")).length;
  assertEquals(fetched, 1);
  // 30 hours before kickoff: inside 48 h, and the block is older than that mark.
  const kickoff = Date.parse(kickoffIn(NOW, 3));
  const inside = new Date(kickoff - 30 * H);
  const r = await call({ state: { ...first.after!, updatedAt: inside.toISOString() }, store, now: inside, step: "build:previews" });
  assert(r.calls.includes("/fixtures/headtohead?h2h=40-50&last=10"), "refreshed once inside 48 h");
  const r2 = await call({ state: { ...r.after!, updatedAt: inside.toISOString() }, store, now: new Date(inside.getTime() + H), step: "build:previews" });
  assert(!r2.calls.includes("/fixtures/headtohead?h2h=40-50&last=10"), "and only once");
});

Deno.test("build:previews: the loop stops asking on the first failed reply and backs off", async () => {
  const { state, store } = withDerby();
  const r = await call({ state, store, step: "build:previews", api: { fail: (_p, n) => n === 2 ? "HTTP 429" : null } });
  assert(r.calls.length <= 3, `stopped within the first group, made ${r.calls.length}`);
  assertEquals(r.after!.backoffUntil, new Date(NOW.getTime() + 30 * 60_000).toISOString());
  // The files still go up, with the h2h they had (none).
  assertEquals(store.writes.filter((p) => p.startsWith("preview/")).length, 16);
});

Deno.test("build:previews: a reply showing under 1,500 left stops the h2h loop", async () => {
  const { state, store } = withDerby();
  const r = await call({ state, store, step: "build:previews", api: { remaining: () => 1499 } });
  assert(r.calls.length <= 3, `made ${r.calls.length}`);
  assertEquals(r.summary.skipped, "quota-reserve");
  assertEquals(r.after!.remaining, 1499);
});

Deno.test("build:previews: at most 40 h2h requests a call", async () => {
  const base = seasonMatches("premier-league").find((m) => m.id === 1557425)!;
  const many: Match[] = Array.from({ length: 50 }, (_, i) => ({
    ...base,
    id: 1700000 + i,
    kickoff: new Date(NOW.getTime() + (i + 1) * 3 * H).toISOString(),
    status: { code: "NS", minute: null, extra: null, live: false, finished: false },
    home: { id: 33, name: "Manchester United", goals: null },
    away: { id: 47, name: "Tottenham", goals: null },
  }));
  const { state, store } = withDerby(many);
  const r = await call({ state, store, step: "build:previews" });
  assertEquals(r.summary.h2hRequests, 40);
  assertEquals(r.calls.length, 40);
});

Deno.test("build:previews: the first failed preview write stops the call", async () => {
  const { state } = withDerby();
  const store = memoryStore({ failOn: (p) => p.startsWith("preview/") });
  const r = await call({ state, store, step: "build:previews" });
  assert(r.calls.length <= 3, `made ${r.calls.length}`);
  assertEquals([r.summary.writeFailed, r.after!.builtAt.previews], [true, undefined]);
});

Deno.test("build:previews: a reply nothing can be read from keeps the old block and stamps nothing", async () => {
  const { state, store } = withDerby();
  const r = await call({ state, store, step: "build:previews", api: { h2h: () => [{ odd: true }, { fixture: {} }] } });
  assert(/h2h-unmapped 1557600/.test(r.summary.error!), r.summary.error);
  assertEquals(json(store, previewPath(1557600)).h2h, null);
});

// ---------- rights ----------

Deno.test("rights: no written body carries a URL, a logo, a photo or a flag", async () => {
  const store = memoryStore();
  const { state, store: s } = withDerby();
  for (const [k, v] of s.files) store.files.set(k, v);
  const poisoned = (): Fx[] => {
    const rows = h2hReply().response;
    for (const r of rows) {
      if (r.teams) r.teams.home.logo = "https://media.api-sports.io/x.png";
      if (r.league) r.league.flag = "https://media.api-sports.io/f.svg";
    }
    return rows;
  };
  let st = state;
  for (const step of ["build:days", "build:teams", "build:previews"] as Step[]) {
    const r = await call({ state: st, store, step, api: { h2h: poisoned } });
    st = { ...r.after!, updatedAt: NOW.toISOString() };
  }
  const ours = [...store.files.entries()].filter(([p]) => !p.startsWith("match/"));
  assert(ours.length > 80, `checked ${ours.length} files`);
  for (const [path, text] of ours) assert(!/http|logo|photo|flag/i.test(text), `${path} is clean`);
});
