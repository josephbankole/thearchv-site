// Section anchors that left the front page on 2026-10-13, sent to the page that now holds the
// section. The iOS app's fallback share links point at thearchv.ca/#transfer-desk, /#world-cup and
// /#football-leagues (thearchv-app/TheARCHV/Models.swift, siteURL, used when an entry has no
// canonical `url`), and those links are already in people's messages and notes, so they have to
// keep landing somewhere useful rather than at the top of a page that no longer has the section.
//
// Runs from the bundle, so there is no CSP change and no second inline script. A reader whose
// bundle never arrives gets the front page at the top, which is the same page the share link named.
// location.replace, not assign: the dead anchor should not sit in the back-button history.
//
// Keep in step with the masthead menu (index.html, scripts/shared/page-shell.mjs,
// scripts/build-content.mjs): every target here is a menu entry.
const MOVED: Record<string, string> = {
  'football-leagues': '/desk/leagues/',
  'transfer-desk': '/desk/transfer/',
  'world-cup': '/desk/world-cup/',
  legends: '/legends/',
  'long-reads': '/reads/',
  faq: '/glossary/',
  partnerships: '/about/#contact',
};

export function initMovedAnchors(): void {
  const go = (): void => {
    const id = decodeURIComponent(window.location.hash.replace(/^#/, ''));
    const target = Object.prototype.hasOwnProperty.call(MOVED, id) ? MOVED[id] : undefined;
    if (target) window.location.replace(target);
  };
  go();
  window.addEventListener('hashchange', go);
}
