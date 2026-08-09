# thearchv.ca site - working rules for any agent in this directory

## The traps that bite every new session

0. **Nothing outside this repo may be read at build time.** Actions checks out `thearchv-site`
   alone, so any path reaching up past the repo root resolves on a laptop and fails in CI. On
   2026-08-04 the head-kit registry shipped as `../match-covers/carousel/head-kits.json`, the local
   build passed, and the Pages deploy died on ENOENT after Vite had already succeeded. Data a build
   script needs lives in `scripts/data/`. To prove it, clone the repo alone into an empty directory
   and run `npm ci && npm run build` there; a green local build in the workspace proves nothing.
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

   **The lesson, stated for the site as it is now (phase 2A, 2026-08-09).** The three homepage day
   rails this incident happened inside are gone: the front page is server-rendered cards in a grid.
   The rule is not about day rails. **A horizontal scroller must never be able to own a vertical
   gesture, and the way it starts owning one is a downward transform on something inside it.**
   The site still has horizontal scrollers, on the homepage (`.rail`, the poster archive) and on
   every static page (`.sportnav`, the sport tab bar). Both carry `overflow-y: hidden` and a
   comment saying why. Keep the guard on anything new that scrolls sideways, and do not put a
   translate-down resting state inside one. The account below is the original diagnosis; line
   numbers in it are from the pre-rebuild `src/style.css` and no longer resolve.

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

   **RE-LANDED 2026-08-04, evening**, by `git revert 054ff1d` on a branch cut fresh from main, with
   both fixes in and `.day-rail` bottom padding raised to `1.5rem` so the Tier 0 shadow is no longer
   clipped. `.sportnav` got the same `overflow-y: hidden` guard in both copies although it measured
   clean, because it is the identical latent hazard. Re-verified in real Chrome against the built
   dist and again against the deployed site: 296 of 296 sample points owned by the page at four
   scroll positions, at desktop and at 500px with `.is-mobile`, and 0px of vertical overflow on all
   four rails. The `[data-inview]` and `.rail` rules now carry comments saying why; a downward
   transform on a card inside a rail is the thing not to reintroduce.

   **Method note, because this is what made it provable.** Build the pre-change commit into a second
   worktree, serve both, and measure the same thing on each. One build tells you nothing about
   whether a number is a regression: the 8px read as noise until the control returned 0. Measure
   scroll ownership, not screenshots. `window.scrollTo` works perfectly in the broken state, because
   programmatic scrolling never consults the gesture target, so any check built on it reports a
   healthy page. And set `scroll-behavior: auto` before measuring, because `html` carries
   `scroll-behavior: smooth` and any reading taken mid-animation is worthless.

## What this site is

Vite + TypeScript + GSAP. Not a single-page site: it is a page graph of static families
(front page, lane fronts, article pages, sport sections, glossary, standards, duels, the
daily game, the author page), and `npm run build` is a chain of generators, not one bundle.
British voice, no em dashes, restrained register. CSP is strict: no inline scripts on the
homepage beyond one hashed bootstrap, and every inline script in the static family is
allowed by an exact sha256 (see the CSP section under Per-article pages). Reduced motion is
a hard requirement on any animation; `src/anim/` shows the register (fast, no bounce,
content readable if JS never runs).

**THE BRAND IS A WHITE TOKEN SYSTEM, and any file still saying navy is out of date.**
Phase 2A (2026-08-09) flipped the ground and the ink across every page family in one pass.

- `--bg` #FFFFFF, `--bg-sunken` #F4F2F3, `--ink` #1E223D, `--ink-soft` #4A4F73,
  `--ink-muted` #5F6485, `--accent-fill` #F54F1B, `--accent-ink` #C93A0F, `--rule` #DED9DB,
  `--rule-soft` #EDEAEB, `--confirmed` #1E7A38.
- **Two tokens are never text.** `--accent-fill` measures 3.49:1 on white and `--ink-faint`
  (#7A7F9E) 3.92:1, so both are fills, bars and marks only. The text form of the accent is
  `--accent-ink` at 5.13:1, and the readable muted text token is `--ink-muted` at 5.76:1 on
  white and 5.16:1 on the sunken grey. Reaching for the bright orange because a label looked
  quiet is the mistake that keeps getting made.
- **The old navy names still resolve.** `--navy: var(--bg)`, `--cream: var(--ink)`,
  `--gold: var(--accent-ink)` and the rest are aliases, deliberately, so no rule written
  against the old vocabulary had to be rewritten. They are a migration seam, not a palette.
  New rules should use the real names.
- Type: **Anton** for display (self-hosted latin subset at `public/fonts/anton-latin.woff2`,
  preloaded on the front page), Fraunces and Inter Tight for everything else.
- **The token block is duplicated in four files that do not import each other**:
  `src/style.css`, `pageStyles()` in `scripts/shared/page-shell.mjs`, `public/content.css`,
  and `scripts/shared/card-brand.mjs` for the rendered share images. Change one, change all
  four. There is no build step that will catch you.
- Adding a sixth hue is a brand break, not a refactor. Two hand-built pages under `public/`
  declare their own small `:root` (`/app`, `/start`, `/quiz`); they carry the same values.

**The front page is rendered at build time, and the bundle enhances it.**
`src/render/home.ts` builds the dateline, the wire, the lead, the three desk bands, the
illustrated library, the desk brief, the legends wall and the long reads into the HTML.
`vite.config.ts` swaps them in through the `archvHome()` plugin, which runs in `npm run dev`
as well as in `npm run build`, so a developer sees what ships.

- Each block is an HTML comment marker in `index.html` (`<!--archv:lead-->` and friends) and
  the plugin **throws** if one is missing. A silently unfilled block is the failure this whole
  arrangement exists to remove.
- **Nothing in `src/render/` may emit a `<script>` tag.** `index.html` carries exactly one
  inline bootstrap and `scripts/check-csp-hash.mjs` asserts that count.
- `src/main.ts` creates no front-page content. It attaches behaviour: the wire's pause on
  hover, the poster rail, the contact form, the masthead menu, the long-reads height
  animation. If the bundle never arrives the page still reads, and that is the test to apply
  to anything new.
- The long reads are a native `<details>` per essay for exactly that reason. They open with
  no JS on the page at all. Do not reintroduce a button plus a panel with a CSS resting
  height of zero.
- There is no WebGL hero and no `three` in the graph any more. `three` and `@types/three` are
  still in `package.json` and are dead weight.

**Illustrated art goes through the registry, never a hand-written path.**
`scripts/data/illustrated.json` is the one list of drawn portraits and ARCHV club badges.
Read it through `scripts/shared/illustrated.mjs` (generators) or `src/render/illustrated.ts`
(front page); the two mirror each other and share the JSON, so change a matcher and change
both. `entryArt(entry)` is the resolution chain every card and article uses: the desk's own
filed image, then a banked portrait of a player named in the headline or standfirst, then the
club badge, then **nothing**. A miss renders no `<img>` at all. Never add a face to that
registry on one source: each head-bank entry is identified by both the bank index at
`../player-headshot-bank.md` and the desk's own committed `imageAlt` for that same file, and
the 2026-08-05 Alex Scott case is why. Bare mononyms are left out on purpose.

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

- **Home** (`/`) — a front page, not a brand statement, since phase 2A. The `<h1>` is the
  day's lead headline. The brand signal moved to the `<title>`, `og:site_name`, the masthead
  wordmark and the Organization/NewsMediaOrganization plus WebSite JSON-LD in `index.html`;
  that block is load-bearing now rather than decorative, so do not thin it out. Each desk
  band's title links to that lane's index page and **the section anchor ids
  (`#transfer-desk`, `#world-cup`, `#football-leagues`) are unchanged in the DOM**, because
  the app's fallback share links resolve against them. The day rails and
  `src/components/dailyDigest.ts` are gone: cards are server-rendered by `renderBands()` in
  `src/render/home.ts` and each headline is a plain link, so the drag-versus-click threshold
  the rails needed no longer exists. Still true: no inline handlers, no client-side router.
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
falls back to the static `/og.jpg` — a card failure never fails the build.

**The cards are on the white system as of phase 2B, and `scripts/shared/card-brand.mjs` is
the only place their palette, fonts and wordmark live.** The per-article pair, the duel
cards in `build-duel-pages.mjs` and the site-wide `public/og.jpg` (`npm run og`, not part of
the build chain) all import it, so a shared link previews as the page it opens. Card fonts
are static TTF instances committed at `scripts/fonts/`: satori does not handle variable
fonts and cannot read woff2 at all, which is why `Anton-Regular.ttf` sits there as a TTF
decompressed from the very woff2 the site serves. Keep them static, and never point a card
at `public/fonts/`. The art on a card comes from the same `entryArt()` chain the page uses;
sharp converts webp to PNG on the way in because satori and resvg cannot read webp.
The 1080x1350 infogram story cards (`scripts/shared/infogram.mjs`) are deliberately still
navy: they are a founder-approved poster format, not a share preview of a page.

Legacy day pages keep `/og.jpg` — they
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

## The author page and the authorship signal (2026-08-04)

`scripts/build-author-page.mjs` emits one page, `/authors/joseph-bankole/`, in the same
self-contained family as the lane and article pages (shared `page-shell.mjs` masthead,
footer, CSP, brand CSS; no new inline CSS and no per-page inline script). It runs after
`build-article-pages.mjs`; its sitemap row lives in `build-content.mjs`'s `EXTRA_URLS`,
not in the script itself, and `verify-csp-pages.mjs` checks it.

- **The author name is FROZEN as "Joseph Bankole"** (founder ruling 2026-08-04). Never vary
  it, and never introduce "Fola Bankole" anywhere on the site.
- **`AUTHOR_URL` now points at the author page**, not josephbankole.ca. Every article's
  visible byline and its `NewsArticle` `author.url` resolve on-site, which is what
  consolidates the authorship entity here. josephbankole.ca was NOT dropped: it is the
  second entry in `AUTHOR_SAMEAS`, so the two profiles stay linked as one Person.
- The "recent bylined work" list is derived from the same day data the article pages are
  built from, and the long reads from `content/`. Nothing on that page is hand-listed, so
  no link on it can rot into a 404 when the desks move on.
- **No founder headshot exists in this repo.** The page falls back to the brand crest and
  says so in the build log. Drop a real one at `public/heads/joseph-bankole.webp` and the
  script picks it up with no other change. Do not generate a face: the site's imagery rule
  forbids it.

`max-image-preview:large` rides on every indexable page family's robots meta (article,
lane, sport, glossary, standards, duel, guess, author, the long-form content pages, the
hand-built `public/` pages and the homepage). The `noindex` families (legacy day pages,
`/football/`, `/desk/`, `/world-cup/`, lab) are deliberately untouched.

## Tier 0 design pass (2026-08-04, rolled back and re-landed the same day)

Semantic token layer, softened shadows, mono micro-labels, a dot-grid field, edge-fade
masks on the horizontal scrollers, and one IntersectionObserver reveal. Founder-approved
Tier 0 only from the deep-dive report. Four things to know before touching it:

- **The semantic token layer survived; its values did not.** This section used to say "the
  palette did not change and must not", and that was true of Tier 0 and is not true now.
  Phase 2A (2026-08-09) repointed every one of these names at the white system, which is
  precisely what the layer was for: `--text-primary`, `--bg-main`, `--border-main`,
  `--accent` and the rest are still the names to write against, and they now resolve to
  `--ink`, `--bg`, `--rule` and `--accent-ink`. The current values and the duplication list
  are under "What this site is" above, which is the authority. Adding a sixth hue is still a
  brand break rather than a refactor.
- **THE REVEAL IS GONE, REMOVED DELIBERATELY IN PHASE 3 (2026-08-09).** `src/anim/reveal.ts`,
  its `initReveal()` call in `src/main.ts`, the `[data-inview]` rules in `src/style.css` and the
  `--reveal-dur` / `--reveal-step` tokens all went in one commit. It was not broken and it was
  not in the way; it had simply run out of work. The mechanism was only ever allowed to touch
  markup the bundle created itself, and phase 2A moved the front page to build-time render, so
  by the time this pass ran `initReveal()` queried `[data-inview-group]`, matched zero elements
  and returned. A mechanism that finds nothing is not a feature in reserve, it is a thing the
  next reader has to work out is dead.
  **The CSS went with the script rather than being left inert**, because its resting state was
  `opacity: 0`. Leaving the rules behind would have left a loaded weapon: put `data-inview` on
  server-rendered markup with no script left to switch it on and the content is invisible for
  good. The removal note lives in `src/style.css` where the block used to be.
  **What the reveal is remembered for survives, and it is the important half.** The first
  version translated the card down 16px at rest. That is the declaration that broke homepage
  scrolling on a phone and forced the 2026-08-04 rollback; trap 3 above is the full account, and
  it is the authority. The guard it produced, `overflow-y: hidden` on `.rail` and `.sportnav`,
  is still in force and stays in force. A downward transform on anything inside a horizontal
  scroller is the mistake not to repeat, whatever mechanism happens to apply it. Any future
  reveal starts from that, not from a resurrected `reveal.ts`. The static page family gets the
  CSS half of Tier 0 and never had a reveal, by design: it ships no bundled JS at all.
- **Reduced motion is a designed state, not a disabled one.** `[data-inview]` resolves
  straight to its finished state under both `prefers-reduced-motion` and the
  `.reduced-motion` class the early bootstrap sets. The edge-fade masks drop on
  `:focus-within` so a keyboard user never sees the focused control faded out.

The deep editorial shadows on the poster frames, the lightbox and the banner band were
deliberately left alone. Those are art direction, not UI chrome; flattening them to the
quiet ambient shadow would gut the archive gallery.

## Editorial and rights lines (site side)

Content rules live in `../EDITOR_STANDARDS.md` (including the REPORTED single-source
tier and the append-only archive-correction rules, ratified 2026-07-03) and
decisions of record in `../CANONICAL-CONTEXT.md`. Imagery: brand-illustrated
headshots in `public/heads/` (240px webp, committed via the `head` mode of
archv-site-commit.mjs, never overwrite an existing face, the single exception being
a replacement that has been audited against a confirmed photograph of that player
and approved by the founder on that audit, which always archives its predecessor to
`_superseded/` first; carve-out founder-approved 2026-08-05, and the same day's
Alex Scott case shows why the audit comes first: the candidate failed it); no club
crests, kits, photos or FIFA marks anywhere.

The ARCHV club badges in `public/media/illustrated/` are not an exception to that last line.
They are our own typographic disc, designed here, and the set is Leeds United, Manchester
United and Paris Saint-Germain only. It grows per fixture through `build_badges.py` in
`../match-covers/carousel/`, which requires the founded year to be verified against two named
sources or left off. Do not hand-add a badge file to this repo to fill a gap on a card.

## Open site work

**The news-product rebuild, phases 2A and 2B (2026-08-09).** Branch
`feature/news-product-phase2`, not merged as this line was written, so read it as the state
of that branch rather than of main. 2A flipped every page family onto the white token
system, brought in Anton, and moved the front page from JS-built rails to build-time render.
2B put the illustrated registry behind every article and card template, server-rendered the
legends wall and the long reads, re-arted the share cards to match, and swept the last
hard-coded navy out of the generators. What it did NOT do, and what a later pass should pick
up: the brand crest is still the pre-flip navy, gold and green mark carrying a football, and
it is on the front page footer and in the Organization `logo`; the infogram story cards are
still navy; and the ARCHV badge set is three clubs, which is why a card about Newcastle United
gets no mark. **The dead weight that list also named is cleared as of phase 3 (2026-08-09):**
`three` and `@types/three` are out of `package.json`, `src/components/giantKillers.ts` is
deleted (its data file stays, `scripts/build-feed.mjs` reads it), and `src/anim/reveal.ts` is
removed with its CSS — see the Tier 0 section for why and what survives.

**Phase 3, the retention pass (2026-08-09).** Site search at `/search/`
(`scripts/build-search.mjs`, a build-time JSON index at `/search-index.json` and a vanilla
client at `/search/search.js`, no third party, no inline script), a dated "Today at the desk"
strip on the front page, word-count read times from one shared helper
(`src/lib/readTime.ts`), and an inline Dispatch capture on every article page. Details in the
sections above and in each file's header comment.

The entries below predate the rebuild. Their decisions still stand; their descriptions of
the homepage do not.

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
