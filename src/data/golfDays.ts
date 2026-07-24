// Golf — the Question Desk. One answered question a day, the biggest one fans are asking
// that week. status 'verified' = filed and checked against two independent sources.
// The daily engine (../scripts/archv-site-commit.mjs, key `golf`) prepends new entries after
// the anchor line below; keep that line byte-stable. Shares the DayEntry shape with football
// so the build scripts and feed treat every sport identically. Starts empty by design: the
// desk opens this week.
import type { DayEntry } from './worldCupDays';

export const golfDays: DayEntry[] = [
  {
    date: "2026-07-24",
    day: "Friday",
    headline: "What did losing the Asian Tour cost LIV Golf?",
    dek: "Its way in. The tour that fed players to LIV has switched to the PGA Tour and DP World Tour through 2029.",
    body: "For four years the Asian Tour was LIV Golf's back door into the sport. It gave LIV a feeder circuit, a promotion route through its International Series, and a foothold outside the 2 tours that had shut LIV out. This week that door closed. The Asian Tour has agreed a partnership with the PGA Tour and the DP World Tour that takes effect at once and runs through 2029, and it has ended its ties with LIV to sign it.\n\nThe terms matter more than the headline. From 2027 the Asian Tour will have at least 2 events each season co-sanctioned with the DP World Tour, and its leading players get a pathway into the European circuit. That is the same kind of ladder the Asian Tour once offered up towards LIV, only now it climbs the other way, back towards the established tours.\n\nFor LIV the cost is structural rather than immediate. Its big names are still under contract and its events still carry their prize money. What it has lost is the pipeline. The Asian Tour was where LIV recruited and where it pointed players who wanted a way in. Without it, LIV is more boxed in than it was a week ago, a closed shop of its own signings with fewer routes to bring new ones through.\n\nNone of this ends LIV, and it is worth being careful with the bigger claims flying around the story. The alliance itself is confirmed by several outlets. Talk of LIV's funding drying up is not, so it is left out here. What is verified is narrower and still matters. The 3 tours LIV set out to challenge have pulled the Asian Tour to their side, and they have locked it in until 2029. LIV now has to find its next intake without the circuit that helped supply its first.",
    status: "verified",
  },
];
