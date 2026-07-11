// Shared L1 triage core. Extracted from support-triage so both support-triage (the Database
// Webhook, one ticket at a time, immediately on insert) and triage-drain (the pg_cron sweep of
// tickets stuck in 'pending_triage') run the exact same logic: same model, same prompt, same
// STATUS_BY_ACTION mapping, same daily ceiling via triage_permit(). This refactor does not change
// support-triage's external behaviour: same inputs, same responses, same side effects.
import { adminClient } from "./cors.ts";
import { FAQ } from "./faq.ts";
import { sendFounderMail } from "./zoho.ts";

const MODEL = "claude-sonnet-4-6";

const STATUS_BY_ACTION: Record<string, { status: string; tier: string }> = {
  resolve: { status: "resolved_l1", tier: "l1" },
  escalate_l2: { status: "l2_working", tier: "l2" },
  escalate_l3: { status: "escalated_l3", tier: "l3" },
};

export type TriageOutcome = { httpStatus: number; body: Record<string, unknown> };

export async function triageTicket(
  supabase: ReturnType<typeof adminClient>,
  ticket: Record<string, unknown>,
): Promise<TriageOutcome> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    await note(supabase, ticket.id as string, "auto-triage skipped: ANTHROPIC_API_KEY not set");
    return { httpStatus: 200, body: { ok: false, reason: "no api key" } };
  }

  // Daily spend ceiling on paid triage calls (default 100/day, TRIAGE_DAILY_LIMIT to override).
  // triage_permit() atomically increments today's counter and reports whether we are under the
  // ceiling. Past the ceiling (or if the counter itself errors) the ticket is NOT dropped: it
  // stays in the queue as 'pending_triage' for later manual or scheduled processing (triage-drain
  // picks it up), and no Claude call is made. Failing closed here protects the wallet, never the
  // data.
  const dailyLimit = Number(Deno.env.get("TRIAGE_DAILY_LIMIT") ?? "100");
  const { data: permitted, error: permitError } = await supabase.rpc("triage_permit", { p_limit: dailyLimit });
  if (permitError || permitted !== true) {
    const why = permitError
      ? `triage counter error: ${String(permitError.message).slice(0, 120)}`
      : `daily triage ceiling (${dailyLimit}) reached`;
    await supabase.from("tickets").update({ status: "pending_triage" }).eq("id", ticket.id);
    await note(supabase, ticket.id as string, `auto-triage deferred: ${why}`);
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
    "",
    "KNOWLEDGE BASE:",
    FAQ,
    "",
    'Respond with ONLY a JSON object, no other text, shaped exactly:',
    '{"action":"resolve"|"escalate_l2"|"escalate_l3","reply_to_user":"...","internal_note":"..."}',
    "reply_to_user is what the user reads (a short answer, or an honest holding line if escalating).",
    "internal_note is one line for the next handler.",
  ].join("\n");

  const userMsg =
    `Ticket category: ${ticket.category ?? "other"}\n` +
    `App version: ${ticket.app_version ?? "unknown"}\n\n` +
    `User message:\n${ticket.body}`;

  let decision: { action?: string; reply_to_user?: string; internal_note?: string };
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system,
        messages: [{ role: "user", content: userMsg }],
      }),
    });
    if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    const text = (data?.content?.[0]?.text ?? "").trim();
    decision = JSON.parse(extractJson(text));
  } catch (e) {
    await note(supabase, ticket.id as string, `auto-triage failed, left for manual handling: ${String(e).slice(0, 180)}`);
    return { httpStatus: 200, body: { ok: false, error: "triage failed" } };
  }

  const next = STATUS_BY_ACTION[decision.action ?? ""] ?? STATUS_BY_ACTION.escalate_l2;
  const reply = (decision.reply_to_user ?? "").toString().trim();
  const internal = (decision.internal_note ?? "").toString().trim();

  if (reply) {
    await supabase.from("ticket_messages").insert({ ticket_id: ticket.id, author: "l1", body: reply });
  }
  if (internal) {
    await supabase.from("ticket_messages").insert({ ticket_id: ticket.id, author: "l1", body: internal, internal: true });
  }
  await supabase.from("tickets").update(next).eq("id", ticket.id);

  // L3 means it needs the founder. Email them, best effort: the ticket is already escalated in the DB.
  if (decision.action === "escalate_l3") {
    await notifyFounder(ticket, internal, reply);
  }

  return { httpStatus: 200, body: { ok: true, action: decision.action, ...next } };
}

// Sends via Zoho Mail (Canadian DC).
async function notifyFounder(ticket: Record<string, unknown>, internalNote: string, userReply: string) {
  await sendFounderMail(
    `L3 escalation: ${ticket.category ?? "ticket"}`,
    `A support ticket has been escalated to you (L3).\n\n` +
      `Category: ${ticket.category ?? "other"}\n` +
      `App version: ${ticket.app_version ?? "unknown"}\n\n` +
      `User said:\n${ticket.body}\n\n` +
      `L1 note: ${internalNote}\n\n` +
      `Holding reply sent to the user:\n${userReply}\n\n` +
      `Ticket id: ${ticket.id}`,
  );
}

// Tolerate code fences or stray text around the JSON the model returns.
function extractJson(text: string): string {
  const m = text.match(/\{[\s\S]*\}/);
  return m ? m[0] : text;
}

async function note(supabase: ReturnType<typeof adminClient>, ticketId: string, body: string) {
  await supabase.from("ticket_messages").insert({ ticket_id: ticketId, author: "system", body, internal: true });
}
