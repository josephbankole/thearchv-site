// ticket-thread handler: the app's in-app inbox reads here.
// POST { device_id, ticket_id? }
//   with ticket_id -> { ticket, messages }  (one thread, public messages only)
//   without        -> { tickets }           (the device's ticket list, newest first)
// Ownership is enforced by matching device_id, since there is no login. Internal notes are never
// returned. device_id is stripped from anything sent back to the app.
// index.ts wires this to the database; handler_test.ts tests it.
import { corsHeaders, type Env, json } from "../_shared/http.ts";
import { checkAppSecret } from "../_shared/appGuard.ts";

export type ThreadTicket = {
  id: string;
  category: string | null;
  subject: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  device_id: string;
};
export type ThreadMessage = { author: string; body: string; created_at: string };

export type ThreadStore = {
  // Logs one lookup for the device; the ticket_thread_requests_cap trigger aborts it over the cap.
  logLookup(deviceId: string): Promise<{ error?: string }>;
  listTickets(deviceId: string): Promise<{ tickets?: Omit<ThreadTicket, "device_id">[]; error?: string }>;
  getTicket(ticketId: string): Promise<{ ticket?: ThreadTicket | null; error?: string }>;
  // Public messages only (internal = false), oldest first.
  publicMessages(ticketId: string): Promise<{ messages?: ThreadMessage[]; error?: string }>;
};

export async function handleTicketThread(req: Request, deps: { env: Env; store: ThreadStore }): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  // Hard app-secret guard (go-live 2026-07-16): missing or wrong x-archv-app -> 401.
  const guardResp = checkAppSecret(req, "ticket-thread", deps.env);
  if (guardResp) return guardResp;

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  if (!payload || typeof payload !== "object") return json({ error: "invalid json" }, 400);

  const device_id = typeof payload.device_id === "string" ? payload.device_id.trim() : "";
  const ticket_id = typeof payload.ticket_id === "string" ? payload.ticket_id : null;
  if (!device_id) return json({ error: "device_id required" }, 400);
  // The same limit as ticket-reply and the table's own check (20261115191900). Real devices send 36
  // characters (17 on early builds), so the format itself is not checked.
  if (device_id.length > 128) return json({ error: "device_id too long" }, 400);

  // Rate limit: device_id alone is enough to list a device's ticket history, so with no cap
  // enumeration is free. Log this lookup attempt first; the DB-side trigger
  // (ticket_thread_requests_cap) caps it at 30/device/hour and fails closed before any real
  // query runs.
  const { error: rateErr } = await deps.store.logLookup(device_id);
  if (rateErr) {
    if (/ticket_thread_rate_limited/.test(rateErr)) {
      return json({ error: "rate limited, please try again later" }, 429);
    }
    console.error("ticket-thread: rate-log db error", rateErr);
    return json({ error: "server_error" }, 500);
  }

  // List mode: every ticket this device opened.
  if (!ticket_id) {
    const { tickets, error } = await deps.store.listTickets(device_id);
    if (error) { console.error("ticket-thread: list db error", error); return json({ error: "server_error" }, 500); }
    return json({ tickets: tickets ?? [] }, 200);
  }

  // Thread mode: one ticket, verified to belong to this device.
  const { ticket, error: tErr } = await deps.store.getTicket(ticket_id);
  if (tErr) { console.error("ticket-thread: ticket db error", tErr); return json({ error: "server_error" }, 500); }
  if (!ticket || ticket.device_id !== device_id) return json({ error: "not found" }, 404);

  const { messages, error: mErr } = await deps.store.publicMessages(ticket_id);
  if (mErr) { console.error("ticket-thread: messages db error", mErr); return json({ error: "server_error" }, 500); }

  const { device_id: _omit, ...safeTicket } = ticket;
  return json({ ticket: safeTicket, messages: messages ?? [] }, 200);
}
