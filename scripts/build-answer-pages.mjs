/* build-answer-pages.mjs: the living answers and living story pages (search plan G7, 2026-11-09),
   one page per entry in src/data/answers.ts, at dist/answers/<slug>/index.html.

   A "story" page collects the dated desk pages a running saga already produced (Lewis Hall's 15,
   Marcus Rashford's 14, Ederson's 10), newest first, each as its date, headline, standfirst and a
   link. It quotes the dated pages' own headlines and standfirsts, so it adds no new claim, and the
   dated pages stay where they are; they gain a forward link at the top (build-article-pages.mjs).
   An "answer" page carries one recurring question and its current answer.

   Every page shows a visible "Changes to this page" log, and its dateModified is the entry's own
   `updated`, never the build clock (G10). robots follows G1: index only when the entry asks for it
   AND names its demand evidence; otherwise noindex,follow. The URL is in sitemap.xml either way,
   with lastmod = updated. Nothing here fails the build on a data condition (plan section 6): a
   date that is not in its lane is warned about and left out. */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SITE, esc, escAttr, longDate, answerTitle, masthead, footer, documentShell, ROBOTS_INDEXABLE, ROBOTS_NOINDEX_FOLLOW,
  cspMeta, MASTHEAD_SCRIPT_HASH, POSTHOG_SCRIPT_HASH, SPORTS, ORG_REF, ORG_NODE, DESK_BYLINE, HOW_MADE_PATH,
  appCtaBlock, APP_CTA_STYLES, sentenceDescription,
} from "./shared/page-shell.mjs";
import { loadDayData } from "./shared/day-data.mjs";
import { appendUrls } from "./shared/sitemap.mjs";
import { ANSWERS_BASE } from "./shared/living-answers.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = process.env.CONTENT_OUT || join(ROOT, "dist");

const { transferDays, worldCupDays, leaguesDays, sportDays, answers } = await loadDayData({ extras: ["answers"] });

// Lane base -> entries, the same bases build-article-pages.mjs writes.
const LANES = new Map([
  ["/desk/transfer/", { label: "Transfer Desk", days: transferDays }],
  ["/desk/world-cup/", { label: "World Cup", days: worldCupDays }],
  ["/desk/leagues/", { label: "Football Leagues", days: leaguesDays }],
]);
for (const sport of SPORTS) {
  if (sport.key === "football") continue;
  for (const laneKey of sport.lanes) LANES.set(`/${sport.urlBase}/${laneKey}/`, { label: sport.label, days: sportDays[sport.key] || [] });
}

const CSP = cspMeta({ scripts: [MASTHEAD_SCRIPT_HASH, POSTHOG_SCRIPT_HASH], posthog: true, forms: [] });
const warnings = [];

function collected(a) {
  const items = [];
  for (const f of a.follows || []) {
    const lane = LANES.get(f.lane);
    if (!lane) { warnings.push(`${a.slug}: lane ${f.lane} is not a desk lane`); continue; }
    for (const d of f.dates) {
      const e = lane.days.find((x) => x.date === d);
      if (!e) { warnings.push(`${a.slug}: ${f.lane}${d}/ is not in the lane`); continue; }
      items.push({ href: `${f.lane}${d}/`, date: d, day: e.day, headline: e.headline, dek: e.dek, lane: lane.label });
    }
  }
  return items.sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : 0));
}

function indexable(a) {
  if (a.index !== "index") return false;
  if (!a.demand) { warnings.push(`${a.slug}: asks for index with no demand evidence (G1), filed noindex`); return false; }
  return true;
}

function schema(a, url, items) {
  const graph = [
    {
      "@type": a.kind === "story" ? "CollectionPage" : "WebPage",
      name: a.title,
      description: a.dek,
      url,
      datePublished: a.published,
      dateModified: a.updated,
      inLanguage: "en-GB",
      isAccessibleForFree: true,
      author: ORG_REF,
      publisher: ORG_REF,
      ...(items.length ? {
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: items.length,
          itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE}${it.href}`, name: it.headline })),
        },
      } : {}),
    },
    ORG_NODE,
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
        { "@type": "ListItem", position: 2, name: a.title, item: url },
      ],
    },
  ];
  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c");
}

function render(a, items, index) {
  const url = `${SITE}${ANSWERS_BASE}${a.slug}/`;
  const sportKey = SPORTS.some((s) => s.key === a.sport) ? a.sport : undefined;
  const latest = items[0];
  const answerBody = a.kind === "answer" && a.answer
    ? `
        ${a.question ? `<h2>${esc(a.question)}</h2>` : ""}
        ${String(a.answer).split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).map((p) => `<p>${esc(p)}</p>`).join("\n        ")}`
    : "";
  const latestLine = a.kind === "story" && latest
    ? `
        <p><strong>Latest update, ${esc(longDate(latest.date))}:</strong> <a href="${escAttr(latest.href)}">${esc(latest.headline)}</a></p>`
    : "";
  const list = items.length
    ? `
      <section class="related" aria-label="Every update">
        <h2>Every update, newest first</h2>
        <ul class="more-list">
          ${items.map((it) => `<li><a class="more-link" href="${escAttr(it.href)}"><span class="more-link__kicker">${esc(it.day)} · ${esc(longDate(it.date))}</span>${esc(it.headline)}</a><p>${esc(it.dek)}</p></li>`).join("\n          ")}
        </ul>
      </section>`
    : "";
  const log = (a.changelog || []).length
    ? `
      <section class="related" aria-label="Changes to this page">
        <h2>Changes to this page</h2>
        <ul>
          ${a.changelog.map((c) => `<li>${esc(longDate(c.date))}: ${esc(c.note)}</li>`).join("\n          ")}
        </ul>
      </section>`
    : "";

  return `${documentShell({
  title: answerTitle(a.seoTitle, [a.title, "The ARCHV"]),
  metaDescription: sentenceDescription(a.dek, 155),
  description: a.dek,
  socialTitle: a.title,
  robots: index ? ROBOTS_INDEXABLE : ROBOTS_NOINDEX_FOLLOW,
  canonical: url,
  ogUrl: url,
  ogType: "article",
  ogImage: `${SITE}/og.jpg`,
  csp: CSP,
  jsonLd: schema(a, url, items),
  extraHead: [APP_CTA_STYLES],
})}
<body>
  ${masthead(sportKey)}
  <main class="wrap" id="main">
    <article class="article">
      <p class="article__eyebrow">${a.kind === "story" ? "Running story" : "Living answer"}</p>
      <h1>${esc(a.title)}</h1>
      <p class="article__byline">${esc(DESK_BYLINE)} · <a href="${escAttr(HOW_MADE_PATH)}">How this desk works</a></p>
      <p class="article__meta">Last updated ${esc(longDate(String(a.updated).slice(0, 10)))}</p>
      <div class="article__body">
        <p><strong>${esc(a.dek)}</strong></p>${latestLine}${answerBody}
      </div>${list}${log}
      ${appCtaBlock()}
    </article>
  </main>
  ${footer()}
</body>
</html>
`;
}

const urls = [];
let indexed = 0;
for (const a of answers) {
  const items = collected(a);
  const index = indexable(a);
  if (index) indexed++;
  const dir = join(OUT, ...ANSWERS_BASE.split("/").filter(Boolean), a.slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), render(a, items, index));
  urls.push({ loc: `${SITE}${ANSWERS_BASE}${a.slug}/`, lastmod: a.updated, changefreq: "weekly", priority: "0.6" });
}
appendUrls(urls);
for (const w of warnings) console.warn(`[build-answer-pages] WARN ${w}`);
console.log(`[build-answer-pages] wrote ${answers.length} living page(s) to ${OUT}${ANSWERS_BASE}, ${indexed} index, ${answers.length - indexed} noindex,follow; appended to sitemap`);
