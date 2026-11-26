// Club crests for the homepage scores strip (founder ruling, 21 Nov 2026 evening, D-2026-11-21b).
// MIRROR of scripts/shared/crests.mjs: the same registry (scripts/data/crests.json, Wikimedia
// Commons files only, byte for byte in public/logos/crests/), the same name normaliser and the same
// switch value as THIRD_PARTY_LOGOS in scripts/shared/logos.mjs. scripts/test/logos.test.mjs fails
// the build if the switch or normTeam() here drifts from the Node side. Turn every logo off there
// AND here, then rebuild.
import registry from '../../scripts/data/crests.json';

export const THIRD_PARTY_LOGOS = true;

export const normTeam = (s: unknown): string =>
  String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();

type Crest = { file: string; names: string[] };
const byName = new Map<string, string>();
for (const c of (registry as { crests: Crest[] }).crests) {
  for (const n of c.names) byName.set(normTeam(n), `/logos/crests/${c.file}`);
}

/* The crest path for a team name as the feed prints it, or null (no crest, or the switch off). */
export function crestSrc(name: unknown): string | null {
  if (!THIRD_PARTY_LOGOS) return null;
  return byName.get(normTeam(name)) ?? null;
}

/* A decorative <img> (the name is printed beside it), or null. Never parses feed text as markup. */
export function crestEl(name: unknown): HTMLImageElement | null {
  const src = crestSrc(name);
  if (!src) return null;
  const img = document.createElement('img');
  img.className = 'team-crest';
  img.src = src;
  img.alt = '';
  img.setAttribute('aria-hidden', 'true');
  img.width = 16;
  img.height = 16;
  img.decoding = 'async';
  return img;
}
