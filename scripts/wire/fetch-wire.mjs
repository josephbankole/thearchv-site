/* fetch-wire.mjs: fetch every enabled source in sources.json, pick the top item per source by
   the rule in lib/pick.mjs, and write a DATED candidates file. It writes no prose: the one-line
   ARCHV note is added later by the daily desk, and an item is valid with or without it.

   node scripts/wire/fetch-wire.mjs [--date YYYY-MM-DD] [--now ISO] [--history wire.json]
        [--out path] [--offline fixtures/dir]

   --history defaults to scripts/data/daily/wire.json; its editions (except one dated --date)
   form the seen set. --offline reads each feed from <dir>/<source id>.xml instead of the network.
   --out defaults to .wire-run/<date>/candidates.json (git-ignored, never committed).
   Exit 0: every enabled non-sporadic source picked. 3: partial. 1: nothing picked. */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, isMain } from "./lib/args.mjs";
import { fetchText } from "./lib/http.mjs";
import { parseFeed } from "./lib/feed-parse.mjs";
import { pickTop, seenFromEditions, addSeen } from "./lib/pick.mjs";
import { dateInZone } from "./lib/time.mjs";
import { SOURCES, sanitiseWire } from "./lib/schema.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export async function fetchWire({ date, nowMs, history, offline, sources = SOURCES }) {
  const seen = seenFromEditions(history.editions, date);
  const candidates = [], missing = [], rejected = [];
  const fetchedAt = new Date(nowMs).toISOString();
  for (const source of sources.sources.filter((s) => s.enabled)) {
    const res = await fetchText(source.feedUrl, { userAgent: sources.userAgent, offline, offlineName: `${source.id}.xml` });
    if (!res.ok) { missing.push({ sourceId: source.id, reason: `fetch-failed:${res.status}` }); continue; }
    let parsed;
    try { parsed = parseFeed(res.body); } catch (err) { missing.push({ sourceId: source.id, reason: "parse-error", detail: err.message }); continue; }
    const r = pickTop(parsed.items, source, { defaults: sources.defaults, seen, nowMs });
    rejected.push(...r.rejected);
    if (!r.pick) { missing.push({ sourceId: source.id, reason: r.reason }); continue; }
    addSeen(seen, r.pick); // the same story across two feeds is taken once, first source wins
    candidates.push({ ...r.pick, firstSeenAt: fetchedAt, alternates: r.alternates });
  }
  return { version: 1, date, fetchedAt, candidates, missing, rejected };
}

if (isMain(import.meta.url)) {
  const args = parseArgs();
  const nowMs = args.now ? Date.parse(args.now) : Date.now();
  const date = args.date || dateInZone(nowMs, SOURCES.editionTimeZone);
  const historyPath = args.history || join(ROOT, "scripts", "data", "daily", "wire.json");
  const history = existsSync(historyPath) ? sanitiseWire(JSON.parse(readFileSync(historyPath, "utf8")), { quiet: true }) : { editions: [] };
  const out = args.out || join(ROOT, ".wire-run", date, "candidates.json");
  const result = await fetchWire({ date, nowMs, history, offline: args.offline || null });
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(result, null, 2) + "\n");
  for (const m of result.missing) console.log(`[fetch-wire]   missing ${m.sourceId}: ${m.reason}`);
  const sporadic = new Set(SOURCES.sources.filter((s) => s.sporadic).map((s) => s.id));
  const requiredMissing = result.missing.filter((m) => !sporadic.has(m.sourceId)).length;
  console.log(`[fetch-wire] ${date}: ${result.candidates.length} picked, ${requiredMissing} required source(s) missing -> ${out}`);
  process.exit(result.candidates.length === 0 ? 1 : requiredMissing ? 3 : 0);
}
