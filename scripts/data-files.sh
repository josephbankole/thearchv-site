# data-files.sh: the one list of main-owned data files. Sourced, not run.
#
# The desks commit these straight to main. deploy-site.sh and sync-preview.sh let main win
# on a conflict in any of them, and check-data-shrink.sh (run by deploy.yml before the build)
# refuses a push that leaves any of them with fewer entries than the commit it replaces.
# Add a new desk-written data file here and all three pick it up.
DATA_FILES="src/data/transferDays.ts src/data/worldCupDays.ts src/data/leaguesDays.ts \
src/data/nflDays.ts src/data/f1Days.ts src/data/tennisDays.ts src/data/golfDays.ts \
src/data/basketballDays.ts src/data/longReads.ts src/data/answers.ts \
scripts/data/daily/wire.json scripts/data/daily/tables.json"
