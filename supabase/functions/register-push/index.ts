// register-push entry point. The request handling lives in handler.ts (tested in handler_test.ts);
// this file only wires it to the service-role client.
import { adminClient } from "../_shared/cors.ts";
import { realEnv } from "../_shared/http.ts";
import { handleRegisterPush, type PushTokenStore } from "./handler.ts";

Deno.serve((req) => {
  const supabase = adminClient();
  const store: PushTokenStore = {
    async exists(token) {
      const { data, error } = await supabase.from("push_tokens").select("id").eq("token", token).maybeSingle();
      return error ? { exists: false, error: error.message } : { exists: Boolean(data) };
    },
    async update(token, row) {
      const { error } = await supabase.from("push_tokens").update(row).eq("token", token);
      return error ? { error: error.message } : {};
    },
    async upsert(row) {
      const { error } = await supabase.from("push_tokens").upsert(row, { onConflict: "token" });
      return error ? { error: error.message } : {};
    },
  };
  return handleRegisterPush(req, { env: realEnv, store });
});
