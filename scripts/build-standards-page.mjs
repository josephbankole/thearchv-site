/* scripts/build-standards-page.mjs — emits the public "How we verify" page (UNIT 2) at
   dist/standards/index.html. A public-facing distillation of ../EDITOR_STANDARDS.md, not a copy:
   two-source verification, the REPORTED single-source tier, what VERIFIED and RUMOUR mean, dated
   append-only corrections, original-illustration-only artwork, and independence.
   Same page shell as the glossary and lane/article pages (scripts/shared/page-shell.mjs): masthead,
   brand styles, footer, CSP helper. Runs before verify-csp-pages.mjs (see package.json "build").
   It does not touch the sitemap — /standards/ is added through build-content.mjs's EXTRA_URLS
   allowlist, the single mechanism that assembles dist/sitemap.xml, so the URL lands exactly once. */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SITE, esc, escAttr, masthead, footer, documentShell,
  cspMeta, MASTHEAD_SCRIPT_HASH, POSTHOG_SCRIPT_HASH, ORG_SAMEAS,
} from "./shared/page-shell.mjs";

const PAGE_CSP = cspMeta({ scripts: [MASTHEAD_SCRIPT_HASH, POSTHOG_SCRIPT_HASH], posthog: true, googleFonts: true });

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = process.env.CONTENT_OUT || join(ROOT, "dist");
const URL = `${SITE}/standards/`;
const TITLE = "How we verify · The ARCHV";
const DESCRIPTION =
  "How The ARCHV verifies what it publishes: two independent sources, the REPORTED single-source tier, VERIFIED and RUMOUR labels, and dated corrections.";

const LEAD =
  "The ARCHV is a football-history publication. We treat the game's present the way we treat its past, by checking it before we publish. This page sets out how we decide what to run, and how confident we are when we run it.";

const SECTIONS = [
  {
    h2: "Two sources before we publish",
    paras: [
      "Nothing goes up as fact on a single source. A claim, a fee, a date or a scoreline is checked against at least two independent outlets before we treat it as settled. Two write-ups of the same original scoop are not two sources; we want outlets that did the reporting separately.",
    ],
  },
  {
    h2: "The one exception: REPORTED",
    paras: [
      "Transfer news moves faster than confirmation, and the best of it often breaks through one reporter. When a named journalist with a strong record breaks a story alone, we may run it marked REPORTED, with the reporter and outlet named every time.",
      "REPORTED means one credible source and nothing more. It does not turn into confirmed because other sites have copied it. It hardens only when the club confirms, or a genuinely separate outlet reports the same thing.",
    ],
  },
  {
    h2: "VERIFIED and RUMOUR say what they mean",
    paras: [
      "On the transfer desk, every item carries a status. VERIFIED means the move is done and confirmed. RUMOUR means it is a link and not a certainty, however loudly it is being talked about. We do not blur the two to make a story sound bigger than it is. When we are not sure, the label says so.",
    ],
  },
  {
    h2: "Corrections are added, not hidden",
    paras: [
      "The archive is a record, so we do not quietly rewrite it. When something changes, or we get something wrong, we add a dated note to the entry (\"Update, 4 July: ...\") instead of editing the original out of existence. You can still read what we first said and see what changed.",
    ],
  },
  {
    h2: "The artwork is our own",
    paras: [
      "Every image on The ARCHV is original illustration, drawn in our own house style. We use no club crests, no kit designs, no federation or competition marks, and no photographs. The faces are stylised drawings published as editorial commentary, not likenesses passed off as photos.",
    ],
  },
  {
    h2: "We answer to nobody in the game",
    paras: [
      "The ARCHV is independent. We are not affiliated with FIFA, or with any club, federation, league or competition. No governing body approves our copy and none pays for it. That independence is the point of the whole thing: it is what lets us call a rumour a rumour, and correct ourselves in public when we get it wrong.",
    ],
  },
];

const schema = JSON.stringify({
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      name: "How we verify",
      description: DESCRIPTION,
      url: URL,
      inLanguage: "en-GB",
      isPartOf: { "@type": "WebSite", name: "The ARCHV", url: `${SITE}/` },
      publisher: { "@type": "Organization", name: "The ARCHV", url: `${SITE}/`, logo: `${SITE}/brand/logo-badge@192.png`, sameAs: ORG_SAMEAS },
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
        { "@type": "ListItem", position: 2, name: "How we verify", item: URL },
      ],
    },
  ],
}).replace(/</g, "\\u003c");

const sectionsHtml = SECTIONS.map(
  (s) => `      <h2>${esc(s.h2)}</h2>\n      ${s.paras.map((p) => `<p>${esc(p)}</p>`).join("\n      ")}`,
).join("\n");

const html = `${documentShell({
  title: TITLE,
  // NOT clampDescription'd, and that is how this page has always shipped: the standing
  // description is written to length by hand rather than trimmed by the guard.
  metaDescription: DESCRIPTION,
  description: DESCRIPTION,
  socialTitle: "How we verify · The ARCHV",
  robots: "index,follow,max-image-preview:large",
  canonical: URL,
  ogUrl: URL,
  ogType: "website",
  ogImage: `${SITE}/og.jpg`,
  // This page carries og:image but no twitter:image, and always has. Twitter falls back to
  // og:image so nothing is broken by it, but it is an inconsistency with the rest of the
  // family rather than a decision anyone recorded. Preserved here on purpose; changing it
  // is a separate call, not a side effect of moving the head onto the shell.
  twitterImage: false,
  csp: PAGE_CSP,
  jsonLd: schema,
})}
<body>
  ${masthead()}
  <main class="wrap">
    <article class="standards">
      <p class="breadcrumb"><a href="/">The ARCHV</a> / How we verify</p>
      <p class="lane__eyebrow">Editorial standards</p>
      <h1>How we verify</h1>
      <p class="lead">${esc(LEAD)}</p>
${sectionsHtml}
    </article>
  </main>
  ${footer()}
</body>
</html>
`;

mkdirSync(join(OUT, "standards"), { recursive: true });
writeFileSync(join(OUT, "standards", "index.html"), html);
console.log(`[build-standards-page] wrote the How we verify page to ${OUT}/standards/`);
