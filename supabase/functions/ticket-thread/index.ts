// ticket-thread entry point. The request handling lives in handler.ts (tested in handler_test.ts);
// this file only wires it to the service-role client.
import { adminClient } from "../_shared/cors.ts";
import { realEnv } from "../_shared/http.ts";
import { handleTicketThread, type ThreadMessage, type ThreadStore, type ThreadTicket } from "./handler.ts";

Deno.serve((req) => {
  const supabase = adminClient();
  const store: ThreadStore = {
    async logLookup(deviceId) {
      const { error } = await supabase.from("ticket_thread_requests").insert({ device_id: deviceId });
      return error ? { error: error.message } : {};
    },
    async listTickets(deviceId) {
      const { data, error } = await supabase
        .from("tickets")
        .select("id, category, subject, status, created_at, updated_at")
        .eq("device_id", deviceId)
        .order("created_at", { ascending: false });
      return error ? { error: error.message } : { tickets: (data ?? []) as Omit<ThreadTicket, "device_id">[] };
    },
    async getTicket(ticketId) {
      const { data, error } = await supabase
        .from("tickets")
        .select("id, category, subject, status, created_at, updated_at, device_id")
        .eq("id", ticketId)
        .maybeSingle();
      return error ? { error: error.message } : { ticket: data as ThreadTicket | null };
    },
    async publicMessages(ticketId) {
      const { data, error } = await supabase
        .from("ticket_messages")
        .select("author, body, created_at")
        .eq("ticket_id", ticketId)
        .eq("internal", false)
        .order("created_at", { ascending: true });
      return error ? { error: error.message } : { messages: (data ?? []) as ThreadMessage[] };
    },
  };
  return handleTicketThread(req, { env: realEnv, store });
});
