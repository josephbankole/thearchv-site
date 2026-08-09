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
}

export const PLAYERS: Art[] = registry.players;
export const CLUBS: Art[] = registry.clubs;

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

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

/** The first banked club named anywhere in a block of text. null when nothing is banked. */
export const clubInText = (text: string): Art | null => inText(CLUBS, text);

/** The first banked player named anywhere in a block of text. null when nothing is banked.
    A miss must render no image: inventing a face for an unbanked name is a canon break. */
export const playerInText = (text: string): Art | null => inText(PLAYERS, text);
