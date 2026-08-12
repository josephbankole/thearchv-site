/* build-faq.mjs — generates supabase/functions/_shared/faq.ts from the canonical FAQ markdown.
   The markdown at ../support/archv-app-faq.md is the single editable source. The Edge Function
   needs the text bundled at deploy time, so we embed it as a string. Re-run after editing the FAQ:
   npm run faq
   NEVER add this to package.json's "build" chain: it reads OUTSIDE the repo root, so it can only
   run in the founder's workspace — in CI (which checks out this repo alone) it is a guaranteed
   ENOENT after Vite has already gone green, the exact head-kits failure of 2026-08-04 (CLAUDE.md
   trap 0). The guard below makes that death immediate and named instead of a bare stack trace. */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");           // thearchv-site
const SRC = join(ROOT, "..", "support", "archv-app-faq.md");                // fifa.archv/support/...
const OUT = join(ROOT, "supabase", "functions", "_shared", "faq.ts");

if (!existsSync(SRC)) {
  console.error(`[build-faq] source not found: ${SRC}\n` +
    `This script reads OUTSIDE the repo (fifa.archv/support/) and only runs in the founder's ` +
    `workspace. It must never join the "build" chain — CI checks out thearchv-site alone.`);
  process.exit(1);
}
const md = readFileSync(SRC, "utf8");
const banner =
  "// GENERATED from support/archv-app-faq.md by scripts/build-faq.mjs. Do not edit by hand.\n" +
  "// Re-run after editing the FAQ:  npm run faq\n";
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, banner + "export const FAQ = " + JSON.stringify(md) + ";\n");
console.log(`[build-faq] wrote ${OUT} (${md.length} chars)`);
