/* build-news-sitemap.mjs — emits dist/news-sitemap.xml, a Google News sitemap carrying every
   canonical daily article published within the LAST 2 DAYS (Google News ignores older rows, and
   its guidelines ask publishers not to list them). Same data source and lane registry as
   build-rss.mjs (src/data/*.ts bundled via esbuild, /desk/<lane>/ for football,
   /<urlBase>/<laneKey>/ for the new sports), so the news sitemap, the RSS feed and the pages
   can never disagree about what was published when. Runs in the build chain right after
   build-rss.mjs (see package.json "build"); it reads only the source data, not dist, so its
   position is about keeping the syndication emitters together. robots.txt carries a second
   Sitemap: line pointing at /news-sitemap.xml alongside the main /sitemap.xml.

   The window is rolling, so a day with no publishing still shrinks the list on the next build;
   an empty urlset is valid and expected during a quiet spell. Output dir defaults to ./dist,
   override with CONTENT_OUT to match the other page generators. */
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { byDateDesc, SPORTS } from "./shared/page-shell.mjs";
import { loadDayData } from "./shared/day-data.mjs";
import { publishedAt } from "./shared/entry-dates.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = process.env.CONTENT_OUT || join(ROOT, "dist");
const SITE = "https://thearchv.ca";
const PUBLICATION_NAME = "The ARCHV";
const PUBLICATION_LANGUAGE = "en";
const WINDOW_MS = 2 * 24 * 60 * 60 * 1000;

/* ---------- the typed day data, through scripts/shared/day-data.mjs (the one loader for
   src/data/*.ts, which also hands every lane back sorted newest-first) ---------- */
const { transferDays, worldCupDays, leaguesDays, sportDays: SPORT_DATA } = await loadDayData();

// Lane registry, identical to build-rss.mjs: football keeps /desk/<lane>/ (World Cup's URL lane
// is hyphenated even though its section key is "worldcup"); new sports syndicate from
// /<urlBase>/<laneKey>/.
const lanes = [
  { base: "/desk/transfer/", days: transferDays },
  { base: "/desk/world-cup/", days: worldCupDays },
  { base: "/desk/leagues/", days: leaguesDays },
];
for (const sport of SPORTS) {
  if (sport.key === "football") continue;
  for (const laneKey of sport.lanes) {
    lanes.push({ base: `/${sport.urlBase}/${laneKey}/`, days: SPORT_DATA[sport.key] || [] });
  }
}

// news:publication_date is the entry's own publishedAt (search plan G10, 2026-10-04), the commit
// time the commit script stamps, through scripts/shared/entry-dates.mjs. It used to be 12:00 -06:00
// on the calendar date, hours after the real publication, so a fresh entry was future-dated when
// Google first read this file. The 2-day window below still runs off the build clock: that decides
// which rows are listed, it never stamps one.
const cutoff = Date.now() - WINDOW_MS;
const items = lanes
  .flatMap(({ base, days }) => days.map((d) => ({ ...d, base })))
  .filter((it) => Date.parse(publishedAt(it)) >= cutoff)
  .sort(byDateDesc);

const xmlEsc = (s = "") =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const urlXml = items
  .map((it) => `  <url>
    <loc>${xmlEsc(`${SITE}${it.base}${it.date}/`)}</loc>
    <news:news>
      <news:publication>
        <news:name>${xmlEsc(PUBLICATION_NAME)}</news:name>
        <news:language>${PUBLICATION_LANGUAGE}</news:language>
      </news:publication>
      <news:publication_date>${publishedAt(it)}</news:publication_date>
      <news:title>${xmlEsc(it.headline)}</news:title>
    </news:news>
  </url>`)
  .join("\n");

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${urlXml}${urlXml ? "\n" : ""}</urlset>
`;

writeFileSync(join(OUT, "news-sitemap.xml"), xml);
console.log(`[build-news-sitemap] wrote ${items.length} article(s) from the last 2 days to ${OUT}/news-sitemap.xml`);
