// Basketball, the Question Desk. One lane covering the NBA and the WNBA equally: one answered
// question a week, filed on Mondays, alternating between the two leagues. status 'verified' =
// filed and checked against two independent named sources.
// The daily engine (../scripts/archv-site-commit.mjs, key `basketball`) prepends new entries
// after the anchor line below; keep that line byte-stable. Shares the DayEntry shape with
// football so the build scripts and feed treat every sport identically. Starts empty by design:
// the desk opened on 2026-09-11 (founder order).
import type { DayEntry } from './worldCupDays';

export const basketballDays: DayEntry[] = [
];
