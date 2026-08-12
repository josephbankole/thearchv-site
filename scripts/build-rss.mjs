/* build-rss.mjs — emits an RSS 2.0 feed at dist/feed.xml, the 30 most recent daily entries
   across all three lanes (Transfer Desk, World Cup, Football Leagues), newest first. Runs AFTER
   `vite build`, build-feed.mjs AND build-article-pages.mjs (see package.json "build"): every
   item's enclosure is the article's own generated og.png (never a headshot — see ogAsset),
   and that file must already exist on disk so its byte length can be stat'd honestly. Same
   data source as the website and the JSON app feed (src/data/*.ts, bundled via esbuild), so
   the three cannot drift: one deploy updates all of them. Output dir defaults to ./dist,
   override with CONTENT_OUT to match the other page generators.

   Each item carries BOTH <description> (the short standfirst, a teaser) and <content:encoded>
   (the full article body as HTML in CDATA, plus the illustration and the rights notice). That
   split is the syndication convention: platforms that republish, Microsoft Start among them,
   read the body from content:encoded and ignore a dek-only feed. */
import { build } from "esbuild";
import { writeFileSync, rmSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { byDateDesc, esc, escAttr, SPORTS, laneByFeedKey } from "./shared/page-shell.mjs";
import { sourcesAwareParagraph } from "./shared/source-links.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const OUT = process.env.CONTENT_OUT || join(ROOT, "dist");
const SITE = "https://thearchv.ca";
const MAX_ITEMS = 30;
// Named author and editor of the publication (founder decision, 2026-07-21). Emitted per item
// as dc:creator, which is the field syndication platforms read for a byline.
const AUTHOR = "Joseph Bankole";
// The standing rights notice every canonical article page carries (see the article__rights
// paragraph in build-article-pages.mjs). Syndicated full text travels away from the site, so
// it carries the same notice with it. Kept byte-identical to the page copy.
const RIGHTS =
  "The ARCHV is an independent football-history publication, not affiliated with any governing body, league, club, or competition organiser. Club and competition names are referenced for editorial and historical commentary only and remain the property of their respective owners. Player illustrations are original stylised artwork, not photographs.";

/* ---------- load the typed day data via a bundled temp module (same pattern as build-feed.mjs) ---------- */
const entrySrc = [
  `export { transferDays } from "./data/transferDays.ts";`,
  `export { worldCupDays } from "./data/worldCupDays.ts";`,
  `export { leaguesDays } from "./data/leaguesDays.ts";`,
  `export { nflDays } from "./data/nflDays.ts";`,
  `export { f1Days } from "./data/f1Days.ts";`,
  `export { tennisDays } from "./data/tennisDays.ts";`,
  `export { golfDays } from "./data/golfDays.ts";`,
  `export { longReads } from "./data/longReads.ts";`,
  `export { readSlug } from "./data/readSlug.ts";`,
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
// `base` is the article path prefix per lane (leading + trailing slash). Football keeps
// /desk/<lane>/ so its items are byte-identical; new sports (multi-sport, 2026-07-22) syndicate
// from /<urlBase>/questions/. New sports are empty today, so feed.xml is unchanged until they
// publish. The SPORT_DATA map ties each new sport's exported array to its base.
const SPORT_DATA = { nfl: data.nflDays, f1: data.f1Days, tennis: data.tennisDays, golf: data.golfDays };
// Football lane bases derive from LANE_META.feedKey via laneByFeedKey — the worldcup↔world-cup
// hyphenation is declared once in page-shell.mjs, not restated here (2026-08-12 review).
const lanes = [
  { base: `/desk/${laneByFeedKey.transfer}/`, days: data.transferDays },
  { base: `/desk/${laneByFeedKey.worldcup}/`, days: data.worldCupDays },
  { base: `/desk/${laneByFeedKey.leagues}/`, days: data.leaguesDays },
];
for (const sport of SPORTS) {
  if (sport.key === "football") continue;
  for (const laneKey of sport.lanes) {
    lanes.push({ base: `/${sport.urlBase}/${laneKey}/`, days: SPORT_DATA[sport.key] || [] });
  }
}
// Long reads (2026-08-09). They got real URLs at /reads/<slug>/ in the same pass
// (scripts/build-reads-pages.mjs) and a feed a reader subscribes to should carry them. Mapped
// onto the same {headline, dek, body, date, base} shape the daily entries use, with the essay's
// own opening sentence as the dek because a LongRead has no standfirst field and inventing one
// would put words in the feed that are not on the page. `base` is empty and the item's path is
// carried whole in `date`-free form by articleUrl below, so these are given an explicit `path`
// instead — see articleUrl. Every essay currently on file predates the newest 30 daily entries,
// so today's feed.xml is unchanged; the next essay the engine files will syndicate.
const readFirstSentence = (body) => {
  const first = String(body).split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)[0] || "";
  const m = first.match(/^.*?[.!?](?=\s|$)/);
  return (m ? m[0] : first).trim();
};
const readItems = data.longReads.map((r) => ({
  headline: String(r.title).replace(/\.$/, ""),
  dek: readFirstSentence(r.body),
  body: r.body,
  date: r.date,
  path: `/reads/${data.readSlug(r.title)}/`,
}));

const items = lanes
  .flatMap(({ base, days }) => days.map((d) => ({ ...d, base })))
  .concat(readItems)
  .sort(byDateDesc)
  .slice(0, MAX_ITEMS);

// Daily entries live at <base>/<date>/; a long read carries its whole path on `path` because its
// URL is slug-based, not date-based.
const articleUrl = (it) => `${SITE}${it.path ?? `${it.base}${it.date}/`}`;

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

/* ---------- full article body for <content:encoded> ----------
   description stays the short standfirst (the teaser); content:encoded carries the article, which
   is the convention every syndication platform reads. Microsoft Start and similar ingest the body
   from this element, so a feed that only carried the dek gave them nothing to publish.

   Paragraph splitting and image access reuse build-article-pages.mjs exactly (body is one string
   with blank-line paragraph breaks; image is an OPTIONAL site-relative path with imageAlt beside
   it), so the feed body and the canonical page can never disagree about what an article says.

   The closing "Sources:" paragraph is linkified through the same shared allowlist the page uses
   (scripts/shared/source-links.mjs), added 2026-08-09: until then the page named the outlets as
   links and the feed shipped them as flat text, so a reader who took the syndicated copy lost the
   one thing the sources line is for. The anchors sit inside content:encoded's CDATA section, which
   is where HTML belongs in this feed — nothing here is double-escaped, and the paragraph text is
   escaped exactly once before any link is written into it. */
function bodyHtml(text) {
  return String(text)
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${sourcesAwareParagraph(p)}</p>`)
    .join("\n");
}

// CDATA is taken verbatim by the parser, so the one sequence that can break the section is "]]>".
// Splitting it across two sections leaves the bytes the consumer reconstructs unchanged.
const cdata = (html) => `<![CDATA[${String(html).replace(/\]\]>/g, "]]]]><![CDATA[>")}]]>`;

// Brand-illustrated headshot (public/heads/*.webp today), used ONLY as the illustration inside
// content:encoded — never as the enclosure (see ogAsset below for why).
function imageAsset(entry) {
  if (!entry.image) return null;
  return {
    url: `${SITE}${String(entry.image)}`,
    alt: entry.imageAlt ?? entry.headline,
  };
}

// The enclosure is ALWAYS the article's own generated OG card (dist/<base>/<date>/og.png, built
// by build-article-pages.mjs earlier in the chain), never a headshot (2026-08-07). Flipboard's
// RSS guidelines refuse to display an image reused across items (only one article keeps it, the
// rest go imageless — several headshots were shared by multiple articles) and want the smallest
// image dimension >= 500px (the headshots are ~240px). Each og.png is unique per article at
// 1200x630, satisfying both. The length is the byte size of the file actually on disk, and if
// the card was never generated the item simply carries no enclosure rather than a fabricated one.
function ogAsset(it) {
  // Long reads have no per-item card (they share the site-wide /og.jpg), so they take the same
  // route a daily entry whose card failed to render takes: no enclosure at all, never a
  // fabricated one.
  if (it.path) return null;
  const rel = `${it.base}${it.date}/og.png`;
  try {
    const bytes = statSync(join(OUT, ...rel.split("/").filter(Boolean))).size;
    return { url: `${SITE}${rel}`, type: "image/png", bytes };
  } catch {
    return null;
  }
}

// The article as a self-contained HTML fragment: standfirst, illustration, body, rights notice.
// Absolute image URL because the fragment is read far away from thearchv.ca. No width/height:
// the real pixel size is not read here, and a wrong dimension is worse than none.
function contentHtml(entry, img) {
  const parts = [`<p><strong>${esc(entry.dek)}</strong></p>`];
  if (img) parts.push(`<figure><img src="${escAttr(img.url)}" alt="${escAttr(img.alt)}" /></figure>`);
  parts.push(bodyHtml(entry.body));
  parts.push(`<p>${esc(RIGHTS)}</p>`);
  return parts.filter(Boolean).join("\n");
}

/* ---------- compose the RSS 2.0 document ---------- */
const lastBuild = items.length ? rfc822(items[0].date) : rfc822(new Date().toISOString().slice(0, 10));

const itemXml = items
  .map((it) => {
    const url = articleUrl(it);
    const img = imageAsset(it);
    // enclosure needs an honest byte length, so it is emitted only when the og.png was actually
    // found on disk. Same discipline as build-feed.mjs's infogram fields: the feed never
    // advertises an asset it could not confirm. The <img> inside content:encoded is
    // unconditional, so a missing local file still syndicates the picture.
    const enc = ogAsset(it);
    const enclosure = enc
      ? `\n      <enclosure url="${xmlEsc(enc.url)}" length="${enc.bytes}" type="${enc.type}" />`
      : "";
    return `    <item>
      <title>${xmlEsc(it.headline)}</title>
      <link>${xmlEsc(url)}</link>
      <guid isPermaLink="true">${xmlEsc(url)}</guid>
      <description>${xmlEsc(it.dek)}</description>
      <content:encoded>${cdata(contentHtml(it, img))}</content:encoded>
      <pubDate>${rfc822(it.date)}</pubDate>
      <dc:creator>${xmlEsc(AUTHOR)}</dc:creator>${enclosure}
    </item>`;
  })
  .join("\n");

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">
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
