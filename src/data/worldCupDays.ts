// World Cup — daily wrap-up. Each entry is a sub-1-minute read for one match day.
// status 'verified' = filed and fact-checked against two sources. 'pending' = the live
// tracker is ready but the day is not yet written. The daily engine prepends new days.
export interface DayEntry {
  date: string;     // ISO
  day: string;      // short label, e.g. "Day 2"
  headline: string; // period-terminated
  dek: string;      // one-line standfirst
  body: string;     // 70-130 words, brand voice
  status: 'verified' | 'pending';
}

export const worldCupDays: DayEntry[] = [
  {
    date: '2026-06-12', day: 'Day 2',
    headline: 'The hosts arrive. The USA make a statement.',
    dek: "Balogun's brace, Canada rescued late.",
    body: 'Day two belonged to the co-hosts. The United States opened with a four one win over Paraguay, Folarin Balogun scoring twice inside the first half before an own goal and a late Gio Reyna strike finished the job. It was the dominant start the tournament wanted from its biggest host. Canada had to settle for less. Bosnia and Herzegovina led in Toronto, and the home side needed Cyle Larin, set up by Jonathan David, to level it one all deep in the game. One host roared. One host survived. The group stage was up and running.',
    status: 'verified',
  },
  {
    date: '2026-06-11', day: 'Day 1',
    headline: 'It begins at the Azteca. And it bites.',
    dek: 'Mexico win the opener amid three red cards.',
    body: 'The tournament kicked off where two of its greatest editions were staged. Mexico beat South Africa two nil at the Estadio Azteca, Julián Quiñones striking inside nine minutes and Raúl Jiménez adding the second, on a feisty night that produced three red cards. The Azteca became the first ground to host matches at three different mens World Cups, after 1970 and 1986. Later, in Guadalajara, South Korea came from behind to beat Czechia two one. Ladislav Krejci put the Czechs ahead, then In-Beom Hwang and Hyeon-Gyu Oh turned it around. A comeback to close the opening day. The tournament had found its jeopardy early.',
    status: 'verified',
  },
];
