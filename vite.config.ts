import { defineConfig, type Plugin } from 'vite';
import {
  renderWire, renderLead, renderBands, renderBrief, renderDateline,
  renderLegends, renderLongReads, renderToday,
} from './src/render/home';

/* Server-render the front page at build time (phase 2A).

   index.html carries a marker comment per block; this plugin swaps each one for real markup
   built from src/data/*.ts — the same files scripts/build-feed.mjs reads, so the page and the
   feed can never disagree about what was filed. transformIndexHtml runs in dev as well as in
   build, so `npm run dev` shows the same page that ships.

   The reason this is a plugin rather than a post-build rewrite of dist/index.html: a rewrite
   would leave `npm run dev` showing empty rails, which is exactly the state that let the old
   JS-only rails ship broken for readers without JS. One code path, both modes.

   Markers are HTML comments, so an unreplaced one degrades to nothing visible rather than to
   literal text on the page. No injected block may contain a <script>: index.html carries
   exactly one inline bootstrap and scripts/check-csp-hash.mjs asserts that count. */
function archvHome(): Plugin {
  return {
    name: 'archv-home-ssr',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        const blocks: Record<string, () => string> = {
          '<!--archv:dateline-->': renderDateline,
          '<!--archv:wire-->': renderWire,
          '<!--archv:lead-->': renderLead,
          '<!--archv:today-->': renderToday,
          '<!--archv:bands-->': renderBands,
          '<!--archv:brief-->': renderBrief,
          '<!--archv:legends-->': renderLegends,
          '<!--archv:longreads-->': renderLongReads,
        };
        let out = html;
        for (const [marker, render] of Object.entries(blocks)) {
          if (!out.includes(marker)) {
            // A silently missing block is the failure mode this whole pass exists to remove.
            throw new Error(`[archv-home-ssr] index.html is missing the marker ${marker}`);
          }
          out = out.split(marker).join(render());
        }
        return out;
      },
    },
  };
}

// Custom domain (thearchv.ca) is served from the site root, so base = '/'.
// public/CNAME pins the domain on GitHub Pages.
export default defineConfig({
  base: '/',
  plugins: [archvHome()],
  build: {
    target: 'es2020',
    cssMinify: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        // Keep GSAP in its own chunk so first paint never waits on the motion layer. `three`
        // used to sit alongside it; the WebGL hero went with the front-page rebuild, so naming
        // it here would declare a chunk for a module no longer in the graph.
        manualChunks: {
          gsap: ['gsap'],
        },
      },
    },
  },
});
