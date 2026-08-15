# Glossary expansion: a proposal

**Status: PROPOSAL. Nothing here is wired in.** No entry has been added to
`scripts/glossary-data.mjs`, no build has been run, nothing is committed or deployed. Glossary
terms are founder-approved before they publish. This document is the thing to approve or reject.

Written 2026-08-13, off a 7-day PostHog review in which Google search delivered 17 sessions, all
17 landing straight on content, almost all of them on three glossary entries:
`/glossary/agent-fees` (7 pageviews), `/glossary/practice-squad` (7), `/glossary/tapping-up` (6).

---

## What the three ranking entries actually have in common

The brief describes them as transfer mechanics and NFL terms. Both true, and both a level too high.
All three are off-field administration: money, rules and paperwork. Not one of the nine on-field
entries is in the ranking set, and those are the terms a general football audience is likeliest to
search. "What is offside" puts the site up against the Football Association, Wikipedia and Sky
Sports, all of whom answered it years ago. Almost nobody has written a clean answer to "what is
tapping up".

The variable to select on, then, is **competition density**, which is why the most-searched term in
the list below sits fifteenth.

The three also share a shape the generator rewards. Each `question` is a sentence a person would
type. Each `answer` gives the definition in sentence one and the mechanism in sentence two, in
about 50 words, which is the size an answer engine lifts whole. Each `depth` block does three
jobs in order: how the thing works, what it is confused with, and what it costs somebody.

---

## 1. Fifteen candidates, ranked

Ranked by intent divided by competition. Every slug below was checked against the 60 existing
entries; none is a duplicate, and overlaps that stop short of duplication are flagged.

**Read the ranking as judgement, because that is what it is.** No keyword tool was used and no
volume figures were pulled. The order rests on the shape of the query, on which established sites
already answer it, and on the one piece of real evidence available, which is the three pages that
ranked. Anyone with access to Search Console impression data should re-sort this list before it is
built out past the first batch.

| # | Term | Slug | Sport | The phrasing a person would type | Why, and what it overlaps (judgement) |
|---|---|---|---|---|---|
| 1 | Void years in NFL contracts | `void-years` | NFL | "what are void years in an NFL contract" | Every cap story names them and nobody defines them. Drafted below. |
| 2 | Solidarity payments | `solidarity-payments` | Football, transfers | "who gets solidarity payments in football" | Named in reporting whenever a fee is agreed abroad, and never explained there. Drafted below. |
| 3 | Third-party ownership | `third-party-ownership` | Football, transfers | "what is third party ownership in football" | Settled history, banned, well documented. Drafted below. |
| 4 | Guaranteed money in NFL contracts | `guaranteed-money` | NFL | "why are NFL contracts not guaranteed" | Partial overlap with `dead-cap`, which explains the cap side but not the cash side. |
| 5 | The International Transfer Certificate | `international-transfer-certificate` | Football, transfers | "what is an international transfer certificate" | Named inside `domestic-and-international-windows` depth, defined nowhere. Its own moment is deadline day. |
| 6 | Transfer bans and registration embargoes | `transfer-ban` | Football, transfers | "what is a transfer ban in football" | Not covered anywhere, and it arrives attached to a news story rather than to a season. |
| 7 | Restricted free agency and tenders | `restricted-free-agent` | NFL | "what is a restricted free agent in the NFL" | Nothing in the set covers NFL free-agency tiers. |
| 8 | The fifth-year option | `fifth-year-option` | NFL | "what is the fifth year option NFL" | Annual, calendar-driven, narrow enough to win. |
| 9 | Injured reserve and the return designation | `injured-reserve` | NFL | "how does injured reserve work in the NFL" | Weekly recurring query through the season. |
| 10 | Swap deals and player-plus-cash | `swap-deal` | Football, transfers | "how are swap deals valued in football" | Ties directly to `amortisation`, which explains why clubs like them. |
| 11 | Termination by mutual consent | `mutual-consent` | Football, transfers | "what does released by mutual consent mean" | Appears in club statements constantly, explained nowhere. |
| 12 | The loyalty bonus | `loyalty-bonus` | Football, transfers | "what is a loyalty bonus in a football contract" | Weakest of the fifteen. Two existing entries already touch it; may be better as three sentences added to `signing-on-fee`. |
| 13 | Article 17 and the protected period | `article-17` | Football, transfers | "can a player buy out his own contract" | Lower volume, near-zero competition, and the natural sequel to `bosman-ruling`. |
| 14 | The NFL rookie wage scale | `rookie-wage-scale` | NFL | "how does the NFL rookie wage scale work" | Draft-week seasonal. Pairs with 8. |
| 15 | The NFL salary cap | `nfl-salary-cap` | NFL | "how does the NFL salary cap work" | Probably the most-searched term in the list, and ranked last on purpose: Over The Cap and Spotrac are established answers to it. Worth building only as the hub the other NFL entries link to, not as a traffic play. |

### Checked and deliberately not proposed

Each of these is already inside an existing entry, and a separate page would split the same query
across two URLs:

- **Buy-out clause.** Inside `release-clause`, which draws the Spanish distinction explicitly.
- **Agent commission cap.** Inside `agent-fees`.
- **The 25-man squad list.** Inside `homegrown-quota`.
- **Free agent.** Inside `free-transfer`.
- **The post-June 1 designation.** Inside `dead-cap`.
- **The deal sheet.** Inside `deadline-day`.

---

## 2. Three drafted entries

Paste-ready, in the exact shape `glossaryEntries` uses. Constraints observed:

- `answer` is 51, 51 and 48 words, definition first and mechanism second, carrying none of `&`,
  `<`, `>` or `"`, so each stays byte-identical between the escaped HTML and the JSON-LD.
- Every `related` slug points at an entry that **already exists** and was checked against the
  current 60, so any one of the three can be approved alone without `relatedList()` throwing.
- No em dashes, British spelling, figures as figures.

Sources sit below each entry, not inside it. The data shape has no `sources` field and nothing
renders one. See the note at the end of this section.

### 2.1 Void years

```js
  {
    slug: "void-years",
    title: "Void years in an NFL contract",
    question: "What are void years in an NFL contract?",
    answer:
      "Void years are seasons added to the end of an NFL contract that the player will never play. They exist so a signing bonus can be spread across more years for salary cap purposes, lowering the charge now. When the deal voids, the unused proration lands on the cap at once.",
    depth: [
      "The mechanism sits in one rule. A signing bonus is paid up front in cash but charged against the salary cap in equal slices across the length of the contract, up to a maximum of five seasons. A three year deal can only spread a bonus over three years, so clubs bolt fake seasons onto the end to reach five and cut the annual charge.",
      "The bill is postponed rather than cancelled. When the contract reaches its void years without an extension, every remaining slice accelerates onto that season's cap at once as dead money, and the player is out of contract and free to sign anywhere. A club that has already spent the relief is paying for a squad it no longer has.",
      "Clubs do it because a cap dollar today buys more than a cap dollar in three years, which is a defensible bet while the cap keeps rising. The trap is concentration. Enough voided deals landing in the same season leaves a front office choosing between a wasted year and another extension signed mainly to push the charge forward again.",
    ],
    related: ["dead-cap", "franchise-tag", "nfl-waivers"],
  },
```

**Sources.**

| Claim | Source 1 | Source 2 |
|---|---|---|
| Signing bonus prorated evenly over a maximum of five years | ESPN, Dan Graziano, "What is dead money?" | SumerSports, "Void Years Explained" |
| Void years are seasons the player never plays, added for proration | SumerSports, "Void Years Explained" | Over The Cap, "Examining the Pros and Cons of Void Years for Salary Cap Relief" |
| Maximum void years equals five minus the real years remaining | SumerSports (states it directly) | ESPN (states the five-year rule the arithmetic follows from) |
| Remaining proration accelerates onto the cap when the deal ends | ESPN, Dan Graziano | SumerSports |
| Player becomes a free agent when the contract voids | SumerSports | CBS Sports, annual list of players whose contracts void ahead of free agency |
| A cap dollar now is worth more than a cap dollar later | Over The Cap | SumerSports |
| Concentration risk, and extensions signed to postpone the charge | Over The Cap | SumerSports |

**Cut for want of a second source:** the specific dead-money totals Over The Cap attributes to
Tampa Bay, and SumerSports' Kirk Cousins figure. One source each, and a dated number in an
evergreen entry rots anyway.

### 2.2 Solidarity payments

```js
  {
    slug: "solidarity-payments",
    title: "Solidarity payments",
    question: "What are solidarity payments in football?",
    answer:
      "Solidarity payments are the share of an international transfer fee that goes to the clubs which trained a player. FIFA sets it at 5 per cent, deducted from the fee rather than added to it, and divided between every club that trained the player between the ages of 12 and 23.",
    depth: [
      "The split is set season by season rather than shared out evenly. Under FIFA's Regulations on the Status and Transfer of Players, each season a player spent at a club between the ages of 12 and 15 is worth 5 per cent of the solidarity pot, and each season from 16 to 23 is worth 10 per cent. In plain money that is a quarter of one per cent of the fee for an early year and half of one per cent for a later one.",
      "It is not the same thing as training compensation, and the two are constantly confused. Training compensation is a separate payment, owed when a player signs a first professional contract and on international moves up to the end of the season of their 23rd birthday, and it is calculated from published training costs by club category rather than from the fee. Solidarity is a slice of a fee that has actually been agreed.",
      "The money was long owed and rarely collected, because a small club had to work out what it was due and then chase it across borders. FIFA set up a Clearing House to do that centrally, and it began operating in November 2022: the buying club pays into it, and it works out the entitlements and distributes them.",
    ],
    related: ["sell-on-clause", "domestic-and-international-windows", "undisclosed-fee"],
  },
```

**Sources.**

| Claim | Source 1 | Source 2 |
|---|---|---|
| Solidarity contribution is 5 per cent of transfer compensation | FIFA, TMS Help Centre, "Solidarity mechanism" (citing RSTP Article 21 and Annexe 5) | ESPN, "What does adoption of training compensation, solidarity payments mean for MLS?" |
| Deducted from the fee rather than added to the buying club's bill | FIFA, TMS Help Centre | Farleys Solicitors, "Understanding Training Compensation and Solidarity Payments in Football" |
| Covers training between the ages of 12 and 23 | FIFA, TMS Help Centre | ESPN |
| Per season: 5 per cent of the pot for ages 12 to 15, 10 per cent for 16 to 23 | FIFA, TMS Help Centre | Farleys Solicitors |
| Applies to transfers between clubs of different associations | FIFA, TMS Help Centre | Farleys Solicitors |
| Training compensation is separate, ages 12 to 21, triggered by a first professional contract and international moves to the end of the season of the 23rd birthday | ESPN | FIFA, TMS Help Centre, "Training compensation" (citing RSTP Article 20 and Annexe 4) |
| Training compensation is calculated from published training costs by club category | ESPN | FIFA, TMS Help Centre |
| FIFA Clearing House began operations in November 2022 and distributes these payments centrally | FIFA, "FIFA Clearing House begins operations" | Advokatfirmaet SME, "FIFA Clearing House" |

**Cut for want of a second source:** FIFA's own estimate that close to 400 million US dollars a
year should reach training clubs against the 70 to 80 million they were receiving. One source.
**Also cut, deliberately:** FIFA states that solidarity can be triggered on a transfer between two
clubs of the same association where a former training club is affiliated elsewhere. Only FIFA says
it in the material found; Farleys describes the mechanism as international only. The draft states
the international case, which all sources agree on, and stays silent on the edge case.

### 2.3 Third-party ownership

```js
  {
    slug: "third-party-ownership",
    title: "Third-party ownership",
    question: "What is third-party ownership in football?",
    answer:
      "Third-party ownership is an arrangement in which an investor outside football owns a share of a player's future transfer fee. The club still holds the registration and picks the team, but part of any sale goes elsewhere. FIFA banned new agreements of this kind from 1 May 2015.",
    depth: [
      "The appeal to a club short of cash was obvious. An investment fund would put money in, sometimes covering the cost of developing the player, and take a percentage of whatever the player was eventually sold for. The registration never moved and the player was contracted to the club in the ordinary way, so nothing about it was visible from the stands.",
      "FIFA's objection was influence rather than money. An outside party with a return riding on a sale has an interest in team selection and in when a player is moved on, which cuts across a club's independence, and young players were exposed to being traded as assets. Article 18ter of the Regulations on the Status and Transfer of Players, announced in FIFA Circular 1464 in December 2014, bars a club or player from agreeing that any third party takes a share of a future transfer fee. Agreements already in place could run to their expiry but not be extended.",
      "England had banned it seven years earlier. The Premier League outlawed third-party ownership from the start of the 2008-09 season, after West Ham signed Carlos Tevez and Javier Mascherano in 2006 with their economic rights held by offshore companies, and were fined a record sum for fielding them.",
    ],
    related: ["sell-on-clause", "undisclosed-fee", "agent-fees"],
  },
```

**Sources.**

| Claim | Source 1 | Source 2 |
|---|---|---|
| An outside investor holds a share of a player's future transfer fee, sometimes funding development | BBC Sport, "Uefa and Fifpro urge Europe to outlaw third-party player ownership" | Lexology, "Football Players: Not a Third Party in the Context of TPO Ban" |
| FIFA's global ban took effect on 1 May 2015 | BBC Sport | Cardador Marín, "Articles 18 bis and 18 ter of the FIFA Regulations" |
| Article 18ter text and Circular 1464, dated December 2014 | Cardador Marín | Lex Sportiva, "FIFA's Regulatory Changes to TPO" |
| Pre-existing agreements could run to expiry but not be extended | Cardador Marín | Lex Sportiva |
| FIFA's stated reason: influence over team selection and recruitment, and club independence | BBC Sport | EA Sports Law, "Third Party Ownership" |
| Premier League banned it from the start of 2008-09 after the Tevez and Mascherano case | BBC Sport | FourFourTwo (Press Association), "On this day in 2008" |
| West Ham were fined a record sum for fielding them | BBC Sport | FourFourTwo (Press Association) |

**Cut for want of a second source:** the fine and settlement figures. Two sources put the Premier
League fine at 5.5 million pounds, but both readings came from search summaries rather than a
direct read of either page, and the Sheffield United settlement appeared at two different figures
in two different places. The entry says "a record sum" and names no number. If the founder wants
the figure in, it needs one clean read of the BBC report and one of the Press Association copy
first. **Also cut:** that third-party ownership was concentrated in South America and Portugal.
Widely believed, not sourced twice in this pass.

### A structural note on sourcing

The existing 60 entries carry no citations, and `glossaryEntries` has no `sources` field. Adding
one would change the shape for 60 records and render nowhere. Two options, founder's call:

1. **Keep sources in this document** and treat it as the audit trail. Cheapest, and matches how
   the 2026-07-28 cluster was handled.
2. **Put them in a block comment above each new entry**, the way the file already carries its
   cluster provenance in comments. Survives in the repo, costs nothing at build time, and the
   next person to touch an entry can see what it rests on.

Option 2 is the better one, and it is a three-line change to the file rather than a schema change.

---

## 3. Honest assessment

### Is 17 sessions enough to justify this?

**The case against, put properly.** Seventeen is not a sample. At that size the split between
channels is not stable, and a single crawler, one Reddit comment or one person hitting refresh
moves it. Twenty of the pageviews sit on three URLs, so the whole finding rests on three pages.
"100 per cent landed on content" is a fact about entry pages and nothing else: none of those
sessions is shown to have subscribed, shared, returned or read a second page. And the
counterfactual is untested. The 60 existing entries cost real hours, and the same hours on the
daily desks would also have produced something. Nobody has measured which is worth more.

**The case for.** Two things carry it. First, this is not new evidence. The file's own header
records a 1,360 per cent impressions rise on `/glossary/loan-with-obligation/` after the first
expansion, which is a second, independent observation pointing the same way and rests on a
different metric. Second, and more decisive, the marginal cost is close to zero. The generator,
the JSON-LD, the CSP hashes, the related-link validation and the sitemap rows all exist, and the
sitemap rows are **derived** from `glossaryEntries` rather than hand-listed
(`scripts/build-content.mjs`, `EXTRA_URLS`). Adding a term is one data-file edit and a build. The
real cost is the sourcing hour, not the engineering.

**Verdict: ship three to five, not fifteen.** Committing fifteen entries on the strength of 17
sessions is a bet dressed as a plan; three is cheap enough to be wrong about and enough to
measure. Set the review date and the metric now, before the pages go up, so the result cannot be
argued after the fact. The three drafted here are the batch.

### Realistic time to effect

There is no need to guess at this one, because the three ranking pages already answered it. All
three shipped in the 2026-07-28 cluster, and a 7-day window ending on the review date of
2026-08-13 covers roughly 6 to 13 August. Those pages went from publish to measurable
Google-sourced sessions in **under three weeks**. Every new URL enters `dist/sitemap.xml` on the
build that creates it, derived rather than hand-listed, so discovery needs no separate step.

Expect, for a new entry:

- **Days to a couple of weeks** to crawl and index, on the sitemap alone.
- **2 to 4 weeks** to first impressions worth reading.
- **3 to 6 months** before position settles. Early rankings bounce, and a page that looks strong
  in week three often is not.

**One correction worth making here, because it is easy to assume otherwise.**
`scripts/ping-indexnow.mjs` exists but is **not** in the build chain and is not called by
`package.json` or by any workflow. It is a manual command run after `npm run build`, and its own
header says it reaches Bing, Yandex, Seznam and Naver. Google does not take part in IndexNow. So
it neither runs automatically nor speeds up the channel this whole proposal is about. Run it by
all means, for the Bing and MSN side, but do not count it as Google discovery.

Which sets the review date: **first read at four weeks, decision at twelve.** Put both in the
calendar on the day the pages ship, because a fortnight is too early to read and nobody comes back
to an experiment nobody diarised.

### Editorial and rights risk

**The page family carries no imagery risk, and that is structural rather than lucky.**
`scripts/build-glossary-pages.mjs` emits no `img` tag at all, never imports `illustrated.mjs` and
never calls `entryArt()`. Every entry page falls back to the site-wide `/og.jpg` for its social
card. No proposed term can therefore breach the no crests, no kits, no photos, no FIFA marks line
through its own page, whatever the term is about. The risk appears only if someone later decides a
glossary entry needs art.

Two specific flags all the same:

- **Third-party ownership** names West Ham United, Sheffield United, Carlos Tevez and Javier
  Mascherano in prose. That is factual reporting of a documented and settled case, with no
  invented quotes, which `EDITOR_STANDARDS.md` permits. None of those clubs is in the three-club
  ARCHV badge set, which is irrelevant here for the reason above but would matter instantly if
  this entry were ever adapted into a card or an infogram. **Do not adapt it into one.**
- **Solidarity payments and third-party ownership both name FIFA repeatedly.** Naming the
  organisation in prose is not the same as using its marks, and the house rule bans logos and
  trademark kits, not the word. Worth stating because the same distinction has been tested before.

Nothing in the other twelve candidates touches the rights lines. The four NFL terms are league
administration, and the entries carry no club names at all.

### One thing in the brief I would push back on

The instruction to weight toward transfer mechanics and NFL terms is right about the outcome and
wrong about the reason, and the difference changes the list. Ranked by sport, "NFL salary cap"
belongs near the top, since it is almost certainly the most-searched term here. Ranked by whether
anyone else has already answered the query well, it is the one term on this page the site will not
win, because Over The Cap and Spotrac are the established answers. It sits fifteenth, and if it is
ever built it should be built as the hub the other NFL entries link back to rather than as a
traffic play.

---

## 4. If approved: what actually changes

For the record, and so nobody has to work it out later.

1. Three objects appended to `glossaryEntries` in `scripts/glossary-data.mjs`, in the NFL and
   transfer-mechanics clusters respectively, with a provenance comment in the style the file
   already uses.
2. The file's header comment says "the sixty evergreen glossary entries". It would need the
   number changed.
3. Nothing else. Sitemap rows, hub cards, JSON-LD, breadcrumbs and CSP all follow automatically.
4. Optional, one line each, and worth doing: point `dead-cap`'s `related` at `void-years`, and
   `agent-fees`' at `third-party-ownership`, so the pages that already rank pass some of it on.
   `agent-fees` is the strongest page on the site by this measure, and it currently links only to
   `dual-representation`, `signing-on-fee` and `tapping-up`.
5. Also optional: `scripts/build-content.mjs` carries a `GLOSSARY_LINKS` map that puts hand-picked
   glossary links on long reads. `how-transfer-fees-are-actually-paid` currently points at
   `structured-payments`, `amortisation` and `sell-on-clause`. `solidarity-payments` belongs in
   that group.

And the rule that holds regardless: content changes go to `main` through the API, code changes go
through `preview`. This file is neither until it is approved.
