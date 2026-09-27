import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sanitiseWire, sanitiseTables, buildWireFeed, buildTablesFeed, currentEdition, WIRE_SCHEMA, TABLES_SCHEMA } from "../lib/schema.mjs";
import { checkNote } from "../lib/grounding.mjs";
import { verify } from "../verify-wire.mjs";
import { finalise } from "../finalise-wire.mjs";
import { renderWireStrip, renderTableBlock } from "../lib/render.mjs";

const load = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const wire = sanitiseWire(load("./fixtures/daily/wire.json"), { quiet: true });
const tables = sanitiseTables(load("./fixtures/daily/tables.json"), { quiet: true });
const candidates = load("./fixtures/golden-candidates.json");

test("wire feed shape: versioned, latest edition only, never a days/lead/wrap key", () => {
  const f = buildWireFeed(wire, { generatedAt: "2026-09-27T09:33:10Z" });
  assert.equal(f.schema, WIRE_SCHEMA);
  for (const k of ["days", "lead", "wrap"]) assert.equal(k in f, false, k);
  assert.deepEqual(Object.keys(f), ["schema", "generatedAt", "edition", "items", "footer"]);
  assert.deepEqual(f.edition, { date: "2026-09-27", status: "partial", timeZone: "America/Toronto" });
  const it = f.items[0];
  assert.deepEqual(Object.keys(it), ["id", "sport", "league", "source", "headline", "url", "publishedAt", "publishedDate", "timePrecision", "note"]);
  assert.deepEqual(Object.keys(it.source), ["id", "name"]);
  assert.ok(f.items.every((i) => !("summary" in i) && !("body" in i) && !("image" in i)));
  assert.ok(f.items.some((i) => i.note === null), "an item without a note is valid");
  assert.match(f.footer, /provided by ESPN/);
});

test("an empty content file gives an empty but valid feed", () => {
  const f = buildWireFeed(sanitiseWire({ version: 1, updatedAt: null, editions: [] }), { generatedAt: "x" });
  assert.equal(f.edition, null);
  assert.deepEqual(f.items, []);
});

test("tables feed shape: versioned, per-sport blocks, attribution carried, no crest fields", () => {
  const f = buildTablesFeed(tables, { generatedAt: "2026-09-27T09:33:10Z" });
  assert.equal(f.schema, TABLES_SCHEMA);
  for (const k of ["days", "lead", "wrap"]) assert.equal(k in f, false, k);
  const pl = f.sports.football.blocks.find((b) => b.id === "pl-table");
  assert.equal(pl.rows.length, 20);
  assert.equal(pl.rows.filter((r) => r.highlight).length, 1);
  assert.ok(Object.values(f.sports).every((s) => s.blocks.every((b) => b.source.attribution)));
  assert.ok(!/crest|emblem|logo|badge|thumb/i.test(JSON.stringify(f)));
  assert.equal(f.sports.nfl.blocks.find((b) => b.id === "nfl-standings").rows.length, 32);
});

test("sanitise drops a hostile or malformed item and keeps the rest (fail-soft)", () => {
  const raw = load("./fixtures/daily/wire.json");
  raw.editions[0].items.push({ ...raw.editions[0].items[0], id: "x:1", url: "javascript:alert(1)" });
  raw.editions[0].items.push({ ...raw.editions[0].items[0], id: "x:2", url: "https://espn.com.evil.net/x" });
  raw.editions[0].items.push({ ...raw.editions[0].items[0], id: "x:3", sport: "cricket" });
  const s = sanitiseWire(raw, { quiet: true });
  assert.equal(s.editions[0].items.length, wire.editions[0].items.length);
});

test("an edition older than seven days is not shown; a dated one is labelled, never 'today'", () => {
  assert.equal(currentEdition(wire, "2026-10-05"), null);
  const html = renderWireStrip(wire, "football", "2026-09-29");
  assert.match(html, /Edition of <time datetime="2026-09-27">Sunday 27 September<\/time>\. <span class="wire__stale">No new edition since then/);
  assert.ok(!/today/i.test(html.replace(/Headlines from other newsrooms[^<]*/, "")));
  assert.match(html, /target="_blank" rel="noopener noreferrer"/);
  assert.ok(!/<img/i.test(html));
});

test("a held table block says 'Last updated' and disappears after three held days", () => {
  const b = { ...tables.sports.football.blocks[0], status: "held", heldDays: 2 };
  assert.match(renderTableBlock(b, { today: "2026-09-27" }), /Last updated 27 September 2026\. Results to 20 September 2026/);
  assert.equal(renderTableBlock({ ...b, heldDays: 4 }, { today: "2026-09-27" }), "");
  assert.match(renderTableBlock(tables.sports.football.blocks[0], { today: "2026-09-27" }), /Updated 27 September 2026\. Results to 20 September 2026\.<\/span> <a [^>]+>Fixtures and results: openfootball/);
});

test("verify-wire is byte exact: a non-breaking space or a changed URL fails", () => {
  const final = load("./fixtures/daily/wire.json");
  assert.deepEqual(verify(candidates, final).problems, []);
  const nbsp = structuredClone(final);
  nbsp.editions[0].items[0].headline = nbsp.editions[0].items[0].headline.replace(" ", " ");
  assert.deepEqual(verify(candidates, nbsp).problems.map((p) => p.field), ["headline"]);
  const utm = structuredClone(final);
  utm.editions[0].items[1].url += "?utm_source=archv";
  assert.deepEqual(verify(candidates, utm).problems.map((p) => p.field), ["url"]);
});

test("a note frames and never asserts: the grounding hard fails", () => {
  const item = { headline: "Sources: Fixture Bulls trade Placeholder Guard to Fixture Hornets", summary: "Sources said the Bulls would trade the guard.", sourceName: "ESPN" };
  assert.ok(checkNote("ESPN reports the move on the word of sources, and neither club has spoken on it yet.", item).ok);
  const bad = (n) => checkNote(n, item).errors;
  assert.ok(bad("The Bulls have moved the guard on, and the Hornets now have to fit him in.").includes("hedged-item-needs-attribution"));
  assert.ok(bad("ESPN reports the Bulls traded the guard to the Hornets and the deal is done.").some((e) => e.startsWith("completion-verb")));
  assert.ok(bad("ESPN reports the guard is heading to the Hornets, per Shams and the wider league.").some((e) => e.startsWith("name-not-in-item")));
  assert.ok(bad("ESPN reports it, with 3 teams involved in a trade that is still to be finished.").some((e) => e.startsWith("number-not-in-item")));
  assert.ok(bad("ESPN reports the guard will not move until the Hornets clear room for him.").some((e) => e.startsWith("negation-not-in-item")));
  assert.ok(bad("Short.").includes("length"));
});

test("finalise drops a failing note but keeps its item, and a veto takes the first alternate", () => {
  const notes = { notes: { [candidates.candidates[4].id]: "Chicago has traded the guard to Charlotte in a 3 player deal." }, vetoes: { [candidates.candidates[0].id]: "graphic" } };
  const { wire: w, rejectedNotes } = finalise({ candidates, notes, prev: { editions: [] }, nowIso: "2026-09-27T09:28:40Z" });
  const ed = w.editions[0];
  assert.equal(rejectedNotes.length, 1);
  assert.equal(ed.items.find((i) => i.id === candidates.candidates[4].id).note, null);
  assert.equal(ed.items.find((i) => i.sourceId === "espn-soccer").headline, candidates.candidates[0].alternates[0].headline);
});
