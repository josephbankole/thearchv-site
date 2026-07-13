import type { DayEntry } from '../data/worldCupDays';
import { track } from '../analytics';

// URL lane segment differs from the internal `source` key for World Cup (source
// "worldcup", URL lane "world-cup"), matching thearchv.ca/desk/<lane>/<date>/ from
// scripts/build-article-pages.mjs and the `url` field build-feed.mjs now emits.
const LANES: Record<string, string> = { transfer: 'transfer', worldcup: 'world-cup', leagues: 'leagues' };

// This card is built with innerHTML for template convenience, so every interpolated data
// field (headline, dek, body, image src/alt) must be escaped — this content ultimately comes
// from src/data/*.ts, committed by the daily desk job, not hand-typed literals in this file.
const esc = (s: unknown): string =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// Builds a horizontal "scroll through the days" rail of sub-1-minute wrap-up cards.
// Reused by the Transfer Desk, World Cup and Football Leagues sections.
export function initDailyDigest(mountId: string, days: DayEntry[], source: string): void {
  const rail = document.getElementById(mountId);
  if (!rail) return;
  const lane = LANES[source] ?? source;

  const fmt = (iso: string) => {
    // 2026-06-12 -> "12 JUN" without pulling in a date lib or Date.now()
    const [, m, d] = iso.split('-');
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    return `${parseInt(d, 10)} ${months[parseInt(m, 10) - 1]}`;
  };

  // shared with enableDrag below: a click that ends a drag must not follow the link
  const dragState = { dragged: false };

  days.forEach((entry, i) => {
    // The whole card is one <a> (SITE-DEPTH-PLAN.md W2.2): single accessible link per card,
    // keyboard/screen-reader focusable, no nested links pretending to be the "real" one. The
    // rail is drag-to-scroll, so enableDrag() below suppresses the click when the pointer moved
    // past the threshold between pointerdown and pointerup.
    const card = document.createElement('a');
    card.className = 'day';
    card.setAttribute('role', 'listitem');
    card.href = `/desk/${lane}/${entry.date}/`;
    card.setAttribute('aria-label', entry.headline);

    const status =
      entry.status === 'pending'
        ? '<span class="day__status day__status--live">Updated daily</span>'
        : '<span class="day__status day__status--done">Verified</span>';

    // Optional brand-illustrated headshot (editorial; never a club photo/crest).
    const avatar = entry.image
      ? `<img class="day__avatar" src="${esc(entry.image)}" alt="${esc(entry.imageAlt ?? '')}" loading="lazy" decoding="async" width="52" height="52" />`
      : '';

    card.innerHTML = `
      <div class="day__top">
        ${avatar}
        <span class="day__date">${esc(fmt(entry.date))}</span>
        <span class="day__label">${esc(entry.day)}</span>
        ${status}
      </div>
      <h3 class="day__headline">${esc(entry.headline)}</h3>
      <p class="day__dek">${esc(entry.dek)}</p>
      <p class="day__body">${esc(entry.body)}</p>
    `;

    // guard whole-card navigation against a click that ends a drag
    card.addEventListener('click', (e) => {
      if (dragState.dragged) { e.preventDefault(); return; }
      track('digest_day_open', { source, day: entry.day, date: entry.date, index: i });
    });

    // fire a view event the first time a card scrolls into view
    const io = new IntersectionObserver((entries, obs) => {
      if (entries[0].isIntersecting) {
        track('digest_day_view', { source, day: entry.day, date: entry.date, index: i });
        obs.disconnect();
      }
    }, { threshold: 0.6 });
    io.observe(card);

    rail.appendChild(card);
  });

  enableDrag(rail, dragState);
}

// pointer drag-to-scroll, shared behaviour with the poster rail. Mutates the shared
// `dragState` object so the click guards above (attached before this runs) see live
// updates through the same reference. Threshold is ~8px (SITE-DEPTH-PLAN.md W2.2): past that,
// a pointerdown-to-pointerup sequence is treated as a drag, not a card click.
const DRAG_THRESHOLD_PX = 8;

function enableDrag(rail: HTMLElement, dragState: { dragged: boolean }): void {
  let down = false, startX = 0, startScroll = 0;
  rail.addEventListener('pointerdown', (e) => {
    down = true; dragState.dragged = false; startX = e.clientX; startScroll = rail.scrollLeft;
    rail.classList.add('is-dragging');
  });
  rail.addEventListener('pointermove', (e) => {
    if (!down) return;
    const dx = e.clientX - startX;
    if (Math.abs(dx) > DRAG_THRESHOLD_PX) dragState.dragged = true;
    rail.scrollLeft = startScroll - dx;
  });
  const end = () => { down = false; rail.classList.remove('is-dragging'); setTimeout(() => (dragState.dragged = false), 0); };
  rail.addEventListener('pointerup', end);
  rail.addEventListener('pointerleave', end);
}
