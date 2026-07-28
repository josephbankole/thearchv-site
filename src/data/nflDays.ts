// NFL — the Question Desk. One answered question a day, the biggest one fans are asking
// that week. status 'verified' = filed and checked against two independent sources.
// The daily engine (../scripts/archv-site-commit.mjs, key `nfl`) prepends new entries after
// the anchor line below; keep that line byte-stable. Shares the DayEntry shape with football
// so the build scripts and feed treat every sport identically. Starts empty by design: the
// desk opens this week.
import type { DayEntry } from './worldCupDays';

export const nflDays: DayEntry[] = [
  {
    date: "2026-07-28",
    day: "Tuesday",
    headline: "Why have the Eagles made Jalen Carter the best-paid defensive tackle in NFL history?",
    dek: "Jalen Carter has agreed a four-year extension with the Philadelphia Eagles worth 152 million dollars, running through 2031. It is the most any defensive tackle has been paid, on both the guarantee and the annual average.",
    body: "The Philadelphia Eagles and Jalen Carter agreed a four-year extension on 28 July worth 152 million dollars, 106 million of it guaranteed, rising to 160 million if he hits the incentives. It runs through 2031. ESPN, NFL.com and the Philadelphia Inquirer all report the same terms. The average of 38 million a year is the highest any defensive tackle has been paid, and so is the guarantee.\n\nThe case for it is three seasons old. Since Philadelphia drafted him ninth in 2023, Carter has 13.5 sacks, 37 quarterback hits, 108 tackles, 13 pass deflections and four forced fumbles, and he has been to two Pro Bowls. Interior linemen who collapse a pocket from the middle rather than around the edge of it are the rarest thing on a defensive line, and the Eagles have spent three years building a front that assumes they have one.\n\nThe number does something else too. Every defensive tackle who negotiates after this has 38 million a year sitting on the table as the reference point, and Philadelphia have taken their own player off that market through his prime rather than bidding for him again at whatever the position costs in 2031. Carter is 25.",
    status: "verified",
  },
  {
    date: "2026-07-26",
    day: "Sunday",
    headline: "Who is running the 49ers while Kyle Shanahan recovers?",
    dek: "Kyle Shanahan broke three ribs, his nose and a hand in a car crash on 14 July. Chris Foerster and three coordinators take over as San Francisco open training camp.",
    body: "Kyle Shanahan was in a car crash near his home in Palo Alto on the evening of 14 July. He broke his nose, three ribs and a hand, needed more than 40 stitches in his face, and sustained a concussion he is still feeling. He will be at training camp. He will not be running it in the way he normally would.\n\nAssistant head coach Chris Foerster picks up most of the day-to-day work, with the three coordinators taking on more: Raheem Morris on defence, Klay Kubiak on offence and Brant Boyer on special teams. Foerster is 64 and in his second spell in San Francisco, hired in 2019 and promoted to assistant head coach later, so the man holding the clipboard is not a stranger to the building.\n\nThe broken bones will heal on a schedule. The head injury is the part nobody will put a date on. General manager John Lynch said Shanahan is effectively in the concussion protocol and that the doctors decide when and how he comes back. Asked whether Shanahan might miss the season opener against the Los Angeles Rams in Melbourne on 10 September, Lynch said that was \"not what we're anticipating\", which is reassurance rather than a promise. San Francisco's first practice is on 27 July.",
    status: "verified",
  },
  {
    date: "2026-07-25",
    day: "Saturday",
    headline: "What did the Rams give up for Myles Garrett and Trent McDuffie?",
    dek: "The Los Angeles Rams traded seven draft picks and Jared Verse to land Myles Garrett and Trent McDuffie. Here is the full bill.",
    body: "Training camp is open and the Los Angeles Rams have been the most aggressive team of the offseason, so the fair question is what it cost. Two trades did most of the work. Cleveland sent Myles Garrett, the reigning Defensive Player of the Year, to Los Angeles for the edge rusher Jared Verse plus a 2027 first-round pick, a 2028 second and a 2029 third. The Browns set that package out on their own website and ESPN and NFL.com reported it identically. Kansas City then sent the cornerback Trent McDuffie west for four picks, the Rams' 2026 first-rounder among them, which the Chiefs also confirmed themselves, and the Rams agreed a four-year extension with McDuffie worth more than 30 million dollars a season. Add the two together and the price is seven draft picks, both of the Rams' next two first-rounders, a starting edge rusher who was a first-round pick himself, and a very large guarantee. Whether that is reckless depends on the calendar as much as the roster. Super Bowl LXI is scheduled for 14 February 2027 at SoFi Stadium, which is where the Rams play. Los Angeles have decided the next two seasons matter more than the next four drafts, and they have not been quiet about it.",
    status: "verified",
  },
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
