// Tennis — the Question Desk. One answered question a day, the biggest one fans are asking
// that week. status 'verified' = filed and checked against two independent sources.
// The daily engine (../scripts/archv-site-commit.mjs, key `tennis`) prepends new entries after
// the anchor line below; keep that line byte-stable. Shares the DayEntry shape with football
// so the build scripts and feed treat every sport identically. Starts empty by design: the
// desk opens this week.
import type { DayEntry } from './worldCupDays';

export const tennisDays: DayEntry[] = [
  {
    date: "2026-07-30",
    day: "Thursday",
    headline: "Why is Jannik Sinner the man to beat at the 2026 National Bank Open?",
    dek: "World number one Jannik Sinner heads to Montreal for the 2026 National Bank Open unbeaten in ATP Masters 1000 events this season, in a field containing 71 of the ATP Tour's top 72 players.",
    body: "The 2026 National Bank Open runs from 1 to 13 August, with the men in Montreal at IGA Stadium and the women in Toronto at Sobeys Stadium. Draw ceremonies are on Friday 31 July and main-draw play begins on Sunday 2 August.\n\nIn Montreal the answer to who is favourite is uncomplicated. Jannik Sinner arrives as world number one and, on the tournament's own account of his season, unbeaten in ATP Masters 1000 events in 2026. A player who has not lost at this level all year is the form line, and the hard courts of the North American summer swing are where that form has historically held.\n\nThe field gives him no shortage of ways to lose. It contains 71 of the ATP Tour's top 72 players, plus two entrants on protected rankings, which is close to the strongest possible turnout for a tournament of this tier. Alexander Zverev is seeded third, won this title in 2017, and claimed his first Grand Slam at Roland-Garros earlier this year. Alex de Minaur, Taylor Fritz and Andrey Rublev are all entered.\n\nToronto has its own draw. The women's event has 72 of the top 75 in the WTA rankings, and two of the more resonant names in the main draw are there on wild cards: Bianca Andreescu, who won the title in 2019, and Venus Williams.\n\nThe structural point about this event is that it is the last substantial hard-court examination before the US Open, and it is played over nearly two weeks rather than one. Depth of field plus length of tournament is what makes it a genuine test rather than a warm-up, and it is why an unbeaten Masters 1000 record arriving here is worth stating and worth watching.",
    status: "verified",
  },
  {
    date: "2026-07-29",
    day: "Wednesday",
    headline: "When does the 2026 National Bank Open start, and why are the men and women in different cities?",
    dek: "The 2026 National Bank Open runs from 1 to 13 August, with the women in Toronto at Sobeys Stadium and the men in Montreal at IGA Stadium. The draws are made on Friday 31 July and main draw play begins on Sunday 2 August.",
    body: "The 2026 National Bank Open runs from 1 August to 13 August. The women play in Toronto at Sobeys Stadium and the men play in Montreal at IGA Stadium.\n\nThe draw ceremonies for both the ATP and WTA events are on Friday 31 July, with the first order of play published later that evening. Main draw singles begins on Sunday 2 August.\n\nThe two-city split is the oldest thing about the tournament and the part that confuses people most. Canada runs one championship across two host cities, and the men's and women's events swap between Toronto and Montreal each year. So a player who won in Toronto last summer defends the title in Montreal this summer. The trophy travels; the city does not follow it.\n\nThe entry list is the strongest part of this year's Toronto edition. The tournament has announced that 72 of the WTA Tour's top 75 players will take part, which is close to the full ranked field and unusual for an event sitting between two hard-court majors.\n\nThe timing is what makes that number notable. This sits in the middle of the North American hard-court swing, a stretch players routinely trim to protect themselves for the last major of the year. A field this complete suggests the schedule has landed better than usual, or that the ranking points on offer are worth more than the rest.\n\nAnyone looking for live tennis this week is looking at Washington instead. The Mubadala DC Open is in progress, and it has already produced the week's upset. Terence Atmane, ranked 56 in the world, knocked out the sixth seed Frances Tiafoe 4-6, 6-3, 6-4, which is Tiafoe's earliest exit in Washington since 2021. Atmane plays Alejandro Tabilo next. Taylor Fritz, the third seed, went through 6-3, 6-4 against Zizou Bergs.\n\nSources: National Bank Open, ATP Tour.",
    status: "verified",
  },
  {
    date: "2026-07-28",
    day: "Tuesday",
    headline: "How did Frances Tiafoe lose in the first round of his home tournament?",
    dek: "Frances Tiafoe was beaten in three sets by Terence Atmane at the DC Open in Washington. It is his earliest exit there since 2021.",
    body: "Frances Tiafoe lost 4-6, 6-3, 6-4 to Terence Atmane in the first round of the DC Open on 27 July. Tiafoe was the sixth seed and grew up in Maryland, half an hour from the courts. He took the first set and then lost two in a row.\n\nHis own explanation, given afterwards, was that he simply felt off. It is Atmane's first win over him in their careers and Tiafoe's earliest loss in Washington since 2021, a tournament where he has usually gone deep.\n\nThe DC Open is an ATP 500 and runs to 2 August. Taylor Fritz, seeded third, came through his opening match on the same day, beating Zizou Bergs 6-3, 6-4. The field also holds the defending champion Alex de Minaur, Ben Shelton, Daniil Medvedev and Felix Auger-Aliassime.",
    status: "verified",
  },
  {
    date: "2026-07-26",
    day: "Sunday",
    headline: "Why has Venus Williams been given a wild card in Toronto?",
    dek: "Venus Williams is 46, ranked outside the top 400, and has not won a match in 2026. The National Bank Open has put her in the main draw anyway.",
    body: "The National Bank Open has handed Venus Williams a main-draw wild card for the Toronto tournament, which runs from 1 to 13 August. It will be her 13th appearance there. She is 46, her ranking is outside the top 400, and she has not won a match this season, a run that made her the first former world number one to lose 10 in a row since the WTA rankings started in 1975.\n\nSo the sporting case is thin, and the tournament is not pretending otherwise. Tournament director Karl Hale called her \"the legendary Venus Williams\" in the announcement. Williams said Toronto is \"a city and a tournament that have always meant so much to me\". A wild card is a discretionary invitation and always has been. Organisers spend them on players who sell seats and on players they feel they owe something. Williams is both, and the draw does not have to justify itself beyond that.\n\nThere is history under it. Her best run in Canada came in 2014, when she reached the final by beating her sister Serena. She came back to the tour in Washington last year after a 16-month absence and won her opening match. She is not the only wild card either: Bianca Andreescu, the Canadian who won this title in 2019, has also been given one. Main-draw play begins on 2 August, with the draw made on 31 July.",
    status: "verified",
  },
  {
    date: "2026-07-25",
    day: "Saturday",
    headline: "How did a wildcard ranked 114 reach the Wimbledon semi-finals?",
    dek: "Arthur Fery went from 114 in the world to a Wimbledon semi-final and a career-high ranking of 36. He grew up in Wimbledon.",
    body: "Arthur Fery entered Wimbledon ranked 114 in the world on a wildcard and left it ranked 36, a career high when the new list was published on 13 July. He beat Damir Dzumhur, Otto Virtanen and Zizou Bergs to reach the second week, then knocked out Grigor Dimitrov and the ninth seed Flavio Cobolli before Alexander Zverev stopped him in the semi-finals. That is five wins, the last two against opponents ranked well above him. Sky Sports and the ATP both place the run in its proper company: only Goran Ivanisevic in 2001 had previously reached a Wimbledon men's singles semi-final as a wildcard, and Fery is the fifth British man to reach the last four in the Open era, after Roger Taylor, Tim Henman, Andy Murray and Cameron Norrie. He is also, in the most literal sense, a local. Fery was born in France to French parents and has lived in Wimbledon since he was a few months old, per the Lawn Tennis Association, and he plays for Great Britain. The tournament he reached the last four of is the one down the road.",
    status: "verified",
  },
  {
    date: "2026-07-24",
    day: "Friday",
    headline: "Will Alcaraz be fit to defend his US Open title?",
    dek: "He is entered and the wrist is reported healed, but he has not played a match since April.",
    body: "Carlos Alcaraz has not played a competitive match since April, when a wrist injury at the Barcelona Open cut his spring short. He sat out the French Open, Wimbledon and the Canadian Open while it healed. The US Open, which he won last year, starts its main draw on 30 August, and the question for anyone following the men's game is a simple one. Will he be fit to defend it?\n\nThe signs point one way. Alcaraz is on the US Open entry list, entered as the world number 3, alongside Jannik Sinner and Alexander Zverev. Reports say the wrist is fully healed and that he has been building his training load back up with his team. His plan is to return at the Cincinnati Open, which runs from 13 to 23 August, the last big hard-court event before New York.\n\nThere is a gap between being entered and being ready. Alcaraz has not yet confirmed that he will actually play in Cincinnati, and a name on an entry list is not the same as match fitness. He beat Sinner in last year's US Open final, and earlier in 2026 he won the Australian Open to complete the career Grand Slam. A player at that level does not need long to find his game. He does need matches, and a first event back after 4 months out is a hard place to begin a title defence.\n\nSo the answer is a qualified yes. He is entered, the injury is behind him, and Cincinnati gives him a fortnight of hard-court tennis to shed the rust before New York. What nobody can promise is how a wrist that kept him out for 4 months holds up over 5 sets. Alcaraz says he is ready to return. He will not truly know until he is back on court.",
    status: "verified",
  },
];
