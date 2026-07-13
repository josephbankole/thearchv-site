// ticket-thread: the app's in-app inbox reads here.
// POST { device_id, ticket_id? }
//   with ticket_id -> { ticket, messages }  (one thread, public messages only)
//   without        -> { tickets }           (the device's ticket list, newest first)
// Ownership is enforced by matching device_id, since there is no login. Internal notes are never
// returned. device_id is stripped from anything sent back to the app.
import { corsHeaders, json, adminClient } from "../_shared/cors.ts";
import { checkAppSecret } from "../_shared/appGuard.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  // Soft app-secret guard (build 19+ sends x-archv-app). See _shared/appGuard.ts for the
  // soft-vs-hard rollout note; device_id ownership checks below remain the real backstop either way.
  const guardResp = checkAppSecret(req, "ticket-thread");
  if (guardResp) return guardResp;

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const device_id = typeof payload.device_id === "string" ? payload.device_id.trim() : "";
  const ticket_id = typeof payload.ticket_id === "string" ? payload.ticket_id : null;
  if (!device_id) return json({ error: "device_id required" }, 400);

  const supabase = adminClient();

  // Rate limit: device_id alone is enough to list a device's ticket history, so with no cap
  // enumeration is free. Log this lookup attempt first; the DB-side trigger
  // (ticket_thread_requests_cap) caps it at 30/device/hour and fails closed before any real
  // query runs.
  const { error: rateErr } = await supabase.from("ticket_thread_requests").insert({ device_id });
  if (rateErr) {
    if (/ticket_thread_rate_limited/.test(rateErr.message)) {
      return json({ error: "rate limited, please try again later" }, 429);
    }
    return json({ error: rateErr.message }, 500);
  }

  // List mode: every ticket this device opened.
  if (!ticket_id) {
    const { data, error } = await supabase
      .from("tickets")
      .select("id, category, subject, status, created_at, updated_at")
      .eq("device_id", device_id)
      .order("created_at", { ascending: false });
    if (error) return json({ error: error.message }, 500);
    return json({ tickets: data ?? [] }, 200);
  }

  // Thread mode: one ticket, verified to belong to this device.
  const { data: ticket, error: tErr } = await supabase
    .from("tickets")
    .select("id, category, subject, status, created_at, updated_at, device_id")
    .eq("id", ticket_id)
    .maybeSingle();
  if (tErr) return json({ error: tErr.message }, 500);
  if (!ticket || ticket.device_id !== device_id) return json({ error: "not found" }, 404);

  const { data: messages, error: mErr } = await supabase
    .from("ticket_messages")
    .select("author, body, created_at")
    .eq("ticket_id", ticket_id)
    .eq("internal", false)
    .order("created_at", { ascending: true });
  if (mErr) return json({ error: mErr.message }, 500);

  const { device_id: _omit, ...safeTicket } = ticket;
  return json({ ticket: safeTicket, messages: messages ?? [] }, 200);
});
