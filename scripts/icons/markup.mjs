/* scripts/icons/markup.mjs — the words and the small drawings that go with the sport icons.
 *
 * Two things live here because two builders need them and neither should import the other:
 * the alt text for each poster, and the 16px tab glyphs. No geometry, no file reads.
 *
 * THE TAB GLYPHS are the same six objects, drawn down to a few strokes on a 24-unit grid. They
 * are static inline SVG in the sport tab bar, in the link's own colour (currentColor), so hover
 * and the current-tab state colour them for free. There is never a canvas in the tab bar: it
 * scrolls sideways, and six WebGL contexts in a guarded scroller is a risk with no reader benefit.
 * index.html carries a hand copy of the six; scripts/test/sport-icon.test.mjs fails if it drifts.
 *
 * Generic objects only. No crest, maker's mark, number or livery, here or in the meshes.
 */
export const SPORT_ICON_ALT = {
  football: "A football with dark and light panels",
  nfl: "An American football with white laces",
  f1: "A single-seater racing car",
  tennis: "A tennis ball",
  golf: "A golf ball",
  basketball: "A basketball",
};

const BALL = '<circle cx="12" cy="12" r="9.25"/>';
export const SPORT_GLYPHS = {
  football: `${BALL}<path fill="currentColor" d="M12 8.2l3.6 2.6-1.4 4.3H9.8l-1.4-4.3z"/><path d="M12 8.2V3M15.6 10.8l4.9-1.6M14.2 15.1l3 4.1M9.8 15.1l-3 4.1M8.4 10.8L3.5 9.2"/>`,
  nfl: '<path d="M4.3 19.7C2.8 12.6 7.8 4.9 19.7 4.3c1.5 7.1-3.5 14.8-15.4 15.4z"/><path d="M9.4 14.6l5.2-5.2M10 12.6l1.4 1.4M11.6 11l1.4 1.4M13.2 9.4l1.4 1.4"/>',
  f1: '<circle cx="6.6" cy="16.2" r="2.9"/><circle cx="17.6" cy="16.6" r="2.5"/><path d="M2.4 8.2h3.8M3.4 8.2v5.2M3.4 13.2h4.2l2.6-3.4h2.6l1.9 3 6.5 2.5M9.9 16.4h4.9M20.3 18.2h2.4"/>',
  tennis: `${BALL}<path d="M5.3 5.6Q10.9 12 5.3 18.4M18.7 5.6Q13.1 12 18.7 18.4"/>`,
  golf: '<circle cx="12" cy="9.4" r="6.9"/><path d="M9.2 18.6h5.6M12 18.6v3.2"/><path stroke-width="1.9" d="M9.6 7.4h0M13 6.4h0M15.4 9h0M11.6 10h0M8.6 11h0M13.8 12.4h0M10.6 13.2h0"/>',
  basketball: `${BALL}<path d="M12 2.75v18.5M2.75 12h18.5M5.4 5.5Q9.3 12 5.4 18.5M18.6 5.5Q14.7 12 18.6 18.5"/>`,
};

export function sportGlyph(key) {
  const d = SPORT_GLYPHS[key];
  if (!d) return "";
  return `<svg class="sportnav__glyph" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${d}</svg>`;
}
