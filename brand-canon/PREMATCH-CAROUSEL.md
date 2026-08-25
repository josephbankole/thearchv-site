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

**Amended 2026-08-24 from the evidence-verified hook review.** The menu stands; these
rules bind how it is used:

- **The title card names its subject.** Claim-led and payoff-withheld as before, and
  the claim carries the who in full with enough context to be understood on its own.
  Withholding the fixtures and the numbers stays; withholding the subject is banned
  (Meta's demoted-clickbait definition covers zero-context teases, and the
  8,977-experiment Scientific Reports meta-analysis found moderate concreteness beats
  maximum vagueness). [research: naked-hook]
- **Slide 2 stands alone as a hook.** Instagram re-serves an unswiped carousel to the
  same viewer starting at slide 2 (Mosseri, Oct 2024, verbatim verified), so the first
  fixture card must open the set cold for a viewer who never saw the title card. Never
  a mid-list continuation, never the answer to the title card's tease. [research:
  closure-kills-retention, algo-baseline]
- **Every middle slide lands one complete, screenshot-able fact** that earns a save on
  its own. No mid-sentence endings; the SWIPE cue carries the momentum. [research:
  curiosity-chain]
- **One slide carries the desk's read, labelled as such.** A verdict on the matchday,
  not a stat recital. [audit: shipped-output HIGH; canon D-2026-07-27d]
- **This lane is the sanctioned home of the withheld-number hook.** Pre-match numbers
  are genuinely unknown to the viewer, which is what keeps the tease honest here. The
  same construction never runs on a settled result. [audit: shipped-output HIGH]
- **Eight to ten slides stays the spec (founder ruling R5, 2026-08-24), and the count
  is now measured rather than believed.** The 8-10 optimum rests on 2020 data, so the
  per-unit performance-log row records the slide count alongside the CTA type, read
  against saves. Four slides stays the standard everywhere else per D-2026-08-04l.

## Per-slide assets and the trio (D-2026-08-14d)

- **Discs and faces where the subject calls for them, never as chrome (founder QC,
  14 Aug).** Fixture cards carry their clubs' discs; player slides carry the banked face
  (bank-first, per canon §1 rule 4), which REPLACES the disc on that slide; a duel slide
  carries both players' banked heads as a side-by-side circular pair in the disc slot
  (D-2026-08-14e); the title card and CTA plate may run clean. One mark
  per slide at most, aligned top-right at the margin. Club marks are ALWAYS the ARCHV
  typographic discs (`badge-*.png`), never a real crest; a missing disc is generated from
  the badge pipeline before the build ships.
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
