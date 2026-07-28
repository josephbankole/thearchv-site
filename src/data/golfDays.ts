// Golf — the Question Desk. One answered question a day, the biggest one fans are asking
// that week. status 'verified' = filed and checked against two independent sources.
// The daily engine (../scripts/archv-site-commit.mjs, key `golf`) prepends new entries after
// the anchor line below; keep that line byte-stable. Shares the DayEntry shape with football
// so the build scripts and feed treat every sport identically. Starts empty by design: the
// desk opens this week.
import type { DayEntry } from './worldCupDays';

export const golfDays: DayEntry[] = [
  {
    date: "2026-07-28",
    day: "Tuesday",
    headline: "Did winning the 3M Open get Jackson Koivun into the FedExCup playoffs?",
    dek: "Jackson Koivun's win moved him 124 places to number 70 in the FedExCup standings. That is the last qualifying spot, and there are two tournaments left.",
    body: "Jackson Koivun won the 3M Open on 26 July in his third start as a professional, three shots clear of Scottie Scheffler on 25 under par, a tournament record. The 500 FedExCup points that came with it moved him 124 places up the standings to number 70.\n\nNumber 70 is the cutoff, which is the whole problem. The top 70 go to the FedEx St Jude Championship at TPC Southwind on 13 to 16 August, and Koivun is sitting on the last seat of the bus with two events still to be played. The Rocket Classic in Detroit runs 30 July to 2 August, the Wyndham Championship in Greensboro follows on 6 to 9 August, and anyone below him who has a good week takes the place off him.\n\nScheffler, for his part, will not be adding to his own total in either. He shot 64 and 63 over the weekend at TPC Twin Cities and still lost by three, and he has indicated the 3M Open was his last start before the playoffs begin.",
    status: "verified",
  },
  {
    date: "2026-07-26",
    day: "Sunday",
    headline: "Who is Jackson Koivun, and why is he leading the 3M Open?",
    dek: "Jackson Koivun shot 61 at TPC Twin Cities with a back nine of 28. The 21-year-old rookie leads by three going into the final round, with Scottie Scheffler chasing.",
    body: "Koivun is 21, about a month into life as a professional, and he has just played the best nine holes anyone has managed at this tournament. His third-round 61 at TPC Twin Cities took him to 20 under par and gave him the first 54-hole lead of his PGA Tour career. The back nine was a 28, a tournament record, and he finished it birdie, birdie, eagle.\n\nHe got here by an unusual route. Koivun spent four years at Auburn as the top-ranked amateur in the American college game and earned his tour card through PGA Tour University Accelerated, which hands membership to elite college players before their eligibility runs out. He took it up in June and made his professional debut at the John Deere Classic at the start of July. Tour winners were talking about his game before he had played a round as one of them.\n\nHe leads Emiliano Grillo and Ben Kohles by three shots. The name further down the board is the one that complicates his Sunday. Scottie Scheffler started Saturday seven behind, shot 64 with an eagle and five birdies coming home, and sits six back in a share of ninth. Michael Brennan and Chandler Phillips are at 16 under. The final round finishes on Sunday afternoon, with coverage from 1pm Eastern.",
    status: "verified",
  },
  {
    date: "2026-07-25",
    day: "Saturday",
    headline: "How did Ryan Fox win The Open at 39?",
    dek: "Ryan Fox was ranked 56th in the world when he won the 2026 Open Championship at Royal Birkdale. It is his first major.",
    body: "Ryan Fox was 56th in the world rankings when the 154th Open began at Royal Birkdale, and for three days he was not the story. Sam Burns led after 54 holes. Cameron Young signed for 64 on Sunday and set a target nobody had beaten. Fox then took four birdies from his last six holes, the last of them a 12-foot putt on the 18th green, and won by one shot at 10 under par. It is his first major championship, at 39. ESPN and CNN both note that over the past decade only Phil Mickelson at the 2021 PGA Championship and Tiger Woods at the 2019 Masters have won a major at a greater age, and that Fox is the third New Zealander to win a men's major. Burns finished third, two back. Scottie Scheffler, who arrived at Birkdale defending the title, tied for fourth with Tommy Fleetwood. Fox won it by holing putts at the point in the week when they are hardest to hole, which is usually the whole answer at an Open, and it is why a world ranking tells you very little about Royal Birkdale on a Sunday afternoon.",
    status: "verified",
  },
  {
    date: "2026-07-24",
    day: "Friday",
    headline: "What did losing the Asian Tour cost LIV Golf?",
    dek: "Its way in. The tour that fed players to LIV has switched to the PGA Tour and DP World Tour through 2029.",
    body: "For four years the Asian Tour was LIV Golf's back door into the sport. It gave LIV a feeder circuit, a promotion route through its International Series, and a foothold outside the 2 tours that had shut LIV out. This week that door closed. The Asian Tour has agreed a partnership with the PGA Tour and the DP World Tour that takes effect at once and runs through 2029, and it has ended its ties with LIV to sign it.\n\nThe terms matter more than the headline. From 2027 the Asian Tour will have at least 2 events each season co-sanctioned with the DP World Tour, and its leading players get a pathway into the European circuit. That is the same kind of ladder the Asian Tour once offered up towards LIV, only now it climbs the other way, back towards the established tours.\n\nFor LIV the cost is structural rather than immediate. Its big names are still under contract and its events still carry their prize money. What it has lost is the pipeline. The Asian Tour was where LIV recruited and where it pointed players who wanted a way in. Without it, LIV is more boxed in than it was a week ago, a closed shop of its own signings with fewer routes to bring new ones through.\n\nNone of this ends LIV, and it is worth being careful with the bigger claims flying around the story. The alliance itself is confirmed by several outlets. Talk of LIV's funding drying up is not, so it is left out here. What is verified is narrower and still matters. The 3 tours LIV set out to challenge have pulled the Asian Tour to their side, and they have locked it in until 2029. LIV now has to find its next intake without the circuit that helped supply its first.",
    status: "verified",
  },
];
