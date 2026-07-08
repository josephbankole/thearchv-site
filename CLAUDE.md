# thearchv.ca site - working rules for any agent in this directory

## The two traps that bite every new session

1. **The local data files are STALE by design.** The daily engine (the morning desk
   job) commits `src/data/transferDays.ts` and `src/data/worldCupDays.ts` (and now
   `leaguesDays.ts`) straight to GitHub main via the Contents API
   (`../scripts/archv-site-commit.mjs`, PAT at `../.archv-gh-token`, never print it).
   Your checkout on `preview` does not have those commits. NEVER trust local data
   files as current, never "fix" them locally, and never edit archive content through
   this repo's branches: content changes go to main via the API, code changes go
   through preview.
2. **Deploy is a script, not a push.** Work on branch `preview`, commit, then run
   `bash scripts/deploy-site.sh` from the repo root. It merges preview into main with
   the engine's data files winning (--ours) and pushes; GitHub Pages builds main.
   Pages builds flake: if the change is not live in ~4 minutes, check the run
   (`pages build and deployment` via the API with the PAT; the PAT cannot re-run
   workflows), then retrigger with an empty commit on main. Always verify live with
   a cache-busted curl grepping for something only the new build contains.

## What this site is

Vite + TypeScript + GSAP single-page site for The ARCHV. Brand is locked: navy
#0C2A3E, navy-deep #071C2B, cream #F2EAD3, gold #C9A14A used sparingly, pitch
#2E6B3A; Fraunces + Inter Tight; British voice, no em dashes, restrained archival
register. CSP is strict: no inline scripts (script-src 'self' + one hash); all JS
lives in bundled `src/` files. Reduced-motion support is a hard requirement on any
animation; the existing patterns in `src/anim/` show the register (fast, no bounce,
content readable if JS never runs).

## The feed contract (the iOS app depends on this)

`scripts/build-feed.mjs` runs after `vite build` and emits `dist/feed/*.json`,
schema `archv-feed/2`: every lane's entries carry `section`; the app renders shelves
feed-driven (an empty or missing lane simply does not render). Do not rename fields,
do not remove `section`, and version any breaking change (`archv-feed/3`) in
lockstep with `thearchv-app/Models.swift`. The app's working rules live in
`../thearchv-app/CLAUDE.md`.

## Editorial and rights lines (site side)

Content rules live in `../EDITOR_STANDARDS.md` (including the REPORTED single-source
tier and the append-only archive-correction rules, ratified 2026-07-03) and
decisions of record in `../CANONICAL-CONTEXT.md`. Imagery: brand-illustrated
headshots in `public/heads/` (240px webp, committed via the `head` mode of
archv-site-commit.mjs, never overwrite an existing face); no club crests, kits,
photos or FIFA marks anywhere.

## Open site work (as of 2026-07-04)

- Football Leagues SECTION UI: the feed lane and app shelf are live, the website has
  no visible Leagues section yet.
- Per-article pages for daily entries: needed so app shares get canonical URLs
  (currently section anchors); also SEO surface. Follow the existing long-read page
  pattern.
