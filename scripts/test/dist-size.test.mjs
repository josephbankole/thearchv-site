/* dist-size.test.mjs: the rules in check-dist-size.mjs (audit gap2-3). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { budgetMb, sizeOf, verdict } from "../check-dist-size.mjs";

const MB = 1024 * 1024;

test("the budget defaults, takes an override and refuses nonsense", () => {
  assert.equal(budgetMb({}), 2500);
  assert.equal(budgetMb({ DIST_BUDGET_MB: "800" }), 800);
  assert.throws(() => budgetMb({ DIST_BUDGET_MB: "lots" }));
  assert.throws(() => budgetMb({ DIST_BUDGET_MB: "-1" }));
});

test("ok under the Pages limit, warn over it, fail over the budget", () => {
  assert.equal(verdict(500 * MB, 2500), "ok");
  assert.equal(verdict(1500 * MB, 2500), "warn");
  assert.equal(verdict(2501 * MB, 2500), "fail");
  assert.equal(verdict(900 * MB, 800), "fail");
});

test("sizeOf adds up nested files", () => {
  const dir = mkdtempSync(join(tmpdir(), "dist-size-"));
  mkdirSync(join(dir, "media"));
  writeFileSync(join(dir, "a.txt"), "x".repeat(10));
  writeFileSync(join(dir, "media", "b.bin"), "y".repeat(32));
  assert.equal(sizeOf(dir), 42);
});
