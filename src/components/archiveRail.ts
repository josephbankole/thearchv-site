import { posters } from '../data/posters';
import lqip from '../../public/posters/lqip.json';

const LQIP = lqip as Record<string, string>;

// Builds the draggable poster rail + lightbox, with LQIP placeholders and lazy full images.
export function initArchiveRail(): void {
  const rail = document.getElementById('rail');
  const progress = document.getElementById('rail-progress');
  if (!rail) return;

  posters.forEach((p) => {
    const card = document.createElement('button');
    card.className = 'poster';
    card.type = 'button';
    card.setAttribute('role', 'listitem');
    card.dataset.slug = p.slug;
    card.setAttribute('aria-label', `${p.title}, ${p.year}, ${p.host}`);

    const frame = document.createElement('div');
    frame.className = 'poster__frame';
    frame.style.backgroundImage = `url("${LQIP[p.slug] ?? ''}")`;

    const img = new Image();
    img.loading = 'lazy';
    img.decoding = 'async';
    img.alt = `${p.title}. The ${p.year} final at ${p.host}. Original ARCHV illustration.`;
    img.src = `/posters/${p.slug}.webp`;
    img.addEventListener('load', () => img.classList.add('is-loaded'));
    frame.appendChild(img);

    const cap = document.createElement('div');
    cap.className = 'poster__cap';
    cap.innerHTML = `<span class="poster__year">${p.year}</span><span class="poster__host">${p.host}</span>`;

    const title = document.createElement('div');
    title.className = 'poster__title';
    title.textContent = p.title;

    card.append(frame, cap, title);
    card.addEventListener('click', () => {
      if (dragged) return; // ignore click that ended a drag
      openLightbox(p.slug);
    });
    rail.appendChild(card);
  });

  // pointer drag-to-scroll
  let down = false, startX = 0, startScroll = 0, dragged = false;
  rail.addEventListener('pointerdown', (e) => {
    down = true; dragged = false; startX = e.clientX; startScroll = rail.scrollLeft;
    rail.classList.add('is-dragging');
  });
  rail.addEventListener('pointermove', (e) => {
    if (!down) return;
    const dx = e.clientX - startX;
    if (Math.abs(dx) > 6) dragged = true;
    rail.scrollLeft = startScroll - dx;
  });
  const end = () => { down = false; rail.classList.remove('is-dragging'); setTimeout(() => (dragged = false), 0); };
  rail.addEventListener('pointerup', end);
  rail.addEventListener('pointerleave', end);

  // progress bar
  if (progress) {
    const update = () => {
      const max = rail.scrollWidth - rail.clientWidth;
      const pct = max > 0 ? (rail.scrollLeft / max) * 100 : 0;
      progress.style.setProperty('--p', `${Math.max(8, pct)}%`);
    };
    rail.addEventListener('scroll', update, { passive: true });
    update();
  }

  initLightbox();
}

// ---------- lightbox ----------
let lb: HTMLElement | null = null;
let lbImg: HTMLImageElement | null = null;
let lbCap: HTMLElement | null = null;
let lastFocus: HTMLElement | null = null;

function initLightbox(): void {
  lb = document.getElementById('lightbox');
  lbImg = document.getElementById('lightbox-img') as HTMLImageElement | null;
  lbCap = document.getElementById('lightbox-cap');
  const close = document.getElementById('lightbox-close');
  close?.addEventListener('click', closeLightbox);
  lb?.addEventListener('click', (e) => { if (e.target === lb) closeLightbox(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && lb && !lb.hidden) closeLightbox(); });
}

function openLightbox(slug: string): void {
  const p = posters.find((x) => x.slug === slug);
  if (!p || !lb || !lbImg || !lbCap) return;
  lastFocus = document.activeElement as HTMLElement;
  lbImg.src = `/posters/${slug}@2x.webp`;
  lbImg.alt = `${p.title}. The ${p.year} final at ${p.host}. Original ARCHV illustration.`;
  lbCap.innerHTML = `<strong>${p.title}</strong>${p.host} · ${p.stamp}. ${p.moment}`;
  lb.hidden = false;
  requestAnimationFrame(() => lb?.classList.add('is-open'));
  document.body.style.overflow = 'hidden';
  (document.getElementById('lightbox-close') as HTMLElement | null)?.focus();
}

function closeLightbox(): void {
  if (!lb) return;
  lb.classList.remove('is-open');
  document.body.style.overflow = '';
  setTimeout(() => { if (lb) lb.hidden = true; lastFocus?.focus(); }, 380);
}
