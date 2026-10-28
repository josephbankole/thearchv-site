# Wire test fixtures

Test data only. Nothing here is ever built into the live site: the build reads
`scripts/data/daily/*.json`, and only a verification build that sets `WIRE_DATA_DIR`
points at `fixtures/daily/`.

- `sources.json`: a frozen copy of the source registry. The tests read this, never the live
  `scripts/wire/sources.json`, so enabling, disabling or retuning a live source cannot fail the
  build. Refresh it by hand when a test needs a new registry rule.
- `feeds/*.xml`: hand-made RSS in ESPN's shape, with invented placeholder headlines and ids.
  `espn-tennis.xml` is deliberately truncated (the parse-error case).
- `tables/nflverse-games.csv`: the 2025 and 2026 rows of nflverse's `schedules/games.csv`,
  trimmed to ten columns (no odds columns). Source: https://github.com/nflverse/nflverse-data,
  licence CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Trimmed by The ARCHV.
- `tables/openfootball-en1.json`: openfootball `football.json` 2026-27 `en.1.json`, CC0 1.0.
- `tables/football-data-standings.json`, `tables/football-data-cl-standings.json`,
  `tables/football-data-matches.json`: real football-data.org v4 responses of 12 October 2026
  (Premier League standings, Champions League standings with all 36 league-phase rows, and
  Manchester United's 2026 matches to 8 November), trimmed by The ARCHV to the fields
  `tables/football.mjs` reads. No crest, emblem, flag or URL field. Football data provided by
  the Football-Data.org API (https://www.football-data.org/). `fetch-tables --offline` reads
  them when `FOOTBALL_DATA_TOKEN` is set to any value.
- `tables/balldontlie-*.json`, `tables/jolpica-*.json`: invented, in the providers' documented
  shapes, for offline tests.
- `daily/wire.json`, `daily/tables.json`: a finished edition and tables file for the
  verification build and the page tests.
- `feed-items-golden.json`: the `items` array `buildWireFeed` produced for `daily/wire.json` before
  the 2026-10-28 change (club tags, ranked football extras), so the test can prove `items` is byte
  for byte the same apart from the added `clubs`. Regenerate only for a deliberate, versioned change.
