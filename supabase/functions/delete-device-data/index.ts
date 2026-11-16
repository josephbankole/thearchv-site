// delete-device-data entry point. The request handling lives in handler.ts (tested in
// handler_test.ts); this file only wires it to the service-role client.
import { adminClient } from "../_shared/cors.ts";
import { realEnv } from "../_shared/http.ts";
import { type DeleteStore, handleDeleteDeviceData } from "./handler.ts";

Deno.serve((req) => {
  const supabase = adminClient();
  const store: DeleteStore = {
    async logLookup(device_id) {
      const { error } = await supabase.from("ticket_thread_requests").insert({ device_id });
      return error ? { error: error.message } : {};
    },
    async deleteTickets(device_id) {
      const { count, error } = await supabase.from("tickets").delete({ count: "exact" }).eq("device_id", device_id);
      return error ? { error: error.message } : { count: count ?? 0 };
    },
    async deletePushTokens(device_id) {
      const { count, error } = await supabase.from("push_tokens").delete({ count: "exact" }).eq("device_id", device_id);
      return error ? { error: error.message } : { count: count ?? 0 };
    },
  };
  return handleDeleteDeviceData(req, { env: realEnv, store });
});
