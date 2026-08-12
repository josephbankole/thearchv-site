/* scripts/build-author-page.mjs — emits the site's one author page:

     dist/authors/joseph-bankole/index.html

   Why it exists (2026-08-04, founder-approved): every article page already carried a named
   Person in its NewsArticle JSON-LD, but that Person's `url` pointed off-domain and there was
   nothing on thearchv.ca for a reader (or Google News, or a Publisher Center reviewer) to land
   on. This page is that landing: who writes the site, how the work is checked, and what he has
   actually put his name to. AUTHOR_URL in scripts/shared/page-shell.mjs now resolves here, so
   the byline link on every article page and the schema's author.url both terminate on-site.

   Same self-contained page family as the lane and article pages (see scripts/shared/
   page-shell.mjs): shared masthead, deskNav, brand CSS, footer, per-page CSP with the two
   standard inline-script hashes. No new CSS is inlined here; every class used below already
   exists in pageStyles().

   The "recent bylined work" list is DERIVED from the same day data the article pages are built
   from, and the long-reads list is derived from content/, so neither can rot into a dead link
   when the desks move on. Nothing is hand-listed.

   Runs after build-article-pages.mjs (see package.json "build"). Its sitemap row is added at
   the one assembly point in build-content.mjs's EXTRA_URLS, the same way /duel/ and /guess/ are,
   rather than by appending here. */
import { build } from "esbuild";
import { writeFileSync, mkdirSync, rmSync, readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  SITE, esc, escAttr, clampTitle, clampDescription, longDate, byDateDesc,
  cardArt, deskNav, masthead, footer, posthogSnippet, fontLinks, pageStyles,
  cspMeta, MASTHEAD_SCRIPT_HASH, POSTHOG_SCRIPT_HASH, RSS_LINK, ORG_SAMEAS,
  AUTHOR_NAME, AUTHOR_PATH, AUTHOR_URL, AUTHOR_PERSONAL_URL, AUTHOR_SAMEAS,
  LANE_META, SPORTS, QUESTION_LANE_META,
} from "./shared/page-shell.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const OUT = process.env.CONTENT_OUT || join(ROOT, "dist");
const CONTENT = join(ROOT, "content");

// Both inline scripts on this page (masthead toggle + PostHog loader) are static, so one CSP
// covers the page. No third inline script is added here on purpose: a per-page hash is a
// maintenance cost, and this page has nothing that needs to run.
const PAGE_CSP = cspMeta({ scripts: [MASTHEAD_SCRIPT_HASH, POSTHOG_SCRIPT_HASH], posthog: true, googleFonts: true });

const PAGE_URL = AUTHOR_URL;

/* ---------- the bio ----------
   British English, no em dashes, run through the humanizer with
   personal-brand/archv-house-voice-profile.md as the voice sample (dials B6 C2 E7: a
   credibility page, so accuracy governs and the voice lives in the open and the kicker).

   The positioning is deliberate and was corrected on one point before it was written: an
   earlier draft claimed "a human checkpoint before anything publishes", which stopped being
   true when canon D-2026-08-04h made the weekly match job publish on a schedule. What is
   written below is what actually exists: the routine lane publishes under automated
   verification gates, the flagship lane carries a human signature. Do not soften this back
   into a blanket-checkpoint claim. */
const BIO = [
  `Joseph Bankole founded The ARCHV and edits it. He is the named author on this site and the person answerable for what it publishes.`,
  `Most of what you read here is built by a system rather than typed out one entry at a time. The routine desks publish on a schedule, and nothing reaches the page without clearing the same gates: two independent sources on any claim of fact, every number re-checked at the moment of publishing rather than the moment of drafting, a dated freshness stamp, and the house voice applied by hand. An entry that fails verification does not run, and a thin week ends with fewer entries on the site. That is the whole argument for automating the routine work. The standard stops depending on how tired anyone is on a Tuesday.`,
  `The flagship work is the other half of it, and that carries a human signature. The long reads, the corrections, the standards page and every call about what the archive will and will not carry are his by name, because someone has to be answerable for them.`,
  `The subject is football history, mostly: transfers while the window is open, international football while it is on, the club season week by week, and the poster archive of nine World Cup finals drawn in the house style, Mexico 1970 to Lusail 2022. The desks now run to the NFL, Formula 1, tennis and golf as well. No photographs, no club crests, no kit designs, no competition marks. Every face on the site is original illustration published as editorial commentary. That rule does not bend.`,
];

// The meta description and the schema's Person.description. First two sentences of the bio,
// clamped: it has to say who he is and how the work is checked inside 160 characters.
const BIO_SUMMARY = `Founder and editor of The ARCHV. The routine desks publish under automated verification gates; the flagship work carries his signature.`;

/* ---------- portrait ----------
   No photograph of the founder exists anywhere in this repo, and the site's own imagery rule
   forbids inventing a face, so this page does NOT ship a fabricated portrait. The brand crest
   stands in until a real headshot is committed to public/. If one lands, drop it at
   public/heads/joseph-bankole.webp and this picks it up with no other change. */
const HEADSHOT_CANDIDATES = [
  { src: "/heads/joseph-bankole.webp", alt: `${AUTHOR_NAME}, founder and editor of The ARCHV`, real: true },
];
const portrait =
  HEADSHOT_CANDIDATES.find((c) => existsSync(join(ROOT, "public", c.src.replace(/^\//, "")))) ||
  { src: "/brand/crest-badge-400.webp", alt: "The ARCHV monogram", real: false };

/* ---------- day data (same bundled-temp-module pattern as build-lane-pages.mjs) ---------- */
const entrySrc = [
  `export { transferDays } from "./data/transferDays.ts";`,
  `export { worldCupDays } from "./data/worldCupDays.ts";`,
  `export { leaguesDays } from "./data/leaguesDays.ts";`,
  `export { nflDays } from "./data/nflDays.ts";`,
  `export { f1Days } from "./data/f1Days.ts";`,
  `export { tennisDays } from "./data/tennisDays.ts";`,
  `export { golfDays } from "./data/golfDays.ts";`,
].join("\n");
const tmp = join(ROOT, ".author-bundle.mjs");
let data;
try {
  await build({ stdin: { contents: entrySrc, resolveDir: SRC, loader: "ts", sourcefile: "author-entry.ts" },
    bundle: true, format: "esm", platform: "node", outfile: tmp, logLevel: "silent" });
  data = await import(pathToFileURL(tmp).href + `?t=${process.hrtime.bigint()}`);
} finally { try { rmSync(tmp); } catch {} }

// Every bylined daily entry, flattened to { date, headline, dek, href, laneLabel, image }.
// Football keeps /desk/<lane>/<date>/; the new sports use /<urlBase>/<lane>/<date>/. Both URL
// shapes are the ones build-article-pages.mjs actually emits, so no link here can 404.
const bylined = [];
for (const [laneKey, days] of [
  ["transfer", data.transferDays],
  ["world-cup", data.worldCupDays],
  ["leagues", data.leaguesDays],
]) {
  for (const e of days) bylined.push({ ...e, href: `/desk/${laneKey}/${e.date}/`, laneLabel: LANE_META[laneKey].label });
}
const SPORT_DAYS = { nfl: data.nflDays, f1: data.f1Days, tennis: data.tennisDays, golf: data.golfDays };
for (const sport of SPORTS) {
  if (sport.key === "football") continue;
  for (const laneKey of sport.lanes) {
    const laneLabel = `${sport.label} ${QUESTION_LANE_META[laneKey]?.label ?? laneKey}`;
    for (const e of SPORT_DAYS[sport.key] || []) {
      bylined.push({ ...e, href: `/${sport.urlBase}/${laneKey}/${e.date}/`, laneLabel });
    }
  }
}
bylined.sort(byDateDesc);
const RECENT_CAP = 6;
const recent = bylined.slice(0, RECENT_CAP);

/* ---------- long reads, derived from content/ ----------
   Same frontmatter shape build-content.mjs parses (title/slug/section at the top of each .md).
   Reading the directory rather than hand-listing means a new long read appears here on its next
   build, and a retired one disappears instead of 404ing. */
function frontmatterField(raw, field) {
  const m = raw.match(new RegExp(`^${field}:\\s*"([^"]*)"`, "m"));
  return m ? m[1] : null;
}
function longReads(section) {
  const dir = join(CONTENT, section);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const raw = readFileSync(join(dir, f), "utf8");
      const title = frontmatterField(raw, "title");
      const slug = frontmatterField(raw, "slug") || f.replace(/\.md$/, "");
      const datePublished = frontmatterField(raw, "datePublished") || "";
      return title ? { title, href: `/${section}/${slug}/`, datePublished } : null;
    })
    .filter(Boolean)
    .sort((a, b) => (a.datePublished < b.datePublished ? 1 : a.datePublished > b.datePublished ? -1 : 0));
}
const united = longReads("united");
const explainers = longReads("explainers").slice(0, 4);

/* ---------- markup ---------- */
function recentCard(e) {
  const avatar = cardArt(e);
  return `<li><a class="lane-card" href="${escAttr(e.href)}">${avatar}<span class="lane-card__body"><span class="lane-card__kicker">${esc(e.laneLabel)} · ${esc(longDate(e.date))}</span><span class="lane-card__headline">${esc(e.headline)}</span><span class="lane-card__dek">${esc(e.dek)}</span></span></a></li>`;
}

function linkList(items) {
  return items.map((i) => `<li><a href="${escAttr(i.href)}">${esc(i.title)}</a></li>`).join("\n        ");
}

function render() {
  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ProfilePage",
        "@id": `${PAGE_URL}#webpage`,
        url: PAGE_URL,
        name: `${AUTHOR_NAME} · The ARCHV`,
        description: BIO_SUMMARY,
        inLanguage: "en-GB",
        isPartOf: { "@type": "WebSite", name: "The ARCHV", url: `${SITE}/` },
        // mainEntity is the whole point of a ProfilePage: this page IS about the Person below,
        // which is the same @id every article page's author block resolves to.
        mainEntity: { "@id": `${PAGE_URL}#person` },
      },
      {
        "@type": "Person",
        "@id": `${PAGE_URL}#person`,
        name: AUTHOR_NAME,
        url: PAGE_URL,
        // josephbankole.ca is kept rather than dropped, so the on-site page and the personal
        // site read as one entity instead of two competing ones (founder call, 2026-08-04).
        sameAs: AUTHOR_SAMEAS,
        description: BIO_SUMMARY,
        jobTitle: "Founder and Editor",
        knowsAbout: ["Football history", "Association football", "Transfer reporting", "World Cup", "Sports journalism"],
        worksFor: { "@id": `${SITE}/#org` },
      },
      {
        "@type": "NewsMediaOrganization",
        // #org matches the Organization @id index.html has declared since before this page
        // existed — a second id (#organization, as first shipped) never merges with it, and the
        // founder/publishingPrinciples/correctionsPolicy fields here would hang off an orphan
        // node (2026-08-12 review).
        "@id": `${SITE}/#org`,
        name: "The ARCHV",
        url: `${SITE}/`,
        logo: { "@type": "ImageObject", url: `${SITE}/brand/logo-badge@192.png`, width: 192, height: 192 },
        founder: { "@id": `${PAGE_URL}#person` },
        publishingPrinciples: `${SITE}/standards/`,
        correctionsPolicy: `${SITE}/corrections/`,
        sameAs: ORG_SAMEAS,
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "The ARCHV", item: `${SITE}/` },
          { "@type": "ListItem", position: 2, name: AUTHOR_NAME, item: PAGE_URL },
        ],
      },
    ],
  };

  const recentBlock = recent.length
    ? `<section class="related" aria-labelledby="recent-work">
        <h2 id="recent-work">Recent bylined work</h2>
        <ul class="lane-list">
          ${recent.map(recentCard).join("\n          ")}
        </ul>
        <a class="related__all" href="/desk/transfer/">Every transfer entry</a>
      </section>`
    : "";

  const unitedBlock = united.length
    ? `<section class="related" aria-labelledby="long-reads">
        <h2 id="long-reads">Long reads</h2>
        <ul>
        ${linkList(united)}
        </ul>
      </section>`
    : "";

  const explainerBlock = explainers.length
    ? `<section class="related" aria-labelledby="explainers">
        <h2 id="explainers">Explainers</h2>
        <ul>
        ${linkList(explainers)}
        </ul>
      </section>`
    : "";

  return `<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>${esc(clampTitle([AUTHOR_NAME, "Founder and Editor", "The ARCHV"]))}</title>
  <meta name="description" content="${escAttr(clampDescription(BIO_SUMMARY))}" />
  <meta name="robots" content="index,follow,max-image-preview:large" />
  <link rel="canonical" href="${PAGE_URL}" />
  <meta name="theme-color" content="#FFFFFF" />
  ${PAGE_CSP}
  <meta property="og:type" content="profile" />
  <meta property="og:site_name" content="The ARCHV" />
  <meta property="og:title" content="${escAttr(`${AUTHOR_NAME} · The ARCHV`)}" />
  <meta property="og:description" content="${escAttr(BIO_SUMMARY)}" />
  <meta property="og:url" content="${PAGE_URL}" />
  <meta property="og:image" content="${SITE}/og.jpg" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:site" content="@thearchvfc" />
  <meta name="twitter:title" content="${escAttr(`${AUTHOR_NAME} · The ARCHV`)}" />
  <meta name="twitter:description" content="${escAttr(BIO_SUMMARY)}" />
  <meta name="twitter:image" content="${SITE}/og.jpg" />
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  ${RSS_LINK}
  <script type="application/ld+json">${JSON.stringify(schema).replace(/</g, "\\u003c")}</script>

  <!-- PostHog: pageview only on this static surface. Same project as the website. -->
  ${posthogSnippet()}

  ${fontLinks()}

  ${pageStyles()}
</head>
<body>
  ${masthead()}
  ${deskNav()}
  <main class="wrap wrap--wide">
    <!-- No data-inview here on purpose: this page family ships no bundled JS, so an opacity-0
         reveal state would have nothing to switch it back on. The dot-grid field comes from
         body::before in pageStyles(), which needs no markup at all. -->
    <article class="lane author">
      <p class="breadcrumb"><a href="/">The ARCHV</a> / ${esc(AUTHOR_NAME)}</p>
      <p class="lane__eyebrow">Author</p>
      <div class="author__head">
        <img class="author__portrait${portrait.real ? "" : " author__portrait--crest"}" src="${escAttr(portrait.src)}" alt="${escAttr(portrait.alt)}" width="120" height="120" decoding="async" />
        <div class="author__headtext">
          <h1>${esc(AUTHOR_NAME)}</h1>
          <p class="author__role">Founder and editor, The ARCHV</p>
        </div>
      </div>
      <div class="article__body author__bio">
        ${BIO.map((p) => `<p>${esc(p)}</p>`).join("\n        ")}
      </div>
      <p class="author__elsewhere">Elsewhere: <a href="${escAttr(AUTHOR_PERSONAL_URL)}" rel="me noopener" target="_blank">${esc(AUTHOR_PERSONAL_URL.replace("https://", ""))}</a> · <a href="/standards/">How we verify</a> · <a href="/corrections/">Corrections policy</a> · <a href="/about/">About The ARCHV</a></p>
    </article>
    ${recentBlock}
    ${unitedBlock}
    ${explainerBlock}
  </main>
  ${footer()}
</body>
</html>
`;
}

const dir = join(OUT, "authors", "joseph-bankole");
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "index.html"), render());
console.log(
  `build-author-page: wrote ${AUTHOR_PATH} ` +
  `(${recent.length} recent entr${recent.length === 1 ? "y" : "ies"}, ${united.length} long read(s), ${explainers.length} explainer(s), ` +
  `portrait: ${portrait.real ? "headshot" : "crest fallback, no headshot in repo"})`
);
