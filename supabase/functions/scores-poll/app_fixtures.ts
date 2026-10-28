// `deno task app-fixtures [out-dir]`: writes the server-side sample files the iOS app's model tests
// decode (TheARCHVTests/Fixtures/), by running the real builders over the recorded API replies, so
// the app's fixtures can never drift into a shape the server does not write. The app's drift test
// compares its copies against a fresh run of this. Not deployed, not part of `deno test`'s output.
//
// Default out-dir: the app repo beside this one (../../../../thearchv-app/TheARCHVTests/Fixtures from
// this folder in the main checkout). Pass a directory to write somewhere else.
import { mapMatch, mapMatchFile, type Match } from "./map.ts";
import { buildH2h, buildPreview, lastLineupOf, lineupFromMatchFile } from "./preview.ts";
import { buildAhead, buildTeams, heldMatches, teamPath, TEAMS_INDEX_PATH } from "./season.ts";
import { fixtureById, IDS } from "./testkit.ts";
import { h2hReply, heldState, kickoffIn, NOW } from "./season_testkit.ts";

const STAMP = NOW.toISOString();

// Every file, by its name in TheARCHVTests/Fixtures/. Deterministic: the same bytes on every run.
export function buildAppFixtures(): Record<string, unknown> {
  const pl = fixtureById(IDS.plFinished);
  const finished = mapMatch(pl)!;
  const matchFile = mapMatchFile(pl, { ...finished, detail: `match/${finished.id}.json` }, STAMP, true);

  const held = heldMatches(heldState());
  const teams = buildTeams(held, new Set([1557425]), 2026, STAMP);
  const body = (path: string) => teams.files.find((f) => f.path === path)!.body;

  const ahead = buildAhead(held, NOW, {}, STAMP).files.find((f) => f.path === "days/ahead.json")!.body;

  // Liverpool v Manchester City in three days, with the recorded 0-3 as both sides' last lineup.
  const derby: Match = {
    ...finished,
    id: 1557600,
    kickoff: kickoffIn(NOW, 3),
    status: { code: "NS", minute: null, extra: null, live: false, finished: false },
    home: { ...finished.home, goals: null },
    away: { ...finished.away, goals: null },
    detail: null,
  };
  const stored = JSON.stringify(matchFile);
  const last = (teamId: number) => lastLineupOf(finished, teamId, lineupFromMatchFile(stored, teamId)!);
  const preview = buildPreview(derby, buildH2h(h2hReply().response, derby, STAMP), { home: last(40), away: last(50) }, STAMP);

  return {
    "match-with-players.json": matchFile,
    "teams-index.json": body(TEAMS_INDEX_PATH),
    "team-33.json": body(teamPath(33)),
    "preview.json": preview,
    "ahead.json": ahead,
  };
}

if (import.meta.main) {
  const out = Deno.args[0] ?? new URL("../../../../thearchv-app/TheARCHVTests/Fixtures/", import.meta.url).pathname;
  for (const [name, doc] of Object.entries(buildAppFixtures())) {
    const path = `${out.replace(/\/$/, "")}/${name}`;
    await Deno.writeTextFile(path, JSON.stringify(doc, null, 2) + "\n");
    console.log(`wrote ${path}`);
  }
}
