# map:site

# thearchv.ca site codebase map (read-only, 2026-09-26)

I edited nothing. I read `CLAUDE.md`, `README.md`, `SECURITY.md`, both workflows, the build chain and the engine scripts in `../scripts/`.

## 0. Four things to know before planning anything

- **Your local checkout is not main.** It is on branch `preview`. The local copies of the desk data files are out of date on purpose: `CLAUDE.md` says "The local data files are STALE by design". The desk engine commits `src/data/*.ts` straight to `main` through the GitHub Contents API.
- **There is no `feed/` directory at the repo root.** The feeds exist only as build output, at `dist/feed/*.json`, written by `scripts/build-feed.mjs` after `vite build`.
- **Everything is rendered at build time.** A build runs only on a push to main or a manual dispatch: `on: push: branches: [main]` plus `workflow_dispatch`. There is no scheduled workflow. The site changes only when something commits.
- **The front page already had a ticker, and it was removed.** `src/render/home.ts` records it: "`renderWire()` built a CSS marquee of nine round-robin headlines… REMOVED 2026-09-12 (site declutter)". The name "wire" is still used in comments.

## 1. How content becomes pages and feeds

**Where the content lives**

- **Desk entries:** `src/data/*.ts`, all written by the engine.
  - Football: `transferDays.ts`, `worldCupDays.ts`, `leaguesDays.ts`
  - Other sports: `nflDays.ts`, `f1Days.ts`, `tennisDays.ts`, `golfDays.ts`, `basketballDays.ts`
  - Long reads: `longReads.ts`
- **Repo-authored data:** `posters.ts`, `legends.ts`, `giantKillers.ts`, `readSlug.ts` (code), `sports.ts` (code).
- **`content/*.md`:** evergreen markdown in `explainers/`, `finals/`, `notes/` and `united/`, rendered by `build-content.mjs` into `/content.css` pages. `CLAUDE.md` notes these sections "recorded ZERO pageviews in 180 days".

**Entry shape.** One `DayEntry` shape is shared by every sport. It is defined in `src/data/worldCupDays.ts`:
```ts
export interface DayEntry {
  date: string; day: string; headline: string; dek: string; body: string;
  status: 'verified' | 'pending';
  image?: string; imageAlt?: string; seoTitle?: string; evergreen?: string;
}
```

**The loader.** Build scripts read the data through one loader, `scripts/shared/day-data.mjs`. It esbuild-bundles `src/data/*.ts`, imports the result, and returns every lane sorted newest first. The lanes are registered in its `DAY_LANES` table:
```js
{ name: "nflDays", file: "nflDays", sport: "nfl" }, ...
{ name: "basketballDays", file: "basketballDays", sport: "basketball" },
```
Any other file comes in through `EXTRAS`, keyed by module and tagged `kind: "data"` or `kind: "code"`.

**Where sports and sections are registered.** There are two hand-synced copies:
- `scripts/shared/page-shell.mjs`: `export const SPORTS = [ { key: "football", …, lanes: ["transfer","world-cup","leagues"] }, { key: "nfl", …, lanes: ["questions"] }, …, { key: "basketball", … } ]`
- `src/data/sports.ts`, which says: "TWO SOURCES OF TRUTH, kept in step by hand."

Football lanes are registered in `LANE_META` in `page-shell.mjs`. It holds `label`, `feedKey`, `anchor`, `seoSuffix` and `indexTitle`. The `feedKey` is the one place the `worldcup` → `world-cup` URL mapping is declared:
```js
export const articlePath = (feedKey, date) => `/desk/${laneByFeedKey[feedKey]}/${date}/`;
```
Other sports use `QUESTION_LANE_META` and `SPORT_DESK_COPY` (lede and empty-state copy) from the same file.

**`scripts/build-feed.mjs`** writes `schema: "archv-feed/3"`. Every file has the envelope `{ schema, lastUpdated, ...payload }`:

| File | Contents |
|---|---|
| `today.json` | `{ lead, wrap[4] }`. The pool is transfer plus World Cup only: "leagues entries are deliberately NOT in the daily today-pool". |
| `transfer.json`, `worldcup.json`, `leagues.json` | `{ days[] }`. Each entry is the `DayEntry` plus `section`, `sport: "football"`, `url`, and optional `infogram`, `infogramAlt` and `image` (the image is added by `withAppArt`). |
| `nfl.json`, `f1.json`, `tennis.json`, `golf.json`, `basketball.json` | `{ days[] }`, entries tagged with `section: sport.key`. The URL is `${SITE}/${sport.urlBase}/${laneKey}/${d.date}/`. The code comments: "`section` is the FEED KEY… (nfl.json exists, questions.json does not)". |
| `posters.json` | `{ posters[] }` |
| `archive.json` | `{ legends[], giantKillers{intro,outro,upsets[]}, longReads[] }`. Long reads gain `url` and, when the body has markdown, `bodyMarkdown`. |
| `index.json` | `{ schema, generatedAt, lastUpdated, buildHash, feeds:[{name,path,bytes,hash}], sports:[{key,label,shortLabel,urlBase,order,feed,hasEntries}] }` |
| `storefront.json` | Built outside the manifest loop on purpose, "so the existing feed files and index.json manifest/buildHash stay byte-identical". |

A comment in `build-feed.mjs` notes that the `sports` array is not yet read by the app: "SportFilter.swift hardcodes the sport enum, feed filenames and display order… adding a sport here does NOT surface it in the app".

**`scripts/build-rss.mjs`** writes `dist/feed.xml`: the 30 newest items across every lane and the long reads. Each item carries the full body in `<content:encoded>` and a byline, `<dc:creator>`. It runs after `build-article-pages.mjs` because it stats each article's `og.png` for the enclosure.

**Two other outputs read the same data.** `build-news-sitemap.mjs` lists articles from the last 2 days. `build-search.mjs` builds `/search-index.json`.

**The full chain** is `npm run build`:
1. Checks: `check-data-shape`, `check-csp-hash`, `check-tokens`, `check-illustrated-parity`, `tsc --noEmit`
2. `build-crest`, then `vite build`
3. Generators in order: `build-content`, `section-pages`, `reads-pages`, `infograms`, `feed`, `day-pages`, `lane-pages`, `article-pages`, `rss`, `news-sitemap`, `author-page`, `sport-pages`, `glossary-pages`, `standards-page`, `duel-pages`, `archive-game`, `search`
4. `verify-csp-pages` last

**Sitemap.** Rows are spliced in through `scripts/shared/sitemap.mjs`. Static roots are listed by hand in `EXTRA_URLS` in `build-content.mjs`, including `{ loc: "/nfl/", changefreq: "daily", … }` and one row per sport. These are not derived from `SPORTS`.

## 2. How pages are rendered

**The front page** is server-rendered by the `archvHome()` plugin in `vite.config.ts`. It replaces markers in `index.html` with markup from `src/render/home.ts`:
```ts
'<!--archv:lead-->': renderLead, '<!--archv:today-->': renderToday, '<!--archv:bands-->': renderBands,
'<!--archv:brief-->': renderBrief, '<!--archv:legends-->': renderLegends, '<!--archv:longreads-->': renderLongReads,
```
- The plugin throws if a marker is missing. It runs in `dev` as well as `build`.
- Rule: "NOTHING HERE MAY EMIT A `<script>` TAG."
- `renderToday()` uses the build's UTC date (`new Date().toISOString().slice(0,10)`). On a day with nothing filed it says so honestly: "Nothing filed yet today…".
- `src/main.ts` only attaches behaviour to what is already in the HTML: `initFrontCards`, `initLongReads`, `initArchiveRail`, `initMastheadMenu`, `initSportTabs`, `initChrome`, `initAnalytics`.

**Every other page** is a static page with no bundled JS, built from `scripts/shared/page-shell.mjs`.
- `documentShell()` builds the head. `robots`, `canonical` and `ogUrl` are required and have no defaults; `csp` must be passed in.
- The same file supplies `masthead(sportKey)` (its toggle script has a constant hash), `sportNav()`, `deskNav()` (hidden when a sport has only one lane), `footer()`, `cardArt()`, `posthogSnippet()`, `cspMeta()`, `pageStyles()` and `fontLinks()` (Google Fonts).
- The older `/content.css` family (`build-content.mjs`, `build-day-pages.mjs`) passes `posthog:false`, `fonts:false`, `styles:false`.
- Sport hubs (`build-sport-pages.mjs`, `renderSection(sport)`) are simple: a `sport-head` section with breadcrumb, h1, lede, then a `lane-list` of `laneCard`s, or the `SPORT_DESK_COPY.holding` text when the lane is empty.

**The white design tokens** are copied into four files that do not import each other:
- `src/style.css`
- `pageStyles()` in `page-shell.mjs`
- `public/content.css`
- `scripts/shared/card-brand.mjs`

From `pageStyles()`:
```css
--bg: #FFFFFF; --bg-sunken: #F4F2F3; --ink: #1E223D; --ink-soft: #4A4F73; --ink-muted: #5F6485;
--ink-faint: #7A7F9E; --accent-fill: #F54F1B; --accent-ink: #C93A0F; --rule: #DED9DB; --confirmed: #1E7A38;
```
- Two of these must never be used for text: `--accent-fill` (3.49:1 contrast) and `--ink-faint`.
- The old navy names (`--navy`, `--cream`, `--gold`) are aliases that now resolve to the white values.
- `scripts/check-tokens.mjs` fails the build if the four copies disagree.
- Type: Anton for display, Fraunces and Inter Tight for the rest.

**The illustrated registry** is `scripts/data/illustrated.json`: 114 players and 3 clubs, e.g. `{slug,name,nation,src,width,height,alt,hd}`. It is read two ways, kept in sync and checked by `check-illustrated-parity.mjs`:
- `scripts/shared/illustrated.mjs` for the generators
- `src/render/illustrated.ts` for the front page

`entryArt(entry)` resolves art in this order: the entry's own `image`, then a banked player named in the headline or dek, then a club badge, then `null`, which means no `<img>` is rendered. Head portraits live in `public/heads/*.webp` (240px) and `public/heads/hd/` (600px, for the app, via `scripts/shared/app-art.mjs` and `withAppArt`).

## 3. Adding a section or page type, end to end

**A new engine-written data lane** (for example a daily wire data file):
1. Add the file to `src/data/`. If it is `.ts`, it must pass the pure-data rules in `scripts/shared/data-shape.mjs`.
2. Register it in `DAY_LANES` or `EXTRAS` in `scripts/shared/day-data.mjs`. Otherwise `check-data-shape.mjs` fails the build: "Every FILE anywhere under src/data/… must be one of three things".
3. Add a new kind to `KINDS` in `../scripts/archv-site-commit.mjs` (path, anchor line, validation).
4. Add it to `DATA_FILES` in both `scripts/deploy-site.sh` and `scripts/sync-preview.sh`.
5. Optionally extend `data-guard.yml`, which covers only transfer and World Cup today.

A JSON file under `scripts/data/` avoids the code-execution exposure. `illustrated.json` is already imported by both Vite and Node. A JSON file is never executed, but it is also outside `check-data-shape`, so it would need its own validation.

**A new feed file:** add a key to the `feeds` object in `build-feed.mjs`. It becomes `/feed/<name>.json` with a manifest row. The app needs its own change in `thearchv-app/Models.swift` and `SportFilter.swift`. The schema change must be additive: `archv-feed/3`, "Do not rename fields, do not remove `section`".

**A new page type or generator:**
1. Write `scripts/build-<x>.mjs` using `documentShell` and `cspMeta` from `page-shell.mjs`.
2. Add it to the `build` chain in `package.json`, plus an alias. It must run before `build-search.mjs` if it adds sitemap rows.
3. Add the sitemap row to `EXTRA_URLS` in `build-content.mjs`, or append through `shared/sitemap.mjs`.
4. Add the page to the target list in `verify-csp-pages.mjs`. Lanes and sports are picked up automatically; a new family is not.
5. Optionally add it to `build-search.mjs`.
6. Optionally add a masthead panel link in `masthead()`. Changing masthead text is fine; its inline script's hash must stay constant.

**A new front-page block:**
1. Add a marker to `index.html`.
2. Add a renderer to `src/render/home.ts`.
3. Map the marker in `vite.config.ts`.
4. Add CSS to `src/style.css`.
5. If the block reads a new data module, register it in `day-data.mjs` first: `check-data-shape` runs before Vite runs `home.ts`.

**A new sport tab:**
1. Add it to `SPORTS` in `page-shell.mjs` and to `src/data/sports.ts`.
2. Add `SPORT_DESK_COPY`, a data file, and entries in `DAY_LANES` and the engine's `KINDS`.
3. Add it to the `DESKS` list in `home.ts` and to the sport rows in `EXTRA_URLS`.
4. Make the app change.

## 4. Tests and checks

| Check | Command | What it does |
|---|---|---|
| `check-data-shape` | `npm run check-data` | Also runs first in `build`, `dev` and `preview`. Runs the pure-data rules (a TypeScript parse plus an esbuild transform) over every `kind:"data"` module and refuses unregistered files in `src/data`. `data-shape.mjs` runs its own self-tests on load (`selfTestDataShape`). |
| `check-csp-hash` | `npm run check-csp` | Checks there is exactly one inline bootstrap in `index.html` and that its hash is in the CSP. |
| `check-tokens` | `npm run check-tokens` | Checks the four token copies agree. |
| `check-illustrated-parity` | `npm run check-parity` | Checks the two registry readers agree. |
| `tsc --noEmit` | inside `build` | Type check. |
| `verify-csp-pages` | `npm run verify-csp` | Checks every page family's CSP against its actual inline scripts, on the built output. |
| `check-img-alt` | `npm run check-img-alt` | Not in the chain. |
| `check-app-heads` | `npm run check:heads` | Not in the chain. |
| `data-guard.yml` | Actions, on push to main | Fails if `transferDays.ts` or `worldCupDays.ts` has fewer `date:` entries than `HEAD~1`. It is a separate workflow, so it does not stop the deploy. |
| `fanout_test.ts` | `deno test` in `supabase/functions/daily-push/` | The only unit test file in the repo. |

There is no JS unit-test framework. To reproduce CI, `CLAUDE.md` says: "clone the repo alone into an empty directory and run `npm ci && npm run build` there". A green local build proves nothing, because the build must not read anything outside the repo.

## 5. How desks write and push, and deploy concurrency

**Content path.** `node ../scripts/archv-site-commit.mjs <kind> entry.json` (kinds: `transfer|worldcup|leagues|nfl|f1|tennis|golf|basketball|longread`, plus `amend`, `head`, `longread --batch`).
- It GETs the file from main, checks the new entry is not a duplicate, and inserts it after the anchor line, e.g. `export const nflDays: DayEntry[] = [`.
- It enforces "exactly 1 date entry" added and a floor of 3 entries on the established lanes.
- It then PUTs with `sha: meta.sha`. Any status other than 200 or 201 ends the script with `die`. There is no retry.
- The PAT is read from `fifa.archv/.archv-gh-token` or `ARCHV_GH_TOKEN`.

**Other routes to main:**
- `archv-media-upload.mjs` and `archv-site-upload-media.mjs`: media through the Git Data API
- `archv-sync-brand-canon.mjs`
- `archv-retrigger-pages.mjs`: an empty commit on main
- Code changes go through `preview` and then `scripts/deploy-site.sh`, which merges preview into main and keeps main's versions of `DATA_FILES` on conflict

The desk spec in `routines-v2/archv-football-desk.md` forbids local pushes unless the branch reads `main` (work order 7f).

**Concurrency.** `deploy.yml` has:
```yaml
concurrency:
  group: pages
  cancel-in-progress: true
```
Every commit to main cancels the build in flight. The desk spec records "five cancelled builds in one run", and notes that other tasks (`fola-personal-daily`) also commit.

What happens when two desks push close together:
- **Different files:** both commits land. Build A is cancelled and build B, checked out at the newer SHA, ships both. If build B fails, neither ships and nothing reports an error.
- **The same file:** the second PUT carries a stale `sha`. GitHub rejects that; the docs call it 409, which I did not reproduce here. The script exits, and the entry is lost unless the desk reruns.
- **"Verify live" can pass on a stale site.** The step only checks that `feed/index.json` returns 200 and that the lead image loads, so a site one commit behind still goes green. `../scripts/archv-pages-verify.mjs` is the real check. It compares main's HEAD with the `head_sha` of the last successful "Deploy to GitHub Pages" run and returns one of three states: current, behind with a build in flight (wait), or behind with nothing in flight (retrigger).
- The spec's rule: "BATCH THIS RUN'S COMMITS… THEN retrigger once".

**The push.** `supabase/functions/daily-push/index.ts` runs on pg_cron.
- It reads `https://thearchv.ca/feed/index.json` and keys on the today feed's own hash: `index.feeds.find(f => f.name === "today")`.
- It sends at most one push per editorial day (America/Edmonton).
- A new feed file would not trigger or use up the push. Any change to `today.json` would.

## 6. PostHog and CSP

**PostHog.** Project key `phc_kg8n…` (public by design), host `https://us.i.posthog.com`.
- **Front page** (`src/analytics.ts`): `autocapture:false`, `disable_session_recording:true`, `respect_dnt:true`, `persistence:'localStorage'`, `person_profiles:'identified_only'`. `before_send` normalises trailing slashes. Explicit events: `site_loaded`, `$pageview`, `section_view`, `scroll_depth`, `follow_click`, `etsy_click`, `shop_click`, `newsletter_click`, `article_link_click`. Outbound clicks are tracked per domain by selector, e.g. `a[href*="etsy.com"]`.
- **Static pages:** `posthogSnippet()` sends pageviews only. The article share row fires `share_native`, `share_x` and `share_copy` from a per-page inline script with its own hash.

**CSP.** It is a `<meta>` tag only, because GitHub Pages cannot send headers.

On the front page:
```
default-src 'self'; script-src 'self' 'sha256-gp+s…' https://us-assets.i.posthog.com https://eu-assets.i.posthog.com;
style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self';
connect-src 'self' https://api.web3forms.com https://us.i.posthog.com …; form-action https://api.web3forms.com;
base-uri 'self'; object-src 'none'; frame-src 'none'
```
On static pages, `cspMeta()` builds the same pattern: `img-src 'self' data:`, `connect-src 'self'` plus PostHog, and Google Fonts when requested.

What this means for outbound links and the Wire:
- **Plain `<a href>` links to publishers are unaffected.** CSP has no navigation directive here. The house pattern is `target="_blank" rel="noopener noreferrer"`, and `SECURITY.md` says "Every `target="_blank"` carries `rel="noopener noreferrer"`".
- **Publisher images cannot load**, because `img-src 'self' data:` blocks them. That matches the no-thumbnail rule.
- **Browsers cannot fetch publisher feeds directly**, because `connect-src 'self'` blocks them. Fetching must happen at build time or in a desk.
- **Click tracking on static pages** needs either a per-page inline script hash or a first-party file under `script-src 'self'` (the pattern `/search/search.js` uses).
- **Referrer policy:** only `index.html` sets `<meta name="referrer" content="strict-origin-when-cross-origin">`. Static pages set none and rely on the browser default.
- `SECURITY.md` lists what a CDN would add later: `frame-ancestors`, HSTS, `nosniff`, `Permissions-Policy`.

## 7. Risks for the Wire, tables and the 2 or 3 articles a week

- **Daily leads.** If the daily desks stop filing, `today.json`'s lead stops changing. The daily push keys on that hash, so it would stop, and "Today at the desk" would show its empty state. Long reads are not in `today.json`, so the Substack pieces would not drive the one daily push unless `build-feed.mjs` (today pool) and `daily-push` are changed on purpose.
- **Keep Wire items out of the syndication outputs.** `feed.xml` (full-body `content:encoded` with our byline), `news-sitemap.xml`, `/search/`, the today pool and `withAppArt`/`entryArt` all apply to anything that goes through `loadDayData` lanes. Put Wire items there and third-party headlines would syndicate under "Joseph Bankole" and pick up auto-matched ARCHV portraits.
- **A daily Wire or table refresh needs one commit a day to main.** That fits the engine's Contents API route, but it joins the concurrency group and should be batched with the other desks' commits.
- **Existing football data.** The only data provider on the site is API-Football (`scripts/shared/providers/api-football.mjs`, `BASE = "https://v3.football.api-sports.io"`). Today it calls `/players` only, with a committed cache and `ARCHV_FOOTBALL_ALLOW_FETCH=1` required to fetch. `CLAUDE.md` says the plan went Pro on 2026-08-04. Whether its terms allow showing standings or fixtures publicly is for the source-research pass. There is no standings or fixtures component anywhere in the site today.

Files referenced:
- /Users/josephbankole/Claude/fifa.archv/thearchv-site/CLAUDE.md
- /Users/josephbankole/Claude/fifa.archv/thearchv-site/package.json
- /Users/josephbankole/Claude/fifa.archv/thearchv-site/.github/workflows/deploy.yml
- /Users/josephbankole/Claude/fifa.archv/thearchv-site/.github/workflows/data-guard.yml
- /Users/josephbankole/Claude/fifa.archv/thearchv-site/scripts/build-feed.mjs
- /Users/josephbankole/Claude/fifa.archv/thearchv-site/scripts/build-rss.mjs
- /Users/josephbankole/Claude/fifa.archv/thearchv-site/scripts/shared/page-shell.mjs
- /Users/josephbankole/Claude/fifa.archv/thearchv-site/scripts/shared/day-data.mjs
- /Users/josephbankole/Claude/fifa.archv/thearchv-site/scripts/shared/data-shape.mjs
- /Users/josephbankole/Claude/fifa.archv/thearchv-site/scripts/check-data-shape.mjs
- /Users/josephbankole/Claude/fifa.archv/thearchv-site/scripts/verify-csp-pages.mjs
- /Users/josephbankole/Claude/fifa.archv/thearchv-site/scripts/build-content.mjs
- /Users/josephbankole/Claude/fifa.archv/thearchv-site/scripts/build-sport-pages.mjs
- /Users/josephbankole/Claude/fifa.archv/thearchv-site/scripts/deploy-site.sh
- /Users/josephbankole/Claude/fifa.archv/thearchv-site/scripts/sync-preview.sh
- /Users/josephbankole/Claude/fifa.archv/thearchv-site/scripts/shared/illustrated.mjs
- /Users/josephbankole/Claude/fifa.archv/thearchv-site/scripts/data/illustrated.json
- /Users/josephbankole/Claude/fifa.archv/thearchv-site/scripts/shared/providers/api-football.mjs
- /Users/josephbankole/Claude/fifa.archv/thearchv-site/src/render/home.ts
- /Users/josephbankole/Claude/fifa.archv/thearchv-site/src/render/illustrated.ts
- /Users/josephbankole/Claude/fifa.archv/thearchv-site/src/data/sports.ts
- /Users/josephbankole/Claude/fifa.archv/thearchv-site/src/data/worldCupDays.ts
- /Users/josephbankole/Claude/fifa.archv/thearchv-site/src/analytics.ts
- /Users/josephbankole/Claude/fifa.archv/thearchv-site/vite.config.ts
- /Users/josephbankole/Claude/fifa.archv/thearchv-site/index.html
- /Users/josephbankole/Claude/fifa.archv/thearchv-site/SECURITY.md
- /Users/josephbankole/Claude/fifa.archv/thearchv-site/supabase/functions/daily-push/index.ts
- /Users/josephbankole/Claude/fifa.archv/scripts/archv-site-commit.mjs
- /Users/josephbankole/Claude/fifa.archv/scripts/archv-pages-verify.mjs
- /Users/josephbankole/Claude/fifa.archv/scripts/archv-retrigger-pages.mjs
- /Users/josephbankole/Claude/fifa.archv/routines-v2/archv-football-desk.md

