import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync, readdirSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { parseFeed } from "../lib/feed-parse.mjs";
import { pickTop, seenFromEditions } from "../lib/pick.mjs";
import { fetchWire } from "../fetch-wire.mjs";
import { finalise } from "../finalise-wire.mjs";
import { currentEdition, buildWireFeed } from "../lib/schema.mjs";

// A frozen copy of the registry, never the live sources.json: enabling, disabling or retuning a
// live source must not fail the build (the build runs these tests).
const SOURCES = JSON.parse(readFileSync(new URL("./fixtures/sources.json", import.meta.url), "utf8"));
const FEEDS = fileURLToPath(new URL("./fixtures/feeds", import.meta.url));
const NOW = Date.parse("2026-09-27T09:00:00Z");
const prev = JSON.parse(readFileSync(new URL("./fixtures/prev-wire.json", import.meta.url), "utf8"));
const src = (id) => SOURCES.sources.find((s) => s.id === id);
const items = (id) => parseFeed(readFileSync(`${FEEDS}/${id}.xml`, "utf8")).items;
const empty = () => seenFromEditions([]);

test("editorial order takes the first survivor, preferring a United item", () => {
  const r = pickTop(items("espn-soccer"), src("espn-soccer"), { defaults: SOURCES.defaults, seen: empty(), nowMs: NOW });
  assert.equal(r.pick.headline, "Manchester United's Placeholder Keeper out for a month, sources say");
  assert.equal(r.pick.preferMatched, true);
  // The feed's link is kept byte for byte, tracking params and all; only the key is canonical.
  assert.equal(r.alternates[0].url, "https://www.espn.com/soccer/story/_/id/90000002/rovers-comeback?utm_source=rss&utm_medium=feed");
  const reasons = r.rejected.map((x) => x.reason);
  assert.ok(reasons.includes("excluded:\\blive:"), "Follow live pages are filtered");
  assert.ok(reasons.includes("excluded-path:/report/_/gameid/"), "match report pages are filtered by path");
});

test("without a prefer match, editorial order takes the first fresh survivor", () => {
  const r = pickTop(items("espn-nba"), src("espn-nba"), { defaults: SOURCES.defaults, seen: empty(), nowMs: NOW });
  assert.equal(r.pick.headline, "Sources: Fixture Bulls trade Placeholder Guard to Fixture Hornets", "the stale evergreen item on top is skipped");
});

test("the betting story that passed the draft's headline filter is rejected by its path", () => {
  const r = pickTop(items("espn-wnba"), src("espn-wnba"), { defaults: SOURCES.defaults, seen: empty(), nowMs: NOW });
  assert.equal(r.pick.headline, "WNBA playoff preview: Fixture Lynx v Placeholder Liberty");
  assert.ok(r.rejected.some((x) => x.headline.startsWith("Top-seeded") && x.reason === "excluded-path:/betting/"));
});

test("liveblogs and betting slugs are filtered even when the headline looks clean (2026-10-04)", () => {
  const at = "Sat, 26 Sep 2026 20:00:00 EST";
  const list = [
    { title: "Grand Prix LIVE! Placeholder Driver leads after restart", link: "https://www.espn.com/f1/story/_/id/1/grand-prix-placeholder", published: at, guid: "l1", position: 0 },
    { title: "Placeholder Grand Prix: the race so far", link: "https://www.espn.com/f1/story/_/id/2/grand-prix-2026-live-updates-results", published: at, guid: "l2", position: 1 },
    { title: "Your guide to the Fixture semifinals", link: "https://www.espn.com/wnba/story/_/id/3/semifinals-preview-prediction-odds-fixture", published: at, guid: "l3", position: 2 },
    { title: "Placeholder Liverpool live wire wins again", link: "https://www.espn.com/soccer/story/_/id/4/liverpool-live-wire-oddsmaker-defied", published: at, guid: "l4", position: 3 },
  ];
  const r = pickTop(list, src("espn-golf"), { defaults: SOURCES.defaults, seen: empty(), nowMs: NOW });
  assert.equal(r.pick.headline, "Placeholder Liverpool live wire wins again", "a slug that merely contains live or odds is kept");
  const why = Object.fromEntries(r.rejected.map((x) => [x.headline.slice(0, 12), x.reason]));
  assert.equal(why["Grand Prix L"], "excluded:\\blive!");
  assert.match(why["Placeholder "], /^excluded-path:.*live-\(updates/);
  assert.match(why["Your guide t"], /^excluded-path:.*\(odds\|/);
});

test("chronological order takes the newest", () => {
  const s = { ...src("espn-golf"), order: "chronological", exclude: [] };
  const list = [
    { title: "Older story", link: "https://www.espn.com/golf/a", published: "Sat, 26 Sep 2026 10:00:00 EST", guid: "1", position: 0 },
    { title: "Newer story", link: "https://www.espn.com/golf/b", published: "Sat, 26 Sep 2026 20:00:00 EST", guid: "2", position: 1 },
  ];
  assert.equal(pickTop(list, s, { defaults: SOURCES.defaults, seen: empty(), nowMs: NOW }).pick.headline, "Newer story");
});

test("seen items from earlier editions are skipped, and all-seen is reported", () => {
  const s = src("espn-golf");
  const list = [{ title: "Only story", link: "https://www.espn.com/golf/x?utm_source=a", published: "Sat, 26 Sep 2026 20:00:00 EST", guid: "g1", position: 0 }];
  const seen = seenFromEditions([{ date: "2026-09-26", items: [{ headline: "only story", url: "https://espn.com/golf/other" }] }], "2026-09-27");
  const r = pickTop(list, s, { defaults: SOURCES.defaults, seen, nowMs: NOW });
  assert.equal(r.pick, null);
  assert.equal(r.reason, "all-seen");
});

test("fetchWire: one pick per source, the same story is not taken twice across feeds, failures are recorded", async () => {
  const c = await fetchWire({ date: "2026-09-27", nowMs: NOW, history: prev, offline: FEEDS, sources: SOURCES });
  const ids = c.candidates.map((x) => x.sourceId);
  assert.deepEqual(ids, ["espn-soccer", "espn-nfl", "espn-f1", "espn-golf", "espn-nba", "espn-wnba"]);
  assert.equal(new Set(c.candidates.map((x) => x.titleKey)).size, c.candidates.length);
  assert.deepEqual(c.missing, [{ sourceId: "espn-tennis", reason: "parse-error", detail: "truncated-or-malformed" }]);
  assert.ok(!c.candidates.some((x) => x.headline.includes("what we learned")), "yesterday's item is seen");
  assert.ok(c.candidates.every((x) => x.publishedDate === "2026-09-26"));
});

test("a same-day rerun is idempotent: the target date's edition is not part of the seen set", async () => {
  const first = await fetchWire({ date: "2026-09-27", nowMs: NOW, history: prev, offline: FEEDS, sources: SOURCES });
  const { wire } = finalise({ candidates: first, prev, nowIso: "2026-09-27T09:10:00Z", sources: SOURCES });
  const again = await fetchWire({ date: "2026-09-27", nowMs: NOW, history: wire, offline: FEEDS, sources: SOURCES });
  assert.deepEqual(again.candidates.map((x) => x.id), first.candidates.map((x) => x.id));
  const { wire: wire2 } = finalise({ candidates: again, prev: wire, nowIso: "2026-09-27T09:10:00Z", sources: SOURCES });
  assert.deepEqual(wire2, wire);
  assert.equal(wire2.editions.filter((e) => e.date === "2026-09-27").length, 1);
});

test("the pipeline follows the registry it is given: a source switched on or off changes only that run", async () => {
  const reg = structuredClone(SOURCES);
  reg.sources.find((s) => s.id === "espn-golf").enabled = false;
  reg.sources.find((s) => s.id === "the-conversation-epl").enabled = true;
  const c = await fetchWire({ date: "2026-09-27", nowMs: NOW, history: prev, offline: FEEDS, sources: reg });
  assert.ok(!c.candidates.some((x) => x.sourceId === "espn-golf"));
  assert.ok(c.missing.some((m) => m.sourceId === "the-conversation-epl"));
  const { wire } = finalise({ candidates: c, prev, nowIso: "2026-09-27T09:10:00Z", sources: reg });
  assert.ok(!wire.editions[0].items.some((i) => i.sourceId === "espn-golf"));
});

test("a same-day rerun later in the day keeps firstSeenAt and updatedAt, so the file does not change", async () => {
  const first = await fetchWire({ date: "2026-09-27", nowMs: NOW, history: prev, offline: FEEDS, sources: SOURCES });
  const { wire } = finalise({ candidates: first, prev, nowIso: "2026-09-27T09:10:00Z", sources: SOURCES });
  const later = NOW + 6 * 3600000;
  const again = await fetchWire({ date: "2026-09-27", nowMs: later, history: wire, offline: FEEDS, sources: SOURCES });
  assert.notEqual(again.candidates[0].firstSeenAt, first.candidates[0].firstSeenAt);
  const { wire: wire2 } = finalise({ candidates: again, prev: wire, nowIso: "2026-09-27T15:10:00Z", sources: SOURCES });
  assert.equal(JSON.stringify(wire2), JSON.stringify(wire));
  // A real change still moves updatedAt.
  const fewer = { ...again, candidates: again.candidates.slice(0, -1), missing: [...again.missing, { sourceId: "espn-wnba", reason: "fetch-failed:503" }] };
  assert.equal(finalise({ candidates: fewer, prev: wire, nowIso: "2026-09-27T15:10:00Z", sources: SOURCES, replace: true }).wire.updatedAt, "2026-09-27T15:10:00Z");
});

test("a rerun that finds nothing, or loses a source to a failed fetch, writes nothing without --replace", async () => {
  const first = await fetchWire({ date: "2026-09-27", nowMs: NOW, history: prev, offline: FEEDS, sources: SOURCES });
  const { wire } = finalise({ candidates: first, prev, nowIso: "2026-09-27T09:10:00Z", sources: SOURCES });
  // Every feed unreachable: fetch-wire exits 1 and finalise refuses too.
  const none = { ...first, candidates: [], missing: SOURCES.sources.filter((s) => s.enabled).map((s) => ({ sourceId: s.id, reason: "fetch-failed:network" })) };
  const r0 = finalise({ candidates: none, prev: wire, nowIso: "2026-09-27T20:00:00Z", sources: SOURCES });
  assert.equal(r0.wire, null);
  assert.equal(r0.refused, "no-candidates");
  // Only soccer reachable on the rerun: the morning's six items are not cut to one.
  const onlySoccer = { ...first, candidates: first.candidates.slice(0, 1), missing: first.candidates.slice(1).map((c) => ({ sourceId: c.sourceId, reason: "fetch-failed:503" })) };
  const r1 = finalise({ candidates: onlySoccer, prev: wire, nowIso: "2026-09-27T20:00:00Z", sources: SOURCES });
  assert.equal(r1.wire, null);
  assert.match(r1.refused, /^rerun-would-drop:espn-nfl,espn-f1,espn-golf,espn-nba,espn-wnba$/);
  const forced = finalise({ candidates: onlySoccer, prev: wire, nowIso: "2026-09-27T20:00:00Z", sources: SOURCES, replace: true });
  assert.equal(forced.wire.editions[0].items.length, 1);
  // A desk veto may take a source out of a rerun without --replace.
  const veto = { vetoes: { [first.candidates[1].id]: "graphic" } };
  const r2 = finalise({ candidates: first, notes: veto, prev: wire, nowIso: "2026-09-27T20:00:00Z", sources: SOURCES });
  assert.equal(r2.refused, null);
  assert.ok(!r2.wire.editions[0].items.some((i) => i.sourceId === "espn-nfl"));
});

test("an empty newest edition never hides the last real one, on the page or in the feed", async () => {
  const first = await fetchWire({ date: "2026-09-27", nowMs: NOW, history: prev, offline: FEEDS, sources: SOURCES });
  const { wire } = finalise({ candidates: first, prev, nowIso: "2026-09-27T09:10:00Z", sources: SOURCES });
  const withEmpty = { ...wire, editions: [{ date: "2026-09-28", status: "partial", items: [], missing: [] }, ...wire.editions] };
  assert.equal(currentEdition(withEmpty, "2026-09-28").date, "2026-09-27");
  const f = buildWireFeed(withEmpty, { generatedAt: "2026-09-28T09:00:00Z", sources: SOURCES });
  assert.equal(f.edition.date, "2026-09-27");
  assert.equal(f.items.length, wire.editions[0].items.length);
  // A new day whose only candidate is vetoed writes nothing at all.
  const one = { ...first, date: "2026-09-28", candidates: [{ ...first.candidates[1], alternates: [] }], missing: [] };
  const r = finalise({ candidates: one, notes: { vetoes: { [first.candidates[1].id]: "graphic" } }, prev: wire, nowIso: "2026-09-28T09:10:00Z", sources: SOURCES });
  assert.equal(r.refused, "empty-edition");
});

test("the betting filter catches betting picks and lines but keeps trade and draft stories", () => {
  const s = src("espn-nfl");
  const one = (title) => pickTop([{ title, link: "https://www.espn.com/nfl/story/_/id/1/x", published: "Sat, 26 Sep 2026 20:00:00 EST", guid: title, position: 0 }], s, { defaults: SOURCES.defaults, seen: empty(), nowMs: NOW });
  for (const keep of [
    "Bulls trade guard and two first-round picks to Hornets",
    "Chiefs trade Placeholder End for a draft pick",
    "Placeholder Rookie was the No. 3 pick in April",
    "Bears' offensive lines struggle in loss",
    "Packers pick up fifth-year option on Placeholder Tackle",
    "Placeholder Guard was the No. 1 NBA pick in June",
    "Where the first NFL pick fits in the rebuild",
    "Upset picks up where it left off for Placeholder City",
  ]) assert.ok(one(keep).pick, keep);
  for (const drop of [
    "Week 4 NFL picks: expert predictions for every game",
    "Expert picks for the Placeholder Championship",
    "NFL Week 4 picks against the spread",
    "Staff picks: who wins Sunday night",
    "Survivor pool picks for Week 5",
    "Opening lines for Week 4",
    "Point spread and betting lines for every game",
  ]) assert.equal(one(drop).pick, null, drop);
});

/* ---------- several football items a day (spec B1.2, 2026-10-28) ---------- */

// A day's soccer feed in ESPN's editorial order, invented headlines, every one fresh at NOW.
const SOCCER_DAY = [
  "Arsenal beat Chelsea in the London derby",
  "Fixture Rovers stun Placeholder Athletic late on",
  "Man Utd sack manager after cup exit",
  "Leeds United win at home again",
  "Liverpool Montevideo sign Placeholder Striker",
  "Barça held by Real Madrid in the Clasico",
  "Celtic go top after a late winner",
  "Inter Miami draw again in the east",
  "Ajax appoint Placeholder Coach until the summer",
  "Napoli lose at home for the first time",
  "Juventus sign Placeholder Defender on loan",
].map((title, i) => ({ title, link: `https://www.espn.com/soccer/story/_/id/${91000000 + i}/story-${i}`, published: "Sat, 26 Sep 2026 20:00:00 EST", guid: `US-EN-${91000000 + i}`, position: i }));
const soccer6 = () => ({ ...src("espn-soccer"), maxItems: 6 });

test("maxItems 6: up to six picks ranked 1 to 6, United first, then club-tagged stories in feed order", () => {
  const r = pickTop(SOCCER_DAY, soccer6(), { defaults: SOURCES.defaults, seen: empty(), nowMs: NOW });
  assert.deepEqual(r.picks.map((p) => p.rank), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(r.picks.map((p) => p.headline), [
    "Man Utd sack manager after cup exit",
    "Arsenal beat Chelsea in the London derby",
    "Leeds United win at home again",
    "Barça held by Real Madrid in the Clasico",
    "Celtic go top after a late winner",
    "Ajax appoint Placeholder Coach until the summer",
  ]);
  assert.equal(r.pick, r.picks[0], "pick is still picks[0] for the callers that read it");
  // The alternates are the next two after the picks: the club-tagged ones first.
  assert.deepEqual(r.alternates.map((a) => a.headline), ["Napoli lose at home for the first time", "Juventus sign Placeholder Defender on loan"]);
});

test("an untagged survivor is never taken at rank 2 or later, and rank 1 is taken whatever it names", () => {
  const untagged = new Set(["Fixture Rovers stun Placeholder Athletic late on", "Liverpool Montevideo sign Placeholder Striker", "Inter Miami draw again in the east"]);
  const r = pickTop(SOCCER_DAY, soccer6(), { defaults: SOURCES.defaults, seen: empty(), nowMs: NOW });
  assert.ok(r.picks.slice(1).every((p) => !untagged.has(p.headline)));
  // No United story and an untagged lead: the lead is still rank 1, as it always was.
  const day = SOCCER_DAY.filter((x) => !/Man Utd/.test(x.title)).slice(1);
  const r2 = pickTop(day, soccer6(), { defaults: SOURCES.defaults, seen: empty(), nowMs: NOW });
  assert.equal(r2.picks[0].headline, "Fixture Rovers stun Placeholder Athletic late on");
  assert.ok(r2.picks.slice(1).every((p) => !untagged.has(p.headline)));
  // A feed with no club in it gives exactly one pick.
  const plain = SOCCER_DAY.filter((x) => untagged.has(x.title));
  assert.equal(pickTop(plain, soccer6(), { defaults: SOURCES.defaults, seen: empty(), nowMs: NOW }).picks.length, 1);
});

test("a source with the default maxItems returns exactly today's single pick and alternates", () => {
  const r = pickTop(SOCCER_DAY, src("espn-soccer"), { defaults: SOURCES.defaults, seen: empty(), nowMs: NOW });
  assert.equal(r.picks.length, 1);
  assert.equal(r.pick.rank, 1);
  assert.equal(r.pick.headline, "Man Utd sack manager after cup exit");
  assert.deepEqual(r.alternates.map((a) => a.headline), ["Arsenal beat Chelsea in the London derby", "Fixture Rovers stun Placeholder Athletic late on"]);
  // The shipped fixture feed still gives the same pick as before the change.
  const old = pickTop(items("espn-soccer"), src("espn-soccer"), { defaults: SOURCES.defaults, seen: empty(), nowMs: NOW });
  assert.deepEqual(old.picks, [old.pick]);
});

test("fetchWire writes one candidate per pick with its rank, and every pick joins the seen set", async () => {
  const reg = structuredClone(SOURCES);
  reg.sources.find((s) => s.id === "espn-soccer").maxItems = 6;
  const dir = mkdtempSync(join(tmpdir(), "wire-feeds-"));
  try {
    for (const f of readdirSync(FEEDS)) copyFileSync(join(FEEDS, f), join(dir, f));
    const rss = `<?xml version="1.0"?><rss version="2.0"><channel><title>Fixture feed</title><link>https://www.espn.com</link>\n${SOCCER_DAY.map((x) =>
      `<item><title><![CDATA[${x.title}]]></title><link>${x.link}</link><description><![CDATA[x]]></description><pubDate>${x.published}</pubDate><guid isPermaLink="false">${x.guid}</guid></item>`).join("\n")}\n</channel></rss>\n`;
    writeFileSync(join(dir, "espn-soccer.xml"), rss);
    const c = await fetchWire({ date: "2026-09-27", nowMs: NOW, history: { editions: [] }, offline: dir, sources: reg });
    const soccer = c.candidates.filter((x) => x.sourceId === "espn-soccer");
    assert.deepEqual(soccer.map((x) => x.rank), [1, 2, 3, 4, 5, 6]);
    assert.ok(soccer.every((x) => JSON.stringify(x.alternates) === JSON.stringify(soccer[0].alternates)), "the same alternates on each");
    assert.ok(c.candidates.filter((x) => x.sourceId !== "espn-soccer").every((x) => x.rank === 1));
    // Tomorrow, none of today's six is taken again.
    const { wire } = finalise({ candidates: c, prev: { editions: [] }, nowIso: "2026-09-27T09:10:00Z", sources: reg });
    const next = await fetchWire({ date: "2026-09-28", nowMs: NOW, history: wire, offline: dir, sources: reg });
    const taken = new Set(soccer.map((x) => x.id));
    assert.ok(!next.candidates.some((x) => taken.has(x.id)));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
