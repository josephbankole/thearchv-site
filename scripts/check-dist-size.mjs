/* check-dist-size.mjs: the size budget for the published site (audit gap2-3, 2026-11-15).

   Vite copies public/ into dist whole, so every file the desks host under public/media for
   Buffer pickup ships in every Pages deploy, and nothing ever prunes them. GitHub Pages documents
   a 1 GB limit for a published site. dist was already about 1.95 GB on 2026-11-15, and media was
   growing by about 100 MB a month.

   This runs last in `npm run build`. It prints the total and the largest top-level folders, warns
   above the documented Pages limit, and FAILS the build above the budget, so the growth stops at
   a line someone chose instead of at a refused deploy. DIST_BUDGET_MB overrides the budget for one
   run. Raising the default is a decision, not a fix: prune public/media or move Buffer media off
   Pages first. */
import { readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = process.env.CONTENT_OUT || join(ROOT, "dist");
const TAG = "[check-dist-size]";
const MB = 1024 * 1024;
const PAGES_LIMIT_MB = 1024;
const DEFAULT_BUDGET_MB = 2500;

export function budgetMb(env = process.env) {
  const raw = env.DIST_BUDGET_MB;
  if (raw === undefined || raw === "") return DEFAULT_BUDGET_MB;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${TAG} DIST_BUDGET_MB must be a positive number, got ${JSON.stringify(raw)}`);
  return n;
}

export function sizeOf(path) {
  const st = statSync(path);
  if (!st.isDirectory()) return st.size;
  let total = 0;
  for (const name of readdirSync(path)) total += sizeOf(join(path, name));
  return total;
}

/** "ok", "warn" or "fail" for a total in bytes against the budget in MB. */
export function verdict(bytes, budget) {
  if (bytes > budget * MB) return "fail";
  if (bytes > PAGES_LIMIT_MB * MB) return "warn";
  return "ok";
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  if (!existsSync(DIST)) {
    console.error(`${TAG} no dist at ${DIST}; run the build first`);
    process.exit(1);
  }
  const budget = budgetMb();
  const total = sizeOf(DIST);
  const top = readdirSync(DIST)
    .map((name) => ({ name, bytes: sizeOf(join(DIST, name)) }))
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 5);
  const mb = (b) => (b / MB).toFixed(0);
  console.log(`${TAG} dist is ${mb(total)} MB (budget ${budget} MB). Largest: ${top.map((t) => `${t.name} ${mb(t.bytes)} MB`).join(", ")}`);
  const v = verdict(total, budget);
  if (v === "warn") console.warn(`${TAG} WARNING: over the ${PAGES_LIMIT_MB} MB GitHub Pages published-site limit. Prune public/media.`);
  if (v === "fail") {
    console.error(`${TAG} FAIL: dist is ${mb(total)} MB, over the ${budget} MB budget. Prune public/media before deploying.`);
    process.exit(1);
  }
}
