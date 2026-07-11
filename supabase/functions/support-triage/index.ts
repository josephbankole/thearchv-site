// support-triage: runs L1 automatically the moment a ticket is inserted.
// Wired to a Supabase Database Webhook on INSERT into public.tickets. Reads the new ticket and
// hands it to the shared triage core (../_shared/triage.ts), which asks Claude (with the FAQ as
// the knowledge base) to resolve or escalate, then writes the reply and updates the ticket. This
// is the automatic version of the archv-support-l1 agent.
//
// The triage-drain function (pg_cron, hourly) reuses the same shared core to sweep up tickets
// that were left 'pending_triage' when the daily ceiling was hit here.
//
// Secrets used: ANTHROPIC_API_KEY (required), TRIAGE_SECRET (optional but recommended: guards this
// paid endpoint so only the webhook can call it).
import { json, adminClient } from "../_shared/cors.ts";
import { triageTicket } from "../_shared/triage.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  // Guard the endpoint: if TRIAGE_SECRET is set, the webhook must send it back.
  const guard = Deno.env.get("TRIAGE_SECRET");
  if (guard && req.headers.get("x-triage-secret") !== guard) {
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
  const result = await triageTicket(supabase, ticket);
  return json(result.body, result.httpStatus);
});
