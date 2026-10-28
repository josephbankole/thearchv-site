// The app's sample files (app_fixtures.ts) build, carry their schemas and are byte-stable, so the
// app's drift test compares against something fixed. Run: `deno test` from this dir.
import { buildAppFixtures } from "./app_fixtures.ts";
import { assert, assertEquals } from "./testkit.ts";

Deno.test("app fixtures: every file builds, with its schema, the same bytes twice, and no URL", () => {
  const a = buildAppFixtures();
  assertEquals(JSON.stringify(a), JSON.stringify(buildAppFixtures()));
  const schemas = Object.fromEntries(Object.entries(a).map(([k, v]) => [k, (v as { schema: string }).schema]));
  assertEquals(schemas, {
    "match-with-players.json": "archv-match/1",
    "teams-index.json": "archv-teams/1",
    "team-33.json": "archv-team/1",
    "preview.json": "archv-preview/1",
    "ahead.json": "archv-days-ahead/1",
  });
  const m = a["match-with-players.json"] as { players: { home: unknown[]; away: unknown[] } | null };
  assert(m.players !== null && m.players.home.length > 0, "the sample match carries players");
  const p = a["preview.json"] as { h2h: { summary: { played: number } }; lastLineup: { home: unknown; away: unknown } };
  assert(p.h2h.summary.played === 6 && p.lastLineup.home && p.lastLineup.away, "the sample preview is full");
  assert(!/http|logo|photo|flag/i.test(JSON.stringify(a)), "no URL or image field");
});
