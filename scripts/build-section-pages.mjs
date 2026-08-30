/* build-section-pages.mjs — the section fronts for the evergreen families, plus a branded 404.

   /finals/, /united/, /explainers/ and /legends/ all returned GitHub Pages' own default error
   page until 2026-08-09: unbranded, no route back, and reached by anyone who trimmed a URL or
   followed a stale link. The finals breadcrumb had been working around the missing index by
   pointing "Finals" at /#archive. This script emits:

     dist/404.html                  branded, served automatically by GitHub Pages for any miss
     dist/<section>/index.html      one front per content section, listing that section's pages

   Children are enumerated from scripts/shared/content-pages.mjs, the same parse of content/*.md
   that scripts/build-content.mjs builds the pages themselves from, so a front can never list a
   page that does not exist or miss one that does. /legends/ is the exception and takes its list
   from src/data/legends.ts: the Legends Series has no per-profile pages, so that front carries
   the profiles themselves and invents no URLs.

   Same self-contained page family as the lane and article pages (scripts/shared/page-shell.mjs).
   Runs after build-content.mjs, which writes dist/sitemap.xml first; this appends its rows to
   whatever sitemap exists at that point, the pattern the other generators use. The 404 gets no
   sitemap row and ships noindex: it is an error page, not a destination. */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDayData } from "./shared/day-data.mjs";
import {
  SITE, esc, escAttr, clampTitle, clampDescription, longDate,
  masthead, footer, posthogSnippet, fontLinks, pageStyles,
  cspMeta, MASTHEAD_SCRIPT_HASH, POSTHOG_SCRIPT_HASH, RSS_LINK,
} from "./shared/page-shell.mjs";
import { loadContentPages } from "./shared/content-pages.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = process.env.CONTENT_OUT || join(ROOT, "dist");

// Both inline scripts here (masthead toggle + PostHog loader) are static, so one CSP serves every
// page this script writes, the 404 included.
const PAGE_CSP = cspMeta({ scripts: [MASTHEAD_SCRIPT_HASH, POSTHOG_SCRIPT_HASH], posthog: true, googleFonts: true });

/* ---------- the fronts ----------
   One entry per section that exists in content/. A section with no entry here is a build error
   rather than a silently unindexed page: the same discipline glossaryBlock() in
   build-content.mjs uses for an unknown glossary slug. Copy is British English, house register,
   and each lede is written for its own page rather than reused from the homepage, so no two
   pages on the site ship the same meta description. */
const FRONTS = {
  finals: {
    label: "Finals",
    heading: "The finals",
    lede: "World Cup finals from Mexico 1970 onwards, one page each: the score, the venue, the passage of play that settled it, and what the record shows once the noise has gone.",
  },
  united: {
    label: "Manchester United",
    heading: "Manchester United, in depth",
    lede: "Manchester United in long form. The treble side, the academy that produced it, the European nights and the record fees, each with the numbers attached.",
  },
  explainers: {
    label: "Explained",
    heading: "Football, explained",
    lede: "The rules, the terms and the records, without the jargon. One question per page, answered in the first paragraph.",
  },
  notes: {
    label: "Notes",
    heading: "Notes",
    lede: "How the archive is put together: the standards the desk works to, and the notes on method behind what gets published.",
  },
};

const contentPages = loadContentPages();
const sections = [...new Set(contentPages.map((p) => p.section))].sort();
for (const s of sections) {
  if (!FRONTS[s]) throw new Error(`[build-section-pages] content section "${s}" has no entry in FRONTS — add its label, heading and lede`);
}

/* ---------- legends (src/data/legends.ts) ----------
   Loaded through scripts/shared/day-data.mjs like every other .ts the build chain reads, with
   `days: false` because nothing on these fronts comes from the day lanes. The Legends Series has
   no per-profile pages and this script does not pretend otherwise: the front carries each profile
   in full and links nowhere it cannot reach. */
const { legends } = await loadDayData({ days: false, extras: ["legends"] });

const LEGENDS_FRONT = {
  label: "Legends",
  heading: "The Legends",
  lede: "The Legends Series: one football great per entry, drawn in the house style, with what they won and where they did it.",
};

function head({ title, description, url, robots = "index,follow,max-image-preview:large", ld = null }) {
  return `<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>${esc(clampTitle([title, "The ARCHV"]))}</title>
  <meta name="description" content="${escAttr(clampDescription(description))}" />
  <meta name="robots" content="${escAttr(robots)}" />
  ${url ? `<link rel="canonical" href="${url}" />` : ""}
  <meta name="theme-color" content="#FFFFFF" />
  ${PAGE_CSP}
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="The ARCHV" />
  <meta property="og:title" content="${escAttr(title)}" />
  <meta property="og:description" content="${escAttr(description)}" />
  ${url ? `<meta property="og:url" content="${url}" />` : ""}
  <meta property="og:image" content="${SITE}/og.jpg" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:site" content="@thearchvfc" />
  <meta name="twitter:title" content="${escAttr(title)}" />
  <meta name="twitter:description" content="${escAttr(description)}" />
  <meta name="twitter:image" content="${SITE}/og.jpg" />
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  ${RSS_LINK}${ld ? `\n  <script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>` : ""}

  <!-- PostHog: pageview only on this static surface. Same project as the website. -->
  ${posthogSnippet()}

  ${fontLinks()}

  ${pageStyles()}
</head>`;
}

// A content page's card. `datePublished` and `eyebrow` are optional in the frontmatter, so the
// kicker is assembled from whatever is actually there rather than printing an empty separator.
function contentCard(section, page) {
  const kicker = [page.eyebrow, page.datePublished ? longDate(page.datePublished) : ""].filter(Boolean).join(" · ");
  return `<li><a class="lane-card" href="/${esc(section)}/${esc(page.slug)}/"><span class="lane-card__body">${
    kicker ? `<span class="lane-card__kicker">${esc(kicker)}</span>` : ""
  }<span class="lane-card__headline">${esc(page.title)}</span>${
    page.description ? `<span class="lane-card__dek">${esc(page.description)}</span>` : ""
  }</span></a></li>`;
}

function renderSection(section, front, pages) {
  const url = `${SITE}/${section}/`;
  return `<!doctype html>
<html lang="en-GB">
${head({
  title: front.heading,
  description: front.lede,
  url,
  ld: {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        name: front.heading,
        description: front.lede,
        url,
        inLanguage: "en-GB",
        isPartOf: { "@type": "WebSite", name: "The ARCHV", url: `${SITE}/` },
        hasPart: pages.map((p) => ({ "@type": "Article", headline: p.title, url: `${SITE}/${section}/${p.slug}/` })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
          { "@type": "ListItem", position: 2, name: front.label, item: url },
        ],
      },
    ],
  },
})}
<body>
  ${masthead()}
  <main class="wrap wrap--wide">
    <section class="lane">
      <p class="breadcrumb"><a href="/">The ARCHV</a> / ${esc(front.label)}</p>
      <p class="lane__eyebrow">${esc(front.label)}</p>
      <h1>${esc(front.heading)}</h1>
      <p class="lane__lede">${esc(front.lede)}</p>
      <ul class="lane-list" aria-label="${escAttr(front.heading)}">
        ${pages.map((p) => contentCard(section, p)).join("\n        ")}
      </ul>
    </section>
  </main>
  ${footer()}
</body>
</html>
`;
}

function renderLegends() {
  const url = `${SITE}/legends/`;
  const front = LEGENDS_FRONT;
  return `<!doctype html>
<html lang="en-GB">
${head({
  title: front.heading,
  description: front.lede,
  url,
  ld: {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        name: front.heading,
        description: front.lede,
        url,
        inLanguage: "en-GB",
        isPartOf: { "@type": "WebSite", name: "The ARCHV", url: `${SITE}/` },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
          { "@type": "ListItem", position: 2, name: front.label, item: url },
        ],
      },
    ],
  },
})}
<body>
  ${masthead()}
  <main class="wrap wrap--wide">
    <section class="lane">
      <p class="breadcrumb"><a href="/">The ARCHV</a> / ${esc(front.label)}</p>
      <p class="lane__eyebrow">${esc(front.label)}</p>
      <h1>${esc(front.heading)}</h1>
      <p class="lane__lede">${esc(front.lede)}</p>
      <ul class="lane-list" aria-label="Legends Series profiles">
        ${legends
          .map(
            (l) => `<li class="lane-card lane-card--static"><img class="lane-card__avatar" src="${escAttr(l.headshot)}" alt="${escAttr(`${l.name}, illustrated by The ARCHV.`)}" loading="lazy" decoding="async" width="64" height="64" /><span class="lane-card__body"><span class="lane-card__kicker">${esc(l.no)} · ${esc(l.years ? `${l.nation} · ${l.years}` : l.nation)}</span><span class="lane-card__headline">${esc(l.name)}</span><span class="lane-card__dek">${esc(l.bio)}</span></span></li>`,
          )
          .join("\n        ")}
      </ul>
    </section>
  </main>
  ${footer()}
</body>
</html>
`;
}

/* ---------- 404 ----------
   GitHub Pages serves dist/404.html for any path it cannot match, at that path, so every link
   and asset reference here is absolute. noindex, no canonical and no sitemap row: an error page
   that ranks is a bug. Reached by a reader with a stale link or a typo, so it says which it
   probably is and then gets out of the way. */
const NOT_FOUND_LINKS = [
  ["/", "Front page"],
  ["/desk/transfer/", "Transfer Desk"],
  ["/finals/", "The finals"],
  ["/united/", "Manchester United"],
  ["/explainers/", "Football, explained"],
  ["/legends/", "The Legends"],
  ["/reads/", "Long reads"],
  ["/duel/", "Player duels"],
  ["/guess/", "Daily archive game"],
];

function renderNotFound() {
  return `<!doctype html>
<html lang="en-GB">
${head({
  title: "Page not found",
  description: "That page is not in the archive. The finals, the desk, the long reads and the games are all still here.",
  url: null,
  robots: "noindex,follow",
})}
<body>
  ${masthead()}
  <main class="wrap">
    <section class="article">
      <p class="breadcrumb"><a href="/">The ARCHV</a> / Not found</p>
      <p class="article__eyebrow">404</p>
      <h1>That page is not in the archive.</h1>
      <p class="lane__lede">Either the link is older than the address, or there is a typo in it. Everything below is where it should be.</p>
      <ul class="lane-list" aria-label="Where to go instead">
        ${NOT_FOUND_LINKS.map(([href, label]) => `<li><a class="lane-card lane-card--compact" href="${escAttr(href)}"><span class="lane-card__body"><span class="lane-card__headline">${esc(label)}</span></span></a></li>`).join("\n        ")}
      </ul>
    </section>
  </main>
  ${footer()}
</body>
</html>
`;
}

/* ---------- write ---------- */
const urls = [];
let count = 0;

for (const section of sections) {
  const pages = contentPages.filter((p) => p.section === section);
  // Newest first where the frontmatter carries a date; the rest keep the walk order they came in.
  pages.sort((a, b) => String(b.datePublished ?? "").localeCompare(String(a.datePublished ?? "")));
  const dir = join(OUT, section);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), renderSection(section, FRONTS[section], pages));
  urls.push(`  <url><loc>${SITE}/${section}/</loc><changefreq>monthly</changefreq><priority>0.7</priority></url>`);
  count++;
}

if (legends.length) {
  const dir = join(OUT, "legends");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), renderLegends());
  urls.push(`  <url><loc>${SITE}/legends/</loc><changefreq>monthly</changefreq><priority>0.6</priority></url>`);
  count++;
}

writeFileSync(join(OUT, "404.html"), renderNotFound());

/* ---------- sitemap: append to whatever dist/sitemap.xml exists at this point, falling back to
   public/sitemap.xml if dist's copy is somehow missing. Same as the other generators. The 404 is
   deliberately absent. */
const sitemapOut = join(OUT, "sitemap.xml");
const sitemapFallback = join(ROOT, "public", "sitemap.xml");
const sitemapSrc = existsSync(sitemapOut) ? sitemapOut : existsSync(sitemapFallback) ? sitemapFallback : null;
if (sitemapSrc && urls.length) {
  const xml = readFileSync(sitemapSrc, "utf8");
  writeFileSync(sitemapOut, xml.replace("</urlset>", `${urls.join("\n")}\n</urlset>`));
}

console.log(`[build-section-pages] wrote ${count} section front(s) + 404.html to ${OUT}, appended ${urls.length} sitemap row(s)`);
