/* scripts/shared/corrections-log.mjs — the corrections log, gathered from the pages themselves
   (search plan G12, 2026-10-04). Moved out of the retired scripts/build-corrections-log.mjs on
   2026-10-19, when /corrections/ merged into /about/ (founder: one About page holding how we
   verify, standards, corrections, privacy, contact and Joseph Bankole). The log now renders at
   build time inside /about/#log, from scripts/build-about-page.mjs, instead of being spliced into
   a hand-built page between two comment markers after Vite had copied it.

   WHY. /about/ promises that a correction is added to the page, dated, and that the original
   wording stays readable. The log was once hand-written HTML: it listed the ten notes of
   22 September 2026 and none of the earlier ones, and nothing kept it in step with the pages. It
   is rebuilt on every build from three places:
     - the `corrections` records on the dated desk entries (src/data/*Days.ts), which the commit
       script writes when it amends an entry: when the note went up, what the page said (`was`),
       what is right (`now`) and where it was checked (`source`);
     - scripts/data/corrections-evergreen.json, the same records for the explainers, the finals
       and United pages and the glossary;
     - every dated note paragraph ("Correction, ...:", "Update, ...:", "Revised, ...:") on a desk
       entry or a content page that no record covers. An update or a revision adds to a page
       without saying it was wrong, so it is listed with its note quoted as it stands.

   Pure build-time and repo-local (trap 0): loadDayData reads src/data, the rest is under
   scripts/data and content/. Warn-only (plan §2 Step 0): a correction paragraph with no was/now
   record is listed verbatim and named in a warning. The build never fails on a data condition. */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SPORTS, esc, escAttr, longDate } from "./page-shell.mjs";
import { loadDayData } from "./day-data.mjs";
import { loadContentPages } from "./content-pages.mjs";
import { torontoIso, fallbackPublished } from "./entry-dates.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const NOTE = /^(Correction|Update|Revised|Revision), (\d{1,2}) ([A-Za-z]+)(?: (\d{4}))?: ?/;
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

/** The dated note paragraphs in a body, with the date each one carries. */
function notesIn(body, fallbackYear) {
  return String(body ?? "")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .map((p) => {
      const m = NOTE.exec(p);
      if (!m) return null;
      const month = MONTHS[m[3].slice(0, 3).toLowerCase()];
      if (!month) return null;
      const day = `${m[4] || fallbackYear}-${String(month).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
      return { kind: m[1] === "Revision" ? "revised" : m[1].toLowerCase(), day, text: p };
    })
    .filter(Boolean);
}

const covers = (records, kind) => records.some((r) => String(r.kind).includes(kind === "revised" ? "revis" : kind));

/** Every log row, newest first, plus the paths of correction notes that have no was/now record. */
export async function correctionsRows() {
  /* ---------- the desk entries, under the URL each one is published at ---------- */
  const { transferDays, worldCupDays, leaguesDays, sportDays } = await loadDayData();
  const lanes = [
    { base: "/desk/transfer/", label: "Transfer Desk", days: transferDays },
    { base: "/desk/world-cup/", label: "World Cup desk", days: worldCupDays },
    { base: "/desk/leagues/", label: "Leagues desk", days: leaguesDays },
  ];
  for (const sport of SPORTS) {
    if (sport.key === "football") continue;
    for (const laneKey of sport.lanes) lanes.push({ base: `/${sport.urlBase}/${laneKey}/`, label: sport.label, days: sportDays[sport.key] || [] });
  }

  const rows = [];
  const unrecorded = [];

  for (const lane of lanes) {
    for (const e of lane.days) {
      const path = `${lane.base}${e.date}/`;
      const records = Array.isArray(e.corrections) ? e.corrections : [];
      for (const r of records) rows.push({ ...r, path, title: e.headline });
      for (const n of notesIn(e.body, e.date.slice(0, 4))) {
        if (covers(records, n.kind)) continue;
        rows.push({ at: fallbackPublished(n.day), kind: n.kind, path, title: e.headline, note: n.text });
        if (n.kind === "correction") unrecorded.push(path);
      }
    }
  }

  /* ---------- the evergreen pages ---------- */
  const evergreen = JSON.parse(readFileSync(join(ROOT, "scripts", "data", "corrections-evergreen.json"), "utf8")).records;
  for (const r of evergreen) rows.push(r);
  for (const p of loadContentPages()) {
    const path = `/${p.section}/${p.slug}/`;
    const records = evergreen.filter((r) => r.path === path);
    for (const n of notesIn(p.body, String(p.datePublished || "").slice(0, 4))) {
      if (covers(records, n.kind)) continue;
      rows.push({ at: fallbackPublished(n.day), kind: n.kind, path, title: p.title, note: n.text });
      if (n.kind === "correction") unrecorded.push(path);
    }
  }

  rows.sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || (a.path < b.path ? -1 : 1));
  return { rows, unrecorded };
}

/* ---------- render, in the markup the hand-written log used ---------- */
const kindLabel = (k) => { const s = String(k || "note"); return s.charAt(0).toUpperCase() + s.slice(1); };
/** A row's day as YYYY-MM-DD, in Toronto time when the row carries a full timestamp. */
export const correctionDay = (iso) => (/T/.test(iso) ? torontoIso(new Date(iso)).slice(0, 10) : String(iso).slice(0, 10));
const sourceLine = (s) => String(s || "").trim().replace(/\.$/, "");

/** One <li> of the log. `indent` is the leading whitespace of the <li> line. */
export function correctionItem(r, indent = "      ") {
  const inner = `${indent}  `;
  const meta = `<p class="meta">${esc(longDate(correctionDay(r.at)))} · ${esc(kindLabel(r.kind))} · <a href="${escAttr(r.path)}">${esc(r.title)}</a></p>`;
  const body = r.note
    ? `<p>${esc(r.note)}</p>`
    : [
        `<p class="was"><strong>Was:</strong> ${esc(r.was)}</p>`,
        `<p><strong>Now:</strong> ${esc(r.now)}</p>`,
        r.source ? `<p class="src">Sources: ${esc(sourceLine(r.source))}.</p>` : "",
      ].filter(Boolean).join(`\n${inner}`);
  return `${indent}<li>\n${inner}${meta}\n${inner}${body}\n${indent}</li>`;
}

/** The build-log summary line and the G12 warning, printed by the page that renders the log. */
export function reportCorrections(tag, { rows, unrecorded }, where) {
  const withWasNow = rows.filter((r) => !r.note).length;
  console.log(`${tag} ${rows.length} correction log row(s) on ${where}: ${withWasNow} with was and now, ${rows.length - withWasNow} quoted notes (updates and revisions)`);
  if (unrecorded.length) console.warn(`${tag} G12 (warn-only): ${unrecorded.length} correction note(s) with no was/now record, listed verbatim: ${unrecorded.join(", ")}`);
}
