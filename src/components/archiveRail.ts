import { posters } from '../data/posters';
import lqip from '../../public/posters/lqip.json';
import { track } from '../analytics';
import { trapFocus } from '../ui/focusTrap';

const LQIP = lqip as Record<string, string>;

// The caption and lightbox markup below are built with innerHTML, so every interpolated
// poster field must be escaped (poster copy is committed data, not a hand-typed literal here).
const esc = (s: unknown): string =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

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
    cap.innerHTML = `<span class="poster__year">${esc(p.year)}</span><span class="poster__host">${esc(p.host)}</span>`;

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
let lbShop: HTMLAnchorElement | null = null;
let lastFocus: HTMLElement | null = null;
let releaseTrap: (() => void) | null = null;

function initLightbox(): void {
  lb = document.getElementById('lightbox');
  lbImg = document.getElementById('lightbox-img') as HTMLImageElement | null;
  lbCap = document.getElementById('lightbox-cap');
  lbShop = document.getElementById('lightbox-shop') as HTMLAnchorElement | null;
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
  lbCap.innerHTML = `<strong>${esc(p.title)}</strong>${esc(p.host)} · ${esc(p.stamp)}. ${esc(p.moment)}`;
  // "Shop this print" appears only once an Etsy listing URL is set on the poster.
  if (lbShop) {
    if (p.etsyUrl) {
      lbShop.href = p.etsyUrl;
      lbShop.hidden = false;
      lbShop.onclick = () => track('lightbox_shop_click', { slug, title: p.title, year: p.year, href: p.etsyUrl });
    } else {
      lbShop.hidden = true;
      lbShop.removeAttribute('href');
      lbShop.onclick = null;
    }
  }
  track('poster_open', { slug, title: p.title, year: p.year, host: p.host });
  lb.hidden = false;
  requestAnimationFrame(() => lb?.classList.add('is-open'));
  document.body.style.overflow = 'hidden';
  (document.getElementById('lightbox-close') as HTMLElement | null)?.focus();
  // Keep Tab/Shift+Tab inside the dialog (close button + the "Buy Now" link when shown)
  // while it is open, so keyboard focus can never wander into the rail behind it.
  releaseTrap = trapFocus(lb);
}

function closeLightbox(): void {
  if (!lb) return;
  lb.classList.remove('is-open');
  document.body.style.overflow = '';
  releaseTrap?.();
  releaseTrap = null;
  setTimeout(() => { if (lb) lb.hidden = true; lastFocus?.focus(); }, 380);
}
