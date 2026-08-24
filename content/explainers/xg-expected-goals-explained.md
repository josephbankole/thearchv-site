---
title: "xG, explained: what expected goals measures and what it does not"
slug: "xg-expected-goals-explained"
section: "explainers"
eyebrow: "ARCHV Explains · Football data"
datePublished: "2026-08-24"
description: "How expected goals is calculated, what a 0.08 chance actually means, why Manchester United can post 1.81 xG and lose 2-0, and the four things xG genuinely cannot tell you."
quickAnswer: "Expected goals, or xG, assigns every shot a probability of being scored based on how similar shots have historically been converted, using distance, angle, body part, assist type and defensive pressure. A team's xG for a match is the sum of those probabilities. It measures chance quality, not what happened, and it is a poor guide over one match and a good one over a season."
players: []
ogImage: "/og.jpg"
related: ["why-var-takes-so-long"]
---
Manchester United had 1.81 expected goals at Hull City on 22 August 2026 and lost 2-0, per Opta.

That single line is the best argument both for and against xG, which is why it is worth taking apart.

## How the number is built

Every shot is given a probability of being scored, derived from what happened to a large historical sample of very similar shots.

The model reads the shot's circumstances. Distance from goal and angle to it do most of the work. Body part matters, headers converting worse than feet from the same spot. Assist type matters, a cut-back producing better chances than a cross. Defensive pressure and the goalkeeper's position are included in the better models. Whether it is a penalty is its own category.

A tap-in might be 0.6. A header from twelve yards under pressure might be 0.1. A hopeful strike from 30 yards might be 0.02.

A team's xG for a match is the sum of those probabilities. That is the whole calculation. It is an addition, not a judgement.

## What 1.81 xG actually means

It does not mean Manchester United deserved 1.81 goals.

It means that if you replayed those specific shots many times, using the historical conversion rate of comparable attempts, the average outcome would be about 1.81 goals. The distribution around that average is wide. Scoring zero from 1.81 xG is unremarkable, and happens constantly.

So a side can generate good chances, miss them, concede two set pieces and lose. That is not the model failing. That is the model reporting chance quality while the scoreboard reports events, and the two were always different measurements.

## What it is genuinely good at

**Detecting unsustainable runs.** A team scoring far above its xG over ten matches is usually about to stop. A team far below it is usually about to improve.

**Judging chance creation separately from finishing.** A coach who wants to know whether the system is producing openings, independent of whether the striker is having a good month, has one number for it.

**Comparing shot selection.** Two sides with 15 shots each can have very different xG totals. That gap is the entire difference between working the ball into the box and shooting from distance because nothing else is available.

## The four things it cannot tell you

**It knows nothing about what did not happen.** A move that ends with a pass into an empty net that is never taken generates no shot and no xG. Territorial dominance without shooting registers as nothing at all.

**It does not know who took the shot.** Standard xG treats the finisher as an average finisher. The difference between an elite striker and an average one is precisely the difference the model is built to ignore. That is deliberate, and it is why post-shot models exist as a separate thing.

**It is nearly worthless over one match.** A ninety-minute sample of ten to fifteen shots is far too small for an average to be meaningful. Quoting xG to settle an argument about a single game is using a season-scale tool at match scale.

**Models disagree.** Opta, Understat and others build different models from different samples, so figures for the same match differ. Which is why a number is only usable if the provider is named beside it.

That last point is a rule on this site rather than a preference. Opta recorded 71.6 per cent possession, 21 shots, five on target and 1.81 xG at the MKM Stadium; the API-Football figures for the same match read 70 per cent, sixteen shots, four on target and 1.54 xG. Both are published. Neither is mixed with the other, and every number carries the provider it came from.

## The one-line version

xG measures the quality of the chances a team created, not the result it earned, and anyone using it to argue about one match is using it wrong.

Sources: Opta match data for Hull City against Manchester United, 22 August 2026, as recorded and provider-pinned in this archive's United Reality Check of 23 August 2026; API-Football data for the same fixture, recorded separately in this archive's transfer desk entry of 22 August 2026; this archive's glossary entry on expected goals.
