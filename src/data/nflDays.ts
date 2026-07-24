// NFL — the Question Desk. One answered question a day, the biggest one fans are asking
// that week. status 'verified' = filed and checked against two independent sources.
// The daily engine (../scripts/archv-site-commit.mjs, key `nfl`) prepends new entries after
// the anchor line below; keep that line byte-stable. Shares the DayEntry shape with football
// so the build scripts and feed treat every sport identically. Starts empty by design: the
// desk opens this week.
import type { DayEntry } from './worldCupDays';

export const nflDays: DayEntry[] = [
  {
    date: "2026-07-24",
    day: "Friday",
    headline: "Is this really Aaron Rodgers' last season?",
    dek: "Yes. He has said so himself, and the Steelers open his 22nd and final camp this week.",
    body: "Aaron Rodgers has said it plainly. Asked at the Steelers' spring workouts whether 2026 would be his last season in the NFL, he answered, \"Yes. This is it.\" After 22 years, 4 MVP awards and a Super Bowl win, the oldest player in the league is going into his final year.\n\nPittsburgh report to St Vincent College in Latrobe, Pennsylvania on 28 July, with the first practice the day after. Rodgers turns 43 in December. He signed on again to finish his career under Mike McCarthy, who was his head coach for 13 seasons at Green Bay. That reunion is the reason he came back rather than walking away, and it is why this camp carries a weight the last few have not.\n\nSo the question fans keep asking as camp opens is settled on one level and open on another. Is it really his last season? He has told us it is, and he left less room this time than a year ago, when he said he was only \"pretty sure\" 2025 would be the end and then kept playing. \"This is it\" is a firmer line than that.\n\nWhat is not settled is how it ends. Rodgers is joining a side in a hard division, with Baltimore and Cincinnati to get past just to reach January. His arm still works. His movement is not what it once was, and a 43-year-old quarterback is a gamble Pittsburgh have chosen to take with their eyes open.\n\nSo the honest answer is yes. This is the last time Rodgers reports to a camp, the last opening week of a career that began in 2005. Whether it ends with a deep run or a quiet December is the part nobody can call yet. What we do know is that the clock is now running, and it starts this week in Latrobe.",
    status: "verified",
  },
  {
    date: "2026-07-22",
    day: "Wednesday",
    headline: "Will Patrick Mahomes be ready for Week 1?",
    dek: "Kansas City are planning for it and the recovery clock agrees, but Mahomes has not been cleared for full contact yet.",
    body: "Patrick Mahomes tore the ACL and LCL in his left knee on 14 December 2025, during a Week 15 game against the Los Angeles Chargers. He had surgery in Dallas days later. The Chiefs lost their quarterback and their season on the same afternoon. Seven months on, the question fans keep asking is a plain one. Will he be ready for Week 1?\n\nThe people around him are saying yes. Andy Reid has said on the record that he is optimistic Mahomes will be ready for camp. Mahomes got through the off-season programme and took part in some team drills in the spring. Kansas City open training camp on 24 July at Missouri Western State University, with the first practice for fans on 29 July.\n\nThe calendar agrees with the optimism. A torn ACL usually needs about 9 months of recovery. Count 9 months on from 14 December and you reach the middle of September, which is Week 1 and Week 2 of the new season. Mahomes has kept Week 1 as his target throughout.\n\nThe honest answer comes with a caution, and that caution comes from the Chiefs themselves. Albert Breer of Sports Illustrated reports that the club expects Mahomes to be fully cleared around now, but that the word inside the building is patience. He has not yet been cleared for 11-on-11 work, the full-contact team drills. The plan is to bring him back to those in stages rather than all at once. The reporting is that he will get there by the end of camp.\n\nSo the answer is a qualified yes. Everything that can be planned is being planned for Week 1. What is not settled is his workload in August, and whether a knee 7 months out of surgery holds up to full contact before it holds up to a season. Reid can be optimistic. Nobody is certain until Mahomes takes a hit and gets back up.",
    status: "verified",
  },
];
