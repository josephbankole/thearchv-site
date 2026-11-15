/* entry-dates.test.mjs: rfc822() formats good dates and stops with a named error on a bad one
   (audit site-build-6: it used to recurse until the stack overflowed). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { rfc822 } from "../shared/entry-dates.mjs";

test("a zoned ISO time and a bare date both format", () => {
  assert.equal(rfc822("2026-11-05T05:22:10-05:00"), "Thu, 05 Nov 2026 05:22:10 -0500");
  assert.equal(rfc822("2026-11-05"), "Thu, 05 Nov 2026 05:00:00 -0500");
});

test("a malformed date throws an error that names it", () => {
  for (const bad of ["2026-11-5", "", undefined, "soon"]) {
    assert.throws(() => rfc822(bad), (err) => err instanceof Error && !(err instanceof RangeError) && /not YYYY-MM-DD/.test(err.message), String(bad));
  }
});
