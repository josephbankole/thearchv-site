#!/usr/bin/env bash
# check-data-shrink.sh: refuse a push that shrinks or rewinds a desk-written data file.
#
# Usage:  bash scripts/check-data-shrink.sh <base-sha>
#
# deploy.yml runs this as a job the build needs, with <base-sha> set to the commit main
# pointed at before the push (github.event.before), so a push of several commits is judged
# as a whole and a red result stops the Pages deploy. With no usable base it falls back to
# HEAD~1. The file list is DATA_FILES in scripts/data-files.sh.
#
# Checks, per file, against the base:
#   *.ts            number of `date: "YYYY-MM-DD"` entries must not drop
#   wire.json       edition count must not drop; newest edition date and updatedAt must not go back
#   tables.json     sports count must not drop; updatedAt must not go back
#
# A deliberate removal: put [data-shrink-ok] in a commit message in the pushed range.
set -euo pipefail
cd "$(dirname "$0")/.."   # repo root
# shellcheck source=scripts/data-files.sh
. scripts/data-files.sh

base="${1:-}"
if [ -z "$base" ] || [ "$base" = "0000000000000000000000000000000000000000" ] \
   || ! git cat-file -e "${base}^{commit}" 2>/dev/null; then
  echo "No usable base commit ('${base}'); comparing against HEAD~1."
  base="HEAD~1"
  if ! git cat-file -e "HEAD~1^{commit}" 2>/dev/null; then
    echo "No parent commit either; nothing to compare. Passing."
    exit 0
  fi
fi
echo "Comparing data files at HEAD against ${base}."

if git log --format=%B "${base}..HEAD" | grep -qF '[data-shrink-ok]'; then
  echo "::warning::[data-shrink-ok] found in a pushed commit message; data shrink guard skipped."
  exit 0
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
fail=0

count_dates() { grep -oE "date: [\"'][0-9-]+[\"']" "$1" | wc -l | tr -d ' '; }

for f in $DATA_FILES; do
  prev="$tmp/prev_$(basename "$f")"
  if ! git show "${base}:${f}" > "$prev" 2>/dev/null; then
    echo "$f: not in base (new file), skipping."
    continue
  fi
  if [ ! -f "$f" ]; then
    echo "::error::$f existed at ${base} and is missing now."
    fail=1
    continue
  fi
  case "$f" in
    *.ts)
      p=$(count_dates "$prev"); c=$(count_dates "$f")
      echo "$f: entries previous=$p current=$c"
      if [ "$c" -lt "$p" ]; then
        echo "::error::$f has fewer date entries ($c) than ${base} ($p)."
        fail=1
      fi
      ;;
    */wire.json)
      p=$(jq '.editions | length' "$prev"); c=$(jq '.editions | length' "$f")
      pd=$(jq -r '[.editions[].date] | max // ""' "$prev"); cd_=$(jq -r '[.editions[].date] | max // ""' "$f")
      pu=$(jq -r '.updatedAt // ""' "$prev"); cu=$(jq -r '.updatedAt // ""' "$f")
      echo "$f: editions previous=$p current=$c, newest previous=$pd current=$cd_, updatedAt previous=$pu current=$cu"
      if [ "$c" -lt "$p" ]; then echo "::error::$f has fewer editions ($c) than ${base} ($p)."; fail=1; fi
      if [[ "$cd_" < "$pd" ]]; then echo "::error::$f newest edition ($cd_) is older than at ${base} ($pd)."; fail=1; fi
      if [[ "$cu" < "$pu" ]]; then echo "::error::$f updatedAt ($cu) is older than at ${base} ($pu)."; fail=1; fi
      ;;
    */tables.json)
      p=$(jq '.sports | length' "$prev"); c=$(jq '.sports | length' "$f")
      pu=$(jq -r '.updatedAt // ""' "$prev"); cu=$(jq -r '.updatedAt // ""' "$f")
      echo "$f: sports previous=$p current=$c, updatedAt previous=$pu current=$cu"
      if [ "$c" -lt "$p" ]; then echo "::error::$f has fewer sports ($c) than ${base} ($p)."; fail=1; fi
      if [[ "$cu" < "$pu" ]]; then echo "::error::$f updatedAt ($cu) is older than at ${base} ($pu)."; fail=1; fi
      ;;
    *)
      echo "$f: no rule for this file type, skipping."
      ;;
  esac
done

if [ "$fail" -ne 0 ]; then
  echo "::error::A data file shrank or went back in time. This looks like a clobbering merge (for example an outdated preview branch overwriting main). The deploy is stopped. If the removal is deliberate, push a commit whose message contains [data-shrink-ok]."
  exit 1
fi
echo "Data shrink guard: passed."
