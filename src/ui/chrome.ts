// Page chrome: a thin scroll-progress bar.
// It is an affordance, not decoration, so it runs even under prefers-reduced-motion. The bar only
// reflects scroll position (an instant transform); all actual motion is governed by CSS, which is
// already disabled by the .reduced-motion class and scroll-behavior: auto.
//
// The vertical scroll-spy section nav that used to live here (.spynav) went on 2026-10-13: it
// listed the front page's sections, and the front page now has exactly one (the archive), so the
// "needs at least two real anchors" test it already carried would never pass again.

import { trapFocus } from './focusTrap';

export function initChrome(): void {
  const docEl = document.documentElement;

  // ---- scroll-progress bar ----
  const bar = document.createElement('div');
  bar.className = 'scroll-progress';
  bar.setAttribute('aria-hidden', 'true');
  const fill = document.createElement('i');
  bar.appendChild(fill);
  document.body.appendChild(bar);

  function measure(): void {
    const scrollTop = window.scrollY || docEl.scrollTop || 0;
    const max = (docEl.scrollHeight - window.innerHeight) || 1;
    const p = Math.min(1, Math.max(0, scrollTop / max));
    fill.style.transform = `scaleX(${p})`;
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
// (the site links, then Follow / Download the app / Shop). No CSS transition
// (the `hidden` attribute is toggled directly), which keeps it reduced-motion
// safe by construction rather than needing a media-query opt-out.
export function initMastheadMenu(): void {
  const toggle = document.getElementById('masthead-toggle') as HTMLButtonElement | null;
  const panel = document.getElementById('masthead-panel') as HTMLElement | null;
  if (!toggle || !panel) return;

  let releaseTrap: (() => void) | null = null;

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
    // Keep Tab/Shift+Tab cycling inside the panel while it is open, and hand focus
    // straight to its first link (standard disclosure-menu behaviour).
    releaseTrap = trapFocus(panel!);
    panel!.querySelector<HTMLElement>('.masthead__panel-link:not([hidden])')?.focus();
  }
  function close(returnFocus: boolean): void {
    panel!.hidden = true;
    toggle!.setAttribute('aria-expanded', 'false');
    document.removeEventListener('keydown', onKeydown);
    document.removeEventListener('click', onDocClick, true);
    releaseTrap?.();
    releaseTrap = null;
    if (returnFocus) toggle!.focus();
  }

  toggle.addEventListener('click', () => {
    if (panel.hidden) open();
    else close(false);
  });
}
