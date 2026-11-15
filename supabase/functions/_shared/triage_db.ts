// The real dependencies for the triage core (triage.ts), backed by the service-role client.
// Kept apart from triage.ts so the core imports nothing that has to be fetched, and its tests run
// under a bare `deno test`.
import { adminClient } from "./cors.ts";
import { realEnv } from "./http.ts";
import { STALE_CLAIM_MS, type ThreadMessage, type TriageDb, type TriageDeps } from "./triage.ts";
import { sendFounderMail } from "./zoho.ts";

export function triageDb(supabase: ReturnType<typeof adminClient>): TriageDb {
  return {
    async claim(ticketId) {
      const { data, error } = await supabase
        .from("tickets")
        .update({ status: "l1_working" })
        .eq("id", ticketId)
        .or(waitingForTriageFilter())
        .select("id");
      return error ? { claimed: false, error: error.message } : { claimed: (data ?? []).length > 0 };
    },
    async permit(limit) {
      const { data, error } = await supabase.rpc("triage_permit", { p_limit: limit });
      return error ? { permitted: false, error: error.message } : { permitted: data === true };
    },
    async releasePermit() {
      const { error } = await supabase.rpc("triage_permit_release");
      if (error) console.error("triage: permit release failed", error.message);
    },
    async thread(ticketId) {
      const { data, error } = await supabase
        .from("ticket_messages")
        .select("author, body")
        .eq("ticket_id", ticketId)
        .eq("internal", false)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) {
        console.error("triage: thread read failed", error.message);
        return [];
      }
      // The newest 50, put back in order, oldest first.
      return ((data ?? []) as ThreadMessage[]).reverse();
    },
    async addMessage(row) {
      const { error } = await supabase.from("ticket_messages").insert(row);
      if (error) console.error("triage: message insert failed", error.message);
    },
    async updateTicket(ticketId, patch) {
      const { error } = await supabase.from("tickets").update(patch).eq("id", ticketId);
      if (error) console.error("triage: ticket update failed", error.message);
    },
    async recordFailure(ticketId) {
      const { data, error } = await supabase.rpc("triage_record_failure", { p_ticket: ticketId });
      if (error) {
        // Without the count the ticket cannot be told apart from one that keeps failing, so it is
        // treated as spent and goes to the founder rather than looping.
        console.error("triage: failure count not recorded", error.message);
        return Number.MAX_SAFE_INTEGER;
      }
      return Number(data) || 0;
    },
  };
}

export function triageDeps(supabase: ReturnType<typeof adminClient>): TriageDeps {
  return { db: triageDb(supabase), env: realEnv, fetch: (input, init) => fetch(input, init), mail: sendFounderMail };
}

// PostgREST filters. A claim abandoned for STALE_CLAIM_MS counts as waiting again.
export function staleClaimClause(now = Date.now()): string {
  return `and(status.eq.l1_working,updated_at.lt.${new Date(now - STALE_CLAIM_MS).toISOString()})`;
}
// What claim() accepts: any ticket waiting for triage.
export function waitingForTriageFilter(now = Date.now()): string {
  return `status.in.(new,pending_triage),${staleClaimClause(now)}`;
}
// What triage-drain sweeps: the retry queue and abandoned claims. A ticket at 'new' belongs to the
// insert webhook; health-probe reports one left there.
export function drainQueueFilter(now = Date.now()): string {
  return `status.eq.pending_triage,${staleClaimClause(now)}`;
}
