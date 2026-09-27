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
- `tables/balldontlie-*.json`, `tables/jolpica-*.json`: invented, in the providers' documented
  shapes, for offline tests.
- `daily/wire.json`, `daily/tables.json`: a finished edition and tables file for the
  verification build and the page tests.
