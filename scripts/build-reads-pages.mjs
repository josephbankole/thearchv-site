/* build-reads-pages.mjs — gives the long reads real URLs.

   Until 2026-08-09 the ten flagship essays existed only as accordion strings inside the homepage
   JS bundle: no URL, so nothing to share, nothing for a search engine to index, and no way for a
   reader to get back to one. The hero's second CTA pointed at them. This script emits:

     dist/reads/index.html          the section front, every essay newest first
     dist/reads/<slug>/index.html   one page per essay

   Slugs are DERIVED from the title by src/data/readSlug.ts, the same module the homepage
   accordion imports to build its links, so the link and its destination cannot disagree. The
   daily engine prepends essays to src/data/longReads.ts; a new one gets its page, its sitemap
   row and its feed item on the next build with no other edit.

   Same self-contained page family as the article and lane pages (scripts/shared/page-shell.mjs:
   masthead, footer, brand CSS, PostHog, Google Fonts, CSP). Runs after build-content.mjs, which
   writes dist/sitemap.xml first; this script appends its rows to whatever sitemap exists at that
   point, the pattern build-lane-pages.mjs and build-article-pages.mjs already use. */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDayData } from "./shared/day-data.mjs";
import { appendUrls } from "./shared/sitemap.mjs";
import {
  SITE, esc, escAttr, longDate, clampTitle, clampDescription,
  masthead, footer, documentShell, ROBOTS_INDEXABLE,
  cspMeta, MASTHEAD_SCRIPT_HASH, POSTHOG_SCRIPT_HASH,
} from "./shared/page-shell.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = process.env.CONTENT_OUT || join(ROOT, "dist");

// Both inline scripts on this family (masthead toggle + PostHog loader) are static, no per-page
// interpolation, so one CSP serves every page here — same as the lane fronts.
const PAGE_CSP = cspMeta({ scripts: [MASTHEAD_SCRIPT_HASH, POSTHOG_SCRIPT_HASH], posthog: true, googleFonts: true });

/* ---------- the typed essay data, through scripts/shared/day-data.mjs — the one loader in this
   chain, because a .mjs build script cannot import a .ts at run time. `days: false` because this
   family is the essays: none of the seven day lanes appears on a /reads/ page, so there is no
   reason to bundle them. src/lib/readTime.ts is the one copy of read-time on the site (see its
   header) and rides in on the same bundle rather than being reimplemented here. ---------- */
const { longReads, readSlug, readPath, readLabel, readDuration, wordCount } =
  await loadDayData({ days: false, extras: ["longReads", "readSlug", "readTime"] });

// Newest first, matching every other lane on the site. The array is committed in that order but
// nothing in the type enforces it, so sort rather than trust — same reasoning as byDateDesc.
// day-data.mjs deliberately does NOT sort the extras (its callers want different orders), so
// this stays the essays' own sort.
const reads = [...longReads].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

// Two essays that slugged to the same path would silently overwrite each other's page and leave
// one of them unreachable behind a link that looks fine. Fail the build instead.
const bySlug = new Map();
for (const r of reads) {
  const slug = readSlug(r.title);
  if (!slug) throw new Error(`[build-reads-pages] "${r.title}" produced an empty slug`);
  if (bySlug.has(slug)) throw new Error(`[build-reads-pages] slug collision "${slug}": ${JSON.stringify(bySlug.get(slug).title)} and ${JSON.stringify(r.title)}`);
  bySlug.set(slug, r);
}

const INDEX_PATH = "/reads/";
const INDEX_LEDE = "Long-form from the archive. The ownership structures, the academies, the accounting and the television money that decide what happens on the pitch, one subject at a time.";
// The standing rights notice the article pages carry, kept byte-identical to that copy.
const RIGHTS = "The ARCHV is an independent football-history publication, not affiliated with any governing body, league, club, or competition organiser. Club and competition names are referenced for editorial and historical commentary only and remain the property of their respective owners. Player illustrations are original stylised artwork, not photographs.";

// House titles carry a closing full stop ("The collapse of the Galácticos."). It belongs on the
// page, where it is the brand's punctuation; it reads as a typo in a browser tab and a search
// result, so strip it there only.
const plainTitle = (t) => String(t).replace(/\.$/, "");

// The essay's own opening sentence as its meta/social description: it is the first thing a
// reader sees on the page too, so the preview and the page agree. Never invented copy.
function firstSentence(body) {
  const first = String(body).split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)[0] || "";
  const m = first.match(/^.*?[.!?](?=\s|$)/);
  return (m ? m[0] : first).trim();
}

const paras = (body) =>
  String(body)
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p)}</p>`)
    .join("\n        ");

// author/publisher reference the site's Organization entity by @id, the same shape the other
// long-form family uses (scripts/build-content.mjs): index.html's Organization JSON-LD carries
// this @id, so every essay points back at the one entity rather than describing a duplicate.
const ORG_REF = { "@id": `${SITE}/#org` };

/* The head for both page types here. Every long read and the /reads/ front is indexable and
   self-canonical, so those two are stated once, here, rather than at each call site; documentShell
   itself refuses to default them. og:type is "article" on the index as well as on the reads, which
   is how this family has always shipped. */
function head({ title, description, url, extraLd }) {
  return documentShell({
    title: clampTitle([title, "The ARCHV"]),
    metaDescription: clampDescription(description),
    description,
    socialTitle: title,
    robots: ROBOTS_INDEXABLE,
    canonical: url,
    ogUrl: url,
    ogType: "article",
    ogImage: `${SITE}/og.jpg`,
    csp: PAGE_CSP,
    jsonLd: extraLd,
  });
}

function renderRead(read) {
  const path = readPath(read.title);
  const url = `${SITE}${path}`;
  const description = firstSentence(read.body);
  const others = reads.filter((r) => r !== read).slice(0, 6);

  const related = others.length
    ? `
      <nav class="related" aria-label="More long reads">
        <h2>More long reads</h2>
        <ul>${others.map((r) => `<li><a href="${escAttr(readPath(r.title))}">${esc(r.title)}</a></li>`).join("")}</ul>
        <a class="related__all" href="${INDEX_PATH}">Every long read &rarr;</a>
      </nav>` : "";

  return `${head({
  title: plainTitle(read.title),
  description,
  url,
  extraLd: {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: plainTitle(read.title),
        description,
        datePublished: read.date,
        dateModified: read.date,
        isAccessibleForFree: true,
        inLanguage: "en-GB",
        articleSection: read.kicker,
        author: ORG_REF,
        publisher: ORG_REF,
        image: `${SITE}/og.jpg`,
        // Same helper as the visible "N min read" on the page and on the /reads/ front card.
        wordCount: wordCount(read.body),
        timeRequired: readDuration(read.body),
        mainEntityOfPage: url,
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
          { "@type": "ListItem", position: 2, name: "Long reads", item: `${SITE}${INDEX_PATH}` },
          { "@type": "ListItem", position: 3, name: plainTitle(read.title), item: url },
        ],
      },
    ],
  },
})}
<body>
  ${masthead()}
  <main class="wrap">
    <article class="article">
      <p class="breadcrumb"><a href="/">The ARCHV</a> / <a href="${INDEX_PATH}">Long reads</a></p>
      <p class="article__eyebrow">${esc(read.kicker)}</p>
      <h1>${esc(read.title)}</h1>
      <p class="article__meta">${esc(read.meta)} · ${esc(longDate(read.date))} · ${esc(readLabel(read.body))}</p>
      <div class="article__body">
        ${paras(read.body)}
      </div>
      <p class="article__rights">${esc(RIGHTS)}</p>${related}
    </article>
  </main>
  ${footer()}
</body>
</html>
`;
}

function renderIndex() {
  const url = `${SITE}${INDEX_PATH}`;
  return `${head({
  title: "Long reads",
  description: INDEX_LEDE,
  url,
  extraLd: {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        name: "Long reads",
        description: INDEX_LEDE,
        url,
        inLanguage: "en-GB",
        isPartOf: { "@type": "WebSite", name: "The ARCHV", url: `${SITE}/` },
        hasPart: reads.map((r) => ({
          "@type": "Article",
          headline: plainTitle(r.title),
          datePublished: r.date,
          url: `${SITE}${readPath(r.title)}`,
        })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
          { "@type": "ListItem", position: 2, name: "Long reads", item: url },
        ],
      },
    ],
  },
})}
<body>
  ${masthead()}
  <main class="wrap wrap--wide">
    <section class="lane">
      <p class="breadcrumb"><a href="/">The ARCHV</a> / Long reads</p>
      <p class="lane__eyebrow">Long reads</p>
      <h1>Long reads</h1>
      <p class="lane__lede">${esc(INDEX_LEDE)}</p>
      <ul class="lane-list" aria-label="Long reads, newest first">
        ${reads
          .map((r) => `<li><a class="lane-card" href="${escAttr(readPath(r.title))}"><span class="lane-card__body"><span class="lane-card__kicker">${esc(r.kicker)} · ${esc(longDate(r.date))} · ${esc(readLabel(r.body))}</span><span class="lane-card__headline">${esc(r.title)}</span><span class="lane-card__dek">${esc(r.meta)}</span></span></a></li>`)
          .join("\n        ")}
      </ul>
    </section>
  </main>
  ${footer()}
</body>
</html>
`;
}

/* ---------- write pages ---------- */
const urls = [{ loc: `${SITE}${INDEX_PATH}`, changefreq: "monthly", priority: "0.7" }];
mkdirSync(join(OUT, "reads"), { recursive: true });
writeFileSync(join(OUT, "reads", "index.html"), renderIndex());
for (const [slug, read] of bySlug) {
  const dir = join(OUT, "reads", slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), renderRead(read));
  urls.push({ loc: `${SITE}/reads/${slug}/`, lastmod: read.date, changefreq: "monthly", priority: "0.7" });
}

/* ---------- sitemap: append to whatever dist/sitemap.xml exists at this point in the chain.
   shared/sitemap.mjs owns the splice, the public/sitemap.xml fallback, the dedupe and the
   trailing-slash rule, and returns the rows it actually wrote. */
const added = appendUrls(urls);

console.log(`[build-reads-pages] wrote ${bySlug.size} long-read page(s) + the /reads/ front to ${OUT}/reads/, appended ${added} sitemap row(s)`);
