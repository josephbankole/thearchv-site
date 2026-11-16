// The app's sample files (app_fixtures.ts) build, carry their schemas and are byte-stable, so the
// app's drift test compares against something fixed. Run: `deno test` from this dir.
import { buildAppFixtures, DEFAULT_APP_FIXTURES_DIR, fixtureFileText } from "./app_fixtures.ts";
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

// The drift check: the app repo's committed fixtures are exactly what the builders write today, so
// a change to a field name or nullability here fails before the app ships against a stale shape.
// It needs the app repo on disk, so it runs only with read permission and only when the folder is
// there: `deno task app-fixtures-check` from this dir, with ARCHV_APP_FIXTURES=<dir> to point at a
// checkout other than the one beside this repo. Plain `deno test` (and CI, which checks out this
// repo alone) skips it. On a failure, run `deno task app-fixtures` and commit the app's files.
function appFixturesDir(): string | null {
  const envOk = Deno.permissions.querySync({ name: "env", variable: "ARCHV_APP_FIXTURES" }).state === "granted";
  const dir = (envOk ? Deno.env.get("ARCHV_APP_FIXTURES") : undefined) ?? DEFAULT_APP_FIXTURES_DIR;
  if (Deno.permissions.querySync({ name: "read", path: dir }).state !== "granted") return null;
  try {
    return Deno.statSync(dir).isDirectory ? dir.replace(/\/$/, "") : null;
  } catch {
    return null;
  }
}

const APP_DIR = appFixturesDir();

Deno.test({
  name: "app fixtures: the app repo's copies match a fresh build byte for byte",
  ignore: APP_DIR === null,
  fn() {
    const stale: string[] = [];
    for (const [name, doc] of Object.entries(buildAppFixtures())) {
      let have: string | null = null;
      try {
        have = Deno.readTextFileSync(`${APP_DIR}/${name}`);
      } catch {
        have = null;
      }
      if (have !== fixtureFileText(doc)) stale.push(have === null ? `${name} (missing)` : name);
    }
    assert(stale.length === 0, `app fixtures out of date in ${APP_DIR}: ${stale.join(", ")}; run deno task app-fixtures`);
  },
});
