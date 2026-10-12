// Unit tests for the daily-push lead helpers (leads.ts). Run: `deno test` from this dir.
// Dependency-free, same tiny local assert as fanout_test.ts. These cover the guard key (C115),
// the one-document feed reading (C120), the sport grouping (C37) and the APNs expiry and
// collapse headers (C126).
import {
  apnsHeaders,
  collapseId,
  decideSend,
  edmontonDay,
  endOfEdmontonDay,
  feedHash,
  feedHashesFrom,
  feedName,
  groupTokensBySport,
  type Lead,
  leadFromFeed,
  leadKey,
  leadKeyDate,
  routeFor,
  statesFrom,
} from "./leads.ts";
import { SPORT_KEYS } from "../_shared/sports.ts";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}
function assertEquals(actual: unknown, expected: unknown, msg = ""): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`expected ${e} got ${a}${msg ? ` — ${msg}` : ""}`);
}
const iso = (s: string) => Math.floor(Date.parse(s) / 1000);

const transferLead: Lead = {
  date: "2026-10-07",
  section: "transfer",
  headline: "Bruno Fernandes wants a raise. Rashford set the bar.",
  image: "/heads/hd/bruno-fernandes.webp",
  url: "https://thearchv.ca/desk/transfer/2026-10-07/",
};
const nflLead: Lead = {
  date: "2026-09-22",
  section: "nfl",
  headline: "What did Aaron Donald do in his first game back?",
  url: "https://thearchv.ca/nfl/questions/2026-09-22/",
};
const todayDoc = (lastUpdated: string, lead: Lead) => ({ schema: "archv-feed/3", lastUpdated, lead, wrap: [] });

// ---- which feed, which entry ----

Deno.test("football reads today.json, every other sport its own feed", () => {
  assertEquals(feedName("football"), "today");
  for (const s of SPORT_KEYS.filter((k) => k !== "football")) assertEquals(feedName(s), s);
});

Deno.test("football's lead is today.lead, a sport's lead is its newest entry", () => {
  assertEquals(leadFromFeed("football", todayDoc("2026-10-12", transferLead)), transferLead);
  const nflDoc = { schema: "archv-feed/3", lastUpdated: "2026-09-22", days: [nflLead, { ...nflLead, date: "2026-09-15" }] };
  assertEquals(leadFromFeed("nfl", nflDoc), nflLead);
});

Deno.test("an empty sport, a missing lead or the wrong shape is no lead", () => {
  assertEquals(leadFromFeed("basketball", { days: [] }), null);
  assertEquals(leadFromFeed("football", { lead: null }), null);
  assertEquals(leadFromFeed("football", { days: [transferLead] }), null, "football never reads days");
  assertEquals(leadFromFeed("nfl", { lead: nflLead }), null, "a sport never reads lead");
  assertEquals(leadFromFeed("nfl", null), null);
  assertEquals(leadFromFeed("nfl", "nope"), null);
  assertEquals(leadFromFeed("nfl", { days: ["string entry"] }), null);
});

Deno.test("feedHashesFrom maps each manifest feed name to its hash and skips junk", () => {
  const index = {
    feeds: [
      { name: "today", hash: "e7bbb676f1c5" },
      { name: "nfl", hash: "17e3c9c342bd" },
      { name: "posters" },
      { hash: "abc" },
      "junk",
    ],
  };
  assertEquals(feedHashesFrom(index), { today: "e7bbb676f1c5", nfl: "17e3c9c342bd" });
  assertEquals(feedHashesFrom({}), {});
  assertEquals(feedHashesFrom(null), {});
});

Deno.test("feedHash is build-feed.mjs's sha256 first-12-hex, over the exact body", async () => {
  // Expected values from Node's createHash("sha256").update(s).digest("hex").slice(0, 12), the
  // call build-feed.mjs makes. Kept as literals so this suite needs no node types.
  const body = JSON.stringify(todayDoc("2026-10-12", transferLead), null, 2);
  assertEquals(await feedHash(body), "00ec788aeb64");
  // Non-ASCII text hashes as its UTF-8 bytes, as Node's does.
  assertEquals(await feedHash("Kylian Mbapp\u00e9\u2019s first goal"), "2faf03e21c92");
});

// ---- C120: one document, so the key and the story cannot come from different files ----

Deno.test("a body one build behind the manifest hashes differently, so it is caught", async () => {
  // The edge serving an old today.json beside a new index.json: same shape, older content.
  const fresh = JSON.stringify(todayDoc("2026-10-12", { ...transferLead, date: "2026-10-12", url: "https://thearchv.ca/desk/transfer/2026-10-12/" }), null, 2);
  const stale = JSON.stringify(todayDoc("2026-10-07", transferLead), null, 2);
  assert((await feedHash(fresh)) !== (await feedHash(stale)), "stale body must not pass the manifest check");
});

// ---- C115: the guard keys on the lead, not the file ----

Deno.test("leadKey is date|section|url, with the headline only when there is no url", () => {
  assertEquals(leadKey(transferLead), "2026-10-07|transfer|https://thearchv.ca/desk/transfer/2026-10-07/");
  const { url: _url, ...noUrl } = transferLead;
  assertEquals(leadKey(noUrl), `2026-10-07|transfer|${transferLead.headline}`);
});

Deno.test("leadKey refuses a lead it cannot name", () => {
  assertEquals(leadKey(null), null);
  assertEquals(leadKey({ ...transferLead, date: undefined }), null);
  assertEquals(leadKey({ ...transferLead, date: "7 Oct" }), null);
  assertEquals(leadKey({ date: "2026-10-07", section: "transfer" }), null);
});

Deno.test("a headline correction keeps the key, so the same story is not pushed twice", () => {
  assertEquals(leadKey({ ...transferLead, headline: "Corrected headline" }), leadKey(transferLead));
});

Deno.test("leadKeyDate reads a key back, and says null for the old today-feed hash", () => {
  assertEquals(leadKeyDate(leadKey(transferLead)), "2026-10-07");
  assertEquals(leadKeyDate("e7bbb676f1c5"), null);
  assertEquals(leadKeyDate("2026-10-07"), null);
  assertEquals(leadKeyDate(null), null);
  assertEquals(leadKeyDate(undefined), null);
});

Deno.test("C115: another lane moving lastUpdated, same lead, does not send", () => {
  // Day N: the lead lands and is pushed. Day N+1: only leagues files, so today.json's
  // lastUpdated (and its hash) moves, but the lead is the same object. It must not go again.
  const dayN = leadFromFeed("football", todayDoc("2026-10-07", transferLead));
  const dayN1 = leadFromFeed("football", todayDoc("2026-10-08", transferLead));
  const state = { lastLeadKey: leadKey(dayN), lastSentAt: "2026-10-07T14:30:00Z" };
  assertEquals(decideSend(state, dayN1, "2026-10-08"), { send: false, skipped: "lead unchanged" });
});

Deno.test("a new lead on a new day sends, and carries its key", () => {
  const next = { ...transferLead, date: "2026-10-09", url: "https://thearchv.ca/desk/transfer/2026-10-09/" };
  const state = { lastLeadKey: leadKey(transferLead), lastSentAt: "2026-10-07T14:30:00Z" };
  assertEquals(decideSend(state, next, "2026-10-09"), { send: true, key: leadKey(next) });
});

Deno.test("a sport sends at most once per editorial day, even for a new lead", () => {
  const next = { ...transferLead, date: "2026-10-09", url: "https://thearchv.ca/desk/transfer/2026-10-09/" };
  // 2026-10-09T20:00Z is 14:00 in Edmonton on the 9th.
  const state = { lastLeadKey: leadKey(transferLead), lastSentAt: "2026-10-09T20:00:00Z" };
  assertEquals(decideSend(state, next, "2026-10-09"), { send: false, skipped: "already sent today" });
});

Deno.test("the day boundary is Edmonton's, not UTC's", () => {
  // 05:30 UTC on the 10th is still 23:30 on the 9th in Edmonton, so a push then was the 9th's.
  const next = { ...transferLead, date: "2026-10-10", url: "https://thearchv.ca/desk/transfer/2026-10-10/" };
  const state = { lastLeadKey: leadKey(transferLead), lastSentAt: "2026-10-10T05:30:00Z" };
  assertEquals(edmontonDay(new Date("2026-10-10T05:30:00Z")), "2026-10-09");
  assertEquals(decideSend(state, next, "2026-10-10").send, true);
  assertEquals(decideSend(state, next, "2026-10-09"), { send: false, skipped: "already sent today" });
});

Deno.test("a lead older than the last one pushed does not send (the newer entry was pulled)", () => {
  const pushed = { ...transferLead, date: "2026-10-09", url: "https://thearchv.ca/desk/transfer/2026-10-09/" };
  const state = { lastLeadKey: leadKey(pushed), lastSentAt: "2026-10-09T14:30:00Z" };
  assertEquals(decideSend(state, transferLead, "2026-10-10"), { send: false, skipped: "lead older than the last one pushed" });
});

Deno.test("a second story on the same date as the last one still sends the next day", () => {
  const worldcup = { ...transferLead, section: "worldcup", url: "https://thearchv.ca/desk/world-cup/2026-10-07/" };
  const state = { lastLeadKey: leadKey(transferLead), lastSentAt: "2026-10-07T14:30:00Z" };
  assertEquals(decideSend(state, worldcup, "2026-10-08").send, true);
});

Deno.test("no state at all sends; no dated lead never does", () => {
  assertEquals(decideSend(null, nflLead, "2026-10-12"), { send: true, key: leadKey(nflLead) });
  assertEquals(decideSend(null, null, "2026-10-12"), { send: false, skipped: "no dated lead" });
  assertEquals(decideSend(null, { headline: "x" }, "2026-10-12"), { send: false, skipped: "no dated lead" });
});

Deno.test("an unparseable last_sent_at is untrusted state and refuses", () => {
  const state = { lastLeadKey: null, lastSentAt: "not a time" };
  assertEquals(decideSend(state, nflLead, "2026-10-12"), { send: false, skipped: "push state unreadable" });
});

Deno.test("legacy football row (a hash, not a key): a lead dated on or before the last push waits", () => {
  // The first runs after deploy: push_state.last_build_hash still holds the old today-feed hash.
  const legacy = { lastLeadKey: "e7bbb676f1c5", lastSentAt: "2026-10-07T14:30:00Z" };
  assertEquals(decideSend(legacy, transferLead, "2026-10-12"), { send: false, skipped: "lead predates the last push" });
  const older = { ...transferLead, date: "2026-10-05", url: "https://thearchv.ca/desk/transfer/2026-10-05/" };
  assertEquals(decideSend(legacy, older, "2026-10-12").send, false);
});

Deno.test("legacy football row: a lead dated after the last push sends and replaces the hash", () => {
  const legacy = { lastLeadKey: "e7bbb676f1c5", lastSentAt: "2026-10-07T14:30:00Z" };
  const next = { ...transferLead, date: "2026-10-12", url: "https://thearchv.ca/desk/transfer/2026-10-12/" };
  assertEquals(decideSend(legacy, next, "2026-10-12"), { send: true, key: leadKey(next) });
});

// ---- state ----

Deno.test("statesFrom: football from push_state, the rest from push_sport_state", () => {
  const states = statesFrom(
    { last_build_hash: "e7bbb676f1c5", last_sent_at: "2026-10-07T14:30:00Z" },
    [
      { sport: "nfl", last_lead_key: leadKey(nflLead), last_sent_at: "2026-09-22T15:00:00Z" },
      { sport: "football", last_lead_key: "should be ignored", last_sent_at: "2026-10-12T15:00:00Z" },
      { sport: "cricket", last_lead_key: "x", last_sent_at: "2026-10-12T15:00:00Z" },
      { sport: 7 },
    ],
  );
  assertEquals(states.get("football"), { lastLeadKey: "e7bbb676f1c5", lastSentAt: "2026-10-07T14:30:00Z" });
  assertEquals(states.get("nfl"), { lastLeadKey: leadKey(nflLead), lastSentAt: "2026-09-22T15:00:00Z" });
  assertEquals([...states.keys()].sort(), ["football", "nfl"]);
});

Deno.test("statesFrom: no push_state row and no sport rows is no state", () => {
  assertEquals(statesFrom(null, []).size, 0);
  assertEquals(statesFrom({ last_build_hash: null, last_sent_at: null }, []).get("football"), { lastLeadKey: null, lastSentAt: null });
});

// ---- C37: grouping tokens by sport ----

Deno.test("every sport gets a group, empty or not", () => {
  const groups = groupTokensBySport([]);
  assertEquals([...groups.keys()], [...SPORT_KEYS]);
  for (const [, tokens] of groups) assertEquals(tokens, []);
});

Deno.test("null, absent, all and unknown sports group under football; known sports under themselves", () => {
  const groups = groupTokensBySport([
    { token: "t-null", sport: null },
    { token: "t-absent" },
    { token: "t-all", sport: "all" },
    { token: "t-cricket", sport: "cricket" },
    { token: "t-football", sport: "football" },
    { token: "t-nfl", sport: "nfl" },
    { token: "t-f1", sport: "f1" },
    { token: "t-tennis", sport: "tennis" },
  ]);
  assertEquals(groups.get("football"), ["t-null", "t-absent", "t-all", "t-cricket", "t-football"]);
  assertEquals(groups.get("nfl"), ["t-nfl"]);
  assertEquals(groups.get("f1"), ["t-f1"]);
  assertEquals(groups.get("tennis"), ["t-tennis"]);
  assertEquals(groups.get("golf"), []);
});

Deno.test("a token lands in exactly one group, and junk tokens in none", () => {
  const groups = groupTokensBySport([
    { token: "t1", sport: "nfl" },
    { token: "t1", sport: "golf" },
    { token: "", sport: "nfl" },
    { token: 42, sport: "nfl" },
    { sport: "nfl" },
  ]);
  const all = [...groups.values()].flat();
  assertEquals(all, ["t1"]);
  assertEquals(groups.get("nfl"), ["t1"], "first row wins");
});

Deno.test("every token shipped before the sport field still gets the football push", () => {
  const rows = Array.from({ length: 5 }, (_, i) => ({ token: `old-${i}`, sport: null }));
  const groups = groupTokensBySport(rows);
  assertEquals(groups.get("football")?.length, 5);
  assertEquals([...groups.values()].flat().length, 5);
});

// ---- C126: APNs expiry and collapse ----

Deno.test("endOfEdmontonDay is the next Edmonton midnight, summer and winter", () => {
  // 09:00 MDT (UTC-6) on 12 Oct -> 00:00 MDT on 13 Oct.
  assertEquals(endOfEdmontonDay(new Date("2026-10-12T15:00:00Z")), iso("2026-10-13T06:00:00Z"));
  // 23:30 MDT on 12 Oct, already the 13th in UTC -> 30 minutes away.
  assertEquals(endOfEdmontonDay(new Date("2026-10-13T05:30:00Z")), iso("2026-10-13T06:00:00Z"));
  // 13:00 MST (UTC-7) on 1 Dec -> 00:00 MST on 2 Dec.
  assertEquals(endOfEdmontonDay(new Date("2026-12-01T20:00:00Z")), iso("2026-12-02T07:00:00Z"));
  // Exactly midnight belongs to the new day, which ends 24 hours later.
  assertEquals(endOfEdmontonDay(new Date("2026-10-13T06:00:00Z")), iso("2026-10-14T06:00:00Z"));
});

Deno.test("endOfEdmontonDay across both clock changes", () => {
  // Clocks go back 02:00 MDT, 1 Nov 2026. The 31st ends on MDT, the 1st (25 hours) on MST.
  assertEquals(endOfEdmontonDay(new Date("2026-10-31T18:00:00Z")), iso("2026-11-01T06:00:00Z"));
  assertEquals(endOfEdmontonDay(new Date("2026-11-01T12:00:00Z")), iso("2026-11-02T07:00:00Z"));
  // Clocks go forward 02:00 MST, 14 Mar 2027. The 13th ends on MST, the 14th (23 hours) on MDT.
  assertEquals(endOfEdmontonDay(new Date("2027-03-13T18:00:00Z")), iso("2027-03-14T07:00:00Z"));
  assertEquals(endOfEdmontonDay(new Date("2027-03-14T18:00:00Z")), iso("2027-03-15T06:00:00Z"));
});

Deno.test("endOfEdmontonDay is always in the future and at most 25 hours out", () => {
  for (let h = 0; h < 72; h++) {
    const now = new Date(Date.parse("2026-10-30T00:00:00Z") + h * 3_600_000);
    const end = endOfEdmontonDay(now) * 1000;
    assert(end > now.getTime(), `end after now at ${now.toISOString()}`);
    assert(end - now.getTime() <= 25 * 3_600_000, `within 25h at ${now.toISOString()}`);
    assertEquals(edmontonDay(new Date(end - 1000)), edmontonDay(now), `same day just before end at ${now.toISOString()}`);
  }
});

Deno.test("one collapse id per sport per day, inside APNs's 64-byte limit", () => {
  assertEquals(collapseId("football", "2026-10-12"), "daily-football-2026-10-12");
  assert(collapseId("nfl", "2026-10-12") !== collapseId("football", "2026-10-12"), "sports differ");
  assert(collapseId("nfl", "2026-10-12") !== collapseId("nfl", "2026-10-13"), "days differ");
  for (const s of SPORT_KEYS) assert(new TextEncoder().encode(collapseId(s, "2026-10-12")).length <= 64, s);
});

Deno.test("apnsHeaders keeps the old headers and adds expiry and collapse", () => {
  const now = new Date("2026-10-12T15:00:00Z");
  const h = apnsHeaders("JWT", "ca.thearchv.reader", "tennis", "2026-10-12", now);
  assertEquals(h, {
    authorization: "bearer JWT",
    "apns-topic": "ca.thearchv.reader",
    "apns-push-type": "alert",
    "apns-priority": "5",
    "apns-expiration": String(iso("2026-10-13T06:00:00Z")),
    "apns-collapse-id": "daily-tennis-2026-10-12",
    "content-type": "application/json",
  });
});

// ---- the route the app's Router follows ----

Deno.test("the route is the entry's own section and date", () => {
  assertEquals(routeFor(transferLead), { section: "transfer", date: "2026-10-07" });
  assertEquals(routeFor(nflLead), { section: "nfl", date: "2026-09-22" });
  assertEquals(routeFor({ ...nflLead, section: undefined }), {});
  assertEquals(routeFor({ headline: "x" }), {});
});
