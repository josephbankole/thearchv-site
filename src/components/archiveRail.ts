import { posters, posterPacks, bundleUrl, type Poster, type PosterPack } from '../data/posters';
import { track } from '../analytics';
import { trapFocus } from '../ui/focusTrap';

// The caption, pack head and lightbox markup below are built with innerHTML, so every
// interpolated poster field must be escaped (poster copy is committed data, not a literal here).
const esc = (s: unknown): string =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const altFor = (p: Poster): string => `${p.title}. ${p.city}, ${p.year}. Original ARCHV plate.`;
const packOf = (p: Poster): PosterPack | undefined => posterPacks.find((k) => k.slug === p.pack);

// Builds one draggable rail per archive pack (pack name, line and "Get the pack" above it),
// then the lightbox. Plates are lazy JPGs under /posters/<pack>/.
export function initArchiveRail(): void {
  const host = document.getElementById('archive-packs');
  if (!host) return;

  posterPacks.forEach((pack) => {
    const plates = posters.filter((p) => p.pack === pack.slug);
    if (!plates.length) return;

    const group = document.createElement('div');
    group.className = 'archive__pack';
    group.id = `pack-${pack.slug}`;

    const nameId = `pack-${pack.slug}-name`;
    const head = document.createElement('div');
    head.className = 'wrap archive__pack-head';
    head.innerHTML =
      `<h3 class="archive__pack-name" id="${esc(nameId)}">${esc(pack.name)}</h3>` +
      `<p class="archive__pack-line">${esc(pack.summary)}</p>` +
      `<a class="archive__covers-all archive__pack-cta" href="${esc(pack.gumroadUrl)}" target="_blank" rel="noopener noreferrer">Get the pack</a>`;
    head.querySelector('a')?.addEventListener('click', () =>
      track('pack_click', { pack: pack.slug, location: 'archive_head', href: pack.gumroadUrl }),
    );

    const rail = document.createElement('div');
    rail.className = 'rail';
    rail.setAttribute('role', 'list');
    rail.setAttribute('aria-labelledby', nameId);

    const hint = document.createElement('div');
    hint.className = 'wrap archive__hint';
    const progress = document.createElement('span');
    progress.className = 'rail__progress';
    progress.setAttribute('aria-hidden', 'true');
    hint.appendChild(progress);

    group.append(head, rail, hint);
    host.appendChild(group);
    wireRail(rail, progress, plates);
  });

  const bundle = document.createElement('div');
  bundle.className = 'wrap archive__bundle';
  bundle.innerHTML = `<a class="archive__covers-all" href="${esc(bundleUrl)}" target="_blank" rel="noopener noreferrer">All six packs in one: Sixty Moments, The Complete Archive</a>`;
  bundle.querySelector('a')?.addEventListener('click', () =>
    track('pack_click', { pack: 'sixty-moments', location: 'archive_bundle', href: bundleUrl }),
  );
  host.appendChild(bundle);

  initLightbox();
}

function wireRail(rail: HTMLElement, progress: HTMLElement, plates: Poster[]): void {
  let down = false, startX = 0, startScroll = 0, dragged = false;

  plates.forEach((p) => {
    const card = document.createElement('button');
    card.className = 'poster';
    card.type = 'button';
    card.setAttribute('role', 'listitem');
    card.dataset.slug = p.slug;
    card.setAttribute('aria-label', `${p.title}, ${p.city} ${p.year}`);

    const frame = document.createElement('div');
    frame.className = 'poster__frame';

    const img = new Image();
    img.loading = 'lazy';
    img.decoding = 'async';
    img.width = 1000;
    img.height = 1500;
    img.alt = altFor(p);
    img.src = p.image;
    img.addEventListener('load', () => img.classList.add('is-loaded'));
    frame.appendChild(img);

    const cap = document.createElement('div');
    cap.className = 'poster__cap';
    cap.innerHTML = `<span class="poster__year">${esc(p.year)}</span><span class="poster__host">${esc(p.city)}</span>`;

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
  const update = () => {
    const max = rail.scrollWidth - rail.clientWidth;
    const pct = max > 0 ? (rail.scrollLeft / max) * 100 : 0;
    progress.style.setProperty('--p', `${Math.max(8, pct)}%`);
  };
  rail.addEventListener('scroll', update, { passive: true });
  update();
}

// ---------- lightbox ----------
let lb: HTMLElement | null = null;
let lbImg: HTMLImageElement | null = null;
let lbCap: HTMLElement | null = null;
let lbPack: HTMLAnchorElement | null = null;
let lbShop: HTMLAnchorElement | null = null;
let lastFocus: HTMLElement | null = null;
let releaseTrap: (() => void) | null = null;

function initLightbox(): void {
  lb = document.getElementById('lightbox');
  lbImg = document.getElementById('lightbox-img') as HTMLImageElement | null;
  lbCap = document.getElementById('lightbox-cap');
  lbPack = document.getElementById('lightbox-pack') as HTMLAnchorElement | null;
  lbShop = document.getElementById('lightbox-shop') as HTMLAnchorElement | null;
  const close = document.getElementById('lightbox-close');
  close?.addEventListener('click', closeLightbox);
  lb?.addEventListener('click', (e) => { if (e.target === lb) closeLightbox(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && lb && !lb.hidden) closeLightbox(); });
}

function setLink(a: HTMLAnchorElement | null, href: string | undefined, onClick: () => void): void {
  if (!a) return;
  if (href) {
    a.href = href;
    a.hidden = false;
    a.onclick = onClick;
  } else {
    a.hidden = true;
    a.removeAttribute('href');
    a.onclick = null;
  }
}

function openLightbox(slug: string): void {
  const p = posters.find((x) => x.slug === slug);
  if (!p || !lb || !lbImg || !lbCap) return;
  const pack = packOf(p);
  lastFocus = document.activeElement as HTMLElement;
  lbImg.src = p.image;
  lbImg.alt = altFor(p);
  lbCap.innerHTML =
    `<strong>${esc(p.title)}</strong>${esc(p.city)} · ${esc(p.stamp)}. ${esc(p.moment)}` +
    (pack ? `<span class="lightbox__pack">From ${esc(pack.name)}</span>` : '');
  // "Get the pack" always (every plate sells in its Gumroad pack); "Buy the print" only
  // where the plate has its own Etsy listing.
  setLink(lbPack, pack?.gumroadUrl, () =>
    track('lightbox_pack_click', { slug, pack: p.pack, title: p.title, year: p.year, href: pack?.gumroadUrl }),
  );
  setLink(lbShop, p.etsyUrl, () =>
    track('lightbox_shop_click', { slug, pack: p.pack, title: p.title, year: p.year, href: p.etsyUrl }),
  );
  track('poster_open', { slug, pack: p.pack, title: p.title, year: p.year, city: p.city });
  lb.hidden = false;
  requestAnimationFrame(() => lb?.classList.add('is-open'));
  document.body.style.overflow = 'hidden';
  (document.getElementById('lightbox-close') as HTMLElement | null)?.focus();
  // Keep Tab/Shift+Tab inside the dialog (close button plus whichever buy links are shown)
  // while it is open, so keyboard focus can never wander into the rails behind it.
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
