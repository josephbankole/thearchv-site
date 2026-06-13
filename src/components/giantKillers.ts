import { gsap } from 'gsap';
import { upsets, giantKillersIntro, giantKillersOutro } from '../data/giantKillers';

// Builds the featured-article accordion. Full text is in the DOM (crawlable).
export function initGiantKillers(animate: boolean): void {
  const intro = document.getElementById('killers-intro');
  const outro = document.getElementById('killers-outro');
  const list = document.getElementById('killers-list');
  if (intro) intro.textContent = giantKillersIntro;
  if (outro) outro.textContent = giantKillersOutro;
  if (!list) return;

  upsets.forEach((u, i) => {
    const li = document.createElement('li');
    li.className = 'killer';

    const panelId = `killer-panel-${i}`;
    const head = document.createElement('button');
    head.className = 'killer__head';
    head.type = 'button';
    head.setAttribute('aria-expanded', 'false');
    head.setAttribute('aria-controls', panelId);
    head.innerHTML = `
      <span class="killer__n">${u.n}</span>
      <span class="killer__match">${u.match}</span>
      <span class="killer__meta">${u.meta}</span>
      <span class="killer__plus" aria-hidden="true">+</span>
    `;

    const panel = document.createElement('div');
    panel.className = 'killer__panel';
    panel.id = panelId;
    panel.setAttribute('role', 'region');
    const inner = document.createElement('div');
    inner.className = 'killer__panel-inner';
    inner.innerHTML = `<p>${u.body}</p>`;
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
