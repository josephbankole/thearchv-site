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

# main-owned files: the engine writes these directly to main. On any conflict, main wins.
DATA_FILES="src/data/transferDays.ts src/data/worldCupDays.ts src/data/leaguesDays.ts src/data/longReads.ts"

# clear a stale lock left by a crashed git process (the recurring index.lock error)
[ -f .git/index.lock ] && rm -f .git/index.lock && echo "Removed stale .git/index.lock"

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
