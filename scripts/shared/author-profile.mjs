/* scripts/shared/author-profile.mjs — Joseph Bankole's profile: the bio, the portrait rule, the
   full Person node and the derived "latest from the desk" lists.

   Moved out of the retired scripts/build-author-page.mjs on 2026-10-19, when the author page
   merged into /about/#joseph-bankole (founder: one About page holding how we verify, standards,
   corrections, privacy, contact and Joseph Bankole). scripts/build-about-page.mjs renders it, and
   the old /authors/joseph-bankole/ URL is a redirect stub that carries #recent-work, #long-reads
   and #explainers across to the same ids on /about/.

   The lists are DERIVED from the same day data the article pages are built from, and from
   content/, so neither can rot into a dead link when the desks move on. Nothing is hand-listed.
   All inputs are inside the repo (trap 0). */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDayData } from "./day-data.mjs";
import {
  esc, escAttr, longDate, byDateDesc, cardArt, ORG_REF, PERSON_REF, AUTHOR_NAME, AUTHOR_SAMEAS,
  LANE_META, SPORTS, QUESTION_LANE_META,
} from "./page-shell.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CONTENT = join(ROOT, "content");

/* ---------- the bio ----------
   British English, no em dashes, run through the humanizer with
   personal-brand/archv-house-voice-profile.md as the voice sample (dials B6 C2 E7: a
   credibility page, so accuracy governs and the voice lives in the open and the kicker).

   The positioning is deliberate and was corrected on one point before it was written: an
   earlier draft claimed "a human checkpoint before anything publishes", which stopped being
   true when canon D-2026-08-04h made the weekly match job publish on a schedule. What is
   written below is what actually exists: the routine lane publishes under automated
   verification gates, the flagship lane carries a human signature. Do not soften this back
   into a blanket-checkpoint claim.
   Rewritten 2026-09-27 (search plan week 2, Decision 1): the old copy said the house voice was
   "applied by hand", that every fact had two sources (NFL and F1 ship on the official record,
   D-2026-08-28b), that a thin week ended with fewer entries, and that the archive held nine
   finals (content/finals/ holds 18). The desk pages now carry The ARCHV Desk byline, and the
   long reads are not claimed for him until he names the ones he wrote.
   2026-10-20: "the standards page" became "the standards" in paragraph 3, the only change, since
   the standards are now a section of the same About page the bio sits on. */
export const BIO = [
  `Joseph Bankole founded The ARCHV and runs it. He sets its rules and is the person answerable for what it publishes.`,
  `Most of what you read here is built by a system rather than typed out one entry at a time. The routine desks publish on a schedule. Automated writing tools draft each entry and apply the house voice, and nothing reaches the page without clearing the same checks: a named source on every claim of fact (two independent ones, or the league's own record for NFL and Formula 1), every number re-read at the moment of publishing rather than the moment of drafting, and a dated freshness stamp. An entry that fails verification does not run. No person reads those entries before they go up, so they carry The ARCHV Desk byline and not his. Automating the routine work means the standard stops depending on how tired anyone is on a Tuesday.`,
  `His name goes on the rules: the standards, the corrections, and every call about what the archive will and will not carry. Someone has to be answerable for those.`,
  `The subject is football history, mostly: transfers while the window is open, international football while it is on, the club season week by week, and an archive of 18 finals, ten of them World Cup finals from Mexico 1970 to MetLife 2026. The site also keeps question pages on the NFL, Formula 1, tennis, golf and basketball. No photographs, no club crests, no kit designs, no competition marks. Every face on the site is original illustration published as editorial commentary. That rule does not bend.`,
];

// The schema's Person.description. Humanizer-passed with the bio; keep it verbatim.
export const BIO_SUMMARY = `Founder of The ARCHV. He sets the rules its automated desks publish under and answers for what the site carries.`;

export const AUTHOR_ROLE = "Founder and editor, The ARCHV";

/* ---------- the full Person node ----------
   One Person id sitewide (search plan 3.6): PERSON_ID in page-shell.mjs, which keeps the legacy
   /authors/joseph-bankole/#person IRI so the entity does not churn. sameAs is the profiles off
   this site, josephbankole.ca and LinkedIn. */
export const PERSON_NODE = {
  ...PERSON_REF,
  sameAs: AUTHOR_SAMEAS,
  description: BIO_SUMMARY,
  jobTitle: "Founder and Editor",
  knowsAbout: ["Football history", "Association football", "Transfer reporting", "World Cup", "Sports journalism"],
  worksFor: ORG_REF,
};

/* ---------- portrait ----------
   No photograph of the founder exists anywhere in this repo, and the site's own imagery rule
   forbids inventing a face, so the profile does NOT ship a fabricated portrait. The brand crest
   stands in until a real headshot is committed to public/. If one lands, drop it at
   public/heads/joseph-bankole.webp and this picks it up with no other change. */
const HEADSHOT_CANDIDATES = [
  { src: "/heads/joseph-bankole.webp", alt: `${AUTHOR_NAME}, founder and editor of The ARCHV`, real: true },
];
export const portrait =
  HEADSHOT_CANDIDATES.find((c) => existsSync(join(ROOT, "public", c.src.replace(/^\//, "")))) ||
  { src: "/brand/crest-badge-400.webp", alt: "The ARCHV monogram", real: false };

/* ---------- long reads, derived from content/ ----------
   Same frontmatter shape build-content.mjs parses (title/slug/section at the top of each .md).
   Reading the directory rather than hand-listing means a new long read appears on its next
   build, and a retired one disappears instead of 404ing. */
function frontmatterField(raw, field) {
  const m = raw.match(new RegExp(`^${field}:\\s*"([^"]*)"`, "m"));
  return m ? m[1] : null;
}
function longReads(section) {
  const dir = join(CONTENT, section);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const raw = readFileSync(join(dir, f), "utf8");
      const title = frontmatterField(raw, "title");
      const slug = frontmatterField(raw, "slug") || f.replace(/\.md$/, "");
      const datePublished = frontmatterField(raw, "datePublished") || "";
      return title ? { title, href: `/${section}/${slug}/`, datePublished } : null;
    })
    .filter(Boolean)
    .sort((a, b) => (a.datePublished < b.datePublished ? 1 : a.datePublished > b.datePublished ? -1 : 0));
}

export const RECENT_CAP = 6;

/** The derived lists: the newest desk entries (football and the other sports), the United long
    reads and the four newest explainers. */
export async function deskWork() {
  const { transferDays, worldCupDays, leaguesDays, sportDays: SPORT_DAYS } = await loadDayData();
  // Every daily entry, flattened to { date, headline, dek, href, laneLabel, image }. Football keeps
  // /desk/<lane>/<date>/; the other sports use /<urlBase>/<lane>/<date>/. Both URL shapes are the
  // ones build-article-pages.mjs actually emits, so no link here can 404.
  const entries = [];
  for (const [laneKey, days] of [
    ["transfer", transferDays],
    ["world-cup", worldCupDays],
    ["leagues", leaguesDays],
  ]) {
    for (const e of days) entries.push({ ...e, href: `/desk/${laneKey}/${e.date}/`, laneLabel: LANE_META[laneKey].label });
  }
  for (const sport of SPORTS) {
    if (sport.key === "football") continue;
    for (const laneKey of sport.lanes) {
      const laneLabel = `${sport.label} ${QUESTION_LANE_META[laneKey]?.label ?? laneKey}`;
      for (const e of SPORT_DAYS[sport.key] || []) {
        entries.push({ ...e, href: `/${sport.urlBase}/${laneKey}/${e.date}/`, laneLabel });
      }
    }
  }
  entries.sort(byDateDesc);
  return {
    recent: entries.slice(0, RECENT_CAP),
    united: longReads("united"),
    explainers: longReads("explainers").slice(0, 4),
  };
}

/* ---------- markup ---------- */
export function recentCard(e) {
  const avatar = cardArt(e);
  return `<li><a class="lane-card" href="${escAttr(e.href)}">${avatar}<span class="lane-card__body"><span class="lane-card__kicker">${esc(e.laneLabel)} · ${esc(longDate(e.date))}</span><span class="lane-card__headline">${esc(e.headline)}</span><span class="lane-card__dek">${esc(e.dek)}</span></span></a></li>`;
}

export function linkList(items, indent = "        ") {
  return items.map((i) => `<li><a href="${escAttr(i.href)}">${esc(i.title)}</a></li>`).join(`\n${indent}`);
}
