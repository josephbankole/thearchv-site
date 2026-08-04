/* src/anim/reveal.ts — the Tier 0 scroll reveal.
 *
 * One IntersectionObserver, no library. GSAP already handles the homepage's static markup
 * ([data-reveal] and [data-stagger] in src/anim/scroll.ts); this covers the cards the bundle
 * injects at runtime, which had no reveal at all. The two never touch the same element.
 *
 * Two rules this file exists to keep:
 *
 * 1. It lives in bundled src/, not in an inline <script>. The site's CSP is script-src 'self'
 *    plus one hash for index.html's early bootstrap, and weakening that to ship an animation
 *    would be a bad trade. Anything here is covered by 'self'.
 *
 * 2. It is only ever pointed at elements this bundle created. The reveal's resting state is
 *    opacity 0 (see [data-inview] in src/style.css), so marking server-rendered markup would
 *    mean a failed bundle leaves real content invisible. Injected cards do not exist without
 *    the bundle, so there is no such failure mode.
 *
 * Reduced motion needs no branch here: the CSS already resolves [data-inview] to its finished
 * state under both prefers-reduced-motion and the .reduced-motion class, so the observer just
 * flips an attribute nothing is animating.
 */

// Cap on the stagger index. Past this the delay stops growing. Kept low deliberately: the rails
// are horizontal, so a card can first intersect the viewport mid-drag, and a card that waits
// half a second after the user has already dragged it into view reads as jank, not as polish.
const MAX_STAGGER = 4;

export function initReveal(root: ParentNode = document): void {
  const groups = Array.from(root.querySelectorAll<HTMLElement>('[data-inview-group]'));
  if (!groups.length) return;

  // No IntersectionObserver (old Safari, odd embedded browsers): show everything and stop.
  if (!('IntersectionObserver' in window)) {
    groups
      .flatMap((g) => Array.from(g.querySelectorAll<HTMLElement>('[data-inview]')))
      .forEach((el) => { el.dataset.inview = 'true'; });
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        (entry.target as HTMLElement).dataset.inview = 'true';
        io.unobserve(entry.target); // reveal once; never re-hide on scroll back
      });
    },
    // rootMargin is deliberately asymmetric. The groups are horizontal scrollers, so a card off
    // the right edge never intersects until the user drags it in; expanding the observer 40% to
    // the right primes the next screenful so dragging reveals already-revealed cards rather than
    // animating under the user's finger. The -5% at the bottom just holds the reveal until a card
    // is properly in view vertically rather than clipping the viewport edge.
    { threshold: 0.12, rootMargin: '0px 40% -5% 0px' },
  );

  groups.forEach((group) => {
    Array.from(group.querySelectorAll<HTMLElement>('[data-inview]')).forEach((el, i) => {
      el.style.setProperty('--i', String(Math.min(i, MAX_STAGGER)));
      io.observe(el);
    });
  });
}
