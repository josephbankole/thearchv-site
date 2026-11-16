// gap8-8: dist/noindex-urls.json lists exactly the built pages whose robots meta says noindex.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isNoindexHtml, noindexPaths } from "../shared/noindex-list.mjs";

const page = (robots) => `<!doctype html><html><head>${robots == null ? "" : `<meta name="robots" content="${robots}" />`}</head><body></body></html>`;

test("isNoindexHtml reads the robots meta and nothing else", () => {
  assert.equal(isNoindexHtml(page("noindex,follow")), true);
  assert.equal(isNoindexHtml(page("noindex")), true);
  assert.equal(isNoindexHtml(page("noindex,nofollow")), true);
  assert.equal(isNoindexHtml(page("index,follow,max-image-preview:large")), false);
  assert.equal(isNoindexHtml(page(null)), false);
  assert.equal(isNoindexHtml(`<meta name="description" content="noindex is a word" />`), false);
});

test("noindexPaths maps built files to their site paths", () => {
  const dist = mkdtempSync(join(tmpdir(), "noindex-list-"));
  try {
    const put = (rel, html) => { const f = join(dist, rel); mkdirSync(join(f, ".."), { recursive: true }); writeFileSync(f, html); };
    put("index.html", page("index,follow"));
    put("404.html", page("noindex"));
    put("answers/a-story/index.html", page("noindex,follow"));
    put("desk/transfer/2026-11-15/index.html", page("index,follow"));
    put("duel/a-v-b/index.html", page("noindex,follow"));
    put("feed/index.json", "{}");
    assert.deepEqual(noindexPaths(dist), ["/404.html", "/answers/a-story/", "/duel/a-v-b/"]);
  } finally {
    rmSync(dist, { recursive: true, force: true });
  }
});
