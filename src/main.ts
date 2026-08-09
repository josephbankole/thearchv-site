import '@fontsource-variable/fraunces';
import '@fontsource-variable/inter-tight';
import './style.css';

import { initFrontCards } from './components/frontCards';
import { initLongReads } from './components/longReads';
import { initLegends } from './components/legends';
import { initArchiveRail } from './components/archiveRail';
import { initContactForm } from './components/contactForm';
import { initStickyFollow } from './components/stickyFollow';
import { initChrome, initMastheadMenu } from './ui/chrome';
import { initReveal } from './anim/reveal';
import { initSportTabs } from './ui/sportTabs';
import { initAnalytics } from './analytics';

const root = document.documentElement;
const reducedMotion = root.classList.contains('reduced-motion');
const animate = !reducedMotion;

function boot(): void {
  // The three desk bands, the lead, the wire and the illustrated library are all in the HTML
  // before this file runs (src/render/home.ts, injected at build time). Nothing below creates
  // front-page content; it attaches behaviour to content that is already there. That is the
  // whole point of the phase 2A rebuild: no reader ever waits on this bundle to see a story.
  initFrontCards();

  // Content + conversion paths (must work with zero motion)
  initLongReads(animate);
  initLegends();
  initArchiveRail();
  initContactForm();
  initStickyFollow();

  // Masthead hamburger (internal destinations above the rule, outbound below). Runs in every
  // mode: it toggles a `hidden` attribute directly, no CSS transition to gate.
  initMastheadMenu();

  // Sport tab bar: scroll the active tab into view. Runs in every mode (instant, no motion).
  initSportTabs();

  // Tier 0 scroll reveal, for elements the bundle injects itself. Never pointed at
  // server-rendered markup: the resting state is opacity 0, so a bundle that failed to load
  // would leave real content invisible.
  initReveal();

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
