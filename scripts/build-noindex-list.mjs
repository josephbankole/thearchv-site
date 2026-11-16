/* build-noindex-list.mjs: writes dist/noindex-urls.json, every built page whose robots meta says
   noindex (gap8-8, 2026-11-15). Runs after the last page generator in "build". The ping script
   (scripts/ping-indexnow.mjs) reads it and skips those URLs, except the ones on the staged retro
   noindex list, which it submits on purpose so an engine recrawls them and sees the tag.

   Shape: { schema, generatedAt, urls }, urls being absolute https://thearchv.ca URLs, sorted.
   The logic is in scripts/shared/noindex-list.mjs, which says why it reads the built pages. */
import { writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SITE } from "./shared/page-shell.mjs";
import { noindexPaths } from "./shared/noindex-list.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = process.env.CONTENT_OUT || join(ROOT, "dist");

if (!existsSync(OUT)) {
  console.error(`[build-noindex-list] FAIL: ${OUT} does not exist; run the page generators first`);
  process.exit(1);
}
const urls = noindexPaths(OUT).map((p) => `${SITE}${p}`);
writeFileSync(
  join(OUT, "noindex-urls.json"),
  JSON.stringify({ schema: "archv-noindex-urls/1", generatedAt: new Date().toISOString(), urls }, null, 2) + "\n",
);
console.log(`[build-noindex-list] wrote noindex-urls.json (${urls.length} noindex page(s))`);
