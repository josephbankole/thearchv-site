// Page chrome: a thin scroll-progress bar and a vertical scroll-spy section nav.
// These are affordances, not decoration, so they run even under prefers-reduced-motion.
// All actual motion (the nav fade-in, smooth anchor scroll) is governed by CSS, which
// is already disabled by the .reduced-motion class and scroll-behavior: auto. The JS
// here only reflects scroll position and toggles an active state, both instant and safe.

type Section = { id: string; label: string; el: HTMLElement; link: HTMLAnchorElement };

// Curated nav labels. Only sections actually present in the DOM are used, so the
// markup and this list can drift apart without breaking.
const NAV: Array<{ id: string; label: string }> = [
  { id: 'hero', label: 'Top' },
  { id: 'football-leagues', label: 'Football leagues' },
  { id: 'transfer-desk', label: 'Transfer desk' },
  { id: 'world-cup', label: 'International Football' },
  { id: 'archive', label: 'Archive' },
  { id: 'legends', label: 'Legends' },
  { id: 'long-reads', label: 'Long reads' },
  { id: 'faq', label: 'Answers' },
  { id: 'partnerships', label: 'Partner' },
];

export function initChrome(): void {
  const docEl = document.documentElement;

  // ---- scroll-progress bar ----
  const bar = document.createElement('div');
  bar.className = 'scroll-progress';
  bar.setAttribute('aria-hidden', 'true');
  const fill = document.createElement('i');
  bar.appendChild(fill);
  document.body.appendChild(bar);

  // ---- scroll-spy nav ----
  const sections: Section[] = [];
  const nav = document.createElement('nav');
  nav.className = 'spynav';
  nav.setAttribute('aria-label', 'Sections');
  const list = document.createElement('ul');

  for (const item of NAV) {
    const el = document.getElementById(item.id);
    if (!el) continue;
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = `#${item.id}`;
    a.className = 'spynav__link';
    a.innerHTML = `<span class="spynav__tick" aria-hidden="true"></span><span class="spynav__label">${item.label}</span>`;
    li.appendChild(a);
    list.appendChild(li);
    sections.push({ id: item.id, label: item.label, el, link: a });
  }

  // Need at least two real anchors for the nav to be worth showing.
  if (sections.length >= 2) {
    nav.appendChild(list);
    document.body.appendChild(nav);
  }

  let activeId = '';
  let navShown = false;

  function setActive(id: string): void {
    if (id === activeId) return;
    activeId = id;
    for (const s of sections) {
      const on = s.id === id;
      s.link.classList.toggle('is-active', on);
      if (on) s.link.setAttribute('aria-current', 'true');
      else s.link.removeAttribute('aria-current');
    }
  }

  function measure(): void {
    const scrollTop = window.scrollY || docEl.scrollTop || 0;
    const max = (docEl.scrollHeight - window.innerHeight) || 1;
    const p = Math.min(1, Math.max(0, scrollTop / max));
    fill.style.transform = `scaleX(${p})`;

    // Reveal the nav once the hero is mostly behind us. Keeps the top of the page
    // clean (and keeps the gold count down where the gold CTA already sits).
    const heroH = sections[0] ? sections[0].el.offsetHeight : window.innerHeight;
    const shouldShow = scrollTop > heroH * 0.6;
    if (shouldShow !== navShown) {
      navShown = shouldShow;
      nav.classList.toggle('is-visible', shouldShow);
    }

    // Active section: the last one whose top has crossed ~42% of the viewport.
    const line = window.innerHeight * 0.42;
    let current = sections[0]?.id ?? '';
    for (const s of sections) {
      if (s.el.getBoundingClientRect().top <= line) current = s.id;
    }
    // At the very bottom, force the final section active (short last sections never
    // cross the line otherwise).
    if (scrollTop + window.innerHeight >= docEl.scrollHeight - 2) {
      current = sections[sections.length - 1]?.id ?? current;
    }
    setActive(current);
  }

  let ticking = false;
  function onScroll(): void {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      measure();
      ticking = false;
    });
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  measure();
}

// Masthead hamburger menu: a disclosure button that reveals a small dropdown
// (Follow / Subscribe / Shop / App, App hidden until flip day). No CSS transition
// (the `hidden` attribute is toggled directly), which keeps it reduced-motion
// safe by construction rather than needing a media-query opt-out.
export function initMastheadMenu(): void {
  const toggle = document.getElementById('masthead-toggle') as HTMLButtonElement | null;
  const panel = document.getElementById('masthead-panel') as HTMLElement | null;
  if (!toggle || !panel) return;

  function onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') close(true);
  }
  function onDocClick(e: MouseEvent): void {
    const target = e.target as Node;
    if (target !== toggle && !toggle!.contains(target) && !panel!.contains(target)) close(false);
  }
  function open(): void {
    panel!.hidden = false;
    toggle!.setAttribute('aria-expanded', 'true');
    document.addEventListener('keydown', onKeydown);
    document.addEventListener('click', onDocClick, true);
  }
  function close(returnFocus: boolean): void {
    panel!.hidden = true;
    toggle!.setAttribute('aria-expanded', 'false');
    document.removeEventListener('keydown', onKeydown);
    document.removeEventListener('click', onDocClick, true);
    if (returnFocus) toggle!.focus();
  }

  toggle.addEventListener('click', () => {
    if (panel.hidden) open();
    else close(false);
  });
}
