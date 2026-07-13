/* build-feed.mjs — emits the JSON content feed the iOS app reads.
   Runs AFTER `vite build` (see package.json). Output dir defaults to ./dist/feed, override with FEED_OUT.
   The feed is generated FROM the same src/data/*.ts files the website renders, so web and app cannot
   drift: one deploy updates both. The app fetches these on launch / pull-to-refresh, with the CDN's
   ETag handling cheap polling and index.json's buildHash giving an app-level "did anything change".
   esbuild (already present via vite) bundles the TS data into a temp ESM module we import. */
import { build } from "esbuild";
import { writeFileSync, mkdirSync, rmSync, statSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { byDateDesc } from "./shared/page-shell.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const OUT = process.env.FEED_OUT || join(ROOT, "dist", "feed");
const SCHEMA = "archv-feed/2"; // v2: every lane's entries carry `section`, so provenance renders identically on every app surface

/* ---------- load the typed data via a bundled temp module ---------- */
const entry = [
  `export { transferDays } from "./data/transferDays.ts";`,
  `export { worldCupDays } from "./data/worldCupDays.ts";`,
  `export { leaguesDays } from "./data/leaguesDays.ts";`,
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

const { transferDays, worldCupDays, leaguesDays, posters, legends, longReads, upsets, giantKillersIntro, giantKillersOutro } = data;

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

// Today = newest dated wrap across Transfer Desk + World Cup, lead + the next four cards.
const transferTagged = transferDays.map((d) => ({ ...d, section: "transfer", url: articleUrl("transfer", d.date) }));
const worldCupTagged = worldCupDays.map((d) => ({ ...d, section: "worldcup", url: articleUrl("worldcup", d.date) }));
const leaguesTagged = leaguesDays.map((d) => ({ ...d, section: "leagues", url: articleUrl("leagues", d.date) }));
// leagues entries are deliberately NOT in the daily today-pool yet: the Today lead is
// "newest dated wrap" and a leagues launch batch must not displace the day's transfer/WC lead.
const daily = [...transferTagged, ...worldCupTagged].sort(byDateDesc);

const lastUpdated = daily.length ? daily[0].date : null;

const feeds = {
  today: { lead: daily[0] ?? null, wrap: daily.slice(1, 5) },
  transfer: { days: transferTagged },
  worldcup: { days: worldCupTagged },
  leagues: { days: leaguesTagged },
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

const manifest = {
  schema: SCHEMA,
  generatedAt: new Date().toISOString(),
  lastUpdated,
  buildHash: shortHash(combined),
  feeds: manifestFeeds,
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
