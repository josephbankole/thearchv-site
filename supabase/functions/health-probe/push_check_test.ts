// Unit tests for health-probe check (c) (push_check.ts). Run: `deno test` from this dir.
// Dependency-free, same tiny local assert as daily-push's tests. The point under test: an old
// last_sent_at alerts only while today.json carries a lead daily-push has not sent.
import { pushOverdue } from "./push_check.ts";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}
function assertEquals(actual: unknown, expected: unknown, msg = ""): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`expected ${e} got ${a}${msg ? ` — ${msg}` : ""}`);
}

const STALE = 76 * 60 * 60 * 1000;
const at = (s: string) => new Date(s);

const transfer = (date: string) => ({
  date,
  section: "transfer",
  headline: "A transfer lead",
  url: `https://thearchv.ca/desk/transfer/${date}/`,
});
const keyOf = (date: string) => `${date}|transfer|https://thearchv.ca/desk/transfer/${date}/`;
const today = (lead: unknown) => ({ schema: "archv-feed/3", lastUpdated: "2026-10-12", lead, wrap: [] });

Deno.test("a recent push is never a failure, whatever the feed carries", () => {
  const state = { last_build_hash: keyOf("2026-10-07"), last_sent_at: "2026-10-11T18:00:00Z" };
  assertEquals(pushOverdue(state, today(transfer("2026-10-12")), at("2026-10-12T15:00:00Z"), STALE), null);
});

Deno.test("deploy day: the legacy hash and the 10-07 lead the old code kept re-sending is not owed", () => {
  // The old function's last send, then four quiet days. Before this change the probe alerted here.
  const state = { last_build_hash: "e7bbb676f1c5", last_sent_at: "2026-10-09T15:00:00Z" };
  assertEquals(pushOverdue(state, today(transfer("2026-10-07")), at("2026-10-13T15:00:00Z"), STALE), null);
});

Deno.test("legacy hash with a newer lead that never went out alerts", () => {
  const state = { last_build_hash: "e7bbb676f1c5", last_sent_at: "2026-10-09T15:00:00Z" };
  const detail = pushOverdue(state, today(transfer("2026-10-13")), at("2026-10-13T15:00:00Z"), STALE);
  assert(detail?.startsWith("stale: last_sent_at 2026-10-09T15:00:00.000Z"), `got ${detail}`);
  assert(detail?.includes(keyOf("2026-10-13")), "names the lead that is waiting");
});

Deno.test("a quiet week with the same lead stays quiet (09-09 to 09-15)", () => {
  const state = { last_build_hash: keyOf("2026-09-09"), last_sent_at: "2026-09-09T16:00:00Z" };
  for (const now of ["2026-09-12T18:00:00Z", "2026-09-13T23:00:00Z", "2026-09-15T09:00:00Z"]) {
    assertEquals(pushOverdue(state, today(transfer("2026-09-09")), at(now), STALE), null, now);
  }
});

Deno.test("a new lead after a quiet week that has not gone out alerts", () => {
  const state = { last_build_hash: keyOf("2026-09-09"), last_sent_at: "2026-09-09T16:00:00Z" };
  const detail = pushOverdue(state, today(transfer("2026-09-15")), at("2026-09-15T18:00:00Z"), STALE);
  assert(detail?.includes("has not been pushed"), `got ${detail}`);
});

Deno.test("a lead older than the last one pushed is not owed", () => {
  const state = { last_build_hash: keyOf("2026-10-07"), last_sent_at: "2026-10-07T16:00:00Z" };
  assertEquals(pushOverdue(state, today(transfer("2026-10-02")), at("2026-10-12T15:00:00Z"), STALE), null);
});

Deno.test("no lead, or a lead with no date, is nothing to push", () => {
  const state = { last_build_hash: keyOf("2026-10-02"), last_sent_at: "2026-10-02T16:00:00Z" };
  const now = at("2026-10-12T15:00:00Z");
  assertEquals(pushOverdue(state, today(null), now, STALE), null, "empty pool");
  assertEquals(pushOverdue(state, today({ section: "transfer", headline: "x", url: "u" }), now, STALE), null, "dateless");
  assertEquals(pushOverdue(state, { schema: "archv-feed/3" }, now, STALE), null, "no lead field");
});

Deno.test("no push state at all still alerts, as before", () => {
  const doc = today(transfer("2026-10-12"));
  const now = at("2026-10-12T15:00:00Z");
  assertEquals(pushOverdue(null, doc, now, STALE), "no last_sent_at recorded");
  assertEquals(pushOverdue({ last_build_hash: "x", last_sent_at: null }, doc, now, STALE), "no last_sent_at recorded");
});

Deno.test("an unreadable last_sent_at alerts, because daily-push refuses to send on it", () => {
  const detail = pushOverdue({ last_sent_at: "not a date" }, today(transfer("2026-10-12")), at("2026-10-12T15:00:00Z"), STALE);
  assert(detail?.startsWith("last_sent_at unreadable"), `got ${detail}`);
});

Deno.test("the threshold is strict: exactly 76h is fine, a millisecond past with a lead waiting is not", () => {
  const state = { last_build_hash: keyOf("2026-10-02"), last_sent_at: "2026-10-09T12:00:00Z" };
  const doc = today(transfer("2026-10-12"));
  assertEquals(pushOverdue(state, doc, at("2026-10-12T16:00:00Z"), STALE), null);
  assert(pushOverdue(state, doc, at("2026-10-12T16:00:00.001Z"), STALE) !== null, "just past the threshold");
});

Deno.test("the last push day is the Edmonton day, the same as daily-push's guard", () => {
  // 05:30 UTC on 10-10 is 23:30 on 10-09 in Edmonton. A legacy row, so the lead dated 10-10 is
  // newer than the last push day and daily-push would send it. Read as a UTC day it would not be.
  const state = { last_build_hash: "e7bbb676f1c5", last_sent_at: "2026-10-10T05:30:00Z" };
  const detail = pushOverdue(state, today(transfer("2026-10-10")), at("2026-10-13T12:00:00Z"), STALE);
  assert(detail !== null, "owed on the Edmonton day");
});
