/* videos.test.mjs: the video block's reader (scripts/videos/lib.mjs), on two recorded feeds.
   Fixtures only, no network: fixtures/videos/uulf.xml and uush.xml are YouTube's own Atom feeds
   for the channel's long-form and Shorts playlists, saved on 2026-11-21. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseFeed, cleanTitle, decodeXml, snapshotProblems, suspicious, loadVideos, hiddenIds, renderHomeVideos,
  displayDate, thumbPath, VIDEOS_SCHEMA, CHANNEL_ID, PLAYLISTS, EMBED_ORIGIN, THUMB, SHOW,
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

test("an item carries id, title, published and url, and never a view count", () => {
  for (const v of [...parseFeed(LONG, "long").items, ...parseFeed(SHORTS, "shorts").items]) {
    assert.deepEqual(Object.keys(v).sort(), ["id", "published", "title", "url"]);
  }
});

test("titles are decoded, lose the channel's own sign-off and never carry a hashtag", () => {
  const long = parseFeed(LONG, "long").items;
  assert.equal(long[0].title, "Athletic Club v Real Sociedad: How La Liga's Connected Ball Fell Out of Sync With VAR");
  assert.ok(long.every((v) => !/\|\s*The ARCHV$/i.test(v.title)));
  const shorts = parseFeed(SHORTS, "shorts").items;
  assert.equal(shorts[0].title, `Mauricio Pochettino at Manchester United: "I don't think he was anybody's first choice"`);
  assert.equal(cleanTitle("A goal worth seeing #shorts #football | The ARCHV"), "A goal worth seeing");
  assert.equal(cleanTitle("Number 7 shirt, 3-2 at Anfield"), "Number 7 shirt, 3-2 at Anfield");
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
  const problems = snapshotProblems(bad).join("\n");
  assert.match(problems, /schema/);
  assert.match(problems, /long\[0\]\.thumb/);
  assert.match(problems, /shorts\[0\]\.url/);
  assert.match(problems, /shorts\[1\]: thumbnail must be 405x720/);
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

test("loadVideos leaves out a hidden video and one whose thumbnail is not on disk", () => {
  const dir = mkdtempSync(join(tmpdir(), "archv-videos-"));
  const snap = snapshot();
  writeFileSync(join(dir, "videos.json"), JSON.stringify(snap));
  mkdirSync(join(dir, "public", "media", "videos"), { recursive: true });
  for (const v of [...snap.long, ...snap.shorts.slice(1)]) writeFileSync(join(dir, "public", v.thumb), "x");
  const logs = [];
  const out = loadVideos({ path: join(dir, "videos.json"), publicDir: join(dir, "public"), hidden: new Set([snap.long[1].id]), log: (m) => logs.push(m) });
  assert.equal(out.long.length, 6);
  assert.ok(!out.long.some((v) => v.id === snap.long[1].id));
  assert.equal(out.shorts.length, 14);
  assert.equal(logs.length, 1);
  assert.match(logs[0], /YhHjI-Dbhws: thumbnail missing/);
  assert.equal(loadVideos({ path: join(dir, "none.json") }), null);
  writeFileSync(join(dir, "broken.json"), JSON.stringify({ ...snap, schema: "nope" }));
  assert.throws(() => loadVideos({ path: join(dir, "broken.json"), publicDir: join(dir, "public") }), /not a valid archv-videos\/1/);
});

test("the committed snapshot is valid, every thumbnail is committed, and no hidden video is in it", () => {
  const data = JSON.parse(readFileSync(join(ROOT, "scripts", "data", "videos.json"), "utf8"));
  assert.deepEqual(snapshotProblems(data), []);
  const logs = [];
  const loaded = loadVideos({ log: (m) => logs.push(m) });
  assert.deepEqual(logs, []);
  assert.ok(loaded.long.length >= 1 && loaded.shorts.length >= 1);
  const hidden = hiddenIds();
  assert.ok(hidden.size > 0);
  for (const v of [...data.long, ...data.shorts]) assert.ok(!hidden.has(v.id), `${v.id} is hidden but in the snapshot`);
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
