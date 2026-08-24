/* build-search.mjs — site search on a static site.
 *
 * thearchv.ca is positioned as an archive and, until this pass, had no way to search it. It is
 * also static files on GitHub Pages, so there is no server to ask. The answer is a build-time
 * index and a client that reads it:
 *
 *   dist/search-index.json     every destination on the site, one row each
 *   dist/search/index.html     the search page, same static family as the lane and article pages
 *   dist/search/search.js      the client, copied verbatim from public/search/ by Vite
 *
 * NO THIRD-PARTY SERVICE. Nothing here calls out, nothing needs a key, and nothing can start
 * charging or go down on its own. The whole corpus is a few tens of kilobytes of JSON, fetched
 * once, on the one page that needs it.
 *
 * NO INLINE SCRIPT. The client is a file under script-src 'self', so this page adds no new CSP
 * hash beyond the two the shared masthead and PostHog snippets already carry. The <script> tag
 * points at /search/search.js?v=<hash of the file>, so a change to the client is never served
 * from a stale cache. scripts/verify-csp-pages.mjs checks /search/ with every other family.
 *
 * THE INDEX IS DERIVED, NEVER HAND-LISTED. Desk entries come from the same src/data/*.ts the
 * article pages are built from, long reads from the same longReads + readSlug pair, content
 * pages from the same loadContentPages() the section fronts enumerate, glossary terms from
 * scripts/glossary-data.mjs and legends from src/data/legends.ts. A new entry is searchable on
 * the next build with no edit here, and this file cannot list a page that does not exist.
 *
 * Runs near the end of the chain (see package.json "build"): after build-content.mjs has written
 * dist/sitemap.xml, so its /search/ row appends to whatever is there, the pattern every other
 * generator uses. Nothing outside the repo is read.
 */
import { build } from "esbuild";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  SITE, esc, escAttr, clampTitle, clampDescription, LANE_META, byDateDesc,
  masthead, footer, posthogSnippet, fontLinks, pageStyles,
  cspMeta, MASTHEAD_SCRIPT_HASH, POSTHOG_SCRIPT_HASH, RSS_LINK, SPORTS,
} from "./shared/page-shell.mjs";
import { loadContentPages } from "./shared/content-pages.mjs";
import { glossaryEntries } from "./glossary-data.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const OUT = process.env.CONTENT_OUT || join(ROOT, "dist");

const PAGE_CSP = cspMeta({ scripts: [MASTHEAD_SCRIPT_HASH, POSTHOG_SCRIPT_HASH], posthog: true, googleFonts: true });

/* ---------- the typed data, through the same esbuild bundle every generator here uses ---------- */
const entrySrc = [
  `export { transferDays } from "./data/transferDays.ts";`,
  `export { worldCupDays } from "./data/worldCupDays.ts";`,
  `export { leaguesDays } from "./data/leaguesDays.ts";`,
  `export { nflDays } from "./data/nflDays.ts";`,
  `export { f1Days } from "./data/f1Days.ts";`,
  `export { tennisDays } from "./data/tennisDays.ts";`,
  `export { golfDays } from "./data/golfDays.ts";`,
  `export { longReads } from "./data/longReads.ts";`,
  `export { readPath } from "./data/readSlug.ts";`,
  `export { legends } from "./data/legends.ts";`,
].join("\n");
const tmp = join(ROOT, ".search-bundle.mjs");
let data;
try {
  await build({ stdin: { contents: entrySrc, resolveDir: SRC, loader: "ts", sourcefile: "search-entry.ts" },
    bundle: true, format: "esm", platform: "node", outfile: tmp, logLevel: "silent" });
  data = await import(pathToFileURL(tmp).href + `?t=${process.hrtime.bigint()}`);
} finally { try { rmSync(tmp); } catch {} }

/* ---------- the corpus ----------
   One row is { title, dek, url, lane, date }. The dek is clamped: it is a preview line under a
   result, not the article, and a full standfirst on every row roughly doubles the file every
   reader on /search/ downloads. */
const docs = [];
const seen = new Set();
const clampDek = (s) => clampDescription(s, 180);

function add(title, dek, url, lane, date = "") {
  const t = String(title ?? "").trim();
  if (!t || !url) return;
  // A page can legitimately be reached from two places in this file (a lane front is both a
  // desk and a destination); the URL plus the title is what makes a row distinct.
  const key = `${url}\u0000${t}`;
  if (seen.has(key)) return;
  seen.add(key);
  docs.push({ title: t, dek: clampDek(dek ?? ""), url, lane, date });
}

/* desk entries, every lane on the site */
const deskLanes = [
  { label: LANE_META.transfer.label, base: "/desk/transfer/", days: data.transferDays },
  { label: LANE_META["world-cup"].label, base: "/desk/world-cup/", days: data.worldCupDays },
  { label: LANE_META.leagues.label, base: "/desk/leagues/", days: data.leaguesDays },
];
const SPORT_DAYS = { nfl: data.nflDays, f1: data.f1Days, tennis: data.tennisDays, golf: data.golfDays };
for (const sport of SPORTS) {
  if (sport.key === "football") continue;
  deskLanes.push({ label: `${sport.label} Question Desk`, base: `/${sport.urlBase}/questions/`, days: SPORT_DAYS[sport.key] || [] });
}
for (const { label, base, days } of deskLanes) {
  for (const entry of [...days].sort(byDateDesc)) {
    add(entry.headline, entry.dek, `${base}${entry.date}/`, label, entry.date);
  }
}

/* long reads */
for (const r of data.longReads) {
  add(r.title, `${r.kicker}. ${r.meta}. ${String(r.body).split(/\n\s*\n/)[0] ?? ""}`, data.readPath(r.title), "Long reads", r.date ?? "");
}

/* content pages: /finals/, /united/, /explainers/, /notes/ */
const SECTION_LABEL = { finals: "Finals", united: "Manchester United", explainers: "Explained", notes: "Notes", legends: "Legends" };
for (const p of loadContentPages()) {
  add(p.title, p.description ?? p.eyebrow ?? "", `/${p.section}/${p.slug}/`, SECTION_LABEL[p.section] ?? p.section, p.datePublished ?? "");
}

/* glossary. The entry title is the term; the row's preview line is the plain-language answer,
   which is also the first thing on the page it opens. */
for (const e of glossaryEntries) {
  add(e.title, e.answer ?? "", `/glossary/${e.slug}/`, "Glossary");
}

/* legends. The Legends Series has no per-profile pages, so every profile points at the front
   that actually carries it. A reader searching a name still lands on the page with that name on
   it, and no URL is invented. */
for (const l of data.legends) {
  add(l.name, `${l.years ? `${l.nation}, ${l.years}. ` : `${l.nation}. `}${l.bio ?? ""}`, "/legends/", "Legends");
}

/* the fixed destinations: fronts, sections, evergreen surfaces */
const DESTINATIONS = [
  ["The ARCHV front page", "The day's lead across the football desks, the legends wall and the long reads.", "/", "The ARCHV"],
  ["Transfer Desk", "Manchester United transfer news, every move checked against two independent sources.", "/desk/transfer/", "Desks"],
  ["International Football", "World Cup 2026 and international football, men's and women's, every day there is football on.", "/desk/world-cup/", "Desks"],
  ["Football Leagues", "Title races, promotions, relegation fights and the sackings behind them.", "/desk/leagues/", "Desks"],
  ["NFL", "The NFL desk, one answered question a day.", "/nfl/", "Desks"],
  ["Formula 1", "The Formula 1 desk, one answered question a day.", "/f1/", "Desks"],
  ["Tennis", "The tennis desk, one answered question a day.", "/tennis/", "Desks"],
  ["Golf", "The golf desk, one answered question a day.", "/golf/", "Desks"],
  ["The finals", "World Cup finals from Mexico 1970 onwards, plus the men's and women's finals of 2026, one page each.", "/finals/", "Sections"],
  ["Manchester United, in depth", "Manchester United in long form, with the numbers attached.", "/united/", "Sections"],
  ["Football, explained", "The rules, the terms and the records, without the jargon.", "/explainers/", "Sections"],
  ["Notes", "How the archive is put together, and the notes on method behind it.", "/notes/", "Sections"],
  ["The Legends", "One football great per entry, drawn in the house style.", "/legends/", "Sections"],
  ["Long reads", "Long-form from the archive: ownership, academies, accounting and television money.", "/reads/", "Sections"],
  ["Glossary", "Sixty-odd football terms, defined in a sentence each.", "/glossary/", "Reference"],
  ["Editorial standards", "The two-source rule, the correction policy and what the desk will not publish.", "/standards/", "Reference"],
  ["Player duels", "Two players, the same stats, side by side.", "/duel/", "Games"],
  ["Daily archive game", "One historical player a day, four clues, five guesses.", "/guess/", "Games"],
  ["Joseph Bankole", "Who writes and edits The ARCHV, and everything filed under that byline.", "/authors/joseph-bankole/", "About"],
  ["About The ARCHV", "What the archive is, who runs it, and how to reach it.", "/about/", "About"],
  ["Corrections", "Every correction the desk has made, dated and kept.", "/corrections/", "About"],
];
for (const [title, dek, url, lane] of DESTINATIONS) add(title, dek, url, lane);

/* ---------- write the index ---------- */
mkdirSync(OUT, { recursive: true });
const indexJson = JSON.stringify({ generated: new Date().toISOString().slice(0, 10), count: docs.length, docs });
writeFileSync(join(OUT, "search-index.json"), indexJson);

const shortHash = (s) => createHash("sha256").update(s).digest("base64url").slice(0, 10);
const indexVersion = shortHash(indexJson);

// The client is copied into dist by Vite from public/search/. Read it back from dist so the hash
// is of the file actually served; fall back to the source copy if the vite step has not run
// (a bare `node scripts/build-search.mjs` on a clean tree).
const clientDist = join(OUT, "search", "search.js");
const clientSrc = join(ROOT, "public", "search", "search.js");
const clientPath = existsSync(clientDist) ? clientDist : clientSrc;
if (!existsSync(clientPath)) throw new Error(`[build-search] search client not found at ${clientDist} or ${clientSrc}`);
const clientVersion = shortHash(readFileSync(clientPath));

/* ---------- the page ---------- */
const URL_SELF = `${SITE}/search/`;
const TITLE = "Search the archive";
const LEDE =
  "Every desk entry, long read, final, explainer, glossary term and legend on the site, searchable by name, club, competition or year. There is no server here to ask, so your browser downloads the index once and does the matching itself.";

// The browse list under the empty field. A search page that shows a blank box and nothing else
// asks a reader to guess what is in the archive; this tells them.
const BROWSE = [
  ["/desk/transfer/", "Transfer Desk"],
  ["/desk/world-cup/", "International Football"],
  ["/desk/leagues/", "Football Leagues"],
  ["/reads/", "Long reads"],
  ["/finals/", "The finals"],
  ["/united/", "Manchester United"],
  ["/explainers/", "Football, explained"],
  ["/legends/", "The Legends"],
  ["/glossary/", "Glossary"],
  ["/guess/", "Daily archive game"],
];

const page = `<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>${esc(clampTitle([TITLE, "The ARCHV"]))}</title>
  <meta name="description" content="${escAttr(clampDescription(LEDE))}" />
  <meta name="robots" content="index,follow,max-image-preview:large" />
  <!-- The canonical is the bare path on purpose. /search/?q=... is a real, shareable URL and
       GitHub Pages serves this same file for every query string, so without this a crawler
       following one shared query link would index it as a separate thin page. -->
  <link rel="canonical" href="${URL_SELF}" />
  <meta name="theme-color" content="#FFFFFF" />
  ${PAGE_CSP}
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="The ARCHV" />
  <meta property="og:title" content="${escAttr(TITLE)}" />
  <meta property="og:description" content="${escAttr(LEDE)}" />
  <meta property="og:url" content="${URL_SELF}" />
  <meta property="og:image" content="${SITE}/og.jpg" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:site" content="@thearchvfc" />
  <meta name="twitter:title" content="${escAttr(TITLE)}" />
  <meta name="twitter:description" content="${escAttr(LEDE)}" />
  <meta name="twitter:image" content="${SITE}/og.jpg" />
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  ${RSS_LINK}
  <script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        name: TITLE,
        description: LEDE,
        url: URL_SELF,
        inLanguage: "en-GB",
        isPartOf: { "@type": "WebSite", name: "The ARCHV", url: `${SITE}/` },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
          { "@type": "ListItem", position: 2, name: TITLE, item: URL_SELF },
        ],
      },
    ],
  }).replace(/</g, "\\u003c")}</script>

  <!-- PostHog: pageview only on this static surface. Same project as the website. -->
  ${posthogSnippet()}

  ${fontLinks()}

  ${pageStyles()}
  <style>
    .search { padding: 1.5rem 0 1rem; }
    /* The field has a placeholder and a visible submit button, so its label is for screen
       readers rather than for the layout. .skip on the homepage is a skip LINK and reappears on
       focus; this must never become visible, so it is its own rule. */
    .vh { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden;
      clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; border: 0; }
    .search__form { display: flex; gap: .6rem; margin: 1.6rem 0 .4rem; }
    .search__field {
      flex: 1 1 auto; min-width: 0; padding: .8rem 1rem; font: inherit; font-size: 1.05rem;
      color: var(--ink); background: var(--bg); border: 1px solid var(--rule); border-radius: .5rem;
      -webkit-appearance: none; appearance: none;
    }
    .search__field::placeholder { color: var(--ink-muted); }
    .search__field:focus-visible { outline: 2px solid var(--accent-ink); outline-offset: 2px; border-color: var(--accent-ink); }
    .search__go { flex: 0 0 auto; padding: .8rem 1.2rem; font: inherit; font-weight: 600; cursor: pointer;
      color: #FFFFFF; background: var(--accent-ink); border: 1px solid var(--accent-ink); border-radius: .5rem; }
    .search__go:hover { filter: brightness(1.06); }
    .search__status { min-height: 1.5rem; margin: .8rem 0 0; font-size: .92rem; color: var(--ink-muted); }
    .search__results { list-style: none; padding: 0; margin: 1rem 0 0; display: grid; gap: .75rem; }
    .sresult__link { display: block; padding: 1rem 1.15rem; border: 1px solid var(--rule); border-radius: .6rem;
      color: inherit; background: var(--bg); box-shadow: var(--shadow-soft); }
    .sresult__link:hover { border-color: var(--accent-ink); text-decoration: none; }
    .sresult__link:focus-visible { outline: 2px solid var(--accent-ink); outline-offset: 3px; }
    .sresult__kicker { display: block; font-family: var(--font-mono); font-size: .7rem; letter-spacing: .1em;
      text-transform: uppercase; color: var(--accent-ink); margin-bottom: .35rem; }
    .sresult__headline { display: block; color: var(--ink); font-family: "Fraunces", Georgia, serif;
      font-size: 1.05rem; line-height: 1.28; margin-bottom: .4rem; }
    .sresult__dek { display: block; font-size: .88rem; color: var(--ink-muted); }
    .sresult mark { background: rgba(245, 79, 27, .18); color: inherit; padding: 0 .1em; border-radius: 2px; }
    .search__browse { margin: 1.6rem 0 0; padding-top: 1.3rem; border-top: 1px solid var(--rule); }
    .search__browse[hidden] { display: none; }
    .search__browse-title { color: var(--ink); font-family: "Fraunces", Georgia, serif; font-weight: 600; font-size: 1.05rem; margin: 0 0 .7rem; }
    .search__browse-list { list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: .5rem .9rem; font-size: .95rem; }
    .search__note { margin: 1.2rem 0 0; font-size: .9rem; color: var(--ink-muted); }
    @media (max-width: 480px) {
      .search__form { flex-wrap: wrap; }
      .search__go { width: 100%; }
    }
  </style>
</head>
<body>
  ${masthead()}
  <main class="wrap">
    <section class="search" id="search" data-index="/search-index.json?v=${escAttr(indexVersion)}">
      <p class="breadcrumb"><a href="/">The ARCHV</a> / Search</p>
      <p class="lane__eyebrow">Search</p>
      <h1>${esc(TITLE)}</h1>
      <p class="lane__lede">${esc(LEDE)}</p>

      <form class="search__form" id="search-form" role="search" action="/search/" method="get">
        <label class="vh" for="search-q">Search The ARCHV</label>
        <input class="search__field" id="search-q" name="q" type="search" autocomplete="off"
               autocapitalize="off" spellcheck="false" enterkeyhint="search"
               placeholder="A player, a club, a final, a year" />
        <button class="search__go" type="submit">Search</button>
      </form>

      <p class="search__status" id="search-status" role="status" aria-live="polite"></p>
      <ul class="search__results" id="search-results" aria-label="Search results"></ul>

      <div class="search__browse" id="search-browse">
        <h2 class="search__browse-title">Or start from a desk</h2>
        <ul class="search__browse-list">
          ${BROWSE.map(([href, label]) => `<li><a href="${escAttr(href)}">${esc(label)}</a></li>`).join("\n          ")}
        </ul>
        <p class="search__note">${docs.length} pages in the index, rebuilt with the site.</p>
      </div>

      <noscript>
        <p class="search__note">Search needs JavaScript, which is not running here. The desks and sections above list every entry in full.</p>
      </noscript>
    </section>
  </main>
  ${footer()}
  <script src="/search/search.js?v=${escAttr(clientVersion)}" defer></script>
</body>
</html>
`;

const dir = join(OUT, "search");
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "index.html"), page);

/* ---------- sitemap row ---------- */
const sitemapOut = join(OUT, "sitemap.xml");
const sitemapFallback = join(ROOT, "public", "sitemap.xml");
const sitemapSrc = existsSync(sitemapOut) ? sitemapOut : existsSync(sitemapFallback) ? sitemapFallback : null;
if (sitemapSrc) {
  const xml = readFileSync(sitemapSrc, "utf8");
  if (!xml.includes(`<loc>${URL_SELF}</loc>`)) {
    writeFileSync(
      sitemapOut,
      xml.replace("</urlset>", `  <url><loc>${URL_SELF}</loc><changefreq>weekly</changefreq><priority>0.5</priority></url>\n</urlset>`),
    );
  }
}

console.log(
  `[build-search] wrote search-index.json (${docs.length} rows, ${(indexJson.length / 1024).toFixed(1)} KB) ` +
  `and /search/ (index v${indexVersion}, client v${clientVersion})`,
);
