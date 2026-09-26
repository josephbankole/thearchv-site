/* build-daily-pages.mjs: the Wire page (/wire/) and the tables page (/tables/), rendered at build
   time from scripts/data/daily/wire.json and tables.json (the desk commits those to main; see
   design-final B and F). Same self-contained page family as the standards and sport pages:
   shared masthead, footer, brand CSS and CSP, and no per-page inline script.

   /wire/ is noindex,follow with a self canonical and stays out of every sitemap, feed and the
   search index: the headlines are other publishers' work (design-final D4, FOUNDER). /tables/ is
   indexable and enters the sitemap through build-content.mjs's EXTRA_URLS.
   The web never says "today": a static page can outlive its day, so it prints the edition date. */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SITE, SPORTS, NO_SPORT, esc, escAttr, masthead, footer, documentShell, ROBOTS_INDEXABLE, ROBOTS_NOINDEX_FOLLOW,
  cspMeta, MASTHEAD_SCRIPT_HASH, POSTHOG_SCRIPT_HASH,
} from "./shared/page-shell.mjs";
import { loadDaily } from "./wire/lib/content.mjs";
import { currentEdition } from "./wire/lib/schema.mjs";
import { renderWireItem, renderEditionLine, renderWireFooter, wireItemsFor, renderTableBlock, WIRE_SUBLINE } from "./wire/lib/render.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = process.env.CONTENT_OUT || join(ROOT, "dist");
const PAGE_CSP = cspMeta({ scripts: [MASTHEAD_SCRIPT_HASH, POSTHOG_SCRIPT_HASH], posthog: true, googleFonts: true });
const { wire, tables, today } = loadDaily();

const webPage = (name, description, url) => ({
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "WebPage", name, description, url, inLanguage: "en-GB", isPartOf: { "@type": "WebSite", name: "The ARCHV", url: `${SITE}/` } },
    { "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
      { "@type": "ListItem", position: 2, name, item: url },
    ] },
  ],
});

function page({ title, description, url, robots, body }) {
  return `${documentShell({
  title, metaDescription: description, description, socialTitle: title, robots,
  canonical: url, ogUrl: url, ogType: "website", ogImage: `${SITE}/og.jpg`, csp: PAGE_CSP,
  jsonLd: webPage(title.split(" · ")[0], description, url),
})}
<body>
  ${masthead(NO_SPORT)}
  <main class="wrap">
${body}
  </main>
  ${footer()}
</body>
</html>
`;
}

/* ---------- /wire/ ---------- */
const WIRE_URL = `${SITE}/wire/`;
const WIRE_DESC = "The Wire: one headline a day from each permitted newsroom, across football, the NFL, F1, tennis, golf and basketball, linked to the publisher.";
const ed = currentEdition(wire, today);
let wireBody;
if (!ed) {
  wireBody = `      <p class="wire__edition">No edition in the last seven days.</p>`;
} else {
  let pos = 0;
  wireBody = SPORTS.map((sport) => {
    const items = wireItemsFor(ed, sport.key);
    const list = items.length
      ? `<ul class="wire__list">\n      ${items.map((it) => renderWireItem(it, ++pos)).join("\n      ")}\n      </ul>`
      : `<p class="wire-sport__empty">Nothing from our sources for this edition.</p>`;
    return `      <section class="wire-sport" id="${escAttr(sport.key)}" aria-labelledby="wire-${escAttr(sport.key)}">
      <h2 id="wire-${escAttr(sport.key)}">${esc(sport.label)}</h2>
      ${list}
      </section>`;
  }).join("\n");
  wireBody = `      ${renderEditionLine(ed, today)}\n${wireBody}`;
}
const wireHtml = page({
  title: "The Wire · The ARCHV",
  description: WIRE_DESC,
  url: WIRE_URL,
  robots: ROBOTS_NOINDEX_FOLLOW,
  body: `    <article class="wire">
      <p class="breadcrumb"><a href="/">The ARCHV</a> / The Wire</p>
      <h1>The Wire</h1>
      <p class="wire__subline">${esc(WIRE_SUBLINE)}</p>
${wireBody}
      ${renderWireFooter()}
      <p class="wire__footer">How the Wire works: once a day we take the top story from each newsroom whose terms allow it, leave the headline exactly as written, and link to the publisher. Where we add a line of our own it is marked as our note. Our own reporting standards are on <a href="/standards/">How we verify</a>.</p>
    </article>`,
});

/* ---------- /tables/ ---------- */
const TABLES_URL = `${SITE}/tables/`;
const TABLES_DESC = "Tables and fixtures from The ARCHV: the Premier League, Manchester United, the NFL and more, updated once a day with every source credited.";
const sportsWithBlocks = SPORTS.map((sport) => {
  const blocks = (tables.sports[sport.key]?.blocks || []).map((b) => renderTableBlock(b, { today })).filter(Boolean);
  return blocks.length ? `      <section class="tables" id="${escAttr(sport.key)}" aria-labelledby="tables-${escAttr(sport.key)}">
      <h2 class="wire__title" id="tables-${escAttr(sport.key)}">${esc(sport.label)}</h2>
      ${blocks.join("\n      ")}
      </section>` : "";
}).filter(Boolean);
const tablesHtml = page({
  title: "Tables and fixtures · The ARCHV",
  description: TABLES_DESC,
  url: TABLES_URL,
  robots: ROBOTS_INDEXABLE,
  body: `    <article class="tables-page">
      <p class="breadcrumb"><a href="/">The ARCHV</a> / Tables</p>
      <h1>Tables and fixtures</h1>
      <p class="wire__subline">Updated once a day. Each block says when it was last updated and where the data comes from.</p>
${sportsWithBlocks.length ? sportsWithBlocks.join("\n") : `      <p class="wire__edition">No tables to show yet.</p>`}
    </article>`,
});

mkdirSync(join(OUT, "wire"), { recursive: true });
mkdirSync(join(OUT, "tables"), { recursive: true });
writeFileSync(join(OUT, "wire", "index.html"), wireHtml);
writeFileSync(join(OUT, "tables", "index.html"), tablesHtml);
console.log(`[build-daily-pages] /wire/ (${ed ? `edition ${ed.date}, ${ed.items.length} item(s)` : "no current edition"}) and /tables/ (${sportsWithBlocks.length} sport(s)) -> ${OUT}`);
