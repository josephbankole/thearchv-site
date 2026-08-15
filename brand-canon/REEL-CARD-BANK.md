# Reel card bank: first/last pairs + caption format

Built 2026-08-13 for the founder's native reel lane (D-2026-08-13b). The account's own
numbers picked the shape: stat-driven highlight cuts with a claim-led first card win
(top three reels 1,578 to 2,177 plays, all under 30 seconds), long explainers lose
(bottom three 239 to 293 plays, all over 30). The bank turns that into a repeatable
build: the FIRST card makes a claim and withholds the number, the highlights carry the
middle, the LAST card lands the number. The answer never appears before the last card.
That is REEL-ARC's open-loop rule applied to the phone lane.

## Templates (render-ready)

In `brand/reel-first-frame/`:

- `first-frame-blank.png`: opaque claim card, type your line above the orange rule
- `first-frame-example.png`: the same card with a worked claim, for reference
- `first-frame-overlay.png`: transparent: navy scrim + rule + wordmark, lays over footage
- `last-frame-blank.png`: payoff card, big number top left, context line under the rule
- `last-frame-example.png`: worked payoff (Alexis Sanchez, 5 in 45)

Colours are pair 1 from `brand-colors.json` (#1E223D / #F54F1B, canon D-2026-08-09b),
wordmark from `brand/archv-wordmark-white.svg`. The HTML sources sit next to the PNGs;
re-render at 1080x1920 if a size ever changes.

## Build rules (non-negotiable)

1. Total runtime 15 to 25 seconds. Treat 30 as a failed edit.
2. First card holds 1.5 to 2 seconds and is readable at a glance. Claim above the rule.
3. The number appears nowhere until the last card. No box in the middle may state it.
4. Last card holds 2 to 2.5 seconds. Number, context line, source when contested.
5. Every number passes the two-source check before it ships. If a joke needs a wrong
   fact, cut the joke.
6. Verdicts land on performances, decisions, and institutions. Never on a person's
   character. The Bruno pair below is about a penalty record, not about Bruno.
7. Do not run two pairs with the same construction back to back on the account. Vary
   the entry across any week of posts.
8. Sub lines invite the viewer in rather than command (founder, 2026-08-14). "Let's
   count them", "Take a guess", "Watch the last card". First-person plural is welcome;
   a bare imperative is not.

## The ten pairs

Placeholders in brackets. Full entity names always, British English, headlines
period-terminated.

**1. The problem.**
First: `[FULL NAME] HAS A [THING] PROBLEM.` / sub: `The number is worse than you think.`
Last: `[N]` / `[Stat description] for [club].` / `[competition, span]`
Use for: a bad recurring stat. Misses, droughts, errors leading to goals.

**2. The receipts.**
First: `[FULL NAME] IS ALREADY [BIG CLAIM].` / sub: `The receipts are on the last card.`
Last: `[N]` / `[stat] in his first [X] games.`
Use for: hot starts and premature superlatives. This is the Andrey Santos shape.

**3. Rarer than you remember.**
First: `[EVENT] WAS RARER THAN YOU REMEMBER.` / sub: `Take a guess before the last card.`
Last: `[N]` / `[what the number counts].`
Use for: nostalgia stats. This is the Alexis Sanchez shape.

**4. Everyone is wrong.**
First: `EVERYONE IS WRONG ABOUT [FULL NAME]'S [STAT].` / sub: `The real figure is on the last card.`
Last: `[N]` / context / source named on the card.
Use for: stats the fanbase misremembers. Source line is mandatory on this one.

**5. The question.**
First: `HOW MANY [STAT] HAS [FULL NAME] ACTUALLY [VERB]?` / sub: `Let's count them.`
Last: `[N]` / context.
Use for: search-aligned questions. Mirror the caption's first line and this pair does
double duty in answer engines.

**6. Again.**
First: `[FULL NAME] DID IT AGAIN.` / sub: `How many is that now?`
Last: `[N]` / `[what], [span].`
Use for: streaks and repeat events, good or bad. This is the Bruno penalty shape, and
it is the account's best performer to date.

**7. Since.**
First: `NO [CLUB] PLAYER HAD DONE THIS SINCE [YEAR].` / sub: `[FULL NAME] just did.`
Last: `[N] YEARS` / `[the feat, then and now].`
Use for: record-adjacent feats where the gap itself is the number.

**8. The comparison.**
First: `[NAME A] OR [NAME B]. THE NUMBERS PICK ONE.` / sub: `It is not close.`
Last: big number for the winner, both figures in the context line.
Use for: debate bait between two players. Keep it to performances, not worth as people.

**9. The institution.**
First: `[COMPETITION / BODY] HAS A [THING] PROBLEM.` / sub: `One number proves it.`
Last: `[N]` / context / source named on the card.
Use for: the governance lane. PSR, fixture pile-ups, ticket prices, registration rules.
This is where the sharp verdicts belong.

**10. The prediction receipt.**
First: `IN [MONTH YEAR] EVERYONE SAID [CLAIM].` / sub: `Here is what actually happened.`
Last: `[N]` / `[the outcome].`
Use for: archive receipts on aged takes. The archive brand owns this pair; nobody else
can run it with a straight face.

## Caption format (SEO, no hashtags)

Four lines. No hashtags anywhere, per canon D-2026-07-28f. The caption may state the
number because it sits collapsed behind "more" and search needs it; the on-screen cards
still withhold it.

```
Line 1  THE SEARCH LINE. One plain sentence naming who, what, opponent,
        competition, and date or season. Full entity names, no nicknames.
        Question form is allowed and often better.
Line 2  THE FACT BLOCK. The number and its context in one or two sentences,
        source named when the stat is contested.
Line 3  THE FORK. The question a fan would actually type or argue about.
Line 4  THE FOLLOW LINE. Follow @thearchvfc for daily verified Manchester
        United coverage.
```

**Worked example A (statement form, the Bruno reel):**

> Bruno Fernandes missed a penalty for Manchester United in the pre-season shootout
> against Leeds United at Croke Park in August 2026.
> United still won the shootout 5-4 after a 1-1 draw.
> Would you keep him on penalties?
> Follow @thearchvfc for daily verified Manchester United coverage.

**Worked example B (question form, the Sanchez reel):**

> How many goals did Alexis Sanchez score for Manchester United?
> Five, in 45 appearances across all competitions between 2018 and 2019. One goal
> every nine games.
> Was he the worst signing of United's decade?
> Follow @thearchvfc for daily verified Manchester United coverage.

The question-form first line is the one the account's own winning captions already use,
and it is what a person types into search or asks an answer engine. When in doubt, ask
the question.

## First builds from the existing bank

Ten recuts from footage already in `fifa.archv/`, matched to pairs. These clips shipped
to YouTube and LinkedIn in June but have never run on Instagram in the card format, so
they are recuts, not reruns. Instagram gets the SILENT cut every time; the founder adds
music in-app (the _music files are for YouTube and LinkedIn only). Every number below
carries the two-source check before it ships, and the ones marked VERIFY have sources
that disagree or details worth pinning down first.

**1. `short_bayern-united-1999_fc.mp4`: pair 5, the question.** United core, start here.
First: `HOW LONG DID MANCHESTER UNITED NEED TO WIN THE 1999 FINAL?` / `Count the seconds.`
Last: `102 SECONDS` / `From Teddy Sheringham's equaliser to Ole Gunnar Solskjaer's winner. Camp Nou, 26 May 1999.` VERIFY the seconds figure.
Caption line 1: "How long did Manchester United take to score twice against Bayern Munich in the 1999 Champions League final?"

**2. `short_ronaldinho-never-happened_fc.mp4`: pair 10, the prediction receipt.** United core.
First: `IN 2003 MANCHESTER UNITED NEARLY SIGNED RONALDINHO.` / `Here is what actually happened.`
Last: `2005` / `The year the player who chose Barcelona won the Ballon d'Or.` VERIFY the deal reporting; lead only on what a named source printed.
Caption line 1: "Did Manchester United almost sign Ronaldinho before he joined Barcelona in 2003?"

**3. `short_van-persie-2014.mp4`: pair 10.** United-adjacent, he was a United player that summer.
First: `SPAIN ARRIVED AT THE 2014 WORLD CUP AS CHAMPIONS.` / `Ninety minutes later.`
Last: `5-1` / `Netherlands 5 Spain 1. Salvador, 13 June 2014.`
Caption line 1: "What happened when the Netherlands beat Spain 5-1 at the 2014 World Cup?"

**4. `short_lampard-2010.mp4`: pair 9, the institution.**
First: `FIFA HAD A TECHNOLOGY PROBLEM.` / `One number proves it.`
Last: `4 YEARS` / `From Frank Lampard's ghost goal in Bloemfontein to goal-line technology at a World Cup.` VERIFY the gap framing (2010 to 2014).
Caption line 1: "Why was Frank Lampard's goal against Germany at the 2010 World Cup not given?"

**5. `short_batista-56sec-1986.mp4`: pair 5.**
First: `HOW FAST WAS THE FASTEST RED CARD IN WORLD CUP HISTORY?` / `Count them.`
Last: `56 SECONDS` / `Jose Batista, Uruguay against Scotland, 1986.`
Caption line 1: "What is the fastest red card in World Cup history?"

**6. `short_saudi-argentina-2022_fc.mp4`: pair 1, the problem, team edition.**
First: `ARGENTINA HAD FORGOTTEN HOW TO LOSE.` / `Then came Lusail.`
Last: `36` / `The unbeaten run Saudi Arabia ended on 22 November 2022.` VERIFY the run count.
Caption line 1: "How long was Argentina's unbeaten run before Saudi Arabia beat them at the 2022 World Cup?"

**7. `short_germany-austria-1982_fc.mp4`: pair 9.**
First: `SIMULTANEOUS KICK-OFFS EXIST BECAUSE OF ONE MATCH.` / `Gijon, 1982.`
Last: `1-0` / `The result that made FIFA play final group games at the same time.`
Caption line 1: "Why are the final World Cup group games played at the same time?"

**8. `short_denmark-1992_v2.mp4`: pair 10.**
First: `DENMARK DID NOT QUALIFY FOR EURO 1992.` / `They played it anyway.`
Last: `CHAMPIONS.` / `Invited after Yugoslavia's expulsion. Winners, 26 June 1992.`
Caption line 1: "How did Denmark win Euro 1992 without qualifying for the tournament?"

**9. `short_baggio-1994.mp4`: pair 10, played straight.** Low Clarkson, this one is earned sincerity.
First: `IN JULY 1994 ROBERTO BAGGIO WAS THE BEST PLAYER ALIVE.` / `One kick changed how he is remembered.`
Last: `5` / `Baggio goals in the 1994 knockout rounds before the final.` VERIFY the split.
Caption line 1: "How many goals did Roberto Baggio score at the 1994 World Cup before the final?"

**10. `short_zambia-2012.mp4`: pair 7, memorial register.** Hard-news dials: no joke anywhere
in the cut, and drop the follow line from this caption.
First: `ZAMBIA WON THE 2012 FINAL IN LIBREVILLE.` / `Look where the final was played.`
Last: `19 YEARS` / `After the 1993 crash off Libreville, Zambia lifted the trophy in the same city.` VERIFY details against the register row.
Caption line 1: "Why was Zambia winning the 2012 Africa Cup of Nations in Libreville so significant?"

**Also sitting there ready:** the 13 `statreel_*` cuts (Bruno, Rashford, Saka, Keane,
Fernandes race among them) are already stat-led and recut cleanly into the pair format,
United ones first. `short_maracanazo` works as pair 5 on the attendance figure, but the
official and paid attendance numbers differ by source, so it ships only after the
two-source check settles which number the card carries. The legends series and
`youngronaldo.mov` are founder-voice slot material rather than card-pair material.

CF Montreal footage slots straight in once shot: approach takes become first-card
backdrops behind the claim, crowd wides become payoff backdrops behind the number.
