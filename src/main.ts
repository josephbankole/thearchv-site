import '@fontsource-variable/fraunces';
import '@fontsource-variable/inter-tight';
import './style.css';

import { initFrontCards } from './components/frontCards';
import { initScoresStrip } from './components/scoresStrip';
import { initChrome, initMastheadMenu } from './ui/chrome';
import { initMovedAnchors } from './ui/movedAnchors';
import { initSportTabs } from './ui/sportTabs';
import { initAnalytics } from './analytics';

const root = document.documentElement;
const reducedMotion = root.classList.contains('reduced-motion');
const animate = !reducedMotion;

function boot(): void {
  // Old section anchors (#football-leagues and friends) go to the page that holds the section now.
  // First, so the redirect starts before anything else touches the page.
  initMovedAnchors();

  // Every block on this page is in the HTML before this file runs (src/render/home.ts, injected
  // at build time): the lead, Today at the desk and the Desk Brief. The front page was cut back on
  // 2026-10-13 to the scores strip, the day's story, the Desk Brief and a few posters; the desk
  // bands, the legends wall, the long reads accordion, the FAQ and the partnership form left it, and
  // their components (longReads.ts, contactForm.ts) with them. Nothing below creates front-page
  // content; it attaches behaviour to content that is already there. That is the whole point of
  // the rebuild: no reader ever waits on this bundle to see a story.
  initFrontCards();

  // The live scores strip. Its "All scores" link is server-rendered and always there; this only
  // fills the row of matches beside it from the public scores feed.
  initScoresStrip();

  // The poster tiles are static links in index.html and need no script. The JS-built plate rail and
  // its lightbox (src/components/archiveRail.ts) were removed on 2026-10-12, when the site moved to
  // the redrawn Manchester United posters only.
  // The fixed mobile Follow bar and its scroll handler (initStickyFollow) were removed on
  // 2026-09-12: 56px pinned over every phone screen of the front page for one follow click in
  // 28 days, with four other Instagram links on the same page.

  // Masthead hamburger (internal destinations above the rule, outbound below). Runs in every
  // mode: it toggles a `hidden` attribute directly, no CSS transition to gate.
  initMastheadMenu();

  // Sport tab bar: scroll the active tab into view. Runs in every mode (instant, no motion).
  initSportTabs();

  // Page chrome (progress bar + scroll-spy nav). Affordance, not decoration:
  // runs in every mode; its motion is CSS-gated and reduced-motion safe.
  initChrome();

  // Privacy-friendly analytics (no-op until a PostHog key is configured)
  initAnalytics();

  // Motion layer
  if (animate) {
    import('./anim/scroll').then(({ initScroll }) => initScroll());
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
