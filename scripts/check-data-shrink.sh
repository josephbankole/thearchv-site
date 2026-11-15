#!/usr/bin/env bash
# check-data-shrink.sh: refuse a push that shrinks or rewinds a desk-written data file.
#
# Usage:  bash scripts/check-data-shrink.sh <base-sha> [<fallback-sha> ...]
#
# deploy.yml runs this as a job the build needs. The first argument is the commit the last
# successful "Deploy to GitHub Pages" run built, so the check is always against what is live:
# a blocked push stays blocked on every later push until the data is restored, instead of
# becoming the base the next desk commit is judged against. The second is the commit main
# pointed at before the push (github.event.before). The first candidate that exists and is an
# ancestor of HEAD is used; with none, HEAD~1. The file list is DATA_FILES in scripts/data-files.sh.
#
# Checks, per file, against the base:
#   answers.ts      number of `slug: "..."` entries must not drop
#   other *.ts      number of `date: "YYYY-MM-DD"` entries must not drop
#   wire.json       edition count must not drop; newest edition date and updatedAt must not go back
#   tables.json     sports count must not drop; updatedAt must not go back
#
# A deliberate removal: a commit in base..HEAD carries a git trailer (a line in the message's
# last paragraph) whose key is Data-Shrink-OK and whose value says why. Text in the body of a
# message does not count.
set -euo pipefail
cd "$(dirname "$0")/.."   # repo root
# shellcheck source=scripts/data-files.sh
. scripts/data-files.sh

usable() {
  local c="$1"
  [ -n "$c" ] && [ "$c" != "0000000000000000000000000000000000000000" ] \
    && git cat-file -e "${c}^{commit}" 2>/dev/null \
    && git merge-base --is-ancestor "$c" HEAD 2>/dev/null
}

base=""
for cand in "$@"; do
  if usable "$cand"; then base="$cand"; break; fi
  echo "Base candidate '${cand}' is missing or not an ancestor of HEAD; trying the next."
done
if [ -z "$base" ]; then
  if ! git cat-file -e "HEAD~1^{commit}" 2>/dev/null; then
    echo "No usable base and no parent commit; nothing to compare. Passing."
    exit 0
  fi
  echo "No usable base commit; comparing against HEAD~1."
  base="HEAD~1"
fi
echo "Comparing data files at HEAD against ${base}."

ok_reason="$(git log --format='%(trailers:key=Data-Shrink-OK,valueonly,separator=%x20)' "${base}..HEAD" \
  | grep -m1 '[^[:space:]]' || true)"
if [ -n "$ok_reason" ]; then
  echo "::warning::Data-Shrink-OK trailer found in base..HEAD (${ok_reason}); data shrink guard skipped."
  exit 0
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
fail=0

count_dates() { grep -oE "date: [\"'][0-9-]+[\"']" "$1" | wc -l | tr -d ' '; }
count_slugs() { grep -cE '^[[:space:]]*slug: "' "$1" || true; }

for f in $DATA_FILES; do
  prev="$tmp/prev_$(basename "$f")"
  if [ -z "$(git ls-tree "$base" -- "$f")" ]; then
    echo "$f: not in base (new file), skipping."
    continue
  fi
  if ! git show "${base}:${f}" > "$prev"; then
    echo "::error::$f could not be read at ${base}."
    fail=1
    continue
  fi
  if [ ! -f "$f" ]; then
    echo "::error::$f existed at ${base} and is missing now."
    fail=1
    continue
  fi
  case "$f" in
    */answers.ts)
      p=$(count_slugs "$prev"); c=$(count_slugs "$f")
      echo "$f: entries previous=$p current=$c"
      if [ "$c" -lt "$p" ]; then
        echo "::error::$f has fewer entries ($c) than ${base} ($p)."
        fail=1
      fi
      ;;
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
  echo "::error::A data file shrank or went back in time. This looks like a clobbering merge (for example an outdated preview branch overwriting main). The deploy is stopped. If the removal is deliberate, push a commit whose message ends with a Data-Shrink-OK trailer giving the reason."
  exit 1
fi
echo "Data shrink guard: passed."
