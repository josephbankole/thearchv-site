import { track } from '../analytics';

// The Long Reads accordion is SERVER-RENDERED (src/render/home.ts, renderLongReads), and each
// essay is a native <details>. This module creates nothing. It attaches two things to markup that
// is already on the page: the height animation on open and close, and the expand event.
//
// Why that matters more here than anywhere else on the front page: the old version built the
// whole section from JS strings into an empty <ol> whose panels had a CSS resting height of 0.
// A reader with no JS, or with a bundle that failed to arrive, reached eleven essays' worth of
// nothing. <details> is the browser's own disclosure widget, so the accordion now works before
// this file runs and would still work if it never did.
//
// Both failure directions are deliberately safe. Opening sets `open` synchronously and animates
// afterwards, so a missing gsap leaves the panel open at its natural height. Closing is the only
// case that defers the state change to the animation, and if gsap never resolves the panel simply
// stays open — content visible, which is the direction to fail in.
export function initLongReads(animate: boolean): void {
  const list = document.getElementById('long-reads-list');
  if (!list) return;
  const boxes = Array.from(list.querySelectorAll<HTMLDetailsElement>('.killer__box'));
  if (!boxes.length) return;

  // gsap is loaded dynamically and only when animation is actually going to run, so a
  // reduced-motion visitor's page never requests it. Kicked off here rather than lazily on the
  // first click so it is warm by the time a reader opens a panel.
  let gsapPromise: Promise<typeof import('gsap')> | null = null;
  const loadGsap = (): Promise<typeof import('gsap')> => (gsapPromise ??= import('gsap'));
  if (animate) loadGsap();

  boxes.forEach((box, i) => {
    const head = box.querySelector<HTMLElement>('.killer__head');
    const panel = box.querySelector<HTMLElement>('.killer__panel');
    const inner = box.querySelector<HTMLElement>('.killer__panel-inner');
    if (!head || !panel || !inner) return;

    // Analytics rides the toggle event rather than the click, so a keyboard user opening a panel
    // with Enter is counted the same as a pointer. Only the opening half is an event worth having.
    box.addEventListener('toggle', () => {
      if (!box.open) return;
      track('long_read_expand', {
        title: box.dataset.readTitle ?? '',
        kicker: box.dataset.readKicker ?? '',
        index: i,
      });
    });

    if (!animate) return; // reduced motion: the browser's own instant toggle is the design

    head.addEventListener('click', (event) => {
      if (box.open) {
        // Closing. <details> would hide the panel instantly, so hold the state open, animate the
        // height down, and only then let it close.
        event.preventDefault();
        panel.style.height = `${inner.offsetHeight}px`;
        loadGsap().then(
          ({ gsap }) => {
            gsap.to(panel, {
              height: 0,
              duration: 0.6,
              ease: 'power3.inOut',
              onComplete: () => {
                box.open = false;
                panel.style.height = '';
              },
            });
          },
          () => {
            box.open = false;
            panel.style.height = '';
          },
        );
        return;
      }
      // Opening. The browser sets `open` for us on this same click; grow from 0 to the measured
      // height, then hand the height back to CSS so a resize reflows normally.
      requestAnimationFrame(() => {
        const target = inner.offsetHeight;
        panel.style.height = '0px';
        loadGsap().then(
          ({ gsap }) => {
            gsap.to(panel, {
              height: target,
              duration: 0.6,
              ease: 'power3.inOut',
              onComplete: () => {
                panel.style.height = '';
              },
            });
          },
          () => {
            panel.style.height = '';
          },
        );
      });
    });
  });
}
