/* longread-sports.test.mjs: every long read carries a sport into archive.json (2026-10-28,
   package L). Runs inside `npm run build` after build-feed.mjs, and on its own with
   `npm run test:home`. DIST points it at another build. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveLongReadSport, LONGREAD_SPORTS, LONGREAD_BACKFILL } from "../shared/longread-sport.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIST = process.env.DIST || join(ROOT, "dist");

test("the sport list is the feed's sport keys plus multi", () => {
  assert.deepEqual(LONGREAD_SPORTS, ["football", "nfl", "f1", "tennis", "golf", "basketball", "multi"]);
});

test("every backfill tag is a real sport and every key a /reads/ slug", () => {
  for (const [slug, sport] of Object.entries(LONGREAD_BACKFILL)) {
    assert.match(slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, slug);
    assert.ok(LONGREAD_SPORTS.includes(sport), `${slug}: ${sport}`);
  }
  // Spot checks against the issues as read: the weekly round-ups span every sport.
  assert.equal(LONGREAD_BACKFILL["jalen-hurts-blood-clot-care-goes-under-joint-nfl-and-nflpa-review"], "multi");
  assert.equal(LONGREAD_BACKFILL["trinity-rodman-x-ben-shelton"], "multi");
  assert.equal(LONGREAD_BACKFILL["the-class-of-92"], "football");
});

test("an entry's own sport beats the table; a bad or missing one is dropped with a warning", () => {
  const warnings = [];
  const warn = (m) => warnings.push(m);
  const backfill = { "a-read": "football" };
  assert.equal(resolveLongReadSport({ title: "A read", sport: "nfl" }, "/reads/a-read/", { warn, backfill }), "nfl");
  assert.equal(resolveLongReadSport({ title: "A read" }, "/reads/a-read/", { warn, backfill }), "football");
  assert.equal(warnings.length, 0);
  assert.equal(resolveLongReadSport({ title: "A read", sport: "cricket" }, "/reads/a-read/", { warn, backfill }), null);
  assert.equal(resolveLongReadSport({ title: "Another" }, "/reads/another/", { warn, backfill }), null);
  assert.equal(warnings.length, 2);
});

test("archive.json: every long read carries a valid sport", () => {
  const archive = JSON.parse(readFileSync(join(DIST, "feed", "archive.json"), "utf8"));
  assert.ok(archive.longReads.length > 0);
  for (const r of archive.longReads) {
    assert.ok(LONGREAD_SPORTS.includes(r.sport), `"${r.title}" has sport ${JSON.stringify(r.sport)}`);
  }
});
