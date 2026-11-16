// daily-push's run, from the inputs index.ts reads up front to the reply it sends: every sport's
// guard, readiness gate, record, claim and fan-out, then the dead-token deletion cap. Everything it
// touches comes in through Run (the database as PushDb, fetch for the feeds, assets and APNs, and
// the clock), so run_test.ts can drive it against fakes. index.ts builds the real Run from the
// service-role client.
import { SPORT_KEYS, type SportKey } from "../_shared/sports.ts";
import { batchByEncodedLength, describeError, NETWORK_REASON, runPool, sendAndClassify } from "./fanout.ts";
import { runOutcomeRow } from "../_shared/push_run.ts";
import {
  apnsHeaders,
  decideSend,
  feedHash,
  feedName,
  inSendWindow,
  type Lead,
  leadFromFeed,
  routeFor,
  SITE,
  type SportState,
} from "./leads.ts";

const CONCURRENCY = 50;
// Tokens per claim_push_tokens call, kept under PostgREST's max-rows (Supabase default 1000). See
// the claim in pushSport.
export const CLAIM_CHUNK = 500;
// The most dead tokens one run deletes (see runSports).
export const MAX_TOKEN_DELETIONS_PER_RUN = 25;

// The database calls a run makes. Each returns the error text, or null when it worked, and never
// throws.
export type PushDb = {
  // Records one sport's lead as sent (football on push_state, every other sport on its
  // push_sport_state row).
  recordSent(sport: SportKey, leadKey: string, sentAt: string): Promise<string | null>;
  // Writes one sport's run outcome onto the row recordSent wrote.
  recordOutcome(sport: SportKey, row: Record<string, unknown>): Promise<string | null>;
  // claim_push_tokens: marks the tokens with no push yet this editorial day as pushed and returns
  // them. error is null when the call worked.
  claim(tokens: string[], day: string): Promise<{ rows: { token?: unknown }[] | null; error: string | null }>;
  // Deletes these tokens from push_tokens.
  deleteTokens(tokens: string[]): Promise<string | null>;
};

// What one run shares across its sports: the inputs read once up front, and the tallies every
// sport's fan-out adds to. The deletion cap is applied once, over the whole run.
export type Run = {
  db: PushDb;
  fetch: typeof fetch;
  clock: () => Date;
  today: string;
  now: Date;
  manifest: Record<string, string>;
  groups: Map<SportKey, string[]>;
  states: Map<SportKey, SportState>;
  apns: { host: string; bundleId: string; jwt: () => Promise<string> };
  sent: number;
  failed: number;
  dead: string[];
  failureReasons: Record<string, number>;
  writeFailed: boolean; // a state write or token claim failed: the run answers 500
};

// Every opted-in token, a page at a time. One unpaged select is cut off at PostgREST's max-rows
// (Supabase default 1000) with no error, so the readers past it would never be grouped, claimed or
// sent to, and the deletion cap's share would be worked out on the cut-off count. Keyset paging on
// token, and it stops only on an empty page, so a project max-rows below the page size still reads
// everything. A page whose tokens do not move forward is an error rather than a loop.
export const TOKEN_PAGE = 1000;
const MAX_TOKEN_PAGES = 500;

export type TokenRow = { token?: unknown; sport?: unknown };
export type TokenPage = (after: string | null, limit: number) => Promise<{ rows: TokenRow[] | null; error: string | null }>;

export async function readOptedInTokens(page: TokenPage): Promise<{ rows: TokenRow[]; error: string | null }> {
  const all: TokenRow[] = [];
  let after: string | null = null;
  for (let n = 0; n < MAX_TOKEN_PAGES; n++) {
    const { rows, error } = await page(after, TOKEN_PAGE);
    if (error !== null) return { rows: all, error };
    if (!rows || rows.length === 0) return { rows: all, error: null };
    const last = rows[rows.length - 1].token;
    if (typeof last !== "string" || (after !== null && last <= after)) {
      return { rows: all, error: "token paging did not advance" };
    }
    all.push(...rows);
    after = last;
  }
  return { rows: all, error: `more than ${MAX_TOKEN_PAGES} pages of tokens` };
}

// Every sport in turn, then the deletion cap, then the reply. totalTokens is the number of
// opted-in rows read, which the deletion anomaly is measured against.
export async function runSports(
  run: Run,
  totalTokens: number,
): Promise<{ status: number; body: Record<string, unknown> }> {
  // 5. One sport at a time, football first. A sport that skips or fails never stops the next:
  //    each one's guard, readiness gate and state row are its own.
  const sports: Record<string, Record<string, unknown>> = {};
  for (const sport of SPORT_KEYS) {
    try {
      sports[sport] = await pushSport(run, sport);
    } catch (e) {
      // Not expected: pushSport handles its own failures. If it ever throws, this sport is
      // reported and the others still run.
      console.error(`daily-push: ${sport} threw: ${describeError(e)}`);
      sports[sport] = { ok: false, error: describeError(e) };
    }
  }

  // Deletion cap: a single run deletes AT MOST 25 dead tokens, and never fewer than all of them
  // when there are fewer than 25. The old rule deleted NOTHING once dead.length passed 25 or a
  // fifth of the fan-out set, which made the only delete against push_tokens in this repository an
  // off-switch: fill the table with junk tokens, every one of which comes back BadDeviceToken, and
  // cleanup is disabled for good while the table stays poisoned. A flat per-run ceiling removes
  // that property — there is no dead-token count that stops cleanup deleting, so a poisoned table
  // drains a run at a time — without letting one run take a large slice of the table. The blast
  // radius does not grow either: 25 is the most the old rule could ever delete in one run too. A
  // systemic APNs error (the classic being a production token list sent at the sandbox host, which
  // answers BadDeviceToken for every token) therefore still cannot wipe the table; it costs at most
  // 25 rows a run, and a run only fans out for a sport that has not pushed today, and it is surfaced
  // loudly in the response and the log the first time it happens. The cap counts the whole run,
  // every sport together, against every opted-in token.
  // Budget for one delete request's `in.(...)` filter, in encoded characters — deliberately well
  // under the ~8 KB request line proxies allow, leaving room for the base URL and the rest of the
  // query string. See batchByEncodedLength in fanout.ts for why this is measured in characters
  // rather than tokens.
  const MAX_DELETE_FILTER_CHARS = 1800;

  const { dead } = run;
  const toDelete = dead.slice(0, MAX_TOKEN_DELETIONS_PER_RUN);
  let removed = 0;
  let deletionAnomaly: Record<string, unknown> | undefined;
  // The anomaly is a SIGNAL now, never a gate: the delete below does not consult it. Both of the
  // old rule's thresholds are kept so nothing gets quieter than it was — the proportional one still
  // surfaces a small table losing an unusual share of itself, which a flat count alone would miss.
  if (dead.length > MAX_TOKEN_DELETIONS_PER_RUN || dead.length > totalTokens * 0.2) {
    deletionAnomaly = {
      tokenDeletionAnomaly: true,
      deadTokens: dead.length,
      deletedThisRun: toDelete.length,
      totalTokens,
    };
    console.error(
      `daily-push: dead-token anomaly — ${dead.length} dead of ${totalTokens} tokens, deleting ${toDelete.length} this run`,
    );
  }
  for (const batch of batchByEncodedLength(toDelete, MAX_DELETE_FILTER_CHARS)) {
    const error = await run.db.deleteTokens(batch);
    if (error) {
      // Stop at the first failure rather than retrying the same oversized request in a loop; the
      // next run picks the remaining dead tokens up again.
      console.error(`daily-push: dead-token delete failed, ${toDelete.length - removed} kept: ${error}`);
      break;
    }
    removed += batch.length;
  }

  const ok = Object.values(sports).every((r) => r.ok !== false);
  return {
    status: run.writeFailed ? 500 : 200,
    body: {
      ok,
      sent: run.sent,
      failed: run.failed,
      removed,
      totalTokens,
      failureReasons: run.failureReasons,
      sports,
      ...deletionAnomaly,
    },
  };
}

// One sport's push, start to finish. Returns this sport's line of the report and never decides
// anything for another sport.
export async function pushSport(run: Run, sport: SportKey): Promise<Record<string, unknown>> {
  // a. The sport's feed, as ONE document (C120). The guard key, the headline and the route all
  //    come from this body, so the lead recorded is always the lead sent. Before, the hash came
  //    from index.json and the story from today.json, two files on separate 10-minute CDN
  //    clocks: in the window where the edge served a new index and an old today.json, the old
  //    lead went out under the new hash, and the new lead was never pushed.
  //
  //    The body must also hash to the manifest's value for it. A mismatch means the edge is
  //    mid-update; skip without recording and the next tick retries. That check is what keeps
  //    the push fresh, because the edge cannot be cache-busted from here: GitHub Pages' Fastly
  //    leaves query strings out of its cache key and ignores request no-cache headers (a
  //    `?push=` URL and a `Cache-Control: no-cache` request both came back x-cache HIT with the
  //    same age, 2026-10-12). The `?v=` below is kept so a host that does key on the query
  //    gets a fresh copy per feed version; on this host it changes nothing.
  const name = feedName(sport);
  const expected = run.manifest[name];
  if (!expected) return { ok: false, skipped: "feed manifest carried no hash", feed: name };
  let text: string;
  try {
    const res = await run.fetch(`${SITE}/feed/${name}.json?v=${expected}`, { cache: "no-store" });
    if (!res.ok) return { ok: false, skipped: "feed unreachable", feed: name, status: res.status };
    text = await res.text();
  } catch (e) {
    return { ok: false, skipped: "feed unreachable", feed: name, error: describeError(e) };
  }
  if ((await feedHash(text)) !== expected) {
    console.log(`daily-push: ${sport} feed body and manifest disagree, retrying next tick`);
    return { ok: false, skipped: "feed-not-settled", feed: name };
  }
  let lead: Lead | null;
  try {
    lead = leadFromFeed(sport, JSON.parse(text));
  } catch {
    return { ok: false, skipped: "feed unparseable", feed: name };
  }

  // b. The guard: the lead's identity, never the file's (C115). See decideSend in leads.ts.
  const decision = decideSend(run.states.get(sport) ?? null, lead, run.today);
  if (!decision.send) return { ok: true, skipped: decision.skipped };
  // The send window (07:00 to 21:00 Edmonton, see inSendWindow in push_guard.ts). Outside it the
  // sport skips WITHOUT recording, so a lead that lands late in the evening goes at 07:00 rather
  // than at the first tick after midnight.
  if (!inSendWindow(run.now)) return { ok: true, skipped: "outside the send window" };
  const story = lead as Lead; // decideSend only says send for a lead with a key

  // c. Asset readiness guard: verify the lead's image and article url actually resolve
  //    BEFORE we're allowed to send. This is what would have caught the santos.webp incident
  //    — the desk committed an entry pointing at an asset before uploading it, and the daily
  //    push announced a 404 in the ~10 minute gap. On any non-200 we bail WITHOUT recording
  //    the lead as sent, so the next cron tick (hourly, see migration 20261115170000) retries once assets are live.
  //    Only this sport waits; the others carry on.
  if (story.image) {
    const imageUrl = `${SITE}${story.image}`;
    if (!(await urlIs200(run, imageUrl))) {
      console.error(`daily-push: ${sport} lead image not ready (HEAD non-200): ${imageUrl}`);
      return { ok: false, skipped: "asset-not-ready", asset: "image", url: imageUrl };
    }
  }
  if (story.url) {
    // story.url is already the absolute canonical article URL (archv-feed/2 contract).
    if (!(await urlIs200(run, story.url))) {
      console.error(`daily-push: ${sport} lead url not ready (HEAD non-200): ${story.url}`);
      return { ok: false, skipped: "asset-not-ready", asset: "url", url: story.url };
    }
  }

  // d. Record the send BEFORE the fan-out, deliberately. Tradeoff: if this function crashes or
  //    times out partway through the loop below, the sent-record already exists, so the next cron
  //    tick will NOT re-send — some devices may miss that day's push. The old order (record after)
  //    meant a mid-loop crash re-ran the whole loop on the next tick and double-pushed everyone
  //    who already got it. For a one-push-a-day promise, at-most-once beats at-least-twice. A
  //    single failed send is not such a crash: it is counted and the loop carries on.
  //
  //    The at-most-once promise rests on that row actually being written, so the fan-out runs
  //    ONLY if the write succeeded (code review 2026-09-25). An unrecorded send is refused here and
  //    reported as an error, and the next tick tries afresh. A write that landed but whose reply
  //    was lost reads the same way here, and the next tick then sees today's last_sent_at and
  //    skips: the day goes unpushed, which is the at-most-once side of the same trade.
  //
  //    A sport with no readers records too, so its first reader starts from the next new lead
  //    rather than being handed whatever has sat at the top of that feed for weeks. The provider
  //    token is signed before anything is recorded, so a broken .p8 costs a retry, not a day.
  const tokens = run.groups.get(sport) ?? [];
  let jwt = "";
  if (tokens.length > 0) {
    try {
      jwt = await run.apns.jwt();
    } catch (e) {
      console.error(`daily-push: APNs provider token could not be signed, not sending: ${describeError(e)}`);
      return { ok: false, error: "APNs key unusable" };
    }
  }
  const recordError = await run.db.recordSent(sport, decision.key, run.clock().toISOString());
  if (recordError) {
    run.writeFailed = true;
    console.error(`daily-push: ${sport} push state write failed, not sending: ${recordError}`);
    return { ok: false, error: `push state write failed: ${recordError.slice(0, 120)}` };
  }
  if (tokens.length === 0) return { ok: true, sent: 0, note: "no opted-in tokens" };

  // e. Claim this sport's tokens for today, one atomic UPDATE ... RETURNING in the database
  //    (claim_push_tokens). Only tokens with no push yet this editorial day come back, and they
  //    are marked as pushed in the same statement. That is what holds a reader to one push a day
  //    even across sports: one who had football this morning and switched to NFL at lunch is
  //    not claimed again when NFL's lead lands. Claimed before the send, for the same
  //    at-most-once reason as the record above.
  //
  //    In chunks of CLAIM_CHUNK. The rows the claim RETURNS are capped by PostgREST's max-rows
  //    (Supabase default 1000) like any other read, but the UPDATE inside it is not: one call
  //    over more tokens than the cap would mark every one as pushed and hand back only the first
  //    1000, and the rest would silently miss the day. The token read is paged
  //    (readOptedInTokens), so a sport can hold more tokens than one call returns, and the
  //    chunks keep every one of them claimed and sent to. A failed chunk stops the claiming. Tokens an earlier chunk claimed are already
  //    marked for today, so they are still sent to, and the run reports the failure.
  const claimed: string[] = [];
  let claimFailure = "";
  for (let i = 0; i < tokens.length; i += CLAIM_CHUNK) {
    const { rows: claimedRows, error: claimError } = await run.db.claim(tokens.slice(i, i + CLAIM_CHUNK), run.today);
    if (claimError !== null) {
      claimFailure = claimError || "unknown claim error";
      break;
    }
    for (const r of claimedRows ?? []) {
      if (typeof r.token === "string" && r.token.length > 0) claimed.push(r.token);
    }
  }
  if (claimFailure) {
    run.writeFailed = true;
    console.error(`daily-push: ${sport} token claim failed after ${claimed.length} claimed, sending only those: ${claimFailure}`);
    if (claimed.length === 0) return { ok: false, error: `token claim failed: ${claimFailure.slice(0, 120)}` };
  }
  if (claimed.length === 0) return { ok: true, sent: 0, note: "every reader already had a push today" };

  // f. Notification copy + deep-link route from the lead story. The app routes the tap straight
  //    to this entry; a payload with no route falls back to the Today tab.
  const body = story.headline ? String(story.headline) : "A new story has landed.";
  const payload = JSON.stringify({ aps: { alert: { title: "The ARCHV", body }, sound: "default" }, archv: routeFor(story) });
  const headers = apnsHeaders(jwt, run.apns.bundleId, sport, run.today, run.clock());
  const { sent, failed, dead, reasons } = await fanOut(run, sport, claimed, headers, payload);

  // g. What the fan-out delivered, on the same row as the lead (push_run.ts). The lead was recorded
  //    as sent before any send, so without this a run where APNs refused every token looked like a
  //    good one to health-probe. A failed write is logged and reported, never retried as a send.
  const outcomeError = await run.db.recordOutcome(
    sport,
    runOutcomeRow({ claimed: claimed.length, sent, failed, dead, reasons }, run.clock()),
  );
  if (outcomeError) console.error(`daily-push: ${sport} run outcome not recorded: ${outcomeError}`);
  const outcomeNote = outcomeError ? { outcomeRecorded: false } : {};
  return claimFailure
    ? { ok: false, sent, failed, ...outcomeNote, error: `token claim failed part way: ${claimFailure.slice(0, 120)}` }
    : { ok: true, sent, failed, ...outcomeNote };
}

// Fan-out in bounded concurrent batches, not one-at-a-time. The old sequential loop awaited
// each APNs POST in turn, so ~1,500-3,000 tokens could not clear inside the function's ~150s
// wall clock and the tail silently missed that day's push. A worker pool holds ~50 sends in
// flight at once (see runPool in fanout.ts — a real pool, not Promise.all over every token),
// which cuts wall time ~50x while capping open sockets to APNs. Every invariant below is
// unchanged from the sequential version: reason-gated deletion (only BadDeviceToken /
// Unregistered mark a token dead; a systemic BadTopic / TooManyRequests / auth error never
// deletes), failureReasons aggregation, and the deletion cap the handler applies after.
//
// One failed socket is one failed send and never the end of the run (code review 2026-09-25).
// The APNs fetch used to sit bare in the worker, so a single throw (connection reset, HTTP/2
// GOAWAY, DNS) rejected the whole pool and the handler died: with the day already recorded as
// sent above, everyone the stranded workers had not reached lost the push, and the tallies and
// the dead-token deletion went with it. The send now runs through sendAndClassify, which cannot
// reject: a throw is counted under failureReasons.network and the token is KEPT, since a
// network error says nothing about the token. runPool also drains every item before it will
// reject, and the catch around it below keeps the tallies and the deletion step alive, so a
// future worker that throws some other way still cannot strand the tail.
async function fanOut(
  run: Run,
  sport: SportKey,
  tokens: string[],
  headers: Record<string, string>,
  payload: string,
): Promise<{ sent: number; failed: number; dead: number; reasons: Record<string, number> }> {
  const fanoutStart = Date.now();
  let sent = 0;
  let failed = 0;
  let dead = 0;
  const reasons: Record<string, number> = {};
  let firstNetworkError = "";

  try {
    await runPool(
      tokens,
      CONCURRENCY,
      async (token) => {
        const c = await sendAndClassify(async () => {
          const res = await run.fetch(`https://${run.apns.host}/3/device/${token}`, {
            method: "POST",
            headers,
            body: payload,
          });
          // Only read the (JSON) body on failure, matching the old loop: a 200 carries no reason.
          let reason = "";
          if (res.status !== 200) {
            try { reason = String((await res.json())?.reason ?? ""); } catch { /* non-JSON body */ }
          }
          return { status: res.status, reason };
        });
        // Tally synchronously (no await between here and the classify): single-threaded, so two
        // workers never interleave a read-modify-write on these counters.
        if (c.ok) {
          sent++;
        } else {
          failed++;
          run.failureReasons[c.reasonKey] = (run.failureReasons[c.reasonKey] ?? 0) + 1;
          reasons[c.reasonKey] = (reasons[c.reasonKey] ?? 0) + 1;
          if (c.dead) {
            run.dead.push(token);
            dead++;
          }
          // One sample of a thrown send for the log, not one line per token: when APNs is
          // unreachable every send throws. describeError has already masked the token.
          if (c.reasonKey === NETWORK_REASON && !firstNetworkError) firstNetworkError = c.detail ?? "";
        }
        return c;
      },
      // One elapsed-time + sent-count line per batch of CONCURRENCY completions.
      (doneCount) => {
        if (doneCount % CONCURRENCY === 0) {
          console.log(`daily-push: ${sport} batch ${doneCount}/${tokens.length} — ${Date.now() - fanoutStart}ms, sent=${sent}, failed=${failed}`);
        }
      },
    );
  } catch (e) {
    // Not reachable while the worker is built on sendAndClassify. If a later edit lets a worker
    // throw, runPool has still attempted every token before rejecting, so count whatever went
    // untallied as failed under its own key and carry on to the deletion cap and the report.
    const untallied = tokens.length - sent - failed;
    failed += untallied;
    run.failureReasons.worker_error = (run.failureReasons.worker_error ?? 0) + untallied;
    reasons.worker_error = (reasons.worker_error ?? 0) + untallied;
    console.error(`daily-push: ${sport} fan-out worker threw, ${untallied} sends untallied: ${describeError(e)}`);
  }
  if (firstNetworkError) {
    console.error(`daily-push: ${sport} sends threw before APNs answered, first: ${firstNetworkError}`);
  }
  console.log(`daily-push: ${sport} fan-out done — ${tokens.length} tokens in ${Date.now() - fanoutStart}ms, sent=${sent}, failed=${failed}`);
  run.sent += sent;
  run.failed += failed;
  return { sent, failed, dead, reasons };
}

// Asset readiness check: a plain HEAD, treating any network failure as not-ready (fail
// closed — never send on an asset we couldn't confirm).
async function urlIs200(run: Run, url: string): Promise<boolean> {
  try {
    const res = await run.fetch(url, { method: "HEAD", cache: "no-store" });
    return res.status === 200;
  } catch {
    return false;
  }
}

