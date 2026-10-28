/* clubs.mjs: tag a Wire headline with the clubs it names, from the one club table the scores
   server and the app also read (supabase/functions/_shared/clubs.json, archv-clubs/1, spec D5).
   The file is inside this repo, so the Actions build can read it (CLAUDE.md trap 0).

   The rule (spec B1.6): fold case and diacritics, match each club's name and aliases as WHOLE
   words (letters and digits are word characters, as in the app's ClubMatcher.containsWord), and
   drop a hit that sits inside one of the club's notWith phrases ("Newcastle Jets", "Queens Park
   Rangers"). Only the headline is read: the Wire stores no summary. Tags are computed when the
   feed is built, never stored at pick time, so a fix to clubs.json retags the whole 7-day window
   on the next build. pickTop calls the same function only to order and filter its picks. */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const CLUBS_PATH = join(HERE, "..", "..", "..", "supabase", "functions", "_shared", "clubs.json");
export const CLUBS = JSON.parse(readFileSync(CLUBS_PATH, "utf8"));

// "Barça" and "Barca", "Bodø" and "Bodo", "Man Utd’s" and "Man Utd's" fold to the same text. ø, æ
// and ß have no combining form, so they are spelled out by hand.
export function fold(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[‘’ʼ]/g, "'")
    .replace(/ø/gi, "o").replace(/æ/gi, "ae").replace(/ß/g, "ss")
    .toLowerCase();
}

const isWordChar = (ch) => ch !== undefined && /[\p{L}\p{N}]/u.test(ch);

// Every [start, end) span where `needle` occurs in `hay` as a whole word. Both are already folded.
export function wordSpans(needle, hay) {
  const spans = [];
  if (!needle) return spans;
  for (let i = hay.indexOf(needle); i >= 0; i = hay.indexOf(needle, i + 1)) {
    const end = i + needle.length;
    if (!isWordChar(hay[i - 1]) && !isWordChar(hay[end])) spans.push([i, end]);
  }
  return spans;
}

// One compiled matcher per club, built once per table.
function compile(table) {
  return (table.clubs || []).map((c) => ({
    key: c.key,
    names: [...new Set([c.name, ...(c.aliases || [])].map(fold).filter(Boolean))],
    notWith: [...new Set((c.notWith || []).map(fold).filter(Boolean))],
  }));
}
const COMPILED = new WeakMap();
const compiled = (table) => {
  if (!COMPILED.has(table)) COMPILED.set(table, compile(table));
  return COMPILED.get(table);
};

/* The club keys a headline names, sorted. [] for none. */
export function tagClubs(headline, table = CLUBS) {
  const hay = fold(headline);
  if (!hay) return [];
  const keys = [];
  for (const club of compiled(table)) {
    const blocked = club.notWith.flatMap((p) => wordSpans(p, hay));
    const inside = ([s, e]) => blocked.some(([bs, be]) => s >= bs && e <= be);
    if (club.names.some((n) => wordSpans(n, hay).some((span) => !inside(span)))) keys.push(club.key);
  }
  return keys.sort();
}
