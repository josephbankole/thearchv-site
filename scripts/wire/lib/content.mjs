/* content.mjs: load the two Wire content files for a build step. Fail-soft on content (bad
   items and blocks are dropped by schema.mjs with a log line); unparseable JSON throws, because
   the commit tool must never have let it through. WIRE_DATA_DIR points a build at other files
   (the verification build uses the test fixtures; they are never committed as live content).
   WIRE_TODAY pins the build date for the same reason. */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { sanitiseWire, sanitiseTables, SOURCES } from "./schema.mjs";
import { dateInZone } from "./time.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

export function loadDaily() {
  const dir = process.env.WIRE_DATA_DIR || join(ROOT, "scripts", "data", "daily");
  const read = (name) => {
    const file = join(dir, name);
    if (!existsSync(file)) return null;
    try { return JSON.parse(readFileSync(file, "utf8")); }
    catch (err) { throw new Error(`[wire] ${file} is not valid JSON: ${err.message}`); }
  };
  const wire = sanitiseWire(read("wire.json") || {});
  const tables = sanitiseTables(read("tables.json") || {});
  const today = process.env.WIRE_TODAY || dateInZone(Date.now(), SOURCES.editionTimeZone);
  return { wire, tables, today, dir };
}
