/* scripts/shared/illustrated.mjs — the one lookup for ARCHV-drawn art on the site.

   Two kinds of asset, both ours: illustrated player portraits and the ARCHV club badges
   (our own typographic disc, never a club's real crest). Files sit in
   public/media/illustrated/ and public/heads/; the registry is scripts/data/illustrated.json.

   Everything that wants to place art goes through here rather than writing a path, so a
   renamed or re-cropped file is one edit. Phase 2A wired the homepage; phase 2B wires the
   article, lane, sport and author templates through entryArt() below.

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

// Diacritics are folded before matching, not after. Football names carry them constantly and
// the desk spells the same player both ways inside one week ("Kone" on Tuesday, "Koné" on
// Thursday). Without the fold, the old normaliser turned "Koné" into "kon" and quietly failed
// to match a portrait that was sitting right there. MIRRORED in src/render/illustrated.ts.
const norm = (s = "") =>
  String(s)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

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

/* Players: the FIRST banked player named in the text, the same rule the iOS app uses
   (scripts/shared/app-art.mjs), so a story shows one face on the site and in the app. The
   subject is the one the headline leads with: "Manchester United sack Michael Carrick and agree
   a deal with Mauricio Pochettino" is Carrick's story. A name counts as whole words only, and on
   a tie in position the longer name wins, so "Bruno Fernandes" beats a shorter name starting at
   the same word. A row may list `aliases`, other names the desk uses for the same man (his
   surname on its own); an alias does not count when the story also names one of the row's
   `aliasUnless`, a different person who shares it. `context` is the text that block is checked
   against: the whole story (headline, standfirst and body), so a son named only in the body
   still switches his father's alias off. MIRRORED in src/render/illustrated.ts. */
function matchIn(padded, p, ctx = padded) {
  let best = null;
  const consider = (name) => {
    const k = norm(name);
    if (!k) return;
    const at = padded.indexOf(` ${k} `);
    if (at >= 0 && (!best || at < best.at || (at === best.at && k.length > best.len))) best = { at, len: k.length };
  };
  consider(p.name);
  const blocked = (p.aliasUnless ?? []).some((u) => norm(u) && ctx.includes(` ${norm(u)} `));
  if (!blocked) for (const a of p.aliases ?? []) consider(a);
  return best;
}

/** True when the text names this player by his full name or one of his aliases. */
export function playerNamed(text, p, context = text) {
  return matchIn(` ${norm(text)} `, p, ` ${norm(context)} `) !== null;
}

/** True when the story names one of the people this player's aliases must not be read as. */
export function aliasBlocked(p, context) {
  const ctx = ` ${norm(context)} `;
  return (p.aliasUnless ?? []).some((u) => norm(u) && ctx.includes(` ${norm(u)} `));
}

/** The first player in `list` named in the text (earliest position, longer name on a tie). */
export function firstPlayerIn(text, list = PLAYERS, context = text) {
  const padded = ` ${norm(text)} `;
  if (!padded.trim()) return null;
  const ctx = ` ${norm(context)} `;
  let best = null, bestM = null;
  for (const p of list) {
    const m = matchIn(padded, p, ctx);
    if (m && (!best || m.at < bestM.at || (m.at === bestM.at && m.len > bestM.len))) { best = p; bestM = m; }
  }
  return best;
}

/** The banked player a block of text is about: the first one it names. */
export const playerInText = (text) => firstPlayerIn(text);

/* ---------- the art a desk entry gets ----------
   One chain, three steps, used by every card and every article page so a reader never sees the
   same story illustrated on the lane front and bare on the article:

     1. the entry's OWN image, if the desk filed one. It always wins: the desk picked that face
        for that day and knows things a name match cannot.
     2. a banked portrait of the first player named in the headline, then the standfirst.
     3. the ARCHV badge of a club named in the same text.

   A miss returns null and the caller renders no <img>. That is the whole discipline: the archive
   shows a face it has drawn or it shows nothing. MIRRORED in src/render/illustrated.ts, which
   serves the front page; the two read the same JSON, so change a matcher and change both. */
export function entryArt(entry) {
  if (!entry) return null;
  if (entry.image) {
    return {
      kind: "entry",
      src: entry.image,
      alt: entry.imageAlt ?? `Illustration: ${entry.headline ?? ""}`,
      width: 240,
      height: 240,
    };
  }
  const text = `${entry.headline ?? ""} ${entry.dek ?? ""}`;
  const player = firstPlayerIn(text, PLAYERS, `${text} ${entry.body ?? ""}`);
  if (player) return { kind: "player", src: player.src, alt: player.alt, width: player.width, height: player.height };
  const club = clubInText(text);
  if (club) return { kind: "club", src: club.src, alt: club.alt, width: club.width, height: club.height };
  return null;
}
