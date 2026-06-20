/* build-faq.mjs — generates supabase/functions/_shared/faq.ts from the canonical FAQ markdown.
   The markdown at ../support/archv-app-faq.md is the single editable source. The Edge Function
   needs the text bundled at deploy time, so we embed it as a string. Re-run after editing the FAQ:
   npm run faq */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");           // thearchv-site
const SRC = join(ROOT, "..", "support", "archv-app-faq.md");                // fifa.archv/support/...
const OUT = join(ROOT, "supabase", "functions", "_shared", "faq.ts");

const md = readFileSync(SRC, "utf8");
const banner =
  "// GENERATED from support/archv-app-faq.md by scripts/build-faq.mjs. Do not edit by hand.\n" +
  "// Re-run after editing the FAQ:  npm run faq\n";
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, banner + "export const FAQ = " + JSON.stringify(md) + ";\n");
console.log(`[build-faq] wrote ${OUT} (${md.length} chars)`);
