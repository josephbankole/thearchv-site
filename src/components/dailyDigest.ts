import type { DayEntry } from '../data/worldCupDays';
import { track } from '../analytics';

// URL lane segment differs from the internal `source` key for World Cup (source
// "worldcup", URL lane "world-cup"), matching thearchv.ca/desk/<lane>/<date>/ from
// scripts/build-article-pages.mjs and the `url` field build-feed.mjs now emits.
const LANES: Record<string, string> = { transfer: 'transfer', worldcup: 'world-cup', leagues: 'leagues' };

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
    const card = document.createElement('article');
    card.className = 'day';
    card.setAttribute('role', 'listitem');

    const status =
      entry.status === 'pending'
        ? '<span class="day__status day__status--live">Updated daily</span>'
        : '<span class="day__status day__status--done">Verified</span>';

    // Optional brand-illustrated headshot (editorial; never a club photo/crest).
    const avatar = entry.image
      ? `<img class="day__avatar" src="${entry.image}" alt="${entry.imageAlt ?? ''}" loading="lazy" decoding="async" width="52" height="52" />`
      : '';

    const href = `/desk/${lane}/${entry.date}/`;

    card.innerHTML = `
      <div class="day__top">
        ${avatar}
        <span class="day__date">${fmt(entry.date)}</span>
        <span class="day__label">${entry.day}</span>
        ${status}
      </div>
      <h3 class="day__headline"><a class="day__link" href="${href}">${entry.headline}</a></h3>
      <p class="day__dek">${entry.dek}</p>
      <p class="day__body">${entry.body}</p>
    `;

    // guard the read-through link against a click that ends a drag
    const link = card.querySelector<HTMLAnchorElement>('.day__link');
    link?.addEventListener('click', (e) => {
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
// updates through the same reference.
function enableDrag(rail: HTMLElement, dragState: { dragged: boolean }): void {
  let down = false, startX = 0, startScroll = 0;
  rail.addEventListener('pointerdown', (e) => {
    down = true; dragState.dragged = false; startX = e.clientX; startScroll = rail.scrollLeft;
    rail.classList.add('is-dragging');
  });
  rail.addEventListener('pointermove', (e) => {
    if (!down) return;
    const dx = e.clientX - startX;
    if (Math.abs(dx) > 6) dragState.dragged = true;
    rail.scrollLeft = startScroll - dx;
  });
  const end = () => { down = false; rail.classList.remove('is-dragging'); setTimeout(() => (dragState.dragged = false), 0); };
  rail.addEventListener('pointerup', end);
  rail.addEventListener('pointerleave', end);
}
