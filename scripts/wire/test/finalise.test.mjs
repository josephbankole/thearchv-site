import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { finalise } from "../finalise-wire.mjs";

/* Ranked picks through a veto (spec B1.4, 2026-10-28). Before this, a vetoed pick was replaced in
   place by an alternate, so a veto on rank 1 would have put the seventh survivor at rank 1 while
   ranks 2 to 6 stayed put, and rank 1 is the only story /wire/ and the app's shelves show. */

const SOURCES = JSON.parse(readFileSync(new URL("./fixtures/sources.json", import.meta.url), "utf8"));
const NOW = "2026-09-27T09:28:40Z";

const story = (n, headline) => ({
  id: `espn-soccer:${String(n).padStart(12, "0")}`, headline, url: `https://www.espn.com/soccer/story/_/id/${92000000 + n}/s`,
  publishedAt: "2026-09-27T01:00:00.000Z", publishedDate: "2026-09-26", timePrecision: "date", summary: "",
  guidKey: `guid:${n}`, urlKey: `espn.com/soccer/story/_/id/${92000000 + n}/s`, titleKey: headline.toLowerCase(),
});
const PICKS = [
  story(1, "Man Utd sack manager after cup exit"),
  story(2, "Arsenal beat Chelsea in the London derby"),
  story(3, "Leeds United win at home again"),
  story(4, "Celtic go top after a late winner"),
  story(5, "Ajax appoint Placeholder Coach until the summer"),
  story(6, "Napoli lose at home for the first time"),
];
const ALTS = [story(7, "Juventus sign Placeholder Defender on loan"), story(8, "Fixture Rovers stun Placeholder Athletic late on")];
const candidates = () => ({
  version: 1, date: "2026-09-27", fetchedAt: NOW, missing: [], rejected: [],
  candidates: PICKS.map((p, i) => ({
    ...p, sourceId: "espn-soccer", sourceName: "ESPN", sport: "football", league: null, rank: i + 1,
    firstSeenAt: NOW, alternates: ALTS,
  })),
});
const run = (notes) => finalise({ candidates: candidates(), notes, prev: { editions: [] }, nowIso: NOW, sources: SOURCES });
const ranked = (w) => w.editions[0].items.map((i) => [i.rank, i.headline]);

test("without a veto every pick keeps its rank", () => {
  const { wire } = run({ notes: {}, vetoes: {} });
  assert.deepEqual(ranked(wire), PICKS.map((p, i) => [i + 1, p.headline]));
});

test("a veto on rank 1 promotes rank 2 to rank 1, and the first alternate becomes the last rank", () => {
  const { wire } = run({ notes: {}, vetoes: { [PICKS[0].id]: "graphic" } });
  assert.deepEqual(ranked(wire), [
    [1, PICKS[1].headline], [2, PICKS[2].headline], [3, PICKS[3].headline],
    [4, PICKS[4].headline], [5, PICKS[5].headline], [6, ALTS[0].headline],
  ]);
});

test("an alternate that names no club never refills rank 2 or later", () => {
  const { wire } = run({ notes: {}, vetoes: { [PICKS[2].id]: "duplicate", [ALTS[0].id]: "duplicate" } });
  // Leeds went, Juventus was vetoed too, and the Rovers story names no club: five items, renumbered.
  assert.deepEqual(ranked(wire).map(([r]) => r), [1, 2, 3, 4, 5]);
  assert.ok(!ranked(wire).some(([, h]) => h === ALTS[1].headline));
  // A lone pick vetoed away is still replaced by the first clean alternate, whatever it names.
  const one = candidates();
  one.candidates = [{ ...one.candidates[0], alternates: [ALTS[1]] }];
  const r = finalise({ candidates: one, notes: { vetoes: { [PICKS[0].id]: "graphic" } }, prev: { editions: [] }, nowIso: NOW, sources: SOURCES });
  assert.deepEqual(ranked(r.wire), [[1, ALTS[1].headline]]);
});

test("every pick vetoed with no clean alternate leaves the source missing", () => {
  const vetoes = Object.fromEntries([...PICKS, ...ALTS].map((p) => [p.id, "duplicate"]));
  const r = run({ notes: {}, vetoes });
  assert.equal(r.refused, "empty-edition");
});

test("the desk notes rank 1 only: a note on an extra is refused and the extra publishes headline-only", () => {
  const ok = "The cup exit came first, and the manager went after it, according to ESPN.";
  const notes = { notes: { [PICKS[0].id]: ok, [PICKS[1].id]: "ESPN reports the derby went the way of Arsenal at the end." }, vetoes: {} };
  const { wire, rejectedNotes } = run(notes);
  assert.deepEqual(rejectedNotes.map((r) => [r.id, r.errors]), [[PICKS[1].id, ["note-rank-1-only"]]]);
  assert.ok(wire.editions[0].items.slice(1).every((i) => i.note === null));
});
