/* freshness-report.test.mjs: the internal QA report never lands in the published output (audit
   site-build-8). check-freshness.mjs writes it to REPORT_OUT, never to dist or CONTENT_OUT. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "..", "check-freshness.mjs");

test("the freshness report goes to REPORT_OUT and not to the site output", () => {
  const site = mkdtempSync(join(tmpdir(), "freshness-site-"));
  const reports = mkdtempSync(join(tmpdir(), "freshness-reports-"));
  execFileSync(process.execPath, [SCRIPT], { env: { ...process.env, CONTENT_OUT: site, REPORT_OUT: reports }, stdio: "pipe" });
  assert.equal(existsSync(join(site, "freshness-report.json")), false);
  const report = JSON.parse(readFileSync(join(reports, "freshness-report.json"), "utf8"));
  assert.ok(Array.isArray(report.overdue));
});
