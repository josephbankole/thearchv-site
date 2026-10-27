/* shared/retro-noindex.mjs — the staged retroactive noindex list (search plan item (a)).
 *
 * PREVENTION-PLAN.md §1.2 and canon D-2026-09-22d: existing pages go noindex,follow only when all
 * four criteria hold, at most 50 a week and 135 in total, duels first. The list lives in
 * scripts/data/retro-noindex.json, one dated batch per week, so no desk data file is edited and no
 * entry gains a "Revised" line. A listed page stays live, crawlable and in sitemap.xml with its
 * real lastmod until the Page indexing report shows "Excluded by 'noindex' tag".
 *
 * Nothing here can fail the build (plan §6): a missing or malformed file warns and lists nothing.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const FILE = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "retro-noindex.json");

function load() {
  const map = new Map();
  let raw;
  try {
    raw = JSON.parse(readFileSync(FILE, "utf8"));
  } catch (err) {
    console.warn(`[retro-noindex] WARN could not read ${FILE}: ${err && err.message ? err.message : err}; listing nothing`);
    return map;
  }
  for (const b of Array.isArray(raw && raw.batches) ? raw.batches : []) {
    for (const p of Array.isArray(b.paths) ? b.paths : []) {
      if (typeof p !== "string" || !p.startsWith("/") || !p.endsWith("/")) {
        console.warn(`[retro-noindex] WARN skipped a bad path in batch ${b.batch}: ${JSON.stringify(p)}`);
        continue;
      }
      if (!map.has(p)) map.set(p, { batch: b.batch, date: b.date });
    }
  }
  if (map.size > 135) console.warn(`[retro-noindex] WARN ${map.size} paths listed, over the plan's cap of 135`);
  return map;
}

const LISTED = load();
const seen = new Set();

/* The batch a site path belongs to, or null. Pass the path with both slashes: /duel/a-v-b/. */
export function retroNoindex(path) {
  const hit = LISTED.get(path) || null;
  if (hit) seen.add(path);
  return hit;
}

/* One census line per generator: how many of its listed paths it matched. `mine` picks the paths
   this generator owns. A listed path it never matched is a typo or a page that no longer exists;
   that warns, never fails. */
export function retroNoindexReport(label, mine) {
  const owned = [...LISTED.keys()].filter(mine);
  const missed = owned.filter((p) => !seen.has(p));
  console.log(`[${label}] retro noindex (plan 1.2): ${owned.length - missed.length} of ${owned.length} listed page(s) rendered noindex,follow`);
  for (const p of missed) console.warn(`[${label}] WARN retro noindex path matched no page: ${p}`);
}
