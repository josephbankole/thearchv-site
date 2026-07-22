// Sport tab bar: bring the active tab into view on load. Horizontal only, so the page never
// jumps vertically. Bundled (not inline) on purpose: the site's CSP allows one hashed inline
// bootstrap and nothing else, and the multi-sport build rule is that tab behaviour lives in a
// module. A no-op on the homepage, where Football is active and already leftmost; it earns its
// keep on the sport section pages, where the active tab can sit off the right edge on mobile.
// Reduced-motion safe by construction: an instant scrollLeft assignment, no animation.
export function initSportTabs(): void {
  const scroller = document.querySelector<HTMLElement>('.sportnav');
  if (!scroller) return;
  const active = scroller.querySelector<HTMLElement>('.sportnav__link[aria-current="page"]');
  if (!active) return;

  // Centre the active tab within the scroller without touching vertical scroll.
  const aRect = active.getBoundingClientRect();
  const sRect = scroller.getBoundingClientRect();
  const delta = aRect.left - sRect.left - (scroller.clientWidth - active.clientWidth) / 2;
  if (delta > 0) scroller.scrollLeft += delta;
}
