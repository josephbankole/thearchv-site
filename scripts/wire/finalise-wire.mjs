/* finalise-wire.mjs: merge a candidates file (plus, optionally, the desk's notes file) into the
   Wire content file. It writes no prose. A note that fails lib/grounding.mjs is dropped and the
   item still publishes without it; a desk veto takes the first alternate (which then carries no
   note unless the notes file has one for the alternate's id).

   node scripts/wire/finalise-wire.mjs --candidates c.json [--notes notes.json]
        [--prev scripts/data/daily/wire.json] [--out scripts/data/daily/wire.json] [--check-only] [--now ISO]

   notes.json: { "date": "...", "notes": { "<item id>": "One sentence." }, "vetoes": { "<item id>": "reason" } }
   A same-date edition in --prev is REPLACED, never duplicated, so a rerun is idempotent.
   --check-only runs the note checks and exits 1 with a JSON fix list if any fail. */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "./lib/args.mjs";
import { checkNote } from "./lib/grounding.mjs";
import { SOURCES, sanitiseWire, sanitiseItem } from "./lib/schema.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const KEEP = 7;

export function finalise({ candidates, notes = { notes: {}, vetoes: {} }, prev = { editions: [] }, nowIso, sources = SOURCES }) {
  const rejectedNotes = [];
  const items = [];
  const missing = [...(candidates.missing || []).map((m) => ({ sourceId: m.sourceId, reason: m.reason }))];
  for (const c of candidates.candidates || []) {
    let chosen = c;
    const veto = notes.vetoes?.[c.id];
    if (veto) {
      chosen = c.alternates?.[0] ? { ...c, ...c.alternates[0] } : null;
      if (!chosen) { missing.push({ sourceId: c.sourceId, reason: "vetoed-no-alternate" }); continue; }
    }
    let note = notes.notes?.[chosen.id] ?? null;
    if (note != null) {
      const r = checkNote(note, { headline: chosen.headline, summary: chosen.summary, sourceName: c.sourceName });
      if (!r.ok) { rejectedNotes.push({ id: chosen.id, note, errors: r.errors }); note = null; }
    }
    const item = sanitiseItem({
      id: chosen.id, sport: c.sport, league: c.league, sourceId: c.sourceId, source: c.sourceName,
      headline: chosen.headline, url: chosen.url, publishedAt: chosen.publishedAt, publishedDate: chosen.publishedDate,
      timePrecision: chosen.timePrecision, firstSeenAt: c.firstSeenAt,
      guidKey: chosen.guidKey, urlKey: chosen.urlKey, titleKey: chosen.titleKey, note,
    });
    if (item) items.push(item);
  }
  const required = sources.sources.filter((s) => s.enabled && !s.sporadic).map((s) => s.id);
  const status = required.every((id) => items.some((i) => i.sourceId === id)) ? "complete" : "partial";
  const edition = { date: candidates.date, status, items, missing };
  const editions = [edition, ...prev.editions.filter((e) => e.date !== candidates.date)]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, KEEP);
  return { wire: { version: 1, updatedAt: nowIso, editions }, rejectedNotes };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArgs();
  if (!args.candidates) { console.error("[finalise-wire] --candidates is required"); process.exit(2); }
  const candidates = JSON.parse(readFileSync(args.candidates, "utf8"));
  const notes = args.notes ? JSON.parse(readFileSync(args.notes, "utf8")) : { notes: {}, vetoes: {} };
  const prevPath = args.prev || join(ROOT, "scripts", "data", "daily", "wire.json");
  const prev = existsSync(prevPath) ? sanitiseWire(JSON.parse(readFileSync(prevPath, "utf8"))) : { editions: [] };
  const nowIso = args.now || new Date().toISOString();
  const { wire, rejectedNotes } = finalise({ candidates, notes, prev, nowIso });
  if (args["check-only"]) {
    if (rejectedNotes.length) { console.log(JSON.stringify(rejectedNotes, null, 2)); process.exit(1); }
    console.log("[finalise-wire] all notes pass"); process.exit(0);
  }
  for (const r of rejectedNotes) console.warn(`[finalise-wire] note dropped for ${r.id}: ${r.errors.join(", ")}`);
  const out = args.out || prevPath;
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(wire, null, 2) + "\n");
  const ed = wire.editions[0];
  console.log(`[finalise-wire] ${ed.date} ${ed.status}: ${ed.items.length} item(s), ${ed.items.filter((i) => i.note).length} with a note -> ${out}`);
}
