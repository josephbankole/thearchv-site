#!/usr/bin/env bash
# deploy-site.sh — publish thearchv.ca by merging preview -> main (Actions deploys main).
#
# Run this after committing your UI work on preview. If you ran sync-preview.sh at the
# start of the session this is a clean fast-forward; if the engine added newer tracker
# entries to main since then, they win automatically.
#
# Usage:  bash scripts/deploy-site.sh
#
# ###########################################################################################
# ## READ THIS BEFORE RUNNING IT, 2026-08-04. THIS SCRIPT MERGES preview INTO main.         ##
# ###########################################################################################
#
# preview's tree STILL CARRIES the Tier 0 pass whose homepage half broke scrolling on a phone
# (see trap 3 in CLAUDE.md). main had it reverted the same day by 054ff1d.
#
# Merging preview into main today does NOT put it back, and that is the trap, not the relief.
# Verified in a throwaway clone this evening: merge base 60fda38, one file changed, CLAUDE.md,
# twelve lines added, and zero occurrences of [data-inview] in main's src/style.css afterwards.
# The reason is the revert-of-a-merge problem. 4a38d95, the merge that brought Tier 0 in, is
# still an ancestor of main, so git considers preview's commits already merged and contributes
# nothing but whatever preview has gained SINCE. The revert undid the files; it did not undo the
# history.
#
# The consequence lands on the day Tier 0 is re-landed with the scroll fix: running this script
# will report a clean merge, push, go green, and ship none of it. Re-land off a fresh branch cut
# from main, or revert the revert (git revert 054ff1d) first. Do not diagnose that as a deploy
# failure; it is this.
#
# Either way, look at what the merge actually changed before you let it push. This script now
# prints that diff, so the answer is on screen rather than assumed.
set -euo pipefail
cd "$(dirname "$0")/.."   # repo root

# Every git call in this script runs with auto-maintenance off. On 2026-08-04 a detached
# `git maintenance run` held the maintenance lock, `git stash create` failed under it, and the
# whole thing surfaced as a generic stash error on the merge — misdiagnosed twice as broken merge
# logic before the lock was found. The fix has been living in THIS LAPTOP'S .git/config as
# maintenance.auto=false ever since, which is to say it does not exist for a clean clone, for CI,
# or for the founder on a second machine. It belongs in the script. Wrapping the command rather
# than annotating each call site means a git line added later cannot quietly miss it.
git() { command git -c maintenance.auto=false "$@"; }

DATA_FILES="src/data/transferDays.ts src/data/worldCupDays.ts src/data/leaguesDays.ts \
src/data/nflDays.ts src/data/f1Days.ts src/data/tennisDays.ts src/data/golfDays.ts \
src/data/longReads.ts"

# Wait for the index lock, never delete it. The old line removed .git/index.lock on sight with no
# age check and no process check, which is not a fix for a race: if something legitimately holds
# the index, deleting its lock lets two processes write .git/index at once and corrupts it, which
# produces exactly the family of stash-and-merge errors the deletion was meant to cure.
require_free_index_lock() {
  local waited=0
  local limit=30
  while [ -f .git/index.lock ]; do
    if [ "$waited" -ge "$limit" ]; then
      echo "ERROR: .git/index.lock is still held after ${limit}s. Something else is using this repo."
      echo "  Lock age: $(( $(date +%s) - $(stat -f %m .git/index.lock 2>/dev/null || stat -c %Y .git/index.lock) ))s"
      echo "  Look for a running git, an editor's git integration, or a background maintenance run:"
      echo "    ps -ax | grep '[g]it'"
      echo "  Delete the lock ONLY once you have confirmed no git process is alive against this repo."
      exit 1
    fi
    [ "$waited" -eq 0 ] && echo "Waiting for .git/index.lock to clear..."
    sleep 1
    waited=$(( waited + 1 ))
  done
}

require_free_index_lock

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

# What is actually about to ship. A merge that reports "Clean merge." and changes nothing is a
# real outcome and used to be indistinguishable from one that changed everything.
echo "This deploy will change:"
git diff --stat origin/main..main || true
if git diff --quiet origin/main..main; then
  echo "  (nothing — main already matches origin/main. See the header note about the reverted merge.)"
fi

git push origin main
PUSHED_SHA="$(git rev-parse main)"
git checkout preview

# DO NOT ASSERT AN OUTCOME THIS SCRIPT HAS NOT SEEN. CLAUDE.md's own rule: a failed build leaves
# the previous version serving 200s, so the old page answering is not evidence the new one shipped.
# The push succeeding is evidence that the push succeeded and nothing more.
echo "Pushed ${PUSHED_SHA} to main."
if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  echo "Waiting for a GitHub Actions run against ${PUSHED_SHA}..."
  run_found=""
  for _ in $(seq 1 20); do
    if gh run list --commit "${PUSHED_SHA}" --limit 5 2>/dev/null | grep -q .; then
      run_found="yes"
      break
    fi
    sleep 6
  done
  if [ -n "$run_found" ]; then
    gh run list --commit "${PUSHED_SHA}" --limit 5
    echo "DONE: merged preview -> main, pushed, and a run exists for this commit. Watch it finish with:"
    echo "  gh run watch --commit ${PUSHED_SHA}"
  else
    echo "PUSHED, CI NOT CONFIRMED: no Actions run appeared for ${PUSHED_SHA} within two minutes."
    echo "  Check it yourself before believing this shipped:  gh run list --commit ${PUSHED_SHA}"
  fi
else
  echo "PUSHED, CI NOT CONFIRMED: gh is not installed or not authenticated here, so this script"
  echo "  cannot see whether the build ran. Check the 'pages build and deployment' run for"
  echo "  ${PUSHED_SHA} via the API with the PAT at ../.archv-gh-token before treating this as live."
fi

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
