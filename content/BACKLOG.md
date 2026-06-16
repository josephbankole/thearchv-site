# Content backlog — thearchv.ca SEO engine

The recurring SEO agent picks the next `todo` item, drafts it (Markdown + frontmatter + sources cited inline + `[FOUNDER: your take]` left blank), and hands it over for verify + insight. Mark `drafted` when handed over, `live` once deployed. Never skip verification.

Status key: todo / drafted / live

## C2 — World Cup finals cluster (art exists for all 9)
- [live] finals/mexico-1970 — Brazil 4-1 Italy, 1970 (SAMPLE, Phase 0)
- [live] finals/azteca-1986 — Argentina 3-2 West Germany, 1986
- [drafted] finals/italia-1990 — West Germany 1-0 Argentina, 1990 (hand-built 2026-06-15)
- [drafted] finals/paris-1998 — France 3-0 Brazil, 1998 (hand-built 2026-06-15)
- [drafted] finals/yokohama-2002 — Brazil 2-0 Germany, 2002 (hand-built 2026-06-15)
- [drafted] finals/berlin-2006 — Italy 1-1 France (Italy on pens), 2006 (hand-built 2026-06-15)
- [drafted] finals/johannesburg-2010 — Spain 1-0 Netherlands, 2010 (hand-built 2026-06-15)
- [drafted] finals/maracana-2014 — Germany 1-0 Argentina, 2014 (hand-built 2026-06-15)
- [drafted] finals/lusail-2022 — Argentina 3-3 France (Argentina on pens), 2022 (hand-built 2026-06-15)

## C3 — ARCHV explainers (history-angled; start with 6)
- [todo] explainers/false-9-hidegkuti-to-messi — the false 9, from Hidegkuti to Messi
- [todo] explainers/world-cup-final-formations — every World Cup final formation, explained
- [todo] explainers/what-xg-really-measures — what xG really measures (and what it doesn't)
- [todo] explainers/offside-rule-history — the offside rule, and why it keeps changing
- [todo] explainers/catenaccio-to-gegenpressing — catenaccio to gegenpressing: 70 years of defending
- [todo] explainers/why-var-takes-so-long — why a VAR check takes so long

## C4 — Man United history cluster (Transfer Desk links into these; start with 5)
- [drafted] united/treble-1999 — the 1999 treble, how it was built (hand-built 2026-06-15)
- [drafted] united/fergie-greatest-xi — Ferguson's greatest XI, debated (hand-built 2026-06-15)
- [drafted] united/united-record-signings — every United transfer record, 1962 to now (hand-built 2026-06-15)
- [drafted] united/class-of-92 — the Class of '92, and why it can't be repeated (hand-built 2026-06-15)
- [drafted] united/united-european-nights — United's great European nights (hand-built 2026-06-15)

## Verify-first reminder
Every fact = 2 reputable sources (ESPN/BBC/FIFA/official/Romano), cited inline in the draft for the founder to check. D50 on all art. Humanize all prose. Agent never deploys.

## Publish checklist (agent: every finals page)
When drafting a finals page, also add a crawlable homepage link: insert `<li><a href="/finals/<slug>/">Page title</a></li>` into the `archive__reads-list` block in index.html (the static "Read the finals, in full" list). The deploy publishes the new page and the homepage link together. Same idea for explainers/United later once those hubs exist.

## C5 — World Cup evergreen cluster (D92, ride the live window with durable pages, NOT fixtures)
Peg to live storylines via /Users/josephbankole/Claude/fifa.archv/wc2026-storyline-tracker.md. Illustrated, verify-first, 2,250-3,000 words. These re-spike every 4 years.
- [drafted] explainers/biggest-world-cup-upsets — the upsets canon (hand-built 2026-06-16, homepage-linked)
- [todo] explainers/most-world-cup-titles — every winner
- [todo] explainers/world-cup-hosts-history — hosts + 2026 three-nation first
- [todo] explainers/usa-at-the-world-cup — host-nation history (tier-1)
- [todo] explainers/canada-at-the-world-cup — host-nation history (home market)
- [todo] explainers/oldest-world-cup-goalscorers — links the Milla legend page

## SEQUENCING (D92) — priority order for the agent
1. NOW–Jul 19: WC evergreen cluster (C5) + storyline-pegged pages (ride the live window).
2. Late Jul–Aug: go DEEP on the United pillar (C4) before the summer transfer window peak. United-deep-before-broad.
3. Sept+: broaden football-history (C2/C3) + interlink for authority.
Cap ~3-5 durable long-forms/week. Every page: byline + sourcing note + watermark; link it from the homepage + relevant hub.

## PIPELINE TRIGGERS (agent: watch in the weekly scorecard)
- **Ezoic:** turn on as soon as there is any meaningful organic traffic (no traffic minimum). Founder action; agent flags when GSC shows real clicks landing.
- **Email / owned audience (LIVE, D93):** The ARCHV Dispatch is live on Substack (thearchvdispatch.substack.com) as a weekly digest. The site carries a subscribe CTA; the `archv-dispatch-weekly` task drafts each issue. Keep linking site long-forms <-> Dispatch issues.
- **Raptive milestone:** the headline KPI is **25,000 pageviews/month** (+50%+ tier-1). When PostHog approaches it, flag the switch from Ezoic to Raptive.
