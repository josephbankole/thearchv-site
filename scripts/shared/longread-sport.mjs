/* longread-sport.mjs: the sport of a long read (2026-10-28, founder: "Per sport, tag reads").
   One of the feed's sport keys, or "multi" for a Dispatch issue that covers every sport, so the
   app can show the Dispatch on each sport tab (All shows every read; a sport tab shows its own and
   "multi").

   The entry's own `sport` wins: every issue filed through archv-site-commit.mjs longread from
   2026-10-28 carries one. Older issues come from the hand-read backfill in
   scripts/data/longread-sports.json, keyed by /reads/ slug. That table lives outside
   src/data/longReads.ts because the engine owns that file and deploy-site.sh keeps main's copy.
   A value outside the list is dropped, and a read with neither is published with no key, which
   the app reads as "All only". Pure apart from the one JSON read at import. */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const TABLE = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "data", "longread-sports.json"), "utf8"));
export const LONGREAD_SPORTS = TABLE.sports;
export const LONGREAD_BACKFILL = TABLE.bySlug;

// `path` is the read's /reads/<slug>/ path (readPath(title)), so the slug rule stays in one place.
export function resolveLongReadSport(r, path, { warn = () => {}, backfill = LONGREAD_BACKFILL } = {}) {
  const slug = String(path).replace(/^\/reads\/|\/$/g, "");
  const sport = r.sport ?? backfill[slug];
  if (sport === undefined) {
    warn(`long read "${r.title}" has no sport (file it with one)`);
    return null;
  }
  if (!LONGREAD_SPORTS.includes(sport)) {
    warn(`long read "${r.title}": sport "${sport}" is not one of ${LONGREAD_SPORTS.join(", ")}, dropped`);
    return null;
  }
  return sport;
}
