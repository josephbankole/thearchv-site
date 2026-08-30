/* day-data.mjs — the one loader for the typed data in src/ that the .mjs generators read.
   A build script written in .mjs cannot `import` a .ts at run time, so every generator in the
   chain used to carry its own copy of the same twenty lines: assemble an entry-module source
   string, run esbuild over src/data/*.ts, write a temp dot-file at the repo root, dynamic-import
   it with a cache-busting query, delete it in a `finally`. Twelve copies, twelve chances for one
   of them to drift. This module owns all of it.

   WHAT THIS IS NOT: a speed optimisation. `npm run build` chains ~19 SEPARATE node processes
   (see package.json "build"), so nothing cached here survives to the next generator. The
   memoisation below exists so that one process asking twice gets one bundle and one identical
   answer. The win is deduplication, not build time.

   THE INVARIANT THIS OWNS: every day lane comes back ALREADY SORTED newest-first, by the same
   `byDateDesc` from page-shell.mjs the generators used to apply by hand. It matters because
   src/data/*.ts is written by the desk engine through the GitHub Contents API, not by this repo,
   and two of the lanes are NOT committed in date order today. Prev/next nav, "more from the
   lane", the feed's lead-story pick and every ...slice(0, n) downstream assume newest-first. It
   was a per-caller comment repeated eight times and forgotten twice; it is one line here now.

   WHAT IT DELIBERATELY DOES NOT SORT: the extras. `longReads`, `posters`, `legends` and the rest
   come back in committed order, because their callers disagree about what order they want and
   two of them (build-rss, build-search) read the file order on purpose. build-reads-pages does
   its own date sort and says why. Sorting them here would be a silent output change, not a
   refactor.

   USAGE
     const { transferDays, worldCupDays, leaguesDays, sportDays } = await loadDayData();
     const { legends } = await loadDayData({ days: false, extras: ["legends"] });
     const { transferDays, readLabel } = await loadDayData({ extras: ["readTime"] });
*/
import { build } from "esbuild";
import { rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { byDateDesc } from "./page-shell.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = join(ROOT, "src");

/* The seven day lanes, in the order every generator lists them. Football's three first, then the
   four sports opened by the 2026-07-22 multi-sport pass. `sport` names the SPORTS key a lane
   belongs to, which is what builds the `sportDays` map below. */
const DAY_LANES = [
  { name: "transferDays", file: "transferDays" },
  { name: "worldCupDays", file: "worldCupDays" },
  { name: "leaguesDays", file: "leaguesDays" },
  { name: "nflDays", file: "nflDays", sport: "nfl" },
  { name: "f1Days", file: "f1Days", sport: "f1" },
  { name: "tennisDays", file: "tennisDays", sport: "tennis" },
  { name: "golfDays", file: "golfDays", sport: "golf" },
];

/* Everything else a generator has ever needed off the same bundle, opt-in by key. A key names a
   MODULE, not a single export, so asking for "readSlug" gets both readSlug and readPath: they
   live in one file, esbuild bundles the file either way, and pretending otherwise would just
   mean two keys resolving to the same work. Nothing here is sorted or reshaped. */
const EXTRAS = {
  posters: `export { posters } from "./data/posters.ts";`,
  legends: `export { legends } from "./data/legends.ts";`,
  longReads: `export { longReads } from "./data/longReads.ts";`,
  giantKillers: `export { upsets, giantKillersIntro, giantKillersOutro } from "./data/giantKillers.ts";`,
  readSlug: `export { readSlug, readPath } from "./data/readSlug.ts";`,
  // src/lib/readTime.ts is the one copy of read-time on the site (see its header); it rides in on
  // this bundle rather than being reimplemented in .mjs.
  readTime: `export { readLabel, readDuration, wordCount } from "./lib/readTime.ts";`,
};

/* One bundle per distinct request within this process, keyed by the entry source itself. Two
   callers asking for the same set share the arrays, so treat what comes back as read-only: copy
   before mutating. Nothing in the chain mutates today. */
const cache = new Map();
// The temp file carries the pid so two generators running at once cannot land on the same path
// and delete each other's bundle mid-import; the counter keeps one process's own requests apart.
let bundleSeq = 0;

async function bundleAndImport(entrySrc) {
  const tmp = join(ROOT, `.day-data-${process.pid}-${bundleSeq++}.mjs`);
  try {
    await build({
      stdin: { contents: entrySrc, resolveDir: SRC, loader: "ts", sourcefile: "day-data-entry.ts" },
      bundle: true, format: "esm", platform: "node", outfile: tmp, logLevel: "silent",
    });
    return await import(pathToFileURL(tmp).href + `?t=${process.hrtime.bigint()}`);
  } finally {
    try { rmSync(tmp); } catch {}
  }
}

/**
 * Load the typed site data.
 * @param {object} [options]
 * @param {boolean} [options.days=true]  Include the seven day lanes. Set false when a generator
 *   wants only extras (build-section-pages wants legends, build-reads-pages wants the essays):
 *   there is no reason to bundle 370 kB of day data for them.
 * @param {string[]} [options.extras=[]] Keys from EXTRAS above. An unknown key throws rather than
 *   returning undefined at the call site three hundred lines later.
 * @returns {Promise<object>} The day lanes (sorted newest-first), a `sportDays` map keyed by
 *   SPORTS key, and whatever extras were asked for.
 */
export async function loadDayData({ days = true, extras = [] } = {}) {
  for (const key of extras) {
    if (!(key in EXTRAS)) {
      throw new Error(`[day-data] unknown extra "${key}" — valid keys: ${Object.keys(EXTRAS).join(", ")}`);
    }
  }
  const wanted = [...new Set(extras)].sort();
  const lines = [
    ...(days ? DAY_LANES.map((l) => `export { ${l.name} } from "./data/${l.file}.ts";`) : []),
    ...wanted.map((k) => EXTRAS[k]),
  ];
  if (!lines.length) throw new Error("[day-data] nothing requested: pass days:true or at least one extra");

  const entrySrc = lines.join("\n");
  if (cache.has(entrySrc)) return cache.get(entrySrc);

  const mod = await bundleAndImport(entrySrc);

  const out = {};
  if (days) {
    const sportDays = {};
    for (const lane of DAY_LANES) {
      // Copy before sorting: `mod` is the imported module namespace and its arrays are the
      // literals from src/data. Sorted here, once, so no caller has to remember to.
      const arr = [...mod[lane.name]].sort(byDateDesc);
      out[lane.name] = arr;
      if (lane.sport) sportDays[lane.sport] = arr;
    }
    // Same object shape the generators each built by hand as SPORT_DAYS / SPORT_DATA: the four
    // non-football sports keyed by SPORTS key. Same array references as the named exports above.
    out.sportDays = sportDays;
  }
  // Everything the entry module exports that is not a day lane is an extra, passed through
  // untouched. Reading it off the namespace rather than re-listing the export names means a key
  // in EXTRAS can grow a second export without a matching edit down here.
  const laneNames = new Set(DAY_LANES.map((l) => l.name));
  for (const [name, value] of Object.entries(mod)) {
    if (!laneNames.has(name)) out[name] = value;
  }

  cache.set(entrySrc, out);
  return out;
}
