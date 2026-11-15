// Day lane dates (site-build-7): every entry date is a real YYYY-MM-DD day and unique in its lane,
// because the date is the page's folder name and URL.
import { test } from "node:test";
import assert from "node:assert/strict";
import { assertLaneDates, loadDayData } from "../shared/day-data.mjs";

test("well-formed, unique dates pass", () => {
  assert.doesNotThrow(() => assertLaneDates("transferDays", [{ date: "2026-11-15" }, { date: "2026-11-14" }]));
});

test("a duplicate date in one lane throws and names the lane and date", () => {
  assert.throws(
    () => assertLaneDates("transferDays", [{ date: "2026-11-15" }, { date: "2026-11-15" }]),
    /transferDays: two entries share the date 2026-11-15/,
  );
});

test("a date that is not a calendar day throws", () => {
  for (const date of ["2026-11-15/../../x", "../2026-11-15", "2026-02-30", "2026-1-5", "", undefined, 20261115]) {
    assert.throws(() => assertLaneDates("leaguesDays", [{ date }]), /leaguesDays: entry date/, String(date));
  }
});

test("the committed day data passes", async () => {
  await assert.doesNotReject(loadDayData());
});
