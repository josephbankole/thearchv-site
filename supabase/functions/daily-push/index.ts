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
//   APNS_ENV        "production" (default) for App Store and TestFlight builds; "sandbox" only for
//                   tokens from a debug build run from Xcode
//   PUSH_SECRET     optional guard, matched against the x-push-secret header from the cron call
//
// The run itself (every sport's guard, record, claim and fan-out, and the deletion cap) is in
// run.ts behind injected dependencies, and run_test.ts drives it against fakes. This file reads
// the inputs and wires the service-role client in.
import { safeEqual } from "../_shared/safe_equal.ts";
import { adminClient, json } from "../_shared/cors.ts";
import { DEFAULT_SPORT, type SportKey } from "../_shared/sports.ts";
import { describeError } from "./fanout.ts";
import { edmontonDay, feedHashesFrom, groupTokensBySport, SITE, statesFrom } from "./leads.ts";
import { type PushDb, readOptedInTokens, type Run, runSports } from "./run.ts";

const FEED_INDEX = `${SITE}/feed/index.json`;

type Supabase = ReturnType<typeof adminClient>;

Deno.serve(async (req) => {
  // Fail CLOSED (security sweep 2026-07-22): an unset PUSH_SECRET must refuse, not run open.
  const guard = Deno.env.get("PUSH_SECRET");
  if (!guard || !safeEqual(req.headers.get("x-push-secret"), guard)) {
    return json({ error: "unauthorized" }, 401);
  }

  // 1. Are APNs credentials present? If not, exit cleanly (nothing to do yet, nothing recorded).
  const p8 = Deno.env.get("APNS_KEY");
  const keyId = Deno.env.get("APNS_KEY_ID");
  const teamId = Deno.env.get("APNS_TEAM_ID");
  const bundleId = Deno.env.get("APNS_BUNDLE_ID") ?? "ca.thearchv.reader";
  // App Store and TestFlight builds both get production tokens, so production is the default and
  // sandbox has to be asked for. Sending production tokens to the sandbox host answers
  // BadDeviceToken for every one.
  const host = Deno.env.get("APNS_ENV") === "sandbox"
    ? "api.sandbox.push.apple.com"
    : "api.push.apple.com";
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
  //    Read a page at a time (readOptedInTokens in run.ts): one select stops at max-rows.
  const { rows: allRows, error: tokensError } = await readOptedInTokens(async (after, limit) => {
    let query = supabase.from("push_tokens").select("token, sport").eq("opt_in", true).order("token").limit(limit);
    if (after !== null) query = query.gt("token", after);
    const { data, error } = await query;
    return { rows: data ?? null, error: error ? error.message || "unknown read error" : null };
  });
  if (tokensError !== null) {
    console.error(`daily-push: push_tokens read failed, not sending: ${tokensError}`);
    return json({ ok: false, error: `push_tokens unreadable: ${tokensError.slice(0, 120)}` }, 200);
  }

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
  const startedAt = new Date();
  let jwt: Promise<string> | null = null;
  const run: Run = {
    db: pushDb(supabase),
    fetch,
    clock: () => new Date(),
    today: edmontonDay(startedAt),
    now: startedAt,
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

  const { status, body } = await runSports(run, allRows.length);
  return json(body, status);
});

// The real PushDb (run.ts), on the service-role client.
function pushDb(supabase: Supabase): PushDb {
  return {
    recordSent: (sport, leadKey, sentAt) => recordSent(supabase, sport, leadKey, sentAt),
    recordOutcome: (sport, row) => recordOutcome(supabase, sport, row),
    async claim(tokens, day) {
      try {
        const { data, error } = await supabase.rpc("claim_push_tokens", { p_tokens: tokens, p_day: day });
        if (error) return { rows: null, error: error.message || "unknown claim error" };
        return { rows: (data ?? []) as { token?: unknown }[], error: null };
      } catch (e) {
        return { rows: null, error: describeError(e) };
      }
    },
    async deleteTokens(tokens) {
      try {
        const { error } = await supabase.from("push_tokens").delete().in("token", tokens);
        return error ? error.message || "unknown delete error" : null;
      } catch (e) {
        return describeError(e);
      }
    },
  };
}

// Records one sport's lead as sent. Football writes the original push_state singleton, whose
// last_build_hash column now holds the football lead key (column name kept, as it was when it
// moved from the build hash to the today-feed hash on 2026-07-10); health-probe reads both
// columns. Every other sport writes its own push_sport_state row.
// Returns null when the row was written and the error text when it was not, and never throws:
// the caller refuses to fan out unless this came back null (code review 2026-09-25; it used to
// discard the upsert's error).
async function recordSent(supabase: Supabase, sport: SportKey, leadKey: string, sentAt: string): Promise<string | null> {
  try {
    const { error } = sport === DEFAULT_SPORT
      ? await supabase.from("push_state").upsert({ id: 1, last_build_hash: leadKey, last_sent_at: sentAt })
      : await supabase.from("push_sport_state").upsert({ sport, last_lead_key: leadKey, last_sent_at: sentAt });
    return error ? error.message || "unknown upsert error" : null;
  } catch (e) {
    return describeError(e);
  }
}

// Writes one sport's run outcome onto the row recordSent wrote, which exists by now. Returns null
// when written and the error text when not; never throws.
async function recordOutcome(supabase: Supabase, sport: SportKey, row: Record<string, unknown>): Promise<string | null> {
  try {
    const { error } = sport === DEFAULT_SPORT
      ? await supabase.from("push_state").update(row).eq("id", 1)
      : await supabase.from("push_sport_state").update(row).eq("sport", sport);
    return error ? error.message || "unknown update error" : null;
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
