/* build-scores-page.mjs: the live scores page at /scores/ (2026-10-13).

   A static shell plus one small inline script (scripts/shared/scores-client.js). The script reads
   the public archv-scores/1 feed that the scores-poll Edge Function writes to Supabase storage
   (live/scores.json, and live/match/<id>.json for the goals, cards and ratings behind a match) and
   builds the list in the browser. Nothing from the feed is rendered at build time, so the HTML here
   never goes stale and the build needs no network.

   TEXT ONLY, BY RULE. No crests, logos or photos: the feed carries none (map.ts builds every object
   field by field), the page loads none, and img-src stays 'self' data:.

   CSP. The page is the one place in the family that talks to another origin, so it passes the
   Supabase storage host to cspMeta() as `connect`, which adds it to connect-src for this page and
   no other. The inline script is allowed by its exact sha256, computed from the same text that is
   written between the tags, like /guess/. verify-csp-pages.mjs checks it.

   ROBOTS. noindex,follow with a self canonical, and out of the sitemap and the search index, the
   same call as /wire/ and an empty /tables/: the server HTML holds no scores (they arrive in the
   browser), so as a search result it would be a thin page. To index it later, swap the constant. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SITE, NO_SPORT, esc, masthead, footer, documentShell, ROBOTS_NOINDEX_FOLLOW,
  cspMeta, scriptHash, extractScriptBody, MASTHEAD_SCRIPT_HASH, POSTHOG_SCRIPT_HASH,
} from "./shared/page-shell.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = process.env.CONTENT_OUT || join(ROOT, "dist");
const PAGE_URL = `${SITE}/scores/`;
const FEED_ORIGIN = "https://fpsfnhjxczzyqurzbqpt.supabase.co";

const TITLE = "Live scores · The ARCHV";
const DESCRIPTION =
  "Live scores from the Premier League, the Champions League and the Women's Super League, with goals, cards and player ratings.";
const SUBLINE =
  "Premier League, Champions League and Women's Super League. Select a live or finished match for its goals, cards and top-rated players.";

const clientSource = readFileSync(join(ROOT, "scripts", "shared", "scores-client.js"), "utf8");
if (/<\/script/i.test(clientSource)) {
  throw new Error("[build-scores-page] scores-client.js contains a closing script tag; it would end the inline element early.");
}
const script = `<script>\n${clientSource}  </script>`;

const pageCsp = cspMeta({
  scripts: [MASTHEAD_SCRIPT_HASH, POSTHOG_SCRIPT_HASH, scriptHash(extractScriptBody(script))],
  posthog: true,
  googleFonts: true,
  connect: [FEED_ORIGIN],
});

function styles() {
  return `<style>
    .scores-page { padding: 1.6rem 0 1rem; }
    .scores-page .lede { margin: 0 0 .5rem; color: var(--ink-soft); font-size: .95rem; }
    .scores__updated { margin: 0 0 1.4rem; min-height: 1.2em; color: var(--ink-muted); font-family: var(--font-mono); font-size: .8rem; letter-spacing: .06em; text-transform: uppercase; }
    .scores__group { margin: 0 0 2rem; }
    .scores__group h2 { margin: 0 0 .2rem; color: var(--ink); font-family: var(--display); font-weight: 400; text-transform: uppercase; letter-spacing: .02em; font-size: 1.5rem; line-height: 1.2; }
    .scores__day { margin: 1rem 0 .3rem; color: var(--ink-muted); font-family: var(--font-mono); font-size: .75rem; font-weight: 400; letter-spacing: .08em; text-transform: uppercase; }
    .scores__list { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--rule); }
    .scores__item { border-bottom: 1px solid var(--rule); }
    .scores__row { display: grid; grid-template-columns: 3.9rem minmax(0, 1fr) auto minmax(0, 1fr) .9rem; align-items: center; gap: .45rem; width: 100%; margin: 0; padding: .7rem .25rem; border: 0; background: none; color: var(--ink); font: inherit; font-size: .98rem; line-height: 1.3; text-align: left; }
    button.scores__row { cursor: pointer; }
    button.scores__row:hover { background: var(--bg-sunken); }
    button.scores__row:focus-visible { outline: 2px solid var(--accent-ink); outline-offset: -2px; }
    .scores__status { color: var(--ink-muted); font-size: .82rem; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .is-live .scores__status { color: var(--accent-ink); font-weight: 600; }
    .scores__dot { display: inline-block; width: .5rem; height: .5rem; margin-right: .3rem; border-radius: 50%; background: var(--accent-fill); animation: scores-pulse 1.6s ease-in-out infinite; }
    @keyframes scores-pulse { 50% { opacity: .35; } }
    .scores__home, .scores__away { overflow-wrap: anywhere; }
    .scores__home { text-align: right; }
    .scores__score { min-width: 3.2rem; text-align: center; font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .scores__pens { display: block; color: var(--ink-muted); font-size: .72rem; font-weight: 400; }
    .scores__caret { justify-self: end; width: .5rem; height: .5rem; border-right: 2px solid var(--ink-muted); border-bottom: 2px solid var(--ink-muted); transform: rotate(45deg) translate(-2px, -2px); }
    button.scores__row[aria-expanded="true"] .scores__caret { transform: rotate(225deg) translate(-2px, -2px); }
    div.scores__row .scores__caret { visibility: hidden; }
    .scores__detail { padding: .9rem .75rem 1.1rem; background: var(--bg-sunken); }
    .scores__detail[hidden] { display: none; }
    .scores__events { list-style: none; margin: 0; padding: 0; display: grid; gap: .35rem; }
    .scores__evrow { display: grid; grid-template-columns: 1fr 3.4rem 1fr; gap: .4rem; font-size: .92rem; line-height: 1.35; }
    .scores__ev--home { text-align: right; }
    .scores__min { color: var(--ink-muted); text-align: center; font-variant-numeric: tabular-nums; }
    .scores__card { margin-right: .15rem; color: var(--ink-muted); font-family: var(--font-mono); font-size: .7rem; letter-spacing: .06em; text-transform: uppercase; }
    .scores__card--red { color: var(--accent-ink); }
    .scores__ratings { margin: 1rem 0 0; padding-top: .8rem; border-top: 1px solid var(--rule); }
    .scores__ratings h4 { margin: 0 0 .5rem; color: var(--ink-muted); font-family: var(--font-mono); font-size: .72rem; font-weight: 400; letter-spacing: .08em; text-transform: uppercase; }
    .scores__cols { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    .scores__team { margin: 0 0 .25rem; color: var(--ink); font-size: .9rem; font-weight: 600; }
    .scores__rate { list-style: none; margin: 0; padding: 0; font-size: .9rem; line-height: 1.4; }
    .scores__rate li { display: flex; justify-content: space-between; gap: .5rem; }
    .scores__num { color: var(--ink); font-variant-numeric: tabular-nums; }
    .scores__note { margin: 0; color: var(--ink-muted); font-size: .95rem; }
    .scores__foot { margin: 1.6rem 0 0; color: var(--ink-muted); font-size: .85rem; }
    .scores__noscript { padding: 1rem 1.1rem; border: 1px solid var(--rule); border-radius: .6rem; font-size: .9rem; color: var(--ink-soft); }
    @media (max-width: 380px) {
      .scores__row { grid-template-columns: 3.2rem minmax(0, 1fr) auto minmax(0, 1fr) .7rem; gap: .35rem; font-size: .93rem; }
      .scores__score { min-width: 2.8rem; }
    }
    @media (prefers-reduced-motion: reduce) { .scores__dot { animation: none; } }
  </style>`;
}

const html = `${documentShell({
  title: TITLE,
  metaDescription: DESCRIPTION,
  description: DESCRIPTION,
  socialTitle: TITLE,
  robots: ROBOTS_NOINDEX_FOLLOW,
  canonical: PAGE_URL,
  ogUrl: PAGE_URL,
  ogType: "website",
  ogImage: `${SITE}/og.jpg`,
  csp: pageCsp,
  extraHead: [styles()],
  jsonLd: {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebPage", name: "Live scores", description: DESCRIPTION, url: PAGE_URL, inLanguage: "en-GB", isPartOf: { "@type": "WebSite", name: "The ARCHV", url: `${SITE}/` } },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
          { "@type": "ListItem", position: 2, name: "Live scores", item: PAGE_URL },
        ],
      },
    ],
  },
})}
<body>
  ${masthead(NO_SPORT)}
  <main class="wrap">
    <section class="scores-page">
      <p class="breadcrumb"><a href="/">The ARCHV</a> / Live scores</p>
      <h1>Live scores</h1>
      <p class="lede">${esc(SUBLINE)}</p>
      <p class="scores__updated" id="scores-updated"></p>
      <noscript>
        <p class="scores__noscript">The scores need JavaScript, which is off in this browser.</p>
      </noscript>
      <div class="scores" id="scores">
        <p class="scores__note">Loading scores.</p>
      </div>
      <p class="scores__foot">Scores and ratings from API-Football.</p>
    </section>
  </main>
  ${footer()}
  ${script}
</body>
</html>
`;

mkdirSync(join(OUT, "scores"), { recursive: true });
writeFileSync(join(OUT, "scores", "index.html"), html);
console.log(`[build-scores-page] wrote /scores/ (noindex, text only, connect-src +${FEED_ORIGIN}) to ${OUT}`);
