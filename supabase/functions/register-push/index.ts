// register-push: the app registers or updates its APNs token and opt-in state here.
// POST { device_id, token, opt_in?, app_version?, sport? }
// -> { ok }
// `sport` (optional) is the sport the reader picked on Home, so daily-push can send them that
// sport's lead. Any value is accepted and resolved, never rejected: a known feed key is stored
// as itself; "all", the wrong shape or a key this server does not know yet is stored as
// football. A request without the field leaves the stored sport alone (null on a new row, which
// daily-push also reads as football), so every shipped build keeps getting the football push.
//
// A token we already hold is updated in place; a token we have never seen is upserted. Either way
// re-registering the same device is idempotent. A user turning the daily push off sends
// opt_in:false, which the daily dispatch job respects.
import { corsHeaders, json, adminClient } from "../_shared/cors.ts";
import { checkAppSecretSoft } from "../_shared/appGuard.ts";
import { resolveSport, unknownSportKey } from "../_shared/sports.ts";

// The shape of an APNs device token. The shipped iOS client produces exactly 64 lowercase hex
// characters from the 32-byte token Apple hands it
// (`deviceToken.map { String(format: "%02x", $0) }.joined()` in ARCHVApp.swift), and Apple has
// reserved the right to lengthen device tokens, so the rule is 64-200 lowercase hex rather than a
// hard 64. Anything outside that is junk APNs could only ever answer BadDeviceToken for, and every
// junk row it creates spends one of the 60 registration slots an hour that the entire install base
// shares. The same rule is mirrored as a CHECK constraint on push_tokens.token
// (migration 20261115120000_push_token_format_check.sql) so a future writer cannot skip it — change
// one and you must change the other.
const APNS_TOKEN_RE = /^[0-9a-f]{64,200}$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  // Soft app-secret guard (founder-approved 2026-09-26). Builds up to 1.5.5 never sent
  // x-archv-app on this path, so the hard guard refused every registration from 2026-07-22.
  // See checkAppSecretSoft in _shared/appGuard.ts; the DB caps below remain the real backstop.
  const guardResp = checkAppSecretSoft(req, "register-push");
  if (guardResp) return guardResp;

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const device_id = typeof payload.device_id === "string" ? payload.device_id.trim() : "";
  const token = typeof payload.token === "string" ? payload.token.trim() : "";
  if (!device_id) return json({ error: "device_id required" }, 400);
  if (!token) return json({ error: "token required" }, 400);
  // Refuse a malformed token at the boundary rather than storing it and discovering it is dead a
  // day later, on the one send this endpoint's hourly cap is there to protect.
  if (!APNS_TOKEN_RE.test(token)) return json({ error: "token invalid" }, 400);

  const opt_in = typeof payload.opt_in === "boolean" ? payload.opt_in : true;
  const app_version = typeof payload.app_version === "string" ? payload.app_version.slice(0, 40) : null;

  const row: Record<string, unknown> = { device_id, token, opt_in, app_version, last_seen: new Date().toISOString() };
  if (payload.sport !== undefined) {
    row.sport = resolveSport(payload.sport);
    // A well-formed key this server does not publish yet (an app build ahead of the server) is
    // stored as football and logged, so it shows up. Only a shape-checked value is echoed.
    const unknown = unknownSportKey(payload.sport);
    if (unknown) console.log(JSON.stringify({ fn: "register-push", unknownSport: unknown }));
  }

  const supabase = adminClient();

  // A token we already hold takes the UPDATE path, never the upsert. The rate cap is a BEFORE
  // INSERT trigger and Postgres fires it on the ON CONFLICT path too, so routing an existing
  // token's state change (an opt-out, an opt-back-in, the cold-start refresh) through the upsert
  // meant a saturated hourly cap could refuse a user's opt-out and keep sending them notifications
  // they had switched off. An UPDATE creates no row, so it is outside what the cap counts and
  // cannot be blocked by it, and updated_at still moves (push_tokens_set_updated_at). Every field
  // is written exactly as the upsert wrote it. First registrations still go through the upsert and
  // are still capped: the cap on new rows is not weakened here.
  const { data: existing, error: lookupError } = await supabase
    .from("push_tokens")
    .select("id")
    .eq("token", token)
    .maybeSingle();
  if (lookupError) {
    console.error("register-push: token lookup failed", lookupError.message);
    return json({ error: "server_error" }, 500);
  }

  // The upsert keeps onConflict so a row that lands between the lookup and the write still
  // resolves to an update rather than a duplicate-key error.
  const { error } = existing
    ? await supabase.from("push_tokens").update(row).eq("token", token)
    : await supabase.from("push_tokens").upsert(row, { onConflict: "token" });
  if (error) {
    // The DB-side rate caps (push_tokens_rate_cap trigger) abort the insert with this marker.
    // Surface it as a clean 429 rather than a 500 so the app can back off quietly.
    if (/push_token_rate_limited/.test(error.message)) {
      return json({ error: "rate limited, please try again later" }, 429);
    }
    console.error("register-push: db error", error.message);
    return json({ error: "server_error" }, 500);
  }

  return json({ ok: true }, 200);
});
