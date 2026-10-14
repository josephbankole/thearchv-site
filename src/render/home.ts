// Server-rendered front page.
//
// WHY THIS EXISTS. Until phase 2A the homepage shipped three empty <div> rails and filled them
// from JS strings at runtime: a reader with no JS reached the desks and found nothing, and the
// full text of every desk entry (12,000-plus words, growing daily) rode into a content-hashed
// bundle that therefore re-hashed and re-downloaded every morning. This module renders the same
// data into the built HTML instead. The bundle now enhances what is already on the page —
// analytics, the masthead menu, the long-reads animation — rather than creating it.
//
// It runs inside vite.config.ts (the archvHome() plugin, transformIndexHtml), which means it
// runs in dev AND in build, so what a developer sees is what ships. It imports the same
// src/data/*.ts files the feed builder reads, so the front page and dist/feed/*.json can never
// describe different days.
//
// NOTHING HERE MAY EMIT A <script> TAG. index.html carries exactly one inline bootstrap script
// and scripts/check-csp-hash.mjs asserts that; an injected second one would break the CSP gate.
//
// 2026-10-13 (founder): the front page was cut back to the live scores strip, the day's story
// (the lead and "Today at the desk"), the Desk Brief and a few posters. The three desk bands, the
// legends wall and the long-reads accordion came off it, and so did their renderers: renderBands,
// renderLegends, renderLongReads and the card helpers (chip, cardArt) that only they used. The
// desks, the legends and the long reads all have their own pages (/desk/<lane>/, /legends/,
// /reads/), listed in the masthead menu.
import type { DayEntry } from '../data/worldCupDays';
import { leaguesDays } from '../data/leaguesDays';
import { readLabel } from '../lib/readTime';
import { longreadPlain } from '../lib/longreadMd';
import { longReads } from '../data/longReads';
import { readPath } from '../data/readSlug';
import { entrySources } from '../lib/entryGates';
import { transferDays } from '../data/transferDays';
import { worldCupDays } from '../data/worldCupDays';
import { entryArt } from './illustrated';

/* ---------- escaping ---------- */
// Every interpolated field below comes from src/data/*.ts, committed by the daily desk job
// rather than hand-typed here, so it is escaped on the way into the markup without exception.
const esc = (s: unknown): string =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/* ---------- lanes ----------
   `key` is the FEED KEY and is load-bearing: dist/feed/*.json carries it as `section`, and the
   iOS app renders its shelves off that value (archv-feed/3, CLAUDE.md "the feed contract").
   `urlLane` is the URL segment, which differs for World Cup only. Neither may be renamed here.
   (The `anchor` field went on 2026-10-13 with the bands: #football-leagues, #transfer-desk and
   #world-cup no longer exist on the page, and src/ui/movedAnchors.ts sends them to the desks.) */
interface Lane {
  key: 'leagues' | 'transfer' | 'worldcup';
  urlLane: 'leagues' | 'transfer' | 'world-cup';
  label: string;
  desk: string;
  days: DayEntry[];
}

const LANES: Lane[] = [
  { key: 'leagues', urlLane: 'leagues', label: 'Football Leagues', desk: 'The Leagues Desk', days: leaguesDays },
  { key: 'transfer', urlLane: 'transfer', label: 'Transfer Desk', desk: 'The Transfer Desk', days: transferDays },
  { key: 'worldcup', urlLane: 'world-cup', label: 'International Football', desk: 'The International Desk', days: worldCupDays },
];

const byDateDesc = (a: DayEntry, b: DayEntry): number => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);

const sorted = (days: DayEntry[]): DayEntry[] => [...days].sort(byDateDesc);

interface Item {
  entry: DayEntry;
  lane: Lane;
}

// Every entry across the three football lanes, newest first. Lane order breaks a date tie, so
// the same data always produces the same page (a build that reorders itself is a diff nobody
// can review).
function allItems(): Item[] {
  const out: Item[] = [];
  LANES.forEach((lane) => sorted(lane.days).forEach((entry) => out.push({ entry, lane })));
  return out.sort((a, b) => byDateDesc(a.entry, b.entry));
}

// A front page is not a reverse-chronological dump. Sorting the three desks by date alone puts
// whichever desk filed most recently at the top of the brief six times in a row
// (the transfer desk files daily in a window; the leagues desk does not). Round-robin takes the
// newest unused entry from each lane in turn, so a reader always sees all three desks, and
// within a lane the order is still newest first.
function roundRobin(limit: number): Item[] {
  const queues = LANES.map((lane) => sorted(lane.days).map((entry) => ({ entry, lane })));
  const out: Item[] = [];
  for (let round = 0; out.length < limit; round += 1) {
    let took = false;
    for (const q of queues) {
      const next = q[round];
      if (!next) continue;
      out.push(next);
      took = true;
      if (out.length === limit) break;
    }
    if (!took) break;
  }
  return out;
}

const articleUrl = (lane: Lane, entry: DayEntry): string => `/desk/${lane.urlLane}/${entry.date}/`;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Dates are formatted from the ISO string by hand rather than through Date, which would apply
// the build machine's timezone to a date-only value and can slide it by a day.
function longDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  const month = MONTHS[parseInt(m, 10) - 1];
  if (!month) return iso;
  return `${parseInt(d, 10)} ${month} ${y}`;
}
function shortDate(iso: string): string {
  const [, m, d] = iso.split('-');
  const month = MONTHS[parseInt(m, 10) - 1];
  if (!month) return iso;
  return `${parseInt(d, 10)} ${month.slice(0, 3)}`;
}

// The lead's sourcing line names the outlets the entry itself names (search plan 3.3). It used to
// read "Checked against two sources" on every lead, whatever the entry said. With no sources
// array (an entry filed before G4) it points at how we check instead of claiming a count. The
// /standards/ link stays: it is the front page's only route to the verification policy.
function leadSources(entry: DayEntry): string {
  const outlets = [...new Set(entrySources(entry).map((s) => s.outlet))];
  if (!outlets.length) return '<span><a href="/standards/"><b>How we check</b></a></span>';
  return `<span>Sources: <a href="/standards/"><b>${esc(outlets.join(', '))}</b></a></span>`;
}

/* ---------- the wire: REMOVED 2026-09-12 (site declutter) ----------
   `renderWire()` built a CSS marquee of nine round-robin headlines, duplicated for the loop with
   the second track aria-hidden. The same stories were already in the bands, the brief and the
   today strip, and the hidden track still held focusable links (the one accessibility audit the
   front page failed). Its `<!--archv:wire-->` marker, the `#wire` markup and the `.wire` CSS went
   in the same commit, since the archvHome() plugin throws on a marker with no renderer. */

/* ---------- the lead ---------- */
export function renderLead(): string {
  const items = allItems();
  const top = items[0];
  if (!top) return '';
  const { entry, lane } = top;
  const url = articleUrl(lane, entry);

  // The lead panel only takes a drawn FACE. A club badge is a mark and belongs on a card, not
  // under a caption reading "Original ARCHV illustration" beside the day's biggest story.
  const leadArt = entryArt(entry);
  const art =
    leadArt && leadArt.kind !== 'club'
      ? `<figure class="lead__art">
          <img src="${esc(leadArt.src)}" alt="${esc(leadArt.alt)}" width="160" height="160" loading="eager" fetchpriority="high" decoding="async" />
          <figcaption>Original ARCHV illustration.</figcaption>
        </figure>`
      : '';

  // THE DESK-IN-NUMBERS PANEL WAS REMOVED 2026-08-24 (founder), along with the illustrated
  // library band below. It was an <aside class="lead__panel"> carrying an entry count, a desk
  // count, a "photographs used: 0" line and a note linking to /standards/.
  // Two things inside it were NOT part of what was removed and are kept here rather than lost
  // with the container: the drawn lead portrait, which is the only art at the top of the page,
  // now sits in the main column; and the /standards/ link, which was the front page's only route
  // to the verification policy, now rides on the "two sources" line in the meta row where the
  // claim it backs already was.
  // `.lead__grid` went to a single column in the same change. It was `1.7fr 1fr`, so leaving it
  // would have held an empty right-hand column the width of the deleted panel.
  return `<div class="lead__main">
        <span class="kicker">${esc(lane.label)} &middot; ${esc(longDate(entry.date))}</span>
        <h1 class="lead__title"><a href="${esc(url)}" data-desk-card data-lane="${esc(lane.key)}" data-date="${esc(entry.date)}" data-day="${esc(entry.day)}">${esc(entry.headline)}</a></h1>
        <p class="lead__dek">${esc(entry.dek)}</p>
        <p class="lead__meta"><span>Filed by <b>${esc(lane.desk)}</b></span>${leadSources(entry)}<span><b>${esc(readLabel(entry.dek, entry.body))}</b></span></p>
        <p class="lead__cta"><a class="btn-solid" href="${esc(url)}">Read the story</a><a class="btn-ghost" href="/desk/${esc(lane.urlLane)}/">Every ${esc(lane.label)} story</a></p>
        ${art}
      </div>`;
}

/* ---------- the illustrated library: REMOVED 2026-08-24 (founder) ----------
   `renderLibrary()` built a band of every drawn portrait in the registry, at band index 04,
   under the id `illustrated-library`. Removed on the founder's call along with the desk-in-numbers
   panel above. The registry itself is untouched and still feeds `entryArt()`, which is what puts
   faces on cards, articles and share images, so this removed a display surface and not the art.
   Removed with it: the `<!--archv:library-->` marker in index.html, its entry in the archvHome()
   plugin map in vite.config.ts, the nav row in src/ui/chrome.ts, and the `.hslib` rules in
   src/style.css. The `PLAYERS` import went too, because noUnusedLocals is on and would have
   failed the build on a dangling one. */

/* ---------- the legends wall and the long reads: REMOVED 2026-10-13 (founder) ----------
   `renderLegends()` and `renderLongReads()` filled the legends wall and the long-reads accordion.
   Both sections left the front page when it was cut back to the scores strip, the day's story, the
   Desk Brief and a few posters. The Legends have /legends/ (build-section-pages.mjs) and the
   essays have /reads/ and one page each (build-reads-pages.mjs), and both are in the masthead
   menu. The `<!--archv:legends-->` and `<!--archv:longreads-->` markers went from index.html and
   from the archvHome() plugin map in vite.config.ts in the same commit, since the plugin throws on
   a marker with no renderer. src/components/longReads.ts, which animated the accordion, is gone too. */

/* ---------- the desk brief ----------
   A side rail beside the three desk bands until 2026-10-13; now a full-width block of its own,
   since the bands came off the front page. It still takes one entry from each desk in turn
   (roundRobin) so a reader sees all three, newest first within a desk, and it ended in a "The
   ARCHV Dispatch / Read the Dispatch" box until 2026-10-12 (the Dispatch is paused, D-2026-10-06a). */
export function renderBrief(): string {
  const lead = allItems()[0];
  const items = roundRobin(7)
    .filter((i) => !lead || i.entry !== lead.entry)
    .slice(0, 6);
  const lines = items
    .map(
      ({ entry, lane }) => `<li><a href="${esc(articleUrl(lane, entry))}">
              <time datetime="${esc(entry.date)}">${esc(shortDate(entry.date))} &middot; ${esc(lane.label)}</time>
              <b>${esc(entry.headline)}</b>
            </a></li>`
    )
    .join('\n            ');
  return `<h2 class="brief__title">The Desk Brief</h2>
        <p class="brief__sub">The three football desks, newest first</p>
        <ul class="brief__list">
            ${lines}
        </ul>`;
}

/* ---------- the dispatch (long reads) ----------
   In the spot "Today at the desk" held until 2026-10-13 (founder: "remove today at the desk, it
   repeats the football leagues ... instead have the long reads there ... substack articles"). Every
   long read is a Dispatch issue copied word for word from Substack, so this lists the three newest,
   each a whole-row link to its /reads/ page, plus a link to the full list. */
const HOME_READS = 3;

export function renderReads(): string {
  const reads = [...longReads].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, HOME_READS);
  const items = reads
    .map(
      (r) => `<li class="homereads__item"><a href="${esc(readPath(r.title))}">
              <span class="homereads__kicker">${esc(longDate(r.date))}</span>
              <span class="homereads__headline">${esc(r.title)}</span>
              <span class="homereads__time">${esc(readLabel(longreadPlain(r.body)))}</span>
            </a></li>`
    )
    .join('\n            ');
  return `<h2 class="homereads__title" id="homereads-title">The Dispatch</h2>
          <a class="homereads__all" href="/reads/">All issues</a>
        <ul class="homereads__list">
            ${items}
        </ul>`;
}

/* ---------- the dateline: REMOVED 2026-09-12 (site declutter) ----------
   `renderDateline()` filled a strip above the masthead reading "Latest filed <date>", which the
   "Today at the desk" block already states lower down. Marker, markup and `.topbar` CSS went with
   it. */
