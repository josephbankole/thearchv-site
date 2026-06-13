// Transfer Desk — daily wrap-up. One sub-1-minute round-up per day.
// status 'verified' = filed and fact-checked against two sources. Individual moves carry
// their own DONE / RUMOUR label inside the body. The daily engine prepends new days.
// Images are brand-illustrated headshots only (no club photos, crests, kits or watermarks).
import type { DayEntry } from './worldCupDays';

export const transferDays: DayEntry[] = [
  {
    date: '2026-06-13', day: 'Saturday',
    headline: 'United’s midfield hunt gathers pace.',
    dek: 'Fernandes the name. Not the only one.',
    body: 'The move building steam is Mateus Fernandes. Manchester United are preparing an opening bid for the West Ham midfielder, the twenty one year old Portugal international whose relegation-hit club have set an eighty million pound price. Jorge Mendes is in the middle of it. RUMOUR for now, with no bid confirmed, and Real Madrid, Arsenal and Paris Saint-Germain are all circling the same name. He is not the only one. United want two from a shortlist that runs through Adam Wharton, Carlos Baleba and Elliot Anderson, with the futures of Casemiro, Ugarte, Bruno Fernandes and Kobbie Mainoo all unsettled. The rebuild starts in the middle.',
    status: 'verified',
    image: '/heads/fernandes.webp',
    imageAlt: 'Mateus Fernandes, illustrated by The ARCHV.',
  },
  {
    date: '2026-06-12', day: 'Friday',
    headline: 'Rashford to Bayern moves to pending.',
    dek: 'United set their price. A bid nears.',
    body: 'The window does not open until Monday, but the summer’s loudest story is already United’s. Marcus Rashford to Bayern Munich is being reported as pending, with United said to want somewhere in the region of twenty six to thirty four million pounds and the German champions preparing an opening bid. RUMOUR until a club confirms it. Rashford spent last season on loan at Barcelona, who are declining their option to keep him, which is what opened the German door. Elsewhere, Arsenal are the busiest names in the gossip, linked with more than one winger as they look to reshape the front line. Nothing is done. The desk waits for the white smoke.',
    status: 'verified',
    image: '/heads/rashford.webp',
    imageAlt: 'Marcus Rashford, illustrated by The ARCHV.',
  },
  {
    date: '2026-06-11', day: 'Thursday',
    headline: 'Barcelona blink. United’s window cracks open.',
    dek: 'The Rashford option goes unused.',
    body: 'Three days before the window opens, the groundwork is being laid, and the summer’s defining United question is Marcus Rashford. It moved on Thursday. Barcelona, where he spent last season on loan, are reported to be declining their option to sign him permanently before the deadline, after spending heavily elsewhere in attack. That decision hands the initiative to Bayern Munich, who have made their interest known. RUMOUR, for now, with no club confirmation. For United it is the cleanest route to a sale they have wanted for a year. The rest of the market is stretching its legs. Monday is when it sprints.',
    status: 'verified',
    image: '/heads/rashford.webp',
    imageAlt: 'Marcus Rashford, illustrated by The ARCHV.',
  },
];
