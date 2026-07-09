/* build-content.mjs — renders Markdown in content/ into static HTML article pages + a fresh sitemap.
   Runs AFTER `vite build` (see package.json). Output dir defaults to ./dist, override with CONTENT_OUT.
   Dependency-free on purpose: a small frontmatter parser + a markdown subset renderer.
   Article pages are pure static HTML + /content.css (no app JS) for speed and crawlability. */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONTENT_DIR = join(ROOT, "content");
const OUT = process.env.CONTENT_OUT || join(ROOT, "dist");
const SITE = "https://thearchv.ca";
const SECTION = {
  finals: { label: "Finals", href: "/#archive", more: "More finals" },
  united: { label: "Manchester United", href: "/#transfer-desk", more: "More United history" },
  explainers: { label: "Explained", href: "/#faq", more: "More explainers" },
};
const sect = (s) => SECTION[s] || { label: "The Archive", href: "/", more: "More from the archive" };

const esc = (s = "") => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s = "") => esc(s).replace(/"/g, "&quot;");

/* ---------- frontmatter ---------- */
function parse(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: raw };
  const data = {};
  for (const line of m[1].split("\n")) {
    const mm = line.match(/^(\w+):\s*(.*)$/);
    if (!mm) continue;
    let v = mm[2].trim();
    if (v.startsWith("[") || v.startsWith("{")) { try { v = JSON.parse(v); } catch {} }
    else if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    data[mm[1]] = v;
  }
  return { data, body: m[2].trim() };
}

/* ---------- markdown subset -> html ---------- */
function inline(t) {
  t = esc(t);
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, a, b) => `<a href="${escAttr(b)}">${a}</a>`);
  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  return t;
}
function md(body) {
  const blocks = body.split(/\n{2,}/);
  const out = [];
  for (const b of blocks) {
    const t = b.trim();
    if (!t) continue;
    if (t === "---") { out.push("<hr>"); continue; }
    if (t.startsWith("### ")) { out.push(`<h3>${inline(t.slice(4))}</h3>`); continue; }
    if (t.startsWith("## ")) { out.push(`<h2>${inline(t.slice(3))}</h2>`); continue; }
    if (t.startsWith("# ")) { out.push(`<h2>${inline(t.slice(2))}</h2>`); continue; }
    if (t.split("\n").every((l) => l.trim().startsWith("> "))) {
      out.push(`<blockquote>${inline(t.split("\n").map((l) => l.replace(/^>\s?/, "")).join(" "))}</blockquote>`); continue;
    }
    if (t.split("\n").every((l) => /^\s*[-*]\s+/.test(l))) {
      out.push("<ul>" + t.split("\n").map((l) => `<li>${inline(l.replace(/^\s*[-*]\s+/, ""))}</li>`).join("") + "</ul>"); continue;
    }
    if (t.split("\n").every((l) => /^\s*\d+\.\s+/.test(l))) {
      out.push("<ol>" + t.split("\n").map((l) => `<li>${inline(l.replace(/^\s*\d+\.\s+/, ""))}</li>`).join("") + "</ol>"); continue;
    }
    out.push(`<p>${inline(t.replace(/\n/g, " "))}</p>`);
  }
  return out.join("\n        ");
}

/* ---------- collect ---------- */
function walk(dir) {
  const files = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) files.push(...walk(p));
    else if (e.endsWith(".md") && e !== "BACKLOG.md") files.push(p);
  }
  return files;
}
if (!existsSync(CONTENT_DIR)) { console.log("No content/ dir; skipping content build."); process.exit(0); }
const pages = walk(CONTENT_DIR).map((f) => { const { data, body } = parse(readFileSync(f, "utf8")); return { ...data, body }; })
  .filter((p) => p.slug && p.section);

/* ---------- schema ---------- */
function schema(p, url) {
  const graph = [
    { "@type": "Article", "headline": p.title, "description": p.description, "datePublished": p.datePublished,
      "author": { "@type": "Organization", "name": "The ARCHV" }, "publisher": { "@type": "Organization", "name": "The ARCHV", "logo": `${SITE}/brand/logo-badge@192.png` },
      "image": `${SITE}${p.ogImage || "/og.jpg"}`, "mainEntityOfPage": url, "inLanguage": "en-GB" },
    { "@type": "BreadcrumbList", "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home", "item": `${SITE}/` },
      { "@type": "ListItem", "position": 2, "name": sect(p.section).label, "item": `${SITE}${sect(p.section).href}` },
      { "@type": "ListItem", "position": 3, "name": p.title, "item": url } ] },
  ];
  if (p.section === "finals" && Array.isArray(p.teams) && p.eventDate) {
    graph.push({ "@type": "SportsEvent",
      "name": `${p.teams[0]} v ${p.teams[1]} — ${new Date(p.eventDate).getFullYear()} World Cup final`,
      "startDate": p.eventDate, "sport": "Association football",
      "location": { "@type": "Place", "name": p.venue, "address": [p.city, p.country].filter(Boolean).join(", ") },
      "competitor": p.teams.map((t) => ({ "@type": "SportsTeam", "name": t })) });
  }
  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c");
}

/* ---------- page template ---------- */
function render(p, allPages) {
  const url = `${SITE}/${p.section}/${p.slug}/`;
  const meta = sect(p.section);
  let related = allPages.filter((x) => x.section === p.section && x.slug !== p.slug);
  if (!related.length) related = allPages.filter((x) => x.slug !== p.slug);
  related = related.slice(0, 6);
  const fig = p.posterImage ? `
        <figure class="article__fig">
          <img src="${escAttr(p.posterImage)}" alt="${escAttr(p.posterAlt || p.title)}" width="1080" height="1350" loading="eager" />
          <figcaption>Original ARCHV illustration. Prints in the <a href="${escAttr(p.posterEtsy || "https://www.etsy.com/shop/TheARCHVCA")}">shop</a>.</figcaption>
        </figure>` : "";
  const qa = p.quickAnswer ? `
        <div class="quick-answer">
          <p class="qa-label">Quick answer</p>
          <p>${inline(p.quickAnswer)}</p>
        </div>` : "";
  const shop = p.posterEtsy ? `
        <div class="shopcta">
          <p>Own the ${esc(p.eyebrow || p.title)} print.</p>
          <a class="btn btn--gold" href="${escAttr(p.posterEtsy)}" target="_blank" rel="noopener noreferrer">Buy the poster</a>
        </div>` : "";
  const rel = related.length ? `
        <nav class="related" aria-label="${escAttr(meta.more)}">
          <h2>${esc(meta.more)}<span class="dot">.</span></h2>
          <ul>${related.map((r) => `<li><a href="/${r.section}/${r.slug}/">${esc(r.title)}</a></li>`).join("")}</ul>
        </nav>` : "";
  return `<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>${esc(p.title)} · The ARCHV</title>
  <meta name="description" content="${escAttr(p.description)}" />
  <link rel="canonical" href="${url}" />
  <meta name="theme-color" content="#0C2A3E" />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="The ARCHV" />
  <meta property="og:title" content="${escAttr(p.title)}" />
  <meta property="og:description" content="${escAttr(p.description)}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:image" content="${SITE}${escAttr(p.ogImage || "/og.jpg")}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escAttr(p.title)}" />
  <meta name="twitter:description" content="${escAttr(p.description)}" />
  <meta name="twitter:image" content="${SITE}${escAttr(p.ogImage || "/og.jpg")}" />
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <link rel="stylesheet" href="/content.css" />
  <script type="application/ld+json">${schema(p, url)}</script>
</head>
<body>
  <header class="masthead">
    <a class="wordmark" href="/"><img src="/brand/logo-badge.png" width="34" height="34" alt="" /><span class="wordmark__the">THE</span><span class="wordmark__archv">ARCHV</span></a>
    <nav class="masthead__actions" aria-label="Primary">
      <a class="btn btn--ghost" href="https://www.etsy.com/shop/TheARCHVCA" target="_blank" rel="noopener noreferrer">Shop</a>
      <a class="btn btn--ghost" href="https://instagram.com/thearchvfc" target="_blank" rel="noopener noreferrer">Follow</a>
      <a class="btn btn--gold" href="https://thearchvdispatch.substack.com/subscribe" target="_blank" rel="noopener noreferrer">Subscribe</a>
    </nav>
  </header>
  <main class="wrap">
    <article class="article">
      <p class="breadcrumb"><a href="/">The ARCHV</a> / <a href="${escAttr(meta.href)}">${esc(meta.label)}</a></p>
      <p class="article__eyebrow">${esc(p.eyebrow || "")}</p>
      <h1>${esc(p.title)}</h1>
      <p class="article__meta">${[p.score, p.venue, p.eventDate ? new Date(p.eventDate).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : ""].filter(Boolean).join(" · ")}</p>${fig}${qa}
      <div class="article__body">
        ${md(p.body)}
      </div>${shop}${rel}
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
      <p class="footer__tag">Football history, illustrated. Daily.</p>
      <p class="footer__legal">The ARCHV is an independent football-history publication, not affiliated with any governing body, league, club, or competition organiser. Club and competition names are referenced for editorial and historical commentary only and remain the property of their respective owners. Player illustrations are original stylised artwork, not photographs. © 2026 The ARCHV.</p>
    </div>
  </footer>
</body>
</html>
`;
}

/* ---------- write pages ---------- */
const finals = pages.filter((p) => p.section === "finals");
let n = 0;
for (const p of pages) {
  const dir = join(OUT, p.section, p.slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), render(p, pages));
  n++;
}

/* ---------- sitemap (homepage + all article pages) ---------- */
const today = new Date().toISOString().slice(0, 10);
const urls = [`  <url><loc>${SITE}/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>`]
  .concat(pages.map((p) => `  <url><loc>${SITE}/${p.section}/${p.slug}/</loc><lastmod>${p.datePublished || today}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>`));
writeFileSync(join(OUT, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`);

console.log(`build-content: wrote ${n} page(s) + sitemap (${pages.length + 1} urls) to ${OUT}`);
