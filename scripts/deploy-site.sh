#!/usr/bin/env bash
# deploy-site.sh — publish thearchv.ca by merging preview -> main (Actions deploys main).
#
# Run this after committing your UI work on preview. If you ran sync-preview.sh at the
# start of the session this is a clean fast-forward; if the engine added newer tracker
# entries to main since then, they win automatically.
#
# Usage:  bash scripts/deploy-site.sh
set -euo pipefail
cd "$(dirname "$0")/.."   # repo root

DATA_FILES="src/data/transferDays.ts src/data/worldCupDays.ts src/data/leaguesDays.ts src/data/longReads.ts"

[ -f .git/index.lock ] && rm -f .git/index.lock && echo "Removed stale .git/index.lock"

# preview work must be committed first
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "ERROR: you have uncommitted changes. Commit them on preview first, then re-run."
  git status --short
  exit 1
fi

git fetch origin
git checkout preview
git pull --ff-only origin preview || true
git push origin preview

git checkout main
git reset --hard origin/main   # safe: main only receives engine commits + these merges, no local-only work
echo "Merging preview into main..."
if git merge --no-edit preview; then
  echo "Clean merge."
else
  # keep main's (ours) tracker files; everything else should already agree if sync-preview was run
  git checkout --ours $DATA_FILES 2>/dev/null || true
  git add $DATA_FILES 2>/dev/null || true
  if git diff --name-only --diff-filter=U | grep -q .; then
    echo "ERROR: conflicts outside the tracker data files. Resolve these manually:"
    git diff --name-only --diff-filter=U
    exit 1
  fi
  git commit --no-edit
fi

git push origin main
git checkout preview
echo "DONE: merged preview -> main and pushed. GitHub Actions will build + publish thearchv.ca (~1-3 min)."

# --- IndexNow ping (SEO/AEO audit fix 6, 2026-07-28) --------------------------------------------
# Tells Bing, and through it MSN and the answer engines that read Bing, what changed within
# minutes rather than waiting for a crawl. Bounded to the 25 newest URLs: a deploy changes a
# handful of pages, not the archive. scripts/ping-indexnow.mjs finds its own key file in public/.
#
# NON-FATAL BY DESIGN. A deploy has already succeeded by this point; a ping that fails must never
# turn a published deploy into a failed command, so the exit code is swallowed. Rerun by hand with
# `node scripts/ping-indexnow.mjs 25` if you want it.
#
# It reads the LOCAL dist/sitemap.xml, so it submits what your last `npm run build` produced. Per
# CLAUDE.md the engine commits its data straight to main, so a local build can lag what is live:
# to submit exactly what is published, curl https://thearchv.ca/sitemap.xml to a file once Pages
# has rebuilt and run `SITEMAP_PATH=<that file> node scripts/ping-indexnow.mjs 25`.
if [ -f dist/sitemap.xml ]; then
  echo "Pinging IndexNow with the 25 newest URLs..."
  node scripts/ping-indexnow.mjs 25 || echo "WARNING: IndexNow ping failed. The deploy is unaffected; rerun 'node scripts/ping-indexnow.mjs 25' if you want to retry."
else
  echo "Skipping IndexNow: no dist/sitemap.xml (run 'npm run build', then 'node scripts/ping-indexnow.mjs 25')."
fi
