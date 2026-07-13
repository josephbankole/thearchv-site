// register-push: the app registers or updates its APNs token and opt-in state here.
// POST { device_id, token, opt_in?, app_version? }
// -> { ok }
// Upserts on the token, so re-registering the same device is idempotent. A user turning the daily
// push off sends opt_in:false, which the daily dispatch job respects.
import { corsHeaders, json, adminClient } from "../_shared/cors.ts";
import { checkAppSecret } from "../_shared/appGuard.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  // Soft app-secret guard (build 19+ sends x-archv-app). See _shared/appGuard.ts for the
  // soft-vs-hard rollout note; the DB-side hourly/per-device caps below remain the real
  // backstop either way.
  const guardResp = checkAppSecret(req, "register-push");
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

  const opt_in = typeof payload.opt_in === "boolean" ? payload.opt_in : true;
  const app_version = typeof payload.app_version === "string" ? payload.app_version.slice(0, 40) : null;

  const supabase = adminClient();

  const { error } = await supabase
    .from("push_tokens")
    .upsert(
      { device_id, token, opt_in, app_version, last_seen: new Date().toISOString() },
      { onConflict: "token" },
    );
  if (error) {
    // The DB-side rate caps (push_tokens_rate_cap trigger) abort the insert with this marker.
    // Surface it as a clean 429 rather than a 500 so the app can back off quietly.
    if (/push_token_rate_limited/.test(error.message)) {
      return json({ error: "rate limited, please try again later" }, 429);
    }
    return json({ error: error.message }, 500);
  }

  return json({ ok: true }, 200);
});
