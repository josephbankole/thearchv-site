// Football Leagues desk — the club-season lane (launched 4 July 2026, pulled forward
// from post-WC per D-2026-07-03). Low cadence until the World Cup final, then it scales.
// status 'verified' = filed and fact-checked against two independent sources
// (see fifa.archv/leagues-launch-verification.md for the launch claims table).
// Images are brand-illustrated headshots only (no club photos, crests, kits or watermarks).
import type { DayEntry } from './worldCupDays';

export const leaguesDays: DayEntry[] = [
  {
    date: '2026-07-04', day: 'Saturday',
    headline: 'The way-too-early 2026-27 Premier League projection.',
    dek: 'Built on last season. Blind to the window.',
    body: 'As of 4 July, this is a projection built on one thing: where everyone finished in May. It deliberately ignores the transfer window, which is open and will make parts of it look daft by September. Arsenal won the league on 85 points, seven clear of Manchester City, and champions with that margin start as favourites. City spending the summer building a response is the safest call on the board. Manchester United finished third and made Michael Carrick permanent, so the projection keeps them in the top four, with the caveat that his first full season is a different exam. Aston Villa and Liverpool complete the five returning to the Champions League. Liverpool are the hardest side to place: fifth read like the floor of that squad, and Andoni Iraola now inherits it. At the bottom of the sheet, Tottenham finished 17th, two points above the drop. The projection says that does not happen twice. But it is a projection. The window will have its say.',
    status: 'verified',
  },
  {
    date: '2026-07-03', day: 'Friday',
    headline: 'Coventry, Ipswich and Hull come up.',
    dek: 'A runaway champion, a bounce-back, a 95th-minute winner.',
    body: 'Three promoted clubs, three different routes in. Coventry City won the Championship by eleven points under Frank Lampard and sealed it with three games to spare. This is their first top-flight season since 2000-01. Why it matters: a founder member of the Premier League has been outside it for 25 years, and the return is a heavyweight story on its own. Ipswich Town finished second and go straight back up, a year after relegation. Why it matters: an instant return keeps a squad and a structure built for this level intact, and no promoted side arrives more familiar with what is coming. Hull City finished sixth, then beat Middlesbrough 1-0 in the play-off final, Oli McBurnie scoring in the fifth minute of stoppage time at Wembley. Why it matters: twelve months earlier Hull stayed out of the third tier on goal difference. No club in the division has travelled further in a year.',
    status: 'verified',
  },
  {
    date: '2026-07-02', day: 'Thursday',
    headline: 'The Champions League map for 2026-27.',
    dek: 'New dugouts, a returning giant, a debutant.',
    body: 'Paris Saint-Germain start as holders for the second summer running, chasing a third straight Champions League. England sends five: Arsenal, Manchester City, Manchester United, Aston Villa and Liverpool. United are the returners, in the competition for the first time since 2023-24 under Michael Carrick, whose appointment was made permanent by the club in May. Liverpool arrive changed too. Arne Slot was sacked after a fifth-place finish and Andoni Iraola, confirmed by the club on a two-year deal, takes over. Real Madrid come in under Alvaro Arbeloa, appointed in January when Xabi Alonso left. The newest face is Como, into the league phase after finishing fourth in Serie A, their first European qualification of any kind. Who missed out: Chelsea, Newcastle and Tottenham from England, while in Italy the four places went to Inter, Napoli, Roma and Como, which leaves Juventus and Milan outside the league phase.',
    status: 'verified',
  },
];
