// Formula 1 — the Question Desk. One answered question a day, the biggest one fans are asking
// that week. status 'verified' = filed and checked against two independent sources.
// The daily engine (../scripts/archv-site-commit.mjs, key `f1`) prepends new entries after
// the anchor line below; keep that line byte-stable. Shares the DayEntry shape with football
// so the build scripts and feed treat every sport identically. Starts empty by design: the
// desk opens this week.
import type { DayEntry } from './worldCupDays';

export const f1Days: DayEntry[] = [
  {
    date: "2026-07-24",
    day: "Friday",
    headline: "Can anyone still catch Kimi Antonelli?",
    dek: "Not comfortably. His lead is 45 points, under 2 wins, and Hungary is his chance to stretch it before the break.",
    body: "Kimi Antonelli arrives at the Hungarian Grand Prix on 26 July with the championship in his hands. He won at Spa from pole, his sixth win of the season, and he now leads Lewis Hamilton by 45 points. It is the last race before the summer break, and the question running through the paddock is whether the title has already slipped away from everyone behind him.\n\nThe maths says not yet. A win is worth 25 points, so a 45-point gap is a little under 2 clear victories. There are still several rounds to come after Hungary. On paper the door is open for Hamilton, for Charles Leclerc, who was second at Spa, for Max Verstappen, who was third, and even for George Russell, though he sits 50 points back after retiring on the opening lap in Belgium following contact with Hamilton.\n\nThe problem for the chasers is that they keep taking points off one another, and none of them has put together the run that a 45-point deficit needs. Hamilton has said he still believes he can fight for the title. Saying it and doing it are different things, and the doing has to start in Budapest, because a poor Sunday for him and a strong one for Antonelli could push a two-win gap towards three before the sport shuts down for August.\n\nSo the honest answer is that the race is not over. Antonelli has clinched nothing, and one retirement can swing a title quickly, as Russell found at Spa. But the pressure has shifted. Antonelli can drive to manage the gap. The men behind him have to win, and they have to hope he stumbles. Hungary is where we learn whether any of them still can.",
    status: "verified",
  },
];
