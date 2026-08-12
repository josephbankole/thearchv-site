// The URL slug for a long read, derived from its title.
//
// ONE implementation, deliberately in its own file. The homepage bundle imports it
// (src/components/longReads.ts) and the static page generator bundles this file with esbuild
// rather than reimplementing it (scripts/build-reads-pages.mjs), so the accordion link and the
// page it points at can never disagree. It lives outside src/data/longReads.ts because the daily
// engine writes that file, and a helper sitting in an engine-owned file is a helper waiting to be
// overwritten.
//
// Because the slug is derived, the engine can prepend an essay to longReads.ts and its page,
// its sitemap row and its feed item all appear on the next build with no other edit. The flip
// side: renaming an essay changes its URL. Rename with that in mind.
export function readSlug(title: string): string {
  return String(title)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // Galácticos -> Galacticos
    .toLowerCase()
    .replace(/['‘’]/g, '') // Sacchi's -> sacchis, Class of '92 -> class of 92
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// The canonical path for a long read, trailing slash included. GitHub Pages 301s the slashless
// form, and a sitemap URL that redirects is a Search Console redirect error (see the note in
// scripts/build-content.mjs), so every emitted link uses this.
export function readPath(title: string): string {
  return `/reads/${readSlug(title)}/`;
}
