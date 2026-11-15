// The real dependencies for the triage core (triage.ts), backed by the service-role client.
// Kept apart from triage.ts so the core imports nothing that has to be fetched, and its tests run
// under a bare `deno test`.
import { adminClient } from "./cors.ts";
import { realEnv } from "./http.ts";
import type { ThreadMessage, TriageDb, TriageDeps } from "./triage.ts";
import { sendFounderMail } from "./zoho.ts";

export function triageDb(supabase: ReturnType<typeof adminClient>): TriageDb {
  return {
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
