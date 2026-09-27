import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseFeed } from "../lib/feed-parse.mjs";
import { parseFeedDate, dateInZone } from "../lib/time.mjs";

const fx = (n) => readFileSync(new URL(`./fixtures/feeds/${n}`, import.meta.url), "utf8");

test("RSS parse keeps headline and link verbatim and drops body, media and enclosures", () => {
  const { items } = parseFeed(fx("espn-soccer.xml"));
  assert.equal(items.length, 5);
  assert.equal(items[3].title, "Manchester United's Placeholder Keeper out for a month, sources say");
  assert.equal(items[1].link, "https://www.espn.com/soccer/story/_/id/90000002/rovers-comeback?utm_source=rss&utm_medium=feed");
  const all = JSON.stringify(items);
  assert.ok(!all.includes("FULL BODY"), "content:encoded must never survive");
  assert.ok(!all.includes("espncdn"), "media and enclosure URLs must never survive");
  assert.equal(items[1].summary, "", "a CDATA null description is empty");
  assert.equal(items[0].guid, "US-EN-90000001");
});

test("Atom parse takes the alternate link and ignores content", () => {
  const xml = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry><id>tag:x,1</id><title>A &amp; B</title>
    <link rel="self" href="https://theconversation.com/self"/><link rel="alternate" href="https://theconversation.com/a-b-1"/>
    <published>2026-09-25T15:47:00Z</published><summary>Short</summary><content type="html">BODY</content></entry></feed>`;
  const { format, items } = parseFeed(xml);
  assert.equal(format, "atom");
  assert.equal(items[0].title, "A & B");
  assert.equal(items[0].link, "https://theconversation.com/a-b-1");
  assert.ok(!JSON.stringify(items).includes("BODY"));
});

test("malformed, empty and non-feed bodies throw", () => {
  assert.throws(() => parseFeed(fx("espn-tennis.xml")));
  assert.throws(() => parseFeed(""));
  assert.throws(() => parseFeed("<html><body>hi</body></html>"));
});

test("ESPN's EST label is read as New York wall clock, not as a literal offset", () => {
  // 26 Sep is daylight time: 17:14 New York wall clock is 21:14Z. A literal EST reading would give 22:14Z.
  const r = parseFeedDate("Sat, 26 Sep 2026 17:14:00 EST", "America/New_York");
  assert.equal(new Date(r.ms).toISOString(), "2026-09-26T21:14:00.000Z");
  assert.equal(r.exact, false);
  const z = parseFeedDate("Sat, 26 Sep 2026 17:14:00 +0000");
  assert.equal(z.exact, true);
  assert.equal(new Date(parseFeedDate("2026-09-25T15:47:00Z").ms).toISOString(), "2026-09-25T15:47:00.000Z");
  // 21:00 in New York on the 26th is the 27th in UTC; the stored date is the source's own.
  const late = parseFeedDate("Sat, 26 Sep 2026 21:00:00 EST", "America/New_York");
  assert.equal(dateInZone(late.ms, "America/New_York"), "2026-09-26");
  assert.equal(parseFeedDate("yesterday"), null);
});
