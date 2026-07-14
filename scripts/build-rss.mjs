/* build-rss.mjs — emits an RSS 2.0 feed at dist/feed.xml, the 30 most recent daily entries
   across all three lanes (Transfer Desk, World Cup, Football Leagues), newest first. Runs AFTER
   `vite build` and build-feed.mjs (see package.json "build"). Same data source as the website
   and the JSON app feed (src/data/*.ts, bundled via esbuild), so the three cannot drift: one
   deploy updates all of them. Output dir defaults to ./dist, override with CONTENT_OUT to match
   the other page generators. */
import { build } from "esbuild";
import { writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { byDateDesc } from "./shared/page-shell.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const OUT = process.env.CONTENT_OUT || join(ROOT, "dist");
const SITE = "https://thearchv.ca";
const MAX_ITEMS = 30;

/* ---------- load the typed day data via a bundled temp module (same pattern as build-feed.mjs) ---------- */
const entrySrc = [
  `export { transferDays } from "./data/transferDays.ts";`,
  `export { worldCupDays } from "./data/worldCupDays.ts";`,
  `export { leaguesDays } from "./data/leaguesDays.ts";`,
].join("\n");
const tmp = join(ROOT, ".rss-bundle.mjs");
let data;
try {
  await build({ stdin: { contents: entrySrc, resolveDir: SRC, loader: "ts", sourcefile: "rss-entry.ts" },
    bundle: true, format: "esm", platform: "node", outfile: tmp, logLevel: "silent" });
  data = await import(pathToFileURL(tmp).href + `?t=${process.hrtime.bigint()}`);
} finally { try { rmSync(tmp); } catch {} }

// URL lane per data source: World Cup's internal `section` key is "worldcup" but its URL lane is
// hyphenated "world-cup" (same mapping build-article-pages.mjs / build-feed.mjs use for the
// canonical /desk/<lane>/<date>/ URL). Tag each entry with its lane, merge, sort newest-first.
const lanes = [
  { urlLane: "transfer", days: data.transferDays },
  { urlLane: "world-cup", days: data.worldCupDays },
  { urlLane: "leagues", days: data.leaguesDays },
];
const items = lanes
  .flatMap(({ urlLane, days }) => days.map((d) => ({ ...d, urlLane })))
  .sort(byDateDesc)
  .slice(0, MAX_ITEMS);

const articleUrl = (it) => `${SITE}/desk/${it.urlLane}/${it.date}/`;

/* ---------- XML helpers ---------- */
const xmlEsc = (s = "") =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// RFC-822 date. The data is date-only (YYYY-MM-DD); publish each entry at 12:00:00 in the
// desk's timezone (America/Edmonton, -0600 in summer) so readers see a stable, sensible time.
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function rfc822(dateOnly) {
  const [y, m, d] = String(dateOnly).split("-").map(Number);
  // Weekday of that calendar date (time-of-day irrelevant to the weekday).
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const dd = String(d).padStart(2, "0");
  return `${weekday}, ${dd} ${MONTHS[m - 1]} ${y} 12:00:00 -0600`;
}

/* ---------- compose the RSS 2.0 document ---------- */
const lastBuild = items.length ? rfc822(items[0].date) : rfc822(new Date().toISOString().slice(0, 10));

const itemXml = items
  .map((it) => {
    const url = articleUrl(it);
    return `    <item>
      <title>${xmlEsc(it.headline)}</title>
      <link>${xmlEsc(url)}</link>
      <guid isPermaLink="true">${xmlEsc(url)}</guid>
      <description>${xmlEsc(it.dek)}</description>
      <pubDate>${rfc822(it.date)}</pubDate>
    </item>`;
  })
  .join("\n");

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>The ARCHV</title>
    <link>${SITE}/</link>
    <atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml" />
    <description>Daily, two-source-verified football reporting from The ARCHV: Manchester United transfers, international football and the leagues.</description>
    <language>en-GB</language>
    <lastBuildDate>${lastBuild}</lastBuildDate>
${itemXml}
  </channel>
</rss>
`;

writeFileSync(join(OUT, "feed.xml"), xml);
console.log(`[build-rss] wrote ${items.length} item(s) to ${OUT}/feed.xml (newest ${items[0]?.date ?? "none"})`);
