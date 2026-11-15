// Shared CORS headers and JSON helper for the app-facing Edge Functions.
// These endpoints are called by the iOS app with the publishable (anon) key in the apikey header.
// They are deployed with --no-verify-jwt (a no-login app has no user JWT), so the gateway does not
// check that key and anyone can reach the function code. The publishable key and the x-archv-app
// header both ship inside the app, so neither is a lock: the limits that hold are the database
// caps and the function's own checks.

// corsHeaders and json live in http.ts, which imports nothing, so pure handler code can use them
// in tests. Re-exported here so every existing import keeps working.
export { corsHeaders, json } from "./http.ts";

// Service-role client. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically into
// every Edge Function by the platform, so there is no secret to set by hand. The service role
// bypasses RLS, which is exactly why all table access lives here and never in the app.
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}
