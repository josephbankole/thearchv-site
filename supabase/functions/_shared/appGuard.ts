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
