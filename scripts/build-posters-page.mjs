/* build-posters-page.mjs: the full poster page at /posters/ (2026-10-13).

   Until 2026-10-13 every Manchester United poster tile lived on the front page, in the "From the
   archive" block: twenty-one framed-poster photos in two grids. The founder cut the front page down
   to the scores strip, the day's story, the Desk Brief and "a few posters at the bottom", so the
   front page keeps four tiles and this page holds all of them, with the same tiles, the same
   captions and the same links the front page carried.

   DATA. scripts/data/poster-tiles.json (in the repo, so the build reads nothing outside it). Each
   tile is one poster still on sale and links to its own `url`: since 25 Nov 2026 the four final
   posters with the skyline art link to their product pages on https://shop.thearchv.ca, with the
   shop's photo at 900x675 under public/shop/. The fourteen Etsy listings deactivated that day are
   off the page, and so are the five Manchester United Women posters, whose Etsy listings were
   already unavailable. A tile may still link one live Etsy listing's Share & Save link
   (https://thearchvca.etsy.com/listing/<id>, D-2026-10-04b). Keep in step with
   src/data/posters.ts, whose header holds the inclusion rules (README.md, Commerce). No quote
   posters are tiled: the art rule in CLAUDE.md ("The quote posters") holds.

   NO INLINE SCRIPT BEYOND THE SHARED PAIR. The tiles are plain links; the front page's analytics
   hooks (etsy_click, shop_click) live in the bundled homepage script, which this page does not
   load, so a click here is an outbound link and PostHog's pageview. Add a hashed inline handler
   only if the funnel needs it. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SITE, esc, escAttr, masthead, footer, documentShell, ROBOTS_INDEXABLE,
  cspMeta, MASTHEAD_SCRIPT_HASH, POSTHOG_SCRIPT_HASH, ORG_REF,
} from "./shared/page-shell.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = process.env.CONTENT_OUT || join(ROOT, "dist");
const URL = `${SITE}/posters/`;
const ETSY = "https://thearchvca.etsy.com";
const SHOP_POSTERS = "https://shop.thearchv.ca/collections/final-posters";

const TITLE = "Manchester United posters · The ARCHV";
const DESCRIPTION =
  "Manchester United final posters from The ARCHV, one match to a poster, from the 1968 European Cup final at Wembley to the 2008 Champions League final in Moscow.";
const LEDE =
  "Manchester United finals, one match to a poster, printed to order and shipped by our print partner.";

const { tiles } = JSON.parse(readFileSync(join(ROOT, "scripts", "data", "poster-tiles.json"), "utf8"));
const men = tiles.filter((t) => t.group === "men");
if (!men.length || men.length !== tiles.length) {
  throw new Error(`[build-posters-page] expected only men's tiles, found ${men.length} of ${tiles.length}`);
}
// A tile links to a product page on our shop or to one Etsy listing, nothing else.
const LINK = /^https:\/\/(shop\.thearchv\.ca\/products\/[a-z0-9-]+|thearchvca\.etsy\.com\/listing\/\d{8,12})$/;
for (const t of tiles) {
  if (!LINK.test(t.url ?? "")) throw new Error(`[build-posters-page] bad link on ${t.label}: ${t.url}`);
  if (!t.image.startsWith("/shop/") || !t.alt || !t.label) throw new Error(`[build-posters-page] incomplete tile: ${JSON.stringify(t)}`);
}
// The heading's year range is the tiles' own, so it cannot drift from the grid.
const span = (list) => {
  const ys = list.map((t) => Number(t.label.match(/(\d{4})$/)?.[1])).filter(Boolean);
  return `${Math.min(...ys)} to ${Math.max(...ys)}`;
};
// Our own shop opens in the same window, as every Shop link does; Etsy stays a new tab.
const target = (url) => (url.startsWith("https://shop.thearchv.ca/") ? "" : ' target="_blank" rel="noopener noreferrer"');

const tile = (t) =>
  `<li><a href="${escAttr(t.url)}"${target(t.url)}><img src="${escAttr(t.image)}" alt="${escAttr(t.alt)}" loading="lazy" width="900" height="675" /><span>${esc(t.label)}</span></a></li>`;

const grid = (id, heading, list) => `      <h2 id="${id}">${esc(heading)}</h2>
      <ul class="posters__grid" aria-labelledby="${id}">
        ${list.map(tile).join("\n        ")}
      </ul>`;

const styles = `<style>
    .posters { padding: 1.6rem 0 1rem; }
    .posters .lede { margin: 0 0 1rem; color: var(--ink-soft); font-size: 1rem; max-width: 46ch; }
    .posters h2 { margin: 2rem 0 .8rem; color: var(--ink); font-family: var(--display); font-weight: 400; text-transform: uppercase; letter-spacing: .02em; font-size: 1.4rem; line-height: 1.2; }
    .posters__grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .9rem; }
    .posters__grid a { display: block; color: var(--ink-soft); font-size: .88rem; letter-spacing: .04em; text-decoration: none; }
    .posters__grid img { display: block; width: 100%; height: auto; margin-bottom: .45rem; border: 1px solid var(--rule); border-radius: 8px; transition: transform .25s ease, border-color .25s ease; }
    .posters__grid a:hover { color: var(--accent-ink); text-decoration: none; }
    .posters__grid a:hover img { transform: translateY(-3px); border-color: var(--accent-ink); }
    .posters__grid a:focus-visible { outline: 2px solid var(--accent-ink); outline-offset: 3px; }
    .posters__links { display: flex; flex-wrap: wrap; gap: .6rem 1.75rem; margin: 1.4rem 0 0; }
    .posters__shop { display: inline-block; color: var(--ink); font-size: .98rem; border-bottom: 1px solid var(--rule); padding-bottom: .15rem; }
    .posters__shop:hover { color: var(--accent-ink); border-bottom-color: var(--accent-ink); text-decoration: none; }
    @media (max-width: 560px) { .posters__grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (prefers-reduced-motion: reduce) { .posters__grid img { transition: none; } .posters__grid a:hover img { transform: none; } }
  </style>`;

const schema = JSON.stringify({
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "CollectionPage",
      name: "Manchester United posters",
      description: DESCRIPTION,
      url: URL,
      inLanguage: "en-GB",
      isPartOf: { "@type": "WebSite", name: "The ARCHV", url: `${SITE}/` },
      publisher: ORG_REF,
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
        { "@type": "ListItem", position: 2, name: "Posters", item: URL },
      ],
    },
  ],
}).replace(/</g, "\\u003c");

const html = `${documentShell({
  title: TITLE,
  metaDescription: DESCRIPTION,
  description: DESCRIPTION,
  socialTitle: TITLE,
  robots: ROBOTS_INDEXABLE,
  canonical: URL,
  ogUrl: URL,
  ogType: "website",
  ogImage: `${SITE}/og.jpg`,
  csp: cspMeta({ scripts: [MASTHEAD_SCRIPT_HASH, POSTHOG_SCRIPT_HASH], posthog: true }),
  extraHead: [styles],
  jsonLd: schema,
})}
<body>
  ${masthead()}
  <main class="wrap wrap--wide" id="main">
    <section class="posters">
      <p class="breadcrumb"><a href="/">The ARCHV</a> / Posters</p>
      <h1>Posters</h1>
      <p class="lede">${esc(LEDE)}</p>
${grid("covers-men", `Manchester United, ${span(men)}`, men)}
      <p class="posters__links"><a class="posters__shop" href="${SHOP_POSTERS}">The final posters in our shop</a>
      <a class="posters__shop" href="${ETSY}" target="_blank" rel="noopener noreferrer">All prints in the Etsy shop</a></p>
    </section>
  </main>
  ${footer()}
</body>
</html>
`;

mkdirSync(join(OUT, "posters"), { recursive: true });
writeFileSync(join(OUT, "posters", "index.html"), html);
console.log(`[build-posters-page] wrote /posters/ (${men.length} tiles) to ${OUT}`);
