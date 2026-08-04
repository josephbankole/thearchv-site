/* build-sport-pages.mjs — the section fronts for the new sports (NFL, Formula 1, Tennis, Golf)
   plus the /football/ courtesy alias. Deliberately a lighter template than the football homepage
   (no WebGL hero, no poster archive): a section header, editorial holding copy while a desk is
   still empty, a Question Desk lane row, and a day rail per lane once entries exist. Runs after
   `vite build` (see package.json "build"); the same page shell as the lane and article pages so
   the masthead, sport tab row, footer and brand styles never drift. Football keeps every existing
   URL; this script adds no football content beyond the aliased homepage stub at /football/. */
import { build } from "esbuild";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  SITE, esc, escAttr, longDate, byDateDesc, clampTitle, clampDescription,
  SPORTS, sportByKey, lanesForSport, SPORT_DESK_COPY,
  masthead, deskNav, footer, posthogSnippet, fontLinks, pageStyles,
  cspMeta, MASTHEAD_SCRIPT_HASH, POSTHOG_SCRIPT_HASH, RSS_LINK,
} from "./shared/page-shell.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const OUT = process.env.CONTENT_OUT || join(ROOT, "dist");

// Both inline scripts on this page family (masthead toggle + PostHog loader) are static, so one
// CSP covers every sport section page — same as the lane pages.
const PAGE_CSP = cspMeta({ scripts: [MASTHEAD_SCRIPT_HASH, POSTHOG_SCRIPT_HASH], posthog: true, googleFonts: true });

/* ---------- load the new sports' day data via a bundled temp module (same pattern as the other
   generators). Empty arrays today; the desks open one entry at a time. ---------- */
const entrySrc = [
  `export { nflDays } from "./data/nflDays.ts";`,
  `export { f1Days } from "./data/f1Days.ts";`,
  `export { tennisDays } from "./data/tennisDays.ts";`,
  `export { golfDays } from "./data/golfDays.ts";`,
].join("\n");
const tmp = join(ROOT, ".sport-bundle.mjs");
let data;
try {
  await build({ stdin: { contents: entrySrc, resolveDir: SRC, loader: "ts", sourcefile: "sport-entry.ts" },
    bundle: true, format: "esm", platform: "node", outfile: tmp, logLevel: "silent" });
  data = await import(pathToFileURL(tmp).href + `?t=${process.hrtime.bigint()}`);
} finally { try { rmSync(tmp); } catch {} }

const DAYS = {
  nfl: [...data.nflDays].sort(byDateDesc),
  f1: [...data.f1Days].sort(byDateDesc),
  tennis: [...data.tennisDays].sort(byDateDesc),
  golf: [...data.golfDays].sort(byDateDesc),
};

// Editorial copy per sport comes from SPORT_DESK_COPY in the shared page shell (one source, also
// used by the lane fronts): `lede` is what the desk covers and its standard; `holding` is the
// honest empty-state paragraph shown until the first entry lands.
const COPY = SPORT_DESK_COPY;

// A lane's entries as whole-card links, reusing the lane-card styling from pageStyles(). Matches
// build-lane-pages.mjs's laneCard so a sport section and a lane front render identically.
function laneCard(entry, sportKey, laneKey) {
  const avatar = entry.image
    ? `<img class="lane-card__avatar" src="${escAttr(entry.image)}" alt="${escAttr(entry.imageAlt ?? `Illustration: ${entry.headline}`)}" loading="lazy" decoding="async" width="64" height="64" />`
    : "";
  return `<li><a class="lane-card" href="/${sportKey}/${laneKey}/${entry.date}/">${avatar}<span class="lane-card__body"><span class="lane-card__kicker">${esc(entry.day)} · ${esc(longDate(entry.date))}</span><span class="lane-card__headline">${esc(entry.headline)}</span><span class="lane-card__dek">${esc(entry.dek)}</span></span></a></li>`;
}

function renderSection(sport) {
  const url = `${SITE}/${sport.urlBase}/`;
  const copy = COPY[sport.key];
  const days = DAYS[sport.key] || [];
  const lanes = lanesForSport(sport.key); // single Question Desk lane for the new sports
  const laneKey = sport.lanes[0];

  // Empty desk: the honest holding paragraph. With entries: the day rail as whole-card links.
  const rail = days.length
    ? `<ul class="lane-list" aria-label="${escAttr(sport.label)} Question Desk, newest first">
        ${days.map((e) => laneCard(e, sport.urlBase, laneKey)).join("\n        ")}
      </ul>`
    : `<div class="sport-holding"><p>${esc(copy.holding)}</p></div>`;

  const pageTitle = `${sport.label}: the Question Desk · The ARCHV`;
  const socialTitle = `${sport.label} · The ARCHV`;

  return `<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>${esc(clampTitle(pageTitle.split(" · ")))}</title>
  <meta name="description" content="${escAttr(clampDescription(copy.lede))}" />
  <meta name="robots" content="index,follow" />
  <link rel="canonical" href="${url}" />
  <meta name="theme-color" content="#0C2A3E" />
  ${PAGE_CSP}
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="The ARCHV" />
  <meta property="og:title" content="${escAttr(socialTitle)}" />
  <meta property="og:description" content="${escAttr(copy.lede)}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:image" content="${SITE}/og.jpg" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:site" content="@thearchvfc" />
  <meta name="twitter:title" content="${escAttr(socialTitle)}" />
  <meta name="twitter:description" content="${escAttr(copy.lede)}" />
  <meta name="twitter:image" content="${SITE}/og.jpg" />
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  ${RSS_LINK}
  <script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        name: `${sport.label} · The ARCHV`,
        description: copy.lede,
        url,
        inLanguage: "en-GB",
        isPartOf: { "@type": "WebSite", name: "The ARCHV", url: `${SITE}/` },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
          { "@type": "ListItem", position: 2, name: sport.label, item: url },
        ],
      },
    ],
  }).replace(/</g, "\\u003c")}</script>

  <!-- PostHog: pageview only on this static surface. Same project as the website. -->
  ${posthogSnippet()}

  ${fontLinks()}

  ${pageStyles()}
</head>
<body>
  ${masthead(sport.key)}
  ${deskNav(laneKey, sport.key)}
  <main class="wrap wrap--wide">
    <section class="sport-head">
      <p class="breadcrumb"><a href="/">The ARCHV</a> / ${esc(sport.label)}</p>
      <p class="sport-head__eyebrow">${esc(sport.label)}</p>
      <h1>${esc(sport.label)}</h1>
      <p class="sport-head__lede">${esc(copy.lede)}</p>
      ${rail}
    </section>
  </main>
  ${footer()}
</body>
</html>
`;
}

// /football/ courtesy alias: catches anyone who guesses the symmetric URL. Canonical points at /
// so it never competes with the real homepage for ranking, and a meta refresh (not a script, so
// no CSP hash) sends a human straight there. GitHub Pages cannot 301, so a soft alias is the only
// option; the canonical neutralises the SEO cost. Deliberately NOT in the sitemap.
function renderFootballAlias() {
  const home = `${SITE}/`;
  return `<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="refresh" content="0; url=/" />
  <title>Football · The ARCHV</title>
  <meta name="description" content="Football lives at the front door of The ARCHV. Redirecting you there now." />
  <link rel="canonical" href="${home}" />
  <meta name="robots" content="noindex,follow" />
  <meta name="theme-color" content="#0C2A3E" />
  ${cspMeta({})}
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  ${RSS_LINK}
  <style>
    body { margin: 0; background: #0C2A3E; color: #F2EAD3; font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; display: flex; min-height: 100vh; align-items: center; justify-content: center; text-align: center; }
    a { color: #C9A14A; }
  </style>
</head>
<body>
  <main>
    <p>Football is the front door of The ARCHV. <a href="/">Continue to the home page</a>.</p>
  </main>
</body>
</html>
`;
}

/* ---------- write pages ---------- */
let count = 0;
for (const sport of SPORTS) {
  if (sport.key === "football") continue; // football lives at the root, not a section page
  const dir = join(OUT, sport.urlBase);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), renderSection(sport));
  count++;
}

const footballDir = join(OUT, "football");
mkdirSync(footballDir, { recursive: true });
writeFileSync(join(footballDir, "index.html"), renderFootballAlias());

console.log(`[build-sport-pages] wrote ${count} sport section page(s) + /football/ alias to ${OUT}`);
