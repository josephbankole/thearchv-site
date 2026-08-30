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
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDayData } from "./shared/day-data.mjs";
import { appendUrls } from "./shared/sitemap.mjs";
import {
  SITE, esc, escAttr, clampTitle, clampDescription, longDate, LANE_META,
  cardArt, deskNav, masthead, footer, documentShell,
  cspMeta, MASTHEAD_SCRIPT_HASH, POSTHOG_SCRIPT_HASH,
  SPORTS, lanesForSport, QUESTION_LANE_META, SPORT_DESK_COPY,
} from "./shared/page-shell.mjs";
import { glossaryEntries } from "./glossary-data.mjs";

// slug -> glossary entry, so the "From the glossary" strip (below) can resolve a lane's chosen
// terms to their titles and pages. A typo is a build-time error, not a silent broken link —
// same discipline as build-glossary-pages.mjs relatedList().
const GLOSSARY_BY_SLUG = new Map(glossaryEntries.map((e) => [e.slug, e]));

// Both inline scripts on this page family (masthead toggle + PostHog loader) are static, no
// per-page interpolation, so one CSP works for every lane page.
const PAGE_CSP = cspMeta({ scripts: [MASTHEAD_SCRIPT_HASH, POSTHOG_SCRIPT_HASH], posthog: true, googleFonts: true });

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = process.env.CONTENT_OUT || join(ROOT, "dist");

/* ---------- the typed day data (same seam as build-article-pages.mjs) ---------- */
// scripts/shared/day-data.mjs is the one loader for src/data/*.ts, and it hands every lane back
// sorted newest-first, which the rest of this script assumes. `readTime` rides in on the same
// bundle: src/lib/readTime.ts is the one copy of read-time on the site (see its header) rather
// than a reimplementation here in .mjs. SPORT_DAYS is the new sports keyed by sport for the
// lane-front loop below (some empty today; the desks open one entry at a time); football keeps
// its own bespoke LANES rendering above, untouched.
const {
  transferDays, worldCupDays, leaguesDays, sportDays: SPORT_DAYS, readLabel,
} = await loadDayData({ extras: ["readTime"] });

// Intro copy (SEO/AEO pass, UNIT 2, 2026-07-14): each lane's cards carried little or no
// crawlable prose above them, so every intro now states what the lane covers (keyword-bearing,
// matching that lane's indexTitle in LANE_META), the two-source verification promise, and the
// cadence, in that order. Doubles as this page's meta description (see render() below), so it
// stays a self-contained paragraph rather than a fragment.
// `glossary` = 2-3 slugs from scripts/glossary-data.mjs relevant to that lane, surfaced in a
// compact "From the glossary" strip above the footer (glossaryStrip below). Lanes link articles
// but did not link the glossary; these give a reader the terms that lane leans on.
const LANES = {
  transfer: { ...LANE_META.transfer, days: transferDays, glossary: ["loan-with-obligation", "xg"], intro: "Manchester United transfer news, every move checked against two independent sources before it goes up. A deal marked VERIFIED is done and confirmed; one marked RUMOUR is a reported link, not yet a certainty, however loudly it is being talked about. New entries are drawn the same day the story breaks." },
  "world-cup": { ...LANE_META["world-cup"], days: worldCupDays, glossary: ["var", "offside"], intro: "World Cup 2026 and international football, men's and women's, every competition covered while it is being played. Every result and headline is checked against two independent sources before it goes up. A fresh entry is drawn for each day there is football on." },
  leagues: { ...LANE_META.leagues, days: leaguesDays, glossary: ["pressing", "half-space"], intro: "The club season across the Premier League, the Champions League and the rest of Europe's top divisions: title races, promotions, relegation fights and the sackings behind them. Every entry is checked against two sources before it goes up, the same standard as the rest of the desk. New wraps are tracked day by day through the season, not just on match days." },
};

function laneCard(entry, laneKey) {
  // Art and its alt now come from cardArt() in scripts/shared/page-shell.mjs, which resolves the
  // filed image first and falls back to a banked portrait or the club badge (phase 2B). Before
  // that, a lane front was a wall of text on every day the desk filed no image field.
  const avatar = cardArt(entry);
  return `<li><a class="lane-card" href="/desk/${laneKey}/${entry.date}/">${avatar}<span class="lane-card__body"><span class="lane-card__kicker">${esc(entry.day)} · ${esc(longDate(entry.date))} · ${esc(readLabel(entry.dek, entry.body))}</span><span class="lane-card__headline">${esc(entry.headline)}</span><span class="lane-card__dek">${esc(entry.dek)}</span></span></a></li>`;
}

// Compact "From the glossary" strip: the lane's 2-3 relevant terms, linked to their glossary
// pages. Resolves each slug through GLOSSARY_BY_SLUG and throws on an unknown one (a broken
// cross-link should fail the build, not ship). Returns "" for a lane with no terms configured.
function glossaryStrip(lane) {
  const slugs = lane.glossary || [];
  if (!slugs.length) return "";
  const links = slugs
    .map((slug) => {
      const entry = GLOSSARY_BY_SLUG.get(slug);
      if (!entry) throw new Error(`glossaryStrip: "${lane.label}" lists unknown glossary slug "${slug}"`);
      return `<li><a href="/glossary/${entry.slug}/">${esc(entry.title)}</a></li>`;
    })
    .join("\n        ");
  return `<aside class="lane-glossary" aria-label="From the glossary">
      <h2 class="lane-glossary__title">From the glossary</h2>
      <ul class="lane-glossary__list">
        ${links}
      </ul>
      <a class="lane-glossary__all" href="/glossary/">The full glossary</a>
    </aside>`;
}

function render(laneKey, lane) {
  const url = `${SITE}/desk/${laneKey}/`;
  // <title> carries the entity-rich, search-only title; og/twitter keep the brand-clean form.
  const pageTitle = lane.indexTitle;
  const socialTitle = `${lane.label} · The ARCHV`;

  return `${documentShell({
  title: clampTitle(pageTitle.split(" \u00b7 ")),
  metaDescription: clampDescription(lane.intro),
  description: lane.intro,
  socialTitle,
  robots: "index,follow,max-image-preview:large",
  canonical: url,
  ogUrl: url,
  ogType: "website",
  ogImage: `${SITE}/og.jpg`,
  csp: PAGE_CSP,
  jsonLd: {
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
  },
})}
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
    ${glossaryStrip(lane)}
  </main>
  ${footer()}
</body>
</html>
`;
}

/* ---------- new-sport lane fronts (multi-sport, 2026-07-22) ----------
   Football's three lane fronts are rendered by render() above and are unchanged bar the masthead
   sport tab row. Each new sport carries a single Question Desk lane; its front lists that lane's
   entries newest-first (or the honest holding paragraph while empty), using the same page shell,
   the same lane-card markup, and a sport-scoped deskNav. */
function renderSportLane(sport, laneKey) {
  const laneLabel = QUESTION_LANE_META[laneKey]?.label ?? laneKey;
  const copy = SPORT_DESK_COPY[sport.key];
  const days = SPORT_DAYS[sport.key] || [];
  const url = `${SITE}/${sport.urlBase}/${laneKey}/`;
  /* SEO/AEO audit fix 5 (2026-07-28): /<sport>/questions/ and /<sport>/ were 98% textually
     identical, both self-canonical, both in the sitemap and both carrying CollectionPage, which
     left Google four near-duplicate pairs to pick a winner from. The lane front now names the
     sport root as its canonical and is left out of the sitemap (see the write loop below), while
     the page itself stays live and crawlable so no inbound link 404s. Deliberately NOT noindexed:
     a noindex plus a canonical pointing elsewhere are conflicting instructions, and the canonical
     on its own is what consolidates the pair. og:url follows the canonical for the same reason, so
     a share of either URL credits one page. */
  const canonical = `${SITE}/${sport.urlBase}/`;
  const pageTitle = `${sport.label} ${laneLabel} · The ARCHV`;
  const socialTitle = `${sport.label} ${laneLabel} · The ARCHV`;

  const rail = days.length
    ? `<ul class="lane-list" aria-label="${escAttr(`${sport.label} ${laneLabel}`)}, newest first">
        ${days.map((entry) => `<li><a class="lane-card" href="/${sport.urlBase}/${laneKey}/${entry.date}/">${cardArt(entry)}<span class="lane-card__body"><span class="lane-card__kicker">${esc(entry.day)} · ${esc(longDate(entry.date))} · ${esc(readLabel(entry.dek, entry.body))}</span><span class="lane-card__headline">${esc(entry.headline)}</span><span class="lane-card__dek">${esc(entry.dek)}</span></span></a></li>`).join("\n        ")}
      </ul>`
    : `<div class="sport-holding"><p>${esc(copy.holding)}</p></div>`;

  return `${documentShell({
  title: clampTitle(pageTitle.split(" \u00b7 ")),
  metaDescription: clampDescription(copy.lede),
  description: copy.lede,
  socialTitle,
  robots: "index,follow,max-image-preview:large",
  // Canonical and og:url both point at the SPORT ROOT, not at this page. See the note above
  // where `canonical` is set: this front and /<sport>/ were near-duplicates, and the canonical
  // is what consolidates them. Deliberately NOT noindexed, and og:url follows the canonical so
  // a share of either URL credits one page. The two are named separately here because on the
  // legacy day pages they deliberately differ.
  canonical,
  ogUrl: canonical,
  ogType: "website",
  ogImage: `${SITE}/og.jpg`,
  csp: PAGE_CSP,
  jsonLd: {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "CollectionPage", name: `${sport.label} ${laneLabel}`, description: copy.lede, url, inLanguage: "en-GB", isPartOf: { "@type": "WebSite", name: "The ARCHV", url: `${SITE}/` } },
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
        { "@type": "ListItem", position: 2, name: sport.label, item: `${SITE}/${sport.urlBase}/` },
        { "@type": "ListItem", position: 3, name: laneLabel, item: url },
      ] },
    ],
  },
})}
<body>
  ${masthead(sport.key)}
  ${deskNav(laneKey, sport.key)}
  <main class="wrap wrap--wide">
    <section class="sport-head">
      <p class="breadcrumb"><a href="/">The ARCHV</a> / <a href="/${sport.urlBase}/">${esc(sport.label)}</a> / ${esc(laneLabel)}</p>
      <p class="sport-head__eyebrow">${esc(sport.label)} · ${esc(laneLabel)}</p>
      <h1>${esc(laneLabel)}</h1>
      <p class="sport-head__lede">${esc(copy.lede)}</p>
      ${rail}
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
  urls.push({ loc: `${SITE}/desk/${laneKey}/`, changefreq: "daily", priority: "0.7" });
  count++;
}

// New-sport lane fronts: /<urlBase>/<lane>/ for every non-football sport and each of its lanes.
// No sitemap row on purpose (SEO/AEO audit fix 5, 2026-07-28): each of these is canonical to its
// sport root (see renderSportLane above), and a sitemap should only list URLs you want indexed in
// their own right. The pages stay live, crawlable and linked from the sport tab row, so nothing
// 404s and the sport root inherits the pair's signals. The three football lane fronts above keep
// their rows — they are self-canonical and have no duplicate.
for (const sport of SPORTS) {
  if (sport.key === "football") continue;
  for (const laneKey of sport.lanes) {
    const dir = join(OUT, sport.urlBase, laneKey);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "index.html"), renderSportLane(sport, laneKey));
    count++;
  }
}

/* ---------- sitemap: append the three football lane fronts to whatever dist/sitemap.xml exists at
   this point in the chain. shared/sitemap.mjs owns the splice, the public/sitemap.xml fallback,
   the dedupe and the trailing-slash rule. */
appendUrls(urls);

console.log(`[build-lane-pages] wrote ${count} lane index page(s) to ${OUT}/desk/<lane>/, appended to sitemap`);
