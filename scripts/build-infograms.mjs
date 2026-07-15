/* build-infograms.mjs — renders one per-article "infogram" story-card PNG for every daily entry
   whose data supports it, at:
     dist/desk/<lane>/<date>/infogram.png       lane one of: transfer, world-cup, leagues
   (the same directory build-article-pages.mjs writes index.html + og.png into, so the three sit
   side by side once the chain finishes).

   INFOGRAM-PLAN.md P2: AI verifies the data, DETERMINISTIC code draws the picture. This uses the
   SAME local, $0, pixel-deterministic stack as the OG cards and the approved mocks: satori
   JSX-object trees -> SVG -> PNG via @resvg/resvg-js. No generative image model, no invented
   numbers — the card composes only the entry's own verified fields (see scripts/shared/infogram.mjs
   for the layout and the "clean story card" rationale).

   RUN ORDER (package.json "build"): AFTER `vite build` (so dist/ exists) and BEFORE
   build-feed.mjs, because build-feed emits the additive `infogram` feed field ONLY for entries
   whose PNG already exists on disk (OG-card discipline: the field never claims a file that was
   not written). A generation failure for one entry is logged and skipped; it never fails the
   build. */
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { LANE_META, byDateDesc } from "./shared/page-shell.mjs";
import { infogramTree, infogramEligible, INFOGRAM_W, INFOGRAM_H } from "./shared/infogram.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
// Match build-article-pages.mjs so the infogram PNG lands in the same dist/desk tree.
const OUT = process.env.CONTENT_OUT || join(ROOT, "dist");

/* ---------- load the typed day data via a bundled temp module (same pattern as build-feed) ---------- */
const entrySrc = [
  `export { transferDays } from "./data/transferDays.ts";`,
  `export { worldCupDays } from "./data/worldCupDays.ts";`,
  `export { leaguesDays } from "./data/leaguesDays.ts";`,
].join("\n");
const tmp = join(ROOT, ".infogram-bundle.mjs");
let data;
try {
  await build({
    stdin: { contents: entrySrc, resolveDir: SRC, loader: "ts", sourcefile: "infogram-entry.ts" },
    bundle: true, format: "esm", platform: "node", outfile: tmp, logLevel: "silent",
  });
  data = await import(pathToFileURL(tmp).href + `?t=${process.hrtime.bigint()}`);
} finally {
  try { rmSync(tmp); } catch {}
}

// lane = URL segment under /desk/ (World Cup's is hyphenated "world-cup" even though its feed
// section key is "worldcup"). label comes from the shared LANE_META so the card kicker matches
// the lane/article pages exactly.
const LANES = {
  transfer: { label: LANE_META.transfer.label, days: [...data.transferDays].sort(byDateDesc) },
  "world-cup": { label: LANE_META["world-cup"].label, days: [...data.worldCupDays].sort(byDateDesc) },
  leagues: { label: LANE_META.leagues.label, days: [...data.leaguesDays].sort(byDateDesc) },
};

/* ---------- fonts: static TTF instances committed at scripts/fonts/, same set the OG cards use
   (satori does not handle variable fonts well, so these stay static). ---------- */
const FONTS_DIR = join(ROOT, "scripts", "fonts");
const CARD_FONTS = [
  { name: "Fraunces", data: readFileSync(join(FONTS_DIR, "Fraunces-SemiBold.ttf")), weight: 600, style: "normal" },
  { name: "Inter Tight", data: readFileSync(join(FONTS_DIR, "InterTight-Regular.ttf")), weight: 400, style: "normal" },
  { name: "Inter Tight", data: readFileSync(join(FONTS_DIR, "InterTight-SemiBold.ttf")), weight: 600, style: "normal" },
];

async function renderInfogram(entry, laneLabel) {
  const svg = await satori(infogramTree({ entry, laneLabel }), {
    width: INFOGRAM_W,
    height: INFOGRAM_H,
    fonts: CARD_FONTS,
  });
  return new Resvg(svg, { fitTo: { mode: "width", value: INFOGRAM_W } }).render().asPng();
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
      const png = await renderInfogram(entry, lane.label);
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
