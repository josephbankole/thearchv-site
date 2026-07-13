import { legends } from '../data/legends';

// The card below is built with innerHTML, so every interpolated legend field (including the
// headshot src/alt attribute positions) must be escaped — legend copy is committed data, not
// a hand-typed literal here.
const esc = (s: unknown): string =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// Builds the Legends wall: a grid of illustrated football greats.
// Each card carries a circular headshot, name, nation and a short bio.
// Profiles are rendered into the DOM for SEO. Mirrors the Legends Series on IG.
export function initLegends(): void {
  const grid = document.getElementById('legends-grid');
  if (!grid) return;

  legends.forEach((l) => {
    const li = document.createElement('li');
    li.className = 'legend';

    const meta = l.years ? `${l.nation} · ${l.years}` : l.nation;
    li.innerHTML = `
      <div class="legend__avatar">
        <img src="${esc(l.headshot)}" alt="${esc(l.name)}, illustrated by The ARCHV." width="160" height="160" loading="lazy" decoding="async" />
      </div>
      <p class="legend__no">${esc(l.no)}</p>
      <h3 class="legend__name">${esc(l.name)}</h3>
      <p class="legend__meta">${esc(meta)}</p>
      <p class="legend__bio">${esc(l.bio)}</p>
    `;
    grid.appendChild(li);
  });
}
