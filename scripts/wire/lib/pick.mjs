/* pick.mjs: the top item per source per day. The rule is stated in design-final B4 and is the
   only thing here: walk the feed in document order, drop bad links, excluded paths, excluded
   titles, stale or future items and anything already seen, then take the first survivor that
   matches a `prefer` phrase, else the first survivor (editorial order), or the newest survivor
   (chronological order). The next two survivors become alternates for a desk veto. */
import { canonicalUrl, titleKey, urlKey, guidKey, itemId, linkAllowed } from "./canon.mjs";
import { parseFeedDate, dateInZone } from "./time.mjs";

const HOUR = 3600000;

export function compileFilters(defaults, source) {
  const titles = [...(defaults.exclude || []), ...(source.exclude || [])].map((p) => ({ p, re: new RegExp(p, "i") }));
  // Path patterns are regexes tested against the lower-cased path ("/live(/|$)" must not catch "/liverpool").
  const paths = [...(defaults.excludePaths || []), ...(source.excludePaths || [])].map((p) => ({ p, re: new RegExp(p, "i") }));
  return { titles, paths };
}

// Seen set from previous editions. The edition dated `excludeDate` is left out so a same-day
// rerun picks the same stories rather than falling through to worse ones (design-final E2).
export function seenFromEditions(editions = [], excludeDate = null, days = 7) {
  const seen = { guid: new Set(), url: new Set(), title: new Set() };
  const kept = editions.filter((e) => e && e.date !== excludeDate).slice(0, days);
  for (const ed of kept) for (const it of ed.items || []) addSeen(seen, it);
  return seen;
}

// Keys missing from an older stored item are recomputed from its headline and URL.
export function addSeen(seen, it) {
  if (it.guidKey) seen.guid.add(it.guidKey);
  const u = it.urlKey || (it.url ? urlKey(it.url) : null);
  const t = it.titleKey || (it.headline ? titleKey(it.headline) : null);
  if (u) seen.url.add(u);
  if (t) seen.title.add(t);
}

const isSeen = (seen, c) => (c.guidKey && seen.guid.has(c.guidKey)) || (c.urlKey && seen.url.has(c.urlKey)) || seen.title.has(c.titleKey);

/* items: parsed feed items. Returns { pick, alternates, rejected, reason }. */
export function pickTop(items, source, { defaults, seen, nowMs, maxAgeHours }) {
  const filters = compileFilters(defaults, source);
  const maxAge = (maxAgeHours ?? source.maxAgeHours ?? defaults.maxAgeHours ?? 36) * HOUR;
  const rejected = [];
  const survivors = [];
  let counts = { seen: 0, filtered: 0, stale: 0 };

  for (const it of items) {
    const reject = (reason) => rejected.push({ sourceId: source.id, headline: it.title, reason });
    if (!it.title) { reject("no-title"); counts.filtered++; continue; }
    if (!linkAllowed(it.link, source.linkHosts || [])) { reject("bad-link"); counts.filtered++; continue; }
    const path = new URL(it.link).pathname.toLowerCase();
    const badPath = filters.paths.find((f) => f.re.test(path));
    if (badPath) { reject(`excluded-path:${badPath.p}`); counts.filtered++; continue; }
    const badTitle = filters.titles.find((f) => f.re.test(it.title));
    if (badTitle) { reject(`excluded:${badTitle.p}`); counts.filtered++; continue; }
    const when = parseFeedDate(it.published, source.timeZoneHint || "UTC");
    if (when && nowMs - when.ms > maxAge) { counts.stale++; continue; }
    if (when && when.ms - nowMs > HOUR) { reject("future"); counts.stale++; continue; }
    const cand = {
      id: itemId(source.id, { guid: it.guid, url: it.link }),
      sourceId: source.id,
      sourceName: source.name,
      sport: source.sport,
      league: source.league ?? null,
      headline: it.title,
      url: it.link,
      canonicalUrl: canonicalUrl(it.link),
      guidKey: guidKey(it.guid),
      urlKey: urlKey(it.link),
      titleKey: titleKey(it.title),
      publishedAt: when ? new Date(when.ms).toISOString() : null,
      publishedDate: when ? dateInZone(when.ms, source.timeZoneHint || "UTC") : null,
      timePrecision: when ? (source.timePrecision === "exact" && when.exact ? "exact" : "date") : "date",
      position: it.position,
      preferMatched: (source.prefer || []).some((p) => it.title.toLowerCase().includes(p.toLowerCase())),
      summary: it.summary || "",
    };
    if (isSeen(seen, cand)) { reject("seen"); counts.seen++; continue; }
    survivors.push(cand);
  }

  let ordered = survivors;
  if (source.order === "chronological") {
    ordered = [...survivors].sort((a, b) => (b.publishedAt || "").localeCompare(a.publishedAt || "") || a.position - b.position);
  } else {
    const preferred = survivors.find((c) => c.preferMatched);
    if (preferred) ordered = [preferred, ...survivors.filter((c) => c !== preferred)];
  }
  if (!ordered.length) {
    const reason = !items.length ? "no-fresh-item"
      : counts.seen && !counts.filtered && !counts.stale ? "all-seen"
      : counts.filtered && !counts.seen && !counts.stale ? "all-filtered"
      : "no-fresh-item";
    return { pick: null, alternates: [], rejected, reason };
  }
  const [pick, ...rest] = ordered;
  const alternates = rest.slice(0, 2).map(({ id, headline, url, publishedAt, publishedDate, timePrecision, summary, position, guidKey, urlKey, titleKey }) =>
    ({ id, headline, url, publishedAt, publishedDate, timePrecision, summary, position, guidKey, urlKey, titleKey }));
  return { pick, alternates, rejected, reason: null };
}
