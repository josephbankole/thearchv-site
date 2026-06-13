// World Cup — daily wrap-up. Each entry is a sub-1-minute read for one match day.
// status 'pending' = the live tracker is ready but the day's results are not yet verified;
// the daily engine replaces these with confirmed wraps (two-source gate). No invented scores.
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
    headline: 'The group stage finds its feet.',
    dek: 'The first full day of group play.',
    body: 'The opening night is behind us and the group stage proper gets under way. Across the host cities the early fixtures arrive in a rush, the first standings take shape, and the contenders begin to show their hand. We log every kick off, every scoreline and every decisive moment here, the moment it is confirmed against two independent sources. Nothing lands on this card until it is verified. A permanent archive earns its place through accuracy, not haste. The Archive does not guess. It records.',
    status: 'pending',
  },
  {
    date: '2026-06-11', day: 'Day 1',
    headline: 'The 2026 World Cup is under way.',
    dek: 'It begins, across three nations.',
    body: 'It begins. The largest finals in the tournament history opens across North America, the anthems ring out, and a summer of football is set in motion. The host takes centre stage for the curtain raiser as a new chapter of the archive opens with it. We record the opening fixture here, scoreline and scorers included, the moment it is confirmed against two reputable sources. Until then the card stays clean. An indexed, permanent page is no place for a guessed result. The wait is brief. The history is forever.',
    status: 'pending',
  },
];
