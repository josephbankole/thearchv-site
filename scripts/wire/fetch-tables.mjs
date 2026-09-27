/* fetch-tables.mjs: run the table modules in series and write the tables content file.
   Keys come from these environment variables ONLY, read by name and never printed:
   FOOTBALL_DATA_TOKEN, BALLDONTLIE_API_KEY, ARCHV_JOLPICA_PERMITTED. A module without its key
   logs one line and skips; a module that fails holds its previous blocks (tables/common.mjs).

   node scripts/wire/fetch-tables.mjs [--prev scripts/data/daily/tables.json] [--out same]
        [--only football,nfl] [--offline fixtures/dir] [--now ISO]
   Exit 0: every attempted module fresh. 3: something held or skipped. */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, isMain } from "./lib/args.mjs";
import { fetchText } from "./lib/http.mjs";
import { dateInZone } from "./lib/time.mjs";
import { SOURCES, sanitiseTables } from "./lib/schema.mjs";
import { fresh, mergeSport } from "./tables/common.mjs";
import * as football from "./tables/football.mjs";
import * as nfl from "./tables/nfl.mjs";
import * as f1 from "./tables/f1.mjs";
import * as basketball from "./tables/basketball.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const MODULES = { football, nfl, f1, basketball };

export async function fetchTables({ prev, only, offline, nowMs, env, pause }) {
  const today = dateInZone(nowMs, SOURCES.editionTimeZone);
  const fetchedAt = new Date(nowMs).toISOString();
  const get = async (url, { headers = {}, offlineName, text = false } = {}) => {
    const r = await fetchText(url, { userAgent: SOURCES.userAgent, headers, offline, offlineName });
    if (!r.ok || text) return r;
    try { return { ...r, json: JSON.parse(r.body) }; } catch { return { ok: false, status: "bad-json" }; }
  };
  const out = { version: 1, updatedAt: fetchedAt, sports: { ...prev.sports } };
  const report = {};
  for (const [sport, mod] of Object.entries(MODULES)) {
    if (only && !only.includes(sport)) continue;
    let result;
    try { result = await mod.run({ get, today, env, pause }); }
    catch (err) { result = { blocks: [], failed: {}, skipped: `error:${err.message}` }; }
    const blocks = (result.blocks || []).map((b) => fresh(b, { today, fetchedAt }));
    const merged = mergeSport(prev.sports[sport]?.blocks, { ...result, blocks }, today);
    if (merged.length) out.sports[sport] = { blocks: merged }; else delete out.sports[sport];
    report[sport] = { fresh: blocks.map((b) => b.id), held: merged.filter((b) => b.status === "held").map((b) => `${b.id} (${b.heldReason})`), skipped: result.skipped || null };
  }
  return { tables: sanitiseTables(out), report };
}

if (isMain(import.meta.url)) {
  const args = parseArgs();
  const prevPath = args.prev || join(ROOT, "scripts", "data", "daily", "tables.json");
  const prev = existsSync(prevPath) ? sanitiseTables(JSON.parse(readFileSync(prevPath, "utf8"))) : { sports: {} };
  const env = { FOOTBALL_DATA_TOKEN: process.env.FOOTBALL_DATA_TOKEN, BALLDONTLIE_API_KEY: process.env.BALLDONTLIE_API_KEY, ARCHV_JOLPICA_PERMITTED: process.env.ARCHV_JOLPICA_PERMITTED };
  const { tables, report } = await fetchTables({
    prev, only: args.only ? String(args.only).split(",") : null, offline: args.offline || null,
    nowMs: args.now ? Date.parse(args.now) : Date.now(), env, pause: args.offline ? 0 : 13000,
  });
  const out = args.out || prevPath;
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(tables, null, 2) + "\n");
  let clean = true;
  for (const [sport, r] of Object.entries(report)) {
    if (r.held.length || r.skipped) clean = false;
    console.log(`[fetch-tables] ${sport}: fresh ${r.fresh.join(", ") || "none"}${r.held.length ? ` | held ${r.held.join(", ")}` : ""}${r.skipped ? ` | skipped ${r.skipped}` : ""}`);
  }
  console.log(`[fetch-tables] -> ${out}`);
  process.exit(clean ? 0 : 3);
}
