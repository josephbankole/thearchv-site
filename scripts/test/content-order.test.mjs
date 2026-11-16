/* content-order.test.mjs: content pages come back in one fixed order on every machine (audit
   site-build-10), newest datePublished first, then by slug, never in filesystem order. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadContentPages, byNewestThenSlug } from "../shared/content-pages.mjs";

test("byNewestThenSlug puts the newest first, breaks ties by slug, undated last", () => {
  const rows = [
    { slug: "b", datePublished: "2026-08-24" },
    { slug: "z" },
    { slug: "a", datePublished: "2026-08-24" },
    { slug: "c", datePublished: "2026-10-03" },
  ];
  assert.deepEqual(rows.sort(byNewestThenSlug).map((r) => r.slug), ["c", "a", "b", "z"]);
});

test("loadContentPages returns the pages already in that order", () => {
  const pages = loadContentPages();
  assert.ok(pages.length > 0);
  const keys = pages.map((p) => `${p.datePublished}|${p.slug}`);
  assert.deepEqual(keys, [...pages].sort(byNewestThenSlug).map((p) => `${p.datePublished}|${p.slug}`));
});
