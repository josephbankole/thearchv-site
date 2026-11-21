/* videos.test.mjs: the video block's reader (scripts/videos/lib.mjs), on two recorded feeds.
   Fixtures only, no network: fixtures/videos/uulf.xml and uush.xml are YouTube's own Atom feeds
   for the channel's long-form and Shorts playlists, saved on 2026-11-21. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseFeed, cleanTitle, decodeXml, snapshotProblems, suspicious, loadVideos, hiddenIds, rankVideos, renderHomeVideos,
  displayDate, thumbPath, VIDEOS_SCHEMA, CHANNEL_ID, PLAYLISTS, EMBED_ORIGIN, THUMB, SHOW, KEEP, WEEK_DAYS, MAX_AGE_DAYS,
} from "../videos/lib.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const fixture = (name) => readFileSync(join(HERE, "fixtures", "videos", name), "utf8");
const LONG = fixture("uulf.xml");
const SHORTS = fixture("uush.xml");

const withThumb = (kind) => (v) => ({ ...v, thumb: thumbPath(v.id), thumbWidth: THUMB[kind].width, thumbHeight: THUMB[kind].height });
const snapshot = () => ({
  schema: VIDEOS_SCHEMA,
  fetchedAt: "2026-11-21T20:33:00.000Z",
  long: parseFeed(LONG, "long").items.map(withThumb("long")),
  shorts: parseFeed(SHORTS, "shorts").items.map(withThumb("shorts")),
});

test("the playlist ids are the channel id with the UC prefix swapped", () => {
  assert.equal(CHANNEL_ID, "UCl6d9aV0mLImkGwvYzunWBg");
  assert.equal(PLAYLISTS.long, "UULFl6d9aV0mLImkGwvYzunWBg");
  assert.equal(PLAYLISTS.shorts, "UUSHl6d9aV0mLImkGwvYzunWBg");
});

test("the long-form feed parses to seven /watch entries, newest first, nothing dropped", () => {
  const { items, dropped } = parseFeed(LONG, "long");
  assert.equal(items.length, 7);
  assert.deepEqual(dropped, []);
  assert.equal(items[0].id, "2LaHp3i3cvI");
  assert.equal(items[0].published, "2026-11-21T15:00:13.000Z");
  assert.equal(items[0].url, "https://www.youtube.com/watch?v=2LaHp3i3cvI");
  for (const v of items) assert.match(v.url, /^https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]{11}$/);
  assert.deepEqual(items.map((v) => v.published), [...items.map((v) => v.published)].sort().reverse());
});

test("the Shorts feed parses to fifteen /shorts/ entries", () => {
  const { items, dropped } = parseFeed(SHORTS, "shorts");
  assert.equal(items.length, 15);
  assert.deepEqual(dropped, []);
  assert.equal(items[0].id, "YhHjI-Dbhws");
  for (const v of items) assert.equal(v.url, `https://www.youtube.com/shorts/${v.id}`);
});

test("an item carries id, title, published, url and the feed's view count as a sort key", () => {
  for (const v of [...parseFeed(LONG, "long").items, ...parseFeed(SHORTS, "shorts").items]) {
    assert.deepEqual(Object.keys(v).sort(), ["id", "published", "title", "url", "views"]);
    assert.ok(Number.isSafeInteger(v.views) && v.views >= 0);
  }
  const shorts = parseFeed(SHORTS, "shorts").items;
  assert.equal(shorts[0].views, 1);
  assert.equal(shorts.find((v) => v.published === "2026-11-18T17:00:23.000Z").views, 2136);
  // An entry with no statistics, or a count that is not a number, sorts as 0.
  const none = parseFeed(SHORTS.replace('<media:statistics views="2136"/>', ""), "shorts").items;
  assert.equal(none.find((v) => v.published === "2026-11-18T17:00:23.000Z").views, 0);
  const junk = parseFeed(SHORTS.replace('views="2136"', 'views="lots"'), "shorts").items;
  assert.equal(junk.find((v) => v.published === "2026-11-18T17:00:23.000Z").views, 0);
});

/* ---------- the order: this week's most viewed, then newest (founder, 2026-11-21) ---------- */

const FETCHED = Date.parse("2026-11-21T20:33:00.000Z"); // the day the fixtures were recorded
const week = (items, now) => items.filter((v) => Date.parse(v.published) > now - WEEK_DAYS * 86_400_000);
const newestFirst = (items) => [...items].sort((a, b) => Date.parse(b.published) - Date.parse(a.published));

test("a week with many entries: the week comes first, most viewed first, then older ones by date", () => {
  const items = parseFeed(SHORTS, "shorts").items;
  const ranked = rankVideos(items, FETCHED);
  const inWeek = week(items, FETCHED);
  assert.equal(inWeek.length, 8, "the Shorts fixture holds eight entries from 14 to 21 November");
  assert.ok(inWeek.length >= SHOW.shorts);
  assert.deepEqual(ranked.slice(0, 8).map((v) => v.views), [2281, 2136, 981, 122, 116, 56, 40, 1]);
  assert.deepEqual(new Set(ranked.slice(0, 8)), new Set(inWeek));
  // What the page shows is true for every card: each is from the week, none outranked by one left out.
  const shown = ranked.slice(0, SHOW.shorts);
  assert.ok(shown.every((v) => inWeek.includes(v)));
  assert.ok(Math.min(...shown.map((v) => v.views)) >= Math.max(...inWeek.filter((v) => !shown.includes(v)).map((v) => v.views)));
  // Past the week, plain newest first, whatever the views (1770 sits behind nothing newer).
  assert.deepEqual(ranked.slice(8), newestFirst(items.filter((v) => !inWeek.includes(v))));
  assert.equal(ranked[8].published, "2026-11-14T17:00:23.000Z");
  assert.equal(ranked.length, items.length);
  assert.deepEqual(items, parseFeed(SHORTS, "shorts").items, "the input is not reordered");
});

test("a week with fewer entries than slots is filled with the next newest older ones", () => {
  const items = parseFeed(LONG, "long").items;
  const inWeek = week(items, FETCHED);
  assert.ok(inWeek.length > 0 && inWeek.length < items.length);
  const ranked = rankVideos(items, FETCHED);
  assert.deepEqual(ranked.slice(0, inWeek.length), [...inWeek].sort((a, b) => b.views - a.views || Date.parse(b.published) - Date.parse(a.published)));
  assert.deepEqual(ranked.slice(inWeek.length), newestFirst(items.filter((v) => !inWeek.includes(v))));
  // Two Shorts in the week, six slots: the two by views (40 beats the newer 1), then the four
  // newest older ones by date, although 2136 and 2281 sit further back.
  const two = rankVideos(parseFeed(SHORTS, "shorts").items, Date.parse("2026-11-27T17:15:00.000Z"));
  assert.deepEqual(two.slice(0, SHOW.shorts).map((v) => v.published), [
    "2026-11-20T17:30:02.000Z", "2026-11-21T17:30:08.000Z",
    "2026-11-19T17:30:24.000Z", "2026-11-18T17:30:14.000Z", "2026-11-18T17:00:23.000Z", "2026-11-17T17:30:26.000Z",
  ]);
  assert.deepEqual(two.slice(0, SHOW.shorts).map((v) => v.views), [40, 1, 122, 116, 2136, 56]);
});

test("a week with no entries is plain newest first", () => {
  const items = parseFeed(SHORTS, "shorts").items;
  const later = Date.parse("2026-12-25T00:00:00.000Z");
  assert.equal(week(items, later).length, 0);
  assert.deepEqual(rankVideos(items, later), newestFirst(items));
  assert.deepEqual(rankVideos([], FETCHED), []);
});

test("ties go to the newer video, and missing or bad views count as 0", () => {
  const day = (d) => `2026-11-${d}T12:00:00.000Z`;
  const v = (id, d, views) => ({ id, published: day(d), ...(views === undefined ? {} : { views }) });
  const now = Date.parse(day(21));
  const ids = (list) => list.map((x) => x.id).join(" ");
  assert.equal(ids(rankVideos([v("a", 16, 50), v("b", 19, 50), v("c", 17, 50)], now)), "b c a");
  assert.equal(ids(rankVideos([v("none", 20), v("some", 15, 3), v("nan", 19, NaN), v("neg", 18, -4), v("text", 17, "900")], now)), "some none nan neg text");
  // Exactly seven days old is outside the week; a second inside is in.
  assert.equal(ids(rankVideos([v("edge", 14, 9999), v("new", 20, 1)], now)), "new edge");
  assert.equal(ids(rankVideos([{ id: "in", published: "2026-11-14T12:00:01.000Z", views: 9999 }, v("new", 20, 1)], now)), "in new");
});

test("titles are decoded, lose the channel's own sign-off and never carry a hashtag", () => {
  const long = parseFeed(LONG, "long").items;
  assert.equal(long[0].title, "Athletic Club v Real Sociedad: How La Liga's Connected Ball Fell Out of Sync With VAR");
  assert.ok(long.every((v) => !/\|\s*The ARCHV$/i.test(v.title)));
  const shorts = parseFeed(SHORTS, "shorts").items;
  assert.equal(shorts[0].title, `Mauricio Pochettino at Manchester United: "I don't think he was anybody's first choice"`);
  assert.equal(cleanTitle("A goal worth seeing #shorts #football | The ARCHV"), "A goal worth seeing");
  assert.equal(cleanTitle("Number 7 shirt, 3-2 at Anfield"), "Number 7 shirt, 3-2 at Anfield");
  // A number written with a hash is a shirt number or a ranking, never a hashtag.
  assert.equal(cleanTitle("Who is the #1 striker in England? | The ARCHV"), "Who is the #1 striker in England?");
  assert.equal(cleanTitle("Why Bruno Fernandes is still Manchester United's #10 | The ARCHV"), "Why Bruno Fernandes is still Manchester United's #10");
  assert.equal(cleanTitle("Top 5 #9s #shorts"), "Top 5 #9s");
  assert.equal(cleanTitle("C# explained"), "C# explained");
  // The sign-off goes even when a hashtag followed it, or led the title.
  assert.equal(cleanTitle("Bruno's best goal | The ARCHV #shorts"), "Bruno's best goal");
  assert.equal(cleanTitle("#shorts Goal | The ARCHV"), "Goal");
  assert.equal(decodeXml("Tom &amp; Jerry &#39;x&#x27; &lt;b&gt; &unknown;"), "Tom & Jerry 'x' <b> &unknown;");
});

test("a feed read as the wrong kind keeps nothing: the link is the cross-check", () => {
  const asShorts = parseFeed(LONG, "shorts");
  assert.equal(asShorts.items.length, 0);
  assert.equal(asShorts.dropped.length, 7);
  assert.equal(parseFeed(SHORTS, "long").items.length, 0);
});

test("entries from another channel, with a bad id or a bad date are dropped by name", () => {
  const other = LONG.replace("<yt:channelId>UCl6d9aV0mLImkGwvYzunWBg</yt:channelId>\n  <title>Athletic", "<yt:channelId>UCxxxxxxxxxxxxxxxxxxxxxx</yt:channelId>\n  <title>Athletic");
  assert.notEqual(other, LONG);
  const r = parseFeed(other, "long");
  assert.equal(r.items.length, 6);
  assert.match(r.dropped[0].why, /channel/);
  const badDate = LONG.replace("<published>2026-11-21T15:00:13+00:00</published>", "<published>soon</published>");
  assert.equal(parseFeed(badDate, "long").items.length, 6);
  const badId = LONG.replace("<yt:videoId>2LaHp3i3cvI</yt:videoId>", '<yt:videoId>"><script></yt:videoId>');
  assert.equal(parseFeed(badId, "long").items.length, 6);
});

test("a feed re-serialised with other attribute order, quotes or entry attributes still parses", () => {
  const base = parseFeed(LONG, "long").items;
  const hrefFirst = LONG.replace(/<link rel="alternate" href="([^"]*)"\s*\/>/g, '<link href="$1" rel="alternate"/>');
  assert.notEqual(hrefFirst, LONG);
  assert.deepEqual(parseFeed(hrefFirst, "long").items, base);
  const single = LONG.replace(/<link rel="alternate" href="([^"]*)"\s*\/>/g, "<link rel='alternate' href='$1'/>");
  assert.deepEqual(parseFeed(single, "long").items, base);
  const entryAttr = LONG.replaceAll("<entry>", '<entry xml:lang="en">');
  assert.deepEqual(parseFeed(entryAttr, "long").items, base);
  // The exact-link check is still the guard.
  const wrong = LONG.replace(/<link rel="alternate" href="https:\/\/www\.youtube\.com\/watch\?v=2LaHp3i3cvI"/, '<link rel="alternate" href="https://example.com/watch?v=2LaHp3i3cvI"');
  assert.notEqual(wrong, LONG);
  assert.equal(parseFeed(wrong, "long").items.length, 6);
});

test("something that is not an Atom feed throws, so an error page is never 'no videos'", () => {
  assert.throws(() => parseFeed("<html><body>Sorry</body></html>", "long"), /not an Atom feed/);
  assert.throws(() => parseFeed("", "shorts"), /not an Atom feed/);
});

test("a snapshot built from the fixtures is valid, and each kind of damage is named", () => {
  assert.deepEqual(snapshotProblems(snapshot()), []);
  const bad = snapshot();
  bad.schema = "archv-videos/2";
  bad.long[0].thumb = "https://i.ytimg.com/vi/2LaHp3i3cvI/hqdefault.jpg";
  bad.shorts[0].url = "https://www.youtube.com/watch?v=YhHjI-Dbhws";
  bad.shorts[1].thumbWidth = 480;
  bad.long[1].views = "12";
  bad.long[2].views = -1;
  const problems = snapshotProblems(bad).join("\n");
  assert.match(problems, /schema/);
  assert.match(problems, /long\[0\]\.thumb/);
  assert.match(problems, /shorts\[0\]\.url/);
  assert.match(problems, /shorts\[1\]: thumbnail must be 405x720/);
  assert.match(problems, /long\[1\]\.views: not a count/);
  assert.match(problems, /long\[2\]\.views: not a count/);
  // views is optional: the published feed carries none and is the same shape.
  const bare = snapshot();
  for (const v of [...bare.long, ...bare.shorts]) delete v.views;
  assert.deepEqual(snapshotProblems(bare), []);
});

test("a fetch with an empty list, or far fewer entries than the snapshot, is suspicious", () => {
  const prev = snapshot();
  assert.deepEqual(suspicious(prev, prev), []);
  assert.deepEqual(suspicious({ long: prev.long.slice(0, 4), shorts: prev.shorts.slice(0, 8) }, prev), []);
  assert.match(suspicious({ long: [], shorts: prev.shorts }, prev).join(), /long: no entries/);
  assert.match(suspicious({ long: prev.long, shorts: prev.shorts.slice(0, 7) }, prev).join(), /shorts: 7 entries/);
  assert.match(suspicious({ long: [], shorts: [] }, null).join(), /long: no entries.*shorts: no entries/);
  assert.deepEqual(suspicious({ long: prev.long.slice(0, 1), shorts: prev.shorts.slice(0, 1) }, null), []);
});

const NOW = Date.parse("2026-11-22T00:00:00.000Z"); // a clock held just after the fixture snapshot

test("loadVideos leaves out a hidden video and one whose thumbnail is not on disk, and nothing else", () => {
  const dir = mkdtempSync(join(tmpdir(), "archv-videos-"));
  const snap = snapshot();
  writeFileSync(join(dir, "videos.json"), JSON.stringify(snap));
  mkdirSync(join(dir, "public", "media", "videos"), { recursive: true });
  for (const v of [...snap.long, ...snap.shorts.slice(1)]) writeFileSync(join(dir, "public", v.thumb), "x");
  const logs = [];
  const opts = { path: join(dir, "videos.json"), publicDir: join(dir, "public"), now: NOW };
  const out = loadVideos({ ...opts, hidden: new Set([snap.long[1].id]), log: (m) => logs.push(m) });
  assert.equal(out.long.length, 6);
  assert.ok(!out.long.some((v) => v.id === snap.long[1].id));
  assert.equal(out.shorts.length, 14);
  assert.equal(logs.length, 1);
  assert.match(logs[0], /YhHjI-Dbhws: thumbnail missing/);
  // Every upload shows: with nothing hidden, every video with a thumbnail comes back, in snapshot order.
  const all = loadVideos({ ...opts, hidden: new Set(), log: () => {} });
  assert.deepEqual(all.long.map((v) => v.id), snap.long.map((v) => v.id));
  assert.deepEqual(all.shorts.map((v) => v.id), snap.shorts.slice(1).map((v) => v.id));
  // The sort key stays in the snapshot: nothing loaded carries a count.
  assert.ok(snap.shorts.some((v) => v.views > 0));
  for (const v of [...all.long, ...all.shorts]) assert.deepEqual(Object.keys(v), ["id", "title", "published", "url", "thumb", "thumbWidth", "thumbHeight"]);
  assert.equal(hiddenIds(join(dir, "no-such-file.json")).size, 0, "a missing hidden file hides nothing");
  writeFileSync(join(dir, "hidden.json"), JSON.stringify({ hidden: [{ id: snap.long[0].id, why: "test" }] }));
  assert.deepEqual([...hiddenIds(join(dir, "hidden.json"))], [snap.long[0].id]);
  writeFileSync(join(dir, "bad-hidden.json"), JSON.stringify({ hidden: ["nope"] }));
  assert.throws(() => hiddenIds(join(dir, "bad-hidden.json")), /must be a list/);
  assert.equal(loadVideos({ path: join(dir, "none.json") }), null);
  writeFileSync(join(dir, "broken.json"), JSON.stringify({ ...snap, schema: "nope" }));
  assert.throws(() => loadVideos({ path: join(dir, "broken.json"), publicDir: join(dir, "public") }), /not a valid archv-videos\/1/);
});

test("a snapshot older than the limit is not shown at all, and says so once", () => {
  const dir = mkdtempSync(join(tmpdir(), "archv-videos-"));
  const snap = snapshot();
  writeFileSync(join(dir, "videos.json"), JSON.stringify(snap));
  mkdirSync(join(dir, "public", "media", "videos"), { recursive: true });
  for (const v of [...snap.long, ...snap.shorts]) writeFileSync(join(dir, "public", v.thumb), "x");
  const at = (days) => Date.parse(snap.fetchedAt) + days * 86_400_000;
  const opts = { path: join(dir, "videos.json"), publicDir: join(dir, "public"), hidden: new Set() };
  assert.equal(MAX_AGE_DAYS, 30);
  assert.equal(loadVideos({ ...opts, now: at(29), log: () => {} }).long.length, 7);
  const logs = [];
  assert.equal(loadVideos({ ...opts, now: at(31), log: (m) => logs.push(m) }), null);
  assert.equal(logs.length, 1);
  assert.match(logs[0], /fetched 31 days ago/);
});

/* What this test must NOT do is fail because an id in videos-hidden.json is still in the committed
   snapshot or still has a thumbnail in public/. Hiding a video is one commit to that file, often
   from a phone, and it has to deploy on a day YouTube does not answer: loadVideos() drops the
   card, build-feed.mjs sweeps the thumbnail out of dist, and the fetcher tidies the rest. The
   clock is held at the snapshot's own date, so the age limit cannot fail a build either. */
test("the committed snapshot is valid, in rank order, and what the build loads from it is not hidden and on disk", () => {
  const data = JSON.parse(readFileSync(join(ROOT, "scripts", "data", "videos.json"), "utf8"));
  assert.deepEqual(snapshotProblems(data), []);
  const at = Date.parse(data.fetchedAt);
  for (const kind of ["long", "shorts"]) {
    assert.ok(data[kind].length <= KEEP[kind]);
    // A list kept from the live site carries no views and keeps the order it was published in.
    if (data[kind].every((v) => "views" in v)) assert.deepEqual(rankVideos(data[kind], at).map((v) => v.id), data[kind].map((v) => v.id), `${kind} is not in rankVideos() order`);
  }
  const loaded = loadVideos({ now: at, log: () => {} });
  const hidden = hiddenIds();
  const onDisk = new Set(readdirSync(join(ROOT, "public", "media", "videos")));
  for (const v of [...loaded.long, ...loaded.shorts]) {
    assert.ok(!hidden.has(v.id), `${v.id} is hidden but loadVideos() returned it`);
    assert.ok(onDisk.has(`${v.id}.webp`), `${v.id} has no thumbnail`);
    assert.ok(!("views" in v));
  }
});

test("there is no approval step: the fetcher lists every upload that is not hidden, ranked before it mirrors", () => {
  const src = readFileSync(join(ROOT, "scripts", "fetch-videos.mjs"), "utf8");
  const lib = readFileSync(join(ROOT, "scripts", "videos", "lib.mjs"), "utf8");
  assert.ok(!/approved\.has|approvedIds|videos-approved\.json/.test(src + lib), "the approve-first gate is back");
  assert.ok(!existsSync(join(ROOT, "scripts", "data", "videos-approved.json")));
  const hide = src.indexOf("if (hidden.has(v.id))", src.indexOf("const fetchedAt = Date.now()"));
  assert.ok(hide > 0, "the hidden filter is gone");
  assert.ok(hide < src.indexOf("await mirrorThumb(v.id, kind)"), "thumbnails must be mirrored after the hidden filter");
  assert.ok(src.indexOf("rankVideos(") < src.indexOf("await mirrorThumb(v.id, kind)"), "the order is set before the list is cut to KEEP");
});

test("the block renders the house card, links out safely and shows no view count", () => {
  const html = renderHomeVideos(snapshot());
  assert.match(html, /^<section class="videos" id="videos" aria-labelledby="videos-title" data-embed-origin="https:\/\/www\.youtube-nocookie\.com">/);
  assert.equal((html.match(/class="video-card video-card--long"/g) || []).length, SHOW.long);
  assert.equal((html.match(/class="video-card video-card--shorts"/g) || []).length, SHOW.shorts);
  assert.ok(!/<script/i.test(html), "no script tag may be emitted");
  assert.ok(!/<iframe/i.test(html), "the player is created on a click, never rendered");
  assert.ok(!/ytimg|googlevideo|youtube\.com\/embed/.test(html), "nothing on the page loads from YouTube before a click");
  assert.ok(!/views?\b/i.test(html.replace(/<[^>]+>/g, " ")), "no view counts");
  assert.ok(!/data-views|\b(2281|2136)\b/.test(html), "the sort key is not in the markup");
  assert.ok(!/popular|trending|most (viewed|watched)|top \d/i.test(html), "the block claims no ranking");
  assert.ok(!html.includes("—"), "no em dashes");
  for (const [a] of html.matchAll(/<a\b[^>]*>/g)) {
    assert.match(a, /href="https:\/\/www\.youtube\.com\//);
    assert.match(a, /target="_blank"/);
    assert.match(a, /rel="noopener noreferrer"/);
  }
  for (const [img] of html.matchAll(/<img\b[^>]*>/g)) {
    assert.match(img, /src="\/media\/videos\/[A-Za-z0-9_-]{11}\.webp"/);
    assert.match(img, /alt="Still from the (video|Short): [^"]{10,}"/);
    assert.match(img, /width="\d+" height="\d+" loading="lazy" decoding="async"/);
  }
  assert.match(html, /<h2 id="videos-title" class="videos__title">Video<\/h2>/);
  assert.match(html, />Watch<\/h3>/);
  assert.match(html, />Shorts<\/h3>/);
  assert.match(html, /<a class="videos__more" href="https:\/\/www\.youtube\.com\/@thearchvca"[^>]*>More on YouTube<\/a>/);
});

test("titles are escaped on the way into the markup", () => {
  const snap = snapshot();
  snap.long[0].title = `<img src=x onerror=1> "quoted" & 'single'`;
  const html = renderHomeVideos(snap);
  assert.ok(!html.includes("<img src=x"));
  assert.ok(html.includes("&lt;img src=x onerror=1&gt; &quot;quoted&quot; &amp; &#39;single&#39;"));
});

test("no data, or two empty lists, renders nothing; one empty list drops its group", () => {
  assert.equal(renderHomeVideos(null), "");
  assert.equal(renderHomeVideos({ ...snapshot(), long: [], shorts: [] }), "");
  const onlyShorts = renderHomeVideos({ ...snapshot(), long: [] });
  assert.ok(!onlyShorts.includes("videos__group--long"));
  assert.ok(onlyShorts.includes("videos__group--shorts"));
});

test("dates print in the desk's time zone, with a year only when it is not this one", () => {
  assert.equal(displayDate("2026-11-13T00:21:02.000Z", "2026-11-21T20:00:00.000Z"), "12 November");
  assert.equal(displayDate("2025-12-31T18:00:00.000Z", "2026-11-21T20:00:00.000Z"), "31 December 2025");
});

test("the player and the CSP name the same origin as the block", () => {
  const client = readFileSync(join(ROOT, "src", "components", "videos.ts"), "utf8");
  assert.ok(client.includes(`const EMBED_ORIGIN = '${EMBED_ORIGIN}';`));
  assert.ok(client.includes("autoplay=1&playsinline=1&rel=0"));
  assert.ok(!/referrerpolicy|no-referrer"/i.test(client.replace(/\/\/.*$/gm, "")), "the iframe keeps the page's referrer policy");
  assert.ok(!/youtube\.com\/iframe_api|player_api/.test(client), "no YouTube JS API");
  const index = readFileSync(join(ROOT, "index.html"), "utf8");
  const csp = index.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)"/)[1];
  assert.match(csp, new RegExp(`(^|;)\\s*frame-src ${EMBED_ORIGIN.replace(/[.]/g, "\\.")}(;|$)`));
  assert.match(csp, /img-src 'self' data:;/);
  assert.ok(index.includes('<meta name="referrer" content="strict-origin-when-cross-origin" />'));
});
