// ticket-reply handler: the user adds a message to their own ticket.
// POST { device_id, ticket_id, body } -> { ok }
// Verifies ownership, appends the message, and hands the follow-up to whoever handles that tier:
//
//   * An L1 ticket (resolved, or left at the old l1_working) goes back to 'pending_triage', where
//     triage-drain picks it up within the hour and triages it with the whole conversation. A
//     ticket still waiting for triage ('new', 'pending_triage') is left as it is: when triage runs
//     it reads the thread, this message included.
//   * An L2 or L3 ticket emails the founder, who handles both tiers. A resolved one is reopened
//     first. Each email leaves an internal system note, and no second email goes for the same
//     ticket until FOLLOW_UP_QUIET_MS has passed since that note, so a run of messages is one
//     email, not twenty, while a message hours or days later always reaches the founder. This
//     does not depend on who wrote last: the founder replies outside the thread, so the last
//     public author can stay 'user' for good.
//
// index.ts wires this to the database and the mailer; handler_test.ts tests it.
import { corsHeaders, type Env, json } from "../_shared/http.ts";
import { checkAppSecret } from "../_shared/appGuard.ts";
import { founderMail, type ThreadMessage } from "../_shared/triage.ts";

// Reopening an L2 or L3 ticket: the status that tier's open tickets carry.
const REOPEN_STATUS: Record<string, string> = {
  l2: "l2_working",
  l3: "escalated_l3",
};
const RESOLVED = new Set(["resolved_l1", "resolved_l2", "resolved", "closed"]);

// The internal note body that marks a follow-up email to the founder, and how long after one the
// next follow-up on that ticket stays quiet.
export const FOUNDER_NOTICE = "founder notified of a user follow-up";
export const FOLLOW_UP_QUIET_MS = 6 * 60 * 60 * 1000;

export type ReplyTicket = {
  id: string;
  device_id: string;
  status: string;
  tier: string;
  category?: string | null;
  body?: string | null;
  app_version?: string | null;
};

export type ReplyStore = {
  getTicket(id: string): Promise<{ ticket?: ReplyTicket | null; error?: string }>;
  // The public thread, oldest first, internal notes left out.
  thread(ticketId: string): Promise<ThreadMessage[]>;
  insertMessage(row: { ticket_id: string; author: string; body: string }): Promise<{ error?: string }>;
  setStatus(ticketId: string, status: string): Promise<{ error?: string }>;
  // When the newest FOUNDER_NOTICE note on this ticket was written, in ms since the epoch, or null.
  lastFounderNotice(ticketId: string): Promise<number | null>;
  // Writes an internal system note (never shown to the user).
  addNote(ticketId: string, body: string): Promise<{ error?: string }>;
};

export async function handleTicketReply(
  req: Request,
  deps: {
    env: Env;
    store: ReplyStore;
    mail: (subject: string, content: string) => Promise<boolean>;
    now?: () => number;
  },
): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  // Hard app-secret guard (go-live 2026-07-16): missing or wrong x-archv-app -> 401.
  const guardResp = checkAppSecret(req, "ticket-reply", deps.env);
  if (guardResp) return guardResp;

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  if (!payload || typeof payload !== "object") return json({ error: "invalid json" }, 400);

  const device_id = typeof payload.device_id === "string" ? payload.device_id.trim() : "";
  const ticket_id = typeof payload.ticket_id === "string" ? payload.ticket_id : "";
  const body = typeof payload.body === "string" ? payload.body.trim() : "";
  if (!device_id) return json({ error: "device_id required" }, 400);
  if (device_id.length > 128) return json({ error: "device_id too long" }, 400);
  if (!ticket_id) return json({ error: "ticket_id required" }, 400);
  if (body.length < 1) return json({ error: "body required" }, 400);
  if (body.length > 5000) return json({ error: "body too long" }, 400);

  const { ticket, error: tErr } = await deps.store.getTicket(ticket_id);
  if (tErr) { console.error("ticket-reply: ticket db error", tErr); return json({ error: "server_error" }, 500); }
  if (!ticket || ticket.device_id !== device_id) return json({ error: "not found" }, 404);

  const before = await deps.store.thread(ticket_id);

  const { error: mErr } = await deps.store.insertMessage({ ticket_id, author: "user", body });
  if (mErr) {
    // The DB-side cap (ticket_messages_hourly_cap trigger, 2026-10-06) aborts the insert with this marker.
    if (/ticket_reply_rate_limited/.test(mErr)) {
      return json({ error: "rate limited, please try again later" }, 429);
    }
    console.error("ticket-reply: message db error", mErr);
    return json({ error: "server_error" }, 500);
  }

  const tier = ticket.tier || "l1";
  if (tier === "l1") {
    if (RESOLVED.has(ticket.status) || ticket.status === "l1_working") {
      const { error } = await deps.store.setStatus(ticket_id, "pending_triage");
      if (error) console.error("ticket-reply: requeue failed", error);
    }
    return json({ ok: true }, 200);
  }

  if (RESOLVED.has(ticket.status)) {
    const { error } = await deps.store.setStatus(ticket_id, REOPEN_STATUS[tier] ?? "l2_working");
    if (error) console.error("ticket-reply: reopen failed", error);
  }
  const now = (deps.now ?? Date.now)();
  const last = await deps.store.lastFounderNotice(ticket_id);
  if (last === null || now - last >= FOLLOW_UP_QUIET_MS) {
    const label = `follow-up on an ${tier.toUpperCase()} ticket`;
    const sent = await deps.mail(
      `Ticket follow-up (${tier.toUpperCase()}): ${ticket.category ?? "ticket"}`,
      founderMail(ticket, label, [...before, { author: "user", body }], "", ""),
    );
    if (sent) {
      const { error } = await deps.store.addNote(ticket_id, FOUNDER_NOTICE);
      if (error) console.error("ticket-reply: notice note failed", error);
    } else {
      // No note, so the next follow-up tries the email again.
      console.error(JSON.stringify({ fn: "ticket-reply", ticket: ticket_id, mail: "not sent" }));
    }
  }
  return json({ ok: true }, 200);
}
