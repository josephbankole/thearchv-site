// Privacy-friendly PostHog wiring.
// - No key configured => everything is a safe no-op (zero network, zero cookies).
// - Lean + privacy-first: autocapture OFF, session recording OFF, respects Do Not Track,
//   localStorage persistence (no third-party cookies), only explicit events are sent.
//
// Configure by EITHER:
//   build env:  VITE_POSTHOG_KEY=phc_xxx  VITE_POSTHOG_HOST=https://us.i.posthog.com
//   or in HTML: <meta name="posthog-key" content="phc_xxx"> <meta name="posthog-host" content="...">
import type { PostHog } from 'posthog-js';

let ph: PostHog | null = null;
let ready = false;
const queue: Array<[string, Record<string, unknown> | undefined]> = [];

function readConfig() {
  const metaKey = document.querySelector<HTMLMetaElement>('meta[name="posthog-key"]')?.content?.trim();
  const metaHost = document.querySelector<HTMLMetaElement>('meta[name="posthog-host"]')?.content?.trim();
  const key = (import.meta.env.VITE_POSTHOG_KEY as string | undefined) || metaKey || '';
  const host = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) || metaHost || 'https://us.i.posthog.com';
  return { key, host };
}

export function isConfigured(): boolean {
  return !!readConfig().key;
}

/* ---------- trailing-slash path normalisation (2026-08-04) ----------
   GitHub Pages already 301s the slashless form (/start -> /start/), and every canonical tag
   on the site ends in a slash, yet PostHog still logged the two as separate pages: 2,506
   visits on /start/ against 477 on /start in the week to 1 August. A canonical tag does not
   merge pageviews and a redirect the analytics client never observes cannot either, so the
   only lever that actually merges them is rewriting the path at capture time.

   Normalise TOWARDS the trailing slash rather than away from it: that is the form the
   canonical tags, dist/sitemap.xml and GitHub Pages itself all already use, so the PostHog
   path breakdown lines up 1:1 with the sitemap instead of sitting one character off it.
   The site root and any path ending in a file extension are left exactly as they are.

   Duplicated, deliberately: the static page family (the hand-built pages under public/ and
   scripts/shared/page-shell.mjs) ships no bundled JS at all, so it carries its own inline
   copy of this same rule. Change one, change the others. */
const TRAILING_SEGMENT = /^([^?#]*[^\/?#])(?=[?#]|$)/;
const FILE_EXTENSION = /\.[a-z0-9]{1,8}$/i;

function archvPath(value: unknown): unknown {
  if (typeof value !== 'string' || value.indexOf('/') < 0) return value;
  return value.replace(TRAILING_SEGMENT, (m) => (FILE_EXTENSION.test(m) ? m : m + '/'));
}

// Fire an analytics event. Safe before init (buffered) and safe with no key (dropped).
export function track(event: string, props?: Record<string, unknown>): void {
  if (ready && ph) {
    ph.capture(event, props);
  } else if (isConfigured()) {
    queue.push([event, props]);
  }
}

export async function initAnalytics(): Promise<void> {
  const { key, host } = readConfig();
  if (!key) return; // dormant until a key is provided

  const { default: posthog } = await import('posthog-js');
  posthog.init(key, {
    api_host: host,
    autocapture: false,
    capture_pageview: true,
    capture_pageleave: true,
    disable_session_recording: true,
    respect_dnt: true,
    persistence: 'localStorage',
    person_profiles: 'identified_only',
    // Runs on every captured event, pageviews included. `before_send` is the current hook;
    // `sanitize_properties` is deprecated in this version of posthog-js.
    before_send: (cr) => {
      if (cr && cr.properties) {
        cr.properties.$current_url = archvPath(cr.properties.$current_url);
        cr.properties.$pathname = archvPath(cr.properties.$pathname);
      }
      return cr;
    },
    loaded: () => {
      ready = true;
      track('site_loaded', { path: location.pathname });
      for (const [e, p] of queue.splice(0)) posthog.capture(e, p);
    },
  });
  ph = posthog;

  setupFollowTracking();
  setupScrollDepth();
  setupSectionViews();
  setupOutboundTracking();
  setupArticleLinkTracking();
  setupNewsletterTracking();
}

// Track clicks to the Dispatch newsletter (Substack subscribe links).
function setupNewsletterTracking(): void {
  document.querySelectorAll<HTMLAnchorElement>('a[href*="substack.com"]').forEach((el) => {
    el.addEventListener('click', () => {
      track('newsletter_click', { href: el.href, location: el.closest('section')?.id || el.className });
    });
  });
}

// Track clicks on finals and United long-form article deep-links.
function setupArticleLinkTracking(): void {
  document.querySelectorAll<HTMLAnchorElement>('.archive__reads a[href]').forEach((el) => {
    el.addEventListener('click', () => {
      track('article_link_click', {
        href: el.getAttribute('href'),
        text: el.textContent?.trim(),
        section: el.closest('section')?.id || '',
      });
    });
  });
}

// Track outbound clicks to the Etsy shop/listings (the poster-funnel KPI).
function setupOutboundTracking(): void {
  document.querySelectorAll<HTMLAnchorElement>('a[href*="etsy.com"]').forEach((el) => {
    el.addEventListener('click', () => {
      track('etsy_click', { href: el.href, location: el.closest('section')?.id || el.className });
    });
  });
}

function setupFollowTracking(): void {
  // Every Instagram link is a follow intent, not only [data-follow] elements. The masthead Follow
  // and the sticky follow bar had no data-follow attribute, so follow_click was badly undercounted.
  document.querySelectorAll<HTMLElement>('a[href*="instagram.com"], [data-follow]').forEach((el) => {
    el.addEventListener('click', () => {
      track('follow_click', { location: el.closest('section')?.id || el.className });
    });
  });
}

// Fire 25 / 50 / 75 / 100 percent scroll-depth milestones once each. Gated behind the same
// requestAnimationFrame ticking pattern src/ui/chrome.ts uses for its scroll-progress bar:
// the 'scroll' event can fire many times per frame, and the measurement below forces a
// layout read (scrollHeight); rAF-gating it caps that to once per frame without changing
// which events fire or when a threshold is considered crossed.
function setupScrollDepth(): void {
  const marks = [25, 50, 75, 100];
  const hit = new Set<number>();

  function measure(): void {
    // window.scrollY is reliable everywhere; documentElement.scrollTop reads 0 in the iOS in-app
    // browsers (Instagram, Facebook) that make up much of the audience, which silently killed this event.
    const scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
    const denom = document.documentElement.scrollHeight - window.innerHeight;
    const pct = denom > 0 ? (scrollTop / denom) * 100 : 0;
    for (const m of marks) {
      if (pct >= m && !hit.has(m)) {
        hit.add(m);
        track('scroll_depth', { percent: m });
      }
    }
    if (hit.size === marks.length) window.removeEventListener('scroll', onScroll);
  }

  let ticking = false;
  function onScroll(): void {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      measure();
      ticking = false;
    });
  }

  window.addEventListener('scroll', onScroll, { passive: true });
}

// Fire one section_view per section the first time it enters the viewport.
function setupSectionViews(): void {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        track('section_view', { section: (e.target as HTMLElement).id });
        io.unobserve(e.target);
      }
    }
  }, { threshold: 0.4 });
  document.querySelectorAll('main section[id]').forEach((s) => io.observe(s));
}
