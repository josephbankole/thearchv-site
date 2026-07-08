/* build-article-pages.mjs — emits a canonical, self-contained static page for every daily entry
   across all three lanes (Transfer Desk, World Cup, Football Leagues), at:
     dist/desk/<lane>/<date>/index.html      lane one of: transfer, world-cup, leagues
   This is the URL the app's canonical shares point at (see BUILD11-PLAN.md W1/W2) and the primary
   SEO surface for daily entries. Runs AFTER vite build, build-feed.mjs and build-day-pages.mjs (see
   package.json "build"). Follows the public/start/index.html pattern: inline brand styles, the
   PostHog snippet, Google Fonts — deliberately standalone, no dependency on the hashed app bundle
   or on content.css (article pages built by build-content.mjs/build-day-pages.mjs use content.css;
   these pages intentionally match public/start/index.html instead, per the founder-approved plan).
   Also (re)writes dist/sitemap.xml: it appends every article URL to whatever sitemap already exists
   in dist at this point (built by build-content.mjs, then extended by build-day-pages.mjs), so this
   must run last in the chain. */
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const OUT = process.env.CONTENT_OUT || join(ROOT, "dist");
const SITE = "https://thearchv.ca";
const POSTHOG_KEY = "phc_kg8nXCp4TJMcRjBQAVZTQoubijYWeBRMHU9PHYgiUagm";

const esc = (s = "") => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s = "") => esc(s).replace(/"/g, "&quot;");
const longDate = (iso) => {
  try { return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }); }
  catch { return iso; }
};

/* ---------- load the typed day data via a bundled temp module ---------- */
const entrySrc = [
  `export { transferDays } from "./data/transferDays.ts";`,
  `export { worldCupDays } from "./data/worldCupDays.ts";`,
  `export { leaguesDays } from "./data/leaguesDays.ts";`,
].join("\n");
const tmp = join(ROOT, ".article-bundle.mjs");
let data;
try {
  await build({ stdin: { contents: entrySrc, resolveDir: SRC, loader: "ts", sourcefile: "article-entry.ts" },
    bundle: true, format: "esm", platform: "node", outfile: tmp, logLevel: "silent" });
  data = await import(pathToFileURL(tmp).href + `?t=${process.hrtime.bigint()}`);
} finally { try { rmSync(tmp); } catch {} }

// lane = URL segment under /desk/, anchor = the homepage section this lane links back to.
const LANES = {
  transfer: { label: "Transfer Desk", days: data.transferDays, anchor: "#transfer-desk" },
  "world-cup": { label: "World Cup", days: data.worldCupDays, anchor: "#world-cup" },
  leagues: { label: "Football Leagues", days: data.leaguesDays, anchor: "#football-leagues" },
};

/* ---------- body: \n\n paragraph breaks, dated "Update, N Jul:" additions stay visible paragraphs ---------- */
function bodyHtml(text) {
  return String(text)
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p)}</p>`)
    .join("\n        ");
}

function schema(entry, url, label) {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: entry.headline,
        description: entry.dek,
        datePublished: entry.date,
        inLanguage: "en-GB",
        author: { "@type": "Organization", name: "The ARCHV" },
        publisher: { "@type": "Organization", name: "The ARCHV", logo: `${SITE}/brand/logo-badge@192.png` },
        image: entry.image ? `${SITE}${entry.image}` : `${SITE}/og.jpg`,
        mainEntityOfPage: url,
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
          { "@type": "ListItem", position: 2, name: label, item: `${SITE}/` },
          { "@type": "ListItem", position: 3, name: entry.headline, item: url },
        ],
      },
    ],
  });
}

function render(entry, laneKey) {
  const lane = LANES[laneKey];
  const url = `${SITE}/desk/${laneKey}/${entry.date}/`;
  const ogImage = entry.image ? `${SITE}${entry.image}` : `${SITE}/og.jpg`;

  const figure = entry.image
    ? `
      <figure class="article__fig">
        <img src="${escAttr(entry.image)}" alt="${escAttr(entry.imageAlt ?? entry.headline)}" width="240" height="240" loading="eager" decoding="async" />
      </figure>` : "";

  return `<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>${esc(entry.headline)} · The ARCHV</title>
  <meta name="description" content="${escAttr(entry.dek)}" />
  <meta name="robots" content="index,follow" />
  <link rel="canonical" href="${url}" />
  <meta name="theme-color" content="#0C2A3E" />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="The ARCHV" />
  <meta property="og:title" content="${escAttr(entry.headline)}" />
  <meta property="og:description" content="${escAttr(entry.dek)}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:image" content="${ogImage}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escAttr(entry.headline)}" />
  <meta name="twitter:description" content="${escAttr(entry.dek)}" />
  <meta name="twitter:image" content="${ogImage}" />
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <script type="application/ld+json">${schema(entry, url, lane.label)}</script>

  <!-- PostHog: pageview only on this static surface. Same project as the website. -->
  <script>
    !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once unregister opt_in_capturing opt_out_capturing".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
    posthog.init('${POSTHOG_KEY}',{api_host:'https://us.i.posthog.com',autocapture:false,capture_pageview:true,persistence:'localStorage',respect_dnt:true});
  </script>

  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,400;9..144,500;9..144,600&family=Inter+Tight:wght@400;500;600&display=swap" rel="stylesheet" />

  <style>
    :root {
      --navy: #0C2A3E; --navy-deep: #071C2B; --navy-soft: #133A52;
      --cream: #F2EAD3; --cream-dim: rgba(242,234,211,.72); --cream-faint: rgba(242,234,211,.3);
      --gold: #C9A14A; --gold-soft: rgba(201,161,74,.5);
      --maxw: 46rem;
    }
    * { box-sizing: border-box; }
    html { -webkit-text-size-adjust: 100%; }
    body {
      margin: 0; background: var(--navy); color: var(--cream-dim);
      font-family: "Inter Tight", system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
      font-size: 18px; line-height: 1.65; -webkit-font-smoothing: antialiased;
      background-image: radial-gradient(60rem 30rem at 50% -10rem, var(--navy-soft) 0%, rgba(12,42,62,0) 70%);
    }
    a { color: var(--gold); text-decoration: none; }
    a:hover { text-decoration: underline; }
    a:focus-visible { outline: 2px solid var(--gold); outline-offset: 3px; }
    img { max-width: 100%; height: auto; display: block; }
    .wrap { max-width: var(--maxw); margin: 0 auto; padding: 0 1.25rem; }

    .masthead { display: flex; align-items: center; justify-content: space-between; max-width: 72rem; margin: 0 auto; padding: 1.1rem 1.25rem; }
    .wordmark { display: inline-flex; align-items: center; gap: .5rem; color: var(--cream); font-weight: 700; letter-spacing: .02em; }
    .wordmark img { width: 34px; height: 34px; }
    .wordmark__the { opacity: .7; font-size: .8rem; letter-spacing: .18em; }
    .wordmark__archv { font-size: 1.15rem; font-family: "Fraunces", Georgia, serif; }
    .masthead__actions { display: inline-flex; gap: .75rem; }
    .btn { display: inline-block; padding: .5rem .9rem; border-radius: .5rem; font-size: .85rem; font-weight: 600; }
    .btn--ghost { border: 1px solid var(--gold-soft); color: var(--cream); }
    .btn--gold { background: var(--gold); color: var(--navy-deep); }

    .article { padding: 2rem 0 1rem; }
    .breadcrumb { font-size: .8rem; letter-spacing: .04em; color: var(--cream-faint); text-transform: uppercase; margin: 0 0 1rem; }
    .breadcrumb a { color: var(--cream-faint); }
    .article__eyebrow { color: var(--gold); font-size: .78rem; letter-spacing: .16em; text-transform: uppercase; margin: 0 0 .6rem; }
    h1 { color: var(--cream); font-family: "Fraunces", Georgia, serif; font-weight: 600; font-size: clamp(2rem, 5vw, 2.9rem); line-height: 1.1; letter-spacing: -.01em; margin: 0 0 .5rem; }
    .article__meta { color: var(--cream-faint); font-size: .9rem; margin: 0 0 1.5rem; }
    .article__fig { margin: 1.5rem 0 2rem; }
    .article__fig img { border-radius: 50%; width: 96px; height: 96px; object-fit: cover; border: 1px solid var(--gold-soft); box-shadow: 0 0 0 4px rgba(7,28,43,.6); }
    .article__body p { margin: 1rem 0; }
    .article__body strong { color: var(--cream); }
    .article__rights { margin: 2rem 0; padding: 1.1rem 1.25rem; border: 1px solid var(--cream-faint); border-radius: .6rem; font-size: .85rem; color: var(--cream-faint); }
    .article__nav { margin: 2.2rem 0 1rem; display: flex; flex-wrap: wrap; gap: 1rem 1.5rem; font-size: .95rem; }
    .related { margin: 2.5rem 0 1rem; }
    .related h2 { color: var(--cream); font-family: "Fraunces", Georgia, serif; font-weight: 600; font-size: 1.5rem; margin: 0 0 .6rem; padding-top: 1.4rem; border-top: 1px solid var(--cream-faint); }
    .related ul { list-style: none; padding: 0; margin: 0; }
    .related li { margin: .5rem 0; }

    .footer { margin-top: 3rem; border-top: 1px solid var(--cream-faint); background: var(--navy-deep); }
    .footer .wrap { max-width: 72rem; padding-top: 2rem; padding-bottom: 2.5rem; }
    .footer__links { display: flex; flex-wrap: wrap; gap: .9rem 1.5rem; font-size: .9rem; margin: 0 0 1rem; }
    .footer__tag { color: var(--cream); margin: .5rem 0; }
    .footer__legal { color: var(--cream-faint); font-size: .74rem; line-height: 1.5; max-width: 60rem; }
  </style>
</head>
<body>
  <header class="masthead">
    <a class="wordmark" href="/"><img src="/brand/logo-badge.png" width="34" height="34" alt="" /><span class="wordmark__the">THE</span><span class="wordmark__archv">ARCHV</span></a>
    <nav class="masthead__actions" aria-label="Primary">
      <a class="btn btn--ghost" href="https://www.etsy.com/shop/TheARCHVCA" target="_blank" rel="noopener noreferrer">Shop</a>
      <a class="btn btn--ghost" href="https://instagram.com/thearchvfc" target="_blank" rel="noopener noreferrer">Follow</a>
      <a class="btn btn--gold" href="https://thearchvdispatch.substack.com/subscribe" target="_blank" rel="noopener noreferrer">Subscribe</a>
    </nav>
  </header>
  <main class="wrap">
    <article class="article">
      <p class="breadcrumb"><a href="/">The ARCHV</a> / <a href="/${lane.anchor}">${esc(lane.label)}</a></p>
      <p class="article__eyebrow">${esc(lane.label)} · ${esc(entry.day)}</p>
      <h1>${esc(entry.headline)}</h1>
      <p class="article__meta">${esc(longDate(entry.date))}</p>${figure}
      <div class="article__body">
        <p><strong>${esc(entry.dek)}</strong></p>
        ${bodyHtml(entry.body)}
      </div>
      <p class="article__rights">The ARCHV is an independent football-history publication, not affiliated with any governing body, league, club, or competition organiser. Club and competition names are referenced for editorial and historical commentary only and remain the property of their respective owners. Player illustrations are original stylised artwork, not photographs.</p>
      <nav class="article__nav" aria-label="More from this section">
        <a href="/">Home</a>
        <a href="/${lane.anchor}">More ${esc(lane.label)}</a>
      </nav>
    </article>
  </main>
  <footer class="footer">
    <div class="wrap">
      <nav class="footer__links" aria-label="Social">
        <a href="https://instagram.com/thearchvfc" target="_blank" rel="noopener noreferrer">Instagram</a>
        <a href="https://x.com/thearchv_ca" target="_blank" rel="noopener noreferrer">X</a>
        <a href="https://thearchvdispatch.substack.com/subscribe" target="_blank" rel="noopener noreferrer">Dispatch</a>
        <a href="https://www.etsy.com/shop/TheARCHVCA" target="_blank" rel="noopener noreferrer">Shop</a>
        <a href="/">Home</a>
      </nav>
      <p class="footer__tag">Football history, illustrated. Daily.</p>
      <p class="footer__legal">The ARCHV is an independent football-history publication, not affiliated with any governing body, league, club, or competition organiser. Club and competition names are referenced for editorial and historical commentary only and remain the property of their respective owners. Player illustrations are original stylised artwork, not photographs. © 2026 The ARCHV.</p>
    </div>
  </footer>
</body>
</html>
`;
}

/* ---------- write pages ---------- */
let count = 0;
const urls = [];
for (const [laneKey, lane] of Object.entries(LANES)) {
  for (const entry of lane.days) {
    const dir = join(OUT, "desk", laneKey, entry.date);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "index.html"), render(entry, laneKey));
    urls.push(`  <url><loc>${SITE}/desk/${laneKey}/${entry.date}/</loc><lastmod>${entry.date}</lastmod><changefreq>monthly</changefreq><priority>0.6</priority></url>`);
    count++;
  }
}

/* ---------- sitemap: append to whatever dist/sitemap.xml already exists at this point in the
   build chain (build-content.mjs writes it first, build-day-pages.mjs appends day pages, this
   script runs last and appends the canonical <lane>/<date> article URLs). If dist/sitemap.xml is
   somehow missing, fall back to public/sitemap.xml so the static routes are never lost. */
const sitemapOut = join(OUT, "sitemap.xml");
const sitemapFallback = join(ROOT, "public", "sitemap.xml");
const sitemapSrc = existsSync(sitemapOut) ? sitemapOut : existsSync(sitemapFallback) ? sitemapFallback : null;
if (sitemapSrc && urls.length) {
  const xml = readFileSync(sitemapSrc, "utf8");
  writeFileSync(sitemapOut, xml.replace("</urlset>", `${urls.join("\n")}\n</urlset>`));
}

console.log(`[build-article-pages] wrote ${count} article page(s) to ${OUT}/desk/<lane>/<date>/, appended to sitemap`);
