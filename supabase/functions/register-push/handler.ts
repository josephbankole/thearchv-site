// register-push handler: the app registers or updates its APNs token and opt-in state here.
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
import { corsHeaders, type Env, json } from "../_shared/http.ts";
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

export type PushRow = Record<string, unknown>;

// The three writes this endpoint makes, behind a narrow interface so the handler can be tested
// without a database. index.ts backs it with the service-role client. An error is the database's
// own message, which the handler logs and maps; it never reaches the caller.
export type PushTokenStore = {
  exists(token: string): Promise<{ exists: boolean; error?: string }>;
  update(token: string, row: PushRow): Promise<{ error?: string }>;
  upsert(row: PushRow): Promise<{ error?: string }>;
};

export async function handleRegisterPush(
  req: Request,
  deps: { env: Env; store: PushTokenStore; now?: () => Date },
): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  // Soft app-secret guard (founder-approved 2026-09-26). Builds up to 1.5.5 never sent
  // x-archv-app on this path, so the hard guard refused every registration from 2026-07-22.
  // See checkAppSecretSoft in _shared/appGuard.ts; the DB caps remain the real backstop.
  const guardResp = checkAppSecretSoft(req, "register-push", deps.env);
  if (guardResp) return guardResp;

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  if (!payload || typeof payload !== "object") return json({ error: "invalid json" }, 400);

  const device_id = typeof payload.device_id === "string" ? payload.device_id.trim() : "";
  const token = typeof payload.token === "string" ? payload.token.trim() : "";
  if (!device_id) return json({ error: "device_id required" }, 400);
  if (!token) return json({ error: "token required" }, 400);
  // Refuse a malformed token at the boundary rather than storing it and discovering it is dead a
  // day later, on the one send this endpoint's hourly cap is there to protect.
  if (!APNS_TOKEN_RE.test(token)) return json({ error: "token invalid" }, 400);

  const opt_in = typeof payload.opt_in === "boolean" ? payload.opt_in : true;
  const app_version = typeof payload.app_version === "string" ? payload.app_version.slice(0, 40) : null;

  const row: PushRow = { device_id, token, opt_in, app_version, last_seen: (deps.now?.() ?? new Date()).toISOString() };
  if (payload.sport !== undefined) {
    row.sport = resolveSport(payload.sport);
    // A well-formed key this server does not publish yet (an app build ahead of the server) is
    // stored as football and logged, so it shows up. Only a shape-checked value is echoed.
    const unknown = unknownSportKey(payload.sport);
    if (unknown) console.log(JSON.stringify({ fn: "register-push", unknownSport: unknown }));
  }

  // A token we already hold takes the UPDATE path, never the upsert. The rate cap is a BEFORE
  // INSERT trigger and Postgres fires it on the ON CONFLICT path too, so routing an existing
  // token's state change (an opt-out, an opt-back-in, the cold-start refresh) through the upsert
  // meant a saturated hourly cap could refuse a user's opt-out and keep sending them notifications
  // they had switched off. An UPDATE creates no row, so it is outside what the cap counts and
  // cannot be blocked by it, and updated_at still moves (push_tokens_set_updated_at). The trigger
  // also skips a token that already has a row (20261115120100), so the race below is covered too.
  // First registrations still go through the upsert and are still capped.
  const lookup = await deps.store.exists(token);
  if (lookup.error) {
    console.error("register-push: token lookup failed", lookup.error);
    return json({ error: "server_error" }, 500);
  }

  // The upsert keeps onConflict so a row that lands between the lookup and the write still
  // resolves to an update rather than a duplicate-key error.
  const { error } = lookup.exists ? await deps.store.update(token, row) : await deps.store.upsert(row);
  if (error) {
    // The DB-side rate caps (push_tokens_rate_cap trigger) abort the insert with this marker.
    // Surface it as a clean 429 rather than a 500 so the app can back off quietly.
    if (/push_token_rate_limited/.test(error)) {
      return json({ error: "rate limited, please try again later" }, 429);
    }
    console.error("register-push: db error", error);
    return json({ error: "server_error" }, 500);
  }

  return json({ ok: true }, 200);
}
