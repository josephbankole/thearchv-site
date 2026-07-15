/* scripts/check-img-alt.mjs — SEO/AEO pass (UNIT 4): audits the BUILT dist/ output for <img>
   tags with a missing or empty alt attribute. Run after `npm run build` (dist/ must exist).
   Every <img> on the site should carry a non-empty, descriptive alt: posters get the ARCHV
   illustration credit line, legend headshots get the player's name, lane/article/more-card
   avatars get the headline or a generated "Illustration: <headline>" fallback. Glossary and
   standards pages carry no <img> tags by design (verified below, not just assumed).

   Excludes dist/lab/ from the pass/fail gate: that surface is the noindex,nofollow "Reading
   Room" prototype (public/lab/landing/index.html), not a crawlable page, and its one empty-alt
   image is a deliberate aria-hidden="true" decorative crest — correct accessibility practice,
   just outside the scope of a search/answer-engine audit. It is still scanned and reported
   separately so a change there is never silently invisible.

   Usage: node scripts/check-img-alt.mjs           (report + non-zero exit on any in-scope hit)
          node scripts/check-img-alt.mjs --quiet   (summary line only) */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const quiet = process.argv.includes("--quiet");

function walkHtml(dir) {
  const files = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) files.push(...walkHtml(p));
    else if (e.endsWith(".html")) files.push(p);
  }
  return files;
}

// Matches one <img ...> tag (self-closing or not) and captures its full attribute string.
const IMG_RE = /<img\b([^>]*)>/gi;
const ALT_RE = /\balt\s*=\s*(?:"([^"]*)"|'([^']*)')/i;

function auditFile(path) {
  const html = readFileSync(path, "utf8");
  const hits = [];
  let total = 0;
  for (const m of html.matchAll(IMG_RE)) {
    total++;
    const attrs = m[1];
    const altMatch = attrs.match(ALT_RE);
    const alt = altMatch ? altMatch[1] ?? altMatch[2] ?? "" : null;
    if (alt === null) hits.push({ tag: m[0], reason: "missing alt attribute" });
    else if (alt.trim() === "") hits.push({ tag: m[0], reason: "empty alt attribute" });
  }
  return { total, hits };
}

if (!statSync(DIST, { throwIfNoEntry: false })) {
  console.error(`[check-img-alt] FAIL: ${DIST} does not exist. Run npm run build first.`);
  process.exit(1);
}

const allFiles = walkHtml(DIST);
const labFiles = allFiles.filter((f) => relative(DIST, f).startsWith(`lab${"/"}`));
const scopedFiles = allFiles.filter((f) => !labFiles.includes(f));

function report(label, files) {
  let totalImgs = 0;
  let totalHits = 0;
  const perFile = [];
  for (const f of files) {
    const { total, hits } = auditFile(f);
    totalImgs += total;
    if (hits.length) {
      totalHits += hits.length;
      perFile.push({ file: relative(ROOT, f), hits });
    }
  }
  if (!quiet) {
    console.log(`\n[check-img-alt] ${label}: ${files.length} page(s), ${totalImgs} <img> tag(s), ${totalHits} with missing/empty alt`);
    for (const { file, hits } of perFile) {
      for (const h of hits) {
        console.log(`  ${file} — ${h.reason}: ${h.tag.slice(0, 120)}`);
      }
    }
  }
  return { totalImgs, totalHits, perFile };
}

const scoped = report("in-scope (excludes /lab/)", scopedFiles);
const lab = report("excluded: /lab/ (noindex prototype)", labFiles);

console.log(
  `\n[check-img-alt] SUMMARY: ${scoped.totalImgs} in-scope <img> tag(s) across ${scopedFiles.length} page(s), ` +
    `${scoped.totalHits} missing/empty alt. /lab/ (excluded, noindex): ${lab.totalImgs} <img> tag(s), ${lab.totalHits} missing/empty alt.`
);

if (scoped.totalHits > 0) {
  console.error(`[check-img-alt] FAIL: ${scoped.totalHits} in-scope <img> tag(s) with a missing or empty alt.`);
  process.exit(1);
}
console.log(`[check-img-alt] OK: every in-scope <img> has a non-empty alt.`);
