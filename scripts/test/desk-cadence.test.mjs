// gap4-9: the Transfer Desk's cadence promise ("Verified Daily") comes off once the desk has missed
// two of its own periods, and comes back the day a new entry lands. The sport desks no longer
// print a cadence or a dated lede at all.
import { test } from "node:test";
import assert from "node:assert/strict";
import { deskQuiet, laneIndexTitle, SPORT_DESK_COPY, LANE_META } from "../shared/page-shell.mjs";

test("deskQuiet: more than two periods since the newest entry", () => {
  assert.equal(deskQuiet("2026-11-13", 1, "2026-11-15"), false, "two days on a daily desk is still within");
  assert.equal(deskQuiet("2026-11-12", 1, "2026-11-15"), true);
  assert.equal(deskQuiet("2026-11-02", 7, "2026-11-15"), false);
  assert.equal(deskQuiet("2026-10-31", 7, "2026-11-15"), true);
  assert.equal(deskQuiet(null, 1, "2026-11-15"), false, "an empty desk shows its holding line instead");
  assert.equal(deskQuiet("2026-01-01", undefined, "2026-11-15"), false, "no stated rhythm, nothing to break");
});

// The sport pages print no desk lede (founder, 2026-11-21). `about` is their meta description, so
// it has to stay evergreen: no cadence promise and no date.
test("a sport desk's description carries no cadence promise and no date", () => {
  for (const [key, copy] of Object.entries(SPORT_DESK_COPY)) {
    assert.ok(copy.about && copy.about.length > 20, key);
    assert.doesNotMatch(copy.about, /a day|daily|every (Monday|week)|weekly/i, key);
    assert.doesNotMatch(copy.about, /\d{4}|latest answer|January|February|March|April|May |June|July|August|September|October|November|December/, key);
    assert.equal(copy.lede, undefined, `${key}: the cadence lede is gone, do not bring it back`);
  }
});

test("laneIndexTitle drops Verified Daily from a quiet Transfer Desk only", () => {
  assert.equal(laneIndexTitle("transfer", [{ date: "2026-11-14" }], "2026-11-15"), LANE_META.transfer.indexTitle);
  assert.equal(laneIndexTitle("transfer", [{ date: "2026-10-07" }], "2026-11-15"), "Manchester United Transfer News · The ARCHV");
  assert.equal(laneIndexTitle("leagues", [{ date: "2026-01-01" }], "2026-11-15"), LANE_META.leagues.indexTitle);
});
