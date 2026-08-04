/* verify-csp-pages.mjs — proves every generated/static page family's CSP meta actually allows
   its own inline scripts: for each sample page, extract every plain <script>...</script> body
   (ignoring type="application/ld+json", which CSP script-src does not gate), hash it the same
   way scripts/shared/page-shell.mjs's cspMeta() does, and confirm that hash appears in the
   page's own <meta http-equiv="Content-Security-Policy"> tag. Run after `npm run build`
   (dist/ must exist). Exits non-zero on any mismatch or missing CSP meta. */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");

const scriptHash = (body) => `sha256-${createHash("sha256").update(body, "utf8").digest("base64")}`;

function inlineScriptBodies(rawHtml) {
  // Strip HTML comments first: an explanatory comment that happens to mention "<script>" and
  // "</script>" (e.g. this file's own CSP notes) would otherwise regex-match as a fake script.
  const html = rawHtml.replace(/<!--[\s\S]*?-->/g, "");
  // Every <script ...>...</script> whose opening tag has no type= attribute, or a type= that
  // isn't application/ld+json - i.e. every script CSP's script-src actually governs. Also skips
  // any <script src="..."> (external, not inline) since those aren't hash-gated either.
  const bodies = [];
  for (const m of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
    const attrs = m[1];
    if (/\bsrc\s*=/.test(attrs)) continue;
    if (/type\s*=\s*["']application\/ld\+json["']/.test(attrs)) continue;
    bodies.push(m[2]);
  }
  return bodies;
}

function cspScriptHashes(html) {
  const m = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)"/);
  if (!m) return null;
  return new Set([...m[1].matchAll(/'(sha256-[^']+)'/g)].map((x) => x[1]));
}

function check(label, filePath) {
  if (!existsSync(filePath)) {
    console.error(`[verify-csp-pages] FAIL: ${label} — file not found: ${filePath}`);
    return false;
  }
  const html = readFileSync(filePath, "utf8");
  const allowed = cspScriptHashes(html);
  if (!allowed) {
    console.error(`[verify-csp-pages] FAIL: ${label} — no CSP meta tag found.`);
    return false;
  }
  const bodies = inlineScriptBodies(html);
  let ok = true;
  for (const body of bodies) {
    const hash = scriptHash(body);
    if (!allowed.has(hash)) {
      ok = false;
      console.error(
        `[verify-csp-pages] FAIL: ${label} — inline script hash ${hash} not in CSP script-src.\n` +
        `  script starts: ${JSON.stringify(body.trim().slice(0, 60))}`
      );
    }
  }
  if (ok) console.log(`[verify-csp-pages] OK: ${label} (${bodies.length} inline script(s), all hashes match)`);
  return ok;
}

// One representative file per page family, plus every article-page date (the share-row script's
// hash is per-page, so this is the case most likely to break silently).
const targets = [
  ["homepage", join(DIST, "index.html")],
  ["static: /start/", join(DIST, "start", "index.html")],
  ["static: /dispatch/", join(DIST, "dispatch", "index.html")],
  ["static: /quiz/", join(DIST, "quiz", "index.html")],
  // Paid-traffic landing page for the Meta ad (2026-07-21). Self-contained like /start, with
  // its own PostHog + click-tracking inline scripts, so its CSP hashes need the same guard.
  ["static: /app/", join(DIST, "app", "index.html")],
  ["static: /about/", join(DIST, "about", "index.html")],
  ["static: /corrections/", join(DIST, "corrections", "index.html")],
  ["lane: /desk/transfer/", join(DIST, "desk", "transfer", "index.html")],
  ["lane: /desk/world-cup/", join(DIST, "desk", "world-cup", "index.html")],
  ["lane: /desk/leagues/", join(DIST, "desk", "leagues", "index.html")],
  // Evergreen surfaces (build-glossary-pages.mjs, build-standards-page.mjs): both carry the
  // shared masthead + PostHog inline scripts, so their static hashes must be in each page's CSP.
  ["glossary hub: /glossary/", join(DIST, "glossary", "index.html")],
  ["glossary: /glossary/xg/", join(DIST, "glossary", "xg", "index.html")],
  // Glossary expansion (SEO/AEO pass, 2026-07-14): one of the six new entries, same page family
  // and shared masthead/PostHog CSP as every other glossary page — added so a slug-set change
  // to scripts/glossary-data.mjs is covered by this check, not just the four original terms.
  ["glossary: /glossary/pressing/", join(DIST, "glossary", "pressing", "index.html")],
  ["standards: /standards/", join(DIST, "standards", "index.html")],
  // Author page (build-author-page.mjs, 2026-08-04). Carries the shared masthead + PostHog
  // inline scripts and no per-page script, so its two hashes must both be in its own CSP.
  ["author: /authors/joseph-bankole/", join(DIST, "authors", "joseph-bankole", "index.html")],
  // Multi-sport page family (build-sport-pages.mjs + build-lane-pages.mjs, 2026-07-22): a sport
  // section page and a sport lane front both carry the shared masthead + PostHog inline scripts,
  // so their static hashes must be in each page's CSP. The /football/ alias carries a CSP meta but
  // no inline script, so it verifies as zero-script clean (proves the meta is present and correct).
  ["sport section: /nfl/", join(DIST, "nfl", "index.html")],
  ["sport lane: /nfl/questions/", join(DIST, "nfl", "questions", "index.html")],
  ["football alias: /football/", join(DIST, "football", "index.html")],
  // Player duels (build-duel-pages.mjs) and the daily archive game (build-archive-game.mjs).
  // Both carry a per-page inline script on top of the shared masthead and PostHog pair: the duel
  // share row embeds its own URL and the game embeds the whole puzzle set, so neither hash is
  // constant across the family. Every pair page is checked in the loop further down.
  ["duel index: /duel/", join(DIST, "duel", "index.html")],
  ["archive game: /guess/", join(DIST, "guess", "index.html")],
];

// Every duel pair page. The share-row script carries that page's own URL, so this is the same
// per-page-hash failure mode the article loop below guards against.
const duelDir = join(DIST, "duel");
if (existsSync(duelDir)) {
  for (const entry of readdirSync(duelDir)) {
    if (!entry.includes("-v-")) continue;
    targets.push([`duel: /duel/${entry}/`, join(duelDir, entry, "index.html")]);
  }
}

const contentDir = readdirSync(DIST).includes("finals") ? join(DIST, "finals") : null;
if (contentDir) {
  const first = readdirSync(contentDir)[0];
  if (first) targets.push(["content: /finals/" + first + "/", join(contentDir, first, "index.html")]);
}

const legacyDeskDir = join(DIST, "desk");
if (existsSync(legacyDeskDir)) {
  const dateDirs = readdirSync(legacyDeskDir).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  if (dateDirs[0]) targets.push(["legacy day: /desk/" + dateDirs[0] + "/", join(legacyDeskDir, dateDirs[0], "index.html")]);
}

// Every article page - this is where a per-page hash bug would actually show up.
for (const lane of ["transfer", "world-cup", "leagues"]) {
  const laneDir = join(DIST, "desk", lane);
  if (!existsSync(laneDir)) continue;
  for (const entry of readdirSync(laneDir)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry)) continue;
    targets.push([`article: /desk/${lane}/${entry}/`, join(laneDir, entry, "index.html")]);
  }
}

// The Answer Desk article pages, /<sport>/questions/<date>/. Same generator and the same per-page
// share/ladder hashes as the football articles above, so the same failure mode applies. Added
// 2026-07-28 with the FAQPage + question-H2 change: locally these directories are usually empty,
// because src/data/<sport>Days.ts is engine-owned and stale in any checkout (see CLAUDE.md), so
// this loop is a no-op here and a real check wherever the current data is present.
for (const sport of ["nfl", "f1", "tennis", "golf"]) {
  const laneDir = join(DIST, sport, "questions");
  if (!existsSync(laneDir)) continue;
  for (const entry of readdirSync(laneDir)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry)) continue;
    targets.push([`answer: /${sport}/questions/${entry}/`, join(laneDir, entry, "index.html")]);
  }
}

let allOk = true;
for (const [label, filePath] of targets) {
  if (!check(label, filePath)) allOk = false;
}

if (!allOk) {
  console.error(`\n[verify-csp-pages] FAILED — one or more pages have an inline script not covered by their own CSP.`);
  process.exit(1);
}
console.log(`\n[verify-csp-pages] All ${targets.length} checked page(s) OK.`);
