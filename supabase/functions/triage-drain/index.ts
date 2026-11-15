// triage-drain: pg_cron sweep (hourly, minute 20) that re-runs L1 triage for tickets waiting at
// status 'pending_triage': queued because support-triage's webhook hit the daily triage_permit
// ceiling, because an earlier attempt failed, or because the user followed up on an L1 ticket
// (ticket-reply), plus any ticket a triage run claimed ('l1_working') and then abandoned for
// STALE_CLAIM_MS. Picks up to 10 tickets, fewest failed attempts first and then oldest, so a
// ticket that keeps failing cannot hold the head of the queue, and re-runs the same shared triage
// core (../_shared/triage.ts) used by support-triage. A ticket that fails MAX_ATTEMPTS times
// leaves the queue for the founder.
// If the ceiling is still hit on a retry, this stops early and leaves the rest queued for the
// next tick rather than burning further permit calls against an already-closed ceiling.
//
// Guarded the same way as daily-push's pg_cron caller: x-triage-secret matched against the
// TRIAGE_SECRET vault secret (see cron.job for the daily-push / push_secret pattern this mirrors).
import { json, adminClient } from "../_shared/cors.ts";
import { triageTicket } from "../_shared/triage.ts";
import { drainQueueFilter, triageDeps } from "../_shared/triage_db.ts";

const BATCH_SIZE = 10;

Deno.serve(async (req) => {
  // Fail CLOSED (security sweep 2026-07-22): an unset TRIAGE_SECRET must refuse, not run open.
  const guard = Deno.env.get("TRIAGE_SECRET");
  if (!guard || req.headers.get("x-triage-secret") !== guard) {
    return json({ error: "unauthorized" }, 401);
  }
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const supabase = adminClient();

  const { data: queued, error } = await supabase
    .from("tickets")
    .select("id, category, subject, body, app_version, status, tier")
    .or(drainQueueFilter())
    .order("triage_attempts", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);
  if (error) { console.error("triage-drain: queue db error", error.message); return json({ error: "server_error" }, 500); }

  const results: Array<{ ticket_id: string; outcome: Record<string, unknown> }> = [];
  let stoppedOnCeiling = false;

  const deps = triageDeps(supabase);
  for (const ticket of queued ?? []) {
    const outcome = await triageTicket(deps, ticket);
    results.push({ ticket_id: ticket.id as string, outcome: outcome.body });
    if (outcome.body?.reason === "daily_triage_ceiling_reached") {
      stoppedOnCeiling = true;
      break; // the ceiling is a global daily counter; further calls this run would only fail too
    }
  }

  // Report how many are still queued, either because the ceiling stopped us early or because
  // there may be more than BATCH_SIZE waiting.
  let stillQueued = 0;
  if (stoppedOnCeiling || (queued?.length ?? 0) === BATCH_SIZE) {
    const { count } = await supabase
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .or(drainQueueFilter());
    stillQueued = count ?? 0;
  }

  return json(
    { ok: true, picked: queued?.length ?? 0, processed: results.length, stoppedOnCeiling, stillQueued, results },
    200,
  );
});
