// Shared L1 triage core. Extracted from support-triage so both support-triage (the Database
// Webhook, one ticket at a time, immediately on insert) and triage-drain (the pg_cron sweep of
// tickets waiting at 'pending_triage') run the exact same logic: same model, same prompt, same
// STATUS_BY_ACTION mapping, same daily ceiling via triage_permit().
//
// Everything it touches comes in through TriageDeps, so triage_test.ts can run it against fakes.
// triage_db.ts builds the real dependencies from the service-role client.
//
// Who handles what (2026-11-15). There is no L2 agent: nothing reads l2_working on its own. So an
// L2 escalation, a decision whose action is not one the prompt allows, and a ticket triage has
// failed on MAX_ATTEMPTS times all email the founder, the same way L3 always has, and the ticket
// stays l2_working as the record. A failed attempt leaves the ticket at 'pending_triage' for
// triage-drain to retry, and an Anthropic API error gives the day's permit back, so a run of
// failures cannot spend the daily ceiling.
import { FAQ } from "./faq.ts";
import type { Env } from "./http.ts";

const MODEL = "claude-sonnet-4-6";

// After this many failed attempts a ticket stops being retried and goes to the founder.
export const MAX_ATTEMPTS = 3;

// While a triage run is in progress the ticket sits at 'l1_working' (see claim below). A run that
// died part way leaves it there, so a claim older than this is treated as abandoned: triage-drain
// picks it up again and health-probe counts it as waiting. Edge Functions stop long before this.
export const STALE_CLAIM_MS = 30 * 60 * 1000;

const STATUS_BY_ACTION: Record<string, { status: string; tier: string }> = {
  resolve: { status: "resolved_l1", tier: "l1" },
  escalate_l2: { status: "l2_working", tier: "l2" },
  escalate_l3: { status: "escalated_l3", tier: "l3" },
};

export type ThreadMessage = { author: string; body: string };

export type TriageDb = {
  // Moves the ticket to 'l1_working' only if it is waiting for triage ('new', 'pending_triage', or
  // an 'l1_working' claim older than STALE_CLAIM_MS), in one conditional update. claimed is false
  // when another run already has it or it has been handled, so a second webhook or a drain racing
  // the webhook cannot triage the same ticket twice.
  claim(ticketId: string): Promise<{ claimed: boolean; error?: string }>;
  // triage_permit(): counts one paid call against today's ceiling and says whether it is allowed.
  permit(limit: number): Promise<{ permitted: boolean; error?: string }>;
  // triage_permit_release(): gives back the call permit() just counted, when no paid call happened.
  releasePermit(): Promise<void>;
  // The ticket's public messages (internal notes left out), oldest first.
  thread(ticketId: string): Promise<ThreadMessage[]>;
  addMessage(row: { ticket_id: string; author: string; body: string; internal?: boolean }): Promise<void>;
  updateTicket(ticketId: string, patch: Record<string, unknown>): Promise<void>;
  // triage_record_failure(): adds one to the ticket's triage_attempts and returns the new count.
  recordFailure(ticketId: string): Promise<number>;
};

export type TriageDeps = {
  db: TriageDb;
  env: Env;
  fetch: typeof fetch;
  mail: (subject: string, content: string) => Promise<boolean>;
};

export type TriageOutcome = { httpStatus: number; body: Record<string, unknown> };

export async function triageTicket(deps: TriageDeps, ticket: Record<string, unknown>): Promise<TriageOutcome> {
  const { db, env } = deps;
  const ticketId = ticket.id as string;
  const apiKey = env("ANTHROPIC_API_KEY");
  if (!apiKey) {
    await note(db, ticketId, "auto-triage skipped: ANTHROPIC_API_KEY not set");
    return { httpStatus: 200, body: { ok: false, reason: "no api key" } };
  }

  // Only one run triages a ticket. A duplicate webhook on the same insert, or a ticket already
  // answered, is skipped before any permit is counted or any call is paid for.
  const claim = await db.claim(ticketId);
  if (claim.error) {
    console.error("triage: claim failed", claim.error);
    return { httpStatus: 500, body: { ok: false, error: "claim failed" } };
  }
  if (!claim.claimed) {
    return { httpStatus: 200, body: { ok: true, triaged: false, reason: "not_waiting_for_triage" } };
  }

  // Daily spend ceiling on paid triage calls (default 100/day, TRIAGE_DAILY_LIMIT to override).
  // triage_permit() atomically increments today's counter and reports whether we are under the
  // ceiling. Past the ceiling (or if the counter itself errors) the ticket is NOT dropped: it
  // stays in the queue as 'pending_triage' for triage-drain, and no Claude call is made. Failing
  // closed here protects the wallet, never the data.
  const dailyLimit = Number(env("TRIAGE_DAILY_LIMIT") ?? "100");
  const permit = await db.permit(dailyLimit);
  if (permit.error || !permit.permitted) {
    const why = permit.error
      ? `triage counter error: ${String(permit.error).slice(0, 120)}`
      : `daily triage ceiling (${dailyLimit}) reached`;
    await db.updateTicket(ticketId, { status: "pending_triage" });
    await note(db, ticketId, `auto-triage deferred: ${why}`);
    return {
      httpStatus: 200,
      body: { ok: true, triaged: false, reason: "daily_triage_ceiling_reached", status: "pending_triage", detail: why },
    };
  }

  const system = [
    "You are the L1 support agent for The ARCHV iOS app.",
    "Voice: British, warm, brief, plain. No em dashes. No false promises. Two or three short sentences.",
    "Resolve only what the knowledge base covers, with nothing disputed. Otherwise escalate.",
    "Escalate to L2 for: confirmed feed or push failures, reproducible crashes, restore-purchase",
    "failures after the standard steps, factual corrections, accessibility reports.",
    "Escalate to L3 for sensitive matters: rights or likeness complaints, disputed or fraudulent",
    "charges, legal threats, data deletion requests.",
    "When in doubt, escalate. A wrong confident answer costs more than a handover.",
    "If the ticket has a conversation, answer the user's latest message in the light of it. A user",
    "saying an earlier answer did not work is not resolved by repeating it: escalate instead.",
    "",
    "KNOWLEDGE BASE:",
    FAQ,
    "",
    'Respond with ONLY a JSON object, no other text, shaped exactly:',
    '{"action":"resolve"|"escalate_l2"|"escalate_l3","reply_to_user":"...","internal_note":"..."}',
    "reply_to_user is what the user reads (a short answer, or an honest holding line if escalating).",
    "internal_note is one line for the next handler.",
  ].join("\n");

  const thread = await db.thread(ticketId);
  const userMsg = buildUserMessage(ticket, thread);

  let decision: { action?: string; reply_to_user?: string; internal_note?: string };
  let apiError = false;
  try {
    let res: Response;
    try {
      res = await deps.fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: env("TRIAGE_MODEL") || MODEL,
          max_tokens: 1024,
          system,
          messages: [{ role: "user", content: userMsg }],
        }),
      });
    } catch (e) {
      apiError = true;
      throw e;
    }
    if (!res.ok) {
      apiError = true;
      throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const data = await res.json();
    const text = (data?.content?.[0]?.text ?? "").trim();
    decision = JSON.parse(extractJson(text));
    if (!decision || typeof decision !== "object") throw new Error("model reply is not a JSON object");
  } catch (e) {
    return await failed(deps, ticket, apiError, String(e));
  }

  const known = Object.hasOwn(STATUS_BY_ACTION, decision.action ?? "");
  const next = known ? STATUS_BY_ACTION[decision.action as string] : STATUS_BY_ACTION.escalate_l2;
  const reply = (decision.reply_to_user ?? "").toString().trim();
  const internal = (decision.internal_note ?? "").toString().trim();

  if (reply) await db.addMessage({ ticket_id: ticketId, author: "l1", body: reply });
  if (internal) await db.addMessage({ ticket_id: ticketId, author: "l1", body: internal, internal: true });
  await db.updateTicket(ticketId, next);

  // L2 and L3 both reach the founder: there is no L2 agent to pick l2_working up. A decision with
  // an action the prompt does not allow is treated as L2, and the subject says so. Best effort:
  // the ticket is already recorded in the database.
  if (next.tier !== "l1") {
    const label = next.tier === "l3"
      ? "L3 escalation"
      : known
      ? "L2 escalation"
      : "L2 escalation (unreadable triage action)";
    await deps.mail(`${label}: ${ticket.category ?? "ticket"}`, founderMail(ticket, label, thread, internal, reply));
  }

  return { httpStatus: 200, body: { ok: true, action: known ? decision.action : "escalate_l2", ...next } };
}

// A failed attempt. An API error made no paid call, so the permit goes back. Either way the ticket
// waits at 'pending_triage' for triage-drain, until MAX_ATTEMPTS failures send it to the founder.
// This is also what rescues a webhook ticket: it used to stay at 'new', which nothing retries.
async function failed(
  deps: TriageDeps,
  ticket: Record<string, unknown>,
  apiError: boolean,
  detail: string,
): Promise<TriageOutcome> {
  const { db } = deps;
  const ticketId = ticket.id as string;
  if (apiError) await db.releasePermit();
  const attempts = await db.recordFailure(ticketId);
  if (attempts >= MAX_ATTEMPTS) {
    await db.updateTicket(ticketId, { status: "l2_working", tier: "l2" });
    await note(db, ticketId, `auto-triage failed ${attempts} times, handed to the founder: ${detail.slice(0, 160)}`);
    await deps.mail(
      `Triage failed: ${ticket.category ?? "ticket"}`,
      founderMail(ticket, `triage failed ${attempts} times`, await db.thread(ticketId), detail.slice(0, 300), ""),
    );
    return { httpStatus: 200, body: { ok: false, error: "triage failed", attempts, status: "l2_working" } };
  }
  await db.updateTicket(ticketId, { status: "pending_triage" });
  await note(db, ticketId, `auto-triage failed (attempt ${attempts} of ${MAX_ATTEMPTS}), queued for retry: ${detail.slice(0, 160)}`);
  return { httpStatus: 200, body: { ok: false, error: "triage failed", attempts, status: "pending_triage" } };
}

// The ticket, plus everything said on it since it was opened, so a follow-up is triaged with the
// conversation rather than as a fresh question. The first thread message mirrors the ticket body
// (ticket-intake writes it), so it is not repeated.
export function buildUserMessage(ticket: Record<string, unknown>, thread: ThreadMessage[]): string {
  const head = `Ticket category: ${ticket.category ?? "other"}\n` +
    `App version: ${ticket.app_version ?? "unknown"}\n\n` +
    `User message:\n${ticket.body}`;
  const later = thread.length > 0 && thread[0].author === "user" && thread[0].body === ticket.body
    ? thread.slice(1)
    : thread;
  if (later.length === 0) return head;
  const lines = later.map((m) => `[${m.author === "user" ? "user" : "support"}] ${m.body}`);
  return `${head}\n\nConversation since then, oldest first:\n${lines.join("\n")}\n\n` +
    "Answer the user's latest message.";
}

// The email the founder gets for anything L1 cannot close. Shared with ticket-reply's follow-up
// notice so both read the same way.
export function founderMail(
  ticket: Record<string, unknown>,
  label: string,
  thread: ThreadMessage[],
  internalNote: string,
  userReply: string,
): string {
  const conversation = thread.length
    ? `\n\nConversation, oldest first:\n${thread.map((m) => `[${m.author}] ${m.body}`).join("\n")}`
    : "";
  return `A support ticket needs you (${label}).\n\n` +
    `Category: ${ticket.category ?? "other"}\n` +
    `App version: ${ticket.app_version ?? "unknown"}\n\n` +
    `User said:\n${ticket.body}` +
    conversation +
    (internalNote ? `\n\nL1 note: ${internalNote}` : "") +
    (userReply ? `\n\nHolding reply sent to the user:\n${userReply}` : "") +
    `\n\nTicket id: ${ticket.id}`;
}

// Tolerate code fences or stray text around the JSON the model returns.
function extractJson(text: string): string {
  const m = text.match(/\{[\s\S]*\}/);
  return m ? m[0] : text;
}

async function note(db: TriageDb, ticketId: string, body: string) {
  await db.addMessage({ ticket_id: ticketId, author: "system", body, internal: true });
}
