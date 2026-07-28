// Formula 1 — the Question Desk. One answered question a day, the biggest one fans are asking
// that week. status 'verified' = filed and checked against two independent sources.
// The daily engine (../scripts/archv-site-commit.mjs, key `f1`) prepends new entries after
// the anchor line below; keep that line byte-stable. Shares the DayEntry shape with football
// so the build scripts and feed treat every sport identically. Starts empty by design: the
// desk opens this week.
import type { DayEntry } from './worldCupDays';

export const f1Days: DayEntry[] = [
  {
    date: "2026-07-28",
    day: "Tuesday",
    headline: "How did Oscar Piastri lose the Hungarian Grand Prix from the front?",
    dek: "Oscar Piastri took the lead at the first corner in Hungary and led half the race. A collision while lapping Carlos Sainz and then a gearbox failure ended it, and Lando Norris won instead.",
    body: "Lando Norris started the Hungarian Grand Prix on pole on 26 July and lost the lead almost at once. Oscar Piastri got the better of him into Turn 2 with a cutback after Norris ran wide, and from there Piastri led the first half of the race.\n\nIt came apart in two stages. McLaren pitted Piastri first and he rejoined in traffic. Trying to lap Carlos Sainz, he was hit by him. That cost the time and the lead went back to Norris. Then the gearbox failed on lap 56 and Piastri, running second, was out. Autosport and Formula1.com both have it the same way, and Piastri's own description afterwards was of being taken out by a backmarker.\n\nNorris won by 15.080 seconds from Max Verstappen, with Kimi Antonelli third. It is Norris's first win of the season and it changed very little at the top, because Antonelli's championship lead went out to 50 points by finishing behind him. Lewis Hamilton is second on 169 points, George Russell third on 160, Charles Leclerc fourth on 138, Norris fifth on 128 and Verstappen sixth on 109. Mercedes lead the constructors on 379 from Ferrari on 307, with McLaren third on 220.",
    status: "verified",
  },
  {
    date: "2026-07-26",
    day: "Sunday",
    headline: "Why is Lewis Hamilton starting fifth in Hungary?",
    dek: "Lewis Hamilton qualified second at the Hungaroring, 0.012 seconds behind Lando Norris. A three-place penalty for impeding dropped him to fifth.",
    body: "Hamilton put the Ferrari on the front row and then lost it in the stewards' room. He was 0.012 seconds behind Lando Norris, who took pole with a 1:17.207 in the closing seconds of Q3. After the session the stewards gave Hamilton a three-place grid penalty for impeding Oscar Piastri, which moves him back to fifth.\n\nHe is not the only one who went backwards. Kimi Antonelli qualified fourth and was given the same three-place drop for a yellow-flag infringement, so he starts seventh. That matters more than it sounds. Antonelli leads the drivers' championship on 204 points, 45 clear of Hamilton in second, and the Hungaroring is one of the hardest circuits on the calendar to overtake on. Both title contenders have to come through traffic on a track that does not allow much of it.\n\nThe grid now reads Norris, Charles Leclerc, Piastri, Max Verstappen, Hamilton, George Russell, Antonelli, Isack Hadjar. Norris got his lap in just before two late yellow flags ended everyone else's session. Verstappen spun at the final corner and Russell stopped on track, and the drivers still running lost their last attempt. The race is 70 laps and starts at 14:00 UK time.",
    status: "verified",
  },
  {
    date: "2026-07-25",
    day: "Saturday",
    headline: "Why has Max Verstappen not won a race in 2026?",
    dek: "Max Verstappen is seventh in the 2026 drivers' championship after 10 rounds. Red Bull's RB22 is the reason, and his contract is the consequence.",
    body: "Ten of the 22 rounds are gone and Max Verstappen has won none of them. Formula 1's own standings have him seventh on 91 points, behind both McLaren drivers and 113 behind Kimi Antonelli, who has six wins and leads on 204. The car is the answer everyone gives. Red Bull admitted significant shortcomings with the RB22 as early as the Chinese Grand Prix, per Sky Sports, and the complaints have not changed since. The rear end is unstable on corner entry, which forces Verstappen into constant steering corrections and costs him most in the fast corners, and the power unit's energy management falls away at circuits that lean on it. Motorsport.com has traced a separate run of poor race starts to the same package, and The Race puts Red Bull around the fourth quickest team on the grid, trading with McLaren while Mercedes and Ferrari run at the front. Verstappen has been openly critical of the new regulations and, with his contract running to 2028, has still not committed to the team beyond this season. That is the part Red Bull will worry about. A slow car costs them a season, and a car can be fixed. Losing Verstappen over it would take a great deal longer to recover from.",
    status: "verified",
  },
  {
    date: "2026-07-24",
    day: "Friday",
    headline: "Can anyone still catch Kimi Antonelli?",
    dek: "Not comfortably. His lead is 45 points, under 2 wins, and Hungary is his chance to stretch it before the break.",
    body: "Kimi Antonelli arrives at the Hungarian Grand Prix on 26 July with the championship in his hands. He won at Spa from pole, his sixth win of the season, and he now leads Lewis Hamilton by 45 points. It is the last race before the summer break, and the question running through the paddock is whether the title has already slipped away from everyone behind him.\n\nThe maths says not yet. A win is worth 25 points, so a 45-point gap is a little under 2 clear victories. There are still several rounds to come after Hungary. On paper the door is open for Hamilton, for Charles Leclerc, who was second at Spa, for Max Verstappen, who was third, and even for George Russell, though he sits 50 points back after retiring on the opening lap in Belgium following contact with Hamilton.\n\nThe problem for the chasers is that they keep taking points off one another, and none of them has put together the run that a 45-point deficit needs. Hamilton has said he still believes he can fight for the title. Saying it and doing it are different things, and the doing has to start in Budapest, because a poor Sunday for him and a strong one for Antonelli could push a two-win gap towards three before the sport shuts down for August.\n\nSo the honest answer is that the race is not over. Antonelli has clinched nothing, and one retirement can swing a title quickly, as Russell found at Spa. But the pressure has shifted. Antonelli can drive to manage the gap. The men behind him have to win, and they have to hope he stumbles. Hungary is where we learn whether any of them still can.",
    status: "verified",
  },
];
