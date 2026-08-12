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
import { build } from "esbuild";
import { writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { byDateDesc, SPORTS } from "./shared/page-shell.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const OUT = process.env.CONTENT_OUT || join(ROOT, "dist");
const SITE = "https://thearchv.ca";
const PUBLICATION_NAME = "The ARCHV";
const PUBLICATION_LANGUAGE = "en";
const WINDOW_MS = 2 * 24 * 60 * 60 * 1000;

/* ---------- load the typed day data via a bundled temp module (same pattern as build-rss.mjs) ---------- */
const entrySrc = [
  `export { transferDays } from "./data/transferDays.ts";`,
  `export { worldCupDays } from "./data/worldCupDays.ts";`,
  `export { leaguesDays } from "./data/leaguesDays.ts";`,
  `export { nflDays } from "./data/nflDays.ts";`,
  `export { f1Days } from "./data/f1Days.ts";`,
  `export { tennisDays } from "./data/tennisDays.ts";`,
  `export { golfDays } from "./data/golfDays.ts";`,
].join("\n");
const tmp = join(ROOT, ".news-sitemap-bundle.mjs");
let data;
try {
  await build({ stdin: { contents: entrySrc, resolveDir: SRC, loader: "ts", sourcefile: "news-sitemap-entry.ts" },
    bundle: true, format: "esm", platform: "node", outfile: tmp, logLevel: "silent" });
  data = await import(pathToFileURL(tmp).href + `?t=${process.hrtime.bigint()}`);
} finally { try { rmSync(tmp); } catch {} }

// Lane registry, identical to build-rss.mjs: football keeps /desk/<lane>/ (World Cup's URL lane
// is hyphenated even though its section key is "worldcup"); new sports syndicate from
// /<urlBase>/<laneKey>/.
const SPORT_DATA = { nfl: data.nflDays, f1: data.f1Days, tennis: data.tennisDays, golf: data.golfDays };
const lanes = [
  { base: "/desk/transfer/", days: data.transferDays },
  { base: "/desk/world-cup/", days: data.worldCupDays },
  { base: "/desk/leagues/", days: data.leaguesDays },
];
for (const sport of SPORTS) {
  if (sport.key === "football") continue;
  for (const laneKey of sport.lanes) {
    lanes.push({ base: `/${sport.urlBase}/${laneKey}/`, days: SPORT_DATA[sport.key] || [] });
  }
}

// The data is date-only; each entry publishes at 12:00 in the desk's timezone
// (America/Edmonton, -0600 in summer) — the same instant build-rss.mjs stamps on the RSS
// pubDate, here in ISO 8601 for news:publication_date.
const isoDate = (dateOnly) => `${dateOnly}T12:00:00-06:00`;

const cutoff = Date.now() - WINDOW_MS;
const items = lanes
  .flatMap(({ base, days }) => days.map((d) => ({ ...d, base })))
  .filter((it) => new Date(isoDate(it.date)).getTime() >= cutoff)
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
      <news:publication_date>${isoDate(it.date)}</news:publication_date>
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
