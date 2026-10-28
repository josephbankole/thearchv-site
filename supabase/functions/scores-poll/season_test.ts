// Unit tests for season mode's decisions and builders (season.ts): which step a call takes, the
// guards, the state row, the forward day files, the team files and the hash record. Run:
// `deno test` from this dir. No network, no permissions.
import { dayPath } from "./days.ts";
import { detailPath, type Match } from "./map.ts";
import { addDays } from "./plan.ts";
import { previewPath } from "./preview.ts";
import {
  AHEAD_PATH,
  apiGuards,
  buildAhead,
  buildTeams,
  chooseStep,
  dueBuild,
  EMPTY_SEASON_STATE,
  heldMatches,
  isStep,
  listingSlot,
  previewPathsFor,
  previewTargets,
  pruneHashes,
  rollover,
  rowFromSeasonState,
  type SeasonState,
  seasonStateFromRow,
  teamPath,
  TEAMS_INDEX_PATH,
  teamPathsFor,
} from "./season.ts";
import { assert, assertEquals } from "./testkit.ts";
import { heldState, NOW, seasonMatches } from "./season_testkit.ts";

const at = (iso: string) => new Date(iso);
const H = 3_600_000;
const ago = (ms: number, from = NOW) => new Date(from.getTime() - ms).toISOString();

// ---------- the step ----------

Deno.test("listing slots: :07, :22 and :37 past 00, 06, 12 and 18 UTC, one competition each", () => {
  assertEquals(listingSlot(at("2026-10-28T00:07:03Z")), "premier-league");
  assertEquals(listingSlot(at("2026-10-28T06:22:00Z")), "champions-league");
  assertEquals(listingSlot(at("2026-10-28T12:37:59Z")), "wsl");
  assertEquals(listingSlot(at("2026-10-28T18:11:00Z")), "premier-league"); // a late start still lists
  for (const t of ["2026-10-28T18:52:00Z", "2026-10-28T12:12:00Z", "2026-10-28T07:07:00Z", "2026-10-28T13:22:00Z"]) {
    assertEquals(listingSlot(at(t)), null, t);
  }
  // 12 listings a day, whatever the state row says.
  let n = 0;
  for (let h = 0; h < 24; h++) for (const m of [7, 22, 37, 52]) if (listingSlot(new Date(Date.UTC(2026, 9, 28, h, m)))) n++;
  assertEquals(n, 12);
});

Deno.test("step choice: a listing slot lists; every other slot takes the first build that is due", () => {
  const s = heldState();
  assertEquals(chooseStep(s, at("2026-10-28T12:07:00Z")).step, "list:premier-league");
  assertEquals(chooseStep(s, at("2026-10-28T12:52:00Z")).step, "build:days");
  const days = { ...s, builtAt: { days: ago(0) } };
  assertEquals(dueBuild(days, NOW), "build:teams");
  const teams = { ...s, builtAt: { days: ago(0), teams: ago(0) } };
  assertEquals(dueBuild(teams, NOW), "build:previews");
  const all = { ...s, builtAt: { days: ago(0), teams: ago(0), previews: ago(0) } };
  assertEquals(chooseStep(all, NOW), { step: null, skipped: null });
  // A listing newer than a build makes it due again; so does six hours.
  const relisted = { ...all, listedAt: { ...all.listedAt, wsl: new Date(NOW.getTime() + 1).toISOString() } };
  assertEquals(dueBuild(relisted, new Date(NOW.getTime() + 2)), "build:days");
  assertEquals(dueBuild(all, new Date(NOW.getTime() + 6 * H)), "build:days");
  // Previews follow a rebuild of the days.
  const daysNewer = { ...s, builtAt: { days: ago(0), teams: ago(0), previews: ago(H) } };
  assertEquals(dueBuild(daysNewer, NOW), "build:previews");
});

Deno.test("guards: a backoff blocks the API but not the builds", () => {
  const s = heldState(NOW, (x) => (x.backoffUntil = new Date(NOW.getTime() + 60_000).toISOString()));
  assertEquals(apiGuards(s, NOW), { apiAllowed: false, reason: "backing off" });
  const slot = at("2026-10-28T12:07:30Z");
  const c = chooseStep(s, slot);
  assertEquals([c.step, c.skipped], ["build:days", "backing off"]);
  // Spent: the API is allowed again.
  assertEquals(apiGuards(s, new Date(NOW.getTime() + 120_000)).apiAllowed, true);
});

Deno.test("guards: a quota reserve recorded today blocks the API; one recorded yesterday does not", () => {
  const low = heldState(NOW, (x) => {
    x.remaining = 1200;
    x.remainingAt = ago(H);
  });
  assertEquals(apiGuards(low, NOW), { apiAllowed: false, reason: "quota-reserve" });
  const yesterday = heldState(NOW, (x) => {
    x.remaining = 1200;
    x.remainingAt = "2026-10-27T23:50:00.000Z";
  });
  assertEquals(apiGuards(yesterday, NOW).apiAllowed, true);
  const plenty = heldState(NOW, (x) => {
    x.remaining = 1500;
    x.remainingAt = ago(H);
  });
  assertEquals(apiGuards(plenty, NOW).apiAllowed, true);
});

Deno.test("guards: an earlier failed state write means no request, only builds", () => {
  // A stamp newer than the row's own updated_at cannot come from a write that landed.
  const odd = heldState(NOW, (x) => (x.builtAt = { days: ago(0) }));
  odd.updatedAt = ago(H);
  assertEquals(apiGuards(odd, NOW).reason, "state write failed earlier");
  // A row not written for over six hours while the cron runs.
  const stale = heldState(NOW, (x) => (x.updatedAt = ago(6 * H + 60_000)));
  assertEquals(apiGuards(stale, NOW).apiAllowed, false);
  assertEquals(chooseStep(stale, at("2026-10-28T12:22:00Z")).step, "build:days");
  // A forced listing is refused too; a forced build is not.
  assertEquals(chooseStep(stale, NOW, "list:wsl"), { step: null, skipped: "state write failed earlier" });
  assertEquals(chooseStep(stale, NOW, "build:teams").step, "build:teams");
  // A row nothing has stamped yet (the migration's insert) is not stale, however old.
  const unused = { ...EMPTY_SEASON_STATE, updatedAt: ago(30 * H) };
  assertEquals(apiGuards(unused, NOW).apiAllowed, true);
  assertEquals(chooseStep(unused, NOW, "list:wsl").step, "list:wsl");
});

Deno.test("step choice: a failed teams or previews run waits for the next listing or six hours", () => {
  const s = heldState();
  const teamsFailed = { ...s, builtAt: { days: ago(0), teamsFailed: ago(0) } };
  assertEquals(dueBuild(teamsFailed, NOW), "build:previews");
  assertEquals(dueBuild({ ...teamsFailed, builtAt: { ...teamsFailed.builtAt, previews: ago(0) } }, NOW), null);
  const previewsFailed = { ...s, builtAt: { days: ago(H), teams: ago(H), previewsFailed: ago(0) } };
  assertEquals(dueBuild(previewsFailed, NOW), null);
  assertEquals(dueBuild(previewsFailed, new Date(NOW.getTime() + 6 * H)), "build:days");
  // Days rebuilt after the failure: previews retry.
  const daysNewer = { ...s, builtAt: { days: ago(0), teams: ago(0), previewsFailed: ago(H) } };
  assertEquals(dueBuild(daysNewer, NOW), "build:previews");
  // A new listing after a failed teams run retries it.
  const relisted = { ...teamsFailed, listedAt: { ...s.listedAt, wsl: new Date(NOW.getTime() + 1).toISOString() } };
  assertEquals(dueBuild({ ...relisted, builtAt: { ...relisted.builtAt, days: new Date(NOW.getTime() + 2).toISOString() } }, new Date(NOW.getTime() + 3)), "build:teams");
});

Deno.test("forced steps: only the four kinds are accepted", () => {
  for (const ok of ["list:premier-league", "list:champions-league", "list:wsl", "build:days", "build:teams", "build:previews"]) {
    assert(isStep(ok), ok);
  }
  for (const bad of ["list:la-liga", "build:everything", "", null, 3, "list:"]) assert(!isStep(bad), String(bad));
  assertEquals(chooseStep(heldState(), NOW, "list:wsl").step, "list:wsl");
});

// ---------- the state row ----------

Deno.test("state row: round-trips, and a damaged row reads as empty, column by column", () => {
  const s: SeasonState = { ...heldState(), fileHashes: { "teams/33.json": "abc" }, remaining: 7000, remainingAt: ago(0) };
  const back = seasonStateFromRow(JSON.parse(JSON.stringify(rowFromSeasonState(s, NOW))));
  assertEquals(back, { ...s, updatedAt: NOW.toISOString() });
  assertEquals(seasonStateFromRow(null), EMPTY_SEASON_STATE);
  const damaged = seasonStateFromRow({
    season: "2026", listed_at: [], matches: { wsl: "x", "premier-league": [null, 7, ...seasonMatches("premier-league")] },
    built_at: { days: "soon" }, file_hashes: { a: 1, b: "h" }, remaining: 1.5, remaining_at: 3, backoff_until: "x",
  });
  assertEquals([damaged.season, damaged.listedAt, damaged.builtAt, damaged.fileHashes, damaged.remaining], [null, {}, {}, { b: "h" }, null]);
  assertEquals(damaged.matches["premier-league"]!.length, 10);
  assertEquals(damaged.matches.wsl, undefined);
});

Deno.test("season rollover clears what is held, so an empty new-season listing is believed", () => {
  const s = { ...heldState(), season: 2025 };
  const r = rollover(s, 2026);
  assertEquals([r.season, r.matches, r.listedAt], [2026, {}, {}]);
  assertEquals(rollover(heldState(), 2026), heldState()); // same season: untouched
});

// ---------- build:days ----------

Deno.test("build:days: days +2 to +28 only, an emptied day gets an empty file, and ahead.json lists tomorrow on", () => {
  const held = heldMatches(heldState());
  const today = "2026-10-28";
  const lost = dayPath(addDays(today, 9)); // had a file, has no matches now
  const out = buildAhead(held, NOW, { [lost]: "h" }, NOW.toISOString());
  const paths = out.files.map((f) => f.path);
  for (const n of [-1, 0, 1]) assert(!paths.includes(dayPath(addDays(today, n))), `never day ${n}`);
  assert(!paths.includes("days/index.json"), "the index is never touched");
  assert(!paths.some((p) => p > dayPath(addDays(today, 28)) && p !== AHEAD_PATH), "nothing past +28");
  const empty = out.files.find((f) => f.path === lost)!.body as { matches: unknown[] };
  assertEquals(empty.matches, []);
  const ahead = out.files.find((f) => f.path === AHEAD_PATH)!.body as { schema: string; days: { date: string; count: number }[] };
  assertEquals(ahead.schema, "archv-days-ahead/1");
  // The future kickoffs from season_testkit's OFFSETS, by day: +1 (PL), +2, +3 (PL and WSL), ...
  assertEquals(ahead.days[0], { date: "2026-10-29", count: 1 });
  assertEquals(ahead.days.find((d) => d.date === "2026-10-31"), { date: "2026-10-31", count: 2 });
  assert(ahead.days.every((d, i) => d.count > 0 && (i === 0 || d.date > ahead.days[i - 1].date)), "ascending, counts above 0");
  assert(ahead.days.every((d) => d.date <= addDays(today, 28)), "nothing past +28");
  // Day +1 is listed but not written: tomorrow's file is the poll's.
  assert(!paths.includes(dayPath("2026-10-29")), "tomorrow is the poll's");
  // A day file carries the same MATCH objects, with no detail pointer.
  const d2 = out.files.find((f) => f.path === dayPath("2026-10-30"))!.body as { schema: string; matches: Match[] };
  assertEquals(d2.schema, "archv-day/1");
  assert(d2.matches.every((m) => m.detail === null), "no pointers ahead");
  assertEquals(out.owned.length, 28); // 27 days and ahead.json
});

// ---------- build:teams ----------

Deno.test("build:teams: a file per in-scope team, both teams of a match, pointers only for stored files", () => {
  const held = heldMatches(heldState());
  const out = buildTeams(held, new Set([1557425]), 2026, NOW.toISOString());
  const team = (id: number) => out.files.find((f) => f.path === teamPath(id))?.body as {
    team: { id: number; name: string; club: string | null; women: boolean; competitions: string[] };
    matches: Match[];
  };
  // Manchester United: Tottenham at home in three days, then Atletico away in the Champions League.
  const mu = team(33);
  assertEquals(mu.team, { id: 33, name: "Manchester United", club: "manchester-united", women: false, competitions: ["premier-league", "champions-league"] });
  assertEquals(mu.matches.map((m) => m.id), [1557425, 1635623]);
  assertEquals(mu.matches.map((m) => m.detail), [detailPath(1557425), null]);
  assert(team(47).matches.some((m) => m.id === 1557425), "the match is in Tottenham's file too");
  assert(mu.matches.every((m, i) => i === 0 || Date.parse(m.kickoff) >= Date.parse(mu.matches[i - 1].kickoff)), "kickoff order");
  // The women's side.
  assertEquals(team(4898).team, { id: 4898, name: "Manchester United", club: "manchester-united", women: true, competitions: ["wsl"] });
  // 20 PL, 36 UCL and 14 WSL sides; five English clubs play in both men's competitions; plus the index.
  assertEquals(out.files.length, 20 + 36 + 14 - 5 + 1);

  // A failed storage listing: no pointers at all.
  const blind = buildTeams(held, null, 2026, NOW.toISOString());
  assert(blind.files.every((f) => !("matches" in f.body) || f.body.matches.every((m) => m.detail === null)), "no pointers");
});

Deno.test("build:teams: the index carries every club with its teams, men's and women's, sorted by name", () => {
  const out = buildTeams(heldMatches(heldState()), new Set(), 2026, NOW.toISOString());
  const index = out.files.find((f) => f.path === TEAMS_INDEX_PATH)!.body as {
    schema: string; season: number;
    clubs: { key: string; name: string; auto: boolean; teams: { id: number; women: boolean; competitions: string[] }[] }[];
  };
  assertEquals([index.schema, index.season], ["archv-teams/1", 2026]);
  const mu = index.clubs.find((c) => c.key === "manchester-united")!;
  assertEquals(mu.teams, [
    { id: 33, women: false, competitions: ["premier-league", "champions-league"] },
    { id: 4898, women: true, competitions: ["wsl"] },
  ]);
  // Clubs with no in-scope team this season (legacy keys) are still listed, with no teams.
  const celtic = index.clubs.find((c) => c.key === "celtic")!;
  assertEquals(celtic.teams, []);
  const names = index.clubs.map((c) => c.name);
  assertEquals(names, [...names].sort((a, b) => a.localeCompare(b, "en")));
  assertEquals(out.autoKeys, []);
  // No team id belongs to two clubs.
  const seen = new Set<number>();
  for (const c of index.clubs) for (const t of c.teams) {
    assert(!seen.has(t.id), `team ${t.id} under one club`);
    seen.add(t.id);
  }
});

Deno.test("build:teams: a team clubs.json lacks gets an auto entry; qualifier-only sides get nothing", () => {
  const held = heldMatches(heldState());
  const qualifier: Match = {
    ...held[0],
    id: 1599001,
    competition: { key: "champions-league", name: "UEFA Champions League", round: "2nd Qualifying Round" },
    kickoff: "2026-07-22T18:00:00+00:00",
    home: { id: 9001, name: "Qualifier Town", goals: 1 },
    away: { id: 33, name: "Manchester United", goals: 2 },
  };
  const stranger: Match = { ...held[0], id: 1599002, home: { id: 9002, name: "Newcomers FC", goals: 0 } };
  const out = buildTeams([...held, qualifier, stranger], new Set(), 2026, NOW.toISOString());
  assert(!out.files.some((f) => f.path === teamPath(9001)), "qualifier-only side has no file");
  // The qualifier still sits in United's own file: it is one of their matches.
  const mu = out.files.find((f) => f.path === teamPath(33))!.body as { matches: Match[] };
  assert(mu.matches.some((m) => m.id === 1599001), "United's file keeps the qualifier");
  assertEquals(out.autoKeys, ["team-9002"]);
  const index = out.files.find((f) => f.path === TEAMS_INDEX_PATH)!.body as { clubs: { key: string; auto: boolean; aliases: string[] }[] };
  const auto = index.clubs.find((c) => c.key === "team-9002")!;
  assertEquals([auto.auto, auto.aliases], [true, []]);
  assert(!index.clubs.some((c) => c.key === "team-9001"), "no auto entry for a qualifier-only side");
});

Deno.test("build:teams: two clubs claiming one team id is caught", () => {
  // The rule lives in clubs_test.ts against the real table; here, that the builder would show it.
  const out = buildTeams(heldMatches(heldState()), new Set(), 2026, NOW.toISOString(), [
    { key: "a", name: "A", aliases: [], notWith: [], formerKeys: [], teamIds: [33] },
    { key: "b", name: "B", aliases: [], notWith: [], formerKeys: [], teamIds: [33] },
  ]);
  const index = out.files.find((f) => f.path === TEAMS_INDEX_PATH)!.body as { clubs: { key: string; teams: { id: number }[] }[] };
  const claims = index.clubs.filter((c) => c.teams.some((t) => t.id === 33)).length;
  assertEquals(claims, 2);
});

// ---------- previews and hashes ----------

Deno.test("preview targets: not started, from now to 28 days on, in kickoff order", () => {
  const held = heldMatches(heldState());
  const t = previewTargets(held, NOW);
  assert(t.every((m) => m.status.code === "NS" && Date.parse(m.kickoff) <= NOW.getTime() + 28 * 24 * H), "in range");
  assert(t.every((m, i) => i === 0 || Date.parse(m.kickoff) >= Date.parse(t[i - 1].kickoff)), "kickoff order");
  // +29, +30, +35, +40 and +50 are out; the past is out.
  assertEquals(t.length, 4 + 8 + 3);
});

Deno.test("file hashes: a day that became the poll's and a preview that kicked off are dropped", () => {
  const held = heldMatches(heldState());
  const future = previewTargets(held, NOW)[0];
  const later = new Date(Date.parse(future.kickoff) + 60_000);
  const hashes = {
    [dayPath("2026-10-30")]: "a", // +2 now
    [dayPath("2026-10-31")]: "b",
    [AHEAD_PATH]: "c",
    [teamPath(33)]: "d",
    [teamPath(9999)]: "e", // no longer in scope
    [TEAMS_INDEX_PATH]: "f",
    [previewPath(future.id)]: "g",
    "scores.json": "h", // never this mode's
  };
  const keep = (now: Date) => pruneHashes(hashes, { now, teamPaths: teamPathsFor(held), previewPaths: previewPathsFor(held, now) });
  assertEquals(Object.keys(keep(NOW)).sort(), [AHEAD_PATH, dayPath("2026-10-30"), dayPath("2026-10-31"), previewPath(future.id), TEAMS_INDEX_PATH, teamPath(33)].sort());
  // Two days on, the 30th is tomorrow (the poll's) and the first preview has kicked off.
  const twoDays = new Date(NOW.getTime() + 2 * 24 * H);
  assert(later <= twoDays, "the first target kicks off within two days");
  const k = keep(twoDays);
  assert(!(dayPath("2026-10-30") in k), "a day that left the owned range goes");
  assert(!(previewPath(future.id) in k), "a preview whose match kicked off goes");
  assert(!(dayPath("2026-10-31") in k), "the 31st is tomorrow by then, so it goes too");
  assert(teamPath(33) in k && TEAMS_INDEX_PATH in k && AHEAD_PATH in k, "the rest stays");
});
