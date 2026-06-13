// Persistent mobile Follow bar: appears once the hero is scrolled past.
export function initStickyFollow(): void {
  const bar = document.querySelector<HTMLElement>('.follow-bar');
  if (!bar) return;
  const onScroll = () => {
    if (window.scrollY > window.innerHeight * 0.8) bar.classList.add('is-visible');
    else bar.classList.remove('is-visible');
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

// Lightweight outbound-Follow tracking hook (no third-party script; safe no-op until analytics added).
export function trackFollows(): void {
  document.querySelectorAll<HTMLElement>('[data-follow]').forEach((el) => {
    el.addEventListener('click', () => {
      // If an analytics layer is later added, surface the intent here.
      (window as unknown as { dataLayer?: unknown[] }).dataLayer?.push?.({ event: 'follow_click' });
    });
  });
}
