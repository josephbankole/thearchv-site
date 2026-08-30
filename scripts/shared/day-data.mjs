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
   `byDateDesc` from page-shell.mjs the generators used to apply by hand. It is load-bearing, not
   decorative: src/data/*.ts is written by the desk engine through the GitHub Contents API rather
   than by this repo, and transferDays and worldCupDays are NOT committed in date order today.
   Prev/next nav, "more from the lane", the feed's lead-story pick and every ...slice(0, n)
   downstream assume newest-first. Seven of the twelve callers sorted here and each explained why
   in its own comment; the rest sorted later, per lane inside a loop or once over a merged list.
   One line here replaces all of it.

   WHAT IT DELIBERATELY DOES NOT SORT: the extras. `longReads`, `posters`, `legends` and the rest
   come back in committed order, because their callers disagree about what order they want and
   two of them (build-rss, build-search) read the file order on purpose. build-reads-pages does
   its own date sort and says why. Sorting them here would be a silent output change, not a
   refactor.

   WHAT IT REFUSES TO BUNDLE (2026-08-30). src/data/*.ts is written by the desk engine through
   the GitHub Contents API, not by anyone on a branch here, and the `import()` below EXECUTES
   whatever it finds — in Actions, in a job holding pages:write. Every data module named below is
   therefore checked against a pure-data grammar first, and a file that has grown a runtime import
   or a top-level call stops the build instead of running. scripts/shared/data-shape.mjs carries
   the grammar and the reasoning. The guard sits HERE, at the bundle, rather than in a
   front-of-chain script, because half the generators are also run on their own through their
   package.json aliases (`npm run articles`, `npm run feed`), where a front-of-chain check never
   fires at all.

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
import { assertPureDataFile } from "./data-shape.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = join(ROOT, "src");

/* The seven day lanes, in the order every generator lists them. Football's three first, then the
   four sports opened by the 2026-07-22 multi-sport pass. `sport` names the SPORTS key a lane
   belongs to, which is what builds the `sportDays` map below. All seven are DATA files written by
   the desk engine, so all seven go through the shape guard. */
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
   mean two keys resolving to the same work. Nothing here is sorted or reshaped.

   `kind` is the only load-bearing addition: "data" means engine-written and checked against the
   pure-data grammar before it is bundled, "code" means a repo-owned module that reaches the
   bundle through a reviewed branch like any other source file. Two of these are code and running
   the data grammar over them would fail the build on the first `function` keyword. */
const EXTRAS = {
  posters: { module: "data/posters.ts", kind: "data", line: `export { posters } from "./data/posters.ts";` },
  legends: { module: "data/legends.ts", kind: "data", line: `export { legends } from "./data/legends.ts";` },
  longReads: { module: "data/longReads.ts", kind: "data", line: `export { longReads } from "./data/longReads.ts";` },
  giantKillers: { module: "data/giantKillers.ts", kind: "data", line: `export { upsets, giantKillersIntro, giantKillersOutro } from "./data/giantKillers.ts";` },
  // readSlug is CODE that happens to live in src/data/, and its own header says why it sits there
  // rather than inside the engine-written longReads.ts. The engine never writes it.
  readSlug: { module: "data/readSlug.ts", kind: "code", line: `export { readSlug, readPath } from "./data/readSlug.ts";` },
  // src/lib/readTime.ts is the one copy of read-time on the site (see its header); it rides in on
  // this bundle rather than being reimplemented in .mjs.
  readTime: { module: "lib/readTime.ts", kind: "code", line: `export { readLabel, readDuration, wordCount } from "./lib/readTime.ts";` },
};

/* Checked once per process. The scan is a single pass and the whole data set is ~390 kB, so this
   costs single-digit milliseconds per generator; the memo is here so the second loadDayData call
   in one process does not pay it twice. A file is checked when it is about to be BUNDLED, which
   is what keeps this list from drifting away from what actually gets executed. */
const checkedModules = new Set();
function guardDataModules(entries) {
  for (const entry of entries) {
    if (entry.kind !== "data" || checkedModules.has(entry.module)) continue;
    assertPureDataFile(join(SRC, entry.module), `src/${entry.module}`);
    checkedModules.add(entry.module);
  }
}

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
  // One list, two readings: the entry-module source esbuild bundles, and the modules the shape
  // guard checks. Derived from the same place so neither can quietly stop covering the other.
  const requested = [
    ...(days ? DAY_LANES.map((l) => ({ module: `data/${l.file}.ts`, kind: "data", line: `export { ${l.name} } from "./data/${l.file}.ts";` })) : []),
    ...wanted.map((k) => EXTRAS[k]),
  ];
  const lines = requested.map((r) => r.line);
  if (!lines.length) throw new Error("[day-data] nothing requested: pass days:true or at least one extra");

  const entrySrc = lines.join("\n");
  if (cache.has(entrySrc)) return cache.get(entrySrc);

  guardDataModules(requested);
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
