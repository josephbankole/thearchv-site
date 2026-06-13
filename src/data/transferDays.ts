// Transfer Desk — daily wrap-up. One sub-1-minute round-up per day.
// status 'pending' = the desk is live but the day's moves are not yet two-source verified;
// the daily engine fills these with DONE / RUMOUR labelled items. No invented deals.
import type { DayEntry } from './worldCupDays';

export const transferDays: DayEntry[] = [
  {
    date: '2026-06-12', day: 'Friday',
    headline: 'The desk is live for the summer window.',
    dek: 'Every move, read and labelled.',
    body: 'The window is open and the desk is running. Each day we round up the moves that matter, and each one carries its status in plain sight. Done is labelled done, confirmed by the club. A link is labelled a link, with the source named. Nothing is dressed up as fact before it is checked against two reputable sources. We lead on the United beat, hard, but we never invent a deal to fill a quiet day. When the news is thin we read the market instead. The valuations. The needs. The gaps. Verified, then archived.',
    status: 'pending',
  },
  {
    date: '2026-06-11', day: 'Thursday',
    headline: 'What the window has to settle.',
    dek: 'The market, before the moves.',
    body: 'Before the deals come the questions. Which holes need filling, which valuations are real, and which clubs are circling the same names. We map the market here each morning so the moves make sense when they land. The United desk leads the read, the targets and the asking prices, framed as analysis and never as a deal that has not happened. The rest of the window gets the same treatment. Confirmed business sits under a DONE label. Everything else waits for a second source. The desk does not rush. It gets it right.',
    status: 'pending',
  },
];
