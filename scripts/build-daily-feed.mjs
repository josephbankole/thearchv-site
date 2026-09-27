/* build-daily-feed.mjs: publish the Wire and the tables as two NEW standalone feed files,
   dist/feed/wire.json (schema archv-wire/1) and dist/feed/tables.json (archv-tables/1).
   Runs after build-feed.mjs. Like storefront.json, they are deliberately outside the manifest
   loop, so index.json, its buildHash, today.json and every existing feed stay byte-identical and
   no shipped app build ever sees a new key. Neither file carries a top-level days, lead or wrap
   key, so nothing can decode one as a DaysFeed or TodayFeed. Wire items never enter today.json,
   any days feed, feed.xml, the news sitemap or the search index. See design-final B10. */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDaily } from "./wire/lib/content.mjs";
import { buildWireFeed, buildTablesFeed } from "./wire/lib/schema.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = process.env.FEED_OUT || join(ROOT, "dist", "feed");
const { wire, tables } = loadDaily();
const generatedAt = new Date().toISOString();

mkdirSync(OUT, { recursive: true });
const wireFeed = buildWireFeed(wire, { generatedAt });
const tablesFeed = buildTablesFeed(tables, { generatedAt });
writeFileSync(join(OUT, "wire.json"), JSON.stringify(wireFeed, null, 2));
writeFileSync(join(OUT, "tables.json"), JSON.stringify(tablesFeed, null, 2));
const blockCount = Object.values(tables.sports).reduce((n, s) => n + s.blocks.length, 0);
console.log(`[build-daily-feed] wire.json (${wireFeed.edition ? `edition ${wireFeed.edition.date}, ${wireFeed.items.length} item(s)` : "no edition"}) + tables.json (${blockCount} block(s)) -> ${OUT}`);
