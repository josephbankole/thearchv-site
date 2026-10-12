// daily-push: sends each opted-in reader at most one notification a day, carrying the lead of the
// sport they picked in the app, when that sport has a new lead. Run on a schedule (pg_cron).
// For every sport it reads that sport's feed, keys the guard on the lead's own identity, and if
// the lead is new and the sport has not pushed today, it records the lead as sent and then sends
// it through APNs to that sport's readers (record first, for at-most-once; see pushSport). Any
// push state read or write it cannot confirm means no send for that sport. A reader with no
// sport on file (every build shipped before the field), or on the All tab, gets football.
//
// Secrets required (set once the Apple push key exists):
//   APNS_KEY        the .p8 contents (PEM, including BEGIN/END lines)
//   APNS_KEY_ID     the key id from the Apple Developer site
//   APNS_TEAM_ID    your Apple team id
//   APNS_BUNDLE_ID  defaults to ca.thearchv.reader
//   APNS_ENV        "sandbox" (default) for dev/TestFlight tokens, "production" for App Store
//   PUSH_SECRET     optional guard, matched against the x-push-secret header from the cron call
import { adminClient, json } from "../_shared/cors.ts";
import { DEFAULT_SPORT, SPORT_KEYS, type SportKey } from "../_shared/sports.ts";
import { describeError, NETWORK_REASON, runPool, sendAndClassify } from "./fanout.ts";
import {
  apnsHeaders,
  decideSend,
  edmontonDay,
  feedHash,
  feedHashesFrom,
  feedName,
  groupTokensBySport,
  type Lead,
  leadFromFeed,
  routeFor,
  SITE,
  type SportState,
  statesFrom,
} from "./leads.ts";

const FEED_INDEX = `${SITE}/feed/index.json`;
const CONCURRENCY = 50;
// Tokens per claim_push_tokens call, kept under PostgREST's max-rows (Supabase default 1000). See
// the claim in pushSport.
const CLAIM_CHUNK = 500;

type Supabase = ReturnType<typeof adminClient>;

// What one run shares across its sports: the inputs read once up front, and the tallies every
// sport's fan-out adds to. The deletion cap is applied once, over the whole run.
type Run = {
  supabase: Supabase;
  today: string;
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

Deno.serve(async (req) => {
  // Fail CLOSED (security sweep 2026-07-22): an unset PUSH_SECRET must refuse, not run open.
  const guard = Deno.env.get("PUSH_SECRET");
  if (!guard || req.headers.get("x-push-secret") !== guard) {
    return json({ error: "unauthorized" }, 401);
  }

  // 1. Are APNs credentials present? If not, exit cleanly (nothing to do yet, nothing recorded).
  const p8 = Deno.env.get("APNS_KEY");
  const keyId = Deno.env.get("APNS_KEY_ID");
  const teamId = Deno.env.get("APNS_TEAM_ID");
  const bundleId = Deno.env.get("APNS_BUNDLE_ID") ?? "ca.thearchv.reader";
  const host = Deno.env.get("APNS_ENV") === "production"
    ? "api.push.apple.com"
    : "api.sandbox.push.apple.com";
  if (!p8 || !keyId || !teamId) {
    return json({ ok: false, reason: "APNs not configured yet" }, 200);
  }

  const supabase = adminClient();

  // 2. The feed manifest, for each feed's own hash. It no longer decides whether to send: the
  //    guard keys on the lead itself (C115). It is the check that the feed body we are about to
  //    push from is the one the manifest describes (C120, in pushSport).
  let manifest: Record<string, string>;
  try {
    const res = await fetch(FEED_INDEX, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    manifest = feedHashesFrom(await res.json());
  } catch (e) {
    return json({ ok: false, error: `feed unreachable: ${String(e).slice(0, 120)}` }, 200);
  }

  // 3. Every opted-in token, with the sport its reader picked. Read before any state is written:
  //    a failed token read must not look like an empty table, because a sport with no readers
  //    records its lead as sent and that would spend the day's slot on nobody. Soft failure
  //    instead, and the next cron tick retries. A database without the sport column (this
  //    function deployed before its migration) fails here too, before anything is recorded.
  const { data: rows, error: tokensError } = await supabase
    .from("push_tokens").select("token, sport").eq("opt_in", true);
  if (tokensError) {
    console.error(`daily-push: push_tokens read failed, not sending: ${tokensError.message}`);
    return json({ ok: false, error: `push_tokens unreadable: ${tokensError.message.slice(0, 120)}` }, 200);
  }
  const allRows = rows ?? [];

  // 4. Every sport's push state, read up front. The once-a-day guard fails CLOSED (code review
  //    2026-09-25): a read we cannot trust means no sport sends this tick, and the next retries.
  const { data: legacy, error: stateError } = await supabase
    .from("push_state").select("last_build_hash, last_sent_at").eq("id", 1).maybeSingle();
  if (stateError) {
    console.error(`daily-push: push_state read failed, not sending: ${stateError.message}`);
    return json({ ok: false, error: `push_state unreadable: ${stateError.message.slice(0, 120)}` }, 200);
  }
  const { data: sportRows, error: sportStateError } = await supabase
    .from("push_sport_state").select("sport, last_lead_key, last_sent_at");
  if (sportStateError) {
    console.error(`daily-push: push_sport_state read failed, not sending: ${sportStateError.message}`);
    return json({ ok: false, error: `push_sport_state unreadable: ${sportStateError.message.slice(0, 120)}` }, 200);
  }

  // The provider token is made once, and only if some sport actually sends.
  let jwt: Promise<string> | null = null;
  const run: Run = {
    supabase,
    today: edmontonDay(new Date()),
    manifest,
    groups: groupTokensBySport(allRows),
    states: statesFrom(legacy, sportRows ?? []),
    apns: { host, bundleId, jwt: () => (jwt ??= makeAPNsJWT(p8, keyId, teamId)) },
    sent: 0,
    failed: 0,
    dead: [],
    failureReasons: {},
    writeFailed: false,
  };

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

  // Deletion cap: a single run may not delete more than 25 tokens or more than 20% of the table.
  // Past the cap it deletes NONE and surfaces the anomaly — a systemic APNs error must not wipe
  // the token table. The cap counts the whole run, every sport together, against every
  // opted-in token.
  const { dead } = run;
  let removed = 0;
  let deletionAnomaly: Record<string, unknown> | undefined;
  if (dead.length > 25 || dead.length > allRows.length * 0.2) {
    deletionAnomaly = { tokenDeletionAnomaly: true, wouldHaveDeleted: dead.length, totalTokens: allRows.length };
  } else if (dead.length) {
    // `removed` reports what was actually deleted: a failed delete keeps it at 0 and says so,
    // and the dead tokens simply come back as dead on the next day's run.
    const { error: deleteError } = await supabase.from("push_tokens").delete().in("token", dead);
    if (deleteError) {
      console.error(`daily-push: dead-token delete failed, ${dead.length} kept: ${deleteError.message}`);
    } else {
      removed = dead.length;
    }
  }

  const ok = Object.values(sports).every((r) => r.ok !== false);
  return json(
    { ok, sent: run.sent, failed: run.failed, removed, failureReasons: run.failureReasons, sports, ...deletionAnomaly },
    run.writeFailed ? 500 : 200,
  );
});

// One sport's push, start to finish. Returns this sport's line of the report and never decides
// anything for another sport.
async function pushSport(run: Run, sport: SportKey): Promise<Record<string, unknown>> {
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
    const res = await fetch(`${SITE}/feed/${name}.json?v=${expected}`, { cache: "no-store" });
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
  const story = lead as Lead; // decideSend only says send for a lead with a key

  // c. Asset readiness guard: verify the lead's image and article url actually resolve
  //    BEFORE we're allowed to send. This is what would have caught the santos.webp incident
  //    — the desk committed an entry pointing at an asset before uploading it, and the daily
  //    push announced a 404 in the ~10 minute gap. On any non-200 we bail WITHOUT recording
  //    the lead as sent, so the next cron tick (every 30 min) retries once assets are live.
  //    Only this sport waits; the others carry on.
  if (story.image) {
    const imageUrl = `${SITE}${story.image}`;
    if (!(await urlIs200(imageUrl))) {
      console.error(`daily-push: ${sport} lead image not ready (HEAD non-200): ${imageUrl}`);
      return { ok: false, skipped: "asset-not-ready", asset: "image", url: imageUrl };
    }
  }
  if (story.url) {
    // story.url is already the absolute canonical article URL (archv-feed/2 contract).
    if (!(await urlIs200(story.url))) {
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
  const recordError = await recordSent(run.supabase, sport, decision.key);
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
  //    1000, and the rest would silently miss the day. The token read above is capped at the
  //    same limit, so nothing is lost today; the chunks keep it that way once that read is
  //    paginated. A failed chunk stops the claiming. Tokens an earlier chunk claimed are already
  //    marked for today, so they are still sent to, and the run reports the failure.
  const claimed: string[] = [];
  let claimFailure = "";
  for (let i = 0; i < tokens.length; i += CLAIM_CHUNK) {
    const { data: claimedRows, error: claimError } = await run.supabase
      .rpc("claim_push_tokens", { p_tokens: tokens.slice(i, i + CLAIM_CHUNK), p_day: run.today });
    if (claimError) {
      claimFailure = claimError.message || "unknown claim error";
      break;
    }
    for (const r of (claimedRows ?? []) as { token?: unknown }[]) {
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
  const headers = apnsHeaders(jwt, run.apns.bundleId, sport, run.today, new Date());
  const { sent, failed } = await fanOut(run, sport, claimed, headers, payload);
  return claimFailure
    ? { ok: false, sent, failed, error: `token claim failed part way: ${claimFailure.slice(0, 120)}` }
    : { ok: true, sent, failed };
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
): Promise<{ sent: number; failed: number }> {
  const fanoutStart = Date.now();
  let sent = 0;
  let failed = 0;
  let firstNetworkError = "";

  try {
    await runPool(
      tokens,
      CONCURRENCY,
      async (token) => {
        const c = await sendAndClassify(async () => {
          const res = await fetch(`https://${run.apns.host}/3/device/${token}`, {
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
          if (c.dead) run.dead.push(token);
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
    console.error(`daily-push: ${sport} fan-out worker threw, ${untallied} sends untallied: ${describeError(e)}`);
  }
  if (firstNetworkError) {
    console.error(`daily-push: ${sport} sends threw before APNs answered, first: ${firstNetworkError}`);
  }
  console.log(`daily-push: ${sport} fan-out done — ${tokens.length} tokens in ${Date.now() - fanoutStart}ms, sent=${sent}, failed=${failed}`);
  run.sent += sent;
  run.failed += failed;
  return { sent, failed };
}

// Asset readiness check: a plain HEAD, treating any network failure as not-ready (fail
// closed — never send on an asset we couldn't confirm).
async function urlIs200(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "HEAD", cache: "no-store" });
    return res.status === 200;
  } catch {
    return false;
  }
}

// Records one sport's lead as sent. Football writes the original push_state singleton, whose
// last_build_hash column now holds the football lead key (column name kept, as it was when it
// moved from the build hash to the today-feed hash on 2026-07-10); health-probe reads both
// columns. Every other sport writes its own push_sport_state row.
// Returns null when the row was written and the error text when it was not, and never throws:
// the caller refuses to fan out unless this came back null (code review 2026-09-25; it used to
// discard the upsert's error).
async function recordSent(supabase: Supabase, sport: SportKey, leadKey: string): Promise<string | null> {
  const sentAt = new Date().toISOString();
  try {
    const { error } = sport === DEFAULT_SPORT
      ? await supabase.from("push_state").upsert({ id: 1, last_build_hash: leadKey, last_sent_at: sentAt })
      : await supabase.from("push_sport_state").upsert({ sport, last_lead_key: leadKey, last_sent_at: sentAt });
    return error ? error.message || "unknown upsert error" : null;
  } catch (e) {
    return describeError(e);
  }
}

// APNs provider token: a short ES256 JWT signed with the .p8 key. Valid up to an hour, reused across
// all sends in this run.
async function makeAPNsJWT(p8: string, keyId: string, teamId: string): Promise<string> {
  const header = { alg: "ES256", kid: keyId };
  const claims = { iss: teamId, iat: Math.floor(Date.now() / 1000) };
  const signingInput = `${b64url(jsonBytes(header))}.${b64url(jsonBytes(claims))}`;
  const key = await importP8(p8);
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${b64url(new Uint8Array(signature))}`;
}

async function importP8(pem: string): Promise<CryptoKey> {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("pkcs8", der, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
}

function jsonBytes(obj: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(obj));
}

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
