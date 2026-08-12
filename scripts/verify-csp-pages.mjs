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
// Lane and sport coverage is DERIVED from the registries, never hand-listed: this is the one
// script whose entire job is exhaustiveness, and a literal list here meant a new lane or sport
// shipped pages this file never opened while still printing "All N checked page(s) OK"
// (2026-08-12 review). A new LANE_META key or SPORTS row is now covered automatically.
import { LANE_META, SPORTS } from "./shared/page-shell.mjs";

const FOOTBALL_LANES = Object.keys(LANE_META); // transfer, world-cup, leagues
const NEW_SPORTS = SPORTS.filter((s) => s.key !== "football");

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

// Hashes come from script-src and from nowhere else. Scanning the whole policy means a hash listed
// only in style-src would satisfy a check about scripts, which is not the guarantee this file
// claims to give. The policy is split on ";" and the script-src directive read by name, so the
// check no longer depends on cspMeta() happening to emit script-src before style-src.
//
// NOTE, deliberately not asserting the absence of 'unsafe-inline': style-src legitimately carries
// it today (page-shell.mjs:cspMeta, for the inline style="" attributes), so the assertion belongs
// scoped to script-src or not at all, and adding it was out of scope for this pass.
function cspScriptHashes(html) {
  const m = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)"/);
  if (!m) return null;
  const scriptSrc = m[1]
    .split(";")
    .map((d) => d.trim())
    .find((d) => /^script-src(\s|$)/.test(d));
  if (!scriptSrc) return new Set();
  return new Set([...scriptSrc.matchAll(/'(sha256-[^']+)'/g)].map((x) => x[1]));
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
  ...FOOTBALL_LANES.map((lane) => [`lane: /desk/${lane}/`, join(DIST, "desk", lane, "index.html")]),
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
  ...NEW_SPORTS.flatMap((s) => [
    [`sport section: /${s.urlBase}/`, join(DIST, s.urlBase, "index.html")],
    [`sport lane: /${s.urlBase}/${s.lanes[0]}/`, join(DIST, s.urlBase, s.lanes[0], "index.html")],
  ]),
  ["football alias: /football/", join(DIST, "football", "index.html")],
  // Player duels (build-duel-pages.mjs) and the daily archive game (build-archive-game.mjs).
  // Both carry a per-page inline script on top of the shared masthead and PostHog pair: the duel
  // share row embeds its own URL and the game embeds the whole puzzle set, so neither hash is
  // constant across the family. Every pair page is checked in the loop further down.
  ["duel index: /duel/", join(DIST, "duel", "index.html")],
  ["archive game: /guess/", join(DIST, "guess", "index.html")],
  // Section fronts and the branded 404 (build-section-pages.mjs, 2026-08-09) and the long-read
  // family (build-reads-pages.mjs, same pass). All carry the shared masthead + PostHog inline
  // scripts and no per-page script, so both hashes must be in each page's own CSP. The 404 is
  // included deliberately: it is served at arbitrary paths, so a CSP break there is a CSP break
  // everywhere a link rots.
  ["404: /404.html", join(DIST, "404.html")],
  ["section: /finals/", join(DIST, "finals", "index.html")],
  ["section: /united/", join(DIST, "united", "index.html")],
  ["section: /explainers/", join(DIST, "explainers", "index.html")],
  ["section: /notes/", join(DIST, "notes", "index.html")],
  ["section: /legends/", join(DIST, "legends", "index.html")],
  ["reads front: /reads/", join(DIST, "reads", "index.html")],
  // Site search (build-search.mjs, 2026-08-09). It carries the shared masthead + PostHog inline
  // scripts and NO per-page inline script: the client is a file under script-src 'self'. That is
  // exactly the claim worth checking, because the day someone inlines the search client to save a
  // request, this is what fails.
  ["search: /search/", join(DIST, "search", "index.html")],
];

// Every long-read page. Slugs are derived from the essay titles (src/data/readSlug.ts), so this
// enumerates rather than hand-lists them and a new essay is covered automatically.
const readsDir = join(DIST, "reads");
if (existsSync(readsDir)) {
  for (const entry of readdirSync(readsDir)) {
    const file = join(readsDir, entry, "index.html");
    if (existsSync(file)) targets.push([`read: /reads/${entry}/`, file]);
  }
}

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
for (const lane of FOOTBALL_LANES) {
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
for (const sport of NEW_SPORTS) {
  const laneDir = join(DIST, sport.urlBase, sport.lanes[0]);
  if (!existsSync(laneDir)) continue;
  for (const entry of readdirSync(laneDir)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry)) continue;
    targets.push([`answer: /${sport.urlBase}/${sport.lanes[0]}/${entry}/`, join(laneDir, entry, "index.html")]);
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
