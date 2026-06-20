// ticket-intake: the app posts a new support ticket here.
// POST { device_id, body, category?, subject?, email?, app_version? }
// -> { ok, ticket_id, status }
// Creates the ticket and its first user message using the service role, so the app never touches
// the locked-down tables directly.
import { corsHeaders, json, adminClient } from "../_shared/cors.ts";

const CATEGORIES = ["bug", "billing", "content", "account", "other"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const device_id = typeof payload.device_id === "string" ? payload.device_id.trim() : "";
  const body = typeof payload.body === "string" ? payload.body.trim() : "";
  if (!device_id) return json({ error: "device_id required" }, 400);
  if (body.length < 3) return json({ error: "body required" }, 400);
  if (body.length > 5000) return json({ error: "body too long" }, 400);

  const category = CATEGORIES.includes(payload.category as string) ? payload.category : "other";
  const subject = typeof payload.subject === "string" ? payload.subject.slice(0, 200) : null;
  const email = typeof payload.email === "string" ? payload.email.slice(0, 320) : null;
  const app_version = typeof payload.app_version === "string" ? payload.app_version.slice(0, 40) : null;

  const supabase = adminClient();

  const { data: ticket, error } = await supabase
    .from("tickets")
    .insert({ device_id, body, category, subject, email, app_version })
    .select("id, status")
    .single();
  if (error) return json({ error: error.message }, 500);

  // First thread message mirrors the body, so the in-app inbox reads as a conversation from line one.
  await supabase.from("ticket_messages").insert({
    ticket_id: ticket.id,
    author: "user",
    body,
  });

  return json({ ok: true, ticket_id: ticket.id, status: ticket.status }, 201);
});
