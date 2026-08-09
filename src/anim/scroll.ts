import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

// Section titles that get the kinetic split-word reveal instead of the generic fade.
const KINETIC_TITLES =
  '.manifesto__title, .killers__title, .archive__title, .desk__title, .craft__title, .partner__title';

// Split an element's text into word masks (.kin-w > .kin-w__i) so the inner spans can
// rise into view. Existing child elements (e.g. the gold .dot span) are kept intact
// inside their own mask. Runs only when the motion layer loads, so no-JS renders the
// plain heading. Returns the inner spans to animate.
function splitWords(el: HTMLElement): HTMLElement[] {
  const label = el.textContent?.trim() ?? '';
  if (label) el.setAttribute('aria-label', label);
  const inners: HTMLElement[] = [];
  const frag = document.createDocumentFragment();
  const mask = (content: Node): void => {
    const outer = document.createElement('span');
    outer.className = 'kin-w';
    outer.setAttribute('aria-hidden', 'true');
    const inner = document.createElement('span');
    inner.className = 'kin-w__i';
    inner.appendChild(content);
    outer.appendChild(inner);
    frag.appendChild(outer);
    inners.push(inner);
  };
  Array.from(el.childNodes).forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      (node.textContent ?? '').split(/(\s+)/).forEach((chunk) => {
        if (!chunk) return;
        if (/^\s+$/.test(chunk)) frag.appendChild(document.createTextNode(' '));
        else mask(document.createTextNode(chunk));
      });
    } else {
      mask(node);
    }
  });
  el.replaceChildren(frag);
  return inners;
}

// All scroll motion. Never called under prefers-reduced-motion (CSS shows everything).
export function initScroll(): void {
  // Nothing here hides content. Every tween is a gsap.from(), so a motion layer that never
  // loads leaves the page fully readable — which is also why the front page renders its
  // stories server-side and this module only decorates them.

  // kinetic headline reveals: section titles split into words that rise out of a mask.
  // Sub-0.9s total, no bounce, fires once on scroll into view.
  gsap.utils.toArray<HTMLElement>(KINETIC_TITLES).forEach((title) => {
    const words = splitWords(title);
    if (!words.length) return;
    const each = Math.min(0.04, words.length > 1 ? 0.32 / (words.length - 1) : 0.04);
    gsap.from(words, {
      yPercent: 120,
      duration: 0.5,
      ease: 'power3.out',
      stagger: each,
      scrollTrigger: { trigger: title, start: 'top 85%', once: true },
    });
  });

  // generic scroll reveals for everything below the fold
  gsap.utils.toArray<HTMLElement>('[data-reveal]').forEach((el) => {
    if (el.matches(KINETIC_TITLES)) return; // kinetic titles handled above
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
}
