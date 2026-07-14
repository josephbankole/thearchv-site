/* scripts/build-lane-pages.mjs — emits the three lane index pages (the "section fronts"),
   SITE-DEPTH-PLAN.md W1:
     dist/desk/transfer/index.html      "Transfer Desk"
     dist/desk/world-cup/index.html     "International Football"
     dist/desk/leagues/index.html       "Football Leagues"
   Same data source and page shell as scripts/build-article-pages.mjs (see scripts/shared/
   page-shell.mjs): masthead, three-desk nav, brand styles, footer. Every entry in a lane is
   listed newest-first as a full-width whole-card link to its /desk/<lane>/<date>/ page. Runs
   after build-day-pages.mjs and before build-article-pages.mjs (see package.json "build") —
   position doesn't matter for correctness (both scripts append their own URLs to whatever
   dist/sitemap.xml exists at that point), but this keeps the lane fronts building right after
   the day pages that feed them, mirroring the site's other lane-scoped script. */
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import {
  SITE, esc, escAttr, longDate, LANE_META, byDateDesc,
  deskNav, masthead, footer, posthogSnippet, fontLinks, pageStyles,
  cspMeta, MASTHEAD_SCRIPT_HASH, POSTHOG_SCRIPT_HASH, RSS_LINK,
} from "./shared/page-shell.mjs";

// Both inline scripts on this page family (masthead toggle + PostHog loader) are static, no
// per-page interpolation, so one CSP works for every lane page.
const PAGE_CSP = cspMeta({ scripts: [MASTHEAD_SCRIPT_HASH, POSTHOG_SCRIPT_HASH], posthog: true, googleFonts: true });

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const OUT = process.env.CONTENT_OUT || join(ROOT, "dist");

/* ---------- load the typed day data via a bundled temp module (same pattern as
   build-article-pages.mjs) ---------- */
const entrySrc = [
  `export { transferDays } from "./data/transferDays.ts";`,
  `export { worldCupDays } from "./data/worldCupDays.ts";`,
  `export { leaguesDays } from "./data/leaguesDays.ts";`,
].join("\n");
const tmp = join(ROOT, ".lane-bundle.mjs");
let data;
try {
  await build({ stdin: { contents: entrySrc, resolveDir: SRC, loader: "ts", sourcefile: "lane-entry.ts" },
    bundle: true, format: "esm", platform: "node", outfile: tmp, logLevel: "silent" });
  data = await import(pathToFileURL(tmp).href + `?t=${process.hrtime.bigint()}`);
} finally { try { rmSync(tmp); } catch {} }

// Defensive sort immediately after loading, before any use (see byDateDesc in
// scripts/shared/page-shell.mjs): the rest of this script assumes newest-first.
const transferDays = [...data.transferDays].sort(byDateDesc);
const worldCupDays = [...data.worldCupDays].sort(byDateDesc);
const leaguesDays = [...data.leaguesDays].sort(byDateDesc);

const LANES = {
  transfer: { ...LANE_META.transfer, days: transferDays, intro: "Every move on Manchester United, checked against two sources and drawn the same day. If it is done, we say done. If it is a rumour, we say rumour." },
  "world-cup": { ...LANE_META["world-cup"], days: worldCupDays, intro: "Men's and women's international football, every competition, every day it is on. Checked against two sources before anything goes up." },
  leagues: { ...LANE_META.leagues, days: leaguesDays, intro: "Title races, promotions, sackings and the tables behind them, tracked day by day." },
};

function laneCard(entry, laneKey) {
  const avatar = entry.image
    ? `<img class="lane-card__avatar" src="${escAttr(entry.image)}" alt="${escAttr(entry.imageAlt ?? "")}" loading="lazy" decoding="async" width="64" height="64" />`
    : "";
  return `<li><a class="lane-card" href="/desk/${laneKey}/${entry.date}/">${avatar}<span class="lane-card__body"><span class="lane-card__kicker">${esc(entry.day)} · ${esc(longDate(entry.date))}</span><span class="lane-card__headline">${esc(entry.headline)}</span><span class="lane-card__dek">${esc(entry.dek)}</span></span></a></li>`;
}

function render(laneKey, lane) {
  const url = `${SITE}/desk/${laneKey}/`;
  const title = `${lane.label} · The ARCHV`;

  return `<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>${esc(title)}</title>
  <meta name="description" content="${escAttr(lane.intro)}" />
  <meta name="robots" content="index,follow" />
  <link rel="canonical" href="${url}" />
  <meta name="theme-color" content="#0C2A3E" />
  ${PAGE_CSP}
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="The ARCHV" />
  <meta property="og:title" content="${escAttr(title)}" />
  <meta property="og:description" content="${escAttr(lane.intro)}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:image" content="${SITE}/og.jpg" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:site" content="@thearchvfc" />
  <meta name="twitter:title" content="${escAttr(title)}" />
  <meta name="twitter:description" content="${escAttr(lane.intro)}" />
  <meta name="twitter:image" content="${SITE}/og.jpg" />
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  ${RSS_LINK}
  <script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        name: lane.label,
        description: lane.intro,
        url,
        inLanguage: "en-GB",
        isPartOf: { "@type": "WebSite", name: "The ARCHV", url: `${SITE}/` },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
          { "@type": "ListItem", position: 2, name: lane.label, item: url },
        ],
      },
    ],
  }).replace(/</g, "\\u003c")}</script>

  <!-- PostHog: pageview only on this static surface. Same project as the website. -->
  ${posthogSnippet()}

  ${fontLinks()}

  ${pageStyles()}
</head>
<body>
  ${masthead()}
  ${deskNav(laneKey)}
  <main class="wrap wrap--wide">
    <section class="lane">
      <p class="breadcrumb"><a href="/">The ARCHV</a> / ${esc(lane.label)}</p>
      <p class="lane__eyebrow">${esc(lane.label)}</p>
      <h1>${esc(lane.label)}</h1>
      <p class="lane__lede">${esc(lane.intro)}</p>
      <ul class="lane-list" aria-label="${escAttr(lane.label)} entries, newest first">
        ${lane.days.map((entry) => laneCard(entry, laneKey)).join("\n        ")}
      </ul>
    </section>
  </main>
  ${footer()}
</body>
</html>
`;
}

/* ---------- write pages ---------- */
let count = 0;
const urls = [];
for (const [laneKey, lane] of Object.entries(LANES)) {
  const dir = join(OUT, "desk", laneKey);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), render(laneKey, lane));
  urls.push(`  <url><loc>${SITE}/desk/${laneKey}/</loc><changefreq>daily</changefreq><priority>0.7</priority></url>`);
  count++;
}

/* ---------- sitemap: same append pattern as build-article-pages.mjs — append to whatever
   dist/sitemap.xml already exists at this point in the chain, falling back to public/sitemap.xml
   if dist's copy is somehow missing. */
const sitemapOut = join(OUT, "sitemap.xml");
const sitemapFallback = join(ROOT, "public", "sitemap.xml");
const sitemapSrc = existsSync(sitemapOut) ? sitemapOut : existsSync(sitemapFallback) ? sitemapFallback : null;
if (sitemapSrc && urls.length) {
  const xml = readFileSync(sitemapSrc, "utf8");
  writeFileSync(sitemapOut, xml.replace("</urlset>", `${urls.join("\n")}\n</urlset>`));
}

console.log(`[build-lane-pages] wrote ${count} lane index page(s) to ${OUT}/desk/<lane>/, appended to sitemap`);
