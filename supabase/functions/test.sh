#!/usr/bin/env bash
# Runs every Edge Function test suite: each directory under supabase/functions that holds a
# *_test.ts file. CI runs exactly this (.github/workflows/supabase-functions-test.yml), and the
# deploy checklist in supabase/functions/README.md asks for it green before any function deploy.
# No network: --no-remote refuses any remote import, so a suite that grows one fails here.
set -euo pipefail
cd "$(dirname "$0")"
failed=()
while IFS= read -r dir; do
  echo "== ${dir}"
  if ! (cd "$dir" && deno test --no-remote); then
    failed+=("$dir")
  fi
done < <(find . -name '*_test.ts' -not -path '*/node_modules/*' -exec dirname {} \; | sort -u)
if [ "${#failed[@]}" -gt 0 ]; then
  echo "FAILED: ${failed[*]}" >&2
  exit 1
fi
echo "All Edge Function suites passed."
