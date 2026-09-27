import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, symlinkSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { sanitiseWire, sanitiseTables, sanitiseItem, sanitiseBlock, buildWireFeed, buildTablesFeed, currentEdition, WIRE_SCHEMA, TABLES_SCHEMA } from "../lib/schema.mjs";
import { checkNote } from "../lib/grounding.mjs";
import { verify } from "../verify-wire.mjs";
import { finalise } from "../finalise-wire.mjs";
import { renderWireStrip, renderTableBlock, renderTablesStrip, renderWireItem, hasVisibleTables } from "../lib/render.mjs";
import { wireLinkProblems } from "../../check-wire-links.mjs";

const load = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
// The frozen registry copy, never the live sources.json (see pick.test.mjs).
const SOURCES = load("./fixtures/sources.json");
const wire = sanitiseWire(load("./fixtures/daily/wire.json"), { quiet: true, sources: SOURCES });
const tables = sanitiseTables(load("./fixtures/daily/tables.json"), { quiet: true });
const candidates = load("./fixtures/golden-candidates.json");

test("wire feed shape: versioned, latest edition only, never a days/lead/wrap key", () => {
  const f = buildWireFeed(wire, { generatedAt: "2026-09-27T09:33:10Z", sources: SOURCES });
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
  const f = buildWireFeed(sanitiseWire({ version: 1, updatedAt: null, editions: [] }), { generatedAt: "x", sources: SOURCES });
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
  const s = sanitiseWire(raw, { quiet: true, sources: SOURCES });
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
  const { wire: w, rejectedNotes } = finalise({ candidates, notes, prev: { editions: [] }, nowIso: "2026-09-27T09:28:40Z", sources: SOURCES });
  const ed = w.editions[0];
  assert.equal(rejectedNotes.length, 1);
  assert.equal(ed.items.find((i) => i.id === candidates.candidates[4].id).note, null);
  assert.equal(ed.items.find((i) => i.sourceId === "espn-soccer").headline, candidates.candidates[0].alternates[0].headline);
});

const fin = (cands, notes) => finalise({ candidates: cands, notes, prev: { editions: [] }, nowIso: "2026-09-27T09:28:40Z", sources: SOURCES });
const itemOf = (i) => ({ headline: candidates.candidates[i].headline, summary: candidates.candidates[i].summary, sourceName: "ESPN" });

test("the feed and the sanitiser follow the registry they are given, not the live one", () => {
  const f = buildWireFeed(wire, { generatedAt: "x", sources: { ...SOURCES, footer: "Test footer.", editionTimeZone: "UTC" } });
  assert.equal(f.footer, "Test footer.");
  assert.equal(f.edition.timeZone, "UTC");
  const off = structuredClone(SOURCES);
  off.sources.find((s) => s.id === "espn-golf").enabled = false;
  const s = sanitiseWire(load("./fixtures/daily/wire.json"), { quiet: true, sources: off });
  assert.ok(!s.editions[0].items.some((i) => i.sourceId === "espn-golf"));
});

test("an item is bound to its own source: unknown or disabled sources and foreign hosts are dropped, the label is the registry's", () => {
  const base = { ...wire.editions[0].items.find((i) => i.sourceId === "espn-nfl") };
  const opts = { quiet: true, sources: SOURCES };
  assert.equal(sanitiseItem({ ...base, sourceId: "yahoo-nfl-typo", url: "https://sports.yahoo.com/nfl/x" }, opts), null);
  assert.equal(sanitiseItem({ ...base, url: "https://sports.yahoo.com/nfl/x" }, opts), null, "espn-nfl may not link to yahoo.com");
  assert.equal(sanitiseItem({ ...base, sourceId: "yahoo-nfl", source: "Yahoo Sports", url: "https://sports.yahoo.com/nfl/x" }, opts), null, "a disabled source never publishes");
  assert.equal(sanitiseItem({ ...base, source: "Yahoo Sports" }, opts).source, "ESPN");
});

test("a veto walks every alternate, skipping vetoed ones and stories already in the edition", () => {
  const c = structuredClone(candidates);
  const soccer = c.candidates[0];
  const alt2 = { ...soccer.alternates[0], id: "espn-soccer:0000000000a2", headline: "Placeholder Athletic appoint interim coach", url: "https://www.espn.com/soccer/story/_/id/90000009/interim", guidKey: "0000000000a2", urlKey: "0000000000b2", titleKey: "0000000000c2" };
  soccer.alternates.push(alt2);
  // The pick and its first alternate are both vetoed: the second alternate publishes.
  const both = { vetoes: { [soccer.id]: "graphic", [soccer.alternates[0].id]: "betting" } };
  const ed = fin(c, both).wire.editions[0];
  assert.equal(ed.items.find((i) => i.sourceId === "espn-soccer").id, alt2.id);
  assert.ok(!ed.items.some((i) => i.id === soccer.alternates[0].id), "a vetoed alternate never publishes");
  // Every entry vetoed: the source is missing, nothing vetoed ships.
  const all = fin(c, { vetoes: { ...both.vetoes, [alt2.id]: "graphic" } }).wire.editions[0];
  assert.ok(!all.items.some((i) => i.sourceId === "espn-soccer"));
  assert.ok(all.missing.some((m) => m.sourceId === "espn-soccer" && m.reason === "vetoed-no-alternate"));
  // The NBA alternate is the story the WNBA source already picked: it is skipped, not repeated.
  const d = structuredClone(candidates);
  const nba = d.candidates[4], wnba = d.candidates[5];
  const dup = { ...nba.alternates[0], id: "espn-nba:00000000dup1", headline: wnba.headline, url: wnba.url, guidKey: null, urlKey: wnba.urlKey, titleKey: wnba.titleKey };
  nba.alternates.unshift(dup);
  const e2 = fin(d, { vetoes: { [nba.id]: "betting" } }).wire.editions[0];
  assert.equal(e2.items.filter((i) => i.headline === wnba.headline).length, 1);
  assert.equal(e2.items.find((i) => i.sourceId === "espn-nba").id, nba.alternates[1].id);
});

test("a veto takes the story out under every source, not only the vetoed item id", () => {
  const d = structuredClone(candidates);
  const nba = d.candidates[4], wnba = d.candidates[5];
  // The WNBA pick is the same story as the NBA pick (same canonical URL and title), under another id.
  wnba.headline = nba.headline; wnba.url = nba.url; wnba.urlKey = nba.urlKey; wnba.titleKey = nba.titleKey; wnba.guidKey = null;
  const ed = fin(d, { vetoes: { [nba.id]: "betting" } }).wire.editions[0];
  assert.ok(!ed.items.some((i) => i.headline === nba.headline), "the vetoed story never ships, under either source");
});

test("the notes gate refuses base-form completion verbs the item does not use", () => {
  const item = { headline: "Placeholder United close in on striker", summary: "Talks continue.", sourceName: "ESPN" };
  assert.ok(checkNote("ESPN reports Placeholder United sign the striker, so the fee is the thing to watch.", item).errors.includes("completion-verb-not-in-item:sign"));
  assert.ok(checkNote("ESPN reports the Bears win again, and the defence is the thing to watch.", { headline: "Bears face Lions", summary: "", sourceName: "ESPN" }).errors.includes("completion-verb-not-in-item:win"));
});

test("a note or veto id that matches no candidate is reported, and a notes file for another day is refused", () => {
  const typo = { date: "2026-09-27", notes: { "espn-soccer:f02ff836625X": "ESPN reports the absence on the word of sources, so the length is the thing to watch." }, vetoes: { "espn-nba:typo": "betting" } };
  const r = fin(candidates, typo);
  assert.deepEqual(r.unknownIds, [{ kind: "note", id: "espn-soccer:f02ff836625X" }, { kind: "veto", id: "espn-nba:typo" }]);
  // A veto keyed on an alternate is a real id, not an unknown one.
  assert.deepEqual(fin(candidates, { vetoes: { [candidates.candidates[0].alternates[0].id]: "x" } }).unknownIds, []);
  const stale = fin(candidates, { date: "2026-09-26", notes: {}, vetoes: {} });
  assert.equal(stale.wire, null);
  assert.equal(stale.refused, "notes-date-mismatch");
});

test("the notes gate refuses a present-tense result as firmly as a past-tense one", () => {
  const bad = (n, i) => checkNote(n, itemOf(i)).errors;
  assert.ok(bad("The Lynx wins the opener, and the Liberty now joins the list of teams chasing the series.", 5).includes("completion-verb-not-in-item:wins"));
  assert.ok(bad("The Lynx wins the opener, and the Liberty now joins the list of teams chasing the series.", 5).includes("completion-verb-not-in-item:joins"));
  assert.ok(bad("ESPN says the Lynx beats the Liberty in the opener of the semifinal series.", 5).includes("completion-verb-not-in-item:beats"));
  const trade = bad("ESPN reports the Bulls completes the move and the Hornets confirms the guard will report.", 4);
  assert.ok(trade.includes("completion-verb-not-in-item:completes") && trade.includes("completion-verb-not-in-item:confirms"));
  // The same verb in the item is fine: the note only repeats what ESPN says.
  assert.ok(checkNote("ESPN reports the Packers signed him, so where he fits on the line is the thing to watch.", itemOf(1)).ok);
});

test("the notes gate compares whole names and whole numbers, and checks a name in first position", () => {
  const knee = { headline: "Fixture Bulls forward out for the season with knee injury", summary: "", sourceName: "ESPN" };
  assert.ok(checkNote("The club now turns to Ward and Price as the season runs on for the Fixture Bulls.", knee).errors.includes("name-not-in-item:Ward"));
  const title = { headline: "Fixture Rovers clinch 21st league title with 3 games left", summary: "", sourceName: "ESPN" };
  const nums = checkNote("The Rovers need 1 more point from 2 games to finish the run in style.", title).errors;
  assert.ok(nums.includes("number-not-in-item:1") && nums.includes("number-not-in-item:2"));
  assert.ok(checkNote("The Rovers have 3 games left to add to the title, and the run home is the thing to watch.", title).ok);
  assert.ok(checkNote("Shams is the voice to watch as the Lynx and the Liberty open the semifinal on Sunday.", itemOf(5)).errors.includes("name-not-in-item:Shams"));
  assert.ok(checkNote("Placeholder Liberty face the Lynx on Sunday, and the first game is the one to watch.", itemOf(5)).ok);
});

test("the notes gate does not mistake abbreviations for sentence ends or apostrophes for quotation marks", () => {
  const open = { headline: "Placeholder Player into U.S. Open quarterfinal", summary: "", sourceName: "ESPN" };
  assert.deepEqual(checkNote("The last eight at the U.S. Open is the next test, and the draw is the thing to watch.", open).errors, []);
  const paul = { headline: "Fixture Lynx host Placeholder Liberty in St. Paul", summary: "", sourceName: "ESPN" };
  assert.deepEqual(checkNote("The series opens in St. Paul, and the Lynx have the first home game of it.", paul).errors, []);
  assert.deepEqual(checkNote("The players' semifinal opens on Sunday, with the Lynx at home in the first game.", itemOf(5)).errors, []);
  assert.deepEqual(checkNote("The Lynx’s semifinal opens on Sunday against the Liberty, at home in the first game.", itemOf(5)).errors, []);
  // Real quotation marks and real second sentences still fail.
  assert.ok(checkNote("The Lynx call it a ‘must win’ game on Sunday against the Liberty at home.", itemOf(5)).errors.includes("quotation-marks"));
  assert.ok(checkNote("The series opens in St. Paul. The Lynx have the first home game of it.", paul).errors.includes("more-than-one-sentence"));
});

test("verify-wire fails when the file has no edition for the candidates' date", () => {
  const r = verify(candidates, { editions: [{ date: "2026-09-26", items: [] }] });
  assert.deepEqual(r.problems.map((p) => p.issue), ["no-edition-for-date"]);
  assert.deepEqual(verify(candidates, {}).problems.map((p) => p.issue), ["no-edition-for-date"]);
});

test("the Wire CLIs run when reached through a symlinked path", () => {
  const tmp = mkdtempSync(join(tmpdir(), "wire-cli-"));
  try {
    const wireDir = fileURLToPath(new URL("..", import.meta.url));
    symlinkSync(wireDir, join(tmp, "wire"));
    const bad = load("./fixtures/daily/wire.json");
    bad.editions[0].items[0].headline += " (edited)";
    const final = join(tmp, "final.json");
    writeFileSync(final, JSON.stringify(bad));
    const golden = fileURLToPath(new URL("./fixtures/golden-candidates.json", import.meta.url));
    const run = spawnSync(process.execPath, [join(tmp, "wire", "verify-wire.mjs"), "--candidates", golden, "--final", final], { encoding: "utf8" });
    assert.equal(run.status, 1, "the byte gate must not pass silently");
    assert.match(run.stdout, /"field": "headline"/);
    const notes = join(tmp, "notes.json");
    writeFileSync(notes, JSON.stringify({ date: "2026-09-27", notes: {}, vetoes: { "espn-nba:typo": "betting" } }));
    const check = spawnSync(process.execPath, [join(tmp, "wire", "finalise-wire.mjs"), "--check-only", "--candidates", golden, "--notes", notes, "--prev", join(tmp, "none.json")], { encoding: "utf8" });
    assert.equal(check.status, 1, "an unknown veto id is not 'all notes pass'");
    assert.match(check.stdout, /unknown-veto-id/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

/* ---------- render group: fail-soft dates, links, scores, a11y (PR #18 review) ---------- */

test("a malformed or impossible row date is dropped by the sanitiser and never throws in the renderer (build-2, security-1)", () => {
  const raw = load("./fixtures/daily/tables.json");
  const week = raw.sports.nfl.blocks.find((b) => b.id === "nfl-week");
  week.rows[0].date = "TBD";
  week.rows[1].date = "2026-10-10T14:00Z";
  const mu = raw.sports.football.blocks.find((b) => b.id === "mu-next");
  mu.rows[0].date = "2026-02-31";
  const t = sanitiseTables(raw, { quiet: true });
  const rows = t.sports.nfl.blocks.find((b) => b.id === "nfl-week").rows;
  assert.equal(rows.length, week.rows.length, "the row is kept, only its bad date goes");
  assert.equal("date" in rows[0], false);
  assert.equal("date" in rows[1], false);
  assert.equal("date" in t.sports.football.blocks.find((b) => b.id === "mu-next").rows[0], false);
  assert.doesNotThrow(() => renderTablesStrip(t, "nfl", "2026-09-27"));
  assert.match(renderTablesStrip(t, "nfl", "2026-09-27"), /Buffalo Bills/);
  // The renderer is defensive on its own: a block that skipped the sanitiser still renders.
  const unsafe = { ...tables.sports.nfl.blocks.find((b) => b.id === "nfl-week"), rows: [{ date: "TBD", home: "A", away: "B" }] };
  assert.doesNotThrow(() => renderTableBlock(unsafe, { today: "2026-09-27" }));
  const ev = { id: "ev", kind: "event", title: "Events", asOf: "2026-09-27", rows: [{ name: "GP", starts: "2026-10-??", ends: "2026-10-12" }], source: { name: "x", attribution: "Data: x." } };
  const evs = sanitiseBlock(ev, { quiet: true });
  assert.deepEqual(evs.rows[0], { name: "GP", ends: "2026-10-12" });
  assert.doesNotThrow(() => renderTableBlock({ ...evs, rows: ev.rows, status: "fresh", heldDays: 0, lastFreshAsOf: "2026-09-27" }, { today: "2026-09-27" }));
});

test("isDate rejects impossible calendar dates: an edition or block dated 31 February is dropped (security-6)", () => {
  const raw = load("./fixtures/daily/wire.json");
  raw.editions.push({ ...raw.editions[0], date: "2026-02-31" });
  const s = sanitiseWire(raw, { quiet: true, sources: SOURCES });
  assert.ok(!s.editions.some((e) => e.date === "2026-02-31"));
  assert.equal(s.editions.length, wire.editions.length);
  const b = load("./fixtures/daily/tables.json").sports.football.blocks[0];
  assert.equal(sanitiseBlock({ ...b, asOf: "2026-02-31" }, { quiet: true }), null);
  assert.ok(sanitiseBlock({ ...b, asOf: "2028-02-29" }, { quiet: true }), "a real leap day is kept");
  const item = { ...load("./fixtures/daily/wire.json").editions[0].items[0], publishedDate: "2026-04-31" };
  assert.equal(sanitiseItem(item, { quiet: true, sources: SOURCES }), null);
});

test("a betting-path Wire link is dropped by the sanitiser, and the build check tests the path the way the pick does (security-2)", () => {
  const base = { ...wire.editions[0].items.find((i) => i.sourceId === "espn-nfl") };
  const opts = { quiet: true, sources: SOURCES };
  assert.equal(sanitiseItem({ ...base, url: "https://www.espn.com/espn/betting/story/_/id/7/x" }, opts), null);
  assert.equal(sanitiseItem({ ...base, url: "https://www.espn.com/nfl/video/_/id/7" }, opts), null, "every excludePaths rule applies, not only /betting/");
  // The pick tests the path only, so a query or fragment carrying /betting/ is not a betting page.
  const q = "https://www.espn.com/nfl/story/_/id/12/x?ex=/betting/";
  assert.ok(sanitiseItem({ ...base, url: q }, opts));
  const tag = (href, src = "espn-nfl") => `<a href="${href}" target="_blank" rel="noopener noreferrer" data-wire-source="${src}" data-wire-sport="nfl" data-wire-pos="1">`;
  assert.deepEqual(wireLinkProblems(tag(q), SOURCES), []);
  assert.deepEqual(wireLinkProblems(tag("https://www.espn.com/nfl/story/_/id/13/x#/betting/"), SOURCES), []);
  assert.equal(wireLinkProblems(tag("https://www.espn.com/espn/betting/story/_/id/7/x"), SOURCES).length, 1);
  assert.equal(wireLinkProblems(tag("https://www.espn.com/nfl/fantasy/x"), SOURCES).length, 1);
  assert.equal(wireLinkProblems(`<a href="https://www.espn.com/nfl/x" data-wire-source="espn-nfl">`, SOURCES).length, 2, "target and rel still enforced");
  // Importing the check for its helper must not hide the CLI: run on a dist with no pages, it fails loudly.
  const tmp = mkdtempSync(join(tmpdir(), "wire-dist-"));
  try {
    const run = spawnSync(process.execPath, [fileURLToPath(new URL("../../check-wire-links.mjs", import.meta.url)), tmp], { encoding: "utf8" });
    assert.equal(run.status, 1);
    assert.match(run.stderr, /\/wire\/: missing/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("a results row with one score or a non-finite score renders 'v', never 'undefined' or 'NaN' (security-7)", () => {
  const b = structuredClone(tables.sports.nfl.blocks.find((x) => x.id === "nfl-results"));
  const raw = { ...b, rows: [
    { date: "2026-09-17", home: "A", away: "B", homeScore: 3 },
    { date: "2026-09-17", home: "C", away: "D", homeScore: Number.NaN, awayScore: 2 },
    { date: "2026-09-17", home: "E", away: "F", homeScore: 1, awayScore: Infinity },
    { date: "2026-09-17", home: "G", away: "H", homeScore: 2, awayScore: 0 },
  ] };
  const s = sanitiseBlock(raw, { quiet: true });
  assert.equal("homeScore" in s.rows[1], false, "NaN is not kept");
  assert.equal("awayScore" in s.rows[2], false, "Infinity is not kept");
  for (const blk of [s, { ...s, rows: raw.rows }]) {
    const html = renderTableBlock(blk, { today: "2026-09-27" });
    assert.ok(!/undefined|NaN|Infinity/.test(html), html);
    assert.equal((html.match(/tblock__score/g) || []).length, 1);
    assert.match(html, /tblock__score">2 to 0</);
  }
});

test("the sport sections on /wire/ and /tables/ clear the sticky sport nav when reached by anchor (ux-2)", () => {
  const shell = readFileSync(new URL("../../shared/page-shell.mjs", import.meta.url), "utf8");
  const region = shell.slice(shell.indexOf("/* wire:start"), shell.indexOf("/* wire:end */"));
  const rule = region.match(/([^{}]*)\{[^}]*scroll-margin-top:\s*[1-9][\d.]*rem[^}]*\}/);
  assert.ok(rule, "a scroll-margin-top rule exists in the wire region");
  for (const sel of [".wire-sport", ".tables", ".tblock"]) assert.ok(rule[1].includes(sel), sel);
});

test("with no current edition and no tables, /wire/ and /tables/ are noindex and promise nothing (ux-4)", () => {
  const empty = { version: 1, updatedAt: null, sports: {} };
  assert.equal(hasVisibleTables(sanitiseTables(empty), "2026-09-27"), false);
  assert.equal(hasVisibleTables(tables, "2026-09-27"), true);
  assert.equal(hasVisibleTables(tables, "2026-12-27"), false, "blocks too old to show do not count");
  const tmp = mkdtempSync(join(tmpdir(), "wire-pages-"));
  try {
    const data = join(tmp, "data"), out = join(tmp, "out");
    mkdirSync(data);
    writeFileSync(join(data, "wire.json"), JSON.stringify({ version: 1, updatedAt: null, editions: [] }));
    writeFileSync(join(data, "tables.json"), JSON.stringify(empty));
    const script = fileURLToPath(new URL("../../build-daily-pages.mjs", import.meta.url));
    const run = spawnSync(process.execPath, [script], { encoding: "utf8", env: { ...process.env, WIRE_DATA_DIR: data, WIRE_TODAY: "2026-09-27", CONTENT_OUT: out } });
    assert.equal(run.status, 0, run.stderr);
    const wireHtml = readFileSync(join(out, "wire", "index.html"), "utf8");
    const tablesHtml = readFileSync(join(out, "tables", "index.html"), "utf8");
    for (const html of [wireHtml, tablesHtml]) assert.match(html, /<meta name="robots" content="noindex,follow"/);
    const desc = (html) => html.match(/<meta name="description" content="([^"]*)"/)[1];
    assert.ok(!/Premier League|Manchester United|one headline a day from each/.test(desc(tablesHtml) + desc(wireHtml)), desc(tablesHtml) + " | " + desc(wireHtml));
    assert.ok(!/in the last seven days/.test(wireHtml));
    // With content, /tables/ is indexable again (the founder's ruling stands when there is something to index).
    const fx = fileURLToPath(new URL("./fixtures/daily/", import.meta.url));
    const full = spawnSync(process.execPath, [script], { encoding: "utf8", env: { ...process.env, WIRE_DATA_DIR: fx, WIRE_TODAY: "2026-09-27", CONTENT_OUT: out } });
    assert.equal(full.status, 0, full.stderr);
    assert.match(readFileSync(join(out, "tables", "index.html"), "utf8"), /<meta name="robots" content="index,follow/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("division and conference rows are row-group headers, one tbody per group (ux-6)", () => {
  const nfl = tables.sports.nfl.blocks.find((b) => b.id === "nfl-standings");
  const html = renderTableBlock(nfl, { today: "2026-09-27" });
  assert.ok(!/colgroup/.test(html));
  const groups = new Set(nfl.rows.map((r) => r.group)).size;
  assert.equal((html.match(/<tbody>/g) || []).length, groups);
  assert.equal((html.match(/<th scope="rowgroup" colspan="\d+">/g) || []).length, groups);
  assert.match(html, /<tbody>\s*<tr class="tblock__group"><th scope="rowgroup"[^>]*>AFC East<\/th><\/tr>/);
  // An ungrouped table keeps a single tbody and no group rows.
  const pl = renderTableBlock(tables.sports.football.blocks.find((b) => b.id === "pl-table"), { today: "2026-09-27" });
  assert.equal((pl.match(/<tbody>/g) || []).length, 1);
  assert.ok(!/rowgroup/.test(pl));
});

test("every outbound link tells a screen reader it opens a new tab (ux-8)", () => {
  const hint = /<span class="visually-hidden"> \(opens in a new tab\)<\/span><\/a>/;
  assert.match(renderWireItem(wire.editions[0].items[0], 1), hint);
  const html = renderTableBlock(tables.sports.nfl.blocks[0], { today: "2026-09-27" });
  const links = html.match(/<a [^>]*target="_blank"[^>]*>.*?<\/a>/g) || [];
  assert.ok(links.length >= 2);
  for (const a of links) assert.match(a, hint);
});

test("a source whose attribution already credits The ARCHV is not told 'Adapted by The ARCHV' twice (ux-9)", () => {
  const foot = (b) => renderTableBlock(b, { today: "2026-09-27" }).match(/<p class="tblock__foot">.*<\/p>/)[0];
  for (const b of [tables.sports.football.blocks[0], tables.sports.nfl.blocks[0]]) {
    assert.equal((foot(b).match(/The ARCHV/g) || []).length, 1, foot(b));
    assert.ok(!/Adapted by/.test(foot(b)));
  }
  const wiki = { ...tables.sports.football.blocks[0], source: { name: "Wikipedia", attribution: "Source: Wikipedia", url: null, licence: "CC BY-SA 4.0", licenceUrl: null, adapted: true } };
  assert.match(foot(wiki), /Source: Wikipedia Adapted by The ARCHV\. CC BY-SA 4\.0\./);
});
