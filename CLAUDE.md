# thearchv.ca site - working rules for any agent in this directory

## The traps that bite every new session

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
3. **A green build is not "it works". Look at the running site on a real device before you deploy.**
   On 2026-08-04 a branch shipped that the founder could not scroll, with the logo clipped. It had
   passed a clean-clone `npm ci && npm run build`, `check-csp-hash`, `verify-csp-pages` across 123
   pages, a 905-element computed-style census proving the palette unchanged, and browser checks at
   1280, 375 and 320px. Every one of those is structural. None of them is a person using the page.
   Roll back first and diagnose after: the rollback took one revert and one Pages build.
   **Do not trust the in-app Browser pane for anything viewport-dependent.** During that incident it
   reported `innerHeight: 0`. A zero-height viewport means IntersectionObserver can never fire and
   GSAP computes nothing, so every reading about reveals, scroll position and element visibility was
   worthless, and it looked exactly like a real bug. It had already returned blank screenshots on
   scrolled pages earlier the same day. Use a real browser, or ask the founder.

   **Root cause, found 2026-08-04 by a controlled diagnosis run (no deploy).** The break is one
   declaration: `transform: translateY(16px)` at `src/style.css:784`, the resting state of the
   Tier 0 `[data-inview]` reveal.

   `.rail` (`src/style.css:353`) is `overflow-x: auto`. When one axis is not `visible`, CSS sets the
   used value of the other axis to `auto`, so every rail has always been a vertical scroll container
   too. It simply never had anything to scroll. The day cards sit 8px clear of the rail's bottom
   padding edge; translating them down 16px pushes them 8px past it. Each day rail then reports a
   `scrollHeight` 8px greater than its `clientHeight`, and an element with vertical scroll room owns
   any vertical gesture that starts inside it. Touch scrolling latches to the nearest scrollable
   ancestor for the whole gesture and does not hand it back to the page. The three day rails are
   full bleed and 600 to 780px tall on a phone, so across most of the desk region of the homepage a
   swipe moves the rail 8px and the page not at all. That is the founder's report, exactly.

   Measured at 500x749 with `.is-mobile` set, walking from `document.elementFromPoint` up to the
   nearest vertically scrollable ancestor, 296 sample points per screen:

   | scrollY | branch 60fda38 | control 90545d4 |
   | --- | --- | --- |
   | 1200 | page 32, leagues rail 264 | page 296 |
   | 2000 | page 184, transfer rail 112 | page 296 |
   | 2800 | page 160, transfer rail 136 | page 296 |
   | 3600 | page 136, worldcup rail 160 | page 296 |

   Rail vertical overflow: 8px on all three day rails on the branch, 0px on all three on the
   control, and 0px on the archive poster rail (`#rail`, which carries no reveal) in both.

   **Two one-line fixes, each verified on its own.** Applied separately to the running branch build,
   each returned page ownership to 296 of 296 sample points:

   - Make the reveal opacity-only: drop `transform: translateY(16px)` from `[data-inview]` and
     transition `opacity` alone. The reveal still reads.
   - Or add `overflow-y: hidden` to `.rail`. A horizontal scroller should never own a vertical
     gesture, and this holds even if something else pokes below the rail later.

   Ship both. The second is the guard rail. Note that `.rail` already clips its children's ink at
   the padding box in both axes, so the `box-shadow` the Tier 0 pass added to `.day` was mostly
   being clipped anyway; give the rail bottom padding if that shadow is meant to show.

   **The clipped logo is not this branch.** At 500px wide the hero crest's top sits at 112px and the
   fixed masthead's bottom at 132.5px, an overlap of 20.5px, identical on the branch and on the
   pre-branch control. `.hero` takes `padding-top: 7rem` under 640px while the fixed chrome is a
   2.75rem sport tab bar plus an 88.5px masthead. It is an older bug the founder happened to notice
   on the same pass. Fix it separately, and do not let it hold the re-land.

   **What re-lands untouched:** the author page, the `max-image-preview:large` robots directive, and
   the whole static half of the Tier 0 pass in `scripts/shared/page-shell.mjs`, including the
   `.more-card__headline` and `.lane-card__headline` `display: block` fix. The static page family
   ships no bundled JS, so it has no reveal and no transform. Measured on an article page from the
   same build: the page owns 296 of 296 sample points at every scroll position and `.sportnav` has
   no vertical overflow. Only the homepage half of Tier 0 needs the change above.

   **How to re-land it, because a plain merge will not (verified 2026-08-04, evening).** The
   rollback was `054ff1d`, a revert of the merge `4a38d95`. That merge is still an ancestor of main,
   so git treats preview's commits as already merged: running `scripts/deploy-site.sh` today reports
   a clean merge and changes exactly one file, `CLAUDE.md`, leaving zero occurrences of
   `[data-inview]` in main's `src/style.css`. On the day Tier 0 comes back with the scroll fix, that
   same merge will report clean, push, go green and ship none of it. Re-land off a branch cut fresh
   from main, or `git revert 054ff1d` first. Do not diagnose that as a deploy failure.

   **Method note, because this is what made it provable.** Build the pre-change commit into a second
   worktree, serve both, and measure the same thing on each. One build tells you nothing about
   whether a number is a regression: the 8px read as noise until the control returned 0. Measure
   scroll ownership, not screenshots. `window.scrollTo` works perfectly in the broken state, because
   programmatic scrolling never consults the gesture target, so any check built on it reports a
   healthy page. And set `scroll-behavior: auto` before measuring, because `html` carries
   `scroll-behavior: smooth` and any reading taken mid-animation is worthless.

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
schema `archv-feed/3` (bumped 2026-07-22 with the multi-sport expansion; additive over v2,
adding `sport` on every entry, per-sport feed files and a `sports` array in index.json —
`section` remains THE FEED KEY: transfer/worldcup/leagues for football, the sport key
nfl/f1/tennis/golf for new sports, never the lane key): every lane's entries carry `section`; the app renders shelves
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

## Site structure: the page graph (site depth pass, 2026-07-09)

The site is a navigable graph, not one long homepage: home -> lane index -> article ->
onward. Three static page families sit under `/desk/`:

- **Home** (`/`) — the brand statement. Each lane's section header (the `section-index`
  line, e.g. "02 / The transfer desk") is now a link out to that lane's index page,
  while the section's own anchor id (`#transfer-desk`, `#world-cup`, `#football-leagues`)
  is unchanged in the DOM — the app's fallback share links still resolve. The day-rail
  cards (`src/components/dailyDigest.ts`) are whole-card links: the entire `<a class="day">`
  navigates to the article, guarded against the rail's drag-to-scroll by an ~8px
  pointerdown-to-pointerup movement threshold (`DRAG_THRESHOLD_PX` in that file) that
  cancels the click when the pointer moved more than that. This is homepage bundle code:
  CSP-clean, no inline handlers, no client-side router.
- **Lane index pages** (`/desk/transfer/`, `/desk/world-cup/`, `/desk/leagues/`) —
  `scripts/build-lane-pages.mjs`, the section fronts. Every entry in the lane, newest
  first, as a full-width whole-card link to its article page. Runs in the build chain
  between `build-day-pages.mjs` and `build-article-pages.mjs` (see `package.json`
  "build"); the three lane URLs are in `dist/sitemap.xml`.
- **Article pages** (`/desk/<lane>/<date>/`) — `scripts/build-article-pages.mjs`, see
  below. Now also carry a "More from the lane" block (previous 3 entries, whole-card
  links, plus an "All <lane> stories" link to the lane index) and a prev/next
  chronological nav row.

Both lane and article pages share `scripts/shared/page-shell.mjs`: brand CSS, masthead,
footer, escaping helpers, the lane registry (`LANE_META`), and the three-desk text nav
(`deskNav()` — plain wrapping links to the three lane pages, present on both page types,
verified collision-proof at 320px). Keep both generator scripts pulling from this shared
module rather than re-inlining the CSS/masthead, so the two page types don't drift.

This pass deliberately added no CMS, no client-side router, and did not touch the
homepage hero/experience section, the nav's in-page scroll behaviour, or any
`src/data/*.ts` file.

## Per-article pages

`scripts/build-article-pages.mjs` runs after `vite build`, `build-content.mjs`,
`build-feed.mjs`, `build-day-pages.mjs` and `build-lane-pages.mjs` (last in the chain,
see `package.json` "build") and emits one static page per daily entry across all three
lanes at `dist/desk/<lane>/<date>/index.html` — this is the canonical URL the feed's `url`
field points at and what the app's canonical shares use. Pages are self-contained
(inline brand styles, PostHog snippet, Google Fonts), following the
`public/start/index.html` pattern rather than `content.css` (deliberate: these pages
do not depend on the hashed app bundle or the long-read article template). The script
also appends every article URL to `dist/sitemap.xml`, which by that point in the
chain already carries the static routes plus the day pages from `build-day-pages.mjs`
— run order matters here, this script must run last.

Each canonical article page also gets a unique 1200x630 OG share card, generated at
build time by the same script at `dist/desk/<lane>/<date>/og.png` (satori +
@resvg/resvg-js, both devDependencies; headshots are converted webp -> png via sharp
because satori/resvg cannot read webp). The page's `og:image` / `twitter:image` point
at that PNG; if card generation fails for an entry the build logs it and that page
falls back to the static `/og.jpg` — a card failure never fails the build. Card fonts
are static TTF instances committed at `scripts/fonts/` (Fraunces SemiBold, Inter Tight
Regular and SemiBold, pulled from the Google Fonts API; satori does not handle
variable fonts well, so keep these static). Legacy day pages keep `/og.jpg` — they
are noindex and not worth the render time. Article pages also carry a share row
(native share, X intent, copy link) with PostHog events `share_native` / `share_x` /
`share_copy`; the masthead on article sub pages has no Shop button (founder call,
2026-07-09) and wraps instead of overlapping at narrow viewports.

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

## Player duels and the daily archive game (2026-08-04)

Two surfaces, one data seam, both in the same self-contained static page family as the article and
lane pages (shared `page-shell.mjs` masthead, footer, CSP, brand CSS).

- **`/duel/`** (`scripts/build-duel-pages.mjs`) is the picker plus every pairing as a plain link.
  **`/duel/<a>-v-<b>/`** is one pre-rendered comparison per pair, slug sorted alphabetically so a
  pair has exactly one URL. Each pair page emits its own 1200x630 `og.png` with the stat rows and
  the split bars **on the image**, via the same satori + resvg + sharp path as
  `build-article-pages.mjs`; a card failure warns and the page falls back to `/og.jpg` rather than
  failing the build. `?p1=x&p2=y` on `/duel/` is a supported entry point and resolves to the
  canonical pair path, because GitHub Pages serves one file per path regardless of query string,
  so a query-only design would give every argument the same social card.
- **`/guess/`** (`scripts/build-archive-game.mjs`) is the daily archive game: one historical player
  a day chosen by UTC date, four clues, five guesses, streak in `localStorage`. Data is
  `scripts/data/football/archive-players.json`, sourced from Wikidata (CC0, no attribution
  required). No images on that page by design, since most of those players have no banked
  illustrated head and inventing a face is forbidden.
- **The data seam is `scripts/shared/football-data.mjs`.** Nothing else reads a roster file or an
  API. Providers live in `scripts/shared/providers/`: `static-roster.mjs` is the default and
  validates its own JSON (including the two-named-sources-per-stat rule) and `api-football.mjs` is
  the live one, selected with `ARCHV_FOOTBALL_PROVIDER=api-football`. **The plan went Pro on
  2026-08-04: 7,500 requests a day, every season, and the paid-only parameters including `last`.**
  The old 2022-2024 free window is gone and `SEASON_GUARD` is now a typo rail rather than an
  entitlement check.
  **The calendar trap survived the upgrade.** API-Football labels a season by its opening year, so
  season=2025 is the completed 2025/26 campaign and season=2026 is 2026/27, which opens on
  **21 August 2026**. Ask for a season before its opening day and the API returns a healthy 200
  carrying internationals and no club rows, which reads as a working request until the card renders
  empty. `newestPlayedSeason()` in the provider is the guard: it defaults the season to the newest
  one actually played and warns rather than throws when a caller asks for a future one, since
  internationals are legitimate during a break. Do NOT default to `SEASON_GUARD.max`, which sits a
  year ahead on purpose.
  A build still never spends quota by accident: a cache miss is a hard error unless the run sets
  `ARCHV_FOOTBALL_ALLOW_FETCH=1`. Caches are committed under `scripts/data/football/cache/`.
  Hand-verification is no longer the only route to current-season numbers, but it earned its keep:
  the hand-checked roster had Haaland on 27 goals and 8 assists for 2025/26, and the API returns
  exactly those figures.
- **`scripts/shared/percentile-bar.mjs`** is a standalone component (no imports, brand colours
  inlined) so the carousel renderer can use the same two functions. It refuses a rank without a
  named pool, and draws no bar at all when there is no pool to rank against.
- Sitemap rows for both surfaces are derived in `build-content.mjs`'s `EXTRA_URLS` from the
  adapter, never hand-listed, so the sitemap grows with the roster. `verify-csp-pages.mjs` checks
  `/duel/`, `/guess/` and every pair page: the duel share row and the game's puzzle payload are
  per-page inline scripts, so their hashes are not constant across the family.

## Editorial and rights lines (site side)

Content rules live in `../EDITOR_STANDARDS.md` (including the REPORTED single-source
tier and the append-only archive-correction rules, ratified 2026-07-03) and
decisions of record in `../CANONICAL-CONTEXT.md`. Imagery: brand-illustrated
headshots in `public/heads/` (240px webp, committed via the `head` mode of
archv-site-commit.mjs, never overwrite an existing face); no club crests, kits,
photos or FIFA marks anywhere.

## Open site work (as of 2026-07-09)

- Football Leagues SECTION UI: DONE (commit `54ebe0c`). The homepage carries a
  `#football-leagues` section with its section-index header linking to `/desk/leagues/`
  and a `#leagues-days` day-rail wired through the shared `initDailyDigest(...,'leagues')`
  path (src/main.ts), same component, cap and drag behaviour as the transfer and
  world-cup rails; the section is registered in the scroll-spy nav (src/ui/chrome.ts).
  Ordered FIRST (Leagues, Transfer Desk, International Football) per founder decision
  D-2026-07-07, which set the shelf/section order and which CANONICAL-CONTEXT.md carries;
  the site order mirrors the app on purpose. (This line previously read "no visible
  Leagues section yet" from a stale 2026-07-11 backlog note; corrected 2026-07-15.)
- Per-article pages for daily entries: DONE (Build 11, W1). Every transfer, World Cup
  and leagues entry now has a canonical page at `/desk/<lane>/<date>/`, wired into
  the feed's `url` field and linked from the homepage day-rail cards. See "Per-article
  pages" above. Legacy `/desk/<date>/` and `/world-cup/<date>/` retire-or-keep
  decision: CLOSED-BY-DECISION — KEEP permanently. They are noindexed and
  cross-canonical to the lane-scoped URLs (see "Per-article pages" above), so
  they carry no SEO cost; retiring them would 404 old shares for zero benefit.
  Founder-ratified via `../DEV-CLOSEOUT-2026-07-11.md` (2026-07-11).
- Site depth pass (SITE-DEPTH-PLAN.md, founder approved 2026-07-09): DONE. Lane index
  pages (`/desk/transfer/`, `/desk/world-cup/`, `/desk/leagues/`), whole-card homepage
  day-rail links with drag-vs-click discrimination, homepage section headers linking to
  their lane pages (anchors unchanged), and article-page "more from the lane" +
  prev/next + three-desk nav. See "Site structure: the page graph" above. Not done in
  this pass, deliberately: no CMS, no client-side router, no nav redesign beyond the
  header links, no search.
