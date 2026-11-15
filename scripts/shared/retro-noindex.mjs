/* shared/retro-noindex.mjs — the staged retroactive noindex list (search plan item (a)).
 *
 * PREVENTION-PLAN.md §1.2 and canon D-2026-09-22d: existing pages go noindex,follow only when all
 * four criteria hold, at most 50 a week and 135 in total, duels first. The list lives in
 * scripts/data/retro-noindex.json, one dated batch per week, so no desk data file is edited and no
 * entry gains a "Revised" line. A listed page stays live and crawlable. Its sitemap.xml row (real
 * lastmod) stays until the batch's sitemapUntil date, the batch date plus 30 days unless the batch
 * names its own, so Google recrawls it and sees the tag; after that the row drops out
 * (retroInSitemap), so Search Console does not report it as "Submitted URL marked noindex" for good.
 *
 * Nothing here can fail the build (plan §6): a missing or malformed file warns and lists nothing.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const FILE = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "retro-noindex.json");

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_SITEMAP_DAYS = 30;

/* The last day a batch's rows stay in sitemap.xml: the batch's own sitemapUntil, else its date plus
   30 days. A batch with neither date keeps its rows (null), which is the old behaviour. */
function sitemapUntil(b) {
  if (typeof b.sitemapUntil === "string" && ISO_DAY.test(b.sitemapUntil)) return b.sitemapUntil;
  if (b.sitemapUntil != null) console.warn(`[retro-noindex] WARN batch ${b.batch} has a bad sitemapUntil ${JSON.stringify(b.sitemapUntil)}; using its date plus ${DEFAULT_SITEMAP_DAYS} days`);
  if (typeof b.date !== "string" || !ISO_DAY.test(b.date)) return null;
  const t = Date.parse(`${b.date}T00:00:00Z`);
  if (Number.isNaN(t)) return null;
  return new Date(t + DEFAULT_SITEMAP_DAYS * 86400000).toISOString().slice(0, 10);
}

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
    const until = sitemapUntil(b);
    for (const p of Array.isArray(b.paths) ? b.paths : []) {
      if (typeof p !== "string" || !p.startsWith("/") || !p.endsWith("/")) {
        console.warn(`[retro-noindex] WARN skipped a bad path in batch ${b.batch}: ${JSON.stringify(p)}`);
        continue;
      }
      if (!map.has(p)) map.set(p, { batch: b.batch, date: b.date, sitemapUntil: until });
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

/* Whether a dated entry at `path` is indexable on `today`: not on the staged retro list, and
   indexDecision (src/lib/entryGates.ts, passed in because this module never loads the TS data)
   says index. The feeds that advertise pages (feed.xml, news-sitemap.xml) use this so a page the
   article generator renders noindex,follow is never syndicated or sent to Google News. Does not
   count as a render for retroNoindexReport. */
export function isIndexable(entry, path, today, indexDecision) {
  if (LISTED.has(path)) return false;
  return indexDecision(entry, today).index;
}

/* Whether a site path keeps its sitemap.xml row on `today` (YYYY-MM-DD, Toronto). An unlisted path
   always does; a listed one does until its batch's sitemapUntil, inclusive. Does not count as a
   render for retroNoindexReport. */
export function retroInSitemap(path, today) {
  const hit = LISTED.get(path);
  if (!hit || !hit.sitemapUntil) return true;
  return String(today).slice(0, 10) <= hit.sitemapUntil;
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
