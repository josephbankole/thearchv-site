import '@fontsource-variable/fraunces';
import '@fontsource-variable/inter-tight';
import './style.css';

import { initGiantKillers } from './components/giantKillers';
import { initArchiveRail } from './components/archiveRail';
import { initTicker } from './components/ticker';
import { initContactForm } from './components/contactForm';
import { initStickyFollow, trackFollows } from './components/stickyFollow';

const root = document.documentElement;
const reducedMotion = root.classList.contains('reduced-motion');
const isMobile = root.classList.contains('is-mobile');
const animate = !reducedMotion;

function boot(): void {
  // Components that always run (content + conversion paths must work with zero motion)
  initGiantKillers(animate);
  initArchiveRail();
  initTicker(animate);
  initContactForm();
  initStickyFollow();
  trackFollows();

  // Motion layer
  if (animate) {
    import('./anim/scroll').then(({ initScroll }) => initScroll());
  }

  // WebGL hero: desktop only, never under reduced motion. Kept off the critical path.
  if (animate && !isMobile) {
    const mount = document.getElementById('webgl');
    if (mount) {
      import('./webgl/hero')
        .then(({ initHero }) => initHero(mount))
        .catch(() => { /* WebGL unsupported: the navy + grain fallback already covers it */ });
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
