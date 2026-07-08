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
feed-driven (an empty or missing lane simply does not render). As of Build 11, every
entry in the transfer, worldcup and leagues lanes (including the today lead/wrap,
which reuses the same objects) also carries `url`: the absolute canonical article URL,
`https://thearchv.ca/desk/<lane>/<date>/`, lane one of `transfer`, `world-cup`,
`leagues` (note World Cup's URL lane is hyphenated even though its `section` key is
`worldcup`). This was an additive-only change; `url` is optional and unknown to any
app build before it started reading it. Do not rename fields, do not remove
`section`, and version any breaking change (`archv-feed/3`) in lockstep with
`thearchv-app/Models.swift`. The app's working rules live in
`../thearchv-app/CLAUDE.md`.

## Per-article pages

`scripts/build-article-pages.mjs` runs after `vite build`, `build-content.mjs`,
`build-feed.mjs` and `build-day-pages.mjs` (last in the chain, see `package.json`
"build") and emits one static page per daily entry across all three lanes at
`dist/desk/<lane>/<date>/index.html` — this is the canonical URL the feed's `url`
field points at and what the app's canonical shares use. Pages are self-contained
(inline brand styles, PostHog snippet, Google Fonts), following the
`public/start/index.html` pattern rather than `content.css` (deliberate: these pages
do not depend on the hashed app bundle or the long-read article template). The script
also appends every article URL to `dist/sitemap.xml`, which by that point in the
chain already carries the static routes plus the day pages from `build-day-pages.mjs`
— run order matters here, this script must run last.

Note: `scripts/build-day-pages.mjs` still separately emits legacy URLs at
`/desk/<date>/` (transfer only) and `/world-cup/<date>/` (World Cup only, no
`leagues` support). Those pages were not removed in Build 11 to avoid an
unreviewed URL cut, and stay unremoved (inbound links may exist). As of the
2026-07-08 review fix, they are demoted rather than coexisting as equals:
each legacy page's `<link rel="canonical">` points at its corresponding
`/desk/<lane>/<date>/` page (transfer -> `/desk/transfer/<date>/`, world-cup ->
`/desk/world-cup/<date>/`) and carries `<meta name="robots" content="noindex,follow">`,
and `build-day-pages.mjs` no longer appends its URLs to `dist/sitemap.xml` — only
`build-article-pages.mjs`'s canonical lane URLs are in the sitemap. This stops the
duplicate-content SEO split while keeping the legacy URLs live and crawlable
(just not indexed, and always pointing search engines at the canonical page).

## Editorial and rights lines (site side)

Content rules live in `../EDITOR_STANDARDS.md` (including the REPORTED single-source
tier and the append-only archive-correction rules, ratified 2026-07-03) and
decisions of record in `../CANONICAL-CONTEXT.md`. Imagery: brand-illustrated
headshots in `public/heads/` (240px webp, committed via the `head` mode of
archv-site-commit.mjs, never overwrite an existing face); no club crests, kits,
photos or FIFA marks anywhere.

## Open site work (as of 2026-07-08)

- Football Leagues SECTION UI: the feed lane and app shelf are live, the website has
  no visible Leagues section yet.
- Per-article pages for daily entries: DONE (Build 11, W1). Every transfer, World Cup
  and leagues entry now has a canonical page at `/desk/<lane>/<date>/`, wired into
  the feed's `url` field and linked from the homepage day-rail cards. See "Per-article
  pages" above. Remaining follow-up: decide whether to retire the older
  `build-day-pages.mjs` URLs (`/desk/<date>/`, `/world-cup/<date>/`) now that the
  canonical lane-scoped pages exist.
