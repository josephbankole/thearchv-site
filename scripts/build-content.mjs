/* build-content.mjs — renders Markdown in content/ into static HTML article pages + a fresh sitemap.
   Runs AFTER `vite build` (see package.json). Output dir defaults to ./dist, override with CONTENT_OUT.
   Dependency-free on purpose: a small frontmatter parser + a markdown subset renderer.
   Article pages are pure static HTML + /content.css (no app JS) for speed and crawlability. */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { APP_STORE_URL, scriptHash, extractScriptBody, cspMeta, clampTitle, clampDescription } from "./shared/page-shell.mjs";
import { glossaryEntries } from "./glossary-data.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONTENT_DIR = join(ROOT, "content");
const OUT = process.env.CONTENT_OUT || join(ROOT, "dist");
const SITE = "https://thearchv.ca";
const SECTION = {
  finals: { label: "Finals", href: "/#archive", more: "More finals" },
  united: { label: "Manchester United", href: "/#transfer-desk", more: "More United history" },
  explainers: { label: "Explained", href: "/#faq", more: "More explainers" },
  notes: { label: "Notes", href: "/", more: "More from the archive" },
};
const sect = (s) => SECTION[s] || { label: "The Archive", href: "/", more: "More from the archive" };

// "From the glossary" (SEO/AEO pass, UNIT 3, 2026-07-14): 2-3 hand-picked glossary entries per
// United long read, keyed by slug. Only the five United pages carry this block; every other
// content page (finals, explainers) simply has no entry here and renders nothing extra.
// Picks are read-specific, not the same three everywhere:
//   treble-1999            the '99 side's high-tempo, closing-down football; Bayern sitting on
//                          their lead late on; the Sheringham/Solskjaer forward pairing.
//   class-of-92            Ferguson's academy-not-market approach, set against how squads are
//                          more often built today.
//   fergie-greatest-xi     the piece is itself a centre-forward debate and a wide-player debate.
//   united-european-nights Moscow 2008 was won from a low block; marginal calls across fifty
//                          years of European nights are exactly what VAR and offside review now.
//   united-record-signings the whole piece is transfer-market mechanics and whether the fees paid
//                          off, which is what the underlying numbers are for.
const GLOSSARY_LINKS = {
  "treble-1999": ["pressing", "low-block", "false-9"],
  "class-of-92": ["pressing", "loan-with-obligation"],
  "fergie-greatest-xi": ["false-9", "half-space", "inverted-full-back"],
  "united-european-nights": ["low-block", "var", "offside"],
  "united-record-signings": ["loan-with-obligation", "xg", "xa"],
};
const glossaryBySlug = new Map(glossaryEntries.map((e) => [e.slug, e]));
function glossaryBlock(slug) {
  const picks = GLOSSARY_LINKS[slug];
  if (!picks || !picks.length) return "";
  const items = picks
    .map((s) => {
      const e = glossaryBySlug.get(s);
      if (!e) throw new Error(`glossaryBlock: "${slug}" references unknown glossary slug "${s}"`);
      return `<li><a href="/glossary/${e.slug}/">${esc(e.title)}</a></li>`;
    })
    .join("");
  return `
        <nav class="related" aria-label="From the glossary">
          <h2>From the glossary<span class="dot">.</span></h2>
          <ul>${items}</ul>
        </nav>`;
}

const esc = (s = "") => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s = "") => esc(s).replace(/"/g, "&quot;");

/* ---------- CSP (2026-07-13 review, finding #9: "only the homepage has a CSP") ----------
   These pages build their own masthead markup rather than importing scripts/shared/page-shell.mjs's
   masthead() (they predate that shared module and use /content.css, not the page-shell's inline
   brand styles), so the toggle script is defined once here as a single string - used both in the
   rendered page AND as the exact text the CSP hash below is computed from, so the two can never
   drift apart. No PostHog and no Google Fonts CDN on this page family (content.css is a static
   asset with no remote font load), so the CSP only needs to allow this one inline script. */
const MASTHEAD_SCRIPT = `(function () {
      var toggle = document.getElementById('masthead-toggle');
      var panel = document.getElementById('masthead-panel');
      if (!toggle || !panel) return;
      function onKeydown(e) { if (e.key === 'Escape') close(true); }
      function onDocClick(e) {
        if (e.target !== toggle && !toggle.contains(e.target) && !panel.contains(e.target)) close(false);
      }
      function open() {
        panel.hidden = false;
        toggle.setAttribute('aria-expanded', 'true');
        document.addEventListener('keydown', onKeydown);
        document.addEventListener('click', onDocClick, true);
      }
      function close(returnFocus) {
        panel.hidden = true;
        toggle.setAttribute('aria-expanded', 'false');
        document.removeEventListener('keydown', onKeydown);
        document.removeEventListener('click', onDocClick, true);
        if (returnFocus) toggle.focus();
      }
      toggle.addEventListener('click', function () {
        if (panel.hidden) open(); else close(false);
      });
    })();`;
const MASTHEAD_SCRIPT_TAG = `<script>\n    ${MASTHEAD_SCRIPT}\n  </script>`;
const PAGE_CSP = cspMeta({ scripts: [scriptHash(extractScriptBody(MASTHEAD_SCRIPT_TAG))] });

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
// author/publisher reference the site's Organization entity by @id (SEO/AEO pass, UNIT 3,
// 2026-07-14) rather than restating a bare, unlinked Organization object: index.html's own
// Organization JSON-LD carries this same "https://thearchv.ca/#org" @id, so every long read now
// points back at the one entity Google/answer engines already resolve for the site, instead of
// each page describing an org-shaped but disconnected duplicate.
const ORG_REF = { "@id": `${SITE}/#org` };
function schema(p, url) {
  const graph = [
    { "@type": "Article", "headline": p.title, "description": p.description, "datePublished": p.datePublished,
      "author": ORG_REF, "publisher": ORG_REF,
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
  // "From the glossary" (UNIT 3): only the five United long reads have an entry in
  // GLOSSARY_LINKS, so this is "" for every finals/explainers page.
  const glossaryNav = glossaryBlock(p.slug);
  return `<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>${esc(clampTitle([p.title, "The ARCHV"]))}</title>
  <meta name="description" content="${escAttr(clampDescription(p.description))}" />
  <link rel="canonical" href="${url}" />
  <meta name="theme-color" content="#0C2A3E" />
  ${PAGE_CSP}
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
    <a class="wordmark" href="/"><img src="/brand/logo-badge.png" width="34" height="34" alt="The ARCHV" /><span class="wordmark__the">THE</span><span class="wordmark__archv">ARCHV</span></a>
    <div class="masthead__menu">
      <button type="button" class="masthead__toggle" id="masthead-toggle" aria-expanded="false" aria-controls="masthead-panel" aria-label="Menu">
        <span class="masthead__toggle-bar"></span>
        <span class="masthead__toggle-bar"></span>
        <span class="masthead__toggle-bar"></span>
      </button>
      <nav class="masthead__panel" id="masthead-panel" aria-label="Primary" hidden>
        <a class="masthead__panel-link" href="https://instagram.com/thearchvfc" target="_blank" rel="noopener noreferrer">Follow</a>
        <a class="masthead__panel-link masthead__panel-link--gold" href="https://thearchvdispatch.substack.com/subscribe" target="_blank" rel="noopener noreferrer">Subscribe to the Dispatch</a>
        <a class="masthead__panel-link" href="https://www.etsy.com/shop/TheARCHVCA" target="_blank" rel="noopener noreferrer">Shop</a>
        <a class="masthead__panel-link" href="${APP_STORE_URL}">App</a>
      </nav>
    </div>
  </header>
  ${MASTHEAD_SCRIPT_TAG}
  <main class="wrap">
    <article class="article">
      <p class="breadcrumb"><a href="/">The ARCHV</a> / <a href="${escAttr(meta.href)}">${esc(meta.label)}</a></p>
      <p class="article__eyebrow">${esc(p.eyebrow || "")}</p>
      <h1>${esc(p.title)}</h1>
      <p class="article__meta">${[esc(p.score), esc(p.venue), p.eventDate ? new Date(p.eventDate).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : ""].filter(Boolean).join(" · ")}</p>${fig}${qa}
      <div class="article__body">
        ${md(p.body)}
      </div>${shop}${glossaryNav}${rel}
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

/* ---------- sitemap (homepage + all article pages + static indexable pages) ----------
   This is the FIRST script in the build chain to touch dist/sitemap.xml (build-lane-pages.mjs
   and build-article-pages.mjs append to it later), so anything not listed here is silently
   dropped on every build. EXTRA_URLS is the static allowlist of hand-built public/ pages that
   are indexable but have no frontmatter of their own — verified against public/<slug>/index.html's
   own <meta name="robots"> before being added here. Quiz stays OUT: it ships noindex,nofollow
   until FLIP-DAY.md flips it (see public/quiz/index.html). Deduped by loc in case a future page
   ends up in both lists. */
const EXTRA_URLS = [
  { loc: "/about/", changefreq: "monthly", priority: "0.5" },
  { loc: "/corrections/", changefreq: "monthly", priority: "0.4" },
  { loc: "/start", changefreq: "monthly", priority: "0.5" },
  { loc: "/quiz", changefreq: "monthly", priority: "0.5" },
  { loc: "/dispatch", changefreq: "monthly", priority: "0.5" },
  { loc: "/privacy", changefreq: "yearly", priority: "0.2" },
  { loc: "/support", changefreq: "yearly", priority: "0.2" },
  // Evergreen surfaces generated later in the chain (build-glossary-pages.mjs,
  // build-standards-page.mjs). Listed here so they enter the sitemap through this one
  // assembly point; the trailing slash matches each page's own <link rel="canonical">.
  { loc: "/glossary/", changefreq: "monthly", priority: "0.6" },
  { loc: "/glossary/xg/", changefreq: "monthly", priority: "0.5" },
  { loc: "/glossary/false-9/", changefreq: "monthly", priority: "0.5" },
  { loc: "/glossary/offside/", changefreq: "monthly", priority: "0.5" },
  { loc: "/glossary/var/", changefreq: "monthly", priority: "0.5" },
  // Glossary expansion (SEO/AEO pass, 2026-07-14): +6 entries, scripts/glossary-data.mjs.
  { loc: "/glossary/pressing/", changefreq: "monthly", priority: "0.5" },
  { loc: "/glossary/low-block/", changefreq: "monthly", priority: "0.5" },
  { loc: "/glossary/inverted-full-back/", changefreq: "monthly", priority: "0.5" },
  { loc: "/glossary/half-space/", changefreq: "monthly", priority: "0.5" },
  { loc: "/glossary/xa/", changefreq: "monthly", priority: "0.5" },
  { loc: "/glossary/loan-with-obligation/", changefreq: "monthly", priority: "0.5" },
  { loc: "/standards/", changefreq: "yearly", priority: "0.3" },
];
const today = new Date().toISOString().slice(0, 10);
const seen = new Set([`${SITE}/`]);
const urls = [`  <url><loc>${SITE}/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>`];
for (const p of pages) {
  const loc = `${SITE}/${p.section}/${p.slug}/`;
  if (seen.has(loc)) continue;
  seen.add(loc);
  urls.push(`  <url><loc>${loc}</loc><lastmod>${p.datePublished || today}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>`);
}
for (const e of EXTRA_URLS) {
  const loc = `${SITE}${e.loc}`;
  if (seen.has(loc)) continue;
  seen.add(loc);
  urls.push(`  <url><loc>${loc}</loc><lastmod>${today}</lastmod><changefreq>${e.changefreq}</changefreq><priority>${e.priority}</priority></url>`);
}
writeFileSync(join(OUT, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`);

console.log(`build-content: wrote ${n} page(s) + sitemap (${urls.length} urls) to ${OUT}`);
