/* build-infograms.mjs — renders one per-article "infogram" story-card PNG for every daily entry
   whose data supports it, at:
     dist/desk/<lane>/<date>/infogram.png       lane one of: transfer, world-cup, leagues
   (the same directory build-article-pages.mjs writes index.html + og.png into, so the three sit
   side by side once the chain finishes).

   INFOGRAM-PLAN.md P2: AI verifies the data, DETERMINISTIC code draws the picture. This uses the
   SAME local, $0, pixel-deterministic stack as the OG cards and the approved mocks: satori
   JSX-object trees -> SVG -> PNG via @resvg/resvg-js, through the shared renderCard(). No
   generative image model, no invented numbers — the card composes only the entry's own verified
   fields (see scripts/shared/infogram.mjs for the layout and the "clean story card" rationale).

   RUN ORDER (package.json "build"): AFTER `vite build` (so dist/ exists) and BEFORE
   build-feed.mjs, because build-feed emits the additive `infogram` feed field ONLY for entries
   whose PNG already exists on disk (OG-card discipline: the field never claims a file that was
   not written). A generation failure for one entry is logged and skipped; it never fails the
   build. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { renderCard, artPng } from "./shared/card-brand.mjs";
import { LANE_META } from "./shared/page-shell.mjs";
import { loadDayData } from "./shared/day-data.mjs";
import { infogramTree, infogramEligible, INFOGRAM_W, INFOGRAM_H } from "./shared/infogram.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
// Match build-article-pages.mjs so the infogram PNG lands in the same dist/desk tree.
const OUT = process.env.CONTENT_OUT || join(ROOT, "dist");

/* ---------- the typed day data, through scripts/shared/day-data.mjs (the one loader for
   src/data/*.ts; it hands each lane back sorted newest-first) ---------- */
const { transferDays, worldCupDays, leaguesDays } = await loadDayData();

// lane = URL segment under /desk/ (World Cup's is hyphenated "world-cup" even though its feed
// section key is "worldcup"). label comes from the shared LANE_META so the card kicker matches
// the lane/article pages exactly.
const LANES = {
  transfer: { label: LANE_META.transfer.label, days: transferDays },
  "world-cup": { label: LANE_META["world-cup"].label, days: worldCupDays },
  leagues: { label: LANE_META.leagues.label, days: leaguesDays },
};

/* ---------- fonts: static TTF instances committed at scripts/fonts/, the same directory the OG
   cards read (satori does not handle variable fonts well, so these stay static). NOT the shared
   CARD_FONTS: these cards carry no Anton, so the set is its own and gets passed to renderCard
   rather than taking its default. ---------- */
const FONTS_DIR = join(ROOT, "scripts", "fonts");
const INFOGRAM_FONTS = [
  { name: "Fraunces", data: readFileSync(join(FONTS_DIR, "Fraunces-SemiBold.ttf")), weight: 600, style: "normal" },
  { name: "Inter Tight", data: readFileSync(join(FONTS_DIR, "InterTight-Regular.ttf")), weight: 400, style: "normal" },
  { name: "Inter Tight", data: readFileSync(join(FONTS_DIR, "InterTight-SemiBold.ttf")), weight: 600, style: "normal" },
];


/* ---------- portraits: every card gets a face ----------
   The heads bank (public/heads/*.webp) goes through artPng() in shared/card-brand.mjs, which the
   OG and duel cards use too, and is inlined as a data URI. NO WHITE FLATTEN HERE, unlike those:
   these are navy story cards and the alpha has to survive. Falls back to our own crest so a card
   is never faceless, which is the whole point of making it mandatory. Cached because the crest is
   reused across most entries and re-encoding it every time would slow the build for nothing.
   A conversion failure returns null and the card simply renders as it did before: this must
   never break the build, so the swallow stays here rather than inside artPng. */
const PUBLIC = join(ROOT, "public");
// The ink colourway on purpose: these story cards are a founder-approved navy poster format and
// are deliberately NOT on the white system, so the crest that goes on them is the paper-on-ink
// monogram, not the ink-on-paper one every page-facing surface uses.
const CREST = join(PUBLIC, "brand", "crest-badge-ink@512.png");
const portraitCache = new Map();

async function toDataUri(absPath) {
  if (portraitCache.has(absPath)) return portraitCache.get(absPath);
  let uri = null;
  try {
    const png = await artPng(absPath, { size: 480, flatten: false });
    if (png) uri = `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    uri = null;
  }
  portraitCache.set(absPath, uri);
  return uri;
}

async function portraitFor(entry) {
  const rel = String(entry.image ?? "").trim();
  if (rel.startsWith("/")) {
    const head = await toDataUri(join(PUBLIC, rel.replace(/^\//, "")));
    if (head) return head;
  }
  return toDataUri(CREST);
}

function renderInfogram(entry, laneLabel, portrait) {
  return renderCard(infogramTree({ entry, laneLabel, portrait }), {
    width: INFOGRAM_W,
    height: INFOGRAM_H,
    fonts: INFOGRAM_FONTS,
  });
}

/* ---------- write cards ---------- */
let made = 0;
let skipped = 0;
for (const [laneKey, lane] of Object.entries(LANES)) {
  for (const entry of lane.days) {
    if (!infogramEligible(entry)) {
      skipped++;
      continue;
    }
    try {
      const png = await renderInfogram(entry, lane.label, await portraitFor(entry));
      const dir = join(OUT, "desk", laneKey, entry.date);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "infogram.png"), png);
      made++;
    } catch (err) {
      // A single card failing never breaks the build (OG-card discipline): the entry simply
      // gets no infogram, and build-feed will not emit the field for it (the PNG is absent).
      console.warn(
        `[build-infograms] infogram failed for ${laneKey}/${entry.date} (${entry.headline}): ${
          err && err.message ? err.message : err
        }`
      );
      skipped++;
    }
  }
}

console.log(`[build-infograms] wrote ${made} infogram(s), skipped ${skipped}, to ${OUT}/desk/<lane>/<date>/infogram.png`);
