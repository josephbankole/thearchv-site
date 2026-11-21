/* home-feeds.test.mjs: the front page's posters and the two feeds published beside them
   (spec B2.6, 2026-10-28). Reads the BUILT dist, so it runs in `npm run build` straight after
   build-feed.mjs, and on its own (`npm run test:home`) against whatever dist is there. DIST points
   it at another build. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const DIST = process.env.DIST || join(ROOT, "dist");
const readJson = (rel) => JSON.parse(readFileSync(join(DIST, rel), "utf8"));
const html = () => readFileSync(join(DIST, "index.html"), "utf8");
// The video block's own reader: the block and its feed are checked against what it loads.
const { loadVideos, snapshotProblems, SHOW, EMBED_ORIGIN } = await import("../videos/lib.mjs");

// Everything expected below is worked out from poster-tiles.json, so rotating the front-page
// posters (one edit to `home` there, then a deploy) never needs this file or a fixture touched.
const { tiles } = JSON.parse(readFileSync(join(ROOT, "scripts", "data", "poster-tiles.json"), "utf8"));
const STORE = "https://thearchvca.etsy.com";
const labelOf = (t) => (t.group === "women" ? `${t.label} (Women)` : t.label);
// The homepage's four, as src/render/home.ts picks them.
const homeTiles = tiles.filter((t) => typeof t.home === "number").sort((a, b) => a.home - b.home).slice(0, 4);
// The feed's, as build-feed.mjs picks them: a tile whose image is missing is skipped with a log line.
const feedTiles = tiles
  .filter((t) => Number.isInteger(t.home))
  .sort((a, b) => a.home - b.home)
  .slice(0, 4)
  .filter((t) => existsSync(join(ROOT, "public", t.image)));

// One covers-grid item, in the markup of the hand-written block the renderer replaced.
const attr = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const coverLi = (t) =>
  `<li><a href="${attr(`${STORE}/listing/${t.listing}`)}" target="_blank" rel="noopener noreferrer" data-shop="united-posters"><img src="${attr(t.image)}" alt="${attr(t.alt)}" loading="lazy" width="900" height="675" /><span>${attr(t.label)}</span></a></li>`;
const coversBlock = (items) => items.map((t) => `              ${coverLi(t)}\n`).join("");

test("home-covers.json: the home tiles in home order, Etsy links, thearchv.ca images, real alts", () => {
  const feed = readJson("feed/home-covers.json");
  assert.equal(feed.schema, "archv-home-covers/1");
  assert.equal(feed.shopUrl, STORE);
  assert.ok(feed.title && feed.lede);
  assert.deepEqual(feed.items.map((i) => i.id), feedTiles.map((t) => t.listing));
  assert.deepEqual(feed.items.map((i) => i.label), feedTiles.map(labelOf));
  for (const it of feed.items) {
    assert.equal(it.url, `${STORE}/listing/${it.id}`);
    assert.match(it.image, /^https:\/\/thearchv\.ca\/shop\/[a-z0-9-]+\.webp$/);
    assert.ok(it.alt.trim().length > 20, `${it.id} alt is too thin`);
    assert.ok(it.label.trim());
    assert.equal(it.width, 900);
    assert.equal(it.height, 675);
  }
});

test("home-covers.json agrees with the tiles the homepage renders", () => {
  assert.deepEqual(homeTiles.map((t) => t.home), [1, 2, 3, 4]);
  const feed = readJson("feed/home-covers.json");
  assert.deepEqual(feed.items.map((i) => i.alt), feedTiles.map((t) => t.alt));
});

test("team-colours.json is published unchanged as archv-team-colours/1", () => {
  const published = readFileSync(join(DIST, "feed", "team-colours.json"), "utf8");
  const source = readFileSync(join(ROOT, "scripts", "data", "team-colours.json"), "utf8");
  assert.equal(published, source);
  assert.equal(JSON.parse(published).schema, "archv-team-colours/1");
});

test("the built covers block is the home tiles, in the hand-written block's markup", () => {
  const page = html();
  const open = page.indexOf('<ul class="archive__covers-grid" aria-label="Manchester United posters" data-stagger>');
  assert.ok(open > 0, "covers grid missing");
  const start = page.indexOf("\n", open) + 1;
  const end = page.indexOf("          </ul>", start);
  assert.equal(page.slice(start, end), coversBlock(homeTiles.map((t) => ({ ...t, label: labelOf(t) }))));
  assert.ok(!page.includes("<!--archv:covers-->"), "covers marker left unreplaced");
});

test("the markup above is byte for byte the hand-written block of 2026-10-28", () => {
  // The frozen block holds its own data (listing, image, alt and label per item), so this checks
  // the markup alone and stays true whatever poster-tiles.json says today.
  const golden = readFileSync(join(HERE, "fixtures", "home-covers-block.html"), "utf8");
  const unattr = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  const items = [...golden.matchAll(/listing\/(\d+)" [^>]*><img src="([^"]*)" alt="([^"]*)"[^>]*\/><span>([^<]*)<\/span>/g)].map(
    ([, listing, image, alt, label]) => ({ listing, image: unattr(image), alt: unattr(alt), label: unattr(label) }),
  );
  assert.equal(items.length, 4);
  assert.equal(coversBlock(items), golden);
});

test("the Wire block, when the build has an edition, sits before the Dispatch and is calm", () => {
  const page = html();
  assert.ok(!page.includes("<!--archv:wire-->"), "wire marker left unreplaced");
  const wire = page.indexOf('<section class="wire wire--home"');
  if (wire < 0) return; // no edition in the last 7 days: the block renders nothing, by design
  const reads = page.indexOf('<section class="homereads"');
  assert.ok(reads > wire, "the Wire block must come before the Dispatch block");
  const block = page.slice(wire, page.indexOf("</section>", wire));
  assert.ok(!/<img\b/i.test(block), "no images in the Wire");
  assert.ok(block.includes('<p class="wire__more"><a href="/wire/">The Wire page</a></p>'));
  for (const [a] of block.matchAll(/<a\b[^>]*href="https?:[^"]*"[^>]*>/g)) {
    assert.match(a, /target="_blank"/);
    assert.match(a, /rel="noopener noreferrer"/);
  }
});

/* ---------- the video block and its feed (2026-11-21) ---------- */

test("the video block sits directly after the scores strip and before the lead", () => {
  const page = html();
  assert.ok(!page.includes("<!--archv:videos-->"), "videos marker left unreplaced");
  const data = loadVideos({ log: () => {} });
  const block = page.indexOf('<section class="videos"');
  if (!data || (!data.long.length && !data.shorts.length)) {
    assert.equal(block, -1, "no data, so no block");
    return;
  }
  assert.ok(block > 0, "video block missing");
  const strip = page.indexOf('<section class="scores-strip"');
  const stripEnd = page.indexOf("</section>", strip) + "</section>".length;
  // Nothing but white space and comments between the end of the strip and the block.
  assert.equal(page.slice(stripEnd, block).replace(/<!--[\s\S]*?-->/g, "").trim(), "");
  assert.ok(page.indexOf('<section class="lead"') > block, "the lead must come after the video block");
});

test("every video card is a plain link to YouTube with our own thumbnail, and nothing loads from YouTube", () => {
  const page = html();
  const start = page.indexOf('<section class="videos"');
  if (start < 0) return;
  const block = page.slice(start, page.indexOf("</section>", start));
  const data = loadVideos({ log: () => {} });
  const expected = [...data.long.slice(0, SHOW.long), ...data.shorts.slice(0, SHOW.shorts)];
  const cards = [...block.matchAll(/<li class="video-card video-card--(long|shorts)" data-video-id="([^"]+)"[^>]*>\s*<a class="video-card__link" href="([^"]+)"[^>]*data-video-play>\s*<span class="video-card__media"><img src="([^"]+)"/g)];
  assert.deepEqual(cards.map((c) => c[2]), expected.map((v) => v.id));
  for (const [, kind, id, href, src] of cards) {
    assert.equal(href, kind === "shorts" ? `https://www.youtube.com/shorts/${id}` : `https://www.youtube.com/watch?v=${id}`);
    assert.equal(src, `/media/videos/${id}.webp`);
    assert.ok(existsSync(join(DIST, src)), `${src} is not in the build`);
  }
  assert.ok(!/<iframe|<script/i.test(block));
  assert.ok(!/ytimg\.com|youtube-nocookie\.com\/embed/.test(block));
});

test("the homepage CSP lets the player frame its one origin and still serves images from this site alone", () => {
  const csp = html().match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)"/)[1];
  const directive = (name) => csp.split(";").map((d) => d.trim()).find((d) => d.startsWith(`${name} `));
  assert.equal(directive("frame-src"), `frame-src ${EMBED_ORIGIN}`);
  assert.equal(directive("img-src"), "img-src 'self' data:");
});

test("feed/videos.json is archv-videos/1 and lists what the front page draws from", () => {
  const feed = readJson("feed/videos.json");
  const data = loadVideos({ log: () => {} });
  if (!data) {
    assert.deepEqual(feed, { schema: "archv-videos/1", fetchedAt: null, long: [], shorts: [] });
    return;
  }
  assert.deepEqual(snapshotProblems(feed), []);
  assert.deepEqual(Object.keys(feed), ["schema", "fetchedAt", "long", "shorts"]);
  assert.deepEqual(feed.long, data.long);
  assert.deepEqual(feed.shorts, data.shorts);
  for (const v of [...feed.long, ...feed.shorts]) {
    assert.deepEqual(Object.keys(v), ["id", "title", "published", "url", "thumb", "thumbWidth", "thumbHeight"]);
    assert.match(v.thumb, /^\/media\/videos\/[A-Za-z0-9_-]{11}\.webp$/);
    assert.ok(existsSync(join(DIST, v.thumb)), `${v.thumb} is not in the build`);
    assert.ok(!("views" in v));
  }
});
