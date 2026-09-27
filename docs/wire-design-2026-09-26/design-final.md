# ARCHV Wire and daily tables: final design (2026-09-26)

This revises `design-draft.md` against `critiques.json`. Sections A to I keep the draft's
structure. Where a section is unchanged in substance it is restated briefly and points at the
draft; everything a critic asked for is written out here. The founder's binding decisions are in
`README.md` and win over anything below.

## 0. What changed from the draft

**Compliance must-fix, all resolved**

| # | Critique | Resolution | Where |
|---|---|---|---|
| C1 | Betting filter checks headlines only; a live ESPN `/betting/` story passes | URL-path excludes (`/betting/`, `/fantasy/`, `/chalk/`, plus `/video/`, `/live`, `/report/_/gameId/`) applied before the pick; headline terms added (`favorites`, `favourites`, `favourite to win`, `longshot`, `odds-on`, `lines`); the "Top-seeded Lynx heavy favorites" item is a must-reject fixture; `check-wire-links.mjs` fails the build on any Wire href containing `/betting/` | A1, B2, B4 |
| C2 | Note rules contradict each other; grounding misses real misstatements | One rule: **the note frames, it never asserts.** It states no event, consequence or causal claim in our voice. New hard fails: missing attribution on hedged items, completion verbs absent from the item, negations absent from the item, and unknown names (now a hard fail, not a warning). Rejected notes are logged | B6 |
| C3 | App Store review notes, listing and age rating become untrue | Listed as app-release blockers with the exact edits; recommended link handling is `openURL` into Safari (keeps 13+); SFSafariViewController is a founder call that moves the rating to 16+ | E3, G, I |
| C4 | The Conversation's cited permission is a republishing clause; the UK page asks a fee | Ships `enabled: false`; basis recorded honestly in `sources.json`; enabling needs uk-republish@theconversation.com to confirm, or the founder to accept the risk in writing | A1, A2, I |
| C5 | The strip can change a headline and the verify step would pass it | Headline and URL compared byte for byte (exact code points, no NFC, no whitespace collapse); any difference drops the item; the Layer A strip runs on notes and the footer only | B6 |

**Engineering must-fix, all resolved**

| # | Critique | Resolution | Where |
|---|---|---|---|
| E1 | `today.json` hash moves when any lane files, so the push re-fires on a stale lead | A standalone fix (`today` gets its own `lastUpdated`) that ships **before** WP-C and **outside** the Wire branch, because it changes a value in an existing feed that shipped app builds and the push depend on. It needs the founder's eye, not a side effect of this work | G, H |
| E2 | Same-day rerun not idempotent | `fetch-wire` drops the target date's edition from the seen set; `finalise-wire` replaces a same-date edition; the commit tool refuses to overwrite a different same-date edition without `--replace`; a golden test proves a rerun produces the same output | B3, B6, H |
| E3 | jq acceptance expression errors | Parenthesised: `jq -e '(has("days")|not) and (has("lead")|not) and (has("wrap")|not)'` | H |
| E4 | Front-page wrapper duplicates the renderer's section id | `index.html` carries only the bare markers; renderers return the whole `<section>` or `''`. The front page is not changed on the site branch at all (see D1) | D1, D7 |
| E5 | Work packages are not parallel | WP-A and WP-B are one branch (`feature/wire-site`), so the `package.json` build line is edited once. `renderLead` belongs to WP-C only. Merge order: A+B, then C, then D and E. WP-E treats a 404 on `--get` as the seed | H |
| E6 | The 7-day lead rule breaks an existing app test | The age rule is a pure `SportLayout.activeLead(entries:today:)` with an injected clock; fixture dates move to be relative to it | E4 |

**Should-fix accepted**

- Terms evidence: `sources.json` carries the URL, quote, check date and a `snapshotSha256` slot; the desk snapshots each terms page weekly and alerts on change (A1, F2).
- Marketing: no ESPN headline in screenshots, preview video or social; no ESPN or league names in keywords, subtitle or promo text (G).
- Heading: the section keeps the founder's name, "The Wire", but carries a standing sub-line, "Headlines from other newsrooms, picked once a day", the source label sits before every headline, and a rule plus the footer line separates the strip from our own lede on sport hubs (D1, D2).
- Privacy: the draft's "the app contacts only thearchv.ca" is withdrawn (PostHog and Supabase are already contacted). A footer line says links open the publisher's own site with its own ads and privacy policy. Wire rows never reuse the ArticleMenu or feedback component, so no publisher headline reaches analytics (D3, E7).
- Attribution links get their own allowlist in the app (E2).
- The ESPN soccer `prefer` rule reports its hit rate every run; the tone switch applies to the preferred item too; no copy calls the football Wire "United coverage" (B4, F3).
- Rights register gains Football DataCo fixtures, NBA statistics rights and football-data clause 9.1 (I).
- Canon conflicts are merge blockers, not notes (I).
- LossyArray decoding and null-tolerant `TableValue` in the app (E1).
- Held blocks compare against the last **fresh** value and are dropped after 3 held days, with an alert after 2 (B8, C).
- The desk runs from a dedicated worktree reset to `origin/main` (F2).
- `test:wire` runs in the build chain, on fixtures, no network; Node 20 is the floor because `deploy.yml` pins 20 (B1).
- ESPN parser details: `<![CDATA[null]]>` is empty; URL-path excludes for match pages, video and live pages; `<guid>` is the primary dedupe key ahead of the URL hash (B2, B3).
- Each item stores `publishedDate`, the date in the source's own zone, and both surfaces display that, so the web and the app agree (B7).
- Front-page JSON imports go through `sanitise(raw as unknown)` when WP-C touches `home.ts` (D7).
- The no-animation check runs on a delimited source CSS region, not on bundled `dist` CSS (D6).
- The desk moves to 04:40 ET, clear of the paused Answer Desk's 05:00 slot (F1).
- `fetch-tables.mjs` reads only its named variables; nothing sources `.env` wholesale; no value is ever printed (B8).
- Acceptance lines are pure shell and run on a throwaway clone (H).
- BALLDONTLIE paginates by cursor with a page cap (B8).
- The app adds a `reads` section display name and notes the double-save (E9).

**Should-fix declined**

- *Rename "The Wire" to "Elsewhere today" or similar.* Declined: founder decision 1 names the product "a DAILY Wire". The concern (third-party headlines read as ours) is met by the sub-line, the per-item source label, the separating rule and the footer. If the founder prefers the rename, it is a one-string change.
- *Store full HTML and PDF snapshots of terms pages in the repo.* Partly declined: the repo is public and the pages are other companies' copyrighted text. The hash and check date live in `sources.json`; the snapshots themselves live in the desk's private run archive.

**Departures from the draft forced by the brief or the environment**

- Environment variable names are `FOOTBALL_DATA_TOKEN` and `BALLDONTLIE_API_KEY` (the brief's convention), not `FOOTBALL_DATA_KEY` and `BALLDONTLIE_KEY`.
- **Keyless Premier League table now.** openfootball (CC0) is reachable and complete through the latest played matchday, so the football table and United fixtures ship keyless, computed from results, labelled with the date of the newest result. football-data.org replaces it automatically when `FOOTBALL_DATA_TOKEN` is set, and openfootball becomes the cross-check.
- **Jolpica F1 stays off by default.** The brief names Jolpica as a no-key source, but its terms say "freely available for non-commercial use" and the data is CC BY-NC-SA 4.0. The module is built and runs only when `ARCHV_JOLPICA_PERMITTED=1` is set, which the founder sets after admin@jolpi.ca grants commercial use in writing. Until then F1 shows no table.
- **The Wikipedia modules (F1, tennis, golf) are designed but not built on this branch.** Wikipedia was unreachable from the build environment, and a wikitext parser written without a real page to test against is exactly the fragile parser the research warns about. They are the next piece of site work (H).
- **The front page is not changed on this branch.** Decision 6's home order (long read, then Wire, then tables) is WP-C and depends on E1 and the push-cadence ruling.

## A. Sources

### A1. News: launch set, 7 feeds from 1 publisher

Only sources with verdict `permitted-with-conditions` in `research-by-sport.json` appear. No source had a plain `permitted` verdict.

| id | Sport | Feed | Label | Enabled | Pick |
|---|---|---|---|---|---|
| `espn-soccer` | football | https://www.espn.com/espn/rss/soccer/news | ESPN | yes | first fresh; United preferred (FOUNDER) |
| `espn-nfl` | nfl | https://www.espn.com/espn/rss/nfl/news | ESPN | yes | first fresh |
| `espn-f1` | f1 | https://www.espn.com/espn/rss/f1/news | ESPN | yes | first fresh |
| `espn-tennis` | tennis | https://www.espn.com/espn/rss/tennis/news | ESPN | yes | first fresh |
| `espn-golf` | golf | https://www.espn.com/espn/rss/golf/news | ESPN | yes | first fresh |
| `espn-nba` | basketball (`nba`) | https://www.espn.com/espn/rss/nba/news | ESPN | yes | first fresh |
| `espn-wnba` | basketball (`wnba`) | https://www.espn.com/espn/rss/wnba/news | ESPN | yes | first fresh |
| `the-conversation-epl` | football | https://theconversation.com/topics/english-premier-league-11809/articles.atom | The Conversation | **no** (C4) | newest fresh |

**ESPN conditions** (https://www.espn.com/espn/news/story?page=rssinfo, re-fetched by the compliance critic on 2026-09-26): "If you choose to display an ESPN RSS feed on a website or app"; "you must indicate that the content has been provided by ESPN"; "You may not incorporate advertising into any ESPN RSS content"; "You may not modify any content provided in the feed, including but not limited to story headlines, story summaries, or URLs". Applied as:

- headline verbatim, never truncated, never ellipsised; it wraps;
- link is the feed's own URL, byte for byte, no UTM;
- per-item text label `ESPN`, and the footer line below;
- no shop, print, App Store or Dispatch call to action inside or beside a Wire block;
- headline only; no summary, body, image or logo is stored or shown;
- the note sits visibly apart, labelled "Our note".

**The Conversation** is off. Its pages govern full republication, not headline-and-link display; the UK page says "If you're planning to use our content for commercial use, you'll need to pay a licensing fee" and the US page narrows this to "Commercial, non-journalism usage: license fees may apply". The recorded basis for enabling it later: a linked headline is not republication, and the US page limits fees to non-journalism use. It is enabled only after uk-republish@theconversation.com confirms, or the founder accepts the risk in writing. It yields about one item a month, so holding it costs almost nothing.

**Attribution wording**

- Per item: `ESPN` (or `The Conversation` if enabled).
- Block and page footer: "Headlines appear exactly as each publisher wrote them and link to the publisher's own site, which has its own ads and privacy policy. ESPN headlines are provided by ESPN. The notes are The ARCHV's own."
- The footer is served in the feed so the app shows the same words.

### A2. Held for a founder decision

- **Yahoo Sports** (`permitted-with-conditions` in the research for NFL, tennis, golf, NBA and WNBA): held exactly as the draft's A2 argues. The RSS clause allows display "without modification", but the same terms bar commercial reuse "Unless otherwise expressly stated", and most items are syndicated from publishers with non-commercial terms. Ships in `sources.json` with `enabled: false`. If enabled: keep only items whose `<source>` is Yahoo Sports, label them "Yahoo Sports", discard `content:encoded` at parse.
- **The Conversation**: see A1.

### A3. Dropped, with reasons

Unchanged from the draft's A3 table (BBC, Sky, Guardian, Independent, The Athletic/NYT, Reach, CBC, Sportsnet, TSN, manutd.com, CBS, FOX, talkSPORT, Autosport, Motorsport.com, The Race, formula1.com, RaceFans, Planet Sport, FIA, RACER, Motorsport Week, Crash.net, GPFans, Tennis Majors, Ubitennis, ATP, WTA, Tennis.com, Tennis Canada, Golf.com, Golf Canada, SCOREGolf, Golf Monthly, National Club Golfer, Golf Channel, PGA Tour, LPGA, DP World Tour, Golf Digest, RTÉ, NBC/PFT, NFL.com, Globe and Mail, SB Nation, NBA.com, WNBA.com, The Next, Her Hoop Stats). Each was `not-permitted` or `unclear` in the research, and `unclear` is not permitted.

### A4. Tables and fixtures data

| Sport | Provider | Auth | Attribution shown (verbatim) | Status on this branch |
|---|---|---|---|---|
| Football | football-data.org v4: `/v4/competitions/PL/standings`, `/v4/teams/66/matches` | `FOOTBALL_DATA_TOKEN` (free, founder registers) | "Football data provided by the Football-Data.org API" (clause 7.1, required) | Built; skips with a log line when the token is absent |
| Football | openfootball `football.json` `2026-27/en.1.json` | none | "Fixtures and results: openfootball (CC0). Table computed by The ARCHV." (courtesy; CC0 needs none) | Built; keyless primary until the token exists, cross-check after |
| NFL | nflverse `schedules/games.csv` | none | "Data: nflverse, CC BY 4.0. Standings computed by The ARCHV." with links to the source and licence | Built |
| F1 | Jolpica `api.jolpi.ca/ergast/f1/current/*` | none, **but commercial use needs written permission** | "Data: Jolpica F1, CC BY-NC-SA 4.0, used with permission." | Built, off unless `ARCHV_JOLPICA_PERMITTED=1` |
| F1 | Wikipedia `2026_Formula_One_World_Championship` | none, descriptive UA | "Source: Wikipedia, CC BY-SA 4.0. Adapted by The ARCHV." plus article and licence links | Designed, not built (A0) |
| Tennis | Wikipedia `Current_tennis_rankings`, `2026_ATP_Tour`, `2026_WTA_Tour` | none | as above | Designed, not built |
| Golf | Wikipedia `2026_PGA_Tour`, `2026_LPGA_Tour`, `2026_European_Tour` | none | as above | Designed, not built |
| Golf | TheSportsDB Premium | $9/month (FOUNDER) | "Data: TheSportsDB" | Off |
| Basketball | BALLDONTLIE `/v1/games`, `/v1/teams`, `/wnba/v1/games`, `/wnba/v1/teams` | `BALLDONTLIE_API_KEY` (free, founder registers) | none required; shown as "Data: BALLDONTLIE. Records computed by The ARCHV; not official standings." | Built; skips when the key is absent |

Avoid list unchanged (TheSportsDB free key, OpenF1, OWGR, Rolex Rankings, ESPN's undocumented APIs, NBA.com CDN, DataGolf, api-tennis). API-Football is not used for display until its terms are read.

### A5. Still uncovered

Unchanged from the draft, plus: F1, tennis and golf have no table until the Wikipedia modules land or Jolpica permission arrives; the football Wire has no permitted UK voice while The Conversation is off.

## B. Pipeline

### B1. File layout (as built)

Node ESM, no new npm dependencies, Node 20 floor. Tests use `node:test` and run in the build chain.

```
scripts/wire/
  sources.json            permitted news sources, filters, terms evidence
  lib/http.mjs            fetch with UA, 15 s timeout, retry on 202/empty/5xx, one 429 wait; --offline fixture dir
  lib/feed-parse.mjs      RSS 2.0 + Atom; entities and CDATA; drops content, content:encoded, media, enclosures
  lib/time.mjs            RFC 822 / ISO; zone labels read as the source's wall clock; zone-aware dates
  lib/canon.mjs           canonicalUrl(), titleKey(), itemId()
  lib/pick.mjs            filters, freshness, seen set, prefer, editorial vs chronological
  lib/grounding.mjs       deterministic note checks (B6)
  lib/schema.mjs          validate + sanitise wire and tables content; build the public feeds
  lib/render.mjs          pure HTML renderers for the Wire and table blocks
  fetch-wire.mjs          CLI -> dated candidates file
  finalise-wire.mjs       CLI candidates + optional notes + previous -> scripts/data/daily/wire.json
  verify-wire.mjs         CLI byte-exact headline/url check
  fetch-tables.mjs        CLI -> scripts/data/daily/tables.json
  tables/football.mjs nfl.mjs f1.mjs basketball.mjs common.mjs
  data/nfl-teams.json     32 teams, conference and division
  test/*.test.mjs, test/fixtures/**   (fixtures are never shipped as live content)
scripts/data/daily/wire.json    content file (seed: {"version":1,"updatedAt":null,"editions":[]})
scripts/data/daily/tables.json  content file (seed: {"version":1,"updatedAt":null,"sports":{}})
scripts/build-daily-feed.mjs    dist/feed/wire.json + dist/feed/tables.json
scripts/build-daily-pages.mjs   /wire/ and /tables/
scripts/check-wire-links.mjs    post-build guard on dist and on the source CSS region
```

Why JSON under `scripts/data/daily/`: unchanged from the draft (never executed; kept out of `loadDayData` lanes so Wire items never reach `feed.xml`, the news sitemap, search, `today.json`, `withAppArt` or `entryArt`).

### B2. Fetch and parse rules

- User-Agent `TheARCHV-Wire/1.0 (+https://thearchv.ca/standards/; partnerships@josephbankole.ca)`.
- A 202, an empty body or a 5xx is retried twice (5 s, 15 s). A 429 honours `Retry-After` up to 60 s, once. Anything else ends as `fetch-failed:<status>`; a network error as `fetch-failed:network`.
- The parser keeps `title`, `link` (Atom `rel=alternate`), `pubDate`/`published`/`updated`, `guid`/`id`, and `description`/`summary` stripped to 600 characters for grounding only. `<![CDATA[null]]>` and the literal `null` are treated as empty.
- The parser discards `content`, `content:encoded`, `enclosure`, `media:*` and every image field.
- Links that are not https, or whose host fails the source's `linkHosts` suffix match (`www.espn.com` passes `espn.com`; `espn.com.evil.net` and `evilespn.com` fail), are dropped. So are links with user info or a non-443 port.
- Time: a numeric offset or `Z` is exact. A zone label (ESPN writes "EST" all year) is read as the source's `timeZoneHint` wall clock (America/New_York), because a literal EST reading puts same-day items in the future. ESPN items keep `timePrecision: "date"` because their stamps are batched.

### B3. Canonicalise and dedupe

- `canonicalUrl` (dedupe key only, never displayed or linked): lowercase scheme and host, strip `www.`, drop the fragment, remove params matching `^(utm_.*|ref|ref_src|refsrc|cmpid|cmp|src|ex_cid|mod|partner|at_.*|fbclid|gclid|mc_cid|mc_eid|ito|xtor|guccounter|ocid|smid|sr_share|taid|cid)$` (case-insensitive), sort the rest, strip the trailing slash.
- `titleKey`: NFKC, lowercase, strip curly and straight quotes and punctuation, collapse whitespace, sha256, 12 hex characters.
- `urlKey`: sha256 of the canonical URL, 12 hex characters.
- `id`: `${sourceId}:${guidKey || urlKey}` where `guidKey` is the sha256 of the feed's stable `<guid>` when it has one (ESPN's `US-EN-50022329` style). Dedupe matches on any of guid key, URL key or title key.
- The seen set is every item in the previous 7 editions **except the edition dated the target day** (E2), plus items picked earlier in the same run in `sources.json` order (so the same story across `espn-nba` and `espn-wnba` is taken once).

### B4. Top item per source per day: the stated rule

The edition date is the America/Toronto date at run time (or `--date`). For each enabled source, in `sources.json` order:

1. Walk items in document order.
2. Drop an item when (and record the first reason):
   - its link fails the link checks in B2 (`bad-link`);
   - its URL path matches the defaults' or the source's `excludePaths` (`excluded-path:<pattern>`), e.g. `/betting/`, `/fantasy/`, `/chalk/`, `/video/`, `/live`, `/report/_/gameId/`;
   - its title matches the defaults' or the source's `exclude` patterns, case-insensitive (`excluded:<pattern>`): betting terms (`odds`, `picks`, `bets`, `betting`, `parlays`, `predictions`, `props`, `sportsbook`, `favorites`, `favourites`, `favourite to win`, `longshot`, `odds-on`, `lines`) and live or schedule pages (`how to watch`, `live:`, `follow live`, `live updates`, `live blog`, `as it happened`, `start time`, `stream`);
   - its age is over `maxAgeHours` (36) relative to the run time, or its date is more than 1 hour in the future (`stale` / `future`); an unparseable date passes only when unseen;
   - it is in the seen set (`seen`).
3. `order: "editorial"`: take the first survivor that matches a `prefer` phrase, if any; otherwise the first survivor. `order: "chronological"`: take the newest parsed date, ties by document position.
4. The next two survivors are recorded as `alternates` for a desk veto.
5. No survivor: record `missing` with `no-fresh-item`, `all-seen`, `all-filtered`, `fetch-failed:*` or `parse-error`.

Desk veto rules unchanged from the draft (betting, live or schedule pages, a graphic or sensational headline, a duplicate). The run reports `prefer` hits.

### B5. Candidates file

Written by `fetch-wire.mjs` to `--out` (default `.wire-run/<date>/candidates.json`, git-ignored). Never committed. Shape as the draft's B5, plus `publishedDate`, `guidKey`, `urlKey` and `rejected[]` with reasons. Exit codes: 0 all enabled non-sporadic sources picked, 3 partial, 1 nothing picked.

### B6. Notes: one rule, and the gate chain

**The rule.** A note frames the item; it never asserts. It must not state any event, consequence or causal claim in The ARCHV's own voice. It may say what to watch, or name what is not yet known, and nothing else. A note is optional: a Wire item publishes with or without one, and nothing in this repo writes prose.

**Hard fails in `lib/grounding.mjs`** (run by `finalise-wire.mjs`, which drops a failing note and keeps the item):

- length outside 40 to 160 characters, more than one sentence, a question mark, an exclamation mark, em or en dashes, emoji, `#`, a URL, or quotation marks;
- a digit group not present in the headline or summary;
- a capitalised name (after the first word) not present in the headline or summary;
- the item is hedged ("Sources", "reportedly", "expected", "in talks", "could", "set to", "rumour", "report") and the note does not attribute it ("ESPN reports", "according to ESPN", "reported by");
- a completion verb (signed, traded, fired, completed, won, sacked, agreed, confirmed, joined, released, retired, beat, lost) that is not in the headline or summary;
- a negation (not, no, never, without, nor, n't) absent from the headline and summary;
- banned significance narration ("why it matters", "here's why", "the part most people miss", "that's the point", "worth watching") and betting words;
- more than 60% of the headline's tokens repeated.

The tragedy switch (F2 C0 S10), dial (F1 C3 S9) and the two-source question stay FOUNDER items; the two-source ruling is taken only now that the note cannot assert (C2). Every rejected note is written to the run's `rejected-notes.log`.

**Gate chain.** As the draft's B6 with three changes: Layer A of `remove-ai-marks` runs on the notes and footer strings only; `inspect_text.py` runs on headlines and URLs to detect, never to clean; step 10 (`verify-wire.mjs`) compares headline and URL byte for byte against the candidate and drops any item that differs. The report records "headline field: detect-and-drop" so it is not read as a skipped strip.

### B7. Wire content file `scripts/data/daily/wire.json`

As the draft, plus `publishedDate` (source-zone date, `YYYY-MM-DD`) and `guidKey`/`urlKey` on each item. `finalise-wire.mjs` replaces any edition with the same date, sorts newest first and keeps 7. `status` is `complete` when every enabled non-sporadic source produced an item, else `partial`.

### B8. Tables fetchers

`fetch-tables.mjs` runs modules in series. Each module reads only its own named variables (`FOOTBALL_DATA_TOKEN`, `BALLDONTLIE_API_KEY`, `ARCHV_JOLPICA_PERMITTED`) from `process.env` and never prints a value. A module with a missing key emits a `key-absent` log line and leaves that sport's previous blocks untouched.

| Module | Blocks | Sanity (a failure holds the last good block) |
|---|---|---|
| football | `pl-table` (standings, compact 6 plus United), `mu-next` (next 3), `mu-results` (last 3) | 20 rows; points = 3W + D for every row; United present; played counts within one matchday of each other |
| nfl | `nfl-standings` (32 rows by division, W-L-T, Pct; compact = 8 division leaders), `nfl-week` (next week's games), `nfl-results` (last completed week) | 272 regular-season rows; no team with more games than weeks played; odds columns never read |
| f1 (Jolpica, gated) | `f1-drivers`, `f1-constructors` (compact 10), `f1-next` | 20+ drivers, 10+ constructors |
| basketball | `nba-table`, `wnba-table` (computed records by conference), `nba-games`, `wnba-games` | W + L = games counted; cursor pagination capped at 40 pages |

**Holds** compare against the last fresh block (`lastFreshAsOf`), never a held copy. A block held for more than 3 days is dropped rather than shown; the desk alerts after 2 (`_LANE-ALERTS.md`). Wikipedia blocks, when built, carry `source.licence: "CC BY-SA 4.0"` and `adapted: true`.

### B9. Tables content file

As the draft's B9, plus `lastFreshAsOf` and `heldDays` on each block and `source.licenceUrl`. No crest, emblem, logo or image field is ever copied from a provider.

### B10. Published feeds and compatibility

`scripts/build-daily-feed.mjs` runs after `build-feed.mjs` and writes two new standalone files. `index.json` and every existing feed stay byte-identical.

- `dist/feed/wire.json`: `{ "schema": "archv-wire/1", "generatedAt", "edition": { "date", "status", "timeZone": "America/Toronto" } | null, "items": [ { id, sport, league, source: { id, name }, headline, url, publishedAt, publishedDate, timePrecision, note } ], "footer" }`. Latest edition only.
- `dist/feed/tables.json`: `{ "schema": "archv-tables/1", "generatedAt", "sports": { <sport>: { "blocks": [...] } } }`.

Compatibility rules (written into the site `CLAUDE.md`): neither file carries `days`, `lead` or `wrap` (tested); changes are additive; a breaking change ships as a new file name; `publishedAt` is ISO or null; old app builds never request either file; neither file enters `today.json`, any `days` feed, `feed.xml`, `news-sitemap.xml`, `search-index.json`, `withAppArt`, SavedStore, the widget or push.

## C. Failure handling

As the draft's table, with these rows changed or added:

| Situation | Behaviour | Reader sees |
|---|---|---|
| A feed is down or unreachable | `missing: fetch-failed:<status>`; the rest publish; the build never fetches, so it never breaks | That source is absent |
| Every source fails | `fetch-wire` exits 1; no Wire commit; tables still commit | The last edition, labelled "Edition of <weekday date>", never "today" |
| Edition older than the build day | the page prints the edition date and "No new edition since then" | Dated, not new |
| Edition older than 7 days | the page and strips show nothing; the feed still carries it with its date and the app hides it | Nothing |
| A block held | shows "Last updated <date>" | Dated |
| A block held more than 3 days, or `asOf` more than 14 days old | dropped from pages | Nothing |
| Key absent | block keeps its previous copy (or is absent); log `key-absent` | Dated or nothing |
| Bad data in a content file | `sanitise()` drops the item or block and logs it; the build fails only on unparseable JSON | The rest ships |
| Same-day rerun | same-date edition replaced, never duplicated | Unchanged |

## D. Website

### D1. Pages and components

- **`/wire/`** (`scripts/build-daily-pages.mjs`): h1 "The Wire", the sub-line "Headlines from other newsrooms, picked once a day. One story per source, linked to the publisher.", the edition line, one section per sport in `SPORTS` order (anchors `#football`, `#nfl`, ...; basketball lists NBA then WNBA as equals), the footer attribution and a "How the Wire works" paragraph linking `/standards/`.
- **`/tables/`**: every sport's blocks with anchors, each block's "Updated" or "Last updated" line and its attribution and licence line.
- **Sport hubs** (`build-sport-pages.mjs`): after the lede, a rule, then that sport's Wire strip and compact table blocks with a "Full tables" link, then the existing desk rail, unchanged. Nothing renders when there is nothing to show.
- **Front page:** unchanged on this branch (E4, G). When WP-C lands, `index.html` carries only bare `<!--archv:wire-->` and `<!--archv:tables-->` markers and the renderers return a whole `<section>` or `''`.

### D2. Markup

As the draft's D2, with the source label before the headline, `target="_blank" rel="noopener noreferrer"` on every outbound link, no `<img>`, and real `<table>` markup with `<caption>`, `<th scope="col">` and tabular figures. The renderers live in `scripts/wire/lib/render.mjs` (pure, no DOM) so the generators use them directly; the front page imports them through `day-data.mjs`'s `code` extras when WP-C needs them.

### D3. Attribution

Per item text label; the footer line on every Wire block and on `/wire/`; each table block's `source.attribution` verbatim (football-data's sentence word for word); Wikipedia blocks add the article and licence links. No publisher, league or club logos anywhere, and no crests.

### D4. SEO

`/wire/` is `noindex,follow` with a self canonical, out of every sitemap, feed and search index; JSON-LD `WebPage` only (FOUNDER). `/tables/` is indexable with an `EXTRA_URLS` row (FOUNDER). Sport hubs stay indexable.

### D5. PostHog

Unchanged on the static pages for now: pageviews only. `wire_click` and `tables_full_click` through a first-party `/wire/wire.js` are a follow-up, not needed for the first review. No URLs or headlines in event properties.

### D6. Design and calm

Existing tokens only. Labels in `--ink-muted`, rules in `--rule`, the United row on `--bg-sunken` with weight 600. The note is Fraunces italic behind a 2 px `--rule` border. No marquee, no `@keyframes`, no `animation`, no auto-refresh, no relative times, no "LIVE". The Wire and tables CSS sits between `/* wire:start */` and `/* wire:end */` in `pageStyles()`, and `check-wire-links.mjs` checks that region of source.

### D7. Files (site branch)

Add: everything in B1, `scripts/build-daily-pages.mjs`, `scripts/check-wire-links.mjs`. Change: `scripts/shared/page-shell.mjs` (CSS region, masthead panel links unchanged), `scripts/build-sport-pages.mjs`, `scripts/build-content.mjs` (`/tables/` row), `scripts/verify-csp-pages.mjs`, `package.json`, `scripts/deploy-site.sh` and `scripts/sync-preview.sh` (`DATA_FILES`), `.gitignore`, site `CLAUDE.md`.

## E. iOS app

As the draft's E, with these changes:

- **E1** `WireItem` gains `publishedDate`. Items and blocks decode through a `LossyArray` so one bad element drops alone; `TableValue` decodes null. Tests: one malformed block leaves the rest renderable; a null cell decodes.
- **E2** Two allowlists: Wire links (`espn.com`, plus `theconversation.com` only once it is enabled) and attribution links (`en.wikipedia.org`, `creativecommons.org`, `football-data.org`, `github.com`, `balldontlie.io`, `api.jolpi.ca`). A test checks every table block shows its source, licence name and a working link.
- **E3** Recommended: open publisher links with `openURL` into Safari, which is not in-app browsing and keeps the 13+ rating. SFSafariViewController is a founder call and means answering Unrestricted Web Access as 16+.
- **E4** The 7-day lead rule lives in pure `SportLayout.activeLead(entries:today:)` with an injected clock; `HomeFeedModelTests` fixtures move relative to it.
- **E5** Dates display from `publishedDate` (source zone), and `WireEditionLabel` compares the Toronto edition date with the device's local date.
- **E7** The privacy line is corrected: the app already contacts PostHog and Supabase. Wire rows never use ArticleMenu or the feedback thumbs, so no publisher headline reaches analytics.
- **E9** Add a `reads` case to `sectionDisplayName`; note the possible double save in the release notes.

E6 (localisation), E8 (accessibility), E10 and E11 are unchanged from the draft.

## F. The desk

As the draft's F, with: cron `40 4 * * *` ET (clear of the paused Answer Desk's 05:00); the desk runs from a dedicated worktree reset to `origin/main` each run (`DEVELOPER_DIR=/Library/Developer/CommandLineTools` for the git licence trap); keys are passed as the three named variables only, never by sourcing `.env`; the weekly terms check diffs each `sources.json` terms page against its stored hash; proof lines add `prefer hits: n/1` and `headline field: detect-and-drop`; `finalise-wire` replaces a same-date edition, and the commit tool needs `--replace` to overwrite a different one.

## G. Home and product

The front-page order, the long-read lead and `reads.json` stay as the draft's G, as WP-C, after:

1. the standalone `today.json` `lastUpdated` fix (E1), which ships first on its own; and
2. the founder's push-cadence ruling.

App Store copy that must change before the app release that shows the Wire: Review Notes (Wire shows headline-and-link items under ESPN's published RSS terms, with the URL and a dated snapshot; the other licences named; our own reporting is the long reads and the notes); description and What's New describe the Wire and tables; the push line becomes "at most one quiet notification a day"; the age-rating answer follows E3. No ESPN headline in screenshots, previews or social; no ESPN or league names in keywords, subtitle or promo text.

## H. Work packages

- **WP-A+B (this branch, `feature/wire-site`)**: B1 to B10 and D1 to D7 as scoped above.
- **WP-C**: after the standalone E1 fix and the push ruling. Owns `renderLead` and the front-page markers.
- **WP-D**: app, against checked-in `wire.json`, `tables.json` and `reads.json` fixtures.
- **WP-E**: commit tool and desk; `--get` treats 404 as the seed; live acceptance waits for WP-A on main.
- **Wikipedia modules** (F1, tennis, golf): next site work, built against real pages pulled from an unblocked network.

Merge order: A+B, then C, then D and E.

**Acceptance for this branch** (pure shell, run in a throwaway clone):

```
npm ci && npm run build
test -f dist/wire/index.html && test -f dist/tables/index.html
grep -q 'content="noindex,follow"' dist/wire/index.html
! grep -q 'thearchv.ca/wire/' dist/sitemap.xml && grep -q 'thearchv.ca/tables/' dist/sitemap.xml
jq -e '(has("days")|not) and (has("lead")|not) and (has("wrap")|not)' dist/feed/wire.json
jq -e '(has("days")|not) and (has("lead")|not) and (has("wrap")|not)' dist/feed/tables.json
jq -e '[.feeds[].name] | (index("wire") == null) and (index("tables") == null)' dist/feed/index.json
node scripts/check-wire-links.mjs dist
npm run test:wire
```

## I. Founder actions and open risks

**Only the founder can**

1. Register `FOOTBALL_DATA_TOKEN` (football-data.org) and `BALLDONTLIE_API_KEY` (BALLDONTLIE), for the desk's environment only; never `VITE_`, never CI.
2. Email admin@jolpi.ca for commercial use of Jolpica F1 data; on a yes, set `ARCHV_JOLPICA_PERMITTED=1` for the desk.
3. Email uk-republish@theconversation.com, or accept the risk in writing, before The Conversation is enabled.
4. Email ESPN to reconcile the RSS page with Disney's master terms, before the app release (the web can go first).
5. Rule on: Yahoo; the tragedy switch and dial; the two-source ruling for notes (now that notes cannot assert); `/wire/` noindex and `/tables/` indexable; the push cadence; SFSafariViewController (16+) versus Safari (13+); TheSportsDB $9/month.
6. Approve: the scheduled desk and its ledger rows; merging this branch; the app release.

**Merge blockers (canon)**: the D-2026-08-04g carve-out; the dated amendment to APP-DAY1-PRINCIPLES line 47 ("Live scores, fixtures, standings. Different app"); the push-cadence ruling; the two-source ruling for notes.

**Rights register** (added): the Premier League fixture list is licensed by Football DataCo (CJEU C-604/10 limits its copyright; low risk, recorded); NBA.com terms bar a regularly updated statistics database without consent, and BALLDONTLIE cannot pass on the NBA's own rights, so records are shown as facts only; football-data clause 9.1 bars showing data after cancelling, so the key stays registered while any held block could show; nflverse data "belong to their respective owners", facts only; Jolpica data is non-commercial until permission.

**Residual risks** unchanged from the draft: licence concentration on ESPN (7 of 7 enabled feeds), ESPN time quirks, headlines we cannot edit, the no-advertising rule on the front page, Wikipedia vandalism and ShareAlike, App Review 4.2.2, and the brand pull toward "fixtures, standings".
