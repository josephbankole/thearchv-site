// daily-push: sends one notification when a new build of the feed lands. Run on a schedule (pg_cron).
// It checks the feed manifest, compares against push_state, and if there is new content it sends the
// lead headline to every opted-in device through APNs, then records what it sent.
//
// Secrets required (set once the Apple push key exists):
//   APNS_KEY        the .p8 contents (PEM, including BEGIN/END lines)
//   APNS_KEY_ID     the key id from the Apple Developer site
//   APNS_TEAM_ID    your Apple team id
//   APNS_BUNDLE_ID  defaults to ca.thearchv.reader
//   APNS_ENV        "sandbox" (default) for dev/TestFlight tokens, "production" for App Store
//   PUSH_SECRET     optional guard, matched against the x-push-secret header from the cron call
import { adminClient, json } from "../_shared/cors.ts";
import { classifyApnsResult, runPool } from "./fanout.ts";

const FEED_INDEX = "https://thearchv.ca/feed/index.json";
const FEED_TODAY = "https://thearchv.ca/feed/today.json";

// The "already sent today" check must use the ARCHV editorial day, not the UTC day: the
// desk operates out of America/Edmonton, and a UTC-based check would flip to a new "day"
// hours before (winter, UTC-7) or after (summer, UTC-6) the desk's own midnight, letting
// a second push slip through - or blocking a legitimate one - right at the boundary.
// Benign today given the current 11:00-23:59 UTC send window, but latent. en-CA formats
// as YYYY-MM-DD, matching the ISO slice this replaces.
const edmontonDay = (d: Date): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Edmonton" }).format(d);

Deno.serve(async (req) => {
  // Fail CLOSED (security sweep 2026-07-22): an unset PUSH_SECRET must refuse, not run open.
  const guard = Deno.env.get("PUSH_SECRET");
  if (!guard || req.headers.get("x-push-secret") !== guard) {
    return json({ error: "unauthorized" }, 401);
  }

  const supabase = adminClient();

  // 1. Has the LEAD STORY changed since we last pushed? We key on the today feed's own hash,
  //    not the combined buildHash: a poster tweak or a leagues entry must not consume the day's
  //    single push slot with a stale lead. push_state.last_build_hash now stores the today-feed
  //    hash (migrated 2026-07-10; column name kept for compatibility).
  let todayHash = "";
  try {
    const index = await (await fetch(FEED_INDEX, { cache: "no-store" })).json();
    const todayFeed = Array.isArray(index.feeds)
      ? index.feeds.find((f: { name?: string }) => f?.name === "today")
      : undefined;
    todayHash = String(todayFeed?.hash ?? "");
    // Fallback for an older manifest without per-feed hashes: fail toward NOT sending by
    // reusing the combined hash only if it is present (never send on an empty key).
    if (!todayHash) todayHash = String(index.buildHash ?? "");
  } catch (e) {
    return json({ ok: false, error: `feed unreachable: ${String(e).slice(0, 120)}` }, 200);
  }
  if (!todayHash) return json({ ok: false, error: "feed manifest carried no hash" }, 200);

  const { data: state } = await supabase
    .from("push_state").select("last_build_hash, last_sent_at").eq("id", 1).maybeSingle();

  if (state?.last_build_hash && state.last_build_hash === todayHash) {
    return json({ ok: true, skipped: "lead story unchanged" }, 200);
  }
  if (state?.last_sent_at) {
    const lastDay = edmontonDay(new Date(state.last_sent_at));
    const today = edmontonDay(new Date());
    if (lastDay === today) return json({ ok: true, skipped: "already sent today" }, 200);
  }

  // 2. Are APNs credentials present? If not, exit cleanly (nothing to do yet).
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

  // 3. Notification copy + deep-link route from the lead story. The app routes the tap
  //    straight to this entry; a payload with no route falls back to the Today tab.
  let title = "The ARCHV";
  let body = "A new story has landed.";
  let route: { section?: string; date?: string } = {};
  let lead: { headline?: string; section?: string; date?: string; image?: string; url?: string } = {};
  try {
    const today = await (await fetch(FEED_TODAY, { cache: "no-store" })).json();
    lead = (today?.lead ?? {}) as typeof lead;
    if (lead.headline) body = String(lead.headline);
    if (lead.section && lead.date) {
      route = { section: String(lead.section), date: String(lead.date) };
    }
  } catch { /* fall back to the generic line */ }

  // 3b. Asset readiness guard: verify the lead's image and article url actually resolve
  // BEFORE we're allowed to send. This is what would have caught the santos.webp incident
  // — the desk committed an entry pointing at an asset before uploading it, and the daily
  // push announced a 404 in the ~10 minute gap. On any non-200 we bail WITHOUT recording
  // the hash as sent, so the next cron tick (every 30 min) retries once assets are live.
  if (lead.image) {
    const imageUrl = `https://thearchv.ca${lead.image}`;
    if (!(await urlIs200(imageUrl))) {
      console.error(`daily-push: lead image not ready (HEAD non-200): ${imageUrl}`);
      return json({ ok: false, skipped: "asset-not-ready", asset: "image", url: imageUrl }, 200);
    }
  }
  if (lead.url) {
    // lead.url is already the absolute canonical article URL (archv-feed/2 contract).
    if (!(await urlIs200(lead.url))) {
      console.error(`daily-push: lead url not ready (HEAD non-200): ${lead.url}`);
      return json({ ok: false, skipped: "asset-not-ready", asset: "url", url: lead.url }, 200);
    }
  }

  // 4. Send to every opted-in token.
  const { data: rows } = await supabase.from("push_tokens").select("token").eq("opt_in", true);
  const tokens = (rows ?? []).map((r) => r.token as string);
  if (tokens.length === 0) {
    await recordSent(supabase, todayHash);
    return json({ ok: true, sent: 0, note: "no opted-in tokens" }, 200);
  }

  const jwt = await makeAPNsJWT(p8, keyId, teamId);
  const payload = JSON.stringify({ aps: { alert: { title, body }, sound: "default" }, archv: route });

  // Record the send BEFORE the fan-out, deliberately. Tradeoff: if this function crashes or times
  // out partway through the loop below, the sent-record already exists, so the next cron tick will
  // NOT re-send — some devices may miss that day's push. The old order (record after) meant a
  // mid-loop crash re-ran the whole loop on the next tick and double-pushed everyone who already
  // got it. For a one-push-a-day promise, at-most-once beats at-least-twice.
  await recordSent(supabase, todayHash);

  // Fan-out in bounded concurrent batches, not one-at-a-time. The old sequential loop awaited
  // each APNs POST in turn, so ~1,500-3,000 tokens could not clear inside the function's ~150s
  // wall clock and the tail silently missed that day's push. A worker pool holds ~50 sends in
  // flight at once (see runPool in fanout.ts — a real pool, not Promise.all over every token),
  // which cuts wall time ~50x while capping open sockets to APNs. Every invariant below is
  // unchanged from the sequential version: reason-gated deletion (only BadDeviceToken /
  // Unregistered mark a token dead; a systemic BadTopic / TooManyRequests / auth error never
  // deletes), failureReasons aggregation, and the deletion cap that follows.
  const CONCURRENCY = 50;
  const fanoutStart = Date.now();
  let sent = 0;
  let failed = 0;
  const dead: string[] = [];
  const failureReasons: Record<string, number> = {};

  await runPool(
    tokens,
    CONCURRENCY,
    async (token) => {
      const res = await fetch(`https://${host}/3/device/${token}`, {
        method: "POST",
        headers: {
          authorization: `bearer ${jwt}`,
          "apns-topic": bundleId,
          "apns-push-type": "alert",
          "apns-priority": "5",
          "content-type": "application/json",
        },
        body: payload,
      });
      // Only read the (JSON) body on failure, matching the old loop: a 200 carries no reason.
      let reason = "";
      if (res.status !== 200) {
        try { reason = String((await res.json())?.reason ?? ""); } catch { /* non-JSON body */ }
      }
      const c = classifyApnsResult(res.status, reason);
      // Tally synchronously (no await between here and the classify): single-threaded, so two
      // workers never interleave a read-modify-write on these counters.
      if (c.ok) {
        sent++;
      } else {
        failed++;
        failureReasons[c.reasonKey] = (failureReasons[c.reasonKey] ?? 0) + 1;
        if (c.dead) dead.push(token);
      }
      return c;
    },
    // One elapsed-time + sent-count line per batch of CONCURRENCY completions.
    (doneCount) => {
      if (doneCount % CONCURRENCY === 0) {
        console.log(`daily-push: batch ${doneCount}/${tokens.length} — ${Date.now() - fanoutStart}ms, sent=${sent}, failed=${failed}`);
      }
    },
  );
  console.log(`daily-push: fan-out done — ${tokens.length} tokens in ${Date.now() - fanoutStart}ms, sent=${sent}, failed=${failed}`);

  // Deletion cap: a single run may not delete more than 25 tokens or more than 20% of the table.
  // Past the cap it deletes NONE and surfaces the anomaly — a systemic APNs error must not wipe
  // the token table.
  let removed = 0;
  let deletionAnomaly: Record<string, unknown> | undefined;
  if (dead.length > 25 || dead.length > tokens.length * 0.2) {
    deletionAnomaly = { tokenDeletionAnomaly: true, wouldHaveDeleted: dead.length, totalTokens: tokens.length };
  } else if (dead.length) {
    await supabase.from("push_tokens").delete().in("token", dead);
    removed = dead.length;
  }

  return json({ ok: true, sent, failed, removed, failureReasons, ...deletionAnomaly }, 200);
});

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

// last_build_hash stores the TODAY feed's hash as of 2026-07-10 (column name kept).
async function recordSent(supabase: ReturnType<typeof adminClient>, todayHash: string) {
  await supabase.from("push_state").upsert({
    id: 1,
    last_build_hash: todayHash,
    last_sent_at: new Date().toISOString(),
  });
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
