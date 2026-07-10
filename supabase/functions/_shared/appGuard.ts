// Shared soft-launch guard for the app-facing ticket endpoints (ticket-intake, ticket-thread,
// ticket-reply). App build 19 sends the x-archv-app header; builds 1-18 on TestFlight (the
// founder + current testers) do not yet, and won't until build 19 propagates.
//
// SOFT MODE (deliberate, while both build generations are live in the wild):
//   - header present and WRONG -> 401 {"error":"unauthorized"} (closes the drive-by hole for
//     anyone probing the endpoint with a guessed/wrong value)
//   - header ABSENT             -> request is allowed through; logged as a legacy client so we
//     can see residual pre-19 traffic and know when it's safe to go hard
// The DB-side rate caps remain the real backstop in both cases; this header is a tripwire, not a
// vault.
//
// TODO(post-1.0, once all users are confirmed on build 19+): flip to HARD mode — reject a
// missing header too, not just a wrong one. At that point this whole present-but-wrong branch
// collapses into "header !== expected -> 401".
import { json } from "./cors.ts";

export function checkAppSecret(req: Request, fnName: string): Response | null {
  const expected = Deno.env.get("ARCHV_APP_SECRET");
  if (!expected) return null; // secret not configured yet: guard is a no-op

  const provided = req.headers.get("x-archv-app");
  if (!provided) {
    console.log(JSON.stringify({ fn: fnName, legacyClient: true }));
    return null;
  }
  if (provided !== expected) {
    return json({ error: "unauthorized" }, 401);
  }
  return null;
}
