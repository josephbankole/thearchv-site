// Typed reader for the illustrated-art registry (scripts/data/illustrated.json): ARCHV-drawn
// player portraits and ARCHV-designed club badges, both ours, never a club's real crest.
//
// This module is BUILD-TIME ONLY. It is imported by src/render/home.ts, which vite.config.ts
// pulls in to server-render the front page; nothing in the client bundle imports it, so the
// registry never ships to a browser as JSON.
//
// scripts/shared/illustrated.mjs is the same lookup for the plain-Node build scripts (phase 2B
// wires the article templates through it). The two modules share the JSON, which is the part
// that matters: there is one registry, read two ways, because a .mjs generator cannot import a
// .ts module and a Vite config cannot cleanly bundle a script that reads files off import.meta.
// Change the JSON, both see it. Change a matcher, change both.
import registry from '../../scripts/data/illustrated.json';

export interface Art {
  slug: string;
  name: string;
  src: string;
  width: number;
  height: number;
  alt: string;
  nation?: string;
  club?: string;
  // 600px app-grade portrait in public/heads/hd/, served to the iOS feed (scripts/shared/app-art.mjs).
  hd?: string;
  // Other names the desk uses for the same player (a surname on its own), and names of different
  // people who share one, which switch the aliases off. See firstPlayerIn().
  aliases?: string[];
  aliasUnless?: string[];
  // "photo" when the row carries a free-licence Commons photograph (founder ruling, 21 Nov 2026).
  kind?: 'illustration' | 'photo';
  // True on a photo row for someone we never drew (25 Nov 2026): src, alt, width, height and hd are
  // absent, and entryArt() gives share: null. See scripts/shared/illustrated.mjs.
  photoOnly?: boolean;
  credit?: string;
  licence?: Licence;
  photo?: Photo;
}

export interface Licence {
  name: string;
  url: string;
  author: string;
  source: string;
  checked: string;
  // Only on files whose licence requires a credit (26 Nov 2026): the credit the author asked for,
  // the title for CC 2.0/3.0 files, a copyright notice the file carries.
  attribution?: string;
  title?: string;
  copyright?: string;
}

export interface Photo {
  src: string;
  width: number;
  height: number;
  square: string;
  alt: string;
}

export const PLAYERS: Art[] = registry.players as Art[];
export const CLUBS: Art[] = registry.clubs as Art[];

// Diacritics are folded before matching, not after. Football names carry them constantly and the
// desk spells the same player both ways inside one week ("Kone" on Tuesday, "Koné" on Thursday).
// Without the fold, the old normaliser turned "Koné" into "kon" and quietly failed to match a
// portrait that was sitting right there. MIRRORED in scripts/shared/illustrated.mjs.
const norm = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

// Longest name wins, so "Manchester United" is never beaten by a shorter club whose name
// happens to be a substring of the same headline.
function inText(list: Art[], text: string): Art | null {
  const n = norm(text ?? '');
  if (!n) return null;
  let best: Art | null = null;
  for (const e of list) {
    const en = norm(e.name);
    if (n.includes(en) && (!best || en.length > norm(best.name).length)) best = e;
  }
  return best;
}

/* Players: the FIRST banked player named in the text, the same rule the iOS app uses, so a story
   shows one face on the site and in the app. Whole words only; the longer name wins a tie in
   position; `aliases` count unless `context` (the whole story) names one of the row's
   `aliasUnless`. MIRRORED in scripts/shared/illustrated.mjs. */
interface Match {
  at: number;
  len: number;
}

function matchIn(padded: string, p: Art, ctx: string = padded): Match | null {
  let best: Match | null = null;
  const consider = (name: string): void => {
    const k = norm(name);
    if (!k) return;
    const at = padded.indexOf(` ${k} `);
    if (at >= 0 && (!best || at < best.at || (at === best.at && k.length > best.len))) best = { at, len: k.length };
  };
  consider(p.name);
  const blocked = (p.aliasUnless ?? []).some((u) => norm(u) !== '' && ctx.includes(` ${norm(u)} `));
  if (!blocked) for (const a of p.aliases ?? []) consider(a);
  return best;
}

export function firstPlayerIn(text: string, list: Art[] = PLAYERS, context: string = text): Art | null {
  const padded = ` ${norm(text ?? '')} `;
  if (!padded.trim()) return null;
  const ctx = ` ${norm(context ?? '')} `;
  let best: Art | null = null;
  let bestM: Match | null = null;
  for (const p of list) {
    const m = matchIn(padded, p, ctx);
    if (m && (!best || !bestM || m.at < bestM.at || (m.at === bestM.at && m.len > bestM.len))) {
      best = p;
      bestM = m;
    }
  }
  return best;
}

/** The first banked club named anywhere in a block of text. null when nothing is banked. */
export const clubInText = (text: string): Art | null => inText(CLUBS, text);

/** The banked player a block of text is about: the first one it names. null when nothing is banked.
    A miss must render no image: inventing a face for an unbanked name is a canon break. */
export const playerInText = (text: string): Art | null => firstPlayerIn(text);

export interface EntryArt {
  kind: 'entry' | 'player' | 'club' | 'photo';
  src: string;
  alt: string;
  width: number;
  height: number;
  // Photos only: the square crop, the credit, the licence, and the illustration (or the desk's
  // filed image) that stands in for the photo anywhere a file leaves the site.
  square?: string;
  credit?: string;
  licence?: Licence;
  share?: EntryArt | null;
}

interface ArtEntry {
  headline?: string;
  dek?: string;
  body?: string;
  image?: string;
  imageAlt?: string;
}

/* The art a desk entry gets: its own filed image first, then a banked portrait of a player named
   in the headline or standfirst, then the ARCHV badge of a club named in the same text, then
   nothing. A row with a Commons photograph resolves to the photo, carrying its illustration in
   `share`. MIRRORED as entryArt() in scripts/shared/illustrated.mjs, which serves the article,
   lane, sport and author templates. One chain, so the front page and the article page cannot
   illustrate the same story differently. */
export function entryArt(entry: ArtEntry): EntryArt | null {
  if (entry.image) {
    const filed: EntryArt = {
      kind: 'entry',
      src: entry.image,
      alt: entry.imageAlt ?? `Illustration: ${entry.headline ?? ''}`,
      width: 240,
      height: 240,
    };
    const who = playerForImage(entry.image);
    return who && who.kind === 'photo' ? photoArt(who, filed) : filed;
  }
  const text = `${entry.headline ?? ''} ${entry.dek ?? ''}`;
  const player = firstPlayerIn(text, PLAYERS, `${text} ${entry.body ?? ''}`);
  if (player) {
    // A photo-only row has no illustration to share: share is null (MIRRORED, see illustrated.mjs).
    const drawn: EntryArt | null = player.photoOnly ? null : { kind: 'player', src: player.src, alt: player.alt, width: player.width, height: player.height };
    return player.kind === 'photo' ? photoArt(player, drawn) : drawn;
  }
  const club = clubInText(text);
  if (club) return { kind: 'club', src: club.src, alt: club.alt, width: club.width, height: club.height };
  return null;
}

// MIRRORED from scripts/shared/illustrated.mjs (see the photographs note there).
const stemOf = (src: string): string => String(src).split('/').pop()!.replace(/\.[a-z0-9]+$/i, '');

export function playerForImage(src: string): Art | null {
  if (!src) return null;
  const stem = stemOf(src);
  return (
    PLAYERS.find((p) => (p.src && p.src === src) || (p.hd && p.hd === src)) ??
    (src.startsWith('/heads/') ? PLAYERS.find((p) => p.hd && stemOf(p.hd) === stem) : null) ??
    null
  );
}

function photoArt(p: Art, share: EntryArt | null): EntryArt {
  const photo = p.photo!;
  return {
    kind: 'photo',
    src: photo.src,
    square: photo.square,
    alt: photo.alt,
    width: photo.width,
    height: photo.height,
    credit: p.credit,
    licence: { ...p.licence! },
    share,
  };
}

/** The visible credit line for a photo, only where the licence requires one; empty for CC0,
    public domain and non-photos. MIRRORED from scripts/shared/illustrated.mjs (see there). */
export function photoCreditHtml(art: EntryArt | null, esc: (s: string) => string): string {
  if (!art || art.kind !== 'photo' || !art.credit || !art.licence || !art.licence.attribution) return '';
  const l = art.licence;
  const who = art.licence.attribution;
  const title = l.title ? `“${esc(l.title)}” by ` : '';
  const copy = l.copyright ? `, ${esc(l.copyright)}` : '';
  return `Photo: ${title}<a href="${esc(l.source)}" rel="noopener">${esc(who)}</a>${copy}, <a href="${esc(l.url)}" rel="license noopener">${esc(l.name)}</a>, cropped`;
}
