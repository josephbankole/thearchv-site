// The sport registry. One place that says which sports exist, how they are labelled, where
// they live in the URL tree, and which lanes each carries. Football is core and always first.
//
// TWO SOURCES OF TRUTH, kept in step by hand. This TypeScript registry serves the homepage
// bundle and the app-facing side. The build scripts (page shell, feed, sport pages) read the
// mirror in scripts/shared/page-shell.mjs (`SPORTS`), because those are plain .mjs modules that
// cannot import a .ts at run time without bundling. If you change a value here, change it there
// too. The shapes are deliberately identical so a diff is obvious.
export type SportKey = 'football' | 'nfl' | 'f1' | 'tennis' | 'golf';

export interface Sport {
  key: SportKey;
  label: string; // full name: 'Football', 'Formula 1'
  shortLabel: string; // tab text: 'F1' not 'Formula 1'
  urlBase: string; // '' for football (site root), else 'nfl', 'f1', 'tennis', 'golf'
  order: number; // football = 0, always first
  live: boolean; // false = tab renders, section page holds until content
  lanes: string[]; // lane keys valid for this sport
}

export const sports: Sport[] = [
  { key: 'football', label: 'Football', shortLabel: 'Football', urlBase: '', order: 0, live: true, lanes: ['transfer', 'world-cup', 'leagues'] },
  { key: 'nfl', label: 'NFL', shortLabel: 'NFL', urlBase: 'nfl', order: 1, live: true, lanes: ['questions'] },
  { key: 'f1', label: 'Formula 1', shortLabel: 'F1', urlBase: 'f1', order: 2, live: true, lanes: ['questions'] },
  { key: 'tennis', label: 'Tennis', shortLabel: 'Tennis', urlBase: 'tennis', order: 3, live: true, lanes: ['questions'] },
  { key: 'golf', label: 'Golf', shortLabel: 'Golf', urlBase: 'golf', order: 4, live: true, lanes: ['questions'] },
];

export const DEFAULT_SPORT: SportKey = 'football';

// Absent sport on a DayEntry means football (the corpus predates the field). Resolve centrally
// rather than reading a raw field, so a null never leaks into a URL or a feed.
export const sportOf = (e: { sport?: SportKey }): SportKey => e.sport ?? DEFAULT_SPORT;
