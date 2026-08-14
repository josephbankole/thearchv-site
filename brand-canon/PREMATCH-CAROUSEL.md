# The pre-match carousel (@thearchvfc, D-2026-08-14b)

Founder-commissioned 2026-08-14. On the EVE of every Premier League and Champions League
matchday, the nightly desk builds a pre-match carousel covering the top four fixtures of
that matchday, queued for 08:00 on the matchday itself. On those eves this carousel IS the
Phase 5 unit (subject override); account caps and slot counts do not change.

## Fixture selection

Four fixtures, ranked by editorial weight: title and top-four stakes, derbies and
rivalries, European qualification and relegation consequence, story heat. Two overrides
that never bend: **Manchester United's fixture is always in when they play, and Arsenal's
fixture is always in when they play.** A matchday with fewer than four fixtures runs with
what exists. The desk reads the fixture list LIVE on the eve; no fixture, date or kick-off
time is ever written from memory (the never-guess-the-fixture rule applies in full).

## The slide menu

Eight to ten slides, composed from this menu, all in the D-2026-08-14a design system
(claim-led title card, Archivo Black claims, Marcellus bold numbers, pair from
brand-colors.json roles, one pair for the whole set):

1. **Title card.** Claim-led, matchday framing, payoff withheld. Never a fixture list as
   the opener; the fixtures are the payoff of the set.
2. **One card per fixture** (four cards): kick-off, the story in one contestable line,
   one stat with its number carried in Marcellus, one pulled quote where a strong one
   exists.
3. **Quotes slide.** The best pre-match press-conference lines of the matchday. Every
   quote verified to a named outlet with a date, quoted exactly, attributed on the slide.
   No quote survives that cannot be traced to a primary or named-outlet source THIS week.
4. **Stats and stories slide.** One or two withheld-number stats from live research.
   Two-source verification on every number, per the standing rule.
5. **The both-clubs slide.** The archive signature: notable players who played for BOTH
   clubs in one chosen fixture of the set (the marquee tie unless another fixture has the
   better list). Three to six names, era-tagged, verified. This slide is where the
   archive brand earns the carousel.
6. **CTA plate.** Pair 1 identity plate, CTA drawn from the seasonal rotation
   (D-2026-08-14b ratios once the season starts).

**REMOVED by founder QC, D-2026-08-14d: the trending-questions slide.** Trend research
(vidiq keyword and trending tools while the Boost lasts, check `vidiq_balance` live,
never purchase credits) still feeds the caption's search line and the story selection;
it no longer gets a slide of its own.

## Per-slide assets and the trio (D-2026-08-14d)

- **Every slide carries an illustrated headshot and/or an ARCHV club disc.** Banked
  faces first (`assets/headshots`, the site's `public/media/illustrated/head-*`), and a
  missing face is generated to the headshot guidelines and banked, per canon §1 rule 4.
  Club marks are ALWAYS the ARCHV typographic discs (`badge-*.png`), never a real crest;
  a missing disc is generated from the badge pipeline before the build ships.
- **The set renders in one TRIO**: pair dark ground, pair light type, and the pair's own
  third color (`brand-colors.json` `third` field) on every number, every source or
  reference line, and every quoted name or attribution.

## Sourcing gates, unchanged and total

Live research on the eve: press conferences, injury news, form stats, trends. Every
factual claim two-source verified; every quote exact, attributed and dated; no invented
trends. The full prose pipeline applies: humanizer + house voice, detector pass,
watermark strip last. Captions follow the four-line SEO format in `REEL-CARD-BANK.md`
with full entity names, the competition and the date in line one.

## CTA rotation (seasonal, same decision)

From the first Premier League matchday of 2026-27 (the desk verifies the date live;
until then the FOLLOW-only caption rule D-2026-08-09c stays), @thearchvfc Instagram
captions rotate CTAs at these ratios, held over a rolling twenty units and logged per
unit:

- **50% FOLLOW** (the anchor, unchanged wording rules)
- **40% GET THE APP** (variant 9: the App Store search instruction, the one sanctioned
  exception to the one-destination rule)
- **5% SHOP THE ETSY STORE** (no URL in caption; the link rides the first comment or
  bio per the first-comment doctrine)
- **5% SUBSCRIBE TO THE DISPATCH** (thearchvdispatch.substack.com; on these units the
  Dispatch line IS the caption CTA, which supersedes the never-the-lead rule for
  exactly these units and nowhere else)

Guards: never two identical non-follow CTAs on consecutive units; the ratio is held
over the window, not forced per day; the CTA type is logged in the performance log per
unit so the window is auditable. Scope is @thearchvfc Instagram only; TikTok and
@thearchv.ca keep their existing caption rules.
