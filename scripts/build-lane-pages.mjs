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

// Intro copy (SEO/AEO pass, UNIT 2, 2026-07-14): each lane's cards carried little or no
// crawlable prose above them, so every intro now states what the lane covers (keyword-bearing,
// matching that lane's indexTitle in LANE_META), the two-source verification promise, and the
// cadence, in that order. Doubles as this page's meta description (see render() below), so it
// stays a self-contained paragraph rather than a fragment.
const LANES = {
  transfer: { ...LANE_META.transfer, days: transferDays, intro: "Manchester United transfer news, every move checked against two independent sources before it goes up. A deal marked VERIFIED is done and confirmed; one marked RUMOUR is a reported link, not yet a certainty, however loudly it is being talked about. New entries are drawn the same day the story breaks." },
  "world-cup": { ...LANE_META["world-cup"], days: worldCupDays, intro: "World Cup 2026 and international football, men's and women's, every competition covered while it is being played. Every result and headline is checked against two independent sources before it goes up. A fresh entry is drawn for each day there is football on." },
  leagues: { ...LANE_META.leagues, days: leaguesDays, intro: "The club season across the Premier League, the Champions League and the rest of Europe's top divisions: title races, promotions, relegation fights and the sackings behind them. Every entry is checked against two sources before it goes up, the same standard as the rest of the desk. New wraps are tracked day by day through the season, not just on match days." },
};

function laneCard(entry, laneKey) {
  // Non-empty fallback (img alt audit, UNIT 4): matches the convention in dailyDigest.ts and
  // build-article-pages.mjs's main figure — every lane card avatar gets a real description even
  // when the day's data has no explicit imageAlt.
  const avatar = entry.image
    ? `<img class="lane-card__avatar" src="${escAttr(entry.image)}" alt="${escAttr(entry.imageAlt ?? `Illustration: ${entry.headline}`)}" loading="lazy" decoding="async" width="64" height="64" />`
    : "";
  return `<li><a class="lane-card" href="/desk/${laneKey}/${entry.date}/">${avatar}<span class="lane-card__body"><span class="lane-card__kicker">${esc(entry.day)} · ${esc(longDate(entry.date))}</span><span class="lane-card__headline">${esc(entry.headline)}</span><span class="lane-card__dek">${esc(entry.dek)}</span></span></a></li>`;
}

function render(laneKey, lane) {
  const url = `${SITE}/desk/${laneKey}/`;
  // <title> carries the entity-rich, search-only title; og/twitter keep the brand-clean form.
  const pageTitle = lane.indexTitle;
  const socialTitle = `${lane.label} · The ARCHV`;

  return `<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>${esc(pageTitle)}</title>
  <meta name="description" content="${escAttr(lane.intro)}" />
  <meta name="robots" content="index,follow" />
  <link rel="canonical" href="${url}" />
  <meta name="theme-color" content="#0C2A3E" />
  ${PAGE_CSP}
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="The ARCHV" />
  <meta property="og:title" content="${escAttr(socialTitle)}" />
  <meta property="og:description" content="${escAttr(lane.intro)}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:image" content="${SITE}/og.jpg" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:site" content="@thearchvfc" />
  <meta name="twitter:title" content="${escAttr(socialTitle)}" />
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
