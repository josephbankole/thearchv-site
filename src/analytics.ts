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
}

function setupFollowTracking(): void {
  document.querySelectorAll<HTMLElement>('[data-follow]').forEach((el) => {
    el.addEventListener('click', () => {
      track('follow_click', { location: el.closest('section')?.id || el.className });
    });
  });
}

// Fire 25 / 50 / 75 / 100 percent scroll-depth milestones once each.
function setupScrollDepth(): void {
  const marks = [25, 50, 75, 100];
  const hit = new Set<number>();
  const onScroll = () => {
    const doc = document.documentElement;
    const denom = doc.scrollHeight - doc.clientHeight;
    const pct = denom > 0 ? (doc.scrollTop / denom) * 100 : 0;
    for (const m of marks) {
      if (pct >= m && !hit.has(m)) {
        hit.add(m);
        track('scroll_depth', { percent: m });
      }
    }
    if (hit.size === marks.length) window.removeEventListener('scroll', onScroll);
  };
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
