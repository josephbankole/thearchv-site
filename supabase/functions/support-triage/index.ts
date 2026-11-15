// support-triage: runs L1 automatically the moment a ticket is inserted.
// Called by the tickets_triage trigger (AFTER INSERT on public.tickets, migration 20260713221000)
// through pg_net; no Dashboard webhook is needed, and one would only be skipped by the claim. Reads the new ticket and
// hands it to the shared triage core (../_shared/triage.ts), which asks Claude (with the FAQ as
// the knowledge base) to resolve or escalate, then writes the reply and updates the ticket. This
// is the automatic version of the archv-support-l1 agent.
//
// The triage-drain function (pg_cron, hourly) reuses the same shared core to sweep up tickets
// that were left 'pending_triage' when the daily ceiling was hit here, or when an attempt failed.
//
// Secrets used: ANTHROPIC_API_KEY (required), TRIAGE_SECRET (optional but recommended: guards this
// paid endpoint so only the webhook can call it).
import { json, adminClient } from "../_shared/cors.ts";
import { triageTicket } from "../_shared/triage.ts";
import { triageDeps } from "../_shared/triage_db.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  // Guard the endpoint: the webhook must send x-triage-secret back. Fail CLOSED on an unset
  // secret (security sweep 2026-07-22) — this paid endpoint stayed open once already when
  // TRIAGE_SECRET was unset 2026-06-19..07-03; an absent secret now refuses instead of no-ops.
  const guard = Deno.env.get("TRIAGE_SECRET");
  if (!guard || req.headers.get("x-triage-secret") !== guard) {
    return json({ error: "unauthorized" }, 401);
  }

  let payload: { record?: Record<string, unknown> };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  const ticket = payload.record;
  if (!ticket?.id || !ticket?.body) return json({ error: "no ticket record" }, 400);

  const supabase = adminClient();
  const result = await triageTicket(triageDeps(supabase), ticket);
  return json(result.body, result.httpStatus);
});
