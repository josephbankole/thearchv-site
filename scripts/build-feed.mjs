/* build-feed.mjs — emits the JSON content feed the iOS app reads.
   Runs AFTER `vite build` (see package.json). Output dir defaults to ./dist/feed, override with FEED_OUT.
   The feed is generated FROM the same src/data/*.ts files the website renders, so web and app cannot
   drift: one deploy updates both. The app fetches these on launch / pull-to-refresh, with the CDN's
   ETag handling cheap polling and index.json's buildHash giving an app-level "did anything change".
   esbuild (already present via vite) bundles the TS data into a temp ESM module we import. */
import { build } from "esbuild";
import { writeFileSync, mkdirSync, rmSync, statSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { byDateDesc, LANE_META, SPORTS } from "./shared/page-shell.mjs";
import { infogramEligible, infogramAlt, infogramRelPath } from "./shared/infogram.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const OUT = process.env.FEED_OUT || join(ROOT, "dist", "feed");
// The dist root where build-infograms.mjs wrote dist/desk/<lane>/<date>/infogram.png (matches
// build-article-pages.mjs's OUT). Independent of FEED_OUT so the existence check below still
// finds the PNGs when the feed output dir is overridden.
const DIST = process.env.CONTENT_OUT || join(ROOT, "dist");
// v3 (multi-sport, 2026-07-22): every day entry additionally carries `sport`; new per-sport
// feed files (nfl/f1/tennis/golf.json) join the set; index.json gains a `sports` array. This is
// a strict key-superset of v2 — no existing key changed shape — and FeedClient.swift ignores
// unknown keys and never reads the schema string, so old app builds decode v3 unharmed.
const SCHEMA = "archv-feed/3";

/* ---------- load the typed data via a bundled temp module ---------- */
const entry = [
  `export { transferDays } from "./data/transferDays.ts";`,
  `export { worldCupDays } from "./data/worldCupDays.ts";`,
  `export { leaguesDays } from "./data/leaguesDays.ts";`,
  `export { nflDays } from "./data/nflDays.ts";`,
  `export { f1Days } from "./data/f1Days.ts";`,
  `export { tennisDays } from "./data/tennisDays.ts";`,
  `export { golfDays } from "./data/golfDays.ts";`,
  `export { posters } from "./data/posters.ts";`,
  `export { legends } from "./data/legends.ts";`,
  `export { longReads } from "./data/longReads.ts";`,
  `export { upsets, giantKillersIntro, giantKillersOutro } from "./data/giantKillers.ts";`,
].join("\n");

const tmp = join(ROOT, ".feed-bundle.mjs");
let data;
try {
  await build({
    stdin: { contents: entry, resolveDir: SRC, loader: "ts", sourcefile: "feed-entry.ts" },
    bundle: true, format: "esm", platform: "node", outfile: tmp, logLevel: "silent",
  });
  data = await import(pathToFileURL(tmp).href + `?t=${process.hrtime.bigint()}`);
} finally {
  try { rmSync(tmp); } catch {}
}

const { transferDays, worldCupDays, leaguesDays, nflDays, f1Days, tennisDays, golfDays, posters, legends, longReads, upsets, giantKillersIntro, giantKillersOutro } = data;

// Defensive sort immediately after loading, before any use (byDateDesc from
// scripts/shared/page-shell.mjs, shared with build-lane-pages.mjs/build-article-pages.mjs):
// every downstream feed and the "today" lead-story pick below assume newest-first.
transferDays.sort(byDateDesc);
worldCupDays.sort(byDateDesc);
leaguesDays.sort(byDateDesc);

/* ---------- compose the feeds ---------- */
const SITE = "https://thearchv.ca";
// Lane segment in the article URL differs from the internal `section` key for World Cup
// (section "worldcup", URL lane "world-cup") to match the founder-approved URL shape
// thearchv.ca/desk/<lane>/<date>/ built by scripts/build-article-pages.mjs.
const LANES = { transfer: "transfer", worldcup: "world-cup", leagues: "leagues" };
const articleUrl = (section, date) => `${SITE}/desk/${LANES[section]}/${date}/`;

// Additive infogram fields (INFOGRAM-PLAN.md P3, schema archv-feed/3): attach
// `infogram` (site-relative PNG path) + `infogramAlt` (one plain sentence) to an entry ONLY when
// build-infograms.mjs actually wrote the PNG for it. Checking the file on disk — not just
// eligibility — is the OG-card discipline: the feed never advertises an image that was not
// generated (a render that failed and was skipped simply carries no field). Any entry a build
// before this started reading the field, or an offline cache, decodes fine — the fields are
// optional and unknown to older app builds.
function withInfogram(entry, section) {
  const urlLane = LANES[section];
  if (!infogramEligible(entry)) return entry;
  if (!existsSync(join(DIST, "desk", urlLane, entry.date, "infogram.png"))) return entry;
  const label = LANE_META[urlLane]?.label ?? section;
  return {
    ...entry,
    infogram: infogramRelPath(urlLane, entry.date),
    infogramAlt: infogramAlt(entry, label),
  };
}

// Today = newest dated wrap across Transfer Desk + World Cup, lead + the next four cards.
// (today.lead/wrap reuse these same tagged objects, so the infogram fields propagate there too.)
// v3: every day entry gains `sport` (resolved here, always populated, so the app never has to
// know about the absent-means-football default). Football's three lanes are sport "football".
const transferTagged = transferDays.map((d) => withInfogram({ ...d, section: "transfer", sport: "football", url: articleUrl("transfer", d.date) }, "transfer"));
const worldCupTagged = worldCupDays.map((d) => withInfogram({ ...d, section: "worldcup", sport: "football", url: articleUrl("worldcup", d.date) }, "worldcup"));
const leaguesTagged = leaguesDays.map((d) => withInfogram({ ...d, section: "leagues", sport: "football", url: articleUrl("leagues", d.date) }, "leagues"));
// leagues entries are deliberately NOT in the daily today-pool yet: the Today lead is
// "newest dated wrap" and a leagues launch batch must not displace the day's transfer/WC lead.
const daily = [...transferTagged, ...worldCupTagged].sort(byDateDesc);

const lastUpdated = daily.length ? daily[0].date : null;

// Per-sport feeds (v3): each new sport's Question Desk lane in the same { schema, lastUpdated,
// days } envelope as the football lanes, entries tagged with sport + section + url, newest-first.
// Empty today; the desks open one entry at a time. Each carries its OWN lastUpdated (its newest
// entry, or null while empty) — this overrides the football lastUpdated when spread into `feeds`.
// The app fetches only the active sport's file, which protects the cold-launch budget. Football
// is not a per-sport file: its shelves stay today/transfer/worldcup/leagues, unchanged.
const SPORT_RAW = { nfl: nflDays, f1: f1Days, tennis: tennisDays, golf: golfDays };
const sportFeeds = {};
for (const sport of SPORTS) {
  if (sport.key === "football") continue;
  const laneKey = sport.lanes[0];
  // CONTRACT: `section` is the FEED KEY, matching football's convention (transfer/worldcup/leagues
  // are simultaneously the lane AND the .json file name). The app routes push payloads by
  // section -> <section>.json (SportRouting.lookup / TodayView.resolve), so for new sports this
  // must be the SPORT key (nfl.json exists, questions.json does not). The lane key stays in the URL.
  const days = [...(SPORT_RAW[sport.key] || [])]
    .sort(byDateDesc)
    .map((d) => ({ ...d, section: sport.key, sport: sport.key, url: `${SITE}/${sport.urlBase}/${laneKey}/${d.date}/` }));
  sportFeeds[sport.key] = { days, lastUpdated: days.length ? days[0].date : null };
}

const feeds = {
  today: { lead: daily[0] ?? null, wrap: daily.slice(1, 5) },
  transfer: { days: transferTagged },
  worldcup: { days: worldCupTagged },
  leagues: { days: leaguesTagged },
  ...sportFeeds,
  posters: { posters },
  archive: {
    legends,
    giantKillers: { intro: giantKillersIntro, outro: giantKillersOutro, upsets },
    longReads,
  },
};

/* ---------- write feed files + manifest ---------- */
mkdirSync(OUT, { recursive: true });
const shortHash = (s) => createHash("sha256").update(s).digest("hex").slice(0, 12);

const manifestFeeds = [];
let combined = "";
for (const [name, payload] of Object.entries(feeds)) {
  // Flat shape: { schema, lastUpdated, ...payload } so the app reads one predictable envelope per feed.
  const json = JSON.stringify({ schema: SCHEMA, lastUpdated, ...payload }, null, 2);
  const file = join(OUT, `${name}.json`);
  writeFileSync(file, json);
  combined += json;
  manifestFeeds.push({ name, path: `/feed/${name}.json`, bytes: statSync(file).size, hash: shortHash(json) });
}

// v3: the sport registry, so the app's chip row is feed-driven the way its shelves already are.
// One row per sport in display order; `feed` is the file the app fetches when that sport is the
// active filter (football uses today.json, the existing lead pool); `hasEntries` lets the app
// keep an empty new sport out of the "All" view while still showing its chip.
const sportsManifest = SPORTS.map((s) => ({
  key: s.key,
  label: s.label,
  shortLabel: s.shortLabel,
  urlBase: s.urlBase,
  order: s.order,
  feed: s.key === "football" ? "/feed/today.json" : `/feed/${s.key}.json`,
  hasEntries: s.key === "football" ? daily.length > 0 : (sportFeeds[s.key]?.days.length ?? 0) > 0,
}));

const manifest = {
  schema: SCHEMA,
  generatedAt: new Date().toISOString(),
  lastUpdated,
  buildHash: shortHash(combined),
  feeds: manifestFeeds,
  sports: sportsManifest,
};
writeFileSync(join(OUT, "index.json"), JSON.stringify(manifest, null, 2));

console.log(
  `[build-feed] ${manifestFeeds.length} feeds → ${OUT}  (lastUpdated ${lastUpdated}, build ${manifest.buildHash})`
);

/* ---------- storefront feed (Etsy merch, additive-only, standalone file) ----------
   Sourced from scripts/storefront-items.json (NOT src/data/*.ts — that dir is engine-owned
   and committed by the daily desk job; this is hand-curated shop merch, a different lifecycle).
   Deliberately NOT folded into the `feeds` loop above so the existing feed files and
   index.json manifest/buildHash stay byte-identical to before this feed existed. */
const SHOP_URL = "https://www.etsy.com/shop/TheARCHVCA";
const storefrontItemsRaw = JSON.parse(
  readFileSync(join(ROOT, "scripts", "storefront-items.json"), "utf8")
);
// Hand-curated (not desk-committed like src/data/*.ts), so a bad manual edit here should not
// fail the whole build — validate each item's required string fields and skip anything broken,
// logging which one and why so it gets fixed instead of silently disappearing.
const REQUIRED_STRING_FIELDS = ["id", "name", "price", "image", "url"];
const storefrontItems = storefrontItemsRaw
  .filter((item, i) => {
    if (typeof item !== "object" || item === null) {
      console.error(`[build-feed] storefront item ${i} is not an object, skipping.`);
      return false;
    }
    const missing = REQUIRED_STRING_FIELDS.filter(
      (field) => typeof item[field] !== "string" || item[field].trim() === ""
    );
    if (missing.length > 0) {
      console.error(
        `[build-feed] storefront item ${i} (id: ${item.id ?? "unknown"}) missing/invalid field(s) ${missing.join(", ")}, skipping.`
      );
      return false;
    }
    return true;
  })
  .map((item) => ({
    id: item.id,
    name: item.name,
    price: item.price,
    image: `${SITE}/shop/${item.image.replace(/\.[^.]+$/, "")}.webp`,
    url: item.url,
  }));
const storefront = {
  schema: SCHEMA,
  lastUpdated,
  shopUrl: SHOP_URL,
  items: storefrontItems,
};
writeFileSync(join(OUT, "storefront.json"), JSON.stringify(storefront, null, 2));
console.log(`[build-feed] storefront feed → ${OUT}/storefront.json (${storefrontItems.length} items)`);
