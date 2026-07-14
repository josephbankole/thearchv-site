/* scripts/build-glossary-pages.mjs — emits the football glossary (UNIT 1), an evergreen set of
   answer-engine surfaces:
     dist/glossary/index.html            the hub, listing every term with its one-line answer
     dist/glossary/<slug>/index.html     one page per term (xg, false-9, offside, var)
   Same page shell as scripts/build-lane-pages.mjs and scripts/build-article-pages.mjs (see
   scripts/shared/page-shell.mjs): masthead, brand styles, footer, escaping helpers, CSP helper.
   Entry data lives in scripts/glossary-data.mjs.

   The visible answer paragraph on each entry page is the exact string used as that page's
   FAQPage acceptedAnswer AND DefinedTerm description in the JSON-LD, so an answer engine reads
   the same words it can see. Runs after build-article-pages.mjs (see package.json "build"); it
   does not touch the sitemap — the glossary URLs are added through build-content.mjs's EXTRA_URLS
   allowlist (the single mechanism that assembles dist/sitemap.xml), so each lands exactly once. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SITE, esc, escAttr, masthead, footer, posthogSnippet, fontLinks, pageStyles,
  cspMeta, MASTHEAD_SCRIPT_HASH, POSTHOG_SCRIPT_HASH, RSS_LINK,
} from "./shared/page-shell.mjs";
import { glossaryEntries } from "./glossary-data.mjs";

// Both inline scripts on this page family (masthead toggle + PostHog loader) are static, no
// per-page interpolation, so one CSP works for the hub and every entry page.
const PAGE_CSP = cspMeta({ scripts: [MASTHEAD_SCRIPT_HASH, POSTHOG_SCRIPT_HASH], posthog: true, googleFonts: true });

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = process.env.CONTENT_OUT || join(ROOT, "dist");
const HUB_URL = `${SITE}/glossary/`;
const HUB_TITLE = "The ARCHV glossary: football terms, explained";
const HUB_INTRO = "Plain answers to the football questions fans actually search. Every entry defines the term first, then explains how it works.";

// First sentence of an answer, reused as the entry's meta description and as its one-line
// summary on the hub. Answers are written definition-first, so sentence one is the definition.
function firstSentence(text) {
  const s = String(text).trim();
  const m = s.match(/^.*?[.!?](?=\s|$)/);
  return (m ? m[0] : s).trim();
}

function relatedList(currentSlug) {
  const others = glossaryEntries.filter((e) => e.slug !== currentSlug);
  const items = others
    .map((e) => `<li><a href="/glossary/${e.slug}/">${esc(e.title)}</a></li>`)
    .join("\n            ");
  return `<nav class="related" aria-label="Related terms">
        <h2>Related terms</h2>
        <ul>
            ${items}
          </ul>
      </nav>`;
}

function entrySchema(entry, url) {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "DefinedTerm",
        name: entry.title,
        description: entry.answer,
        url,
        inDefinedTermSet: { "@type": "DefinedTermSet", name: "The ARCHV football glossary", url: HUB_URL },
      },
      {
        "@type": "FAQPage",
        mainEntity: [
          {
            "@type": "Question",
            name: entry.question,
            acceptedAnswer: { "@type": "Answer", text: entry.answer },
          },
        ],
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
          { "@type": "ListItem", position: 2, name: "Glossary", item: HUB_URL },
          { "@type": "ListItem", position: 3, name: entry.title, item: url },
        ],
      },
    ],
  }).replace(/</g, "\\u003c");
}

function renderEntry(entry) {
  const url = `${SITE}/glossary/${entry.slug}/`;
  const description = firstSentence(entry.answer);
  const socialTitle = `${entry.title} · The ARCHV`;
  const depth = entry.depth.map((p) => `<p>${esc(p)}</p>`).join("\n        ");

  return `<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>${esc(entry.question)} · The ARCHV glossary</title>
  <meta name="description" content="${escAttr(description)}" />
  <meta name="robots" content="index,follow" />
  <link rel="canonical" href="${url}" />
  <meta name="theme-color" content="#0C2A3E" />
  ${PAGE_CSP}
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="The ARCHV" />
  <meta property="og:title" content="${escAttr(socialTitle)}" />
  <meta property="og:description" content="${escAttr(description)}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:image" content="${SITE}/og.jpg" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:site" content="@thearchvfc" />
  <meta name="twitter:title" content="${escAttr(socialTitle)}" />
  <meta name="twitter:description" content="${escAttr(description)}" />
  <meta name="twitter:image" content="${SITE}/og.jpg" />
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  ${RSS_LINK}
  <script type="application/ld+json">${entrySchema(entry, url)}</script>

  <!-- PostHog: pageview only on this static surface. Same project as the website. -->
  ${posthogSnippet()}

  ${fontLinks()}

  ${pageStyles()}
</head>
<body>
  ${masthead()}
  <main class="wrap">
    <article class="glossary">
      <p class="breadcrumb"><a href="/">The ARCHV</a> / <a href="/glossary/">Glossary</a> / ${esc(entry.title)}</p>
      <p class="lane__eyebrow">The ARCHV glossary</p>
      <h1>${esc(entry.title)}</h1>
      <h2 class="glossary__q">${esc(entry.question)}</h2>
      <div class="article__body">
        <p class="glossary__answer">${esc(entry.answer)}</p>
        ${depth}
      </div>
      ${relatedList(entry.slug)}
    </article>
  </main>
  ${footer()}
</body>
</html>
`;
}

function hubCard(entry) {
  return `<li><a class="glossary-card" href="/glossary/${entry.slug}/"><span class="glossary-card__term">${esc(entry.title)}</span><span class="glossary-card__one">${esc(firstSentence(entry.answer))}</span></a></li>`;
}

function renderHub() {
  const cards = glossaryEntries.map(hubCard).join("\n        ");
  const schema = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        name: "The ARCHV glossary",
        description: HUB_INTRO,
        url: HUB_URL,
        inLanguage: "en-GB",
        isPartOf: { "@type": "WebSite", name: "The ARCHV", url: `${SITE}/` },
      },
      {
        "@type": "ItemList",
        name: "The ARCHV football glossary",
        itemListElement: glossaryEntries.map((e, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: e.title,
          url: `${SITE}/glossary/${e.slug}/`,
        })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
          { "@type": "ListItem", position: 2, name: "Glossary", item: HUB_URL },
        ],
      },
    ],
  }).replace(/</g, "\\u003c");

  return `<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>${esc(HUB_TITLE)}</title>
  <meta name="description" content="${escAttr(HUB_INTRO)}" />
  <meta name="robots" content="index,follow" />
  <link rel="canonical" href="${HUB_URL}" />
  <meta name="theme-color" content="#0C2A3E" />
  ${PAGE_CSP}
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="The ARCHV" />
  <meta property="og:title" content="The ARCHV glossary" />
  <meta property="og:description" content="${escAttr(HUB_INTRO)}" />
  <meta property="og:url" content="${HUB_URL}" />
  <meta property="og:image" content="${SITE}/og.jpg" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:site" content="@thearchvfc" />
  <meta name="twitter:title" content="The ARCHV glossary" />
  <meta name="twitter:description" content="${escAttr(HUB_INTRO)}" />
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  ${RSS_LINK}
  <script type="application/ld+json">${schema}</script>

  <!-- PostHog: pageview only on this static surface. Same project as the website. -->
  ${posthogSnippet()}

  ${fontLinks()}

  ${pageStyles()}
</head>
<body>
  ${masthead()}
  <main class="wrap wrap--wide">
    <section class="glossary">
      <p class="breadcrumb"><a href="/">The ARCHV</a> / Glossary</p>
      <p class="lane__eyebrow">Football, explained</p>
      <h1>The glossary</h1>
      <p class="lane__lede">${esc(HUB_INTRO)}</p>
      <ul class="glossary__list" aria-label="Glossary terms">
        ${cards}
      </ul>
    </section>
  </main>
  ${footer()}
</body>
</html>
`;
}

/* ---------- write pages ---------- */
mkdirSync(join(OUT, "glossary"), { recursive: true });
writeFileSync(join(OUT, "glossary", "index.html"), renderHub());
let count = 0;
for (const entry of glossaryEntries) {
  const dir = join(OUT, "glossary", entry.slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), renderEntry(entry));
  count++;
}

console.log(`[build-glossary-pages] wrote the glossary hub + ${count} entry page(s) to ${OUT}/glossary/`);
