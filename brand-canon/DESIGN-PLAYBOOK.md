# ARCHV design playbook

Built 2026-08-14 from the founder's Graphic Design Kick Starter Pack (Craftane, 30 pages
across three PDFs), the 13 August performance findings, and the founder's same-night type
and color decisions. This document is the craft layer that sits ON TOP of the reel system:
`REEL-CARD-BANK.md` decides what a card says, this decides how it looks. Neither replaces
canon: `CANONICAL-CONTEXT.md` and D-2026-08-09b win any conflict.

## The type system (founder-ratified 2026-08-14)

Two faces, both always heavy. Files in `brand/fonts/`, all SIL Open Font License,
free for commercial use.

- **Archivo Black**: every claim and headline, anything that has to stop a thumb.
  It is the Machine-genre block the founder wanted, at $0.
- **Marcellus, set bold (weight 700)**: ALL NUMBERS, locked by the founder 2026-08-14,
  plus context lines, sub lines and cover standfirsts. Its old-style figures are the
  most archival mark in the system, so the payoff number is where the heritage voice
  lives. Marcellus ships one weight, so the bold is browser-synthesised; if a true bold
  ever matters at poster size, Cinzel Bold (also installed) is the real-bold cousin.
- Small utility lines (source lines, handles) stay Helvetica Neue with wide tracking.
- The wordmark never changes. It is the identity, not part of this system.

**The type scale (founder cheat sheet, 2026-08-14), for 1080x1350 and 1080x1080 social
units:** title 150px (shrink-to-fit downward, never up), sub-heading 95px, large text
60px, medium text 48px, small text 36px, captions and kickers 27px. The scale exists
because feed type is read on phones at a third of desktop size, so mobile sizes run
roughly three times what desktop habits suggest. Templates enforce the title tier via
shrink-to-fit; everything else picks from these bands rather than inventing sizes.

If the founder later buys ITC Machine and Albertus Nova from Monotype, they slot into the
same two roles with a one-line template change.

## Color: the United read

The rotation was reset by the founder on 2026-08-14 (D-2026-08-14a) after a full
card-rendered audit of all eight legacy pairs. Final state, and `brand-colors.json`
roles are the authority: **pairs 9 and 10 below are MAIN and lead every rotation;
pairs 4 to 7 (Atlantic/Ice, Claret/Chalk, Midnight/Lilac, Royal/Paper) rotate behind
them; pairs 2, 3 and 8 are RETIRED; pair 1 (navy/orange) stays the identity anchor.**
This system governs every social post on every brand the founder runs: the ARCHV
family, @archv_ai, and the personal josephbankole surfaces. The white news site, the
iOS app, and the YouTube documentary identity keep their own ratified looks.
The two main pairs, born of the founder's read that the audience is mostly
Manchester United fans:

| Pair | Dark | Light | Contrast | Note |
|---|---|---|---|---|
| Old Trafford Red / Cream | #8B1A1F | #F2EAD3 | 7.72 | deep match-programme red, not the bright shirt red (#DA291C only reaches 4.05 on cream, fails body text) |
| Archive Navy / Cream | #1E223D | #F2EAD3 | 12.94 | the anchor navy with the legacy cream instead of orange |

The cream is #F2EAD3, the brand's original legacy cream, which ties the new pairs to the
identity that already exists.

**Trios (D-2026-08-14d).** Every pair carries its own eye-catching third color, and ALL
numbers, references/source lines and quoted names/attributions render in it (the third
never carries claims or body text). The `third` field in `brand-colors.json` is the
authority; every third clears 4.5:1 on its dark ground: pair 1 Amber Gold #FFC53D, 4
Sunset Coral #FFA576, 5 Claret Amber #FFAD4D, 6 Electric Magenta #FF6EC7, 7 Royal Mint
#63E6BE, 9 Matchday Yellow #FFD85F, 10 Signal Orange Bright #FA6A3C. On red or cream grounds the accent rule renders in cream or
red respectively; signal orange stays exclusive to the navy anchor pair. Both proposed
pairs render in the v2 templates now; they enter the daily rotation only when the founder
says so, at which point `brand-colors.json` flips their role from "proposed" to
"rotation".

The founder's five named pairings from his own notes (dirty white + masterpiece red,
imperial blue + white convolvulus, natural indigo + odious orange + orange peach, roman
empire red + stellar explorer + heaven gates, liberty blue + light blue frost +
psychedelic aqua) appear NOWHERE in the Kick Starter Pack and in no public color
database we could find. Interpreted hexes with passing contrast live in the session log,
but they stay off canon until the founder shares the source so the real values can be
read. Same for the six font pairings he listed: absent from the pack, source unknown.

## The ten working rules (distilled from the pack, mapped to our surfaces)

1. **Hierarchy by size first** (Typography 101 p9). One element three times larger than
   everything else. On cards that is the claim or the number, never both.
   Voice note, founder 2026-08-14: sub lines INVITE rather than command. "Let's count
   them", "Take a guess before the last card", never a bare imperative. The card asks
   the viewer in; first-person plural is the house's fan-to-fan register.
2. **One dominant color, everything else accents** (Color Theory 101 p5-6). The pair
   system enforces this; do not add a third color to a card.
3. **Complementary contrast is the scroll-stopper** (Color Theory 101 p4). Navy/orange
   already is one. Red/cream works because the cream is warm and the red deep.
4. **Leave one region genuinely empty** (Design theory 101 p6). The v2 cards hold the
   middle third empty on claim cards. Do not fill it.
5. **Contrast on two axes minimum** (Design theory 101 p8). Archivo Black against
   Marcellus gives thick/thin; the pair gives light/dark. That is the system.
6. **Repetition makes the feed read as one brand** (Design theory 101 p9). Same
   templates, same margins, same lockup position on every unit, every day.
7. **One shared left margin** (Design theory 101 p4). Everything snaps to x=86 on
   1080-wide cards. The only centred elements are the lockup and payoff cards' rule.
8. **Break headlines by hand** (Typography 101 p7). No widows: never one word alone on
   the last line of a claim. Kern by eye around A, W, V and T at display size.
9. **Leading floor** (Typography 101 p9). Display lines at 1.05 to 1.1, context lines at
   1.2 to 1.3, never tighter.
10. **RGB always** (Color Theory 101 p3). Every export in this operation is screen-bound.

## Slide copy doctrine (founder QC + trend study, 14 Aug evening)

Studied against the top-performing sports content on Instagram (433, B/R Football, Goal
and the stats-page genre, all pulled live with performance signals). The findings were
uniform: on-image copy caps at EIGHT words on the biggest pages, stats land as bare
label-and-number stacks rather than sentences, and the tone nudges rather than judges.
The budgets, now binding on every carousel slide:

- **Claim or title: 8 words maximum, 5-7 the target.** One idea. If it needs a second
  sentence it is two slides or it is cut.
- **Story or sub line: 12 words maximum.** Conversational, the way a fan says it at the
  pub, not the way an analyst files it.
- **Stats: label and number, no prose.** "Goals: Thauvin 11, Dembele 10" beats a
  sentence every time it was measured. The big number stays in Marcellus in the third.
- **List rows: 4 words maximum.** A ranked list may withhold its metric entirely; the
  order is the payload and the number is the reason to keep swiping.
- **CTA plate: one claim within budget plus one line.**
- **The ONE dense frame allowed is the breaking-news card**: four strict type tiers
  (banner, kicker, headline, context), reserved for genuine breaking news, never for a
  daily unit.
- **Tone: soft hands.** Flat declaratives over verdicts, questions with a finite answer
  set, nudge situations rather than judging people, second person sparingly. No emoji
  on slides; the premium register does with word choice what meme pages do with 🤣.
- Captions stay on the four-line SEO doctrine and may run longer than the slides; the
  research confirms captions lengthen only to ask or to quote.

**Amended 2026-08-24 from the evidence-verified hook review.** Substance rules join the
budgets above; the budgets themselves are unchanged:

- **Every middle slide is complete.** One screenshot-able fact per middle slide,
  finished inside the slide, earning a save on its own. No mid-sentence endings; the
  SWIPE cue stays as the momentum device between slides. [research: curiosity-chain]
- **Build for dwell, sends and saves.** That is the ranking currency. Dense, readable
  slides people sit with, and one stat card per unit designed to be forwarded to a
  group chat. [research: algo-baseline]
- **One verdict-carrying slide per @thearchvfc carousel, labelled as the desk's read**
  (the 23 Aug YouTube community post is the internal model). A stat recital without an
  argument does not qualify as a unit. [audit: shipped-output HIGH; canon D-2026-07-27d]
- **@thearchv.ca substance floor (founder ruling R7, 2026-08-24).** Every unit carries
  an archive pull or a desk verdict; a schedule explainer alone no longer qualifies.
  [audit: shipped-output HIGH]

## How this joins the reel system

The card bank decides the words: claim-led first card, number withheld to the payoff,
22 to 25 second cap, four-line SEO caption, two-source verification. This playbook
decides the look: Archivo Black claim over the scrim, Marcellus bold context under the
rule, one pair per reel logged like any rotation pair. The pack's own strongest claim
(Color Theory 101 p2: the like-or-dislike verdict lands in under 90 seconds and rides
mostly on color) is the design-side reason the account's claim-led sub-30-second cuts
win: the card is judged before it is read. Design and retention strategy are one
pipeline, not two.

## Surface specs

- **Reel cards**: v2 templates in `brand/reel-first-frame/` (`*-v2.html`), parameterised
  for text and pair. Claim card, payoff card, footage overlay.
- **Covers and thumbnails**: Marcellus bold masthead, Archivo Black title line, one
  dominant color, subject face or illustrated portrait large, one empty region. Build on
  request from the same tokens.
- **Carousels**: title slide uses the claim-card layout exactly; body slides drop to
  56px Archivo Black headers with Marcellus 34px body; the set shares one pair per day.

## What the pack does not cover

The pack is print-era general craft. It contains nothing on 9:16, safe zones, feed
behaviour, or thumbnail-scale legibility. Those rules come from the operation's own
data and stay where they live: the reel findings in `REEL-CARD-BANK.md`, the frame-one
legibility rule in canon (D-2026-08-04c), and Instagram's UI safe margins in the
templates themselves.
