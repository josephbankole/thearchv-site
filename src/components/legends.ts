import { legends } from '../data/legends';

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
        <img src="${l.headshot}" alt="${l.name}, illustrated by The ARCHV." width="160" height="160" loading="lazy" decoding="async" />
      </div>
      <p class="legend__no">${l.no}</p>
      <h3 class="legend__name">${l.name}</h3>
      <p class="legend__meta">${meta}</p>
      <p class="legend__bio">${l.bio}</p>
    `;
    grid.appendChild(li);
  });
}
