/* build-day-pages.mjs — emits a crawlable-but-superseded HTML page per Transfer Desk and World Cup
   day at the legacy /desk/<date>/ and /world-cup/<date>/ URLs. These are LEGACY pages: the canonical
   article surface is build-article-pages.mjs's /desk/<lane>/<date>/ pages. Each legacy page here
   cross-canonicals to its lane URL and is marked noindex,follow so it stops splitting SEO signal
   with its canonical counterpart, but still passes link equity and stays reachable for any inbound
   links. Runs AFTER build-content.mjs (which writes sitemap.xml) and BEFORE build-article-pages.mjs
   (which runs last and owns the final sitemap — this script does NOT touch sitemap.xml).
   Pages reuse /content.css and the same masthead/footer as the article pages. */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cspMeta, documentShell, clampTitle, clampDescription, longDate, esc, escAttr, LANE_META } from "./shared/page-shell.mjs";
import { loadDayData } from "./shared/day-data.mjs";

// These legacy pages have no inline <script> at all (their masthead is two plain links, no
// hamburger JS) and no PostHog/Google Fonts CDN (/content.css is self-hosted, no remote font
// load) - so the CSP just needs to close everything but same-origin. Computed once: static,
// no per-page content affects it.
const PAGE_CSP = cspMeta();

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = process.env.CONTENT_OUT || join(ROOT, "dist");
const SITE = "https://thearchv.ca";

// esc/escAttr/longDate all come from page-shell.mjs. A local redefinition of longDate here once
// rendered the previous day on any machine behind UTC, and local esc/escAttr shadows are the same
// class of drift — a hardening change to the shared pair would have skipped this file
// (2026-08-12 review, same lesson as the longDate bug).

/* ---------- the typed day data, through scripts/shared/day-data.mjs ----------
   That module is the one loader for src/data/*.ts and it owns the newest-first sort. It matters
   here because the "More <lane>" block below slices the first six entries and so assumes
   newest-first, while these files are written by the desk engine through the GitHub Contents
   API: their ordering is not this script's to assume, and one out-of-order commit would
   otherwise put six stale headlines under every legacy page. */
const { transferDays, worldCupDays } = await loadDayData();

// Labels read from LANE_META, not restated: when the World Cup lane was renamed to
// "International Football" the registry moved and this file's literals did not follow until the
// 2026-08-12 review. laneHref is the canonical lane index these legacy pages funnel to.
const SECTIONS = {
  transfer: { base: "desk", lane: "transfer", label: LANE_META.transfer.label, laneHref: "/desk/transfer/", days: transferDays },
  worldcup: { base: "world-cup", lane: "world-cup", label: LANE_META["world-cup"].label, laneHref: "/desk/world-cup/", days: worldCupDays },
};

function body(text) {
  return String(text).split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
    .map((p) => `<p>${esc(p)}</p>`).join("\n        ");
}

function schema(entry, url, label, laneHref) {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Article", "headline": entry.headline, "description": entry.dek,
        "datePublished": entry.date, "inLanguage": "en-GB",
        "author": { "@type": "Organization", "name": "The ARCHV" },
        "publisher": { "@type": "Organization", "name": "The ARCHV", "logo": `${SITE}/brand/logo-badge@192.png` },
        "image": `${SITE}/og.jpg`, "mainEntityOfPage": url },
      { "@type": "BreadcrumbList", "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": `${SITE}/` },
        { "@type": "ListItem", "position": 2, "name": label, "item": `${SITE}${laneHref}` },
        { "@type": "ListItem", "position": 3, "name": entry.headline, "item": url } ] },
    ],
  }).replace(/</g, "\\u003c");
}

function render(entry, sectionKey) {
  const s = SECTIONS[sectionKey];
  const url = `${SITE}/${s.base}/${entry.date}/`;
  const canonicalUrl = `${SITE}/desk/${s.lane}/${entry.date}/`;
  const others = s.days.filter((d) => d.date !== entry.date).slice(0, 6);
  const rel = others.length ? `
        <nav class="related" aria-label="More ${esc(s.label)}">
          <h2>More ${esc(s.label)}<span class="dot">.</span></h2>
          <ul>${others.map((d) => `<li><a href="/${s.base}/${d.date}/">${esc(d.headline)}</a></li>`).join("")}</ul>
        </nav>` : "";
  return `${documentShell({
  title: clampTitle([entry.headline, "The ARCHV"]),
  metaDescription: clampDescription(entry.dek),
  description: entry.dek,
  socialTitle: entry.headline,

  /* ---------- READ THIS BEFORE CHANGING THE NEXT THREE LINES ----------
     This is the demotion, and the whole reason these pages are still worth serving. A legacy
     day page is noindex,follow AND names a DIFFERENT page as its canonical: /desk/<date>/
     points at /desk/transfer/<date>/, /world-cup/<date>/ at /desk/world-cup/<date>/. That
     pairing is the 2026-07-08 fix for the duplicate-content split between the legacy URLs and
     the lane-scoped ones, recorded in thearchv-site/CLAUDE.md under "Per-article pages", and
     the URLs are kept live rather than retired so no old share 404s. Let either half slip and
     the split comes straight back: an indexable copy of every article, or a legacy page that
     self-canonicals and competes with the article it was demoted in favour of.

     og:url is the page's OWN url, NOT the canonical. A share of this URL should preview as the
     page the reader is actually on. That is the opposite of the choice on /<sport>/questions/,
     where og:url follows the canonical, which is exactly why documentShell refuses to infer one
     from the other and makes both callers say what they mean. */
  robots: "noindex,follow",
  canonical: canonicalUrl,
  ogUrl: url,

  ogType: "article",
  ogImage: `${SITE}/og.jpg`,
  csp: PAGE_CSP,
  jsonLd: schema(entry, url, s.label, s.laneHref),
  /* The content.css shape, same as build-content.mjs: these pages carry no inline script at
     all, no PostHog and no remote font load, which is why PAGE_CSP above can close everything
     but same-origin. Each absence is named rather than inferred. */
  stylesheet: "/content.css",
  rss: false,
  posthog: false,
  fonts: false,
  styles: false,
  ogImageSize: false,
  twitterSite: false,
})}
<body>
  <header class="masthead">
    <a class="wordmark" href="/"><img src="/brand/logo-badge.png" width="34" height="34" alt="The ARCHV monogram" /><span class="wordmark__the">THE</span><span class="wordmark__archv">ARCHV</span></a>
    <nav class="masthead__actions" aria-label="Primary">
      <a class="btn btn--ghost" href="https://instagram.com/thearchvfc" target="_blank" rel="noopener noreferrer">Follow</a>
      <a class="btn btn--gold" href="https://thearchvdispatch.substack.com/subscribe" target="_blank" rel="noopener noreferrer">Subscribe</a>
    </nav>
  </header>
  <main class="wrap">
    <article class="article">
      <p class="breadcrumb"><a href="/">The ARCHV</a> / <a href="${escAttr(s.laneHref)}">${esc(s.label)}</a></p>
      <p class="article__eyebrow">${esc(s.label)} · ${esc(entry.day)}</p>
      <h1>${esc(entry.headline)}</h1>
      <p class="article__meta">${esc(longDate(entry.date))}</p>
      <div class="article__body">
        <p><strong>${esc(entry.dek)}</strong></p>
        ${body(entry.body)}
      </div>${rel}
    </article>
  </main>
  <footer class="footer">
    <div class="wrap">
      <nav class="footer__links" aria-label="Social">
        <a href="https://instagram.com/thearchvfc" target="_blank" rel="noopener noreferrer">Instagram</a>
        <a href="https://x.com/thearchvfc" target="_blank" rel="noopener noreferrer">X</a>
        <a href="https://thearchvdispatch.substack.com/subscribe" target="_blank" rel="noopener noreferrer">Dispatch</a>
        <a href="https://www.etsy.com/shop/TheARCHVCA" target="_blank" rel="noopener noreferrer">Shop</a>
        <a href="/">Home</a>
      </nav>
      <p class="footer__tag">Sports history, illustrated. No gambling ads, ever.</p>
      <p class="footer__legal">The ARCHV is an independent football-history publication, not affiliated with any governing body, league, club, or competition organiser. Club and competition names are referenced for editorial and historical commentary only and remain the property of their respective owners. Player illustrations are original stylised artwork, not photographs. © 2026 The ARCHV.</p>
    </div>
  </footer>
</body>
</html>
`;
}

/* ---------- write pages ---------- */
/* Legacy pages only: noindex + cross-canonical to the lane URL, never added to the sitemap.
   build-article-pages.mjs owns dist/sitemap.xml and appends the canonical <lane>/<date> set last
   in the build chain; this script must not touch it. */
let count = 0;
for (const [key, s] of Object.entries(SECTIONS)) {
  for (const entry of s.days) {
    const dir = join(OUT, s.base, entry.date);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "index.html"), render(entry, key));
    count++;
  }
}

console.log(`[build-day-pages] wrote ${count} legacy day page(s) to ${OUT} (desk + world-cup), noindex + cross-canonical to lane URLs, not added to sitemap`);
