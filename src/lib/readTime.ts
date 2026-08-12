/* src/lib/readTime.ts — how long a piece takes to read, derived from its own word count.
 *
 * THE ONE COPY. Every surface that prints a read time reads it from here: the front page lead
 * and its desk cards (src/render/home.ts), the lane index cards and the sport lane fronts
 * (scripts/build-lane-pages.mjs), every article page's meta line and its NewsArticle schema
 * (scripts/build-article-pages.mjs), and the long reads and their front (build-reads-pages.mjs).
 *
 * It is TypeScript rather than a .mjs in scripts/shared/ for one reason: src/render/home.ts runs
 * through Vite and cannot import an untyped .mjs from outside src/ without a declaration file,
 * whereas every .mjs generator in the chain ALREADY bundles this repo's .ts through esbuild to
 * read the day data. So the TypeScript side is free and the build-script side costs one line in
 * an entry list that already exists. The alternative was a second copy in a second language,
 * which is the drift this file was written to prevent.
 *
 * WPM. 220 words a minute is the middle of the range measured for adults reading non-fiction
 * prose on screen, and it is deliberately not tuned per surface: a desk entry and a long read
 * are the same words at the same speed, and a per-lane constant would only make two pages
 * disagree about the same body of text.
 *
 * The count is words, not characters, and it counts the body a reader actually gets. Callers
 * pass the standfirst and the body together where the page prints both, because the standfirst
 * is the article's first paragraph in every template on this site.
 */

/** Words a minute. One constant, applied to every surface. */
export const WORDS_PER_MINUTE = 220;

/**
 * Whitespace-separated tokens carrying at least one letter or digit. A bare dash or a lone
 * bullet is punctuation a reader's eye passes over, not a word, and counting it would inflate
 * short entries where a handful of tokens moves the rounded minute.
 */
export function wordCount(...parts: (string | null | undefined)[]): number {
  return parts
    .map((p) => String(p ?? ''))
    .join(' ')
    .split(/\s+/)
    .filter((t) => /[\p{L}\p{N}]/u.test(t)).length;
}

/**
 * Minutes, rounded up, never below 1. Rounding up rather than to nearest is the honest
 * direction: a reader given "1 min" for ninety seconds has been undersold their own time, and
 * the number is a promise about their attention rather than a measurement of ours.
 */
export function readMinutes(...parts: (string | null | undefined)[]): number {
  return Math.max(1, Math.ceil(wordCount(...parts) / WORDS_PER_MINUTE));
}

/** "2 min read". The visible form, identical on a card and on the page the card opens. */
export function readLabel(...parts: (string | null | undefined)[]): string {
  return `${readMinutes(...parts)} min read`;
}

/**
 * ISO 8601 duration for schema.org `timeRequired` ("PT2M"). Structured data only; nothing
 * renders this.
 */
export function readDuration(...parts: (string | null | undefined)[]): string {
  return `PT${readMinutes(...parts)}M`;
}

/* tests-by-assertion, the convention scripts/shared/page-shell.mjs uses for its own helpers: a
   regression throws at import time rather than shipping a wrong number onto every card. */
(function selfTest(): void {
  if (wordCount('one two three') !== 3) throw new Error('readTime: plain word count');
  if (wordCount('one two', 'three four') !== 4) throw new Error('readTime: parts are joined before counting');
  if (wordCount('word — word') !== 2) throw new Error('readTime: a bare dash is not a word');
  if (wordCount('') !== 0) throw new Error('readTime: empty input counts nothing');
  if (readMinutes('') !== 1) throw new Error('readTime: the floor is one minute');
  if (readMinutes(new Array(220).fill('word').join(' ')) !== 1) throw new Error('readTime: 220 words is one minute');
  if (readMinutes(new Array(221).fill('word').join(' ')) !== 2) throw new Error('readTime: 221 words rounds up to two');
  if (readLabel(new Array(440).fill('word').join(' ')) !== '2 min read') throw new Error('readTime: label form');
  if (readDuration('') !== 'PT1M') throw new Error('readTime: ISO duration form');
})();
