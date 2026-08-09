import { track } from '../analytics';

// Front-page desk cards. The cards themselves are server-rendered (src/render/home.ts, injected
// by the archvHome() Vite plugin), so this module creates nothing: it only attaches the two
// analytics events the old JS-built day rail used to fire, on the same event names and with the
// same properties, so no PostHog insight breaks on the rebuild.
//
//   digest_day_open  — a card was clicked
//   digest_day_view  — a card first scrolled into view
//
// `source` is the FEED KEY (leagues / transfer / worldcup), read off the element rather than
// hardcoded here, because that key is the contract the feeds and the app share. Index is the
// card's position in document order, which is what the old rail reported too.
export function initFrontCards(): void {
  const cards = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[data-desk-card]'));
  if (!cards.length) return;

  cards.forEach((card, index) => {
    const source = card.dataset.lane ?? '';
    const date = card.dataset.date ?? '';
    const day = card.dataset.day ?? '';

    card.addEventListener('click', () => {
      track('digest_day_open', { source, day, date, index });
    });

    // One observer per card, disconnected on the first hit, matching the old rail's behaviour.
    if (!('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(
      (entries, obs) => {
        if (entries[0].isIntersecting) {
          track('digest_day_view', { source, day, date, index });
          obs.disconnect();
        }
      },
      { threshold: 0.6 },
    );
    io.observe(card);
  });
}
