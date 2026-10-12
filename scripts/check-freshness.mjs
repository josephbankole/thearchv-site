/* check-freshness.mjs — search plan G9 (2026-10-11): list every indexable page that is overdue.

   A page is overdue when its `reviewBy` date has passed, or when its copy still promises a later
   update ("to be updated", "re-confirm", "after 12 August", "whoever wins"). Those are pages that
   told a reader something would change and were never revisited.

   Covered: every dated desk page (src/data/*Days.ts), every glossary entry
   (scripts/glossary-data.mjs) and every markdown page under content/ (explainers, finals, notes,
   United). The rule is src/lib/entryGates.ts freshnessReasons(), the one copy.

   WARN-ONLY. This prints the list and writes dist/freshness-report.json. It NEVER fails the build
   (plan §6: public/media rides the same deploy). The noindex half of G9 is applied to dated pages
   by build-article-pages.mjs through indexDecision(), and only once GATES_ENFORCE is on; glossary
   and content pages are listed and never noindexed by this gate, because the top of the glossary
   and the explainers are the protected core (plan 1.1), correction-only until 21 December. */
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { SPORTS } from "./shared/page-shell.mjs";
import { loadDayData } from "./shared/day-data.mjs";
import { torontoIso } from "./shared/entry-dates.mjs";
import { glossaryEntries } from "./glossary-data.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = process.env.CONTENT_OUT || join(ROOT, "dist");
const TAG = "[check-freshness]";
const TODAY = torontoIso().slice(0, 10);

try {
  const { transferDays, worldCupDays, leaguesDays, sportDays, freshnessReasons, indexDecision, GATES_ENFORCE } =
    await loadDayData({ extras: ["entryGates"] });

  const lanes = [
    { base: "/desk/transfer/", days: transferDays },
    { base: "/desk/world-cup/", days: worldCupDays },
    { base: "/desk/leagues/", days: leaguesDays },
  ];
  for (const sport of SPORTS) {
    if (sport.key === "football") continue;
    for (const laneKey of sport.lanes) lanes.push({ base: `/${sport.urlBase}/${laneKey}/`, days: sportDays[sport.key] || [] });
  }

  const overdue = [];
  for (const { base, days } of lanes) {
    for (const e of days) {
      // Only pages that are indexable today are in scope: a page already noindex is not at risk.
      if (e.index === "noindex") continue;
      const reasons = freshnessReasons({ reviewBy: e.reviewBy, text: `${e.headline} ${e.dek} ${e.body}` }, TODAY);
      if (reasons.length) overdue.push({ url: `${base}${e.date}/`, family: "dated", reasons, noindex: !indexDecision(e, TODAY).index });
    }
  }

  const textOf = (o) => Object.values(o).filter((v) => typeof v === "string").join(" ");
  for (const g of glossaryEntries) {
    const reasons = freshnessReasons({ reviewBy: g.reviewBy, text: textOf(g) }, TODAY);
    if (reasons.length) overdue.push({ url: `/glossary/${g.slug}/`, family: "glossary", reasons, noindex: false });
  }

  const contentDir = join(ROOT, "content");
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? walk(join(dir, d.name)) : d.name.endsWith(".md") ? [join(dir, d.name)] : []);
  if (existsSync(contentDir)) {
    for (const file of walk(contentDir)) {
      const rel = relative(contentDir, file);
      if (!rel.includes("/")) continue; // BACKLOG.md and other notes at the top are not pages
      const src = readFileSync(file, "utf8");
      const reviewBy = (src.match(/^reviewBy:\s*["']?(\d{4}-\d{2}-\d{2})/m) || [])[1];
      const reasons = freshnessReasons({ reviewBy, text: src }, TODAY);
      if (reasons.length) overdue.push({ url: `content/${rel}`, family: "content", reasons, noindex: false });
    }
  }

  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, "freshness-report.json"), JSON.stringify({ checked: TODAY, enforce: GATES_ENFORCE, overdue }, null, 2) + "\n");
  if (!overdue.length) {
    console.log(`${TAG} 0 overdue pages (warn-only: ${!GATES_ENFORCE})`);
  } else {
    console.warn(`${TAG} WARN ${overdue.length} overdue page(s) (warn-only: ${!GATES_ENFORCE}); listed in dist/freshness-report.json`);
    for (const o of overdue.slice(0, 30)) console.warn(`  ${o.url}${o.noindex ? " [noindex]" : ""}: ${o.reasons.join("; ")}`);
    if (overdue.length > 30) console.warn(`  ... and ${overdue.length - 30} more`);
  }
} catch (err) {
  // A freshness check that cannot run is reported and the build goes on.
  console.warn(`${TAG} WARN could not run: ${err && err.message ? err.message : err}`);
}
