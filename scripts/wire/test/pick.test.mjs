import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseFeed } from "../lib/feed-parse.mjs";
import { pickTop, seenFromEditions } from "../lib/pick.mjs";
import { fetchWire } from "../fetch-wire.mjs";
import { finalise } from "../finalise-wire.mjs";
import { SOURCES } from "../lib/schema.mjs";

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
  const c = await fetchWire({ date: "2026-09-27", nowMs: NOW, history: prev, offline: FEEDS });
  const ids = c.candidates.map((x) => x.sourceId);
  assert.deepEqual(ids, ["espn-soccer", "espn-nfl", "espn-f1", "espn-golf", "espn-nba", "espn-wnba"]);
  assert.equal(new Set(c.candidates.map((x) => x.titleKey)).size, c.candidates.length);
  assert.deepEqual(c.missing, [{ sourceId: "espn-tennis", reason: "parse-error", detail: "truncated-or-malformed" }]);
  assert.ok(!c.candidates.some((x) => x.headline.includes("what we learned")), "yesterday's item is seen");
  assert.ok(c.candidates.every((x) => x.publishedDate === "2026-09-26"));
});

test("a same-day rerun is idempotent: the target date's edition is not part of the seen set", async () => {
  const first = await fetchWire({ date: "2026-09-27", nowMs: NOW, history: prev, offline: FEEDS });
  const { wire } = finalise({ candidates: first, prev, nowIso: "2026-09-27T09:10:00Z" });
  const again = await fetchWire({ date: "2026-09-27", nowMs: NOW, history: wire, offline: FEEDS });
  assert.deepEqual(again.candidates.map((x) => x.id), first.candidates.map((x) => x.id));
  const { wire: wire2 } = finalise({ candidates: again, prev: wire, nowIso: "2026-09-27T09:10:00Z" });
  assert.deepEqual(wire2, wire);
  assert.equal(wire2.editions.filter((e) => e.date === "2026-09-27").length, 1);
});
