import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

// All scroll motion. Never called under prefers-reduced-motion (CSS shows everything).
export function initScroll(): void {
  // hero lines settle in on load
  const heroLines = gsap.utils.toArray<HTMLElement>('[data-reveal-line]');
  gsap.to(heroLines, {
    opacity: 1,
    y: 0,
    duration: 1.1,
    ease: 'expo.out',
    stagger: 0.12,
    delay: 0.15,
  });

  // hero supporting elements
  gsap.to('.hero [data-reveal]', {
    opacity: 1,
    y: 0,
    duration: 1,
    ease: 'power3.out',
    stagger: 0.1,
    delay: 0.5,
  });

  // generic scroll reveals for everything below the fold
  gsap.utils.toArray<HTMLElement>('[data-reveal]').forEach((el) => {
    if (el.closest('.hero')) return; // hero handled above
    gsap.to(el, {
      opacity: 1,
      y: 0,
      duration: 0.9,
      ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 85%', once: true },
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
