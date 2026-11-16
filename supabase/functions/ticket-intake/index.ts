// ticket-intake entry point. The request handling lives in handler.ts (tested in handler_test.ts);
// this file only wires it to the service-role client.
import { adminClient } from "../_shared/cors.ts";
import { realEnv } from "../_shared/http.ts";
import { handleTicketIntake, type TicketStore } from "./handler.ts";

Deno.serve((req) => {
  const supabase = adminClient();
  const store: TicketStore = {
    async insertTicket(row) {
      const { data, error } = await supabase.from("tickets").insert(row).select("id, status").single();
      return error ? { error: error.message } : { ticket: data as { id: string; status: string } };
    },
    async insertMessage(row) {
      const { error } = await supabase.from("ticket_messages").insert(row);
      return error ? { error: error.message } : {};
    },
  };
  return handleTicketIntake(req, { env: realEnv, store });
});
