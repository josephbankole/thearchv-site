// ticket-intake handler: the app posts a new support ticket here.
// POST { device_id, body, category?, subject?, email?, app_version? }
// -> { ok, ticket_id, status }
// Creates the ticket and its first user message using the service role, so the app never touches
// the locked-down tables directly. index.ts wires this to the database; handler_test.ts tests it.
import { corsHeaders, type Env, json } from "../_shared/http.ts";
import { checkAppSecret } from "../_shared/appGuard.ts";

// The categories the contact form offers (app-ui-14, 2026-11-15). The app has no accounts and no
// purchases, so "billing" and "account" were dropped from the form. Builds already in readers'
// hands still send them; those tickets are accepted and filed as "other", never refused. The
// table's own check still allows both, for the rows already stored under them.
const CATEGORIES = ["bug", "content", "other"];

// The same light shape check the app runs before sending (ContactEmail.isAcceptable): one @ with
// something before it, a dot in the domain that is not its first character, no trailing dot, no
// empty label, no whitespace, at most 320 characters. The email is optional, so an address that
// fails it is stored as null and the ticket still goes in; the reader can always read replies in
// the app.
export function normaliseEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim();
  if (!email || email.length > 320 || /\s/.test(email)) return null;
  const parts = email.split("@");
  if (parts.length !== 2 || !parts[0]) return null;
  const domain = parts[1];
  const dot = domain.indexOf(".");
  if (dot <= 0 || domain.endsWith(".") || domain.includes("..")) return null;
  return email;
}

export type TicketStore = {
  insertTicket(row: Record<string, unknown>): Promise<{ ticket?: { id: string; status: string }; error?: string }>;
  insertMessage(row: Record<string, unknown>): Promise<{ error?: string }>;
};

export async function handleTicketIntake(req: Request, deps: { env: Env; store: TicketStore }): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  // Hard app-secret guard (go-live 2026-07-16): missing or wrong x-archv-app -> 401.
  const guardResp = checkAppSecret(req, "ticket-intake", deps.env);
  if (guardResp) return guardResp;

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  if (!payload || typeof payload !== "object") return json({ error: "invalid json" }, 400);

  const device_id = typeof payload.device_id === "string" ? payload.device_id.trim() : "";
  const body = typeof payload.body === "string" ? payload.body.trim() : "";
  if (!device_id) return json({ error: "device_id required" }, 400);
  if (body.length < 3) return json({ error: "body required" }, 400);
  if (body.length > 5000) return json({ error: "body too long" }, 400);

  const category = CATEGORIES.includes(payload.category as string) ? payload.category : "other";
  const subject = typeof payload.subject === "string" ? payload.subject.slice(0, 200) : null;
  const email = normaliseEmail(payload.email);
  const app_version = typeof payload.app_version === "string" ? payload.app_version.slice(0, 40) : null;

  const { ticket, error } = await deps.store.insertTicket({ device_id, body, category, subject, email, app_version });
  if (error || !ticket) {
    // The DB-side hourly cap (tickets_hourly_cap trigger) aborts the insert with this marker.
    // Surface it as a clean 429 rather than a 500 so the app can show "try again later".
    if (error && /ticket_rate_limited/.test(error)) {
      return json({ error: "rate limited, please try again later" }, 429);
    }
    // Log the raw DB detail server-side only; return a generic message so schema internals
    // (column names, types, constraints) are not disclosed to the client (security sweep 2026-07-22).
    console.error("ticket-intake: db error", error ?? "no row returned");
    return json({ error: "server_error" }, 500);
  }

  // First thread message mirrors the body, so the in-app inbox reads as a conversation from line one.
  // The reply cap lets this one through (20261115191800). If it still fails, the ticket stands and is
  // triaged from tickets.body, so the app still gets its 201; the failure is logged, never dropped.
  const { error: messageError } = await deps.store.insertMessage({ ticket_id: ticket.id, author: "user", body });
  if (messageError) console.error(`ticket-intake: first message for ticket ${ticket.id} not stored`, messageError);

  return json({ ok: true, ticket_id: ticket.id, status: ticket.status }, 201);
}
