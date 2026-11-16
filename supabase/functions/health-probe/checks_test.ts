// Unit tests for health-probe's scores, season, quota, football lead and sign-up checks
// (checks.ts) and the per-sport push check (push_check.ts). Run: `deno test` from this dir.
import {
  footballLeadStale,
  founderMailFailing,
  JB_NEWS_STALE_MS,
  jbNewsStale,
  MIRROR_MIN_FILES,
  mirrorProblem,
  mirrorSample,
  nextSkipRun,
  PAGES_SKIP_ALERT_AFTER,
  pagesDeployBlind,
  quotaLow,
  salonStoreProblem,
  scoresPollStale,
  scoresWriteFailing,
  seasonStale,
  ticketsStuck,
  waitlistDown,
} from "./checks.ts";
import { pushCheckDue, sportPushOverdue } from "./push_check.ts";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}
function assertEquals(actual: unknown, expected: unknown, msg = ""): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`expected ${e} got ${a}${msg ? ` — ${msg}` : ""}`);
}

const NOW = new Date("2026-11-15T18:00:00Z");
const H = 3_600_000;
const ago = (h: number) => new Date(NOW.getTime() - h * H).toISOString();

Deno.test("scores poll: a schedule fetched within two hours is healthy", () => {
  assertEquals(scoresPollStale({ schedule_fetched_at: ago(0.5) }, NOW), null);
  assertEquals(scoresPollStale({ schedule_fetched_at: ago(2) }, NOW), null, "exactly two hours");
});

Deno.test("scores poll: a schedule stuck for over two hours alerts, with any backoff", () => {
  const d = scoresPollStale({ schedule_fetched_at: ago(3), backoff_until: ago(-0.05) }, NOW);
  assert(d?.includes("over 2h ago"), `got ${d}`);
  assert(d?.includes("backoff_until"), "names the backoff");
});

Deno.test("scores poll: a missing row or no fetch at all alerts", () => {
  assertEquals(scoresPollStale(null, NOW), "scores_poll_state row missing");
  assert(scoresPollStale({ schedule_fetched_at: null }, NOW)?.startsWith("no schedule fetch"), "never fetched");
});

Deno.test("scores write: uploads failing for over 15 minutes alert, even with a fresh schedule", () => {
  const d = scoresWriteFailing({ schedule_fetched_at: ago(0.1), write_failed_since: ago(0.5) }, NOW);
  assert(d?.includes("over 15 minutes"), `got ${d}`);
  assertEquals(scoresPollStale({ schedule_fetched_at: ago(0.1), write_failed_since: ago(0.5) }, NOW), null, "the schedule check alone stays green");
});

Deno.test("scores write: no failure, a short one, or a row without the column is quiet", () => {
  assertEquals(scoresWriteFailing({ write_failed_since: null }, NOW), null);
  assertEquals(scoresWriteFailing({ write_failed_since: ago(0.2) }, NOW), null, "12 minutes");
  assertEquals(scoresWriteFailing({ schedule_fetched_at: ago(0.1) }, NOW), null, "before the migration");
  assertEquals(scoresWriteFailing(null, NOW), null);
});

Deno.test("season: the newest listing decides, and seven hours is the limit", () => {
  assertEquals(seasonStale({ listed_at: { epl: ago(20), ucl: ago(5), wsl: ago(11) } }, NOW), null);
  assert(seasonStale({ listed_at: { epl: ago(8), ucl: ago(9) } }, NOW)?.includes("8h old"), "stale");
  assertEquals(seasonStale({ listed_at: {} }, NOW), "no season listing recorded");
  assertEquals(seasonStale(null, NOW), "scores_season_state row missing");
});

Deno.test("quota: only today's reading below the reserve alerts", () => {
  assert(quotaLow({ remaining: 900, remaining_at: ago(1) }, NOW)?.includes("900"), "low today");
  assertEquals(quotaLow({ remaining: 1500, remaining_at: ago(1) }, NOW), null, "at the reserve");
  assertEquals(quotaLow({ remaining: 10, remaining_at: "2026-11-14T23:50:00Z" }, NOW), null, "yesterday's reading");
  assertEquals(quotaLow({ remaining: null, remaining_at: null }, NOW), null, "never read");
});

Deno.test("football lead: fresh inside the window, stale past it, missing alerts", () => {
  const STALE = 72 * H;
  const doc = (date: unknown) => ({ lastUpdated: "2026-11-15", lead: { date, section: "leagues" } });
  assertEquals(footballLeadStale(doc("2026-11-12"), NOW, STALE), null, "day ended 2026-11-13, 66h ago");
  assert(footballLeadStale(doc("2026-11-11"), NOW, STALE)?.includes("2026-11-11"), "a fresh envelope does not hide it");
  assertEquals(footballLeadStale({ lead: null }, NOW, STALE), "today.json carries no football lead");
  assert(footballLeadStale(doc("soon"), NOW, STALE)?.startsWith("football lead date unreadable"), "bad date");
});

Deno.test("salon-store: only a 200 gallery-store/1 document with storeOpen passes", () => {
  assertEquals(salonStoreProblem(200, { schema: "gallery-store/1", storeOpen: false, message: null }), null);
  assertEquals(salonStoreProblem(500, null), "status 500");
  assert(salonStoreProblem(200, { schema: "other" })?.startsWith("unexpected schema"), "schema");
  assertEquals(salonStoreProblem(200, { schema: "gallery-store/1" }), "storeOpen missing");
});

Deno.test("android-waitlist: a missing function or a server error is down, a key refusal is not", () => {
  assertEquals(waitlistDown(200), null);
  assertEquals(waitlistDown(401), null);
  assertEquals(waitlistDown(404), "preflight answered 404");
  assertEquals(waitlistDown(503), "preflight answered 503");
});

const nflLead = (date: string) => ({ date, section: "nfl", headline: "x", url: `https://thearchv.ca/nfl/questions/${date}/` });
const nflKey = (date: string) => `${date}|nfl|https://thearchv.ca/nfl/questions/${date}/`;

Deno.test("other sports: a sport with no row and no lead raises nothing", () => {
  assertEquals(sportPushOverdue(null, null, NOW, 76 * H), null);
});

Deno.test("other sports: a waiting lead that was never pushed alerts", () => {
  const d = sportPushOverdue(null, nflLead("2026-11-15"), NOW, 76 * H);
  assert(d?.startsWith("stale: never pushed"), `got ${d}`);
});

Deno.test("other sports: a recent push, or an old push with nothing new, stays quiet", () => {
  const recent = { lastLeadKey: nflKey("2026-11-10"), lastSentAt: ago(10) };
  assertEquals(sportPushOverdue(recent, nflLead("2026-11-15"), NOW, 76 * H), null);
  const old = { lastLeadKey: nflKey("2026-11-01"), lastSentAt: ago(300) };
  assertEquals(sportPushOverdue(old, nflLead("2026-11-01"), NOW, 76 * H), null);
});

Deno.test("other sports: an old push with a new lead waiting alerts", () => {
  const old = { lastLeadKey: nflKey("2026-11-01"), lastSentAt: ago(300) };
  assert(sportPushOverdue(old, nflLead("2026-11-15"), NOW, 76 * H)?.includes(nflKey("2026-11-15")), "names the lead");
});

Deno.test("push checks run from 08:00 to 20:59 Edmonton, not while daily-push holds a late lead", () => {
  // 2026-11-15 is MST, UTC-7.
  assertEquals(pushCheckDue(new Date("2026-11-15T14:59:00Z")), false, "07:59");
  assertEquals(pushCheckDue(new Date("2026-11-15T15:00:00Z")), true, "08:00");
  assertEquals(pushCheckDue(new Date("2026-11-16T03:59:00Z")), true, "20:59");
  assertEquals(pushCheckDue(new Date("2026-11-16T04:00:00Z")), false, "21:00");
  assertEquals(pushCheckDue(new Date("2026-11-15T12:00:00Z")), false, "05:00, a lead from last night is still waiting for 07:00");
});

Deno.test("tickets: any stuck ticket alerts by count only, none or an unknown count does not", () => {
  assertEquals(ticketsStuck(0), null);
  assertEquals(ticketsStuck(null), null);
  assertEquals(ticketsStuck(1), "1 ticket waiting at new, pending_triage or l1_working, untouched for over 2h");
  assertEquals(ticketsStuck(4), "4 tickets waiting at new, pending_triage or l1_working, untouched for over 2h");
});

const feedWith = (...dates: string[]) =>
  `<rss><channel><lastBuildDate>Fri, 13 Nov 2026 14:09:45 GMT</lastBuildDate>` +
  dates.map((d, i) => `<item><title>t${i}</title><pubDate>${d}</pubDate></item>`).join("") +
  `</channel></rss>`;

Deno.test("jb-news: the newest item counts, a Friday-to-Tuesday gap is fine, a missed edition alerts", () => {
  const xml = feedWith("Fri, 06 Nov 2026 14:30:00 GMT", "Fri, 13 Nov 2026 14:09:45 GMT", "Tue, 03 Nov 2026 14:30:00 GMT");
  assertEquals(jbNewsStale(xml, new Date("2026-11-17T13:00:00Z")), null, "Tuesday morning, before the edition");
  const late = new Date(Date.parse("2026-11-13T14:09:45Z") + JB_NEWS_STALE_MS + 60_000);
  assert(jbNewsStale(xml, late)?.startsWith("newest news item published 2026-11-13T14:09:45.000Z"), "stale after 120h");
});

Deno.test("jb-news: a feed with no dated item alerts, and lastBuildDate alone does not count", () => {
  assertEquals(jbNewsStale(feedWith(), new Date("2026-11-14T00:00:00Z")), "news-feed.xml has no dated item");
  assertEquals(jbNewsStale("not xml", new Date()), "news-feed.xml has no dated item");
});

Deno.test("salon-mirror: a full bucket serving its sample is healthy", () => {
  assertEquals(mirrorProblem(MIRROR_MIN_FILES, []), null);
});

Deno.test("salon-mirror: an emptied bucket or a file not served alerts", () => {
  assertEquals(mirrorProblem(0, []), `0 files in salon-art, expected at least ${MIRROR_MIN_FILES}`);
  assertEquals(mirrorProblem(MIRROR_MIN_FILES, ["met-1-1792.jpg 404"]), "not served: met-1-1792.jpg 404");
});

Deno.test("salon-mirror: the sample is distinct names, never more than there are", () => {
  const names = ["a.jpg", "b.jpg", "c.jpg", "d.jpg"];
  const picked = mirrorSample(names, 3, () => 0.5);
  assertEquals(new Set(picked).size, 3);
  assert(picked.every((n) => names.includes(n)), "picked from the list");
  assertEquals(mirrorSample(["a.jpg"], 3).length, 1);
  assertEquals(mirrorSample([], 3), []);
});

Deno.test("founderMailFailing: quiet at zero or unknown, a count otherwise", () => {
  assertEquals(founderMailFailing(0), null);
  assertEquals(founderMailFailing(null), null);
  assertEquals(founderMailFailing(1), "1 founder email about support tickets failed to send in the last 24h");
  assertEquals(founderMailFailing(3), "3 founder emails about support tickets failed to send in the last 24h");
});

Deno.test("pages-deploy: skips in a row are counted, an answer clears them, and the sixth alerts", () => {
  let run = nextSkipRun(null, true, NOW);
  assertEquals(run, { skips: 1, since: NOW.toISOString() });
  for (let i = 0; i < PAGES_SKIP_ALERT_AFTER - 2; i++) run = nextSkipRun(run, true, new Date(NOW.getTime() + (i + 1) * H / 2));
  assertEquals(run!.skips, PAGES_SKIP_ALERT_AFTER - 1);
  assertEquals(run!.since, NOW.toISOString(), "the run keeps its start");
  assertEquals(pagesDeployBlind(run, "GitHub API status 403"), null);
  run = nextSkipRun(run, true, new Date(NOW.getTime() + 3 * H));
  const detail = pagesDeployBlind(run, "GitHub API status 403");
  assert(detail !== null && detail.includes("6 probes in a row") && detail.includes("status 403"), `alerts: ${detail}`);
  assertEquals(nextSkipRun(run, false, new Date(NOW.getTime() + 4 * H)), null, "one usable reply ends the run");
  assertEquals(pagesDeployBlind(null, ""), null);
});
