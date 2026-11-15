/* noindex-list.mjs: which built pages ask search engines not to index them (gap8-8, 2026-11-15).

   Several generators keep a noindex,follow page in sitemap.xml on purpose (build-answer-pages,
   build-article-pages and build-duel-pages say why in their headers), so the sitemap alone cannot
   tell a page that wants indexing from one that does not. scripts/build-noindex-list.mjs runs this
   over dist/ once every page is written and publishes the answer as dist/noindex-urls.json, which
   scripts/ping-indexnow.mjs reads so a bounded run does not spend its slots on those pages.

   It reads the built pages rather than asking each generator to report, because the build is a
   chain of separate node processes with no shared memory, and the robots meta in the written HTML
   is the one thing every generator and every hand-built public/ page already agrees on. */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

/** True when an HTML document's robots meta carries noindex. No robots meta means indexable. */
export function isNoindexHtml(html) {
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    if (!/\bname\s*=\s*["']robots["']/i.test(tag)) continue;
    const content = tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i);
    if (content && /(^|[\s,])noindex([\s,]|$)/i.test(content[1])) return true;
  }
  return false;
}

/** The site path a built file is served at: dist/x/index.html is /x/, dist/404.html is /404.html. */
export function sitePath(distDir, file) {
  const rel = relative(distDir, file).split(sep).join("/");
  if (rel === "index.html") return "/";
  if (rel.endsWith("/index.html")) return `/${rel.slice(0, -"index.html".length)}`;
  return `/${rel}`;
}

/** Every site path under distDir whose built HTML is noindex, sorted. */
export function noindexPaths(distDir) {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith(".html") && isNoindexHtml(readFileSync(full, "utf8"))) out.push(sitePath(distDir, full));
    }
  };
  walk(distDir);
  return out.sort();
}
