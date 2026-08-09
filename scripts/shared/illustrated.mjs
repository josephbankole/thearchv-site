/* scripts/shared/illustrated.mjs — the one lookup for ARCHV-drawn art on the site.

   Two kinds of asset, both ours: illustrated player portraits and the ARCHV club badges
   (our own typographic disc, never a club's real crest). Files sit in
   public/media/illustrated/ at display size x2; the registry is scripts/data/illustrated.json.

   Everything that wants to place art goes through here rather than writing a path, so a
   renamed or re-cropped file is one edit. Phase 2A wires the homepage; phase 2B wires the
   article templates to the same map.

   Lookup is deliberately forgiving on the way in (any of the slug, the display name, or a
   loose "Manchester United" mention inside a headline) and strict on the way out: a miss
   returns null and the caller renders no <img> at all. Never invent a face for a name that
   has no banked portrait — that is a canon rule, not a nicety. */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const registry = JSON.parse(readFileSync(join(HERE, "..", "data", "illustrated.json"), "utf8"));

export const PLAYERS = registry.players;
export const CLUBS = registry.clubs;

const norm = (s = "") => String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function findBy(list, key) {
  if (!key) return null;
  const n = norm(key);
  return list.find((e) => norm(e.slug) === n || norm(e.name) === n) ?? null;
}

/** Portrait for a player slug or full name. Returns null when nothing is banked. */
export const playerArt = (key) => findBy(PLAYERS, key);

/** ARCHV badge for a club slug or full club name. Returns null when nothing is banked. */
export const clubArt = (key) => findBy(CLUBS, key);

/** The first club named anywhere in a block of text (a headline, a dek). Longest name wins,
    so "Manchester United" never loses to a shorter club that happens to be a substring. */
export function clubInText(text) {
  const n = norm(text);
  if (!n) return null;
  let best = null;
  for (const c of CLUBS) {
    const cn = norm(c.name);
    if (n.includes(cn) && (!best || cn.length > norm(best.name).length)) best = c;
  }
  return best;
}

/** The first banked player named anywhere in a block of text. Same longest-match rule. */
export function playerInText(text) {
  const n = norm(text);
  if (!n) return null;
  let best = null;
  for (const p of PLAYERS) {
    const pn = norm(p.name);
    if (n.includes(pn) && (!best || pn.length > norm(best.name).length)) best = p;
  }
  return best;
}
