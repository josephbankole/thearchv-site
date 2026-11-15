/* check-retro-noindex.mjs: stops the build when scripts/data/retro-noindex.json is present but
   broken (site-build-11, 2026-11-15).

   The generators that read the list (build-article-pages, build-duel-pages, build-rss,
   build-news-sitemap, through scripts/shared/retro-noindex.mjs) never fail on it, by design (plan
   section 6). That leniency has one bad case: a syntax slip in the weekly batch edit makes the file
   unparseable, the shared module lists nothing, and every page already sent noindex,follow goes
   back to index,follow on the next deploy with only a warn line in the log. This check runs at the
   head of the build chain, before anything renders, and refuses that file. A missing file stays a
   warning: it means no staged list, not a broken one. */
import { retroNoindexFileProblems } from "./shared/retro-noindex.mjs";

const { missing, problems } = retroNoindexFileProblems();
if (missing) {
  console.warn("[check-retro-noindex] WARN scripts/data/retro-noindex.json is missing; no page is on the staged noindex list");
  process.exit(0);
}
if (problems.length) {
  for (const p of problems) console.error(`[check-retro-noindex] FAIL: scripts/data/retro-noindex.json ${p}`);
  console.error("[check-retro-noindex] Fix the file before building: the pages on the list would otherwise go back to index,follow.");
  process.exit(1);
}
console.log("[check-retro-noindex] OK: scripts/data/retro-noindex.json parses and every path is a site path");
