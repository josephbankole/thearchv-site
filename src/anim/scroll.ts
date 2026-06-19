import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

// All scroll motion. Never called under prefers-reduced-motion (CSS shows everything).
export function initScroll(): void {
  // Hero is intentionally NOT hidden by JS. This module is dynamically imported, so
  // gating hero visibility on it left the hero blank until the chunk loaded and the
  // tween finished. The hero entrance is now a pure-CSS fade (.hero__inner in
  // style.css) that paints immediately and is disabled under prefers-reduced-motion.

  // generic scroll reveals for everything below the fold
  gsap.utils.toArray<HTMLElement>('[data-reveal]').forEach((el) => {
    if (el.closest('.hero')) return; // hero handled above
    gsap.from(el, {
      opacity: 0,
      y: 24,
      duration: 0.9,
      ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 85%', once: true },
    });
  });

  // staggered group reveals: a container marked [data-stagger] cascades its items in.
  // Items are the elements marked [data-stagger-item], or the container's direct children
  // as a fallback. Content is visible by default (gsap.from), so a failed motion layer
  // never hides anything.
  gsap.utils.toArray<HTMLElement>('[data-stagger]').forEach((group) => {
    const explicit = group.querySelectorAll<HTMLElement>('[data-stagger-item]');
    const items = explicit.length
      ? Array.from(explicit)
      : (Array.from(group.children) as HTMLElement[]);
    if (!items.length) return;
    gsap.from(items, {
      opacity: 0,
      y: 20,
      duration: 0.7,
      ease: 'power3.out',
      stagger: 0.08,
      scrollTrigger: { trigger: group, start: 'top 82%', once: true },
    });
  });

  // section index numbers draw a thin gold tick as they enter (single accent per section)
  gsap.utils.toArray<HTMLElement>('.section-index').forEach((el) => {
    const tick = document.createElement('span');
    tick.className = 'index-tick';
    el.appendChild(tick);
    gsap.fromTo(
      tick,
      { scaleX: 0 },
      {
        scaleX: 1,
        duration: 0.8,
        ease: 'power2.out',
        scrollTrigger: { trigger: el, start: 'top 80%', once: true },
      },
    );
  });

  // banner band: gentle parallax + reveal as it crosses the viewport
  const banner = document.querySelector<HTMLElement>('.banner-band__img');
  if (banner) {
    gsap.fromTo(
      banner,
      { yPercent: -8, scale: 1.06, opacity: 0.55 },
      {
        yPercent: 8,
        scale: 1,
        opacity: 1,
        ease: 'none',
        scrollTrigger: { trigger: '.banner-band', start: 'top bottom', end: 'bottom top', scrub: true },
      },
    );
  }

  // masthead: hide on scroll down, reveal on scroll up
  const masthead = document.querySelector<HTMLElement>('.masthead');
  if (masthead) {
    let last = 0;
    ScrollTrigger.create({
      start: 0,
      end: 'max',
      onUpdate: (self) => {
        const y = self.scroll();
        if (y > last && y > 200) masthead.classList.add('is-hidden');
        else masthead.classList.remove('is-hidden');
        last = y;
      },
    });
  }
}

export { ScrollTrigger, gsap };
