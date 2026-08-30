/* sitemap.mjs — the one splice into dist/sitemap.xml.

   Five generators carried the same fifteen lines: resolve dist/sitemap.xml, fall back to
   public/sitemap.xml if dist's copy is somehow missing, read it, and
   `xml.replace("</urlset>", rows + "</urlset>")`. build-article-pages, build-lane-pages,
   build-reads-pages, build-section-pages and build-search — five copies of one idea, each with
   its rows hand-built as a template string, so the field order and the two-space indent were a
   convention rather than a rule. build-content.mjs owned a sixth variant that assembles the base
   file from scratch, and it is on this module too, so the row format now has exactly one author.

   WHAT THIS DOES NOT DO: it does not remove the run-order dependence, and nothing in this file
   could. `npm run build` chains ~19 SEPARATE node processes, so there is no shared memory for an
   in-run accumulator to live in. Every caller still reads the file, splices its rows in and
   writes it back, and a generator that runs before build-content.mjs would still find nothing to
   append to. What is centralised here is the splice, the dedupe and the trailing-slash rule.
   The chain order in package.json "build" stays load-bearing.

   THE TRAILING SLASH IS LOAD-BEARING, which is why a loc without one THROWS rather than being
   quietly fixed up. GitHub Pages 301s the slashless form, and a sitemap URL that redirects is a
   Search Console "redirect error": /start sat unindexed for weeks because of exactly that
   (founder's GSC email, fixed 2026-07-28). Fixing it up silently would hide the next caller that
   gets it wrong. The build should stop and name the URL instead.

   USAGE
     import { appendUrls, writeSitemap } from "./shared/sitemap.mjs";
     appendUrls([{ loc: `${SITE}/reads/${slug}/`, lastmod: read.date, changefreq: "monthly", priority: "0.7" }]);
   Zero rows is a no-op. A loc already in the file, or repeated inside one call, is dropped.
   Both functions return the number of rows actually written, which is what the callers log. */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const XML_HEAD = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`;

/* CONTENT_OUT is read per call, not at module load, because every caller resolves its own OUT the
   same way and a generator could in principle set it before calling. */
const outDir = () => process.env.CONTENT_OUT || join(ROOT, "dist");

/** One `  <url>...</url>` line. Field order is loc, lastmod, changefreq, priority — the order all
    five splice sites already emitted, so migrating them changed no bytes. */
function renderRow(row) {
  let out = `  <url><loc>${row.loc}</loc>`;
  if (row.lastmod != null && row.lastmod !== "") out += `<lastmod>${row.lastmod}</lastmod>`;
  if (row.changefreq != null && row.changefreq !== "") out += `<changefreq>${row.changefreq}</changefreq>`;
  if (row.priority != null && row.priority !== "") out += `<priority>${row.priority}</priority>`;
  return `${out}</url>`;
}

/** Validate every row BEFORE the file is touched, so a bad loc never leaves a half-written
    sitemap behind and throws whether or not dist/sitemap.xml happens to exist yet. */
function prepare(rows) {
  const list = Array.isArray(rows) ? rows : [rows];
  return list.map((row, i) => {
    const loc = row && row.loc;
    if (typeof loc !== "string" || !loc) {
      throw new Error(`[sitemap] row ${i} has no loc: ${JSON.stringify(row)}`);
    }
    if (!loc.endsWith("/")) {
      throw new Error(
        `[sitemap] loc without a trailing slash: ${loc}\n` +
          `  Every loc in this sitemap ends in "/". GitHub Pages 301s the slashless form and\n` +
          `  Search Console reads a redirecting sitemap URL as a redirect error: /start sat\n` +
          `  unindexed for weeks because of exactly that (fixed 2026-07-28). Add the slash at\n` +
          `  the caller. This is deliberately not fixed up here.`,
      );
    }
    if (/[<>&"]/.test(loc)) {
      throw new Error(`[sitemap] loc contains a character that would break the XML: ${loc}`);
    }
    return { loc, lastmod: row.lastmod, changefreq: row.changefreq, priority: row.priority };
  });
}

/** Locs already present in an existing sitemap, for the dedupe. */
function locsIn(xml) {
  return new Set(Array.from(xml.matchAll(/<loc>([^<]*)<\/loc>/g), (m) => m[1]));
}

/** Drop anything already in `have`, and anything repeated within this batch, preserving order. */
function freshRows(prepared, have) {
  const seen = new Set();
  const out = [];
  for (const row of prepared) {
    if (have.has(row.loc) || seen.has(row.loc)) continue;
    seen.add(row.loc);
    out.push(renderRow(row));
  }
  return out;
}

/**
 * Append rows to dist/sitemap.xml, falling back to public/sitemap.xml as the source if dist's
 * copy is missing (the write always lands in dist). Returns the number of rows written.
 */
export function appendUrls(rows) {
  const list = Array.isArray(rows) ? rows : rows == null ? [] : [rows];
  if (!list.length) return 0;

  const prepared = prepare(list);

  const out = join(outDir(), "sitemap.xml");
  const fallback = join(ROOT, "public", "sitemap.xml");
  const src = existsSync(out) ? out : existsSync(fallback) ? fallback : null;
  if (!src) return 0;

  const xml = readFileSync(src, "utf8");
  if (!xml.includes("</urlset>")) {
    throw new Error(`[sitemap] ${src} has no closing </urlset>, so there is nothing to splice into.`);
  }

  const fresh = freshRows(prepared, locsIn(xml));
  if (!fresh.length) return 0;

  // Function replacer, not a string: a string replacement would interpret $& and friends inside a loc.
  writeFileSync(out, xml.replace("</urlset>", () => `${fresh.join("\n")}\n</urlset>`));
  return fresh.length;
}

/**
 * Write dist/sitemap.xml from scratch, replacing whatever is there. This is build-content.mjs's
 * job and nothing else's: it is the first script in the chain to touch the file, and every other
 * generator appends. Returns the number of rows written.
 */
export function writeSitemap(rows) {
  const prepared = prepare(Array.isArray(rows) ? rows : rows == null ? [] : [rows]);
  const fresh = freshRows(prepared, new Set());
  const body = fresh.length ? `\n${fresh.join("\n")}\n` : "\n";
  writeFileSync(join(outDir(), "sitemap.xml"), `${XML_HEAD}${body}</urlset>\n`);
  return fresh.length;
}
