// gap4-9: a desk's cadence promise ("a day", "every Monday", "Verified Daily") comes off once the
// desk has missed two of its own periods, and comes back the day a new entry lands.
import { test } from "node:test";
import assert from "node:assert/strict";
import { deskQuiet, sportDeskLede, laneIndexTitle, SPORT_DESK_COPY, LANE_META } from "../shared/page-shell.mjs";

test("deskQuiet: more than two periods since the newest entry", () => {
  assert.equal(deskQuiet("2026-11-13", 1, "2026-11-15"), false, "two days on a daily desk is still within");
  assert.equal(deskQuiet("2026-11-12", 1, "2026-11-15"), true);
  assert.equal(deskQuiet("2026-11-02", 7, "2026-11-15"), false);
  assert.equal(deskQuiet("2026-10-31", 7, "2026-11-15"), true);
  assert.equal(deskQuiet(null, 1, "2026-11-15"), false, "an empty desk shows its holding line instead");
  assert.equal(deskQuiet("2026-01-01", undefined, "2026-11-15"), false, "no stated rhythm, nothing to break");
});

test("sportDeskLede keeps the cadence while the desk is live and dates it once quiet", () => {
  assert.equal(sportDeskLede("nfl", [{ date: "2026-11-14" }], "2026-11-15"), SPORT_DESK_COPY.nfl.lede);
  const quiet = sportDeskLede("nfl", [{ date: "2026-09-22" }, { date: "2026-09-21" }], "2026-11-15");
  assert.equal(quiet, "The NFL desk answers the biggest question fans are asking. The latest answer is from 22 September 2026.");
  assert.equal(sportDeskLede("basketball", [{ date: "2026-09-21" }], "2026-11-15"),
    "The basketball desk answers questions on the NBA and the WNBA, covered equally. The latest answer is from 21 September 2026.");
  assert.equal(sportDeskLede("golf", [], "2026-11-15"), SPORT_DESK_COPY.golf.lede);
});

test("no quiet line carries a cadence promise", () => {
  for (const [key, copy] of Object.entries(SPORT_DESK_COPY)) {
    assert.doesNotMatch(copy.about, /a day|daily|every (Monday|week)|weekly/i, key);
  }
});

test("laneIndexTitle drops Verified Daily from a quiet Transfer Desk only", () => {
  assert.equal(laneIndexTitle("transfer", [{ date: "2026-11-14" }], "2026-11-15"), LANE_META.transfer.indexTitle);
  assert.equal(laneIndexTitle("transfer", [{ date: "2026-10-07" }], "2026-11-15"), "Manchester United Transfer News · The ARCHV");
  assert.equal(laneIndexTitle("leagues", [{ date: "2026-01-01" }], "2026-11-15"), LANE_META.leagues.indexTitle);
});
