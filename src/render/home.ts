// Server-rendered front page.
//
// WHY THIS EXISTS. Until phase 2A the homepage shipped three empty <div> rails and filled them
// from JS strings at runtime: a reader with no JS reached the desks and found nothing, and the
// full text of every desk entry (12,000-plus words, growing daily) rode into a content-hashed
// bundle that therefore re-hashed and re-downloaded every morning. This module renders the same
// data into the built HTML instead. The bundle now enhances what is already on the page —
// analytics, the wire's pause-on-hover — rather than creating it.
//
// It runs inside vite.config.ts (the archvHome() plugin, transformIndexHtml), which means it
// runs in dev AND in build, so what a developer sees is what ships. It imports the same
// src/data/*.ts files the feed builder reads, so the front page and dist/feed/*.json can never
// describe different days.
//
// NOTHING HERE MAY EMIT A <script> TAG. index.html carries exactly one inline bootstrap script
// and scripts/check-csp-hash.mjs asserts that; an injected second one would break the CSP gate.
import type { DayEntry } from '../data/worldCupDays';
import { leaguesDays } from '../data/leaguesDays';
import { transferDays } from '../data/transferDays';
import { worldCupDays } from '../data/worldCupDays';
import { entryArt, PLAYERS } from './illustrated';

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
   `urlLane` is the URL segment, which differs for World Cup only. `anchor` is the section id
   the app's fallback share links resolve against. None of the three may be renamed here. */
interface Lane {
  key: 'leagues' | 'transfer' | 'worldcup';
  urlLane: 'leagues' | 'transfer' | 'world-cup';
  anchor: string;
  label: string;
  desk: string;
  band: 'chalk' | 'yellow' | 'lilac';
  days: DayEntry[];
  index: string;
  blurb: string;
}

const LANES: Lane[] = [
  {
    key: 'leagues',
    urlLane: 'leagues',
    anchor: 'football-leagues',
    label: 'Football Leagues',
    desk: 'The Leagues Desk',
    band: 'chalk',
    days: leaguesDays,
    index: '01',
    blurb: 'Title races, promotions, sackings and the tables behind them.',
  },
  {
    key: 'transfer',
    urlLane: 'transfer',
    anchor: 'transfer-desk',
    label: 'Transfer Desk',
    desk: 'The Transfer Desk',
    band: 'yellow',
    days: transferDays,
    index: '02',
    blurb: 'Every move carries its source in the sentence. Done means done, rumour means rumour.',
  },
  {
    key: 'worldcup',
    urlLane: 'world-cup',
    anchor: 'world-cup',
    label: 'International Football',
    desk: 'The International Desk',
    band: 'lilac',
    days: worldCupDays,
    index: '03',
    blurb: "Men's and women's international football, every competition, every day it is on.",
  },
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
// whichever desk filed most recently at the top of the wire and the brief seven times in a row
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

// The status a desk entry carries maps onto the chip the prototype draws. 'verified' means the
// entry has cleared the two-source rule; 'pending' means the day is open and still being
// written. Neither label overstates what the desk has actually done.
function chip(entry: DayEntry): string {
  return entry.status === 'pending'
    ? '<span class="chip chip--open">Updating today</span>'
    : '<span class="chip chip--verified">Verified</span>';
}

/* ---------- card art ----------
   Three sources, in order, resolved by entryArt() in ./illustrated: the entry's own banked
   headshot (public/heads/, committed by the desk job), then a banked portrait of a player named
   in the headline or standfirst, then the ARCHV badge of a club named in the same text. All of
   it is our own artwork. A miss renders no <img> at all rather than a placeholder, because a
   face the archive has not drawn is not a face the archive may show.

   A badge is drawn smaller than a face and takes its own class: it is a mark, not a portrait,
   and at 72px it would sit on the card claiming to be the day's subject. */
function cardArt(entry: DayEntry): string {
  const art = entryArt(entry);
  if (!art) return '';
  if (art.kind === 'club') {
    return `<img class="fcard__badge" src="${esc(art.src)}" alt="${esc(art.alt)}" width="60" height="60" loading="lazy" decoding="async" />`;
  }
  return `<img class="fcard__art" src="${esc(art.src)}" alt="${esc(art.alt)}" width="72" height="72" loading="lazy" decoding="async" />`;
}

/* ---------- the wire ----------
   A CSS marquee, so the track is duplicated in the markup for a seamless loop. The duplicate is
   aria-hidden: a screen reader should hear each line once. */
export function renderWire(): string {
  const lines = roundRobin(9)
    .map(({ entry, lane }) => {
      const tag = lane.key === 'worldcup' ? 'INTERNATIONAL' : lane.label.toUpperCase();
      return `<a class="wire__item" href="${esc(articleUrl(lane, entry))}"><b>${esc(tag)}</b> ${esc(entry.headline)}<span class="wire__dot" aria-hidden="true">&#9679;</span></a>`;
    })
    .join('');
  return `<div class="wire__track">${lines}</div><div class="wire__track" aria-hidden="true">${lines}</div>`;
}

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

  return `<div class="lead__main">
        <span class="kicker">${esc(lane.label)} &middot; ${esc(longDate(entry.date))}</span>
        <h1 class="lead__title"><a href="${esc(url)}" data-desk-card data-lane="${esc(lane.key)}" data-date="${esc(entry.date)}" data-day="${esc(entry.day)}">${esc(entry.headline)}</a></h1>
        <p class="lead__dek">${esc(entry.dek)}</p>
        <p class="lead__meta"><span>Filed by <b>${esc(lane.desk)}</b></span><span>Checked against <b>two sources</b></span><span>Read in <b>under a minute</b></span></p>
        <p class="lead__cta"><a class="btn-solid" href="${esc(url)}">Read the story</a><a class="btn-ghost" href="/desk/${esc(lane.urlLane)}/">Every ${esc(lane.label)} story</a></p>
      </div>
      <aside class="lead__panel" aria-label="How this desk works">
        <span class="index-stamp">The ARCHV &middot; as of ${esc(longDate(entry.date))}</span>
        <h2 class="lead__panel-title">The desk, in numbers</h2>
        <ul class="lead__figures">
          <li><span>Football entries in the archive</span><b>${items.length}</b></li>
          <li><span>Football desks</span><b>${LANES.length}</b></li>
          <li><span>Photographs used</span><b>0</b></li>
        </ul>
        ${art}
        <p class="lead__panel-note">Every number on this site arrives with a name attached. <a href="/standards/">How we verify</a>.</p>
      </aside>`;
}

/* ---------- one section band of cards ---------- */
function renderBand(lane: Lane, skip: DayEntry | null): string {
  const days = sorted(lane.days)
    .filter((d) => d !== skip)
    .slice(0, 3);
  if (!days.length) return '';
  const cards = days
    .map((entry) => {
      const url = articleUrl(lane, entry);
      const art = cardArt(entry);
      return `<article class="fcard">
              ${art}
              ${chip(entry)}
              <h3 class="fcard__headline"><a href="${esc(url)}" data-desk-card data-lane="${esc(lane.key)}" data-date="${esc(entry.date)}" data-day="${esc(entry.day)}">${esc(entry.headline)}</a></h3>
              <p class="fcard__dek">${esc(entry.dek)}</p>
              <p class="fcard__foot"><span>${esc(shortDate(entry.date))}</span><span>${esc(lane.desk)}</span></p>
            </article>`;
    })
    .join('\n            ');

  return `<section class="band band--${lane.band}" id="${esc(lane.anchor)}">
          <div class="band__head">
            <p class="band__index">${esc(lane.index)}</p>
            <h2 class="band__title"><a href="/desk/${esc(lane.urlLane)}/">${esc(lane.label)}</a></h2>
            <span class="band__rule" aria-hidden="true"></span>
            <a class="band__more" href="/desk/${esc(lane.urlLane)}/">More from ${esc(lane.label)} &rarr;</a>
          </div>
          <p class="band__blurb">${esc(lane.blurb)}</p>
          <div class="fcards">
            ${cards}
          </div>
        </section>`;
}

/* ---------- the illustrated library ---------- */
export function renderLibrary(): string {
  if (!PLAYERS.length) return '';
  const figures = PLAYERS.map(
    (p) => `<figure class="hslib__item">
              <img src="${esc(p.src)}" alt="${esc(p.alt)}" width="${p.width}" height="${p.height}" loading="lazy" decoding="async" />
              <figcaption>${esc(p.name)}<span>${esc(p.nation ?? '')}</span></figcaption>
            </figure>`
  ).join('\n            ');
  return `<section class="band band--chalk" id="illustrated-library">
          <div class="band__head">
            <p class="band__index">04</p>
            <h2 class="band__title">The Illustrated Library</h2>
            <span class="band__rule" aria-hidden="true"></span>
            <span class="band__more">Every face, drawn by the desk</span>
          </div>
          <p class="band__blurb">No photographs anywhere on this site. Every player who appears here was drawn for it, in the house style, from a named reference.</p>
          <div class="hslib">
            ${figures}
          </div>
        </section>`;
}

/* ---------- the desk brief rail ---------- */
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
        </ul>
        <div class="brief__cta">
          <h3>The ARCHV Dispatch</h3>
          <p>The long reads go out free on Substack.</p>
          <a class="btn-ghost" href="https://thearchvdispatch.substack.com/subscribe" target="_blank" rel="noopener noreferrer">Read the Dispatch</a>
        </div>`;
}

/* ---------- the three bands ---------- */
export function renderBands(): string {
  const top = allItems()[0] ?? null;
  return LANES.map((lane) => renderBand(lane, top && top.lane === lane ? top.entry : null))
    .filter(Boolean)
    .join('\n\n        ');
}

/* ---------- the dateline ---------- */
export function renderDateline(): string {
  const top = allItems()[0];
  if (!top) return 'Sports history, illustrated';
  return `Latest filed <strong>${esc(longDate(top.entry.date))}</strong>`;
}
