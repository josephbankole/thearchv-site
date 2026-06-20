// Shared CORS headers and JSON helper for the app-facing Edge Functions.
// These endpoints are called by the iOS app with the publishable (anon) key in the apikey header.
// The Supabase gateway rejects calls without a valid project key, so the surface is not open to the
// whole internet even though we deploy with --no-verify-jwt (there is no user JWT in a no-login app).

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

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
