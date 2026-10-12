/* src/lib/entryGates.ts — the search plan's week 4 gates, as pure functions over one day entry.
 *
 * Search plan (AUDIT-2026-09-01/thearchv-review-2026-09-22/PREVENTION-PLAN.md §2), canon
 * D-2026-09-22d. Shipped 2026-10-11, WARN-ONLY for seven days. Every rule here is read by the
 * build and, where a desk files the entry, mirrored in fifa.archv/scripts/archv-site-commit.mjs
 * (that script runs where this repo is not checked out, so it carries its own copy of the
 * regexes; keep the two in step).
 *
 *   G1  index decision. A new entry carries `index`: the commit script stamps "noindex" unless the
 *       desk asks for "index" with the evidence (`demand`, 300 or more words, a living page in
 *       `evergreen`). An entry with no `index` field predates G1 and stays indexable; the staged
 *       retroactive pass under §1.2 starts on 27 October and is a separate change.
 *   G4  sources as deep links: `sources: [{ outlet, url, published }]`. The body keeps its
 *       "Sources:" last line, which the amend path and the app both rely on.
 *   G5  tier: confirmed, reported or rumour (rumour on the transfer lane only). `status` stays the
 *       string the app decodes. The chip is derived here, never stamped.
 *   G6  expiry: a time-bound headline or standfirst needs `expires`. After it, the page shows a
 *       forward line. The index state is kept unless the page then drew 0 impressions in the 30
 *       days after (`postExpiryImpressions: 0`, filed by the Saturday SEO run).
 *   G9  freshness: an indexable page whose `reviewBy` has passed, or whose copy promises a later
 *       update, is listed by scripts/check-freshness.mjs.
 *
 * GATES_ENFORCE is false for the warn-only week: the G1 evidence check, the G6 post-expiry rule
 * and G9 only WARN. The follow-on task flips it on 19 October if the week ran clean. Nothing in
 * this file can fail the build on a data condition (plan §6): public/media rides the same deploy.
 * The one thing live from day one is the default itself, as canon D-2026-09-22d orders: an entry
 * filed with `index: "noindex"` renders noindex,follow, stays in sitemap.xml with its real
 * lastmod, and leaves the news sitemap and the RSS feed.
 */
import { wordCount } from './readTime';

export const GATES_ENFORCE = false;

export type Tier = 'confirmed' | 'reported' | 'rumour';
export interface EntrySource {
  outlet: string;
  url: string;
  published?: string;
}

/** The fields the gates read. A structural subset of DayEntry, so any lane's entry fits. */
export interface GateEntry {
  date: string;
  headline: string;
  dek: string;
  body: string;
  status: string;
  index?: string;
  demand?: unknown;
  evergreen?: string;
  sources?: EntrySource[];
  tier?: string;
  expires?: string;
  reviewBy?: string;
  postExpiryImpressions?: number;
}

/* ---------- G4: sources ---------- */

// The official bodies that may stand alone (D-2026-08-28b): the league's own record for NFL and
// Formula 1 results. Matched on the host, so a deep link to a results page counts.
const OFFICIAL_HOSTS = ['nfl.com', 'formula1.com'];
const hostOf = (url: string): string => {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
};
const isOfficial = (s: EntrySource): boolean => OFFICIAL_HOSTS.some((h) => hostOf(s.url) === h || hostOf(s.url).endsWith(`.${h}`));

export function entrySources(e: GateEntry): EntrySource[] {
  return Array.isArray(e.sources) ? e.sources.filter((s) => s && typeof s.outlet === 'string' && typeof s.url === 'string') : [];
}

/** G4 warnings for one entry. `sport` is the SPORTS key ("football", "nfl", "f1", ...). */
export function sourceProblems(e: GateEntry, sport: string): string[] {
  if (e.sources === undefined) return ['no sources array (G4)'];
  const list = entrySources(e);
  const out: string[] = [];
  if (list.length !== (Array.isArray(e.sources) ? e.sources.length : 0)) out.push('a source is missing outlet or url');
  const soleOfficial = list.length === 1 && (sport === 'nfl' || sport === 'f1') && isOfficial(list[0]);
  if (list.length < 2 && !soleOfficial) out.push(`${list.length} source(s); 2 needed, or 1 official body for NFL and F1`);
  const hosts = new Set<string>();
  for (const s of list) {
    let u: URL | null = null;
    try { u = new URL(s.url); } catch { out.push(`not a URL: ${s.url}`); continue; }
    if (u.protocol !== 'https:') out.push(`not https: ${s.url}`);
    if (u.pathname === '/' || u.pathname === '') out.push(`a home page, not the article: ${s.url}`);
    const h = u.hostname.replace(/^www\./, '');
    if (hosts.has(h)) out.push(`same host twice: ${h}`);
    hosts.add(h);
  }
  return out;
}

/* ---------- G5: tier and the chip ---------- */

const TIERS: Tier[] = ['confirmed', 'reported', 'rumour'];

/** The entry's tier: the filed field when valid, else read off the body's own markers, weakest
 *  first, so an entry that calls any of its claims a rumour never shows as confirmed. */
export function entryTier(e: GateEntry): Tier {
  if (typeof e.tier === 'string' && (TIERS as string[]).includes(e.tier)) return e.tier as Tier;
  if (/\(RUMOUR\)/i.test(e.body)) return 'rumour';
  if (/\(REPORTED\)/i.test(e.body)) return 'reported';
  return 'confirmed';
}

/** G5 warnings. `lane` is the section lane key ("transfer", "questions", ...). */
export function tierProblems(e: GateEntry, lane: string, sport: string): string[] {
  const out: string[] = [];
  if (e.tier === undefined) return ['no tier (G5)'];
  if (!(TIERS as string[]).includes(e.tier)) out.push(`unknown tier "${e.tier}"`);
  if (e.tier === 'rumour' && lane !== 'transfer') out.push('rumour is a transfer-lane tier');
  if (e.tier === 'confirmed' && /\(RUMOUR\)/i.test(e.body)) out.push('tier confirmed over a (RUMOUR) body');
  const list = entrySources(e);
  if (e.tier === 'confirmed' && list.length === 1 && !((sport === 'nfl' || sport === 'f1') && isOfficial(list[0]))) {
    out.push('tier confirmed on one non-official outlet');
  }
  return out;
}

/** The chip a card shows, derived from tier and source count. `null` for a pending day, which
 *  keeps its own "Updating today" chip. */
export function chipLabel(e: GateEntry): { tier: Tier; text: string } | null {
  if (e.status === 'pending') return null;
  const tier = entryTier(e);
  const list = entrySources(e);
  if (tier === 'rumour') return { tier, text: 'Rumour' };
  if (tier === 'reported') return { tier, text: list.length ? `Reported · ${list[0].outlet}` : 'Reported' };
  if (list.length >= 2) return { tier, text: `Confirmed · ${list.length} sources` };
  if (list.length === 1) return { tier, text: `Confirmed · ${list[0].outlet}` };
  return { tier, text: 'Confirmed' };
}

/* ---------- G6: expiry ---------- */

export const TIME_BOUND_RE = /\b(will|deadline|tonight|tomorrow|this week(end)?|is due|expected to|kicks off)\b/i;
export const needsExpiry = (e: GateEntry): boolean => TIME_BOUND_RE.test(`${e.headline} ${e.dek}`);
const isIsoDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
export const isExpired = (e: GateEntry, today: string): boolean => isIsoDate(e.expires) && e.expires < today;

/* ---------- G9: freshness ---------- */

export const FRESHNESS_RE = /re-confirm|to be updated|after \d+ (July|August)|whoever (lifts|wins)/i;
export function freshnessReasons(e: { reviewBy?: string; text: string }, today: string): string[] {
  const out: string[] = [];
  if (isIsoDate(e.reviewBy) && e.reviewBy < today) out.push(`reviewBy ${e.reviewBy} has passed`);
  const m = FRESHNESS_RE.exec(e.text);
  if (m) out.push(`copy promises a later update ("${m[0]}")`);
  return out;
}

/* ---------- G1: the index decision ---------- */

export const INDEX_MIN_WORDS = 300;

/** What an `index: "index"` entry still lacks. */
export function indexEvidenceProblems(e: GateEntry): string[] {
  const out: string[] = [];
  const d = e.demand;
  const hasDemand = (typeof d === 'string' && d.trim() !== '') || (!!d && typeof d === 'object' && typeof (d as { query?: unknown }).query === 'string');
  if (!hasDemand) out.push('no demand evidence (a query and its source, or "official-body event")');
  const words = wordCount(e.dek, e.body);
  if (words < INDEX_MIN_WORDS) out.push(`${words} words, ${INDEX_MIN_WORDS} needed`);
  if (!e.evergreen) out.push('no living page in evergreen');
  return out;
}

export interface IndexDecision {
  index: boolean;
  /** Why the page is noindex now, or would be once GATES_ENFORCE is on. */
  reasons: string[];
  /** True when a reason is only a warning this week. */
  warnOnly: boolean;
}

/** Whether a dated page is indexable. Never throws. */
export function indexDecision(e: GateEntry, today: string): IndexDecision {
  if (e.index === undefined) {
    // Pre-G1 entry: indexable, apart from the G6 and G9 rules, which apply to every page.
    return withLaterRules(e, today, { index: true, reasons: [], warnOnly: false });
  }
  if (e.index !== 'index') return { index: false, reasons: ['filed noindex (G1 default)'], warnOnly: false };
  const missing = indexEvidenceProblems(e).map((r) => `G1: ${r}`);
  return withLaterRules(e, today, { index: true, reasons: missing, warnOnly: missing.length > 0 });
}

function withLaterRules(e: GateEntry, today: string, d: IndexDecision): IndexDecision {
  const reasons = [...d.reasons];
  if (isExpired(e, today) && e.postExpiryImpressions === 0) reasons.push(`G6: expired ${e.expires}, 0 impressions in the 30 days after`);
  for (const r of freshnessReasons({ reviewBy: e.reviewBy, text: `${e.headline} ${e.dek} ${e.body}` }, today)) reasons.push(`G9: ${r}`);
  if (!reasons.length) return d;
  return GATES_ENFORCE ? { index: false, reasons, warnOnly: false } : { index: d.index, reasons, warnOnly: true };
}

// tests-by-assertion, the convention of build-article-pages.mjs: a regression fails the build in
// whichever generator loads this module first. These are code checks, never data checks.
(function selfTest() {
  const base: GateEntry = { date: '2026-10-11', headline: 'A.', dek: 'B.', body: 'C.', status: 'verified' };
  const fail = (m: string) => { throw new Error(`entryGates self-test: ${m}`); };
  if (!indexDecision(base, '2026-10-11').index) fail('a pre-G1 entry stays indexable');
  if (indexDecision({ ...base, index: 'noindex' }, '2026-10-11').index) fail('index "noindex" renders noindex');
  const thin = indexDecision({ ...base, index: 'index' }, '2026-10-11');
  if (!thin.index || !thin.warnOnly || !thin.reasons.length) fail('thin index entry warns, stays indexable this week');
  if (entryTier({ ...base, body: 'X (RUMOUR).' }) !== 'rumour') fail('a (RUMOUR) body reads as rumour');
  if (chipLabel({ ...base, tier: 'confirmed', sources: [{ outlet: 'A', url: 'https://a.com/x' }, { outlet: 'B', url: 'https://b.com/y' }] })?.text !== 'Confirmed · 2 sources') fail('confirmed chip counts sources');
  if (chipLabel({ ...base, status: 'pending' }) !== null) fail('pending keeps its own chip');
  if (!sourceProblems({ ...base, sources: [{ outlet: 'A', url: 'https://a.com/' }] }, 'football').some((p) => p.includes('home page'))) fail('a bare home page warns');
  if (sourceProblems({ ...base, sources: [{ outlet: 'NFL.com', url: 'https://www.nfl.com/news/x' }] }, 'nfl').length) fail('one official NFL source is enough');
  if (!needsExpiry({ ...base, headline: 'Who will win on Sunday?' })) fail('"will" needs an expiry');
  if (!isExpired({ ...base, expires: '2026-10-01' }, '2026-10-11')) fail('a past expiry is expired');
  if (!freshnessReasons({ text: 'Fees to be updated.' }, '2026-10-11').length) fail('"to be updated" is flagged');
})();
