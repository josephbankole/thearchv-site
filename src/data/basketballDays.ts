// Basketball, the Question Desk. One lane covering the NBA and the WNBA equally: one answered
// question a week, filed on Mondays, alternating between the two leagues. status 'verified' =
// filed and checked against two independent named sources.
// The daily engine (../scripts/archv-site-commit.mjs, key `basketball`) prepends new entries
// after the anchor line below; keep that line byte-stable. Shares the DayEntry shape with
// football so the build scripts and feed treat every sport identically. Starts empty by design:
// the desk opened on 2026-09-11 (founder order).
import type { DayEntry } from './worldCupDays';

export const basketballDays: DayEntry[] = [
  {
    date: "2026-09-21",
    day: "Monday",
    headline: "Why are the Golden State Valkyries second in the WNBA?",
    dek: "Golden State are 31-11 and second in the league on the best defensive rating in the WNBA, and have reached the playoffs in both their seasons.",
    body: "The Golden State Valkyries are 31-11 and second in the WNBA, behind the Minnesota Lynx on 32-10 in the standings ESPN carried on 21 September, and they have got there on the best defence in the league.\n\nThe Boston Globe reported that the Valkyries hold the best defensive rating in the WNBA and concede 76.3 points a game. In 33 of 37 games, opponents finished below their season scoring average. The same report had Golden State holding Minnesota to 66 points in August, the Lynx's lowest of the season.\n\nGolden State clinched a playoff place for the second season running by beating the Dallas Wings 78-70. ESPN reported that this made them the fourth franchise to reach the postseason in each of its first two seasons, and the first expansion team to do it.\n\nNBC Sports Bay Area reported that the Valkyries went 23-21 and finished eighth in 2025, the first expansion team in WNBA history to make the playoffs in its first year, and that head coach Natalie Nakase was named Coach of the Year.\n\nESPN has the regular season ending on Thursday 24 September and the playoffs starting on Sunday 27 September, with a best-of-3 first round seeded 1 against 8 down to 4 against 5, and no reseeding after it.\n\nTwo games left. Then the bracket.",
    status: "verified",
    seoTitle: "Golden State Valkyries: 31-11, the WNBA's best defence",
  },
];
