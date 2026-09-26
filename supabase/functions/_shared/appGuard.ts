// Shared guard for the app-facing ticket endpoints (ticket-intake, ticket-thread,
// ticket-reply). Every public build (19+) sends the x-archv-app header.
//
// HARD MODE since go-live 2026-07-16: missing or wrong header -> 401. This stops a
// headerless curl script from burning the global rate caps that legitimate users share.
// The DB-side rate caps remain the backstop; this header is a tripwire, not a vault.
// (Soft mode existed only while pre-19 TestFlight builds were live in the wild.)
import { json } from "./cors.ts";

export function checkAppSecret(req: Request, fnName: string): Response | null {
  const expected = Deno.env.get("ARCHV_APP_SECRET");
  if (!expected) {
    // Fail CLOSED (security sweep 2026-07-22). An unset secret is an operator error, not an
    // open door: previously this returned null (no-op), which silently disabled the guard.
    console.error(JSON.stringify({ fn: fnName, error: "ARCHV_APP_SECRET unset — refusing" }));
    return json({ error: "unauthorized" }, 401);
  }

  const provided = req.headers.get("x-archv-app");
  if (provided !== expected) {
    if (!provided) console.log(JSON.stringify({ fn: fnName, rejected: "missing-header" }));
    return json({ error: "unauthorized" }, 401);
  }
  return null;
}

// Soft variant, register-push only (founder-approved 2026-09-26). No shipped build up to 1.5.5
// sends x-archv-app on register-push (SupportClient attached it to ticket-* paths only), so the
// hard guard refused every token upload from 2026-07-22: no install registered for the daily
// push and in-app opt-out never reached the server. A MISSING header is allowed and logged; a
// WRONG header is still refused; an unset secret still fails closed. The push_tokens rate-cap
// trigger (hourly global and per-device) stays the real guard. 1.5.6 sends the header on every
// path (thearchv-app 8c5ac8b), so this can go hard again once older builds have aged out.
export function checkAppSecretSoft(req: Request, fnName: string): Response | null {
  const expected = Deno.env.get("ARCHV_APP_SECRET");
  if (!expected) {
    console.error(JSON.stringify({ fn: fnName, error: "ARCHV_APP_SECRET unset — refusing" }));
    return json({ error: "unauthorized" }, 401);
  }

  const provided = req.headers.get("x-archv-app");
  if (!provided) {
    console.log(JSON.stringify({ fn: fnName, allowed: "missing-header" }));
    return null;
  }
  if (provided !== expected) return json({ error: "unauthorized" }, 401);
  return null;
}
