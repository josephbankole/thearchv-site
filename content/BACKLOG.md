# Content backlog — thearchv.ca SEO engine

The recurring SEO agent picks the next `todo` item, drafts it (Markdown + frontmatter + sources cited inline + `[FOUNDER: your take]` left blank), and hands it over for verify + insight. Mark `drafted` when handed over, `live` once deployed. Never skip verification.

Status key: todo / drafted / live

## C2 — World Cup finals cluster (art exists for all 9)
- [live] finals/mexico-1970 — Brazil 4-1 Italy, 1970 (SAMPLE, Phase 0)
- [live] finals/azteca-1986 — Argentina 3-2 West Germany, 1986
- [todo] finals/italia-1990 — West Germany 1-0 Argentina, 1990
- [todo] finals/paris-1998 — France 3-0 Brazil, 1998
- [todo] finals/yokohama-2002 — Brazil 2-0 Germany, 2002
- [todo] finals/berlin-2006 — Italy 1-1 France (Italy on pens), 2006
- [todo] finals/johannesburg-2010 — Spain 1-0 Netherlands, 2010
- [todo] finals/maracana-2014 — Germany 1-0 Argentina, 2014
- [todo] finals/lusail-2022 — Argentina 3-3 France (Argentina on pens), 2022

## C3 — ARCHV explainers (history-angled; start with 6)
- [todo] explainers/false-9-hidegkuti-to-messi — the false 9, from Hidegkuti to Messi
- [todo] explainers/world-cup-final-formations — every World Cup final formation, explained
- [todo] explainers/what-xg-really-measures — what xG really measures (and what it doesn't)
- [todo] explainers/offside-rule-history — the offside rule, and why it keeps changing
- [todo] explainers/catenaccio-to-gegenpressing — catenaccio to gegenpressing: 70 years of defending
- [todo] explainers/why-var-takes-so-long — why a VAR check takes so long

## C4 — Man United history cluster (Transfer Desk links into these; start with 5)
- [todo] united/treble-1999 — the 1999 treble, how it was built
- [todo] united/fergie-greatest-xi — Ferguson's greatest XI, debated
- [todo] united/united-record-signings — every United transfer record, 1962 to now
- [todo] united/class-of-92 — the Class of '92, and why it can't be repeated
- [todo] united/united-european-nights — United's great European nights

## Verify-first reminder
Every fact = 2 reputable sources (ESPN/BBC/FIFA/official/Romano), cited inline in the draft for the founder to check. D50 on all art. Humanize all prose. Agent never deploys.

## Publish checklist (agent: every finals page)
When drafting a finals page, also add a crawlable homepage link: insert `<li><a href="/finals/<slug>/">Page title</a></li>` into the `archive__reads-list` block in index.html (the static "Read the finals, in full" list). The deploy publishes the new page and the homepage link together. Same idea for explainers/United later once those hubs exist.
