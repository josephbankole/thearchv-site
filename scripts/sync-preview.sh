#!/usr/bin/env bash
# sync-preview.sh — run at the START of any thearchv.ca UI session.
#
# The daily engine commits the trackers (transferDays / worldCupDays / longReads)
# straight to `main` via the GitHub Contents API. UI work happens on `preview`.
# Left alone, the two branches drift and the eventual preview->main deploy hits
# conflicts + index.lock pain. This script pulls main's latest into preview first,
# so deploys stay clean (fast-forward).
#
# Usage:  bash scripts/sync-preview.sh
set -euo pipefail
cd "$(dirname "$0")/.."   # repo root

# Auto-maintenance off for every git call here, same reason as deploy-site.sh: the 2026-08-04
# failure was a detached `git maintenance run` holding the maintenance lock, and the only thing
# suppressing it since has been maintenance.auto=false in this one laptop's .git/config, which no
# clean clone and no second machine has. See that script's header for the full record.
git() { command git -c maintenance.auto=false "$@"; }

# main-owned files: the engine writes these directly to main. On any conflict, main wins.
DATA_FILES="src/data/transferDays.ts src/data/worldCupDays.ts src/data/leaguesDays.ts \
src/data/nflDays.ts src/data/f1Days.ts src/data/tennisDays.ts src/data/golfDays.ts \
src/data/longReads.ts"

# Wait for the index lock, never delete it. Deleting another process's lock is a race, not a cure
# for one: two writers on .git/index corrupt it, which is itself a source of the stash and merge
# errors this line was added to clear.
waited=0
while [ -f .git/index.lock ]; do
  if [ "$waited" -ge 30 ]; then
    echo "ERROR: .git/index.lock is still held after 30s. Something else is using this repo."
    echo "  Look for it with:  ps -ax | grep '[g]it'"
    echo "  Delete the lock ONLY once you have confirmed no git process is alive against this repo."
    exit 1
  fi
  [ "$waited" -eq 0 ] && echo "Waiting for .git/index.lock to clear..."
  sleep 1
  waited=$(( waited + 1 ))
done

git fetch origin
git checkout preview
git pull --ff-only origin preview || { echo "ERROR: local preview diverged from origin/preview. Resolve manually."; exit 1; }

echo "Merging origin/main into preview..."
if git merge --no-edit origin/main; then
  echo "Clean merge."
else
  # auto-resolve only the engine-owned data files to main's version (theirs in this merge)
  git checkout --theirs $DATA_FILES 2>/dev/null || true
  git add $DATA_FILES 2>/dev/null || true
  if git diff --name-only --diff-filter=U | grep -q .; then
    echo "ERROR: conflicts outside the tracker data files. Resolve these manually:"
    git diff --name-only --diff-filter=U
    exit 1
  fi
  git commit --no-edit
  echo "Auto-resolved tracker files to main's version."
fi

git push origin preview
echo "DONE: preview is in sync with main. Safe to start editing."
