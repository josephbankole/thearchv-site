import type { DayEntry } from '../data/worldCupDays';
import { track } from '../analytics';

// Builds a horizontal "scroll through the days" rail of sub-1-minute wrap-up cards.
// Reused by the Transfer Desk and the World Cup sections.
export function initDailyDigest(mountId: string, days: DayEntry[], source: string): void {
  const rail = document.getElementById(mountId);
  if (!rail) return;

  const fmt = (iso: string) => {
    // 2026-06-12 -> "12 JUN" without pulling in a date lib or Date.now()
    const [, m, d] = iso.split('-');
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    return `${parseInt(d, 10)} ${months[parseInt(m, 10) - 1]}`;
  };

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

    card.innerHTML = `
      <div class="day__top">
        ${avatar}
        <span class="day__date">${fmt(entry.date)}</span>
        <span class="day__label">${entry.day}</span>
        ${status}
      </div>
      <h3 class="day__headline">${entry.headline}</h3>
      <p class="day__dek">${entry.dek}</p>
      <p class="day__body">${entry.body}</p>
    `;

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

  enableDrag(rail);
}

// pointer drag-to-scroll, shared behaviour with the poster rail
function enableDrag(rail: HTMLElement): void {
  let down = false, startX = 0, startScroll = 0;
  rail.addEventListener('pointerdown', (e) => {
    down = true; startX = e.clientX; startScroll = rail.scrollLeft; rail.classList.add('is-dragging');
  });
  rail.addEventListener('pointermove', (e) => {
    if (!down) return;
    rail.scrollLeft = startScroll - (e.clientX - startX);
  });
  const end = () => { down = false; rail.classList.remove('is-dragging'); };
  rail.addEventListener('pointerup', end);
  rail.addEventListener('pointerleave', end);
}
