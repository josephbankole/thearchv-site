// Tennis — the Question Desk. One answered question a day, the biggest one fans are asking
// that week. status 'verified' = filed and checked against two independent sources.
// The daily engine (../scripts/archv-site-commit.mjs, key `tennis`) prepends new entries after
// the anchor line below; keep that line byte-stable. Shares the DayEntry shape with football
// so the build scripts and feed treat every sport identically. Starts empty by design: the
// desk opens this week.
import type { DayEntry } from './worldCupDays';

export const tennisDays: DayEntry[] = [
  {
    date: "2026-07-24",
    day: "Friday",
    headline: "Will Alcaraz be fit to defend his US Open title?",
    dek: "He is entered and the wrist is reported healed, but he has not played a match since April.",
    body: "Carlos Alcaraz has not played a competitive match since April, when a wrist injury at the Barcelona Open cut his spring short. He sat out the French Open, Wimbledon and the Canadian Open while it healed. The US Open, which he won last year, starts its main draw on 30 August, and the question for anyone following the men's game is a simple one. Will he be fit to defend it?\n\nThe signs point one way. Alcaraz is on the US Open entry list, entered as the world number 3, alongside Jannik Sinner and Alexander Zverev. Reports say the wrist is fully healed and that he has been building his training load back up with his team. His plan is to return at the Cincinnati Open, which runs from 13 to 23 August, the last big hard-court event before New York.\n\nThere is a gap between being entered and being ready. Alcaraz has not yet confirmed that he will actually play in Cincinnati, and a name on an entry list is not the same as match fitness. He beat Sinner in last year's US Open final, and earlier in 2026 he won the Australian Open to complete the career Grand Slam. A player at that level does not need long to find his game. He does need matches, and a first event back after 4 months out is a hard place to begin a title defence.\n\nSo the answer is a qualified yes. He is entered, the injury is behind him, and Cincinnati gives him a fortnight of hard-court tennis to shed the rust before New York. What nobody can promise is how a wrist that kept him out for 4 months holds up over 5 sets. Alcaraz says he is ready to return. He will not truly know until he is back on court.",
    status: "verified",
  },
];
