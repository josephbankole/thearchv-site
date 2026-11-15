// Shared CORS headers and JSON helper for the app-facing Edge Functions, with no imports at all, so
// handler code and its tests can use them under a bare `deno test` without fetching supabase-js.
// cors.ts re-exports both for the functions that also need the service-role client.

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

// How handlers read their environment. The Deno.serve entry points pass realEnv; tests pass a map.
export type Env = (key: string) => string | undefined;
export const realEnv: Env = (key) => Deno.env.get(key);
