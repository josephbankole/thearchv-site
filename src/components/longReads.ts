import { gsap } from 'gsap';
import { longReads } from '../data/longReads';

// Builds the Long Reads accordion (origin: ARCHV LinkedIn essays).
// Full essay text is rendered into the DOM so it is crawlable for SEO.
// Reuses the .killers/.killer styles for a consistent archive look.
export function initLongReads(animate: boolean): void {
  const list = document.getElementById('long-reads-list');
  if (!list) return;

  longReads.forEach((r, i) => {
    const li = document.createElement('li');
    li.className = 'killer';

    const panelId = `longread-panel-${i}`;
    const head = document.createElement('button');
    head.className = 'killer__head';
    head.type = 'button';
    head.setAttribute('aria-expanded', 'false');
    head.setAttribute('aria-controls', panelId);
    head.innerHTML = `
      <span class="killer__n">${r.kicker}</span>
      <span class="killer__match">${r.title}</span>
      <span class="killer__meta">${r.meta}</span>
      <span class="killer__plus" aria-hidden="true">+</span>
    `;

    const panel = document.createElement('div');
    panel.className = 'killer__panel';
    panel.id = panelId;
    panel.setAttribute('role', 'region');
    const inner = document.createElement('div');
    inner.className = 'killer__panel-inner';
    inner.innerHTML = r.body
      .split(/\n\s*\n/)
      .map((p) => `<p>${p.trim()}</p>`)
      .join('');
    panel.appendChild(inner);

    head.addEventListener('click', () => {
      const open = li.classList.toggle('is-open');
      head.setAttribute('aria-expanded', String(open));
      const target = open ? inner.offsetHeight : 0;
      if (animate) {
        gsap.to(panel, { height: target, duration: 0.6, ease: 'power3.inOut' });
      } else {
        panel.style.height = open ? 'auto' : '0';
      }
    });

    li.append(head, panel);
    list.appendChild(li);
  });
}
