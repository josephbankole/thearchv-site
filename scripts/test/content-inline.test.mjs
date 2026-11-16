// Inline markdown for content/ explainers (site-build-4): only safe link targets become anchors,
// and emphasis never rewrites an href.
import { test } from "node:test";
import assert from "node:assert/strict";
import { inlineMd } from "../shared/content-inline.mjs";

test("http(s) and site-root links become anchors", () => {
  assert.equal(inlineMd("see [FIFA](https://www.fifa.com/a?b=1&c=2)"), 'see <a href="https://www.fifa.com/a?b=1&amp;c=2">FIFA</a>');
  assert.equal(inlineMd("[the desk](/desk/transfer/)"), '<a href="/desk/transfer/">the desk</a>');
});

test("unsafe targets render as text with no anchor", () => {
  for (const href of ["javascript:void(location='//evil')", "data:text/html,hi", "//evil.example/x", "mailto:a@b.c", "vbscript:x"]) {
    const out = inlineMd(`[click](${href})`);
    assert.ok(!out.includes("<a"), `${href} -> ${out}`);
    assert.ok(out.startsWith("click"), `${href} -> ${out}`);
  }
});

test("emphasis does not reach inside an href", () => {
  assert.equal(inlineMd("[x](https://a.example/*a*/b)"), '<a href="https://a.example/*a*/b">x</a>');
});

test("emphasis still spans a link and applies inside link text", () => {
  assert.equal(inlineMd("*read [the **list**](/x/) now*"), '<em>read <a href="/x/">the <strong>list</strong></a> now</em>');
});

test("text is escaped", () => {
  assert.equal(inlineMd("a <b> & [c](/d/)"), 'a &lt;b&gt; &amp; <a href="/d/">c</a>');
});
