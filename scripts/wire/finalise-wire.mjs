/* finalise-wire.mjs: merge a candidates file (plus, optionally, the desk's notes file) into the
   Wire content file. It writes no prose. A note that fails lib/grounding.mjs is dropped and the
   item still publishes without it; a desk veto takes the first alternate that is neither vetoed
   nor already in the edition (which then carries no note unless the notes file has one for the
   alternate's id).

   node scripts/wire/finalise-wire.mjs --candidates c.json [--notes notes.json]
        [--prev scripts/data/daily/wire.json] [--out scripts/data/daily/wire.json] [--check-only] [--replace] [--now ISO]

   notes.json: { "date": "...", "notes": { "<item id>": "One sentence." }, "vetoes": { "<item id>": "reason" } }
   A same-date edition in --prev is REPLACED, never duplicated, so a rerun is idempotent: an item
   already in it keeps its firstSeenAt and an unchanged file keeps its updatedAt. Nothing is written
   (exit 1) when there are no candidates, when every candidate was vetoed away on a new day, when the notes file
   is dated for another day, or when a rerun would drop a source the same-date edition already had
   for any reason but a veto (pass --replace to accept that). A note or veto id that matches no
   candidate is reported, never ignored.
   --check-only runs the note checks and exits 1 with a JSON fix list if any fail. */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, isMain } from "./lib/args.mjs";
import { checkNote } from "./lib/grounding.mjs";
import { seenFromEditions, addSeen, isSeen } from "./lib/pick.mjs";
import { SOURCES, sanitiseWire, sanitiseItem } from "./lib/schema.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const KEEP = 7;

export function finalise({ candidates, notes = { notes: {}, vetoes: {} }, prev = { editions: [] }, nowIso, sources = SOURCES, replace = false }) {
  const rejectedNotes = [];
  const list = candidates.candidates || [];
  const vetoes = notes.vetoes || {};
  const known = new Set(list.flatMap((c) => [c.id, ...(c.alternates || []).map((a) => a.id)]));
  const unknownIds = [
    ...Object.keys(notes.notes || {}).filter((id) => !known.has(id)).map((id) => ({ kind: "note", id })),
    ...Object.keys(vetoes).filter((id) => !known.has(id)).map((id) => ({ kind: "veto", id })),
  ];
  const refuse = (refused) => ({ wire: null, rejectedNotes, unknownIds, refused });
  if (notes.date != null && notes.date !== candidates.date) return refuse("notes-date-mismatch");
  if (!list.length) return refuse("no-candidates");

  const items = [];
  const missing = [...(candidates.missing || []).map((m) => ({ sourceId: m.sourceId, reason: m.reason }))];
  // A veto takes the STORY out, not just one source's copy of it: the same story under another
  // source id (espn-nba and espn-wnba carry some of the same stories) is vetoed with it.
  const vetoedStories = seenFromEditions([]);
  for (const c of list) for (const x of [c, ...(c.alternates || [])]) if (vetoes[x.id]) addSeen(vetoedStories, x);
  const isVetoed = (x) => Boolean(vetoes[x.id]) || isSeen(vetoedStories, x);
  // Every pick nobody vetoed publishes as itself, so a replacement must not repeat one of them (B3).
  const taken = seenFromEditions([]);
  for (const c of list) if (!isVetoed(c)) addSeen(taken, c);
  for (const c of list) {
    let chosen = c;
    if (isVetoed(c)) {
      const alt = (c.alternates || []).find((a) => !isVetoed(a) && !isSeen(taken, a));
      if (!alt) { missing.push({ sourceId: c.sourceId, reason: "vetoed-no-alternate" }); continue; }
      chosen = { ...c, ...alt };
      addSeen(taken, alt);
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
    }, { sources });
    if (item) items.push(item);
  }

  const prior = (prev.editions || []).find((e) => e.date === candidates.date);
  if (prior) {
    // A rerun must not quietly lose a source the edition already had (a feed down at the second
    // fetch). Only a desk veto may take one out; anything else needs an explicit --replace.
    const vetoedOut = new Set(missing.filter((m) => m.reason === "vetoed-no-alternate").map((m) => m.sourceId));
    const lost = [...new Set((prior.items || []).map((o) => o.sourceId))]
      .filter((id) => !items.some((i) => i.sourceId === id) && !vetoedOut.has(id));
    if (lost.length && !replace) return refuse(`rerun-would-drop:${lost.join(",")}`);
    for (const it of items) {
      const was = prior.items?.find((o) => o.id === it.id);
      if (was?.firstSeenAt) it.firstSeenAt = was.firstSeenAt;
    }
  }
  // Every pick vetoed away: nothing new to publish. With a same-date edition already out, the
  // empty edition is written so the vetoes take effect (readers fall back to the last real one).
  if (!items.length && !prior) return refuse("empty-edition");

  const required = sources.sources.filter((s) => s.enabled && !s.sporadic).map((s) => s.id);
  const status = required.every((id) => items.some((i) => i.sourceId === id)) ? "complete" : "partial";
  const edition = { date: candidates.date, status, items, missing };
  const editions = [edition, ...(prev.editions || []).filter((e) => e.date !== candidates.date)]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, KEEP);
  // An unchanged rerun leaves the file byte for byte as it was, so there is nothing to commit.
  const unchanged = prev.updatedAt && JSON.stringify(editions) === JSON.stringify(prev.editions);
  return { wire: { version: 1, updatedAt: unchanged ? prev.updatedAt : nowIso, editions }, rejectedNotes, unknownIds, refused: null };
}

if (isMain(import.meta.url)) {
  const args = parseArgs();
  if (!args.candidates) { console.error("[finalise-wire] --candidates is required"); process.exit(2); }
  const candidates = JSON.parse(readFileSync(args.candidates, "utf8"));
  const notes = args.notes ? JSON.parse(readFileSync(args.notes, "utf8")) : { notes: {}, vetoes: {} };
  const prevPath = args.prev || join(ROOT, "scripts", "data", "daily", "wire.json");
  const prev = existsSync(prevPath) ? sanitiseWire(JSON.parse(readFileSync(prevPath, "utf8"))) : { editions: [] };
  const nowIso = args.now || new Date().toISOString();
  const { wire, rejectedNotes, unknownIds, refused } = finalise({ candidates, notes, prev, nowIso, replace: !!args.replace });
  if (args["check-only"]) {
    const fixes = [
      ...(refused ? [{ id: null, errors: [refused] }] : []),
      ...unknownIds.map((u) => ({ id: u.id, errors: [`unknown-${u.kind}-id`] })),
      ...rejectedNotes,
    ];
    if (fixes.length) { console.log(JSON.stringify(fixes, null, 2)); process.exit(1); }
    console.log("[finalise-wire] all notes pass"); process.exit(0);
  }
  for (const u of unknownIds) console.warn(`[finalise-wire] ${u.kind} id matches no candidate, ignored: ${u.id}`);
  if (refused) { console.error(`[finalise-wire] refused (${refused}): nothing written`); process.exit(1); }
  for (const r of rejectedNotes) console.warn(`[finalise-wire] note dropped for ${r.id}: ${r.errors.join(", ")}`);
  const out = args.out || prevPath;
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(wire, null, 2) + "\n");
  const ed = wire.editions[0];
  console.log(`[finalise-wire] ${ed.date} ${ed.status}: ${ed.items.length} item(s), ${ed.items.filter((i) => i.note).length} with a note -> ${out}`);
}
