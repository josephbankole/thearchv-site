/* home-feeds.test.mjs: the front page's posters and the two feeds published beside them
   (spec B2.6, 2026-10-28). Reads the BUILT dist, so it runs in `npm run build` straight after
   build-feed.mjs, and on its own (`npm run test:home`) against whatever dist is there. DIST points
   it at another build. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const DIST = process.env.DIST || join(ROOT, "dist");
const readJson = (rel) => JSON.parse(readFileSync(join(DIST, rel), "utf8"));
const html = () => readFileSync(join(DIST, "index.html"), "utf8");

// The order poster-tiles.json gives the four front-page tiles.
const HOME_ORDER = ["4521788550", "4521782964", "4521779161", "4527673755"];

test("home-covers.json: four items in home order, Etsy links, thearchv.ca images, real alts", () => {
  const feed = readJson("feed/home-covers.json");
  assert.equal(feed.schema, "archv-home-covers/1");
  assert.equal(feed.shopUrl, "https://thearchvca.etsy.com");
  assert.ok(feed.title && feed.lede);
  assert.deepEqual(feed.items.map((i) => i.id), HOME_ORDER);
  for (const it of feed.items) {
    assert.equal(it.url, `https://thearchvca.etsy.com/listing/${it.id}`);
    assert.match(it.image, /^https:\/\/thearchv\.ca\/shop\/[a-z0-9-]+\.webp$/);
    assert.ok(it.alt.trim().length > 20, `${it.id} alt is too thin`);
    assert.ok(it.label.trim());
    assert.equal(it.width, 900);
    assert.equal(it.height, 675);
  }
  assert.equal(feed.items[3].label, "London 2024 (Women)");
});

test("home-covers.json agrees with the tiles the homepage renders", () => {
  const { tiles } = JSON.parse(readFileSync(join(ROOT, "scripts", "data", "poster-tiles.json"), "utf8"));
  const home = tiles.filter((t) => Number.isInteger(t.home)).sort((a, b) => a.home - b.home);
  assert.deepEqual(home.map((t) => t.home), [1, 2, 3, 4]);
  const feed = readJson("feed/home-covers.json");
  assert.deepEqual(feed.items.map((i) => i.alt), home.map((t) => t.alt));
});

test("team-colours.json is published unchanged as archv-team-colours/1", () => {
  const published = readFileSync(join(DIST, "feed", "team-colours.json"), "utf8");
  const source = readFileSync(join(ROOT, "scripts", "data", "team-colours.json"), "utf8");
  assert.equal(published, source);
  assert.equal(JSON.parse(published).schema, "archv-team-colours/1");
});

test("the built covers block is byte-identical to the hand-written one it replaced", () => {
  const golden = readFileSync(join(HERE, "fixtures", "home-covers-block.html"), "utf8");
  const page = html();
  const open = page.indexOf('<ul class="archive__covers-grid" aria-label="Manchester United posters" data-stagger>');
  assert.ok(open > 0, "covers grid missing");
  const start = page.indexOf("\n", open) + 1;
  const end = page.indexOf("          </ul>", start);
  assert.equal(page.slice(start, end), golden);
  assert.ok(!page.includes("<!--archv:covers-->"), "covers marker left unreplaced");
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
