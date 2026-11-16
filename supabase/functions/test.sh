#!/usr/bin/env bash
# Runs every Edge Function test suite: each directory under supabase/functions that holds a
# *_test.ts file. CI runs exactly this (.github/workflows/supabase-functions-test.yml), and the
# deploy checklist in supabase/functions/README.md asks for it green before any function deploy.
# No network: --no-remote refuses any remote import, so a suite that grows one fails here.
set -euo pipefail
# Resolve a relative ARCHV_APP_FIXTURES against the caller's folder before moving.
if [ -n "${ARCHV_APP_FIXTURES:-}" ] && [ -d "$ARCHV_APP_FIXTURES" ]; then
  ARCHV_APP_FIXTURES="$(cd "$ARCHV_APP_FIXTURES" && pwd)"
fi
cd "$(dirname "$0")"
failed=()
while IFS= read -r dir; do
  echo "== ${dir}"
  if ! (cd "$dir" && deno test --no-remote); then
    failed+=("$dir")
  fi
done < <(find . -name '*_test.ts' -not -path '*/node_modules/*' -exec dirname {} \; | sort -u)
# The app fixtures drift check (scores-poll/app_fixtures_test.ts) needs the app repo on disk, which
# plain `deno test` cannot read. Run it whenever that repo is here: ARCHV_APP_FIXTURES, or the
# default ../thearchv-app checkout beside this repo. CI checks out this repo alone and skips it.
app_fixtures="${ARCHV_APP_FIXTURES:-../../../thearchv-app/TheARCHVTests/Fixtures}"
if [ -d "$app_fixtures" ]; then
  echo "== scores-poll app-fixtures-check (${app_fixtures})"
  app_fixtures="$(cd "$app_fixtures" && pwd)"
  if ! (cd scores-poll && ARCHV_APP_FIXTURES="$app_fixtures" deno task app-fixtures-check); then
    failed+=("scores-poll app-fixtures-check")
  fi
elif [ -n "${ARCHV_APP_FIXTURES:-}" ]; then
  echo "== scores-poll app-fixtures-check: ARCHV_APP_FIXTURES is not a folder: ${app_fixtures}" >&2
  failed+=("scores-poll app-fixtures-check")
else
  echo "== scores-poll app-fixtures-check skipped: no app fixtures at ${app_fixtures}"
fi
if [ "${#failed[@]}" -gt 0 ]; then
  echo "FAILED: ${failed[*]}" >&2
  exit 1
fi
echo "All Edge Function suites passed."
