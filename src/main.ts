import '@fontsource-variable/fraunces';
import '@fontsource-variable/inter-tight';
import './style.css';

import { initFrontCards } from './components/frontCards';
import { initScoresStrip } from './components/scoresStrip';
import { initVideos } from './components/videos';
import { initChrome, initMastheadMenu } from './ui/chrome';
import { initMovedAnchors } from './ui/movedAnchors';
import { initSportTabs } from './ui/sportTabs';
import { initAnalytics } from './analytics';

const root = document.documentElement;
const reducedMotion = root.classList.contains('reduced-motion');
const animate = !reducedMotion;

// Each init runs on its own, so one that throws cannot stop the ones after it. The masthead menu is
// the only route to most sections, so a bad hash or a broken strip must never take it down.
function safe(name: string, init: () => void): void {
  try {
    init();
  } catch (err) {
    console.error(`[boot] ${name} failed`, err);
  }
}

function boot(): void {
  // Old section anchors (#football-leagues and friends) go to the page that holds the section now.
  // First, so the redirect starts before anything else touches the page.
  safe('initMovedAnchors', initMovedAnchors);

  // Every block on this page is in the HTML before this file runs (src/render/home.ts, injected
  // at build time): the lead, Today at the desk and the Desk Brief. The front page was cut back on
  // 2026-10-13 to the scores strip, the day's story, the Desk Brief and a few posters; the desk
  // bands, the legends wall, the long reads accordion, the FAQ and the partnership form left it, and
  // their components (longReads.ts, contactForm.ts) with them. Nothing below creates front-page
  // content; it attaches behaviour to content that is already there. That is the whole point of
  // the rebuild: no reader ever waits on this bundle to see a story.
  safe('initFrontCards', initFrontCards);

  // The live scores strip. Its "All scores" link is server-rendered and always there; this only
  // fills the row of matches beside it from the public scores feed.
  safe('initScoresStrip', initScoresStrip);

  // The video block under the strip. Its cards are server-rendered links to YouTube; this turns a
  // plain click into the player, loaded from YouTube only at that moment.
  safe('initVideos', initVideos);

  // The poster tiles are static links in index.html and need no script. The JS-built plate rail and
  // its lightbox (src/components/archiveRail.ts) were removed on 2026-10-12, when the site moved to
  // the redrawn Manchester United posters only.
  // The fixed mobile Follow bar and its scroll handler (initStickyFollow) were removed on
  // 2026-09-12: 56px pinned over every phone screen of the front page for one follow click in
  // 28 days, with four other Instagram links on the same page.

  // Masthead hamburger (internal destinations above the rule, outbound below). Runs in every
  // mode: it toggles a `hidden` attribute directly, no CSS transition to gate.
  safe('initMastheadMenu', initMastheadMenu);

  // Sport tab bar: scroll the active tab into view. Runs in every mode (instant, no motion).
  safe('initSportTabs', initSportTabs);

  // Page chrome (progress bar + scroll-spy nav). Affordance, not decoration:
  // runs in every mode; its motion is CSS-gated and reduced-motion safe.
  safe('initChrome', initChrome);

  // The football at the head of the scores strip. Its SVG poster is already in the HTML; this
  // only fetches the module that turns it live, and only if the mount is there. The module is a
  // plain file in public/ shared with the static pages (see its header), so it is imported by
  // URL at run time rather than bundled: the path goes through a variable so Vite leaves it be.
  // It honours reduced motion itself (one still frame), so it runs in every mode.
  safe('initSportIcon', () => {
    if (!document.querySelector('[data-sport-icon]')) return;
    const url = '/sport-icons/icon.js';
    import(/* @vite-ignore */ url).catch((err) => console.error('[boot] sport icon failed', err));
  });

  // Privacy-friendly analytics (no-op until a PostHog key is configured)
  safe('initAnalytics', initAnalytics);

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
