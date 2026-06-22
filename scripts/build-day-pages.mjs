/* build-day-pages.mjs — emits a crawlable HTML page per Transfer Desk and World Cup day, so the
   daily wraps become indexable search surface (one page per day, growing as the engine files more).
   Runs AFTER build-content.mjs (which writes sitemap.xml); this appends the new day URLs to it.
   Pages reuse /content.css and the same masthead/footer as the article pages. */
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const OUT = process.env.CONTENT_OUT || join(ROOT, "dist");
const SITE = "https://thearchv.ca";

const esc = (s = "") => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s = "") => esc(s).replace(/"/g, "&quot;");
const longDate = (iso) => {
  try { return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }); }
  catch { return iso; }
};

/* ---------- load the typed day data via a bundled temp module ---------- */
const entry = [
  `export { transferDays } from "./data/transferDays.ts";`,
  `export { worldCupDays } from "./data/worldCupDays.ts";`,
].join("\n");
const tmp = join(ROOT, ".day-bundle.mjs");
let data;
try {
  await build({ stdin: { contents: entry, resolveDir: SRC, loader: "ts", sourcefile: "day-entry.ts" },
    bundle: true, format: "esm", platform: "node", outfile: tmp, logLevel: "silent" });
  data = await import(pathToFileURL(tmp).href + `?t=${process.hrtime.bigint()}`);
} finally { try { rmSync(tmp); } catch {} }

const SECTIONS = {
  transfer: { base: "desk", label: "Transfer Desk", days: data.transferDays },
  worldcup: { base: "world-cup", label: "World Cup", days: data.worldCupDays },
};

function body(text) {
  return String(text).split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
    .map((p) => `<p>${esc(p)}</p>`).join("\n        ");
}

function schema(entry, url, label) {
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
        { "@type": "ListItem", "position": 2, "name": label, "item": `${SITE}/` },
        { "@type": "ListItem", "position": 3, "name": entry.headline, "item": url } ] },
    ],
  });
}

function render(entry, sectionKey) {
  const s = SECTIONS[sectionKey];
  const url = `${SITE}/${s.base}/${entry.date}/`;
  const others = s.days.filter((d) => d.date !== entry.date).slice(0, 6);
  const rel = others.length ? `
        <nav class="related" aria-label="More ${esc(s.label)}">
          <h2>More ${esc(s.label)}<span class="dot">.</span></h2>
          <ul>${others.map((d) => `<li><a href="/${s.base}/${d.date}/">${esc(d.headline)}</a></li>`).join("")}</ul>
        </nav>` : "";
  return `<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>${esc(entry.headline)} · The ARCHV</title>
  <meta name="description" content="${escAttr(entry.dek)}" />
  <link rel="canonical" href="${url}" />
  <meta name="theme-color" content="#0C2A3E" />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="The ARCHV" />
  <meta property="og:title" content="${escAttr(entry.headline)}" />
  <meta property="og:description" content="${escAttr(entry.dek)}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:image" content="${SITE}/og.jpg" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escAttr(entry.headline)}" />
  <meta name="twitter:description" content="${escAttr(entry.dek)}" />
  <meta name="twitter:image" content="${SITE}/og.jpg" />
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <link rel="stylesheet" href="/content.css" />
  <script type="application/ld+json">${schema(entry, url, s.label)}</script>
</head>
<body>
  <header class="masthead">
    <a class="wordmark" href="/"><img src="/brand/logo-badge.png" width="34" height="34" alt="" /><span class="wordmark__the">THE</span><span class="wordmark__archv">ARCHV</span></a>
    <nav class="masthead__actions" aria-label="Primary">
      <a class="btn btn--ghost" href="https://www.etsy.com/shop/TheARCHVCA" target="_blank" rel="noopener noreferrer">Shop</a>
      <a class="btn btn--ghost" href="https://instagram.com/thearchv_ca" target="_blank" rel="noopener noreferrer">Follow</a>
      <a class="btn btn--gold" href="https://thearchvdispatch.substack.com/subscribe" target="_blank" rel="noopener noreferrer">Subscribe</a>
    </nav>
  </header>
  <main class="wrap">
    <article class="article">
      <p class="breadcrumb"><a href="/">The ARCHV</a> / <a href="/">${esc(s.label)}</a></p>
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
        <a href="https://instagram.com/thearchv_ca" target="_blank" rel="noopener noreferrer">Instagram</a>
        <a href="https://x.com/thearchv_ca" target="_blank" rel="noopener noreferrer">X</a>
        <a href="https://thearchvdispatch.substack.com/subscribe" target="_blank" rel="noopener noreferrer">Dispatch</a>
        <a href="https://www.etsy.com/shop/TheARCHVCA" target="_blank" rel="noopener noreferrer">Shop</a>
        <a href="/">Home</a>
      </nav>
      <p class="footer__tag">Football history, illustrated. Daily.</p>
      <p class="footer__legal">The ARCHV is an independent football-history publication, not affiliated with any governing body, league, club, or competition organiser. Club and competition names are referenced for editorial and historical commentary only and remain the property of their respective owners. Player illustrations are original stylised artwork, not photographs. © 2026 The ARCHV.</p>
    </div>
  </footer>
</body>
</html>
`;
}

/* ---------- write pages ---------- */
let count = 0;
const urls = [];
for (const [key, s] of Object.entries(SECTIONS)) {
  for (const entry of s.days) {
    const dir = join(OUT, s.base, entry.date);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "index.html"), render(entry, key));
    urls.push(`  <url><loc>${SITE}/${s.base}/${entry.date}/</loc><lastmod>${entry.date}</lastmod><changefreq>monthly</changefreq><priority>0.6</priority></url>`);
    count++;
  }
}

/* ---------- append to the sitemap build-content.mjs wrote ---------- */
const sitemap = join(OUT, "sitemap.xml");
if (existsSync(sitemap) && urls.length) {
  const xml = readFileSync(sitemap, "utf8");
  writeFileSync(sitemap, xml.replace("</urlset>", `${urls.join("\n")}\n</urlset>`));
}

console.log(`[build-day-pages] wrote ${count} day page(s) to ${OUT} (desk + world-cup), appended to sitemap`);
