/* build-feed.mjs — emits the JSON content feed the iOS app reads.
   Runs AFTER `vite build` (see package.json). Output dir defaults to ./dist/feed, override with FEED_OUT.
   The feed is generated FROM the same src/data/*.ts files the website renders, so web and app cannot
   drift: one deploy updates both. The app fetches these on launch / pull-to-refresh, with the CDN's
   ETag handling cheap polling and index.json's buildHash giving an app-level "did anything change".
   The typed data comes in through scripts/shared/day-data.mjs, which is the one place in this
   repo that bundles src/data/*.ts into something a .mjs build script can import. */
import { writeFileSync, mkdirSync, statSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { byDateDesc, LANE_META, SPORTS, laneByFeedKey, articlePath } from "./shared/page-shell.mjs";
import { loadDayData } from "./shared/day-data.mjs";
import { infogramEligible, infogramAlt, infogramRelPath } from "./shared/infogram.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
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

/* ---------- the typed data, through scripts/shared/day-data.mjs ----------
   That module is the one loader for src/data/*.ts and it owns the newest-first sort every
   downstream feed and the "today" lead-story pick below assume. The rest of what this script
   needs — the poster archive, the legends wall, the essays and the giant-killers block — comes
   off the same bundle as named extras. */
const {
  transferDays, worldCupDays, leaguesDays, sportDays: SPORT_RAW,
  posters, legends, longReads, upsets, giantKillersIntro, giantKillersOutro,
} = await loadDayData({ extras: ["posters", "legends", "longReads", "giantKillers"] });

/* ---------- compose the feeds ---------- */
const SITE = "https://thearchv.ca";
// Lane segment in the article URL differs from the internal `section` key for World Cup
// (section "worldcup", URL lane "world-cup"). The mapping lives on LANE_META.feedKey in
// page-shell.mjs — declared once, derived here (2026-08-12 review).
const LANES = Object.fromEntries(Object.entries(laneByFeedKey));
const articleUrl = (section, date) => `${SITE}${articlePath(section, date)}`;

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

const newestOf = (days) => (days.length ? days[0].date : null);

// Per-sport feeds (v3): each new sport's Question Desk lane in the same { schema, lastUpdated,
// days } envelope as the football lanes, entries tagged with sport + section + url, newest-first.
// Empty today; the desks open one entry at a time. Each carries its OWN lastUpdated (its newest
// entry, or null while empty) — this overrides the football lastUpdated when spread into `feeds`.
// The app fetches only the active sport's file, which protects the cold-launch budget. Football
// is not a per-sport file: its shelves stay today/transfer/worldcup/leagues, unchanged.
const sportFeeds = {};
for (const sport of SPORTS) {
  if (sport.key === "football") continue;
  const laneKey = sport.lanes[0];
  // CONTRACT: `section` is the FEED KEY, matching football's convention (transfer/worldcup/leagues
  // are simultaneously the lane AND the .json file name). The app routes push payloads by
  // section -> <section>.json (SportRouting.lookup / TodayView.resolve), so for new sports this
  // must be the SPORT key (nfl.json exists, questions.json does not). The lane key stays in the URL.
  // Already newest-first out of day-data.mjs; .map returns a new array, so the shared one is
  // never touched.
  const days = (SPORT_RAW[sport.key] || [])
    .map((d) => ({ ...d, section: sport.key, sport: sport.key, url: `${SITE}/${sport.urlBase}/${laneKey}/${d.date}/` }));
  sportFeeds[sport.key] = { days, lastUpdated: newestOf(days) };
}

// lastUpdated is sold to the app as the polling signal, so it must move whenever ANY lane ships —
// deriving it from the today-pool alone left leagues.json reporting stale on a leagues-only
// publish day (2026-08-12 review). Envelope default = newest date across every lane; the three
// football lane feeds carry their own, same as the per-sport feeds already did. ISO dates, so
// string comparison is date comparison.
const lastUpdated = [
  newestOf(transferTagged),
  newestOf(worldCupTagged),
  newestOf(leaguesTagged),
  ...Object.values(sportFeeds).map((f) => f.lastUpdated),
].filter(Boolean).sort().at(-1) ?? null;

const feeds = {
  today: { lead: daily[0] ?? null, wrap: daily.slice(1, 5) },
  transfer: { days: transferTagged, lastUpdated: newestOf(transferTagged) },
  worldcup: { days: worldCupTagged, lastUpdated: newestOf(worldCupTagged) },
  leagues: { days: leaguesTagged, lastUpdated: newestOf(leaguesTagged) },
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

// v3: the sport registry, INTENDED to make the app's chip row feed-driven the way its shelves
// already are. NOT YET TRUE on the consumer side (verified 2026-08-12): SportFilter.swift
// hardcodes the sport enum, feed filenames and display order, Models.swift's DayEntry has no
// `sport` property, and nothing in the app fetches index.json. Until that app work lands, adding
// a sport here does NOT surface it in the app — the Xcode project needs its own change.
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
