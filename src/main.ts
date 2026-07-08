import '@fontsource-variable/fraunces';
import '@fontsource-variable/inter-tight';
import './style.css';

import { initLongReads } from './components/longReads';
import { initLegends } from './components/legends';
import { initArchiveRail } from './components/archiveRail';
import { initDailyDigest } from './components/dailyDigest';
import { initContactForm } from './components/contactForm';
import { initStickyFollow } from './components/stickyFollow';
import { initChrome } from './ui/chrome';
import { initAnalytics } from './analytics';
import { leaguesDays } from './data/leaguesDays';
import { transferDays } from './data/transferDays';
import { worldCupDays } from './data/worldCupDays';

const root = document.documentElement;
const reducedMotion = root.classList.contains('reduced-motion');
const isMobile = root.classList.contains('is-mobile');
const animate = !reducedMotion;

function boot(): void {
  // Content + conversion paths (must work with zero motion)
  initDailyDigest('leagues-days', leaguesDays, 'leagues');
  initDailyDigest('transfer-days', transferDays, 'transfer');
  initDailyDigest('worldcup-days', worldCupDays, 'worldcup');
  initLongReads(animate);
  initLegends();
  initArchiveRail();
  initContactForm();
  initStickyFollow();

  // Page chrome (progress bar + scroll-spy nav). Affordance, not decoration:
  // runs in every mode; its motion is CSS-gated and reduced-motion safe.
  initChrome();

  // Privacy-friendly analytics (no-op until a PostHog key is configured)
  initAnalytics();

  // Motion layer
  if (animate) {
    import('./anim/scroll').then(({ initScroll }) => initScroll());
  }

  // WebGL hero: desktop only, never under reduced motion. Off the critical path.
  if (animate && !isMobile) {
    const mount = document.getElementById('webgl');
    if (mount) {
      import('./webgl/hero')
        .then(({ initHero }) => initHero(mount))
        .catch(() => { /* WebGL unsupported: navy + grain fallback covers it */ });
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
