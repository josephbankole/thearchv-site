// ticket-reply: the user adds a message to their own ticket.
// POST { device_id, ticket_id, body } -> { ok }
// Verifies ownership, appends the message, and reopens a resolved ticket so an agent picks it up
// again at the tier that last handled it.
import { corsHeaders, json, adminClient } from "../_shared/cors.ts";

// Reopening: map the ticket's tier to the "working" status the right agent watches.
const REOPEN_STATUS: Record<string, string> = {
  l1: "l1_working",
  l2: "l2_working",
  l3: "escalated_l3",
};
const RESOLVED = new Set(["resolved_l1", "resolved_l2", "resolved", "closed"]);

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
  const ticket_id = typeof payload.ticket_id === "string" ? payload.ticket_id : "";
  const body = typeof payload.body === "string" ? payload.body.trim() : "";
  if (!device_id) return json({ error: "device_id required" }, 400);
  if (!ticket_id) return json({ error: "ticket_id required" }, 400);
  if (body.length < 1) return json({ error: "body required" }, 400);
  if (body.length > 5000) return json({ error: "body too long" }, 400);

  const supabase = adminClient();

  const { data: ticket, error: tErr } = await supabase
    .from("tickets")
    .select("id, device_id, status, tier")
    .eq("id", ticket_id)
    .maybeSingle();
  if (tErr) return json({ error: tErr.message }, 500);
  if (!ticket || ticket.device_id !== device_id) return json({ error: "not found" }, 404);

  const { error: mErr } = await supabase.from("ticket_messages").insert({
    ticket_id,
    author: "user",
    body,
  });
  if (mErr) return json({ error: mErr.message }, 500);

  // If the ticket had been closed off, reopen it for the tier that last owned it.
  if (RESOLVED.has(ticket.status)) {
    const next = REOPEN_STATUS[ticket.tier] ?? "l1_working";
    await supabase.from("tickets").update({ status: next }).eq("id", ticket_id);
  }

  return json({ ok: true }, 200);
});
