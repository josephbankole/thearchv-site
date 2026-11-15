// Retro noindex sitemap rows (live-archv-7): a listed page keeps its sitemap.xml row until its
// batch's sitemapUntil date, then drops out; an unlisted page always keeps its row.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { retroInSitemap } from "../shared/retro-noindex.mjs";

const DATA = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "data", "retro-noindex.json"), "utf8"));

test("every batch names a valid sitemapUntil after its own date", () => {
  for (const b of DATA.batches) {
    assert.match(b.sitemapUntil, /^\d{4}-\d{2}-\d{2}$/, `batch ${b.batch}`);
    assert.ok(b.sitemapUntil > b.date, `batch ${b.batch}: sitemapUntil ${b.sitemapUntil} is not after ${b.date}`);
  }
});

test("a listed path keeps its row through sitemapUntil and loses it the day after", () => {
  for (const b of DATA.batches) {
    const path = b.paths[0];
    const next = new Date(Date.parse(`${b.sitemapUntil}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
    assert.equal(retroInSitemap(path, b.date), true, `${path} on ${b.date}`);
    assert.equal(retroInSitemap(path, b.sitemapUntil), true, `${path} on ${b.sitemapUntil}`);
    assert.equal(retroInSitemap(path, next), false, `${path} on ${next}`);
  }
});

test("an unlisted path always keeps its row", () => {
  assert.equal(retroInSitemap("/desk/transfer/2099-01-01/", "2100-01-01"), true);
});
