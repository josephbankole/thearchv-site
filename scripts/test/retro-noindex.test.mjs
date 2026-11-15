// Retro noindex sitemap rows (live-archv-7): a listed page keeps its sitemap.xml row until its
// batch's sitemapUntil date, then drops out; an unlisted page always keeps its row.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { retroInSitemap, isIndexable, retroNoindexFileProblems } from "../shared/retro-noindex.mjs";

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

// site-build-5: feed.xml and news-sitemap.xml skip a listed page even when its own fields say index.
test("isIndexable refuses a listed path whatever indexDecision says", () => {
  const yes = () => ({ index: true });
  const no = () => ({ index: false });
  for (const b of DATA.batches) {
    assert.equal(isIndexable({}, b.paths[0], b.date, yes), false, b.paths[0]);
  }
  assert.equal(isIndexable({}, "/desk/transfer/2099-01-01/", "2099-01-02", yes), true);
  assert.equal(isIndexable({}, "/desk/transfer/2099-01-01/", "2099-01-02", no), false);
});

// site-build-11: a present but broken list file is a build failure, a missing one only a warning.
test("retroNoindexFileProblems passes the committed file", () => {
  assert.deepEqual(retroNoindexFileProblems(), { missing: false, problems: [] });
});

test("retroNoindexFileProblems refuses a broken file and lets a missing one through", () => {
  const dir = mkdtempSync(join(tmpdir(), "retro-noindex-"));
  try {
    const file = join(dir, "retro-noindex.json");
    assert.deepEqual(retroNoindexFileProblems(join(dir, "absent.json")), { missing: true, problems: [] });
    writeFileSync(file, '{"batches": [{"batch": 1, "paths": ["/duel/a-v-b/",]}]}');
    assert.match(retroNoindexFileProblems(file).problems[0], /does not parse/);
    writeFileSync(file, '{"_about": "x"}');
    assert.deepEqual(retroNoindexFileProblems(file).problems, ["has no batches array"]);
    writeFileSync(file, '{"batches": [{"batch": 2}]}');
    assert.deepEqual(retroNoindexFileProblems(file).problems, ["batch 2 has no paths array"]);
    writeFileSync(file, '{"batches": [{"batch": 3, "paths": ["/duel/a-v-b/", "duel/c-v-d"]}]}');
    assert.deepEqual(retroNoindexFileProblems(file).problems, ['batch 3 has a bad path "duel/c-v-d"']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
