/* home-feeds.test.mjs: the front page's shop tiles (posters until 2026-11-25) and the feeds published
   beside them (spec B2.6, 2026-10-28). Reads the BUILT dist, so it runs in `npm run build` straight after
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

// Everything expected below is worked out from seasonal-tiles.json, so rotating the front-page
// tiles (one edit to `home` there, then a deploy) never needs this file touched. Since 2026-11-25
// the block is the seasonal shop range on shop.thearchv.ca, not the Etsy poster tiles.
const seasonal = JSON.parse(readFileSync(join(ROOT, "scripts", "data", "seasonal-tiles.json"), "utf8"));
const SHOP = "https://shop.thearchv.ca";
const ETSY = "https://thearchvca.etsy.com";
const productUrl = (t) => `${SHOP}/products/${t.handle}`;
// The homepage's four, as src/render/home.ts picks them.
const homeTiles = seasonal.tiles.filter((t) => typeof t.home === "number").sort((a, b) => a.home - b.home).slice(0, 4);
// The feed's, as build-feed.mjs picks them: a tile whose image is missing is skipped with a log line.
const feedTiles = seasonal.tiles
  .filter((t) => Number.isInteger(t.home))
  .sort((a, b) => a.home - b.home)
  .slice(0, 4)
  .filter((t) => existsSync(join(ROOT, "public", t.image)));

// One grid item, in the markup renderCovers() writes.
const attr = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const coverLi = (t) =>
  `<li><a href="${attr(productUrl(t))}" data-shop="seasonal"><img src="${attr(t.image)}" alt="${attr(t.alt)}" loading="lazy" width="900" height="675" /><span>${attr(t.name)}</span></a></li>`;
const coversBlock = (items) => items.map((t) => `              ${coverLi(t)}\n`).join("");

// The Etsy listings that are not live since 2026-11-25. No built page and no feed may link one.
const DEAD_LISTINGS = [
  "4527680418", "4527296455", "4594017483", "4517396908", "4517398702", "4517399720", "4521778670",
  "4521798833", "4521798166", "4521795943", "4521790986", "4521787127", "4527673755", "4517424545",
  // The five Manchester United Women listings, already unavailable on Etsy on 2026-11-25.
  "4539752764", "4539751302", "4539732851", "4539731211", "4539743978",
];

test("home-covers.json: the seasonal home tiles in home order, shop product links, thearchv.ca images, real alts", () => {
  const feed = readJson("feed/home-covers.json");
  assert.equal(feed.schema, "archv-home-covers/1");
  // Both app builds label this link "All prints in the Etsy shop", so it stays on Etsy (build-feed.mjs).
  assert.equal(feed.shopUrl, ETSY);
  assert.equal(feed.title, seasonal.title);
  assert.equal(feed.lede, seasonal.lede);
  assert.equal(feed.items.length, 4);
  assert.deepEqual(feed.items.map((i) => i.id), feedTiles.map((t) => t.handle));
  assert.deepEqual(feed.items.map((i) => i.label), feedTiles.map((t) => t.name));
  for (const it of feed.items) {
    assert.equal(it.url, `${SHOP}/products/${it.id}`);
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

test("storefront.json: our shop as shopUrl, every item a shop.thearchv.ca product with a thearchv.ca image", () => {
  const feed = readJson("feed/storefront.json");
  assert.equal(feed.shopUrl, SHOP);
  assert.ok(feed.items.length > 0);
  for (const it of feed.items) {
    assert.equal(it.url, `${SHOP}/products/${it.id}`);
    assert.match(it.image, /^https:\/\/thearchv\.ca\/shop\/[a-z0-9-]+\.webp$/);
    assert.ok(existsSync(join(ROOT, "public", new URL(it.image).pathname)), `${it.id} image missing under public/`);
    assert.match(it.price, /^(From )?CA\$\d+\.\d{2}$/);
  }
});

test("team-colours.json is published unchanged as archv-team-colours/1", () => {
  const published = readFileSync(join(DIST, "feed", "team-colours.json"), "utf8");
  const source = readFileSync(join(ROOT, "scripts", "data", "team-colours.json"), "utf8");
  assert.equal(published, source);
  assert.equal(JSON.parse(published).schema, "archv-team-colours/1");
});

test("the built shop block is the seasonal home tiles, linking to the shop", () => {
  const page = html();
  const open = page.indexOf('<ul class="archive__covers-grid" aria-label="');
  assert.ok(open > 0, "covers grid missing");
  const start = page.indexOf("\n", open) + 1;
  const end = page.indexOf("          </ul>", start);
  assert.equal(page.slice(start, end), coversBlock(homeTiles));
  assert.ok(!page.includes("<!--archv:covers-->"), "covers marker left unreplaced");
  const section = page.slice(page.indexOf('<section class="archive" id="archive">'), page.indexOf("</section>", open));
  assert.ok(section.includes(`<h2 class="archive__title" data-reveal>${attr(seasonal.title)}</h2>`));
  assert.ok(section.includes(`href="${attr(seasonal.collection.url)}"`), "the range link is missing");
  assert.ok(!/etsy\.com/.test(section), "the shop block must not link to Etsy");
});

test("no built page or feed links a deactivated Etsy listing (2026-11-25)", async () => {
  const { readdirSync, statSync } = await import("node:fs");
  const hits = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(html|json|xml|txt)$/.test(name)) {
        const text = readFileSync(full, "utf8");
        for (const id of DEAD_LISTINGS) if (text.includes(`listing/${id}`)) hits.push(`${full.slice(DIST.length)}: ${id}`);
      }
    }
  };
  walk(DIST);
  assert.deepEqual(hits, []);
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
