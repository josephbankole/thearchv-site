// ticket-reply entry point. The request handling lives in handler.ts (tested in handler_test.ts);
// this file only wires it to the service-role client and the founder mailer.
import { adminClient } from "../_shared/cors.ts";
import { realEnv } from "../_shared/http.ts";
import { sendFounderMail } from "../_shared/zoho.ts";
import { handleTicketReply, type ReplyStore, type ReplyTicket } from "./handler.ts";

Deno.serve((req) => {
  const supabase = adminClient();
  const store: ReplyStore = {
    async getTicket(id) {
      const { data, error } = await supabase
        .from("tickets")
        .select("id, device_id, status, tier, category, body, app_version")
        .eq("id", id)
        .maybeSingle();
      return error ? { error: error.message } : { ticket: data as ReplyTicket | null };
    },
    async thread(ticketId) {
      const { data, error } = await supabase
        .from("ticket_messages")
        .select("author, body")
        .eq("ticket_id", ticketId)
        .eq("internal", false)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) console.error("ticket-reply: thread read failed", error.message);
      // The newest 50, put back in order: the last entry is the newest message.
      return ((data ?? []) as { author: string; body: string }[]).reverse();
    },
    async insertMessage(row) {
      const { error } = await supabase.from("ticket_messages").insert(row);
      return error ? { error: error.message } : {};
    },
    async setStatus(ticketId, status) {
      const { error } = await supabase.from("tickets").update({ status }).eq("id", ticketId);
      return error ? { error: error.message } : {};
    },
  };
  return handleTicketReply(req, { env: realEnv, store, mail: sendFounderMail });
});
